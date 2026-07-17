# PIXEL MINE

로그인과 서버 없이 현재 브라우저에 진행도를 저장하는 레트로 픽셀 방치형 클리커 게임입니다. 순수 HTML, CSS, Vanilla JavaScript로 작성했으며 빌드 과정이 없습니다.

## 실행

`file://`로 `index.html`을 직접 열면 게임 시작 버튼이 잠깁니다. `localStorage`와 Storage API가 origin 기준으로 안정적으로 동작하도록 이 폴더를 HTTP로 제공하세요.

```bash
cd /Users/carelabs/Documents/withCodex/game-project
python3 -m http.server 8000
```

브라우저에서 다음 주소로 접속합니다.

```text
http://localhost:8000
```

빌드나 패키지 설치는 필요하지 않습니다. 배포할 때는 폴더의 정적 파일을 동일한 HTTPS origin에서 제공하면 됩니다.

주의: `http://localhost:8000`과 `http://localhost:8080`, HTTP와 HTTPS, 서로 다른 도메인은 각각 다른 origin이므로 저장 공간도 분리됩니다. 주소나 포트를 바꾸기 전 세이브 코드를 내보내세요.

## 최초 시작 흐름

1. HTTP/HTTPS로 접속하면 저장 안내 화면이 먼저 표시됩니다.
2. 안내 화면은 서버나 계정 없이 현재 브라우저의 `localStorage`에만 저장된다는 점과 삭제 가능성을 설명합니다.
3. **저장 안내를 확인하고 게임 시작** 버튼을 눌러야 세이브 로드, 오프라인 수익 계산, 게임 루프, 자동 저장이 시작됩니다.
4. 버튼 클릭 시 지원되는 브라우저에는 영구 저장소를 요청합니다. 거절되거나 지원되지 않아도 게임은 시작됩니다.
5. 다른 활성 탭이 있으면 두 번째 탭의 시작을 막아 저장 충돌을 방지합니다.

## 파일 구성

```text
game-project/
├── index.html       # 시작 안내, 게임 화면, 백업/복원/초기화 dialog
├── styles.css       # 픽셀 테마, 반응형 레이아웃, 접근성 스타일
├── game.js          # 게임 규칙, 렌더링, 저장, 오프라인 수익, 탭 잠금
├── game-prompt.md   # 구현 요구사항과 완료 기준
└── README.md        # 실행 및 확장 가이드
```

## 게임 구성

- 클릭 재화: 광석
- 클릭 업그레이드: 낡은 곡괭이, 강철 곡괭이
- 자동 생산 업그레이드: 광부, 광산 수레, 자동 드릴, 수정 코어
- 업적: 첫 클릭, 누적 클릭/광석, 업그레이드 보유, 자동 생산 등 8종
- 오프라인 수익: 현재 자동 생산량의 100%, 최대 24시간
- 오프라인 요약: 5초 이상의 의미 있는 이탈에만 표시해 빠른 새로고침에서 `0초, +0` 모달이 열리지 않음
- 업적은 자동 해금되며 1차 MVP에서는 별도 보상을 주지 않습니다.

## 저장 설계

### 저장 키

| 키 | 용도 |
|---|---|
| `pixelMine.save` | 현재 게임 저장 객체 |
| `pixelMine.corruptSave` | 검증 실패한 원본 저장 문자열과 오류 사유 |
| `pixelMine.activeTab` | 다중 탭 충돌 방지를 위한 짧은 수명의 lease |

같은 탭의 빠른 새로고침을 다른 탭으로 오인하지 않도록 `sessionStorage`의 `pixelMine.tabSession` 식별자를 함께 사용합니다. 각 문서 인스턴스는 별도 ID를 사용하므로 다른 인스턴스가 lease를 가져가면 기존 게임 루프를 중지합니다.

초기화는 `localStorage.clear()`를 사용하지 않습니다. 게임 저장 키와 손상 복구 키만 제거한 뒤 새 저장을 만듭니다. 활성 탭 lease는 현재 세션을 유지하기 위해 별도로 관리합니다.

### 스키마 v1

