import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEBUG_HOST = process.env.CHROME_DEBUG_HOST ?? "127.0.0.1";
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9222);
const BASE_URL = process.env.PIXEL_MINE_URL ?? "http://127.0.0.1:8000/";
const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_URL = pathToFileURL(resolve(PROJECT_DIR, "index.html")).href;
const SCREENSHOT_PATH = process.env.PIXEL_MINE_SCREENSHOT ?? "/tmp/pixel-mine-e2e.png";
const START_SCREENSHOT_PATH = "/tmp/pixel-mine-start.png";
const START_NOTICE_SCREENSHOT_PATH = "/tmp/pixel-mine-start-notice.png";
const START_MOBILE_SCREENSHOT_PATH = "/tmp/pixel-mine-start-mobile.png";
const START_NOTICE_MOBILE_SCREENSHOT_PATH = "/tmp/pixel-mine-start-notice-mobile.png";
const MOBILE_SCREENSHOT_PATH = "/tmp/pixel-mine-mobile.png";
const ACHIEVEMENTS_SCREENSHOT_PATH = "/tmp/pixel-mine-achievements.png";
const SAVE_MENU_SCREENSHOT_PATH = "/tmp/pixel-mine-save-menu.png";
const DEBUG_BASE = `http://${DEBUG_HOST}:${DEBUG_PORT}`;

const passed = [];
const runtimeErrors = [];

