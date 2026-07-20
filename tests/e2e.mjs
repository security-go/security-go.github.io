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
const MOBILE_SHOP_SCREENSHOT_PATH = "/tmp/pixel-mine-shop-mobile.png";
const MINERAL_CATALOG_SCREENSHOT_PATH = "/tmp/pixel-mine-minerals.png";
const ACHIEVEMENTS_SCREENSHOT_PATH = "/tmp/pixel-mine-achievements.png";
const SAVE_MENU_SCREENSHOT_PATH = "/tmp/pixel-mine-save-menu.png";
const TOAST_SCREENSHOT_PATH = "/tmp/pixel-mine-toast-mobile.png";
const CHARACTER_DEMO_SCREENSHOT_PATH = "/tmp/pixel-mine-character-demo.png";
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
    await page.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
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

    const musicAsset = await page.evaluate(`(async () => {
      const audio = document.getElementById('backgroundMusic');
      const response = await fetch(audio.getAttribute('src'), { method: 'HEAD' });
      return {
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        source: audio.getAttribute('src'),
        loop: audio.loop,
        autoplay: audio.autoplay,
        preload: audio.preload,
        volume: audio.volume
      };
    })()`);
    assert(
      musicAsset.ok &&
        musicAsset.contentType?.includes("audio") &&
        musicAsset.source === "assets/Below_the_Bedrock.mp3" &&
        musicAsset.loop &&
        !musicAsset.autoplay &&
        musicAsset.preload === "metadata" &&
        Math.abs(musicAsset.volume - 0.22) < 0.001,
      `배경음악 자산 또는 초기 설정이 올바르지 않습니다: ${JSON.stringify(musicAsset)}`,
    );
    pass("Below the Bedrock MP3를 낮은 음량의 반복 배경음악으로 준비하고 자동재생은 사용하지 않는다");

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
    await waitFor(page, "!document.getElementById('musicStatus').textContent.includes('준비 중')", 8_000);
    const started = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      const audio = document.getElementById('backgroundMusic');
      return {
        version: save.version,
        label: save.meta.label,
        upgrades: document.querySelectorAll('.upgrade-card').length,
        achievements: document.querySelectorAll('.achievement-card').length,
        storageStatus: document.getElementById('localStorageStatus').textContent,
        persistenceStatus: document.getElementById('persistenceStatus').textContent,
        storageUsage: document.getElementById('storageUsage').textContent,
        saveSize: document.getElementById('saveSize').textContent,
        musicEnabled: save.data.settings.musicEnabled,
        selectedOreId: save.data.selectedOreId,
        cosmetics: save.data.cosmetics,
        musicChecked: document.getElementById('musicToggle').checked,
        musicStatus: document.getElementById('musicStatus').textContent,
        musicPaused: audio.paused
      };
    })()`);
    assert(
      started.version === 4 &&
        started.label === "픽셀 광산" &&
        started.selectedOreId === "coal" &&
        started.cosmetics.characterId === "female" &&
        started.cosmetics.outfitId === "workwear",
      "v4 로컬 세이브 또는 기본 캐릭터 설정이 생성되지 않았습니다.",
    );
    assert(started.upgrades === 7 && started.achievements === 13, "업그레이드 또는 업적 개수가 다릅니다.");
    assert(started.storageStatus.includes("사용 가능"), "HTTP localStorage가 사용 가능 상태가 아닙니다.");
    pass("게임 시작 후 v4 세이브, 기본 광부, 선택 광맥, 일반 업그레이드 6종, 광맥 마일스톤, 업적 13종을 초기화한다");
    assert(started.persistenceStatus.includes("승인") || started.persistenceStatus.includes("삭제 가능"), "저장 보호 결과가 표시되지 않았습니다.");
    assert(started.storageUsage.includes("Origin") && started.saveSize.includes("UTF-8 JSON"), "Origin 사용량과 세이브 크기가 구분되지 않았습니다.");
    pass("저장 보호 결과, Origin 예상 사용량, 세이브 UTF-8 크기를 구분해 표시한다");
    assert(
      started.musicEnabled && started.musicChecked && started.musicStatus.includes("재생 중") && !started.musicPaused,
      `게임 시작 제스처에서 배경음악이 재생되지 않았습니다: ${JSON.stringify(started)}`,
    );
    pass("게임 시작 제스처에서 기본 활성화된 배경음악을 반복 재생한다");

    await waitFor(page, "document.getElementById('minerActor').dataset.ready === 'true' && document.getElementById('minerCanvas').dataset.pose === 'side'", 8_000);
    const actorStart = await page.evaluate(`(() => {
      const actor = document.getElementById('minerActor');
      const canvas = document.getElementById('minerCanvas');
      return {
        character: actor.dataset.character,
        outfit: actor.dataset.outfit,
        pose: actor.dataset.pose,
        facing: actor.dataset.facing,
        x: Number(actor.dataset.x),
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        pointerEvents: getComputedStyle(actor).pointerEvents
      };
    })()`);
    await delay(350);
    const actorMovedX = await page.evaluate("Number(document.getElementById('minerActor').dataset.x)");
    assert(
      actorStart.character === "female" &&
        actorStart.outfit === "workwear" &&
        actorStart.pose === "side" &&
        actorStart.facing === "right" &&
        actorStart.canvasWidth === 360 &&
        actorStart.canvasHeight === 418 &&
        actorStart.pointerEvents === "none" &&
        actorMovedX > actorStart.x,
      `기본 광부 Canvas 또는 오른쪽 이동 상태가 올바르지 않습니다: ${JSON.stringify({ actorStart, actorMovedX })}`,
    );

    await page.evaluate("document.getElementById('characterMenuButton').click(); true");
    await waitFor(page, "document.getElementById('characterDialog').open");
    await page.evaluate(`(() => {
      const character = document.getElementById('gameCharacterSelect');
      const outfit = document.getElementById('gameOutfitSelect');
      character.value = 'dwarf';
      character.dispatchEvent(new Event('change', { bubbles: true }));
      outfit.value = 'space';
      outfit.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(page, "document.getElementById('characterDialogCanvas').dataset.character === 'dwarf' && document.getElementById('characterDialogCanvas').dataset.outfit === 'space' && document.getElementById('characterDialogCanvas').dataset.pose === 'front'", 8_000);
    await page.evaluate("document.getElementById('applyCharacterButton').click(); true");
    await waitFor(page, "!document.getElementById('characterDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).data.cosmetics.characterId === 'dwarf' && document.getElementById('minerCanvas').dataset.character === 'dwarf' && document.getElementById('minerCanvas').dataset.outfit === 'space'", 8_000);
    const characterSelection = await page.evaluate(`(() => ({
      label: document.getElementById('characterMenuLabel').textContent,
      character: document.getElementById('minerActor').dataset.character,
      outfit: document.getElementById('minerActor').dataset.outfit,
      saved: JSON.parse(localStorage.getItem('pixelMine.save')).data.cosmetics
    }))()`);
    assert(
      characterSelection.label.includes("드워프") &&
        characterSelection.label.includes("우주복") &&
        characterSelection.character === "dwarf" &&
        characterSelection.outfit === "space" &&
        characterSelection.saved.characterId === "dwarf" &&
        characterSelection.saved.outfitId === "space",
      `캐릭터 선택 또는 저장 결과가 올바르지 않습니다: ${JSON.stringify(characterSelection)}`,
    );
    pass("여자·남자·드워프와 3종 의상을 선택 팝업에서 조합하고 즉시 v4 세이브에 보존한다");

    await waitFor(page, "document.getElementById('minerActor').dataset.facing === 'left' && document.getElementById('minerActor').dataset.pose === 'side'", 15_000);
    const leftMovementStart = await page.evaluate("Number(document.getElementById('minerActor').dataset.x)");
    await delay(350);
    const leftMovementEnd = await page.evaluate("Number(document.getElementById('minerActor').dataset.x)");
    const flippedActor = await page.evaluate(`(() => ({
      actorFacing: document.getElementById('minerActor').dataset.facing,
      canvasFacing: document.getElementById('minerCanvas').dataset.facing,
      pose: document.getElementById('minerCanvas').dataset.pose
    }))()`);
    assert(
      leftMovementEnd < leftMovementStart &&
        flippedActor.actorFacing === "left" &&
        flippedActor.canvasFacing === "left" &&
        flippedActor.pose === "side",
      `캐릭터 좌측 이동 또는 Canvas 반전 결과가 올바르지 않습니다: ${JSON.stringify({ leftMovementStart, leftMovementEnd, flippedActor })}`,
    );
    pass("광부가 광산 안을 좌우로 왕복하고 진행 방향에 맞춰 Canvas 이미지를 반전한다");

    const featureNavigation = await page.evaluate(`(() => {
      const gameApp = document.getElementById('gameApp');
      const topbar = document.querySelector('.topbar');
      const mineralCatalogList = document.getElementById('mineralCatalogList');
      const achievementList = document.getElementById('achievementList');
      const saveActions = document.querySelector('.save-actions');
      const catalogButton = document.getElementById('mineralCatalogMenuButton');
      const achievementButton = document.getElementById('achievementsMenuButton');
      const saveButton = document.getElementById('saveMenuButton');
      const saveDialog = document.getElementById('saveManagementDialog');
      return {
        mineralCatalogOutsideGame: !gameApp.contains(mineralCatalogList),
        achievementOutsideGame: !gameApp.contains(achievementList),
        saveOutsideGame: !gameApp.contains(saveActions),
        coreStatsInTopbar: ['currencyValue', 'perClickValue', 'perSecondValue'].every((id) => topbar.contains(document.getElementById(id))),
        legacyStatsRemoved: !document.querySelector('.stats-grid') && !document.querySelector('.stat-card'),
        visibleBrandRemoved: !topbar.querySelector('.topbar-title, .topbar-korean, .eyebrow'),
        accessibleTitle: Boolean(topbar.querySelector('h1.visually-hidden')),
        manualSaveMoved: !topbar.contains(document.getElementById('manualSaveButton')) && saveDialog.contains(document.getElementById('manualSaveButton')),
        purchaseModes: document.querySelectorAll('[data-purchase-mode]').length,
        defaultPurchaseMode: document.querySelector('[data-purchase-mode="one"]').getAttribute('aria-pressed'),
        purchaseToolbarInShop: document.querySelector('.shop-section').contains(document.querySelector('.purchase-toolbar')),
        oreBonusInMine: document.querySelector('.mine-section').contains(document.getElementById('oreProgressionBonus')),
        initialOreBonus: document.getElementById('oreProgressionBonus').textContent.replace(/\s+/g, ' ').trim(),
        summaryOrder: [...document.querySelectorAll('.mine-summary > span:not(.mine-summary-separator)')].map((item) => item.textContent.trim()),
        menuButtons: document.querySelectorAll('.utility-menu-button').length,
        catalogBeforeAchievement: catalogButton.nextElementSibling === achievementButton,
        catalogControls: catalogButton.getAttribute('aria-controls'),
        achievementControls: achievementButton.getAttribute('aria-controls'),
        saveControls: saveButton.getAttribute('aria-controls'),
        dialogsClosed: !document.getElementById('mineralCatalogDialog').open && !document.getElementById('achievementsDialog').open && !document.getElementById('saveManagementDialog').open
      };
    })()`);
    assert(
      featureNavigation.mineralCatalogOutsideGame && featureNavigation.achievementOutsideGame && featureNavigation.saveOutsideGame && featureNavigation.dialogsClosed,
      `도감, 업적 또는 저장 기능이 게임 본문에서 분리되지 않았습니다: ${JSON.stringify(featureNavigation)}`,
    );
    assert(
      featureNavigation.menuButtons === 3 &&
      featureNavigation.catalogBeforeAchievement &&
      featureNavigation.catalogControls === "mineralCatalogDialog" &&
      featureNavigation.achievementControls === "achievementsDialog" &&
      featureNavigation.saveControls === "saveManagementDialog",
      "상단 아이콘 메뉴와 다이얼로그 연결이 올바르지 않습니다.",
    );
    pass("도감 버튼을 업적 왼쪽에 배치하고 도감·업적·저장 기능을 상단 아이콘 메뉴에 연결한다");
    assert(
      featureNavigation.coreStatsInTopbar &&
        featureNavigation.legacyStatsRemoved &&
        featureNavigation.visibleBrandRemoved &&
        featureNavigation.accessibleTitle &&
        featureNavigation.manualSaveMoved &&
        featureNavigation.purchaseModes === 3 &&
        featureNavigation.defaultPurchaseMode === "true" &&
        featureNavigation.purchaseToolbarInShop &&
        featureNavigation.oreBonusInMine &&
        featureNavigation.initialOreBonus.includes("최고 개척 석탄") &&
        featureNavigation.initialOreBonus.includes("클릭 ×1") &&
        featureNavigation.initialOreBonus.includes("자동 ×1"),
      `컴팩트 상단 구조가 올바르지 않습니다: ${JSON.stringify(featureNavigation)}`,
    );
    assert(
      featureNavigation.summaryOrder.length === 3 &&
        featureNavigation.summaryOrder[0].startsWith("누적 채굴") &&
        featureNavigation.summaryOrder[1].startsWith("총 클릭") &&
        featureNavigation.summaryOrder[2].startsWith("오프라인 수익"),
      `광맥 하단 누적 통계 순서가 올바르지 않습니다: ${JSON.stringify(featureNavigation.summaryOrder)}`,
    );
    pass("핵심 통계 3개를 상단에 합치고 누적 통계와 수동 저장을 요청한 위치로 이동한다");

    await page.evaluate("document.getElementById('mineralCatalogMenuButton').click(); true");
    await waitFor(page, "document.getElementById('mineralCatalogDialog').open");
    const initialCatalog = await page.evaluate(`(() => ({
      expanded: document.getElementById('mineralCatalogMenuButton').getAttribute('aria-expanded'),
      badge: document.getElementById('mineralCatalogMenuBadge').textContent,
      count: document.getElementById('mineralCatalogCount').textContent,
      cards: document.querySelectorAll('#mineralCatalogDialog .mineral-card').length,
      unlocked: document.querySelectorAll('#mineralCatalogDialog .mineral-card.is-unlocked').length,
      current: document.querySelector('#mineralCatalogDialog .mineral-card.is-current')?.dataset.mineralId,
      ore: document.getElementById('mineSection').dataset.ore,
      shaft: document.getElementById('mineShaftEyebrow').textContent,
      selectButtons: document.querySelectorAll('#mineralCatalogDialog .mineral-select-button').length,
      coalSelectDisabled: document.querySelector('[data-mineral-id="coal"] .mineral-select-button').disabled,
      bonusRows: document.querySelectorAll('#mineralCatalogDialog .mineral-bonus').length,
      coalBonus: document.querySelector('[data-mineral-id="coal"] .mineral-bonus').textContent,
      bonusTexts: [...document.querySelectorAll('#mineralCatalogDialog .mineral-bonus')].map((item) => item.textContent.replace('개척 보너스 · ', '')),
      progression: document.querySelector('#mineralCatalogDialog .mineral-card.is-progression')?.dataset.mineralId,
      appearanceOnlyNotice: document.querySelector('#mineralCatalogDialog .feature-dialog-description').textContent,
      canvasesValid: [...document.querySelectorAll('#mineralCatalogDialog canvas')].every((canvas) => canvas.width === 24 && canvas.height === 24),
      uniqueSprites: new Set([...document.querySelectorAll('#mineralCatalogDialog canvas')].map((canvas) => canvas.toDataURL())).size
    }))()`);
    assert(
      initialCatalog.expanded === "true" &&
        initialCatalog.badge === "1/6" &&
        initialCatalog.count === "1 / 6" &&
        initialCatalog.cards === 6 &&
        initialCatalog.unlocked === 1 &&
        initialCatalog.current === "coal" &&
        initialCatalog.ore === "coal" &&
        initialCatalog.shaft.includes("01") &&
        initialCatalog.selectButtons === 6 &&
        initialCatalog.coalSelectDisabled &&
        initialCatalog.bonusRows === 6 &&
        initialCatalog.coalBonus.includes("클릭 ×1 · 자동 ×1") &&
        JSON.stringify(initialCatalog.bonusTexts) === JSON.stringify([
          "클릭 ×1 · 자동 ×1",
          "클릭 ×1.5 · 자동 ×1.25",
          "클릭 ×2 · 자동 ×2",
          "클릭 ×3.5 · 자동 ×3",
          "클릭 ×6 · 자동 ×7",
          "클릭 ×12 · 자동 ×15",
        ]) &&
        initialCatalog.progression === "coal" &&
        initialCatalog.appearanceOnlyNotice.includes("외형만 변경") &&
        initialCatalog.canvasesValid &&
        initialCatalog.uniqueSprites === 6,
      `초기 광물 도감 또는 석탄 광맥 구성이 올바르지 않습니다: ${JSON.stringify(initialCatalog)}`,
    );
    const mineralCatalogScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(MINERAL_CATALOG_SCREENSHOT_PATH, Buffer.from(mineralCatalogScreenshot.data, "base64"));
    await page.evaluate("document.querySelector('[data-close-dialog=\"mineralCatalogDialog\"]').click(); true");
    await waitFor(page, "!document.getElementById('mineralCatalogDialog').open && document.getElementById('mineralCatalogMenuButton').getAttribute('aria-expanded') === 'false'");
    pass("초기 석탄 광맥과 6칸 광물 도감을 표시하고 발견 상태를 1/6로 계산한다");

    await page.evaluate("document.getElementById('achievementsMenuButton').click(); true");
    await waitFor(page, "document.getElementById('achievementsDialog').open");
    const achievementMenu = await page.evaluate(`(() => ({
      expanded: document.getElementById('achievementsMenuButton').getAttribute('aria-expanded'),
      badge: document.getElementById('achievementMenuBadge').textContent,
      count: document.getElementById('achievementCount').textContent,
      cards: document.querySelectorAll('#achievementsDialog .achievement-card').length
    }))()`);
    assert(
      achievementMenu.expanded === "true" && achievementMenu.badge === "0" && achievementMenu.count === "0 / 13" && achievementMenu.cards === 13,
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
        hasManualSave: dialog.contains(document.getElementById('manualSaveButton')),
        hasStorageDetails: dialog.contains(document.querySelector('.storage-details')),
        hasMusicToggle: dialog.contains(document.getElementById('musicToggle')),
        musicStatus: document.getElementById('musicStatus').textContent
      };
    })()`);
    assert(
      saveMenu.expanded === "true" && saveMenu.hasExport && saveMenu.hasImport && saveMenu.hasReset && saveMenu.hasManualSave && saveMenu.hasStorageDetails && saveMenu.hasMusicToggle && saveMenu.musicStatus.includes("재생 중"),
      `저장 팝업 내용이 올바르지 않습니다: ${JSON.stringify(saveMenu)}`,
    );
    const saveMenuScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(SAVE_MENU_SCREENSHOT_PATH, Buffer.from(saveMenuScreenshot.data, "base64"));

    await page.evaluate(`(() => {
      const toggle = document.getElementById('musicToggle');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(page, "JSON.parse(localStorage.getItem('pixelMine.save')).data.settings.musicEnabled === false", 8_000);
    const musicOff = await page.evaluate(`(() => ({
      paused: document.getElementById('backgroundMusic').paused,
      checked: document.getElementById('musicToggle').checked,
      status: document.getElementById('musicStatus').textContent
    }))()`);
    assert(musicOff.paused && !musicOff.checked && musicOff.status.includes("꺼짐"), `배경음악 끄기 상태가 올바르지 않습니다: ${JSON.stringify(musicOff)}`);

    await page.evaluate(`(() => {
      const toggle = document.getElementById('musicToggle');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(page, "JSON.parse(localStorage.getItem('pixelMine.save')).data.settings.musicEnabled === true && document.getElementById('musicStatus').textContent.includes('재생 중')", 8_000);
    const musicOn = await page.evaluate(`(() => ({
      paused: document.getElementById('backgroundMusic').paused,
      checked: document.getElementById('musicToggle').checked,
      status: document.getElementById('musicStatus').textContent
    }))()`);
    assert(!musicOn.paused && musicOn.checked && musicOn.status.includes("재생 중"), `배경음악 켜기 상태가 올바르지 않습니다: ${JSON.stringify(musicOn)}`);
    pass("저장 팝업에서 배경음악을 끄고 다시 켜며 선택을 로컬 세이브에 보존한다");

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
    await waitFor(page, "document.getElementById('minerActor').dataset.pose === 'mining' && document.getElementById('minerCanvas').dataset.pose === 'mining'", 2_000);
    const miningPose = await page.evaluate(`(() => ({
      actorPose: document.getElementById('minerActor').dataset.pose,
      canvasPose: document.getElementById('minerCanvas').dataset.pose,
      actorFacing: document.getElementById('minerActor').dataset.facing,
      canvasFacing: document.getElementById('minerCanvas').dataset.facing,
      mineButtonZ: getComputedStyle(document.getElementById('mineButton')).zIndex,
      oreZ: Number(getComputedStyle(document.getElementById('oreCanvas')).zIndex),
      actorZ: Number(getComputedStyle(document.getElementById('minerActor')).zIndex),
      gainZ: Number(getComputedStyle(document.getElementById('mineGainLabel')).zIndex),
      effectZ: Number(getComputedStyle(document.querySelector('.floating-gain')).zIndex),
      actorPointerEvents: getComputedStyle(document.getElementById('minerActor')).pointerEvents,
      miningLabelRemoved: !document.getElementById('mineButtonLabel') && !document.querySelector('.mine-button-label')
    }))()`);
    assert(
      miningPose.actorPose === "mining" &&
        miningPose.canvasPose === "mining" &&
        miningPose.actorFacing === miningPose.canvasFacing &&
        miningPose.mineButtonZ === "auto" &&
        miningPose.oreZ < miningPose.actorZ &&
        miningPose.actorZ < miningPose.gainZ &&
        miningPose.actorZ < miningPose.effectZ &&
        miningPose.actorPointerEvents === "none" &&
        miningPose.miningLabelRemoved,
      `채굴 클릭 포즈 또는 반전 방향이 올바르지 않습니다: ${JSON.stringify(miningPose)}`,
    );
    await waitFor(page, "document.getElementById('minerActor').dataset.pose === 'side' && document.getElementById('minerCanvas').dataset.pose === 'side'", 2_000);
    pass("광맥 클릭 시 곡괭이 포즈로 전환하고 짧은 동작 뒤 걷기 포즈로 복귀한다");

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

    const upgradeToast = await page.evaluate(`(() => {
      const region = document.getElementById('toastRegion');
      const style = getComputedStyle(region);
      return {
        messages: [...region.querySelectorAll('.toast')].map((toast) => toast.textContent),
        ariaLive: region.getAttribute('aria-live'),
        ariaAtomic: region.getAttribute('aria-atomic'),
        ariaRelevant: region.getAttribute('aria-relevant'),
        position: style.position,
        top: style.top,
        right: style.right,
        pointerEvents: style.pointerEvents
      };
    })()`);
    assert(
      upgradeToast.messages.some((message) => message.includes("낡은 곡괭이 레벨 1 달성")) &&
        upgradeToast.ariaLive === "polite" &&
        upgradeToast.ariaAtomic === "false" &&
        upgradeToast.ariaRelevant === "additions text" &&
        upgradeToast.position === "fixed" &&
        upgradeToast.top === "18px" &&
        upgradeToast.right === "18px" &&
        upgradeToast.pointerEvents === "none",
      `업그레이드 알림 toast 구성이 올바르지 않습니다: ${JSON.stringify(upgradeToast)}`,
    );
    pass("업그레이드 결과를 포커스를 가로채지 않는 우측 상단 toast로 안내한다");

    await page.evaluate("document.getElementById('saveMenuButton').click(); true");
    await waitFor(page, "document.getElementById('saveManagementDialog').open");
    await page.evaluate("document.getElementById('exportButton').click(); true");
    await waitFor(page, "document.getElementById('saveManagementDialog').open && document.getElementById('exportDialog').open && document.getElementById('exportCode').value.startsWith('PIXELMINE-V4:')");
    const saveCode = await page.evaluate("document.getElementById('exportCode').value");
    const decoded = JSON.parse(Buffer.from(saveCode.slice("PIXELMINE-V4:".length), "base64").toString("utf8"));
    assert(
      decoded.version === 4 &&
        decoded.meta.label === "픽셀 광산" &&
        decoded.data.cosmetics.characterId === "dwarf" &&
        decoded.data.cosmetics.outfitId === "space",
      "UTF-8 세이브 코드가 한글 메타데이터 또는 캐릭터 선택을 보존하지 못했습니다.",
    );
    pass("UTF-8 JSON 세이브 코드를 Base64로 내보내고 한글을 보존한다");

    await page.evaluate(`(() => {
      document.getElementById('exportDialog').close();
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = 'PIXELMINE-V5:QUFBQQ==';
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
    await waitFor(page, "!document.getElementById('importDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).version === 4");
    const migratedLegacy = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return { version: save.version, currency: save.data.currency, clicks: save.data.totalClicks, level: save.data.upgrades.worn_pickaxe, selectedOreId: save.data.selectedOreId, cosmetics: save.data.cosmetics };
    })()`);
    assert(
      migratedLegacy.version === 4 &&
        migratedLegacy.currency === 42 &&
        migratedLegacy.clicks === 7 &&
        migratedLegacy.level === 2 &&
        migratedLegacy.selectedOreId === "coal" &&
        migratedLegacy.cosmetics.characterId === "female" &&
        migratedLegacy.cosmetics.outfitId === "workwear",
      `v0 저장 마이그레이션 결과가 올바르지 않습니다: ${JSON.stringify(migratedLegacy)}`,
    );
    pass("v0 레거시 저장을 정의된 마이그레이션을 통해 v4 스키마와 기본 광부로 복원한다");

    const legacyV1Payload = JSON.parse(JSON.stringify(decoded));
    legacyV1Payload.version = 1;
    delete legacyV1Payload.data.upgrades.ore_milestone;
    delete legacyV1Payload.data.selectedOreId;
    delete legacyV1Payload.data.cosmetics;
    const legacyV1Code = `PIXELMINE-V1:${Buffer.from(JSON.stringify(legacyV1Payload), "utf8").toString("base64")}`;
    await page.evaluate(`(() => {
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = ${JSON.stringify(legacyV1Code)};
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(page, "!document.getElementById('importDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).version === 4");
    const migratedV1 = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return { version: save.version, milestone: save.data.upgrades.ore_milestone, selectedOreId: save.data.selectedOreId, ore: document.getElementById('mineSection').dataset.ore, cosmetics: save.data.cosmetics };
    })()`);
    assert(
      migratedV1.version === 4 &&
        migratedV1.milestone === 0 &&
        migratedV1.selectedOreId === "coal" &&
        migratedV1.ore === "coal" &&
        migratedV1.cosmetics.characterId === "female" &&
        migratedV1.cosmetics.outfitId === "workwear",
      `v1 광맥 진행도 기본값 마이그레이션이 올바르지 않습니다: ${JSON.stringify(migratedV1)}`,
    );
    pass("기존 v1 세이브에 광맥·캐릭터 기본값을 보완해 v4로 자동 이관한다");

    const legacyV2Payload = JSON.parse(JSON.stringify(decoded));
    legacyV2Payload.version = 2;
    legacyV2Payload.data.upgrades.ore_milestone = 3;
    delete legacyV2Payload.data.selectedOreId;
    delete legacyV2Payload.data.cosmetics;
    const legacyV2Code = `PIXELMINE-V2:${Buffer.from(JSON.stringify(legacyV2Payload), "utf8").toString("base64")}`;
    await page.evaluate(`(() => {
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = ${JSON.stringify(legacyV2Code)};
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(page, "!document.getElementById('importDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).version === 4");
    const migratedV2 = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return { version: save.version, milestone: save.data.upgrades.ore_milestone, selectedOreId: save.data.selectedOreId, ore: document.getElementById('mineSection').dataset.ore, cosmetics: save.data.cosmetics };
    })()`);
    assert(
      migratedV2.version === 4 &&
        migratedV2.milestone === 3 &&
        migratedV2.selectedOreId === "gold" &&
        migratedV2.ore === "gold" &&
        migratedV2.cosmetics.characterId === "female" &&
        migratedV2.cosmetics.outfitId === "workwear",
      `v2 선택 광맥 마이그레이션이 올바르지 않습니다: ${JSON.stringify(migratedV2)}`,
    );
    pass("기존 v2 세이브는 최고 발견 광맥과 기본 광부를 선택한 v4 상태로 자동 이관한다");

    const legacyV3Payload = JSON.parse(JSON.stringify(decoded));
    legacyV3Payload.version = 3;
    delete legacyV3Payload.data.cosmetics;
    const legacyV3Code = `PIXELMINE-V3:${Buffer.from(JSON.stringify(legacyV3Payload), "utf8").toString("base64")}`;
    await page.evaluate(`(() => {
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = ${JSON.stringify(legacyV3Code)};
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(page, "!document.getElementById('importDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).version === 4");
    const migratedV3 = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return {
        version: save.version,
        cosmetics: save.data.cosmetics,
        actorCharacter: document.getElementById('minerActor').dataset.character,
        actorOutfit: document.getElementById('minerActor').dataset.outfit
      };
    })()`);
    assert(
      migratedV3.version === 4 &&
        migratedV3.cosmetics.characterId === "female" &&
        migratedV3.cosmetics.outfitId === "workwear" &&
        migratedV3.actorCharacter === "female" &&
        migratedV3.actorOutfit === "workwear",
      `v3 캐릭터 기본값 마이그레이션이 올바르지 않습니다: ${JSON.stringify(migratedV3)}`,
    );
    pass("기존 v3 세이브에 기본 광부 설정을 보완해 v4로 자동 이관한다");

    await page.evaluate(`(() => {
      document.getElementById('importOpenButton').click();
      document.getElementById('importCode').value = ${JSON.stringify(saveCode)};
      document.getElementById('confirmImportButton').click();
      return true;
    })()`);
    await waitFor(page, "!document.getElementById('importDialog').open && JSON.parse(localStorage.getItem('pixelMine.save')).data.currency === 6");

    await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      delete save.data.settings.musicEnabled;
      localStorage.setItem('pixelMine.save', JSON.stringify(save));
      return true;
    })()`);

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
      musicEnabled: JSON.parse(localStorage.getItem('pixelMine.save')).data.settings.musicEnabled,
      cosmetics: JSON.parse(localStorage.getItem('pixelMine.save')).data.cosmetics,
      actorCharacter: document.getElementById('minerActor').dataset.character,
      actorOutfit: document.getElementById('minerActor').dataset.outfit,
      shown: document.getElementById('currencyValue').textContent
    }))()`);
    assert(
      resumed.level === 1 &&
        resumed.clicks === 13 &&
        resumed.musicEnabled === true &&
        resumed.cosmetics.characterId === "dwarf" &&
        resumed.cosmetics.outfitId === "space" &&
        resumed.actorCharacter === "dwarf" &&
        resumed.actorOutfit === "space" &&
        resumed.shown === "6",
      `새로고침 복원 결과가 일치하지 않습니다: ${JSON.stringify(resumed)}`,
    );
    pass("새로고침 후에도 시작 버튼을 거쳐 기존 진행도를 복원한다");
    pass("배경음악 필드가 없는 기존 세이브를 기본 활성 상태로 보완한다");

    await reload(page);
    await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      save.data.currency = 0;
      save.data.stats.offlineEarned = 0;
      save.data.upgrades.miner = 2;
      save.data.upgrades.ore_milestone = 1;
      save.data.selectedOreId = 'coal';
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
    assert(offline.currency >= 108_000 && offline.currency < 108_007, `브론즈 자동 배율이 적용된 24시간 상한 수익이 잘못되었습니다: ${offline.currency}`);
    assert(offline.offlineEarned >= 108_000 && offline.offlineEarned < 108_007, "브론즈 자동 배율이 오프라인 누적 통계에 적용되지 않았습니다.");
    assert(offline.duration.includes("1일"), "24시간 상한이 모달에 표시되지 않았습니다.");
    await page.evaluate("document.getElementById('offlineDialog').close(); true");
    pass("선택 외형과 무관한 최고 개척 자동 배율로 오프라인 수익을 계산하고 24시간으로 제한한다");

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

    await reload(page);
    await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      save.data.currency = 14_000_000_000;
      save.data.totalCurrencyEarned = Math.max(save.data.totalCurrencyEarned, 14_000_000_000);
      save.data.upgrades.ore_milestone = 0;
      save.data.selectedOreId = 'coal';
      save.data.lastProcessedAt = Date.now();
      localStorage.setItem('pixelMine.save', JSON.stringify(save));
      return true;
    })()`);
    await startGame(page);
    await waitFor(page, "!document.getElementById('gameApp').classList.contains('is-hidden')");
    const coalSprite = await page.evaluate("document.getElementById('oreCanvas').toDataURL()");
    const initialMilestonePrice = await page.evaluate(`(() => ({
      text: document.querySelector('[data-upgrade-id="ore_milestone"] .upgrade-buy-cost').textContent,
      exact: document.querySelector('[data-upgrade-id="ore_milestone"] .upgrade-buy-cost').title
    }))()`);
    assert(initialMilestonePrice.text === "25만 광석" && initialMilestonePrice.exact === "250,000", "브론즈 마일스톤 비용이 250,000 광석이 아닙니다.");
    await page.evaluate(`(() => {
      document.querySelector('[data-upgrade-id="ore_milestone"] .upgrade-buy').click();
      document.getElementById('manualSaveButton').click();
      return true;
    })()`);
    await waitFor(page, "JSON.parse(localStorage.getItem('pixelMine.save')).data.upgrades.ore_milestone === 1");
    await page.evaluate("document.getElementById('mineralCatalogMenuButton').click(); true");
    await waitFor(page, "document.getElementById('mineralCatalogDialog').open");
    const bronzeMilestone = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return {
        level: save.data.upgrades.ore_milestone,
        selectedOreId: save.data.selectedOreId,
        discoveryAchievement: save.data.unlockedAchievements.discover_bronze,
        ore: document.getElementById('mineSection').dataset.ore,
        shaft: document.getElementById('mineShaftEyebrow').textContent,
        mineAriaLabel: document.getElementById('mineButton').getAttribute('aria-label'),
        badge: document.getElementById('mineralCatalogMenuBadge').textContent,
        unlocked: document.querySelectorAll('.mineral-card.is-unlocked').length,
        current: document.querySelector('.mineral-card.is-current')?.dataset.mineralId,
        sprite: document.getElementById('oreCanvas').toDataURL(),
        milestoneStage: document.querySelector('[data-upgrade-id="ore_milestone"] .upgrade-level').textContent,
        clickPower: document.getElementById('perClickValue').title,
        autoRate: document.getElementById('perSecondValue').title,
        bonus: document.getElementById('oreProgressionBonus').textContent.replace(/\s+/g, ' ').trim(),
        activeBonus: document.querySelector('.mineral-card.is-progression')?.dataset.mineralId,
        bronzeBonus: document.querySelector('[data-mineral-id="bronze"] .mineral-bonus').textContent
      };
    })()`);
    assert(
      bronzeMilestone.level === 1 &&
        bronzeMilestone.selectedOreId === "bronze" &&
        bronzeMilestone.discoveryAchievement > 0 &&
        bronzeMilestone.ore === "bronze" &&
        bronzeMilestone.shaft.includes("02") &&
        bronzeMilestone.mineAriaLabel === "브론즈 광맥을 채굴해 광석 획득" &&
        bronzeMilestone.badge === "2/6" &&
        bronzeMilestone.unlocked === 2 &&
        bronzeMilestone.current === "bronze" &&
        bronzeMilestone.sprite !== coalSprite &&
        bronzeMilestone.milestoneStage === "STAGE 2/6" &&
        bronzeMilestone.clickPower === "3" &&
        bronzeMilestone.autoRate === "1.25" &&
        bronzeMilestone.bonus.includes("최고 개척 브론즈") &&
        bronzeMilestone.bonus.includes("클릭 ×1.5") &&
        bronzeMilestone.bonus.includes("자동 ×1.25") &&
        bronzeMilestone.activeBonus === "bronze" &&
        bronzeMilestone.bronzeBonus.includes("클릭 ×1.5 · 자동 ×1.25"),
      `브론즈 광맥 마일스톤 적용이 올바르지 않습니다: ${JSON.stringify(bronzeMilestone)}`,
    );
    await page.evaluate(`(() => {
      document.querySelector('[data-mineral-id="coal"] .mineral-select-button').click();
      document.getElementById('manualSaveButton').click();
      return true;
    })()`);
    const reselectedCoal = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      return {
        selectedOreId: save.data.selectedOreId,
        ore: document.getElementById('mineSection').dataset.ore,
        badge: document.getElementById('mineralCatalogMenuBadge').textContent,
        current: document.querySelector('.mineral-card.is-current')?.dataset.mineralId,
        bronzeSelectable: !document.querySelector('[data-mineral-id="bronze"] .mineral-select-button').disabled,
        activeBonus: document.querySelector('.mineral-card.is-progression')?.dataset.mineralId,
        progressionOre: document.getElementById('progressionOreName').textContent,
        clickPower: document.getElementById('perClickValue').title,
        autoRate: document.getElementById('perSecondValue').title
      };
    })()`);
    assert(
      reselectedCoal.selectedOreId === "coal" &&
        reselectedCoal.ore === "coal" &&
        reselectedCoal.badge === "2/6" &&
        reselectedCoal.current === "coal" &&
        reselectedCoal.bronzeSelectable &&
        reselectedCoal.activeBonus === "bronze" &&
        reselectedCoal.progressionOre === "브론즈" &&
        reselectedCoal.clickPower === "3" &&
        reselectedCoal.autoRate === "1.25",
      `발견 광맥 재선택 결과가 올바르지 않습니다: ${JSON.stringify(reselectedCoal)}`,
    );
    await page.evaluate("document.querySelector('[data-close-dialog=\"mineralCatalogDialog\"]').click(); true");
    pass("석탄 외형을 다시 선택해도 브론즈 클릭·자동 생산 개척 배율을 유지하고 v4 세이브에 보존한다");

    await page.evaluate("document.querySelector('[data-purchase-mode=\"max\"]').click(); true");
    const maxMilestoneOffer = await page.evaluate(`(() => ({
      count: document.querySelector('[data-upgrade-id="ore_milestone"]').dataset.purchaseCount,
      exact: document.querySelector('[data-upgrade-id="ore_milestone"] .upgrade-buy-cost').title,
      pressed: document.querySelector('[data-purchase-mode="max"]').getAttribute('aria-pressed')
    }))()`);
    assert(
      maxMilestoneOffer.count === "4" && maxMilestoneOffer.exact === "12,935,000,000" && maxMilestoneOffer.pressed === "true",
      `남은 광맥 최대 구매 비용 계산이 올바르지 않습니다: ${JSON.stringify(maxMilestoneOffer)}`,
    );
    await page.evaluate(`(() => {
      document.querySelector('[data-upgrade-id="ore_milestone"] .upgrade-buy').click();
      document.getElementById('manualSaveButton').click();
      return true;
    })()`);
    await waitFor(page, "JSON.parse(localStorage.getItem('pixelMine.save')).data.upgrades.ore_milestone === 5");
    const fullCatalog = await page.evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem('pixelMine.save'));
      const discoveryIds = ['discover_bronze', 'discover_iron', 'discover_gold', 'discover_ruby', 'discover_diamond'];
      return {
        selectedOreId: save.data.selectedOreId,
        ore: document.getElementById('mineSection').dataset.ore,
        badge: document.getElementById('mineralCatalogMenuBadge').textContent,
        discoveries: discoveryIds.every((id) => save.data.unlockedAchievements[id] > 0),
        milestoneMax: document.querySelector('[data-upgrade-id="ore_milestone"] .upgrade-buy-cost').textContent,
        clickPower: document.getElementById('perClickValue').title,
        autoRate: document.getElementById('perSecondValue').title,
        bonus: document.getElementById('oreProgressionBonus').textContent.replace(/\s+/g, ' ').trim()
      };
    })()`);
    assert(
      fullCatalog.selectedOreId === "diamond" &&
        fullCatalog.ore === "diamond" &&
        fullCatalog.badge === "6/6" &&
        fullCatalog.discoveries &&
        fullCatalog.milestoneMax === "MAX" &&
        fullCatalog.clickPower === "24" &&
        fullCatalog.autoRate === "15" &&
        fullCatalog.bonus.includes("최고 개척 다이아") &&
        fullCatalog.bonus.includes("클릭 ×12") &&
        fullCatalog.bonus.includes("자동 ×15"),
      `광물 전체 발견 또는 발견 업적 결과가 올바르지 않습니다: ${JSON.stringify(fullCatalog)}`,
    );
    pass("최대 구매로 남은 4단계를 개척해 다이아 배율을 적용하고 광물 발견 업적 5종을 해금한다");

    const bulkLevels = await page.evaluate(`(() => {
      document.querySelector('[data-purchase-mode="ten"]').click();
      const saveBeforeTen = JSON.parse(localStorage.getItem('pixelMine.save'));
      const wornBefore = saveBeforeTen.data.upgrades.worn_pickaxe;
      const tenCount = Number(document.querySelector('[data-upgrade-id="worn_pickaxe"]').dataset.purchaseCount);
      document.querySelector('[data-upgrade-id="worn_pickaxe"] .upgrade-buy').click();
      document.getElementById('manualSaveButton').click();
      const wornAfter = JSON.parse(localStorage.getItem('pixelMine.save')).data.upgrades.worn_pickaxe;

      document.querySelector('[data-purchase-mode="max"]').click();
      const steelBefore = JSON.parse(localStorage.getItem('pixelMine.save')).data.upgrades.steel_pickaxe;
      const maxCount = Number(document.querySelector('[data-upgrade-id="steel_pickaxe"]').dataset.purchaseCount);
      document.querySelector('[data-upgrade-id="steel_pickaxe"] .upgrade-buy').click();
      document.getElementById('manualSaveButton').click();
      const steelAfter = JSON.parse(localStorage.getItem('pixelMine.save')).data.upgrades.steel_pickaxe;
      return { wornBefore, wornAfter, tenCount, steelBefore, steelAfter, maxCount };
    })()`);
    assert(
      bulkLevels.tenCount === 10 && bulkLevels.wornAfter - bulkLevels.wornBefore === 10 && bulkLevels.maxCount > 1 && bulkLevels.steelAfter - bulkLevels.steelBefore === bulkLevels.maxCount,
      `10개 또는 최대 일괄 구매 결과가 올바르지 않습니다: ${JSON.stringify(bulkLevels)}`,
    );
    pass("일반 업그레이드를 10개 및 보유 광석 기준 최대 수량으로 일괄 구매한다");

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
        levels: Object.values(save.data.upgrades),
        selectedOreId: save.data.selectedOreId,
        cosmetics: save.data.cosmetics,
        actorCharacter: document.getElementById('minerActor').dataset.character,
        actorOutfit: document.getElementById('minerActor').dataset.outfit,
        ore: document.getElementById('mineSection').dataset.ore,
        catalogBadge: document.getElementById('mineralCatalogMenuBadge').textContent
      };
    })()`);
    assert(resetResult.unrelated === "keep", "초기화가 게임 외 localStorage 키를 삭제했습니다.");
    assert(
      resetResult.currency === 0 &&
        resetResult.levels.every((level) => level === 0) &&
        resetResult.selectedOreId === "coal" &&
        resetResult.cosmetics.characterId === "female" &&
        resetResult.cosmetics.outfitId === "workwear" &&
        resetResult.actorCharacter === "female" &&
        resetResult.actorOutfit === "workwear" &&
        resetResult.ore === "coal" &&
        resetResult.catalogBadge === "1/6",
      "초기화 후 새 게임 상태가 아닙니다.",
    );
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
    assert(corrupt.quarantined === "{broken" && corrupt.currentVersion === 4 && corrupt.currentCurrency === 0, "손상 저장 격리 또는 새 게임 폴백에 실패했습니다.");
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
        crystal_core: 0,
        ore_milestone: 5
      };
      save.data.selectedOreId = 'diamond';
      save.data.lastProcessedAt = Date.now();
      localStorage.setItem('pixelMine.save', JSON.stringify(save));
      return true;
    })()`);
    await startGame(page);
    await waitFor(page, "!document.getElementById('gameApp').classList.contains('is-hidden')");
    const desktopLayout = await page.evaluate(`(() => ({
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      offlineDialogOpen: document.getElementById('offlineDialog').open,
      topbarHeight: document.querySelector('.topbar').getBoundingClientRect().height,
      contentOffset: document.querySelector('.main-grid').getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().top,
      topbarStats: document.querySelectorAll('.topbar-stat').length,
      ore: document.getElementById('mineSection').dataset.ore,
      catalogBadge: document.getElementById('mineralCatalogMenuBadge').textContent,
      clickPower: document.getElementById('perClickValue').title,
      autoRate: document.getElementById('perSecondValue').title,
      progressionBonus: document.getElementById('oreProgressionBonus').textContent.replace(/\s+/g, ' ').trim(),
      summaryText: document.querySelector('.mine-summary').textContent.replace(/\s+/g, ' ').trim(),
      footerItems: document.querySelectorAll('.game-footer > span').length,
      footerText: document.querySelector('.game-footer').textContent.replace(/\s+/g, ' ').trim()
    }))()`);
    assert(desktopLayout.noHorizontalOverflow, "데스크톱 화면에 가로 오버플로가 있습니다.");
    assert(!desktopLayout.offlineDialogOpen, "5초 미만의 빠른 재진입에 오프라인 모달을 표시했습니다.");
    assert(
      desktopLayout.footerItems === 1 && desktopLayout.footerText === "PIXEL MINE v1.4",
      `게임 버전 외 불필요한 푸터 정보가 남아 있습니다: ${JSON.stringify(desktopLayout)}`,
    );
    assert(
      desktopLayout.topbarHeight <= 105 && desktopLayout.contentOffset <= 140 && desktopLayout.topbarStats === 3,
      `데스크톱 상단이 충분히 컴팩트하지 않습니다: ${JSON.stringify(desktopLayout)}`,
    );
    assert(desktopLayout.ore === "diamond" && desktopLayout.catalogBadge === "6/6", "다이아 최종 광맥 또는 도감 6/6 표시가 올바르지 않습니다.");
    assert(
      desktopLayout.clickPower === "192" &&
        desktopLayout.autoRate === "720" &&
        desktopLayout.progressionBonus.includes("최고 개척 다이아") &&
        desktopLayout.progressionBonus.includes("클릭 ×12") &&
        desktopLayout.progressionBonus.includes("자동 ×15"),
      `다이아 개척 배율 또는 표시가 올바르지 않습니다: ${JSON.stringify(desktopLayout)}`,
    );
    assert(
      desktopLayout.summaryText.includes("누적 채굴 5만") && desktopLayout.summaryText.includes("총 클릭 321회") && desktopLayout.summaryText.includes("오프라인 수익"),
      `데스크톱 광맥 요약 표시가 올바르지 않습니다: ${desktopLayout.summaryText}`,
    );
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
      dialogWidth: document.getElementById('saveManagementDialog').getBoundingClientRect().width,
      topbarHeight: document.querySelector('.topbar').getBoundingClientRect().height,
      contentOffset: document.querySelector('.main-grid').getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().top,
      statTops: [...document.querySelectorAll('.topbar-stat')].map((item) => Math.round(item.getBoundingClientRect().top)),
      actionsAboveStats: document.querySelector('.topbar-actions').getBoundingClientRect().bottom <= document.querySelector('.topbar-stats').getBoundingClientRect().top,
      manualSaveInDialog: document.getElementById('saveManagementDialog').contains(document.getElementById('manualSaveButton')),
      characterButtonRight: document.getElementById('characterMenuButton').getBoundingClientRect().right,
      actorInsideStage: (() => {
        const stage = document.getElementById('mineStage').getBoundingClientRect();
        const actor = document.getElementById('minerActor').getBoundingClientRect();
        return actor.left >= stage.left && actor.right <= stage.right && actor.bottom <= stage.bottom;
      })(),
      compactShop: (() => {
        const cards = [...document.querySelectorAll('.upgrade-card')];
        const buttons = [...document.querySelectorAll('.upgrade-buy')];
        const descriptions = [...document.querySelectorAll('.upgrade-description')];
        const infos = [...document.querySelectorAll('.upgrade-info')];
        const heights = cards.map((card) => card.getBoundingClientRect().height);
        return {
          averageHeight: heights.reduce((sum, height) => sum + height, 0) / heights.length,
          maxHeight: Math.max(...heights),
          listHeight: document.querySelector('.upgrade-list').getBoundingClientRect().height,
          cardsInside: cards.every((card) => card.scrollWidth <= card.clientWidth),
          buttonsRight: buttons.every((button, index) => button.getBoundingClientRect().left >= infos[index].getBoundingClientRect().right),
          buttonsUsable: buttons.every((button) => button.getBoundingClientRect().width >= 82 && button.getBoundingClientRect().height >= 44),
          descriptionsSingleLine: descriptions.every((description) => {
            const style = getComputedStyle(description);
            return style.whiteSpace === 'nowrap' && style.textOverflow === 'ellipsis';
          }),
          cardPadding: getComputedStyle(cards[0]).padding,
          listGap: getComputedStyle(document.querySelector('.upgrade-list')).gap
        };
      })()
    }))()`);
    assert(mobileLayout.scrollWidth <= mobileLayout.viewport, `모바일 화면에 가로 오버플로가 있습니다: ${JSON.stringify(mobileLayout)}`);
    assert(mobileLayout.mineWidth < mobileLayout.viewport, "모바일 광맥 버튼이 뷰포트를 벗어났습니다.");
    assert(
      mobileLayout.menuRight <= mobileLayout.viewport &&
        mobileLayout.characterButtonRight <= mobileLayout.viewport &&
        mobileLayout.dialogWidth <= mobileLayout.viewport &&
        mobileLayout.actorInsideStage,
      "모바일 아이콘 메뉴, 캐릭터 또는 기능 팝업이 뷰포트를 벗어났습니다.",
    );
    assert(
      mobileLayout.topbarHeight <= 125 &&
        mobileLayout.contentOffset <= 145 &&
        new Set(mobileLayout.statTops).size === 1 &&
        mobileLayout.actionsAboveStats &&
        mobileLayout.manualSaveInDialog,
      `모바일 컴팩트 상단 구조가 올바르지 않습니다: ${JSON.stringify(mobileLayout)}`,
    );
    assert(
      mobileLayout.compactShop.averageHeight <= 120 &&
        mobileLayout.compactShop.maxHeight <= 135 &&
        mobileLayout.compactShop.listHeight <= 900 &&
        mobileLayout.compactShop.cardsInside &&
        mobileLayout.compactShop.buttonsRight &&
        mobileLayout.compactShop.buttonsUsable &&
        mobileLayout.compactShop.descriptionsSingleLine &&
        mobileLayout.compactShop.cardPadding === "8px" &&
        mobileLayout.compactShop.listGap === "8px",
      `모바일 고밀도 상점 카드 구성이 올바르지 않습니다: ${JSON.stringify(mobileLayout.compactShop)}`,
    );
    await page.evaluate("document.getElementById('saveManagementDialog').close(); true");
    await page.evaluate("window.scrollTo(0, 0); true");
    await delay(3_800);
    const mobileScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(MOBILE_SCREENSHOT_PATH, Buffer.from(mobileScreenshot.data, "base64"));
    await page.evaluate("document.querySelector('.shop-section').scrollIntoView({ block: 'start', behavior: 'instant' }); true");
    await delay(120);
    const mobileShopScreenshot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(MOBILE_SHOP_SCREENSHOT_PATH, Buffer.from(mobileShopScreenshot.data, "base64"));

    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 320,
      height: 760,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await delay(100);
    const narrowShop = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.upgrade-card')];
      return {
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cardsInside: cards.every((card) => card.scrollWidth <= card.clientWidth),
        buttonsInside: cards.every((card) => {
          const cardRect = card.getBoundingClientRect();
          const buttonRect = card.querySelector('.upgrade-buy').getBoundingClientRect();
          return buttonRect.left >= cardRect.left && buttonRect.right <= cardRect.right;
        })
      };
    })()`);
    assert(
      narrowShop.viewport === 320 &&
        narrowShop.scrollWidth <= narrowShop.viewport &&
        narrowShop.cardsInside &&
        narrowShop.buttonsInside,
      `320px 모바일 상점에 가로 넘침이 있습니다: ${JSON.stringify(narrowShop)}`,
    );
    pass("320~375px 모바일에서 설명 한 줄과 우측 구매 버튼을 사용한 고밀도 상점 카드를 유지한다");

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

    await waitFor(secondPage, "document.querySelectorAll('#toastRegion .toast').length === 0", 5_000);
    await secondPage.evaluate(`(() => {
      const mine = document.getElementById('mineButton');
      for (let index = 0; index < 100; index += 1) mine.click();
      const buyButtons = document.querySelectorAll('.upgrade-buy');
      for (let index = 0; index < 4; index += 1) buyButtons[0].click();
      for (let index = 0; index < 4; index += 1) {
        buyButtons[buyButtons.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      return true;
    })()`);
    const mergedToasts = await secondPage.evaluate(`(() => ({
      toasts: [...document.querySelectorAll('#toastRegion .toast')].map((toast) => ({
        key: toast.dataset.toastKey,
        message: toast.querySelector('.toast-message')?.textContent,
        count: toast.querySelector('.toast-count')?.textContent,
        error: toast.classList.contains('is-error'),
        atomic: toast.getAttribute('aria-atomic')
      }))
    }))()`);
    const upgradeMerged = mergedToasts.toasts.find((toast) => toast.key === "upgrade:worn_pickaxe");
    const insufficientMerged = mergedToasts.toasts.find((toast) => toast.key === "upgrade:insufficient-ore");
    assert(
      mergedToasts.toasts.length === 3 &&
        new Set(mergedToasts.toasts.map((toast) => toast.key)).size === 3 &&
        !mergedToasts.toasts.some((toast) => toast.key === "achievement:ore_100"),
      `toast 최대 개수 또는 오래된 알림 제거가 올바르지 않습니다: ${JSON.stringify(mergedToasts)}`,
    );
    assert(
      upgradeMerged?.message.includes("낡은 곡괭이 레벨 5 달성") &&
        upgradeMerged.count === "4회 구매" &&
        upgradeMerged.atomic === "true" &&
        insufficientMerged?.message === "광석이 부족합니다." &&
        insufficientMerged.count === "×4" &&
        insufficientMerged.error,
      `동일 toast 병합 결과가 올바르지 않습니다: ${JSON.stringify(mergedToasts)}`,
    );
    await delay(220);
    const toastScreenshot = await secondPage.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(TOAST_SCREENSHOT_PATH, Buffer.from(toastScreenshot.data, "base64"));
    pass("동일 업그레이드와 오류 알림을 의미 기반으로 합치고 최대 3개만 유지한다");

    await waitFor(secondPage, "document.querySelectorAll('#toastRegion .toast').length === 0", 5_000);
    pass("병합 시 재설정된 3.6초 타이머가 toast와 관리 상태를 함께 제거한다");

    await secondPage.send("Emulation.setDeviceMetricsOverride", {
      width: 1024,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(secondPage, new URL("character-demo.html", BASE_URL).href);
    await waitFor(secondPage, "document.body.dataset.characterDemoReady === 'true'", 8_000);

    const characterDemoInitial = await secondPage.evaluate(`(() => {
      const canvas = document.getElementById('characterCanvas');
      const context = canvas.getContext('2d');
      return {
        width: canvas.width,
        height: canvas.height,
        sheet: canvas.dataset.sheet,
        character: canvas.dataset.character,
        pose: canvas.dataset.pose,
        smoothing: context.imageSmoothingEnabled,
        status: document.getElementById('characterDemoStatus').textContent,
        demoStorageKeys: Object.keys(localStorage).filter((key) => key.toLowerCase().includes('character-demo'))
      };
    })()`);
    assert(
      characterDemoInitial.width === 360 &&
        characterDemoInitial.height === 418 &&
        characterDemoInitial.sheet === "workwear" &&
        characterDemoInitial.character === "female" &&
        characterDemoInitial.pose === "front" &&
        characterDemoInitial.smoothing === false &&
        characterDemoInitial.status.includes("360×418px") &&
        characterDemoInitial.demoStorageKeys.length === 0,
      `캐릭터 Canvas 기본 렌더링이 올바르지 않습니다: ${JSON.stringify(characterDemoInitial)}`,
    );

    const characterCombinations = await secondPage.evaluate(`(async () => {
      const canvas = document.getElementById('characterCanvas');
      const context = canvas.getContext('2d');
      const outfit = document.getElementById('outfitSelect');
      const character = document.getElementById('characterSelect');
      const pose = document.getElementById('poseSelect');

      function render(sheetKey, characterKey, poseKey) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            canvas.removeEventListener('character-demo:rendered', handleRendered);
            reject(new Error('캐릭터 조합 렌더링 시간 초과'));
          }, 3_000);
          function handleRendered(event) {
            const detail = event.detail;
            if (detail.sheetKey !== sheetKey || detail.characterKey !== characterKey || detail.poseKey !== poseKey) return;
            clearTimeout(timer);
            canvas.removeEventListener('character-demo:rendered', handleRendered);
            resolve();
          }
          canvas.addEventListener('character-demo:rendered', handleRendered);
          outfit.value = sheetKey;
          character.value = characterKey;
          pose.value = poseKey;
          pose.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      function fingerprint() {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        let visiblePixels = 0;
        let rightEdgeVisiblePixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] > 0) visiblePixels += 1;
          const pixelIndex = index / 4;
          if (pixelIndex % canvas.width >= canvas.width - 12 && pixels[index + 3] > 0) {
            rightEdgeVisiblePixels += 1;
          }
          hash = Math.imul(hash ^ pixels[index], 16777619);
          hash = Math.imul(hash ^ pixels[index + 1], 16777619);
          hash = Math.imul(hash ^ pixels[index + 2], 16777619);
          hash = Math.imul(hash ^ pixels[index + 3], 16777619);
        }
        return { hash: hash >>> 0, visiblePixels, rightEdgeVisiblePixels };
      }

      const results = [];
      for (const sheetKey of ['workwear', 'casual', 'space']) {
        for (const characterKey of ['female', 'male', 'dwarf']) {
          for (const poseKey of ['front', 'side', 'mining']) {
            await render(sheetKey, characterKey, poseKey);
            results.push({ sheetKey, characterKey, poseKey, ...fingerprint() });
          }
        }
      }
      return results;
    })()`);
    assert(
      characterCombinations.length === 27 &&
        characterCombinations.every((item) => item.visiblePixels > 1_000) &&
        characterCombinations
          .filter((item) => item.sheetKey === 'workwear')
          .every((item) => item.visiblePixels < 360 * 418) &&
        new Set(characterCombinations.map((item) => item.hash)).size === 27 &&
        characterCombinations
          .filter((item) => item.poseKey === 'side')
          .every((item) => item.rightEdgeVisiblePixels === 0),
      `27개 캐릭터 셀 가운데 비어 있거나 중복되었거나 옆 셀 픽셀이 남은 렌더링이 있습니다: ${JSON.stringify(characterCombinations)}`,
    );

    await secondPage.evaluate(`(() => {
      const pose = document.getElementById('poseSelect');
      pose.value = 'front';
      pose.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(secondPage, "document.getElementById('characterCanvas').dataset.pose === 'front'");
    await secondPage.evaluate("document.getElementById('previewMiningButton').click(); true");
    await waitFor(secondPage, "document.getElementById('characterCanvas').dataset.pose === 'mining'");
    await waitFor(
      secondPage,
      "document.getElementById('characterCanvas').dataset.pose === 'front' && !document.getElementById('previewMiningButton').disabled",
      3_000,
    );

    await secondPage.evaluate(`(() => {
      document.getElementById('outfitSelect').value = 'workwear';
      document.getElementById('characterSelect').value = 'dwarf';
      const pose = document.getElementById('poseSelect');
      pose.value = 'side';
      pose.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(
      secondPage,
      "document.getElementById('characterCanvas').dataset.sheet === 'workwear' && document.getElementById('characterCanvas').dataset.character === 'dwarf' && document.getElementById('characterCanvas').dataset.pose === 'side'",
    );

    await secondPage.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await delay(120);
    const characterDemoMobile = await secondPage.evaluate(`(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      canvasWidth: document.getElementById('characterCanvas').getBoundingClientRect().width,
      frameWidth: document.querySelector('.character-canvas-frame').getBoundingClientRect().width,
      panelRight: document.querySelector('.character-demo-panel').getBoundingClientRect().right,
      demoStorageKeys: Object.keys(localStorage).filter((key) => key.toLowerCase().includes('character-demo'))
    }))()`);
    assert(
      characterDemoMobile.scrollWidth <= characterDemoMobile.viewport &&
        characterDemoMobile.canvasWidth > 0 &&
        characterDemoMobile.canvasWidth <= characterDemoMobile.frameWidth &&
        characterDemoMobile.panelRight <= characterDemoMobile.viewport &&
        characterDemoMobile.demoStorageKeys.length === 0,
      `모바일 캐릭터 데모 또는 저장 격리가 올바르지 않습니다: ${JSON.stringify(characterDemoMobile)}`,
    );
    const characterDemoScreenshot = await secondPage.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(CHARACTER_DEMO_SCREENSHOT_PATH, Buffer.from(characterDemoScreenshot.data, "base64"));
    pass("투명 기본 광부복·캐주얼·우주복 27개 셀을 세로형 Canvas로 렌더링하고 셀 침범 제거·포즈 전환·모바일·세이브 격리를 유지한다");

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