```json
{
  "version": 1,
  "meta": {
    "app": "PIXEL_MINE",
    "label": "픽셀 광산"
  },
  "data": {
    "currency": 0,
    "totalCurrencyEarned": 0,
    "totalClicks": 0,
    "upgrades": {
      "worn_pickaxe": 0,
      "steel_pickaxe": 0,
      "miner": 0,
      "mine_cart": 0,
      "auto_drill": 0,
      "crystal_core": 0
    },
    "unlockedAchievements": {
      "first_click": 0
    },
    "stats": {
      "playTimeMs": 0,
      "offlineEarned": 0
    },
    "settings": {
      "reducedMotion": false
    },
    "lastProcessedAt": 0,
    "lastSavedAt": 0
  }
}
```

실제 해금 업적 값은 해금 시각의 Unix epoch milliseconds입니다. 미해금 업적 ID는 객체에 넣지 않습니다.

업그레이드 이름, 비용 공식, 효과, 업적 조건은 저장하지 않고 `game.js`의 정적 정의 테이블에 둡니다. 저장에는 변하는 상태만 기록하므로 밸런스 조정과 마이그레이션이 단순합니다.

### 저장 시점

- 15초 자동 저장
- 클릭·구매·설정 변경 후 800ms 디바운스 저장
- 문서가 hidden 상태로 전환될 때
- `pagehide`
- 보조 수단으로 `beforeunload`
- 수동 저장, 내보내기, 불러오기, 초기화 직후

저장 직전에 `lastProcessedAt`부터 현재 시각까지의 자동 생산을 반영합니다. `beforeunload`는 모바일에서 항상 호출된다고 보장할 수 없으므로 주기 저장과 `visibilitychange`가 기본 방어선입니다.

### 손상 및 가져오기 검증

불러오기는 다음 순서로 처리합니다.

1. JSON 또는 세이브 코드 형식 확인
2. 현재 앱보다 미래 버전인지 확인
3. 버전별 마이그레이션
4. 필수 객체와 필드 확인
5. 숫자가 유한하고 음수가 아닌지, 업그레이드 레벨이 최대값 이내인지 확인
6. 알려진 업적 ID만 복원
7. 검증이 끝난 뒤에만 현재 메모리 상태와 로컬 저장을 교체

로컬 저장이 손상되면 원본 문자열을 `pixelMine.corruptSave`에 격리하고 새 게임으로 폴백합니다. 저장소 자체가 차단되면 게임은 메모리에서 실행되지만 탭을 닫으면 진행도가 사라질 수 있다는 경고를 표시합니다.

### 세이브 코드

세이브 코드는 다음 구조입니다.

```text
PIXELMINE-V1:<UTF-8 JSON의 Base64>
```

`TextEncoder`와 `TextDecoder`를 사용하므로 `픽셀 광산` 같은 한글도 안전하게 왕복합니다. Base64는 읽기 편한 전송 인코딩일 뿐 암호화, 서명, 위변조 방지 수단이 아닙니다.

## 브라우저 저장 정책

- `navigator.storage.persisted()`로 현재 상태를 확인하고 `persist()`를 요청합니다.
- 요청은 브라우저가 거절할 수 있으며, 승인되더라도 사용자가 사이트 데이터를 직접 삭제할 수 있습니다.
- `navigator.storage.estimate()` 값은 PIXEL MINE만의 사용량이 아니라 현재 origin 전체의 대략적인 사용량과 quota입니다.
- 화면에는 origin 예상 사용량과 현재 세이브 UTF-8 JSON 크기를 구분해 표시합니다.
- Safari/WebKit의 저장 정책, 시크릿 모드, 저장 공간 압박, 브라우저 데이터 정리로 저장이 사라질 수 있습니다.
- 장기 보존과 기기 이동에는 세이브 코드 내보내기를 사용하세요.

## 확장 가이드

### 업그레이드 추가

`game.js`의 `UPGRADE_DEFINITIONS`에 고유 ID, 표시 정보, 유형, 레벨당 효과, 비용 공식을 추가합니다. 신규 ID는 `createDefaultData()`와 검증 함수가 정의 테이블을 순회하므로 기본 레벨 0으로 자동 포함됩니다.

새로운 효과 유형을 추가한다면 `calculateClickPower()` 또는 `calculateAutoRate()`와 업그레이드 효과 설명 렌더링을 함께 수정하세요.

### 업적 추가

`ACHIEVEMENT_DEFINITIONS`에 고유 ID, 이름, 설명, `condition(data)`를 추가합니다. 렌더링과 저장은 정의 테이블을 자동으로 사용합니다. 저장에는 해금된 ID와 시각만 들어갑니다.