class CdpSession {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP WebSocket 연결 시간 초과")), 5_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP WebSocket 연결 실패"));
      }, { once: true });
    });

    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }

      if (message.method === "Runtime.exceptionThrown") {
        const detail = message.params?.exceptionDetails;
        runtimeErrors.push(detail?.exception?.description ?? detail?.text ?? "알 수 없는 런타임 예외");
      }
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result?.value;
  }

  close() {
    this.socket?.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  passed.push(message);
  console.log(`PASS ${String(passed.length).padStart(2, "0")} · ${message}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(session, expression, timeoutMs = 6_000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await session.evaluate(expression)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`조건 대기 시간 초과: ${expression}${lastError ? ` (${lastError.message})` : ""}`);
}

async function navigate(session, url) {
  await session.send("Page.navigate", { url });
  await delay(120);
  await waitFor(session, "document.readyState !== 'loading' && Boolean(document.body)", 8_000);
}

async function reload(session) {
  await session.send("Page.reload", { ignoreCache: true });
  await delay(150);
  await waitFor(
    session,
    "document.readyState !== 'loading' && document.getElementById('protocolStatus')?.classList.contains('is-good') && !document.getElementById('startButton').disabled",
    8_000,
  );
}

async function openStartNotice(session) {
  await session.evaluate("document.getElementById('startButton').click(); true");
  await waitFor(session, "document.getElementById('startStorageDialog').open", 8_000);
}

async function startGame(session) {
  await openStartNotice(session);
  await session.evaluate("document.getElementById('confirmStartButton').click(); true");
}

async function createPage(url = "about:blank") {
  const response = await fetch(`${DEBUG_BASE}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Chrome target 생성 실패: HTTP ${response.status}`);
  const target = await response.json();
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  return session;
}

async function getInitialPage() {
  const response = await fetch(`${DEBUG_BASE}/json/list`);
  if (!response.ok) throw new Error(`Chrome target 목록 조회 실패: HTTP ${response.status}`);
  const targets = await response.json();
  const target = targets.find((item) => item.type === "page");
  if (!target) return createPage();
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  return session;
}

async function run() {
  const page = await getInitialPage();
  let secondPage = null;

  try {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(page, BASE_URL);
    await waitFor(page, "document.getElementById('protocolStatus')?.textContent.includes('HTTP')");
    await page.evaluate("localStorage.clear(); true");
    await reload(page);

    await waitFor(page, "document.querySelector('.start-hero-image')?.complete && document.querySelector('.start-hero-image')?.naturalWidth > 0");
    await page.evaluate("document.querySelector('.start-hero-image').decode().then(() => true)");
    await delay(100);
    const initial = await page.evaluate(`(() => ({
      overlayVisible: !document.getElementById('startOverlay').classList.contains('is-hidden'),
      appHidden: document.getElementById('gameApp').classList.contains('is-hidden'),
      startEnabled: !document.getElementById('startButton').disabled,
      heroImageWidth: document.querySelector('.start-hero-image').naturalWidth,
      overlayButtons: document.querySelectorAll('#startOverlay button').length,
      noticeClosed: !document.getElementById('startStorageDialog').open,
      saveBeforeStart: localStorage.getItem('pixelMine.save')
    }))()`);
    assert(initial.overlayVisible && initial.appHidden && initial.startEnabled, "HTTP 최초 시작 게이트 상태가 올바르지 않습니다.");
    assert(initial.heroImageWidth > 0 && initial.overlayButtons === 1 && initial.noticeClosed, "이미지 시작 화면 또는 단일 시작 버튼 구성이 올바르지 않습니다.");
    assert(initial.saveBeforeStart === null, "시작 버튼 전에 세이브를 만들었습니다.");
    const startScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(START_SCREENSHOT_PATH, Buffer.from(startScreenshot.data, "base64"));
    pass("HTTP 최초 화면은 전용 광산 이미지 위에 활성 게임 시작 버튼 하나만 표시한다");

    await openStartNotice(page);
    const startNotice = await page.evaluate(`(() => ({
      text: document.querySelector('#startStorageDialog .storage-warning').textContent,
      buttons: [...document.querySelectorAll('#startStorageDialog .start-dialog-actions button')].map((button) => button.textContent.trim()),
      appHidden: document.getElementById('gameApp').classList.contains('is-hidden'),
      saveBeforeConfirm: localStorage.getItem('pixelMine.save'),
      expanded: document.getElementById('startButton').getAttribute('aria-expanded')
    }))()`);
    assert(
      startNotice.text.includes("현재 브라우저의 로컬 저장소") && startNotice.text.includes("정기적으로"),
      "로컬 저장과 정기 백업 안내가 시작 팝업에 없습니다.",
    );
    assert(
      JSON.stringify(startNotice.buttons) === JSON.stringify(["게임 시작", "세이브 불러오기"]),
      `시작 팝업 버튼 구성이 올바르지 않습니다: ${JSON.stringify(startNotice.buttons)}`,
    );
    assert(startNotice.appHidden && startNotice.saveBeforeConfirm === null && startNotice.expanded === "true", "안내 팝업 확인 전에 게임 또는 저장이 시작되었습니다.");
    const startNoticeScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(START_NOTICE_SCREENSHOT_PATH, Buffer.from(startNoticeScreenshot.data, "base64"));
    pass("게임 시작 클릭 후 로컬 저장·정기 백업 안내와 두 개의 선택 버튼을 표시한다");

    await page.evaluate("document.getElementById('confirmStartButton').click(); true");
    await waitFor(page, "!document.getElementById('gameApp').classList.contains('is-hidden') && Boolean(localStorage.getItem('pixelMine.save'))");
    await waitFor(page, `
      !document.getElementById('persistenceStatus').textContent.includes('확인 중') &&
      !document.getElementById('storageUsage').textContent.includes('확인 중') &&
      !document.getElementById('saveSize').textContent.includes('확인 중')
    `);
    const started = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return {
        version: save.version,
        label: save.meta.label,
        upgrades: document.querySelectorAll('.upgrade-card').length,
        achievements: document.querySelectorAll('.achievement-card').length,
        storageStatus: document.getElementById('localStorageStatus').textContent,
        persistenceStatus: document.getElementById('persistenceStatus').textContent,
        storageUsage: document.getElementById('storageUsage').textContent,
        saveSize: document.getElementById('saveSize').textContent
      };
    })()`);
    assert(started.version === 1 && started.label === "픽셀 광산", "v1 로컬 세이브가 생성되지 않았습니다.");
    assert(started.upgrades === 6 && started.achievements === 8, "업그레이드 또는 업적 개수가 다릅니다.");
    assert(started.storageStatus.includes("사용 가능"), "HTTP localStorage가 사용 가능 상태가 아닙니다.");
    pass("게임 시작 후 v1 세이브, 업그레이드 6종, 업적 8종을 초기화한다");
    assert(started.persistenceStatus.includes("승인") || started.persistenceStatus.includes("삭제 가능"), "저장 보호 결과가 표시되지 않았습니다.");
    assert(started.storageUsage.includes("Origin") && started.saveSize.includes("UTF-8 JSON"), "Origin 사용량과 세이브 크기가 구분되지 않았습니다.");
    pass("저장 보호 결과, Origin 예상 사용량, 세이브 UTF-8 크기를 구분해 표시한다");

    const featureNavigation = await page.evaluate(`(() => {
      const gameApp = document.getElementById('gameApp');
      const achievementList = document.getElementById('achievementList');
      const saveActions = document.querySelector('.save-actions');
      const achievementButton = document.getElementById('achievementsMenuButton');
      const saveButton = document.getElementById('saveMenuButton');
      return {
        achievementOutsideGame: !gameApp.contains(achievementList),
        saveOutsideGame: !gameApp.contains(saveActions),
        menuButtons: document.querySelectorAll('.utility-menu-button').length,
        achievementControls: achievementButton.getAttribute('aria-controls'),
        saveControls: saveButton.getAttribute('aria-controls'),
        dialogsClosed: !document.getElementById('achievementsDialog').open && !document.getElementById('saveManagementDialog').open
      };
    })()`);
    assert(
      featureNavigation.achievementOutsideGame && featureNavigation.saveOutsideGame && featureNavigation.dialogsClosed,
      `업적 또는 저장 기능이 게임 본문에서 분리되지 않았습니다: ${JSON.stringify(featureNavigation)}`,
    );
    assert(
      featureNavigation.menuButtons === 2 &&
      featureNavigation.achievementControls === "achievementsDialog" &&
      featureNavigation.saveControls === "saveManagementDialog",
      "상단 아이콘 메뉴와 다이얼로그 연결이 올바르지 않습니다.",
    );
    pass("업적과 저장 기능을 게임 본문에서 분리하고 상단 아이콘 메뉴 두 개에 연결한다");

    await page.evaluate("document.getElementById('achievementsMenuButton').click(); true");
    await waitFor(page, "document.getElementById('achievementsDialog').open");
    const achievementMenu = await page.evaluate(`(() => ({
      expanded: document.getElementById('achievementsMenuButton').getAttribute('aria-expanded'),
      badge: document.getElementById('achievementMenuBadge').textContent,
      count: document.getElementById('achievementCount').textContent,
      cards: document.querySelectorAll('#achievementsDialog .achievement-card').length
    }))()`);
    assert(
      achievementMenu.expanded === "true" && achievementMenu.badge === "0" && achievementMenu.count === "0 / 8" && achievementMenu.cards === 8,
      `업적 팝업 내용이 올바르지 않습니다: ${JSON.stringify(achievementMenu)}`,
    );
    const achievementScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(ACHIEVEMENTS_SCREENSHOT_PATH, Buffer.from(achievementScreenshot.data, "base64"));
    await page.evaluate("document.querySelector('[data-close-dialog=\"achievementsDialog\"]').click(); true");
    await waitFor(page, "!document.getElementById('achievementsDialog').open && document.getElementById('achievementsMenuButton').getAttribute('aria-expanded') === 'false'");
    pass("업적 아이콘으로 업적 팝업을 열고 닫으며 해금 현황을 표시한다");

    await page.evaluate("document.getElementById('saveMenuButton').click(); true");
    await waitFor(page, "document.getElementById('saveManagementDialog').open");
    const saveMenu = await page.evaluate(`(() => {
      const dialog = document.getElementById('saveManagementDialog');
      return {
        expanded: document.getElementById('saveMenuButton').getAttribute('aria-expanded'),
        hasExport: dialog.contains(document.getElementById('exportButton')),
        hasImport: dialog.contains(document.getElementById('importOpenButton')),
        hasReset: dialog.contains(document.getElementById('resetOpenButton')),
        hasStorageDetails: dialog.contains(document.querySelector('.storage-details'))
      };
    })()`);
    assert(
      saveMenu.expanded === "true" && saveMenu.hasExport && saveMenu.hasImport && saveMenu.hasReset && saveMenu.hasStorageDetails,
      `저장 팝업 내용이 올바르지 않습니다: ${JSON.stringify(saveMenu)}`,
    );
    const saveMenuScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(SAVE_MENU_SCREENSHOT_PATH, Buffer.from(saveMenuScreenshot.data, "base64"));
    await page.evaluate("document.querySelector('[data-close-dialog=\"saveManagementDialog\"]').click(); true");
    await waitFor(page, "!document.getElementById('saveManagementDialog').open && document.getElementById('saveMenuButton').getAttribute('aria-expanded') === 'false'");
    pass("저장 아이콘으로 저장 상태·백업·복원·초기화 기능 팝업을 열고 닫는다");

    await page.evaluate(`(() => {
      const mine = document.getElementById('mineButton');
      for (let index = 0; index < 10; index += 1) mine.click();
      document.querySelector('.upgrade-buy').click();
      for (let index = 0; index < 3; index += 1) mine.click();
      document.getElementById('manualSaveButton').click();
      return true;
    })()`);
    await delay(100);
    const progressed = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return {
        clicks: save.data.totalClicks,
        level: save.data.upgrades.worn_pickaxe,
        currency: save.data.currency,
        firstAchievement: save.data.unlockedAchievements.first_click,
        clickPower: document.getElementById('perClickValue').textContent,
        achievementBadge: document.getElementById('achievementMenuBadge').textContent,
        achievementMenuLabel: document.getElementById('achievementsMenuButton').getAttribute('aria-label')
      };
    })()`);
    assert(progressed.clicks === 13 && progressed.level === 1, "클릭 또는 업그레이드 진행도가 올바르지 않습니다.");
    assert(progressed.currency === 6 && progressed.firstAchievement > 0, "재화 또는 첫 업적 계산이 올바르지 않습니다.");
    assert(progressed.clickPower === "2", "클릭 업그레이드 효과가 화면에 반영되지 않았습니다.");
    assert(progressed.achievementBadge === "1" && progressed.achievementMenuLabel.includes("1개 해금"), "업적 해금 수가 상단 메뉴에 반영되지 않았습니다.");
    pass("클릭, 구매, 업적 해금, 수동 저장이 일관된 상태를 만든다");

    await page.evaluate("document.getElementById('saveMenuButton').click(); true");
    await waitFor(page, "document.getElementById('saveManagementDialog').open");
    await page.evaluate("document.getElementById('exportButton').click(); true");
    await waitFor(page, "document.getElementById('saveManagementDialog').open && document.getElementById('exportDialog').open && document.getElementById('exportCode').value.startsWith('PIXELMINE-V1:')");
    const saveCode = await page.evaluate("document.getElementById('exportCode').value");
    const decoded = JSON.parse(Buffer.from(saveCode.slice("PIXELMINE-V1:".length), "base64").toString("utf8"));
    assert(decoded.version === 1 && decoded.meta.label === "픽셀 광산", "UTF-8 세이브 코드가 한글 메타데이터를 보존하지 못했습니다.");
    pass("UTF-8 JSON 세이브 코드를 Base64로 내보내고 한글을 보존한다");

    await page.evaluate(`(() => {
      document.getElementById('exportDialog').close();
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = 'PIXELMINE-V2:QUFBQQ==';
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(page, "document.getElementById('importStatus').textContent.includes('새로운')");
    const futureRejected = await page.evaluate(`(() => ({
      error: document.getElementById('importStatus').textContent,
      currency: JSON.parse(localStorage.getItem('pixelMine.save')).data.currency
    }))()`);
    assert(futureRejected.currency === 6, "미래 버전 거부 과정에서 현재 저장을 변경했습니다.");
    await page.evaluate("document.getElementById('importDialog').close(); true");
    pass("미래 버전 세이브 코드를 현재 진행도 변경 없이 거부한다");

    await page.evaluate(`(() => {
      document.getElementById('mineButton').click();
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = ${JSON.stringify(saveCode)};
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(page, "!document.getElementById('importDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).data.currency === 6");
    const validImport = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return { currency: save.data.currency, clicks: save.data.totalClicks, level: save.data.upgrades.worn_pickaxe };
    })()`);
    assert(validImport.currency === 6 && validImport.clicks === 13 && validImport.level === 1, "유효 세이브 코드가 원래 진행도를 복원하지 못했습니다.");
    pass("유효한 UTF-8 세이브 코드를 검증한 뒤 현재 진행도에 복원한다");

    const legacyPayload = {
      version: 0,
      data: {
        coins: 42,
        totalClicks: 7,
        upgrades: { worn_pickaxe: 2 },
        lastProcessedAt: Date.now(),
      },
    };
    const legacyCode = `PIXELMINE-V0:${Buffer.from(JSON.stringify(legacyPayload), "utf8").toString("base64")}`;
    await page.evaluate(`(() => {
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = ${JSON.stringify(legacyCode)};
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(page, "!document.getElementById('importDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).version === 1");
    const migratedLegacy = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return { version: save.version, currency: save.data.currency, clicks: save.data.totalClicks, level: save.data.upgrades.worn_pickaxe };
    })()`);
    assert(
      migratedLegacy.version === 1 && migratedLegacy.currency === 42 && migratedLegacy.clicks === 7 && migratedLegacy.level === 2,
      `v0 저장 마이그레이션 결과가 올바르지 않습니다: ${JSON.stringify(migratedLegacy)}`,
    );
    pass("v0 레거시 저장을 정의된 마이그레이션을 통해 v1 스키마로 복원한다");

    await page.evaluate(`(() => {
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = ${JSON.stringify(saveCode)};
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(page, "!document.getElementById('importDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).data.currency === 6");

    await reload(page);
    const beforeResume = await page.evaluate(`(() => ({
      overlay: !document.getElementById('startOverlay').classList.contains('is-hidden'),
      displayedCurrency: document.getElementById('currencyValue').textContent,
      savedCurrency: JSON.parse(localStorage.getItem('pixelMine.save')).data.currency
    }))()`);
    assert(beforeResume.overlay && beforeResume.displayedCurrency === "0" && beforeResume.savedCurrency === 6, "새로고침 시 시작 버튼 전에 세이브를 화면에 적용했습니다.");
    await startGame(page);
    await waitFor(page, "!document.getElementById('gameApp').classList.contains('is-hidden')");
    const resumed = await page.evaluate(`(() => ({
      level: JSON.parse(localStorage.getItem('pixelMine.save')).data.upgrades.worn_pickaxe,
      clicks: JSON.parse(localStorage.getItem('pixelMine.save')).data.totalClicks,
      shown: document.getElementById('currencyValue').textContent
    }))()`);
    assert(resumed.level === 1 && resumed.clicks === 13 && resumed.shown === "6", "새로고침 복원 결과가 일치하지 않습니다.");
    pass("새로고침 후에도 시작 버튼을 거쳐 기존 진행도를 복원한다");

    await reload(page);
    await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      save.data.currency = 0;
      save.data.stats.offlineEarned = 0;
      save.data.upgrades.miner = 2;
      save.data.lastProcessedAt = Date.now() - (48 * 60 * 60 * 1000);
      save.data.lastSavedAt = save.data.lastProcessedAt;
      localStorage.setItem('pixelMine.save', JSON.stringify(save));
      return true;
    })()`);
    await startGame(page);
    await waitFor(page, "document.getElementById('offlineDialog').open");
    const offline = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return {
        currency: save.data.currency,
        offlineEarned: save.data.stats.offlineEarned,
        duration: document.getElementById('offlineDuration').textContent
      };
    })()`);
    assert(offline.currency >= 86_400 && offline.currency < 86_405, `24시간 상한 수익이 잘못되었습니다: ${offline.currency}`);
    assert(offline.offlineEarned >= 86_400 && offline.offlineEarned < 86_405, "오프라인 누적 통계가 잘못되었습니다.");
    assert(offline.duration.includes("1일"), "24시간 상한이 모달에 표시되지 않았습니다.");
    await page.evaluate("document.getElementById('offlineDialog').close(); true");
    pass("48시간 공백에도 자동 생산 수익을 24시간으로 제한한다");

    await reload(page);
    await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      save.data.currency = 0;
      save.data.stats.offlineEarned = 0;
      save.data.lastProcessedAt = Date.now() + (24 * 60 * 60 * 1000);
      localStorage.setItem('pixelMine.save', JSON.stringify(save));
      return true;
    })()`);
    await startGame(page);
    await waitFor(page, "!document.getElementById('gameApp').classList.contains('is-hidden')");
    const reversedClock = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return { offlineEarned: save.data.stats.offlineEarned, dialogOpen: document.getElementById('offlineDialog').open };
    })()`);
    assert(reversedClock.offlineEarned === 0 && !reversedClock.dialogOpen, "과거 방향 시간 차이에 오프라인 수익을 지급했습니다.");
    pass("시스템 시각이 저장 시각보다 과거이면 오프라인 수익을 0으로 처리한다");

    await page.evaluate(`(() => {
      localStorage.setItem('unrelated.key', 'keep');
      document.getElementById('resetOpenButton').click();
      const checkbox = document.getElementById('resetConfirm');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('confirmResetButton').click();
      return true;
    })()`);
    const resetResult = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return {
        unrelated: localStorage.getItem('unrelated.key'),
        currency: save.data.currency,
        levels: Object.values(save.data.upgrades)
      };
    })()`);
    assert(resetResult.unrelated === "keep", "초기화가 게임 외 localStorage 키를 삭제했습니다.");
    assert(resetResult.currency === 0 && resetResult.levels.every((level) => level === 0), "초기화 후 새 게임 상태가 아닙니다.");
    pass("확인 절차를 거친 초기화가 게임 상태만 재설정하고 다른 키를 보존한다");

    await reload(page);
    await page.evaluate(`(() => {
      localStorage.setItem('pixelMine.save', '{broken');
      return true;
    })()`);
    await startGame(page);
    await waitFor(page, "!document.getElementById('gameApp').classList.contains('is-hidden') && Boolean(localStorage.getItem('pixelMine.corruptSave'))");
    const corrupt = await page.evaluate(`(() => ({
      quarantined: JSON.parse(localStorage.getItem('pixelMine.corruptSave')).raw,
      currentVersion: JSON.parse(localStorage.getItem('pixelMine.save')).version,
      currentCurrency: JSON.parse(localStorage.getItem('pixelMine.save')).data.currency
    }))()`);
    assert(corrupt.quarantined === "{broken" && corrupt.currentVersion === 1 && corrupt.currentCurrency === 0, "손상 저장 격리 또는 새 게임 폴백에 실패했습니다.");
    pass("손상 JSON 원문을 별도 키에 격리하고 유효한 새 게임으로 폴백한다");

    await reload(page);
    await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      save.data.currency = 12_345;
      save.data.totalCurrencyEarned = 50_000;
      save.data.totalClicks = 321;
      save.data.upgrades = {
        worn_pickaxe: 5,
        steel_pickaxe: 2,
        miner: 6,
        mine_cart: 3,
        auto_drill: 1,
        crystal_core: 0
      };
      save.data.lastProcessedAt = Date.now();
      localStorage.setItem('pixelMine.save', JSON.stringify(save));
      return true;
    })()`);
    await startGame(page);
    await waitFor(page, "!document.getElementById('gameApp').classList.contains('is-hidden')");
    const desktopLayout = await page.evaluate(`(() => ({
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      offlineDialogOpen: document.getElementById('offlineDialog').open
    }))()`);
    assert(desktopLayout.noHorizontalOverflow, "데스크톱 화면에 가로 오버플로가 있습니다.");
    assert(!desktopLayout.offlineDialogOpen, "5초 미만의 빠른 재진입에 오프라인 모달을 표시했습니다.");
    const screenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
    pass(`데스크톱 레이아웃을 렌더링하고 스크린샷을 생성한다 (${SCREENSHOT_PATH})`);

    secondPage = await createPage(BASE_URL);
    await waitFor(secondPage, "document.getElementById('startButton') && !document.getElementById('startButton').disabled");
    await openStartNotice(secondPage);
    await secondPage.evaluate("document.getElementById('confirmStartButton').click(); true");
    await waitFor(secondPage, "document.getElementById('startDialogStatus').textContent.includes('다른 탭')");
    const tabBlocked = await secondPage.evaluate(`(() => ({
      overlay: !document.getElementById('startOverlay').classList.contains('is-hidden'),
      appHidden: document.getElementById('gameApp').classList.contains('is-hidden'),
      noticeOpen: document.getElementById('startStorageDialog').open
    }))()`);
    assert(tabBlocked.overlay && tabBlocked.appHidden && tabBlocked.noticeOpen, "두 번째 탭의 활성 플레이를 차단하지 못했습니다.");
    pass("같은 origin의 두 번째 탭에서 활성 플레이와 저장 충돌을 차단한다");

    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await delay(100);
    await page.evaluate("document.getElementById('saveMenuButton').click(); true");
    await waitFor(page, "document.getElementById('saveManagementDialog').open");
    const mobileLayout = await page.evaluate(`(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      mineWidth: document.getElementById('mineButton').getBoundingClientRect().width,
      resetButtons: getComputedStyle(document.querySelector('.save-actions')).gridTemplateColumns,
      menuRight: document.querySelector('.utility-menu').getBoundingClientRect().right,
      dialogWidth: document.getElementById('saveManagementDialog').getBoundingClientRect().width
    }))()`);
    assert(mobileLayout.scrollWidth <= mobileLayout.viewport, `모바일 화면에 가로 오버플로가 있습니다: ${JSON.stringify(mobileLayout)}`);
    assert(mobileLayout.mineWidth < mobileLayout.viewport, "모바일 광맥 버튼이 뷰포트를 벗어났습니다.");
    assert(mobileLayout.menuRight <= mobileLayout.viewport && mobileLayout.dialogWidth <= mobileLayout.viewport, "모바일 아이콘 메뉴 또는 기능 팝업이 뷰포트를 벗어났습니다.");
    await page.evaluate("document.getElementById('saveManagementDialog').close(); true");
    await page.evaluate("window.scrollTo(0, 0); true");
    await delay(3_800);
    const mobileScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(MOBILE_SCREENSHOT_PATH, Buffer.from(mobileScreenshot.data, "base64"));
    pass("375px 모바일 뷰포트에서 가로 오버플로 없이 반응형 레이아웃을 유지한다");

    await navigate(secondPage, FILE_URL);
    await waitFor(secondPage, "document.getElementById('protocolStatus')?.textContent.includes('실행 불가')", 8_000);
    const fileGate = await secondPage.evaluate(`(() => ({
      disabled: document.getElementById('startButton').disabled,
      guide: document.getElementById('startStatus').textContent
    }))()`);
    assert(fileGate.disabled && fileGate.guide.includes("python3 -m http.server 8000"), "file:// 실행 차단 또는 HTTP 안내가 없습니다.");
    pass("file:// 접근을 차단하고 로컬 HTTP 서버 실행 방법을 안내한다");

    await secondPage.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await navigate(secondPage, "http://localhost:8000/");
    await waitFor(secondPage, "document.getElementById('protocolStatus')?.classList.contains('is-good') && !document.getElementById('startButton').disabled", 8_000);
    await secondPage.evaluate("localStorage.clear(); true");
    await reload(secondPage);
    await waitFor(secondPage, "document.querySelector('.start-hero-image')?.complete && document.querySelector('.start-hero-image')?.naturalWidth > 0");
    const mobileStartLayout = await secondPage.evaluate(`(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heroWidth: document.querySelector('.start-hero').getBoundingClientRect().width,
      buttons: document.querySelectorAll('#startOverlay button').length
    }))()`);
    assert(
      mobileStartLayout.scrollWidth <= mobileStartLayout.viewport && mobileStartLayout.heroWidth <= mobileStartLayout.viewport && mobileStartLayout.buttons === 1,
      `모바일 시작 화면 구성이 올바르지 않습니다: ${JSON.stringify(mobileStartLayout)}`,
    );
    const mobileStartScreenshot = await secondPage.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(START_MOBILE_SCREENSHOT_PATH, Buffer.from(mobileStartScreenshot.data, "base64"));
    pass("375px 모바일에서도 이미지 시작 화면과 단일 시작 버튼이 가로 오버플로 없이 표시된다");

    await openStartNotice(secondPage);
    const mobileStartNoticeLayout = await secondPage.evaluate(`(() => {
      const dialog = document.getElementById('startStorageDialog');
      const buttons = [...dialog.querySelectorAll('.start-dialog-actions button')];
      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        dialogWidth: dialog.getBoundingClientRect().width,
        buttons: buttons.length,
        stacked: buttons.length === 2 && Math.abs(buttons[0].getBoundingClientRect().left - buttons[1].getBoundingClientRect().left) < 2
      };
    })()`);
    assert(
      mobileStartNoticeLayout.scrollWidth <= mobileStartNoticeLayout.viewport &&
        mobileStartNoticeLayout.dialogWidth <= mobileStartNoticeLayout.viewport &&
        mobileStartNoticeLayout.buttons === 2 &&
        mobileStartNoticeLayout.stacked,
      `모바일 시작 안내 팝업 구성이 올바르지 않습니다: ${JSON.stringify(mobileStartNoticeLayout)}`,
    );
    const mobileStartNoticeScreenshot = await secondPage.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(START_NOTICE_MOBILE_SCREENSHOT_PATH, Buffer.from(mobileStartNoticeScreenshot.data, "base64"));
    pass("375px 모바일 시작 안내 팝업은 두 선택 버튼을 한 열로 표시한다");

    await secondPage.evaluate(`(() => {
      document.getElementById('startImportButton').click();
      document.getElementById('importCode').value = ${JSON.stringify(saveCode)};
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(secondPage, "!document.getElementById('importDialog').open && document.getElementById('startDialogStatus').textContent.includes('검증이 완료')");
    const stagedStartImport = await secondPage.evaluate(`(() => ({
      localSave: localStorage.getItem('pixelMine.save'),
      appHidden: document.getElementById('gameApp').classList.contains('is-hidden'),
      noticeOpen: document.getElementById('startStorageDialog').open,
      confirmLabel: document.getElementById('confirmStartButton').textContent.trim()
    }))()`);
    assert(
      stagedStartImport.localSave === null && stagedStartImport.appHidden && stagedStartImport.noticeOpen && stagedStartImport.confirmLabel.includes("불러온 세이브"),
      `시작 전 세이브 검증이 로컬 저장을 변경했거나 대기 상태가 잘못되었습니다: ${JSON.stringify(stagedStartImport)}`,
    );
    pass("시작 전 세이브 불러오기는 검증 결과만 대기시키고 기존 로컬 세이브를 변경하지 않는다");

    await secondPage.evaluate("document.getElementById('confirmStartButton').click(); true");
    await waitFor(secondPage, "!document.getElementById('gameApp').classList.contains('is-hidden') && Boolean(localStorage.getItem('pixelMine.save'))");
    const startedFromImport = await secondPage.evaluate(`(() => ({
      shown: document.getElementById('currencyValue').textContent,
      saved: JSON.parse(localStorage.getItem('pixelMine.save')).data.currency
    }))()`);
    assert(startedFromImport.shown === "6" && startedFromImport.saved === 6, `시작 전 세이브를 게임 시작 시 적용하지 못했습니다: ${JSON.stringify(startedFromImport)}`);
    pass("다중 탭 확인을 통과한 게임 시작 시 대기 중인 세이브를 적용하고 저장한다");

    await navigate(secondPage, BASE_URL);
    await waitFor(secondPage, "document.getElementById('protocolStatus')?.classList.contains('is-good') && !document.getElementById('startButton').disabled", 8_000);
    await secondPage.evaluate(`(() => {
      Storage.prototype.setItem = function blockedSetItem() {
        throw new DOMException('Storage blocked for test', 'SecurityError');
      };
      return true;
    })()`);
    await startGame(secondPage);
    await waitFor(secondPage, "!document.getElementById('gameApp').classList.contains('is-hidden')");
    const memoryFallback = await secondPage.evaluate(`(() => ({
      storage: document.getElementById('localStorageStatus').textContent,
      warning: document.getElementById('sessionWarning').textContent,
      warningVisible: !document.getElementById('sessionWarning').classList.contains('is-hidden')
    }))()`);
    assert(
      memoryFallback.storage.includes("메모리 모드") && memoryFallback.warningVisible && memoryFallback.warning.includes("메모리"),
      `저장소 차단 fallback이 올바르지 않습니다: ${JSON.stringify(memoryFallback)}`,
    );
    pass("localStorage 쓰기가 차단되어도 메모리 모드 경고와 함께 게임을 계속 실행한다");

    assert(runtimeErrors.length === 0, `브라우저 런타임 예외 발생: ${runtimeErrors.join(" | ")}`);
    pass("검증 시나리오 전체에서 처리되지 않은 JavaScript 예외가 없다");

    console.log(`\nRESULT ${passed.length} checks passed`);
  } finally {
    secondPage?.close();
    page.close();
  }
}

run().catch((error) => {
  console.error(`FAIL · ${error.stack ?? error.message}`);
  if (runtimeErrors.length > 0) console.error(`RUNTIME ERRORS · ${runtimeErrors.join(" | ")}`);
  process.exitCode = 1;
});
