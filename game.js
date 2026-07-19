(() => {
  "use strict";

  const SAVE_VERSION = 3;
  const SAVE_KEY = "pixelMine.save";
  const CORRUPT_SAVE_KEY = "pixelMine.corruptSave";
  const TAB_LEASE_KEY = "pixelMine.activeTab";
  const TAB_SESSION_KEY = "pixelMine.tabSession";
  const STORAGE_TEST_KEY = "pixelMine.storageTest";
  const SAVE_CODE_PREFIX = `PIXELMINE-V${SAVE_VERSION}:`;
  const AUTOSAVE_INTERVAL_MS = 15_000;
  const MUTATION_SAVE_DELAY_MS = 800;
  const GAME_TICK_MS = 250;
  const TAB_HEARTBEAT_MS = 2_000;
  const TAB_LEASE_MS = 6_000;
  const OFFLINE_CAP_MS = 24 * 60 * 60 * 1_000;
  const MIN_OFFLINE_REPORT_MS = 5_000;
  const MAX_SAFE_VALUE = 9_000_000_000_000_000;
  const MAX_SAVE_CODE_LENGTH = 200_000;
  const MAX_VISIBLE_TOASTS = 3;
  const TOAST_DURATION_MS = 3_600;
  const BACKGROUND_MUSIC_VOLUME = 0.22;
  const ORE_MILESTONE_UPGRADE_ID = "ore_milestone";

  const ORE_DEFINITIONS = Object.freeze([
    {
      id: "coal",
      name: "석탄",
      englishName: "COAL",
      description: "빛을 삼키는 검은 탄층. 픽셀 광산의 첫 연료입니다.",
      unlockCost: 0,
      palette: {
        outline: "#080b0e",
        base: "#15191d",
        baseAlt: "#252b31",
        shadow: "#050708",
        deposit: "#465059",
        accent: "#7d8991",
        highlight: "#d6dde0",
        stage: "#10151a",
        wall: "#313a43",
        contrast: "#f3e7c5",
      },
    },
    {
      id: "bronze",
      name: "브론즈",
      englishName: "BRONZE",
      description: "암반 사이로 붉은 갈색 금속빛이 흐르는 따뜻한 광맥입니다.",
      unlockCost: 250_000,
      palette: {
        outline: "#21150f",
        base: "#3b2b24",
        baseAlt: "#604433",
        shadow: "#211711",
        deposit: "#9a552e",
        accent: "#d38148",
        highlight: "#f3c281",
        stage: "#231813",
        wall: "#6b4230",
        contrast: "#fff1d6",
      },
    },
    {
      id: "iron",
      name: "철",
      englishName: "IRON",
      description: "차갑고 단단한 은회색 결정이 층층이 박힌 산업의 광맥입니다.",
      unlockCost: 5_000_000,
      palette: {
        outline: "#151b22",
        base: "#323d47",
        baseAlt: "#4f5c65",
        shadow: "#1e2730",
        deposit: "#83909a",
        accent: "#c1cbd1",
        highlight: "#f2f5f4",
        stage: "#202830",
        wall: "#52616d",
        contrast: "#17202a",
      },
    },
    {
      id: "gold",
      name: "금",
      englishName: "GOLD",
      description: "어두운 암반을 가르는 황금빛 결이 선명하게 반짝이는 광맥입니다.",
      unlockCost: 30_000_000,
      palette: {
        outline: "#21180a",
        base: "#44371f",
        baseAlt: "#65502b",
        shadow: "#2d2415",
        deposit: "#c78e22",
        accent: "#f2c64d",
        highlight: "#fff1a6",
        stage: "#241c0e",
        wall: "#6d5729",
        contrast: "#17202a",
      },
    },
    {
      id: "ruby",
      name: "루비",
      englishName: "RUBY",
      description: "깊은 붉은 결정이 맥박치듯 빛나는 고열의 보석 광맥입니다.",
      unlockCost: 400_000_000,
      palette: {
        outline: "#210b13",
        base: "#481627",
        baseAlt: "#76213a",
        shadow: "#2d0d18",
        deposit: "#bd2850",
        accent: "#f34f72",
        highlight: "#ffd0d9",
        stage: "#200b14",
        wall: "#70233a",
        contrast: "#f3e7c5",
      },
    },
    {
      id: "diamond",
      name: "다이아",
      englishName: "DIAMOND",
      description: "청백색 결정면이 별빛처럼 갈라지는 최심부의 희귀 광맥입니다.",
      unlockCost: 12_500_000_000,
      palette: {
        outline: "#071a24",
        base: "#12394b",
        baseAlt: "#1f6074",
        shadow: "#0a2632",
        deposit: "#38bdd3",
        accent: "#87eff5",
        highlight: "#f6ffff",
        stage: "#071f2a",
        wall: "#21566b",
        contrast: "#17202a",
      },
    },
  ]);

  const UPGRADE_DEFINITIONS = Object.freeze([
    {
      id: "worn_pickaxe",
      icon: "P1",
      name: "낡은 곡괭이",
      description: "손에 익은 곡괭이로 한 번에 더 캡니다.",
      type: "click",
      effectPerLevel: 1,
      baseCost: 10,
      costGrowth: 1.45,
      maxLevel: 100,
    },
    {
      id: "steel_pickaxe",
      icon: "P2",
      name: "강철 곡괭이",
      description: "단단한 광맥을 깨는 강철 장비입니다.",
      type: "click",
      effectPerLevel: 5,
      baseCost: 75,
      costGrowth: 1.55,
      maxLevel: 75,
    },
    {
      id: "miner",
      icon: "M",
      name: "광부 고용",
      description: "쉬지 않고 광석을 캐는 동료입니다.",
      type: "auto",
      effectPerLevel: 0.5,
      baseCost: 25,
      costGrowth: 1.5,
      maxLevel: 100,
    },
    {
      id: "mine_cart",
      icon: "C",
      name: "광산 수레",
      description: "채굴한 광석을 빠르게 운반합니다.",
      type: "auto",
      effectPerLevel: 5,
      baseCost: 180,
      costGrowth: 1.58,
      maxLevel: 100,
    },
    {
      id: "auto_drill",
      icon: "D",
      name: "자동 드릴",
      description: "두꺼운 암반을 자동으로 뚫습니다.",
      type: "auto",
      effectPerLevel: 30,
      baseCost: 1_200,
      costGrowth: 1.65,
      maxLevel: 75,
    },
    {
      id: "crystal_core",
      icon: "◆",
      name: "수정 코어",
      description: "광산 전체에 고출력 채굴 에너지를 공급합니다.",
      type: "auto",
      effectPerLevel: 200,
      baseCost: 10_000,
      costGrowth: 1.72,
      maxLevel: 50,
    },
    {
      id: ORE_MILESTONE_UPGRADE_ID,
      icon: "O+",
      name: "광맥 개척",
      description: "마일스톤마다 새 광맥 외형과 광물 도감 항목을 해금합니다.",
      type: "milestone",
      costs: Object.freeze(ORE_DEFINITIONS.slice(1).map((ore) => ore.unlockCost)),
      maxLevel: ORE_DEFINITIONS.length - 1,
    },
  ]);

  const ACHIEVEMENT_DEFINITIONS = Object.freeze([
    {
      id: "first_click",
      name: "첫 곡괭이질",
      description: "광맥을 처음 클릭한다.",
      condition: (data) => data.totalClicks >= 1,
    },
    {
      id: "click_100",
      name: "손에 익은 채굴",
      description: "광맥을 100번 클릭한다.",
      condition: (data) => data.totalClicks >= 100,
    },
    {
      id: "ore_100",
      name: "광석 수집가",
      description: "누적 광석 100개를 채굴한다.",
      condition: (data) => data.totalCurrencyEarned >= 100,
    },
    {
      id: "ore_10000",
      name: "광맥의 주인",
      description: "누적 광석 10,000개를 채굴한다.",
      condition: (data) => data.totalCurrencyEarned >= 10_000,
    },
    {
      id: "first_miner",
      name: "첫 동료",
      description: "광부를 처음 고용한다.",
      condition: (data) => data.upgrades.miner >= 1,
    },
    {
      id: "drill_online",
      name: "기계의 힘",
      description: "자동 드릴을 가동한다.",
      condition: (data) => data.upgrades.auto_drill >= 1,
    },
    {
      id: "auto_100",
      name: "자동화 시대",
      description: "초당 자동 생산량 100을 달성한다.",
      condition: (data) => calculateAutoRate(data) >= 100,
    },
    {
      id: "all_upgrades",
      name: "완성된 광산",
      description: "모든 업그레이드를 하나 이상 보유한다.",
      condition: (data) => UPGRADE_DEFINITIONS.every((upgrade) => data.upgrades[upgrade.id] >= 1),
    },
    {
      id: "discover_bronze",
      name: "청동빛 발견",
      description: "브론즈 광맥을 발견한다.",
      condition: (data) => data.upgrades[ORE_MILESTONE_UPGRADE_ID] >= 1,
    },
    {
      id: "discover_iron",
      name: "강철의 토대",
      description: "철 광맥을 발견한다.",
      condition: (data) => data.upgrades[ORE_MILESTONE_UPGRADE_ID] >= 2,
    },
    {
      id: "discover_gold",
      name: "황금의 맥",
      description: "금 광맥을 발견한다.",
      condition: (data) => data.upgrades[ORE_MILESTONE_UPGRADE_ID] >= 3,
    },
    {
      id: "discover_ruby",
      name: "붉은 심장",
      description: "루비 광맥을 발견한다.",
      condition: (data) => data.upgrades[ORE_MILESTONE_UPGRADE_ID] >= 4,
    },
    {
      id: "discover_diamond",
      name: "최심부의 별",
      description: "다이아 광맥을 발견한다.",
      condition: (data) => data.upgrades[ORE_MILESTONE_UPGRADE_ID] >= 5,
    },
  ]);

  const MIGRATIONS = Object.freeze({
    0: (payload) => {
      const now = Date.now();
      const legacy = isPlainObject(payload.data) ? payload.data : payload;
      const next = createDefaultData(now);

      if (typeof legacy.currency === "number") next.currency = legacy.currency;
      if (typeof legacy.coins === "number") next.currency = legacy.coins;
      if (typeof legacy.totalCurrencyEarned === "number") next.totalCurrencyEarned = legacy.totalCurrencyEarned;
      if (typeof legacy.totalClicks === "number") next.totalClicks = legacy.totalClicks;
      if (isPlainObject(legacy.upgrades)) next.upgrades = { ...next.upgrades, ...legacy.upgrades };
      if (isPlainObject(legacy.unlockedAchievements)) next.unlockedAchievements = legacy.unlockedAchievements;
      if (typeof legacy.lastProcessedAt === "number") next.lastProcessedAt = legacy.lastProcessedAt;

      return {
        version: 1,
        meta: { app: "PIXEL_MINE", label: "픽셀 광산" },
        data: next,
      };
    },
    1: (payload) => {
      if (!isPlainObject(payload.data)) throw new SaveValidationError("v1 data 객체가 없습니다.");
      const upgrades = isPlainObject(payload.data.upgrades) ? { ...payload.data.upgrades } : {};
      if (upgrades[ORE_MILESTONE_UPGRADE_ID] === undefined) upgrades[ORE_MILESTONE_UPGRADE_ID] = 0;

      return {
        version: 2,
        meta: isPlainObject(payload.meta) ? payload.meta : { app: "PIXEL_MINE", label: "픽셀 광산" },
        data: {
          ...payload.data,
          upgrades,
        },
      };
    },
    2: (payload) => {
      if (!isPlainObject(payload.data)) throw new SaveValidationError("v2 data 객체가 없습니다.");
      const upgrades = isPlainObject(payload.data.upgrades) ? payload.data.upgrades : {};
      const rawLevel = upgrades[ORE_MILESTONE_UPGRADE_ID];
      const oreIndex = Number.isInteger(rawLevel)
        ? Math.min(ORE_DEFINITIONS.length - 1, Math.max(0, rawLevel))
        : 0;

      return {
        version: 3,
        meta: isPlainObject(payload.meta) ? payload.meta : { app: "PIXEL_MINE", label: "픽셀 광산" },
        data: {
          ...payload.data,
          selectedOreId: ORE_DEFINITIONS[oreIndex].id,
        },
      };
    },
  });

  class SaveValidationError extends Error {}
  class FutureSaveVersionError extends SaveValidationError {}

  const tabSessionId = createTabSessionId();
  const tabId = createRandomId("instance");
  const upgradeElements = new Map();
  const achievementElements = new Map();
  const mineralElements = new Map();
  const toastEntries = new Map();
  const storageState = {
    available: false,
    readError: null,
    writeError: null,
    persistence: "checking",
    persistenceMessage: "확인 중",
    usageMessage: "확인 중",
    lockAvailable: false,
  };

  let dom = {};
  let state = null;
  let sessionStarted = false;
  let sessionBlocked = false;
  let importContext = "inGame";
  let pendingStartImport = null;
  let pageIsHiding = false;
  let gameTickTimer = null;
  let autosaveTimer = null;
  let mutationSaveTimer = null;
  let tabHeartbeatTimer = null;
  let lastRenderAt = 0;
  let purchaseMode = "one";

  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    cacheDom();
    configureBackgroundMusic();
    bindEvents();
    drawOreSprite();
    prepareProtocolGate();
    void inspectPersistenceStatus();
  }

  function cacheDom() {
    const ids = [
      "startOverlay",
      "startTitle",
      "protocolStatus",
      "startStatus",
      "startButton",
      "startStorageDialog",
      "startDialogStatus",
      "confirmStartButton",
      "startImportButton",
      "gameApp",
      "sessionWarning",
      "saveIndicator",
      "manualSaveButton",
      "mineralCatalogMenuButton",
      "mineralCatalogMenuBadge",
      "achievementsMenuButton",
      "achievementMenuBadge",
      "saveMenuButton",
      "backgroundMusic",
      "musicToggle",
      "musicStatus",
      "currencyValue",
      "perClickValue",
      "perSecondValue",
      "totalEarnedValue",
      "totalClicksValue",
      "offlineEarnedValue",
      "mineSection",
      "mineStage",
      "mineShaftEyebrow",
      "currentOreBadge",
      "currentOreStageLabel",
      "currentOreName",
      "mineButton",
      "mineButtonLabel",
      "mineGainLabel",
      "oreCanvas",
      "upgradeList",
      "mineralCatalogList",
      "mineralCatalogCount",
      "achievementList",
      "achievementCount",
      "localStorageStatus",
      "persistenceStatus",
      "storageUsage",
      "saveSize",
      "lastSavedValue",
      "persistenceButton",
      "exportButton",
      "importOpenButton",
      "resetOpenButton",
      "reducedMotionToggle",
      "toastRegion",
      "mineralCatalogDialog",
      "achievementsDialog",
      "saveManagementDialog",
      "offlineDialog",
      "offlineDuration",
      "offlineReward",
      "exportDialog",
      "exportCode",
      "copyStatus",
      "copyExportButton",
      "importDialog",
      "importDialogDescription",
      "importCode",
      "importStatus",
      "confirmImportButton",
      "resetDialog",
      "resetConfirm",
      "resetStatus",
      "confirmResetButton",
    ];

    dom = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
    dom.purchaseModeButtons = [...document.querySelectorAll("[data-purchase-mode]")];
  }

  function configureBackgroundMusic() {
    dom.backgroundMusic.volume = BACKGROUND_MUSIC_VOLUME;
    dom.backgroundMusic.loop = true;
    dom.backgroundMusic.addEventListener("error", handleBackgroundMusicError);
  }

  function bindEvents() {
    dom.startButton.addEventListener("click", openStartStorageDialog);
    dom.confirmStartButton.addEventListener("click", handleStart);
    dom.startImportButton.addEventListener("click", () => openImportDialog("start"));
    dom.mineButton.addEventListener("click", handleMineClick);
    dom.purchaseModeButtons.forEach((button) => {
      button.addEventListener("click", () => setPurchaseMode(button.dataset.purchaseMode));
    });
    dom.manualSaveButton.addEventListener("click", () => {
      const saved = saveGame("수동 저장");
      showToast(saved ? "현재 진행도를 저장했습니다." : "로컬 저장에 실패했습니다.", {
        error: !saved,
        key: saved ? "save:manual-success" : "save:manual-error",
      });
      void refreshStorageEstimate();
    });
    dom.mineralCatalogMenuButton.addEventListener("click", () => {
      renderMineralCatalog();
      openDialog(dom.mineralCatalogDialog);
    });
    dom.achievementsMenuButton.addEventListener("click", () => {
      renderAchievements();
      openDialog(dom.achievementsDialog);
    });
    dom.saveMenuButton.addEventListener("click", () => {
      renderSaveDetails();
      openDialog(dom.saveManagementDialog);
      void refreshStorageEstimate();
    });
    dom.persistenceButton.addEventListener("click", () => {
      void requestPersistenceFromGesture(false);
    });
    dom.exportButton.addEventListener("click", openExportDialog);
    dom.copyExportButton.addEventListener("click", copyExportCode);
    dom.importOpenButton.addEventListener("click", () => openImportDialog("inGame"));
    dom.confirmImportButton.addEventListener("click", importSaveCode);
    dom.resetOpenButton.addEventListener("click", openResetDialog);
    dom.resetConfirm.addEventListener("change", () => {
      dom.confirmResetButton.disabled = !dom.resetConfirm.checked;
    });
    dom.confirmResetButton.addEventListener("click", resetGame);
    dom.musicToggle.addEventListener("change", handleMusicSetting);
    dom.reducedMotionToggle.addEventListener("change", handleMotionSetting);

    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog)));
    });

    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
      dialog.addEventListener("close", () => syncDialogTrigger(dialog, false));
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("storage", handleStorageEvent);
  }

  function prepareProtocolGate() {
    const supported = isSupportedProtocol();
    const protocolName = window.location.protocol.replace(":", "").toUpperCase();

    if (supported) {
      const secureLabel = window.isSecureContext ? "보안 컨텍스트" : "일반 컨텍스트";
      dom.protocolStatus.textContent = `${protocolName} · ${secureLabel}`;
      dom.protocolStatus.classList.add("is-good");
      dom.startButton.disabled = false;
      return;
    }

    dom.protocolStatus.textContent = `${protocolName || "UNKNOWN"} · 실행 불가`;
    dom.protocolStatus.classList.add("is-bad");
    dom.startStatus.textContent = "이 게임은 HTTP/HTTPS에서 실행해야 합니다. 이 폴더에서 python3 -m http.server 8000을 실행한 뒤 http://localhost:8000으로 접속하세요.";
    dom.startStatus.classList.add("is-error");
    dom.startButton.disabled = true;
  }

  function isSupportedProtocol() {
    return window.location.protocol === "http:" || window.location.protocol === "https:";
  }

  function openStartStorageDialog() {
    if (!isSupportedProtocol()) return;
    if (pendingStartImport) {
      setStartDialogStatus("불러온 세이브가 준비되었습니다. 게임 시작을 누르면 안전하게 적용합니다.", false);
      dom.confirmStartButton.textContent = "불러온 세이브로 게임 시작";
    } else if (!sessionBlocked) {
      setStartDialogStatus("기존 로컬 세이브는 게임 시작 시 자동으로 확인합니다.", false);
      dom.confirmStartButton.textContent = "게임 시작";
    }
    openDialog(dom.startStorageDialog);
  }

  function handleStart() {
    if (!isSupportedProtocol() || sessionStarted) return;

    dom.confirmStartButton.disabled = true;
    setStartDialogStatus("로컬 저장소와 기존 광산을 확인하는 중입니다...", false);

    const persistenceRequest = requestPersistenceFromGesture(true);
    probeLocalStorage();

    if (!acquireTabLease()) {
      setStartDialogStatus("다른 탭에서 PIXEL MINE이 실행 중입니다. 기존 탭을 닫고 잠시 후 다시 시도하세요.", true);
      dom.confirmStartButton.textContent = "탭 상태 다시 확인";
      dom.confirmStartButton.disabled = false;
      void persistenceRequest;
      return;
    }

    const loadResult = pendingStartImport
      ? { data: pendingStartImport, warning: "불러온 세이브로 광산을 시작했습니다.", isError: false }
      : loadGameState();
    pendingStartImport = null;
    state = loadResult.data;
    sessionStarted = true;
    sessionBlocked = false;

    const offlineResult = advanceDataTo(state, Date.now(), true);
    applyMotionSetting();
    applyMusicSetting({ attemptPlayback: true, notifyBlocked: true });
    buildUpgradeCards();
    buildMineralCatalogCards();
    buildAchievementCards();
    evaluateAchievements(true);
    renderAll();

    closeDialog(dom.startStorageDialog);
    dom.startOverlay.classList.add("is-hidden");
    dom.gameApp.classList.remove("is-hidden");
    dom.gameApp.setAttribute("aria-hidden", "false");

    if (!storageState.available) {
      setSessionWarning("로컬 저장소를 사용할 수 없어 현재 진행은 메모리에만 유지됩니다. 탭을 닫으면 사라질 수 있습니다.");
    } else if (!storageState.lockAvailable) {
      setSessionWarning("다중 탭 잠금을 확인할 수 없습니다. PIXEL MINE은 한 탭에서만 실행해주세요.");
    } else {
      clearSessionWarning();
    }

    saveGame("게임 시작", false);
    startSessionTimers();
    void refreshStorageEstimate();
    void persistenceRequest;

    if (loadResult.warning) showToast(loadResult.warning, { error: loadResult.isError });
    if (shouldShowOfflineReward(offlineResult)) showOfflineReward(offlineResult);

    dom.confirmStartButton.disabled = false;
    dom.confirmStartButton.textContent = "게임 시작";
    window.setTimeout(() => dom.mineButton.focus(), 80);
  }

  function createDefaultData(now = Date.now()) {
    return {
      currency: 0,
      totalCurrencyEarned: 0,
      totalClicks: 0,
      upgrades: Object.fromEntries(UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, 0])),
      selectedOreId: ORE_DEFINITIONS[0].id,
      unlockedAchievements: {},
      stats: {
        playTimeMs: 0,
        offlineEarned: 0,
      },
      settings: {
        musicEnabled: true,
        reducedMotion: false,
      },
      lastProcessedAt: now,
      lastSavedAt: 0,
    };
  }

  function createSavePayload(touchSaveTime = false) {
    if (!state) throw new Error("게임 상태가 준비되지 않았습니다.");
    if (touchSaveTime) state.lastSavedAt = Date.now();

    return {
      version: SAVE_VERSION,
      meta: {
        app: "PIXEL_MINE",
        label: "픽셀 광산",
      },
      data: serializeData(state),
    };
  }

  function serializeData(data) {
    return {
      currency: data.currency,
      totalCurrencyEarned: data.totalCurrencyEarned,
      totalClicks: data.totalClicks,
      upgrades: Object.fromEntries(UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, data.upgrades[upgrade.id]])),
      selectedOreId: data.selectedOreId,
      unlockedAchievements: { ...data.unlockedAchievements },
      stats: {
        playTimeMs: data.stats.playTimeMs,
        offlineEarned: data.stats.offlineEarned,
      },
      settings: {
        musicEnabled: data.settings.musicEnabled,
        reducedMotion: data.settings.reducedMotion,
      },
      lastProcessedAt: data.lastProcessedAt,
      lastSavedAt: data.lastSavedAt,
    };
  }

  function loadGameState() {
    const fresh = createDefaultData();
    if (!storageState.available) {
      return {
        data: fresh,
        warning: "저장소를 사용할 수 없어 새 메모리 게임을 시작했습니다.",
        isError: true,
      };
    }

    const raw = safeGetItem(SAVE_KEY);
    if (raw === null) {
      if (storageState.readError) {
        return {
          data: fresh,
          warning: "저장 데이터를 읽지 못해 새 게임으로 시작했습니다.",
          isError: true,
        };
      }
      return { data: fresh, warning: "새 광산을 만들었습니다.", isError: false };
    }

    try {
      const parsed = JSON.parse(raw);
      const migrated = migratePayload(parsed);
      return { data: validateSaveData(migrated.data), warning: "저장된 광산을 불러왔습니다.", isError: false };
    } catch (error) {
      const quarantined = quarantineCorruptSave(raw, error);
      return {
        data: fresh,
        warning: quarantined
          ? "손상된 저장을 복구 키에 격리하고 새 게임으로 시작했습니다."
          : "손상된 저장을 발견했지만 복구 키 보존에 실패해 새 게임으로 시작했습니다.",
        isError: true,
      };
    }
  }

  function migratePayload(input) {
    if (!isPlainObject(input)) throw new SaveValidationError("저장 루트가 객체가 아닙니다.");

    let current = input;
    let version = Number.isInteger(current.version) ? current.version : 0;

    if (version < 0) throw new SaveValidationError("저장 버전이 올바르지 않습니다.");
    if (version > SAVE_VERSION) {
      throw new FutureSaveVersionError(`현재 앱보다 새로운 저장 버전(${version})입니다.`);
    }

    while (version < SAVE_VERSION) {
      const migration = MIGRATIONS[version];
      if (typeof migration !== "function") {
        throw new SaveValidationError(`버전 ${version} 마이그레이션을 찾을 수 없습니다.`);
      }
      current = migration(current);
      version = current.version;
    }

    if (current.version !== SAVE_VERSION || !isPlainObject(current.data)) {
      throw new SaveValidationError("저장 데이터 버전 또는 구조가 올바르지 않습니다.");
    }
    if (current.meta && current.meta.app && current.meta.app !== "PIXEL_MINE") {
      throw new SaveValidationError("PIXEL MINE 세이브 코드가 아닙니다.");
    }
    return current;
  }

  function validateSaveData(input) {
    if (!isPlainObject(input)) throw new SaveValidationError("data 객체가 없습니다.");
    if (!isPlainObject(input.upgrades)) throw new SaveValidationError("upgrades 객체가 없습니다.");
    if (!isPlainObject(input.unlockedAchievements)) throw new SaveValidationError("업적 객체가 없습니다.");
    if (!isPlainObject(input.stats)) throw new SaveValidationError("stats 객체가 없습니다.");
    if (!isPlainObject(input.settings)) throw new SaveValidationError("settings 객체가 없습니다.");

    const upgrades = {};
    for (const definition of UPGRADE_DEFINITIONS) {
      upgrades[definition.id] = validatedNumber(
        input.upgrades[definition.id] ?? 0,
        `업그레이드 ${definition.id}`,
        definition.maxLevel,
        true,
      );
    }

    const highestUnlockedOreIndex = upgrades[ORE_MILESTONE_UPGRADE_ID];
    const fallbackOreId = ORE_DEFINITIONS[highestUnlockedOreIndex].id;
    const selectedOreId = input.selectedOreId ?? fallbackOreId;
    if (typeof selectedOreId !== "string") {
      throw new SaveValidationError("선택 광맥 ID가 문자열이 아닙니다.");
    }
    const selectedOreIndex = ORE_DEFINITIONS.findIndex((ore) => ore.id === selectedOreId);
    if (selectedOreIndex < 0 || selectedOreIndex > highestUnlockedOreIndex) {
      throw new SaveValidationError("선택 광맥이 존재하지 않거나 아직 발견되지 않았습니다.");
    }

    const achievements = {};
    const knownAchievementIds = new Set(ACHIEVEMENT_DEFINITIONS.map((achievement) => achievement.id));
    for (const [id, unlockedAt] of Object.entries(input.unlockedAchievements)) {
      if (!knownAchievementIds.has(id)) continue;
      achievements[id] = validatedNumber(unlockedAt, `업적 ${id} 해금 시각`, Number.MAX_SAFE_INTEGER, true);
    }

    const musicEnabled = input.settings.musicEnabled ?? true;
    if (typeof musicEnabled !== "boolean") {
      throw new SaveValidationError("배경음악 설정이 올바르지 않습니다.");
    }
    if (typeof input.settings.reducedMotion !== "boolean") {
      throw new SaveValidationError("모션 감소 설정이 올바르지 않습니다.");
    }

    return {
      currency: validatedNumber(input.currency, "보유 광석"),
      totalCurrencyEarned: validatedNumber(input.totalCurrencyEarned, "누적 광석"),
      totalClicks: validatedNumber(input.totalClicks, "총 클릭", MAX_SAFE_VALUE, true),
      upgrades,
      selectedOreId,
      unlockedAchievements: achievements,
      stats: {
        playTimeMs: validatedNumber(input.stats.playTimeMs, "플레이 시간"),
        offlineEarned: validatedNumber(input.stats.offlineEarned, "오프라인 누적 광석"),
      },
      settings: {
        musicEnabled,
        reducedMotion: input.settings.reducedMotion,
      },
      lastProcessedAt: validatedNumber(input.lastProcessedAt, "마지막 처리 시각", Number.MAX_SAFE_INTEGER, true),
      lastSavedAt: validatedNumber(input.lastSavedAt, "마지막 저장 시각", Number.MAX_SAFE_INTEGER, true),
    };
  }

  function validatedNumber(value, label, max = MAX_SAFE_VALUE, integer = false) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
      throw new SaveValidationError(`${label} 값이 허용 범위를 벗어났습니다.`);
    }
    if (integer && !Number.isInteger(value)) {
      throw new SaveValidationError(`${label} 값은 정수여야 합니다.`);
    }
    return value;
  }

  function quarantineCorruptSave(raw, error) {
    const record = JSON.stringify({
      capturedAt: Date.now(),
      reason: error instanceof Error ? error.message : String(error),
      raw,
    });
    return safeSetItem(CORRUPT_SAVE_KEY, record);
  }

  function saveGame(reason = "자동 저장", processElapsed = true) {
    if (!sessionStarted || !state) return false;
    if (processElapsed) advanceDataTo(state, Date.now(), false);

    if (!storageState.available) {
      updateSaveIndicator("메모리 플레이 중", true);
      renderSaveDetails();
      return false;
    }

    const previousSavedAt = state.lastSavedAt;
    const payload = createSavePayload(true);
    const raw = JSON.stringify(payload);
    const saved = safeSetItem(SAVE_KEY, raw);

    if (saved) {
      updateSaveIndicator(reason, false);
      updateSaveSize(raw);
      renderSaveDetails();
      return true;
    }

    state.lastSavedAt = previousSavedAt;
    updateSaveIndicator("저장 실패", true);
    setSessionWarning("로컬 저장에 실패했습니다. 세이브 코드를 내보내고 브라우저 저장소 설정과 여유 공간을 확인하세요.");
    renderSaveDetails();
    return false;
  }

  function scheduleMutationSave() {
    if (!sessionStarted) return;
    window.clearTimeout(mutationSaveTimer);
    mutationSaveTimer = window.setTimeout(() => saveGame("변경 저장"), MUTATION_SAVE_DELAY_MS);
  }

  function probeLocalStorage() {
    storageState.readError = null;
    storageState.writeError = null;
    try {
      window.localStorage.setItem(STORAGE_TEST_KEY, "1");
      window.localStorage.removeItem(STORAGE_TEST_KEY);
      storageState.available = true;
    } catch (error) {
      storageState.available = false;
      storageState.writeError = error;
    }
    renderSaveDetails();
    return storageState.available;
  }

  function safeGetItem(key) {
    if (!storageState.available) return null;
    storageState.readError = null;
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      storageState.readError = error;
      return null;
    }
  }

  function safeSetItem(key, value) {
    if (!storageState.available) return false;
    storageState.writeError = null;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      storageState.writeError = error;
      return false;
    }
  }

  function safeRemoveItem(key) {
    if (!storageState.available) return false;
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      storageState.writeError = error;
      return false;
    }
  }

  function acquireTabLease() {
    if (!storageState.available) {
      storageState.lockAvailable = false;
      return true;
    }

    const now = Date.now();
    let currentLease = null;
    try {
      const raw = window.localStorage.getItem(TAB_LEASE_KEY);
      if (raw) currentLease = JSON.parse(raw);
    } catch {
      currentLease = null;
    }

    if (
      isPlainObject(currentLease) &&
      currentLease.id !== tabId &&
      currentLease.sessionId !== tabSessionId &&
      typeof currentLease.expiresAt === "number" &&
      currentLease.expiresAt > now
    ) {
      storageState.lockAvailable = true;
      return false;
    }

    const lease = JSON.stringify({ id: tabId, sessionId: tabSessionId, expiresAt: now + TAB_LEASE_MS });
    if (!safeSetItem(TAB_LEASE_KEY, lease)) {
      storageState.lockAvailable = false;
      return true;
    }

    try {
      const verification = JSON.parse(window.localStorage.getItem(TAB_LEASE_KEY));
      storageState.lockAvailable = verification.id === tabId;
      return storageState.lockAvailable;
    } catch {
      storageState.lockAvailable = false;
      return true;
    }
  }

  function refreshTabLease() {
    if (!sessionStarted || sessionBlocked || !storageState.available || !storageState.lockAvailable) return;
    try {
      const raw = window.localStorage.getItem(TAB_LEASE_KEY);
      const current = raw ? JSON.parse(raw) : null;
      if (
        current &&
        current.id !== tabId &&
        current.sessionId !== tabSessionId &&
        current.expiresAt > Date.now()
      ) {
        handleTabConflict();
        return;
      }
    } catch {
      storageState.lockAvailable = false;
      setSessionWarning("다중 탭 잠금 상태를 읽을 수 없습니다. 다른 탭에서 게임을 열지 마세요.");
      return;
    }
    const lease = JSON.stringify({ id: tabId, sessionId: tabSessionId, expiresAt: Date.now() + TAB_LEASE_MS });
    if (!safeSetItem(TAB_LEASE_KEY, lease)) {
      storageState.lockAvailable = false;
      setSessionWarning("다중 탭 잠금 갱신에 실패했습니다. 다른 탭에서 게임을 열지 마세요.");
    }
  }

  function releaseTabLease() {
    window.clearInterval(tabHeartbeatTimer);
    tabHeartbeatTimer = null;
    if (!storageState.available || !storageState.lockAvailable) return;
    try {
      const raw = window.localStorage.getItem(TAB_LEASE_KEY);
      const lease = raw ? JSON.parse(raw) : null;
      if (lease && lease.id === tabId) window.localStorage.removeItem(TAB_LEASE_KEY);
    } catch {
      // 브라우저가 페이지 종료 중 저장소 접근을 차단할 수 있으므로 무시한다.
    }
  }

  function handleStorageEvent(event) {
    if (!sessionStarted || event.key !== TAB_LEASE_KEY || !event.newValue) return;
    try {
      const lease = JSON.parse(event.newValue);
      if (lease.id !== tabId && lease.expiresAt > Date.now()) handleTabConflict();
    } catch {
      // 잘못된 외부 lock 값은 다음 heartbeat에서 덮어쓴다.
    }
  }

  function handleTabConflict() {
    if (sessionBlocked) return;
    sessionBlocked = true;
    sessionStarted = false;
    stopSessionTimers();
    pauseBackgroundMusic("일시 정지 · 다른 탭에서 실행 중입니다.");
    dom.gameApp.classList.add("is-hidden");
    dom.gameApp.setAttribute("aria-hidden", "true");
    dom.startOverlay.classList.remove("is-hidden");
    dom.startStatus.textContent = "다른 탭이 활성 플레이 권한을 가져갔습니다. 진행도 충돌을 막기 위해 이 탭을 중지했습니다. 다른 탭을 닫고 다시 확인하세요.";
    dom.startStatus.classList.add("is-error");
    dom.startButton.disabled = false;
    document.querySelectorAll("dialog[open]").forEach((dialog) => closeDialog(dialog));
    setStartDialogStatus("다른 탭에서 PIXEL MINE이 실행 중입니다. 기존 탭을 닫고 잠시 후 다시 시도하세요.", true);
    dom.confirmStartButton.textContent = "탭 상태 다시 확인";
    dom.confirmStartButton.disabled = false;
    openDialog(dom.startStorageDialog);
  }

  function startSessionTimers() {
    stopSessionTimers();
    gameTickTimer = window.setInterval(gameTick, GAME_TICK_MS);
    autosaveTimer = window.setInterval(() => saveGame("자동 저장"), AUTOSAVE_INTERVAL_MS);
    if (storageState.lockAvailable) {
      tabHeartbeatTimer = window.setInterval(refreshTabLease, TAB_HEARTBEAT_MS);
    }
  }

  function stopSessionTimers() {
    window.clearInterval(gameTickTimer);
    window.clearInterval(autosaveTimer);
    window.clearInterval(tabHeartbeatTimer);
    window.clearTimeout(mutationSaveTimer);
    gameTickTimer = null;
    autosaveTimer = null;
    tabHeartbeatTimer = null;
    mutationSaveTimer = null;
  }

  function gameTick() {
    if (!sessionStarted || sessionBlocked || !state) return;
    const result = advanceDataTo(state, Date.now(), false);
    if (!document.hidden && result.elapsedMs > 0) {
      state.stats.playTimeMs = safeAdd(state.stats.playTimeMs, result.elapsedMs);
    }

    const now = performance.now();
    if (now - lastRenderAt >= GAME_TICK_MS) {
      evaluateAchievements(true);
      renderGameValues();
      renderUpgrades();
      lastRenderAt = now;
    }
  }

  function advanceDataTo(data, now, countAsOffline) {
    const previous = data.lastProcessedAt;
    const rawElapsed = now - previous;

    if (!Number.isFinite(rawElapsed) || rawElapsed <= 0) {
      data.lastProcessedAt = now;
      return {
        elapsedMs: 0,
        reward: 0,
        wasCapped: false,
        clockReversed: rawElapsed < 0,
      };
    }

    const elapsedMs = Math.min(rawElapsed, OFFLINE_CAP_MS);
    const autoRate = calculateAutoRate(data);
    const reward = Math.min(MAX_SAFE_VALUE, autoRate * (elapsedMs / 1_000));

    if (reward > 0) {
      data.currency = safeAdd(data.currency, reward);
      data.totalCurrencyEarned = safeAdd(data.totalCurrencyEarned, reward);
      if (countAsOffline) data.stats.offlineEarned = safeAdd(data.stats.offlineEarned, reward);
    }

    data.lastProcessedAt = now;
    return {
      elapsedMs,
      reward,
      wasCapped: rawElapsed > OFFLINE_CAP_MS,
      clockReversed: false,
    };
  }

  function calculateClickPower(data = state) {
    if (!data) return 1;
    return 1 + UPGRADE_DEFINITIONS
      .filter((upgrade) => upgrade.type === "click")
      .reduce((total, upgrade) => total + data.upgrades[upgrade.id] * upgrade.effectPerLevel, 0);
  }

  function calculateAutoRate(data = state) {
    if (!data) return 0;
    return UPGRADE_DEFINITIONS
      .filter((upgrade) => upgrade.type === "auto")
      .reduce((total, upgrade) => total + data.upgrades[upgrade.id] * upgrade.effectPerLevel, 0);
  }

  function calculateUpgradeCost(definition, level) {
    if (Array.isArray(definition.costs)) {
      const fixedCost = definition.costs[level];
      return typeof fixedCost === "number" ? fixedCost : MAX_SAFE_VALUE;
    }
    const raw = definition.baseCost * Math.pow(definition.costGrowth, level);
    return Math.min(MAX_SAFE_VALUE, Math.max(1, Math.floor(raw)));
  }

  function getUnlockedOreIndex(data = state) {
    const level = data?.upgrades?.[ORE_MILESTONE_UPGRADE_ID] ?? 0;
    return Math.min(ORE_DEFINITIONS.length - 1, Math.max(0, Math.floor(level)));
  }

  function getSelectedOreIndex(data = state) {
    const unlockedIndex = getUnlockedOreIndex(data);
    const selectedIndex = ORE_DEFINITIONS.findIndex((ore) => ore.id === data?.selectedOreId);
    return selectedIndex >= 0 && selectedIndex <= unlockedIndex ? selectedIndex : unlockedIndex;
  }

  function calculateBulkPurchase(definition, level, currency, mode = purchaseMode) {
    const remainingLevels = Math.max(0, definition.maxLevel - level);
    const requestedCount = mode === "max"
      ? remainingLevels
      : Math.min(mode === "ten" ? 10 : 1, remainingLevels);
    let count = 0;
    let totalCost = 0;

    while (count < requestedCount) {
      const nextCost = calculateUpgradeCost(definition, level + count);
      if (nextCost > currency - totalCost) break;
      totalCost += nextCost;
      count += 1;
    }

    return {
      count,
      totalCost,
      requestedCount,
      nextCost: remainingLevels > 0 ? calculateUpgradeCost(definition, level) : 0,
    };
  }

  function setPurchaseMode(mode) {
    if (!["one", "ten", "max"].includes(mode)) return;
    purchaseMode = mode;
    dom.purchaseModeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.purchaseMode === mode));
    });
    renderUpgrades();
  }

  function getUpgradeEffectText(definition, level) {
    if (definition.type === "click") {
      return `레벨당 클릭 +${formatNumber(definition.effectPerLevel)}`;
    }
    if (definition.type === "auto") {
      return `레벨당 초당 +${formatNumber(definition.effectPerLevel)}`;
    }

    const nextOre = ORE_DEFINITIONS[level + 1];
    return nextOre
      ? `다음 마일스톤: ${nextOre.name} 광맥 · 도감 등록`
      : "6종 광물 발견 완료 · 외형은 도감에서 선택";
  }

  function handleMineClick() {
    if (!sessionStarted || sessionBlocked || !state) return;
    advanceDataTo(state, Date.now(), false);

    const gain = calculateClickPower();
    state.currency = safeAdd(state.currency, gain);
    state.totalCurrencyEarned = safeAdd(state.totalCurrencyEarned, gain);
    state.totalClicks = safeAdd(state.totalClicks, 1);

    evaluateAchievements(true);
    renderGameValues();
    renderUpgrades();
    animateMineGain(gain);
    scheduleMutationSave();
  }

  function purchaseUpgrade(id) {
    if (!sessionStarted || sessionBlocked || !state) return;
    const definition = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === id);
    if (!definition) return;

    advanceDataTo(state, Date.now(), false);
    const level = state.upgrades[id];
    if (level >= definition.maxLevel) return;
    const purchase = calculateBulkPurchase(definition, level, state.currency);
    if (purchase.count === 0) {
      showToast("광석이 부족합니다.", { error: true, key: "upgrade:insufficient-ore" });
      return;
    }

    state.currency = Math.max(0, state.currency - purchase.totalCost);
    state.upgrades[id] += purchase.count;
    const finalOre = definition.type === "milestone" ? ORE_DEFINITIONS[state.upgrades[id]] : null;
    if (finalOre) state.selectedOreId = finalOre.id;
    evaluateAchievements(true);
    renderAll();
    scheduleMutationSave();
    const message = finalOre
      ? purchase.count === 1
        ? `${finalOre.name} 광맥 해금 · 도감 등록`
        : `${finalOre.name} 광맥까지 ${purchase.count}단계 해금 · 도감 등록`
      : purchase.count === 1
        ? `${definition.name} 레벨 ${state.upgrades[id]} 달성`
        : `${definition.name} ${purchase.count}개 구매 · 레벨 ${state.upgrades[id]} 달성`;
    showToast(message, {
      key: `upgrade:${id}`,
      countMode: "purchase",
    });
  }

  function evaluateAchievements(announce) {
    if (!state) return [];
    const unlocked = [];
    const now = Date.now();

    for (const achievement of ACHIEVEMENT_DEFINITIONS) {
      if (state.unlockedAchievements[achievement.id]) continue;
      if (!achievement.condition(state)) continue;

      state.unlockedAchievements[achievement.id] = now;
      unlocked.push(achievement);
      if (announce) showToast(`업적 해금: ${achievement.name}`, { key: `achievement:${achievement.id}` });
    }

    if (unlocked.length > 0) {
      renderAchievements();
      scheduleMutationSave();
    }
    return unlocked;
  }

  function buildUpgradeCards() {
    dom.upgradeList.replaceChildren();
    upgradeElements.clear();

    for (const definition of UPGRADE_DEFINITIONS) {
      const card = document.createElement("article");
      card.className = "upgrade-card";
      card.dataset.upgradeId = definition.id;
      if (definition.type === "milestone") card.classList.add("upgrade-card--milestone");

      const icon = document.createElement("span");
      icon.className = "upgrade-icon";
      icon.textContent = definition.icon;
      icon.setAttribute("aria-hidden", "true");

      const info = document.createElement("div");
      info.className = "upgrade-info";
      const nameRow = document.createElement("div");
      nameRow.className = "upgrade-name-row";
      const name = document.createElement("h3");
      name.className = "upgrade-name";
      name.textContent = definition.name;
      const level = document.createElement("span");
      level.className = "upgrade-level";
      const description = document.createElement("p");
      description.className = "upgrade-description";
      description.textContent = definition.description;
      const effect = document.createElement("p");
      effect.className = "upgrade-effect";
      effect.textContent = getUpgradeEffectText(definition, 0);
      nameRow.append(name, level);
      info.append(nameRow, description, effect);

      const buyButton = document.createElement("button");
      buyButton.className = "pixel-button pixel-button--primary upgrade-buy";
      buyButton.type = "button";
      const buyLabel = document.createElement("span");
      buyLabel.textContent = "구매";
      const cost = document.createElement("span");
      cost.className = "upgrade-buy-cost";
      buyButton.append(buyLabel, cost);
      buyButton.addEventListener("click", () => purchaseUpgrade(definition.id));

      card.append(icon, info, buyButton);
      dom.upgradeList.append(card);
      upgradeElements.set(definition.id, { card, icon, level, effect, buyButton, buyLabel, cost });
    }
  }

  function buildMineralCatalogCards() {
    dom.mineralCatalogList.replaceChildren();
    mineralElements.clear();

    ORE_DEFINITIONS.forEach((definition, index) => {
      const card = document.createElement("article");
      card.className = "mineral-card";
      card.dataset.mineralId = definition.id;
      card.style.setProperty("--mineral-accent", definition.palette.accent);
      card.style.setProperty("--mineral-stage", definition.palette.stage);

      const preview = document.createElement("div");
      preview.className = "mineral-preview";
      preview.setAttribute("aria-hidden", "true");
      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      drawOreSprite(canvas, definition);
      preview.append(canvas);

      const body = document.createElement("div");
      body.className = "mineral-card-body";
      const heading = document.createElement("div");
      heading.className = "mineral-card-heading";
      const name = document.createElement("h3");
      name.textContent = definition.name;
      const stage = document.createElement("span");
      stage.className = "mineral-stage-number";
      stage.textContent = `STAGE ${String(index + 1).padStart(2, "0")}`;
      heading.append(name, stage);
      const description = document.createElement("p");
      description.className = "mineral-description";
      const status = document.createElement("span");
      status.className = "mineral-status";
      const selectButton = document.createElement("button");
      selectButton.className = "pixel-button pixel-button--small mineral-select-button";
      selectButton.type = "button";
      selectButton.addEventListener("click", () => selectOre(definition.id));
      body.append(heading, description, status, selectButton);

      card.append(preview, body);
      dom.mineralCatalogList.append(card);
      mineralElements.set(definition.id, { card, description, status, selectButton });
    });
  }

  function buildAchievementCards() {
    dom.achievementList.replaceChildren();
    achievementElements.clear();

    for (const definition of ACHIEVEMENT_DEFINITIONS) {
      const card = document.createElement("article");
      card.className = "achievement-card";
      const status = document.createElement("span");
      status.className = "achievement-state";
      const name = document.createElement("h3");
      name.className = "achievement-name";
      name.textContent = definition.name;
      const description = document.createElement("p");
      description.className = "achievement-description";
      description.textContent = definition.description;
      const time = document.createElement("p");
      time.className = "achievement-time";
      card.append(status, name, description, time);
      dom.achievementList.append(card);
      achievementElements.set(definition.id, { card, status, time });
    }
  }

  function renderOreProgression() {
    if (!state) return;
    const oreIndex = getSelectedOreIndex();
    const ore = ORE_DEFINITIONS[oreIndex];
    const stageNumber = String(oreIndex + 1).padStart(2, "0");

    dom.mineSection.dataset.ore = ore.id;
    dom.mineSection.style.setProperty("--mine-accent", ore.palette.accent);
    dom.mineSection.style.setProperty("--mine-secondary", ore.palette.baseAlt);
    dom.mineSection.style.setProperty("--mine-stage", ore.palette.stage);
    dom.mineSection.style.setProperty("--mine-wall", ore.palette.wall);
    dom.mineSection.style.setProperty("--mine-contrast", ore.palette.contrast);
    dom.mineShaftEyebrow.textContent = `MINE SHAFT ${stageNumber}`;
    dom.currentOreBadge.textContent = `${ore.name} · ${oreIndex + 1}/${ORE_DEFINITIONS.length}`;
    dom.currentOreStageLabel.textContent = `STAGE ${stageNumber}`;
    dom.currentOreName.textContent = ore.name;
    dom.mineButtonLabel.textContent = `${ore.name} 채굴`;
    dom.mineButton.setAttribute("aria-label", `${ore.name} 광맥을 채굴해 광석 획득`);
    dom.mineStage.setAttribute("aria-label", `현재 ${ore.name} 광맥, 전체 ${ORE_DEFINITIONS.length}단계 중 ${oreIndex + 1}단계`);
    drawOreSprite(dom.oreCanvas, ore);
  }

  function selectOre(id) {
    if (!sessionStarted || sessionBlocked || !state) return;
    const oreIndex = ORE_DEFINITIONS.findIndex((ore) => ore.id === id);
    if (oreIndex < 0 || oreIndex > getUnlockedOreIndex()) {
      showToast("아직 발견하지 않은 광맥입니다.", { error: true, key: "ore-select:locked" });
      return;
    }
    if (state.selectedOreId === id) return;

    state.selectedOreId = id;
    renderOreProgression();
    renderMineralCatalog();
    scheduleMutationSave();
    showToast(`${ORE_DEFINITIONS[oreIndex].name} 광맥 외형을 적용했습니다.`, { key: `ore-select:${id}` });
  }

  function renderMineralCatalog() {
    if (!state) return;
    const unlockedIndex = getUnlockedOreIndex();
    const selectedIndex = getSelectedOreIndex();

    ORE_DEFINITIONS.forEach((definition, index) => {
      const elements = mineralElements.get(definition.id);
      if (!elements) return;
      const unlocked = index <= unlockedIndex;
      const current = index === selectedIndex;
      elements.card.classList.toggle("is-unlocked", unlocked);
      elements.card.classList.toggle("is-current", current);
      elements.description.textContent = unlocked
        ? definition.description
        : `광맥 개척 STAGE ${String(index + 1).padStart(2, "0")}에서 발견 · ${formatNumber(definition.unlockCost)} 광석`;
      elements.status.textContent = current ? "CURRENT" : unlocked ? "DISCOVERED" : "LOCKED";
      elements.selectButton.disabled = !unlocked || current || sessionBlocked;
      elements.selectButton.textContent = current ? "적용 중" : unlocked ? "이 광맥 선택" : "미발견";
      elements.selectButton.setAttribute(
        "aria-label",
        current ? `${definition.name} 광맥 적용 중` : unlocked ? `${definition.name} 광맥 외형 선택` : `${definition.name} 광맥 미발견`,
      );
      elements.card.setAttribute(
        "aria-label",
        `${definition.name}, ${current ? "현재 광맥" : unlocked ? "발견 완료" : "미발견"}`,
      );
    });

    const discovered = unlockedIndex + 1;
    dom.mineralCatalogCount.textContent = `${discovered} / ${ORE_DEFINITIONS.length}`;
    dom.mineralCatalogMenuBadge.textContent = `${discovered}/${ORE_DEFINITIONS.length}`;
    dom.mineralCatalogMenuButton.setAttribute(
      "aria-label",
      `광물 도감 열기, ${discovered}/${ORE_DEFINITIONS.length} 발견`,
    );
  }

  function renderAll() {
    if (!state) return;
    renderGameValues();
    renderOreProgression();
    renderUpgrades();
    renderMineralCatalog();
    renderAchievements();
    renderSaveDetails();
  }

  function renderGameValues() {
    if (!state) return;
    const clickPower = calculateClickPower();
    const autoRate = calculateAutoRate();
    setNumberText(dom.currencyValue, state.currency);
    setNumberText(dom.perClickValue, clickPower);
    setNumberText(dom.perSecondValue, autoRate);
    setNumberText(dom.totalEarnedValue, state.totalCurrencyEarned);
    setNumberText(dom.totalClicksValue, state.totalClicks);
    setNumberText(dom.offlineEarnedValue, state.stats.offlineEarned);
    dom.mineGainLabel.textContent = `+${formatNumber(clickPower)} 광석`;
  }

  function renderUpgrades() {
    if (!state) return;
    for (const definition of UPGRADE_DEFINITIONS) {
      const elements = upgradeElements.get(definition.id);
      if (!elements) continue;
      const level = state.upgrades[definition.id];
      const isMax = level >= definition.maxLevel;
      const isMilestone = definition.type === "milestone";
      const nextOre = isMilestone ? ORE_DEFINITIONS[level + 1] : null;
      const paletteOre = nextOre ?? ORE_DEFINITIONS[getUnlockedOreIndex()];
      const purchase = calculateBulkPurchase(definition, level, state.currency);
      const purchaseUnit = isMilestone ? "단계" : "개";

      elements.level.textContent = isMilestone
        ? `STAGE ${level + 1}/${ORE_DEFINITIONS.length}`
        : `LV.${level}`;
      elements.effect.textContent = getUpgradeEffectText(definition, level);
      elements.buyLabel.textContent = isMax
        ? (isMilestone ? "개척 완료" : "최대 레벨")
        : purchase.count === 0
          ? "구매 불가"
          : purchaseMode === "one"
            ? (isMilestone ? "다음 광맥" : "구매")
            : `${purchase.count}${purchaseUnit} ${isMilestone ? "개척" : "구매"}`;
      elements.cost.textContent = isMax
        ? "MAX"
        : purchase.count > 0
          ? `${formatNumber(purchase.totalCost)} 광석`
          : `최소 ${formatNumber(purchase.nextCost)} 광석`;
      elements.cost.title = isMax
        ? "최대 레벨"
        : formatExactNumber(purchase.count > 0 ? purchase.totalCost : purchase.nextCost);
      elements.buyButton.disabled = isMax || purchase.count === 0 || sessionBlocked;
      elements.card.dataset.purchaseCount = String(purchase.count);
      if (isMilestone) {
        elements.card.style.setProperty("--milestone-accent", paletteOre.palette.accent);
        elements.card.style.setProperty("--milestone-contrast", paletteOre.palette.contrast);
      }
      elements.buyButton.setAttribute(
        "aria-label",
        isMax
          ? `${definition.name} 완료, 광물 ${ORE_DEFINITIONS.length}종 발견`
          : purchase.count === 0
            ? `${definition.name} 구매 불가, 최소 비용 ${formatNumber(purchase.nextCost)} 광석`
            : isMilestone
              ? `${nextOre.name}부터 광맥 ${purchase.count}단계 개척, 총비용 ${formatNumber(purchase.totalCost)} 광석`
              : `${definition.name} ${purchase.count}개 구매, 총비용 ${formatNumber(purchase.totalCost)} 광석`,
      );
    }
  }

  function renderAchievements() {
    if (!state) return;
    let count = 0;
    for (const definition of ACHIEVEMENT_DEFINITIONS) {
      const elements = achievementElements.get(definition.id);
      if (!elements) continue;
      const unlockedAt = state.unlockedAchievements[definition.id];
      const unlocked = Boolean(unlockedAt);
      if (unlocked) count += 1;
      elements.card.classList.toggle("is-unlocked", unlocked);
      elements.status.textContent = unlocked ? "UNLOCKED" : "LOCKED";
      elements.time.textContent = unlocked ? formatDateTime(unlockedAt) : "미해금";
    }
    dom.achievementCount.textContent = `${count} / ${ACHIEVEMENT_DEFINITIONS.length}`;
    dom.achievementMenuBadge.textContent = String(count);
    dom.achievementsMenuButton.setAttribute(
      "aria-label",
      `업적 기록 열기, ${count}개 해금`,
    );
  }

  function renderSaveDetails() {
    if (!dom.localStorageStatus) return;
    if (storageState.available) {
      dom.localStorageStatus.textContent = storageState.writeError ? "쓰기 오류" : "사용 가능";
    } else {
      dom.localStorageStatus.textContent = "사용 불가 · 메모리 모드";
    }

    dom.persistenceStatus.textContent = storageState.persistenceMessage;
    dom.storageUsage.textContent = storageState.usageMessage;
    dom.persistenceButton.disabled = storageState.persistence === "granted" || storageState.persistence === "unsupported";
    dom.lastSavedValue.textContent = state && state.lastSavedAt ? formatDateTime(state.lastSavedAt) : "아직 없음";

    if (state) {
      try {
        updateSaveSize(JSON.stringify(createSavePayload(false)));
      } catch {
        dom.saveSize.textContent = "계산 불가";
      }
    }
  }

  function updateSaveIndicator(message, error) {
    dom.saveIndicator.textContent = message;
    dom.saveIndicator.classList.toggle("is-error", error);
  }

  function updateSaveSize(raw) {
    const bytes = new TextEncoder().encode(raw).byteLength;
    dom.saveSize.textContent = `${formatBytes(bytes)} · UTF-8 JSON`;
  }

  async function inspectPersistenceStatus() {
    if (!navigator.storage || typeof navigator.storage.persisted !== "function") {
      setPersistenceStatus("unsupported", "미지원 · 삭제 가능");
      return false;
    }

    try {
      const persisted = await navigator.storage.persisted();
      if (persisted || storageState.persistence !== "granted") {
        setPersistenceStatus(
          persisted ? "granted" : "available",
          persisted ? "승인됨 · 사용자 삭제 전까지 보호" : "미승인 · 삭제 가능",
        );
      }
      return persisted;
    } catch {
      if (storageState.persistence !== "granted") {
        setPersistenceStatus("unsupported", "확인 불가 · 삭제 가능");
      }
      return false;
    }
  }

  async function requestPersistenceFromGesture(silent) {
    if (storageState.persistence === "granted") return true;
    if (!navigator.storage || typeof navigator.storage.persist !== "function") {
      setPersistenceStatus("unsupported", "미지원 · 삭제 가능");
      if (!silent) showToast("이 브라우저는 영구 저장소 요청을 지원하지 않습니다.", { error: true });
      return false;
    }

    let request;
    try {
      request = navigator.storage.persist();
    } catch {
      setPersistenceStatus("denied", "요청 실패 · 삭제 가능");
      if (!silent) showToast("저장 보호 요청을 시작하지 못했습니다.", { error: true });
      return false;
    }

    try {
      const granted = await request;
      setPersistenceStatus(
        granted ? "granted" : "denied",
        granted ? "승인됨 · 사용자 삭제 전까지 보호" : "거절됨 · 삭제 가능",
      );
      if (!silent) {
        showToast(granted ? "브라우저가 저장 보호를 승인했습니다." : "저장 보호가 승인되지 않았습니다. 세이브 코드를 백업해주세요.", {
          error: !granted,
        });
      }
      return granted;
    } catch {
      setPersistenceStatus("denied", "요청 실패 · 삭제 가능");
      if (!silent) showToast("저장 보호 요청 중 오류가 발생했습니다.", { error: true });
      return false;
    }
  }

  function setPersistenceStatus(status, message) {
    storageState.persistence = status;
    storageState.persistenceMessage = message;
    renderSaveDetails();
  }

  async function refreshStorageEstimate() {
    if (!navigator.storage || typeof navigator.storage.estimate !== "function") {
      storageState.usageMessage = "미지원 · Origin 전체 기준";
      renderSaveDetails();
      return;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = typeof estimate.usage === "number" ? formatBytes(estimate.usage) : "알 수 없음";
      const quota = typeof estimate.quota === "number" ? formatBytes(estimate.quota) : "알 수 없음";
      storageState.usageMessage = `${usage} / ${quota} · Origin 전체`;
    } catch {
      storageState.usageMessage = "확인 실패 · Origin 전체 기준";
    }
    renderSaveDetails();
  }

  function openExportDialog() {
    if (!state) return;
    saveGame("백업 생성");
    const payload = createSavePayload(false);
    dom.exportCode.value = encodeSaveCode(payload);
    dom.copyStatus.textContent = "";
    dom.copyStatus.className = "dialog-status";
    openDialog(dom.exportDialog);
    window.setTimeout(() => dom.exportCode.select(), 50);
  }

  function encodeSaveCode(payload) {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    return `${SAVE_CODE_PREFIX}${bytesToBase64(bytes)}`;
  }

  function decodeSaveCode(input) {
    if (typeof input !== "string" || input.length === 0) {
      throw new SaveValidationError("세이브 코드를 입력해주세요.");
    }
    if (input.length > MAX_SAVE_CODE_LENGTH) {
      throw new SaveValidationError("세이브 코드가 허용 크기를 초과했습니다.");
    }

    const compact = input.replace(/\s/g, "");
    const match = /^PIXELMINE-V(\d+):([A-Za-z0-9+/]*={0,2})$/.exec(compact);
    if (!match) throw new SaveValidationError("세이브 코드 접두사 또는 Base64 형식이 올바르지 않습니다.");

    const prefixVersion = Number(match[1]);
    if (!Number.isSafeInteger(prefixVersion) || prefixVersion > SAVE_VERSION) {
      throw new FutureSaveVersionError(`현재 앱보다 새로운 세이브 코드 버전(${match[1]})입니다.`);
    }

    const base64 = match[2];
    if (base64.length === 0 || base64.length % 4 !== 0) {
      throw new SaveValidationError("Base64 길이가 올바르지 않습니다.");
    }

    let json;
    try {
      const bytes = base64ToBytes(base64);
      json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new SaveValidationError("세이브 코드의 UTF-8 데이터를 해석할 수 없습니다.");
    }

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new SaveValidationError("세이브 코드의 JSON이 손상되었습니다.");
    }

    const payloadVersion = Number.isInteger(parsed.version) ? parsed.version : 0;
    if (payloadVersion !== prefixVersion) {
      throw new SaveValidationError("세이브 코드 버전 정보가 서로 일치하지 않습니다.");
    }
    return migratePayload(parsed);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = window.atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function copyExportCode() {
    const code = dom.exportCode.value;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setDialogStatus(dom.copyStatus, "세이브 코드를 클립보드에 복사했습니다.", false);
    } catch {
      dom.exportCode.focus();
      dom.exportCode.select();
      const copied = document.execCommand && document.execCommand("copy");
      setDialogStatus(
        dom.copyStatus,
        copied ? "세이브 코드를 복사했습니다." : "자동 복사에 실패했습니다. 선택된 코드를 직접 복사해주세요.",
        !copied,
      );
    }
  }

  function openImportDialog(context = "inGame") {
    importContext = context;
    dom.importCode.value = "";
    dom.importStatus.textContent = "";
    dom.importStatus.className = "dialog-status";
    dom.importDialogDescription.textContent = context === "start"
      ? "세이브 코드를 검증해 시작 준비에 적용합니다. 실제 로컬 저장은 다중 탭 확인을 거쳐 게임을 시작할 때 수행합니다."
      : "검증이 완료된 코드만 현재 진행도를 대체합니다. 불러오기 전에 현재 세이브를 내보내는 것을 권장합니다.";
    dom.confirmImportButton.textContent = context === "start" ? "검증하고 준비" : "검증 후 불러오기";
    openDialog(dom.importDialog);
    window.setTimeout(() => dom.importCode.focus(), 50);
  }

  function importSaveCode() {
    const input = dom.importCode.value;
    dom.confirmImportButton.disabled = true;
    setDialogStatus(dom.importStatus, "세이브 코드를 검증하는 중입니다...", false);

    try {
      const migrated = decodeSaveCode(input);
      const importedData = validateSaveData(migrated.data);

      if (importContext === "start") {
        pendingStartImport = importedData;
        closeDialog(dom.importDialog);
        setStartDialogStatus("세이브 검증이 완료되었습니다. 게임 시작을 누르면 불러온 진행도로 시작합니다.", false);
        dom.confirmStartButton.textContent = "불러온 세이브로 게임 시작";
        showToast("세이브 코드를 확인했습니다. 게임 시작 전까지 로컬 저장은 변경하지 않습니다.", {
          key: "save:staged-import",
        });
        return;
      }

      const offlineResult = advanceDataTo(importedData, Date.now(), true);

      state = importedData;
      applyMotionSetting();
      applyMusicSetting({ attemptPlayback: true, notifyBlocked: true });
      evaluateAchievements(true);
      renderAll();
      const saved = saveGame("불러오기 완료", false);
      closeDialog(dom.importDialog);
      showToast(saved ? "세이브 코드를 불러오고 저장했습니다." : "세이브를 메모리로 불러왔지만 로컬 저장에는 실패했습니다.", {
        error: !saved,
        key: saved ? "save:import-success" : "save:import-error",
      });
      if (shouldShowOfflineReward(offlineResult)) showOfflineReward(offlineResult);
      void refreshStorageEstimate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 불러오기 오류입니다.";
      setDialogStatus(dom.importStatus, message, true);
    } finally {
      dom.confirmImportButton.disabled = false;
    }
  }

  function openResetDialog() {
    dom.resetConfirm.checked = false;
    dom.confirmResetButton.disabled = true;
    dom.resetStatus.textContent = "초기화 전에 세이브 코드 내보내기를 권장합니다.";
    dom.resetStatus.className = "dialog-status";
    openDialog(dom.resetDialog);
  }

  function resetGame() {
    if (!dom.resetConfirm.checked || !sessionStarted) return;

    const saveRemoved = !storageState.available || safeRemoveItem(SAVE_KEY);
    const recoveryRemoved = !storageState.available || safeRemoveItem(CORRUPT_SAVE_KEY);
    state = createDefaultData();
    applyMotionSetting();
    applyMusicSetting({ attemptPlayback: true, notifyBlocked: true });
    evaluateAchievements(false);
    renderAll();
    const saved = saveGame("초기화 완료", false);
    closeDialog(dom.resetDialog);

    const successful = saveRemoved && recoveryRemoved && (saved || !storageState.available);
    showToast(
      successful ? "게임을 초기화하고 새 광산을 만들었습니다." : "메모리 게임은 초기화했지만 로컬 데이터 처리 중 오류가 있었습니다.",
      {
        error: !successful,
        key: successful ? "save:reset-success" : "save:reset-error",
      },
    );
    void refreshStorageEstimate();
  }

  function handleMotionSetting() {
    if (!state) return;
    state.settings.reducedMotion = dom.reducedMotionToggle.checked;
    applyMotionSetting();
    scheduleMutationSave();
  }

  function handleMusicSetting() {
    if (!state) return;
    state.settings.musicEnabled = dom.musicToggle.checked;
    applyMusicSetting({ attemptPlayback: true, notifyBlocked: true });
    scheduleMutationSave();
  }

  function applyMusicSetting(options = {}) {
    if (!state) return;
    const attemptPlayback = options.attemptPlayback === true;
    const notifyBlocked = options.notifyBlocked === true;
    dom.musicToggle.checked = state.settings.musicEnabled;

    if (!state.settings.musicEnabled) {
      pauseBackgroundMusic("꺼짐 · 설정에서 다시 켤 수 있습니다.");
      return;
    }

    if (!sessionStarted) {
      pauseBackgroundMusic("켜짐 · 게임 시작 후 재생합니다.");
      return;
    }

    if (sessionBlocked) {
      pauseBackgroundMusic("일시 정지 · 다른 탭에서 실행 중입니다.");
      return;
    }

    if (document.hidden) {
      pauseBackgroundMusic("일시 정지 · 탭으로 돌아오면 재생합니다.");
      return;
    }

    if (attemptPlayback || dom.backgroundMusic.paused) {
      playBackgroundMusic(notifyBlocked);
      return;
    }

    setMusicStatus("재생 중 · Below the Bedrock", false);
  }

  function playBackgroundMusic(notifyBlocked = false) {
    if (!state || !state.settings.musicEnabled || !sessionStarted || sessionBlocked || document.hidden) return;

    dom.backgroundMusic.volume = BACKGROUND_MUSIC_VOLUME;
    setMusicStatus("재생 준비 중 · Below the Bedrock", false);

    try {
      const playback = dom.backgroundMusic.play();
      if (!playback || typeof playback.then !== "function") {
        setMusicStatus("재생 중 · Below the Bedrock", false);
        return;
      }

      playback
        .then(() => {
          if (state?.settings.musicEnabled && sessionStarted && !sessionBlocked && !document.hidden) {
            setMusicStatus("재생 중 · Below the Bedrock", false);
          }
        })
        .catch(() => {
          if (!state?.settings.musicEnabled || sessionBlocked || document.hidden) return;
          setMusicStatus("재생이 차단됨 · 배경음악을 껐다 켜주세요.", true);
          if (notifyBlocked) {
            showToast("브라우저가 배경음악 재생을 차단했습니다. 설정에서 다시 켜주세요.", {
              error: true,
              key: "audio:bgm-blocked",
            });
          }
        });
    } catch {
      setMusicStatus("재생이 차단됨 · 배경음악을 껐다 켜주세요.", true);
      if (notifyBlocked) {
        showToast("브라우저가 배경음악 재생을 차단했습니다. 설정에서 다시 켜주세요.", {
          error: true,
          key: "audio:bgm-blocked",
        });
      }
    }
  }

  function pauseBackgroundMusic(statusMessage) {
    dom.backgroundMusic.pause();
    if (statusMessage) setMusicStatus(statusMessage, false);
  }

  function handleBackgroundMusicError() {
    pauseBackgroundMusic("재생 오류 · 음악 파일을 확인해주세요.");
    setMusicStatus("재생 오류 · 음악 파일을 확인해주세요.", true);
    if (sessionStarted) {
      showToast("배경음악 파일을 재생할 수 없습니다.", {
        error: true,
        key: "audio:bgm-error",
      });
    }
  }

  function setMusicStatus(message, error) {
    dom.musicStatus.textContent = message;
    dom.musicStatus.classList.toggle("is-error", error);
  }

  function applyMotionSetting() {
    if (!state) return;
    dom.reducedMotionToggle.checked = state.settings.reducedMotion;
    document.body.classList.toggle("reduce-motion", state.settings.reducedMotion);
  }

  function handleVisibilityChange() {
    if (!sessionStarted || sessionBlocked) return;
    if (document.hidden) {
      saveGame("백그라운드 저장");
      pauseBackgroundMusic("일시 정지 · 탭으로 돌아오면 재생합니다.");
    } else {
      advanceDataTo(state, Date.now(), false);
      evaluateAchievements(true);
      renderAll();
      refreshTabLease();
      applyMusicSetting({ attemptPlayback: true });
    }
  }

  function handlePageHide() {
    if (!sessionStarted || sessionBlocked) return;
    pageIsHiding = true;
    saveGame("페이지 종료 저장");
    pauseBackgroundMusic("일시 정지 · 페이지를 다시 열면 재생합니다.");
    releaseTabLease();
  }

  function handlePageShow(event) {
    if (!event.persisted || !sessionStarted) return;
    pageIsHiding = false;
    if (!acquireTabLease()) {
      handleTabConflict();
      return;
    }
    if (storageState.lockAvailable && !tabHeartbeatTimer) {
      tabHeartbeatTimer = window.setInterval(refreshTabLease, TAB_HEARTBEAT_MS);
    }
    advanceDataTo(state, Date.now(), false);
    renderAll();
    applyMusicSetting({ attemptPlayback: true });
  }

  function handleBeforeUnload() {
    if (!sessionStarted || sessionBlocked) return;
    if (!pageIsHiding) saveGame("종료 직전 저장");
    pauseBackgroundMusic();
    releaseTabLease();
  }

  function showOfflineReward(result) {
    dom.offlineDuration.textContent = formatDuration(result.elapsedMs);
    dom.offlineReward.textContent = `+${formatNumber(result.reward)}`;
    openDialog(dom.offlineDialog);
  }

  function shouldShowOfflineReward(result) {
    return result.elapsedMs >= MIN_OFFLINE_REPORT_MS && result.reward >= 0.1;
  }

  function animateMineGain(gain) {
    dom.mineButton.classList.remove("is-hit");
    void dom.mineButton.offsetWidth;
    dom.mineButton.classList.add("is-hit");
    window.setTimeout(() => dom.mineButton.classList.remove("is-hit"), 120);

    const floating = document.createElement("span");
    floating.className = "floating-gain";
    floating.textContent = `+${formatNumber(gain)}`;
    dom.mineButton.append(floating);
    window.setTimeout(() => floating.remove(), 750);
  }

  function drawOreSprite(canvas = dom.oreCanvas, definition = ORE_DEFINITIONS[getSelectedOreIndex()]) {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const palette = definition.palette;

    const rows = [
      [9, 14], [7, 16], [5, 18], [4, 19], [3, 20], [2, 21], [2, 21], [1, 22], [1, 22], [1, 22],
      [1, 22], [1, 22], [1, 22], [1, 22], [2, 21], [2, 21], [3, 20], [4, 19], [5, 18], [6, 17], [8, 15],
    ];

    rows.forEach(([start, end], rowIndex) => {
      const y = rowIndex + 2;
      for (let x = start; x <= end; x += 1) {
        const edge = x === start || x === end || rowIndex === 0 || rowIndex === rows.length - 1;
        context.fillStyle = edge ? palette.outline : ((x * 3 + y) % 7 < 2 ? palette.baseAlt : palette.base);
        context.fillRect(x, y, 1, 1);
      }
    });

    const fillRects = (color, rectangles) => {
      context.fillStyle = color;
      rectangles.forEach(([x, y, width, height]) => context.fillRect(x, y, width, height));
    };
    const drawSparkle = (x, y, color) => {
      context.fillStyle = color;
      context.fillRect(x, y - 2, 1, 5);
      context.fillRect(x - 2, y, 5, 1);
    };

    fillRects(palette.shadow, [[5, 7, 4, 3], [14, 5, 4, 4], [4, 14, 5, 3], [15, 15, 4, 3], [10, 19, 3, 2]]);

    switch (definition.id) {
      case "coal":
        fillRects(palette.deposit, [[8, 6, 3, 2], [12, 9, 2, 3], [7, 13, 3, 2], [14, 15, 3, 2], [9, 18, 2, 2]]);
        fillRects(palette.accent, [[9, 6, 1, 1], [13, 9, 1, 1], [8, 13, 1, 1], [15, 15, 1, 1]]);
        fillRects(palette.highlight, [[10, 6, 1, 1], [16, 15, 1, 1]]);
        break;
      case "bronze":
        fillRects(palette.deposit, [[9, 5, 2, 4], [10, 8, 4, 2], [12, 10, 2, 4], [8, 13, 5, 2], [7, 15, 2, 3], [14, 16, 3, 2]]);
        fillRects(palette.accent, [[10, 5, 1, 3], [11, 8, 3, 1], [13, 11, 1, 3], [9, 13, 3, 1], [15, 16, 2, 1]]);
        fillRects(palette.highlight, [[10, 5, 1, 1], [13, 9, 1, 1], [16, 16, 1, 1]]);
        break;
      case "iron":
        fillRects(palette.deposit, [[7, 6, 4, 3], [13, 5, 4, 4], [10, 10, 5, 3], [6, 14, 4, 3], [14, 15, 4, 3], [9, 18, 4, 2]]);
        fillRects(palette.accent, [[8, 6, 3, 1], [14, 5, 3, 2], [11, 10, 4, 1], [7, 14, 3, 1], [15, 15, 3, 1]]);
        fillRects(palette.highlight, [[9, 6, 1, 1], [15, 5, 1, 1], [13, 10, 1, 1], [16, 15, 1, 1]]);
        break;
      case "gold":
        fillRects(palette.deposit, [[9, 5, 2, 4], [10, 8, 4, 2], [8, 10, 3, 3], [10, 12, 5, 2], [13, 14, 2, 4], [6, 17, 3, 2]]);
        fillRects(palette.accent, [[10, 5, 1, 3], [11, 8, 3, 1], [9, 10, 2, 2], [11, 12, 4, 1], [14, 15, 1, 3], [7, 17, 2, 1]]);
        fillRects(palette.highlight, [[10, 5, 1, 1], [13, 8, 1, 1], [10, 10, 1, 1], [14, 15, 1, 1]]);
        drawSparkle(21, 5, palette.highlight);
        break;
      case "ruby":
        fillRects(palette.deposit, [[9, 5, 4, 2], [8, 7, 6, 4], [10, 11, 4, 3], [6, 14, 4, 3], [14, 14, 4, 4], [9, 18, 4, 2]]);
        fillRects(palette.accent, [[10, 5, 2, 1], [9, 7, 4, 3], [11, 11, 2, 2], [7, 14, 2, 2], [15, 14, 2, 3], [10, 18, 2, 1]]);
        fillRects(palette.highlight, [[10, 6, 1, 1], [10, 7, 1, 2], [12, 11, 1, 1], [16, 14, 1, 1]]);
        drawSparkle(3, 8, palette.highlight);
        break;
      case "diamond":
        fillRects(palette.deposit, [[9, 4, 4, 2], [7, 6, 8, 3], [8, 9, 6, 4], [10, 13, 4, 3], [5, 15, 4, 3], [15, 15, 4, 3], [9, 18, 5, 2]]);
        fillRects(palette.accent, [[10, 4, 2, 1], [8, 6, 6, 2], [9, 9, 4, 3], [11, 13, 2, 2], [6, 15, 2, 2], [16, 15, 2, 2], [10, 18, 3, 1]]);
        fillRects(palette.highlight, [[10, 5, 1, 1], [9, 6, 2, 1], [10, 9, 1, 2], [12, 13, 1, 1], [17, 15, 1, 1]]);
        drawSparkle(20, 4, palette.highlight);
        drawSparkle(3, 12, palette.accent);
        break;
      default:
        break;
    }
  }

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    syncDialogTrigger(dialog, true);
  }

  function closeDialog(dialog) {
    if (!dialog || !dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    syncDialogTrigger(dialog, false);
  }

  function syncDialogTrigger(dialog, expanded) {
    const triggerId = dialog?.dataset.trigger;
    if (!triggerId) return;
    const trigger = document.getElementById(triggerId);
    if (trigger) trigger.setAttribute("aria-expanded", String(expanded));
  }

  function setDialogStatus(element, message, error) {
    element.textContent = message;
    element.className = `dialog-status ${error ? "is-error" : "is-success"}`;
  }

  function setStartDialogStatus(message, error) {
    dom.startDialogStatus.textContent = message;
    dom.startDialogStatus.className = `dialog-status start-dialog-status ${error ? "is-error" : "is-success"}`;
  }

  function showToast(message, options = {}) {
    const error = options.error === true;
    const keyPart = typeof options.key === "string" && options.key ? options.key : message;
    const key = `${error ? "error" : "info"}:${keyPart}`;
    const countMode = options.countMode === "purchase" ? "purchase" : "repeat";
    const existing = toastEntries.get(key);

    if (existing) {
      window.clearTimeout(existing.timerId);
      existing.count += 1;
      existing.message = message;
      existing.countMode = countMode;
      renderToastEntry(existing);
      dom.toastRegion.append(existing.element);
      toastEntries.delete(key);
      toastEntries.set(key, existing);
      scheduleToastRemoval(existing);
      return existing.element;
    }

    if (toastEntries.size >= MAX_VISIBLE_TOASTS) {
      const oldest = toastEntries.values().next().value;
      if (oldest) removeToastEntry(oldest);
    }

    const toast = document.createElement("div");
    toast.className = `toast${error ? " is-error" : ""}`;
    toast.dataset.toastKey = keyPart;
    toast.setAttribute("aria-atomic", "true");

    const messageElement = document.createElement("span");
    messageElement.className = "toast-message";
    const countElement = document.createElement("span");
    countElement.className = "toast-count";
    countElement.hidden = true;
    toast.append(messageElement, countElement);

    const entry = {
      key,
      element: toast,
      messageElement,
      countElement,
      message,
      count: 1,
      countMode,
      timerId: null,
    };

    renderToastEntry(entry);
    dom.toastRegion.append(toast);
    toastEntries.set(key, entry);
    scheduleToastRemoval(entry);
    return toast;
  }

  function renderToastEntry(entry) {
    entry.messageElement.textContent = entry.message;
    if (entry.count <= 1) {
      entry.countElement.hidden = true;
      entry.countElement.textContent = "";
      return;
    }

    entry.countElement.hidden = false;
    entry.countElement.textContent = entry.countMode === "purchase" ? `${entry.count}회 구매` : `×${entry.count}`;
  }

  function scheduleToastRemoval(entry) {
    entry.timerId = window.setTimeout(() => removeToastEntry(entry), TOAST_DURATION_MS);
  }

  function removeToastEntry(entry) {
    if (toastEntries.get(entry.key) !== entry) return;
    window.clearTimeout(entry.timerId);
    toastEntries.delete(entry.key);
    entry.element.remove();
  }

  function setSessionWarning(message) {
    dom.sessionWarning.textContent = message;
    dom.sessionWarning.classList.remove("is-hidden");
  }

  function clearSessionWarning() {
    dom.sessionWarning.textContent = "";
    dom.sessionWarning.classList.add("is-hidden");
  }

  function setNumberText(element, value) {
    element.textContent = formatNumber(value);
    element.title = formatExactNumber(value);
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "0";
    const safeValue = Math.max(0, value);
    if (safeValue < 1_000) {
      return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: safeValue < 10 ? 1 : 0 }).format(safeValue);
    }

    const units = ["", "만", "억", "조", "경"];
    const unitIndex = Math.min(Math.floor(Math.log10(safeValue) / 4), units.length - 1);
    if (unitIndex === 0) return Math.floor(safeValue).toLocaleString("ko-KR");
    const scaled = safeValue / Math.pow(10, unitIndex * 4);
    const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    return `${scaled.toFixed(digits).replace(/\.0+$|(?<=\.[0-9])0+$/, "")}${units[unitIndex]}`;
  }

  function formatExactNumber(value) {
    if (!Number.isFinite(value)) return "0";
    return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(Math.max(0, value));
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return "아직 없음";
    try {
      return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(timestamp));
    } catch {
      return "시각 오류";
    }
  }

  function formatDuration(milliseconds) {
    let seconds = Math.floor(Math.max(0, milliseconds) / 1_000);
    const days = Math.floor(seconds / 86_400);
    seconds %= 86_400;
    const hours = Math.floor(seconds / 3_600);
    seconds %= 3_600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const parts = [];
    if (days) parts.push(`${days}일`);
    if (hours) parts.push(`${hours}시간`);
    if (minutes) parts.push(`${minutes}분`);
    if (seconds || parts.length === 0) parts.push(`${seconds}초`);
    return parts.slice(0, 3).join(" ");
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "알 수 없음";
    if (bytes < 1_024) return `${Math.round(bytes)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1_024;
    let index = 0;
    while (value >= 1_024 && index < units.length - 1) {
      value /= 1_024;
      index += 1;
    }
    return `${value.toFixed(value < 10 ? 2 : 1)} ${units[index]}`;
  }

  function safeAdd(left, right) {
    const value = left + right;
    if (!Number.isFinite(value)) return MAX_SAFE_VALUE;
    return Math.min(MAX_SAFE_VALUE, Math.max(0, value));
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function createTabSessionId() {
    try {
      const existing = window.sessionStorage.getItem(TAB_SESSION_KEY);
      if (existing) return existing;
      const created = createRandomId("tab");
      window.sessionStorage.setItem(TAB_SESSION_KEY, created);
      return created;
    } catch {
      return createRandomId("tab");
    }
  }

  function createRandomId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
})();