### 저장 스키마 변경

1. `SAVE_VERSION`을 증가시킵니다.
2. `MIGRATIONS`에 이전 버전 번호를 키로 하는 변환 함수를 추가합니다.
3. `createDefaultData()`, `serializeData()`, `validateSaveData()`를 함께 수정합니다.
4. 로컬 불러오기와 세이브 코드 가져오기 양쪽에서 이전 버전이 새 버전으로 변환되는지 확인합니다.
5. 미래 버전 저장은 계속 거부해야 합니다.

### 프레스티지 추가

프레스티지 도입 시 다음 상태를 분리하는 것이 좋습니다.

- 초기화 대상: 현재 광석, 일반 업그레이드, 현재 런 통계
- 영구 보존 대상: 프레스티지 재화, 프레스티지 업그레이드, 전체 누적 통계, 관련 업적

프레스티지는 일반 초기화와 다른 확인 흐름을 사용하고, 저장 스키마 버전을 올려 기존 v1 저장을 마이그레이션하세요.

## 검증 체크리스트

- [ ] 첫 화면에서 저장 삭제 가능성과 백업 안내가 보인다.
- [ ] 게임 시작 버튼 전에는 게임과 저장 로드가 시작되지 않는다.
- [ ] `file://`에서 시작 버튼이 잠기고 HTTP 실행 방법이 보인다.
- [ ] 클릭, 6종 업그레이드, 자동 생산, 8종 업적이 동작한다.
- [ ] 새로고침 후 광석, 업그레이드, 업적이 복원된다.
- [ ] 오프라인 수익은 자동 생산만 계산하며 24시간을 넘지 않는다.
- [ ] 과거로 이동한 시각 차이는 0으로 처리된다.
- [ ] 손상 JSON이 격리되고 새 게임으로 폴백한다.
- [ ] 미래 버전과 잘못된 Base64 세이브 코드를 거부한다.
- [ ] 내보낸 한글 포함 세이브 코드를 다시 불러올 수 있다.
- [ ] 저장 보호 승인/거절/미지원 상태와 origin 사용량이 표시된다.
- [ ] 초기화가 다른 origin 저장 키를 지우지 않는다.
- [ ] 두 번째 탭의 활성 플레이가 차단된다.
- [ ] 모바일 폭, 키보드 포커스, 모션 감소에서 사용할 수 있다.

### 자동 브라우저 검증

`tests/e2e.mjs`는 외부 npm 패키지 없이 Node.js의 WebSocket과 Chrome DevTools Protocol을 사용합니다. 정적 서버를 실행한 상태에서 별도 터미널에 headless Chrome을 엽니다.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --disable-gpu \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/pixelmine-e2e \
  about:blank
```

그다음 프로젝트 폴더에서 실행합니다.

```bash
node --check game.js
node --check tests/e2e.mjs
node tests/e2e.mjs
```

검증 범위에는 시작 게이트, 스키마 v1 생성, 저장 보호 상태, 클릭/구매/업적, UTF-8 내보내기와 불러오기, 미래 버전 거부, v0→v1 마이그레이션, 새로고침 복원, 24시간 오프라인 상한, 시계 역행, 초기화 격리, 손상 저장 복구, 다중 탭, 모바일 폭, `file://` 차단, 저장소 차단 시 메모리 fallback, 처리되지 않은 JavaScript 예외가 포함됩니다. 스크린샷은 `/tmp/pixel-mine-start.png`, `/tmp/pixel-mine-e2e.png`, `/tmp/pixel-mine-mobile.png`에 생성됩니다.

## 알려진 한계

- 서버가 없으므로 기기 간 자동 동기화와 분실 복구는 제공하지 않습니다.
- 시스템 시계를 미래로 바꾸는 행위를 완전히 탐지할 수 없습니다. 한 번에 지급하는 오프라인 수익을 24시간으로 제한합니다.
- 클라이언트 전용 게임이므로 사용자가 개발자 도구나 세이브 코드를 수정하는 것을 보안 경계로 취급하지 않습니다.
- Google Fonts CDN을 사용할 수 없으면 시스템 monospace 글꼴로 대체되며 게임 기능에는 영향이 없습니다.
