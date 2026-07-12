// background.js — 진실의 원천(single source of truth).
// 게임(v2): 강아지 산책. 키 한 글자=한 걸음 → 🦴환전 → 강아지(품종) 수집.
// ⚠️ idle 없음 — 키 칠 때만 걷는다. 저장=local(즉시)+sync(계정연동, 15초 throttle), taps로 병합.
// 모든 쓰기(걷기/환전/구매/선택)는 여기로 모은다 = 단일 작성자.

const KEY = "g";

// 강아지 상점(권위 = 여기). game.js는 "shop" 메시지로 받는다.
const DOGS = [
  { id: "cheese", name: "치즈 시바", nameEn: "Cheese Shiba", price: 0 },
  { id: "cream", name: "크림 시바", nameEn: "Cream Shiba", price: 300 },
  { id: "sesame", name: "참깨 시바", nameEn: "Sesame Shiba", price: 700 },
  { id: "corgi", name: "웰시코기", nameEn: "Welsh Corgi", price: 1500 },
  { id: "chihuahua", name: "치와와", nameEn: "Chihuahua", price: 2500 },
  { id: "poodle", name: "토이푸들", nameEn: "Toy Poodle", price: 4000 },
  { id: "dachshund", name: "닥스훈트", nameEn: "Dachshund", price: 5000 },
  { id: "bulldog", name: "프렌치불독", nameEn: "French Bulldog", price: 6000 },
  { id: "border", name: "보더콜리", nameEn: "Border Collie", price: 9000 },
  { id: "chow", name: "차우차우", nameEn: "Chow Chow", price: 13000 },
  { id: "ig", name: "이탈리안 그레이하운드", nameEn: "Italian Greyhound", price: 18000 },
  { id: "golden", name: "골든리트리버", nameEn: "Golden Retriever", price: 25000 },
  { id: "jaemi", name: "재미", nameEn: "Jaemi", price: 30000 },
];
const DOGIDS = DOGS.map((d) => d.id);
const priceOf = (id) => (DOGS.find((d) => d.id === id) || {}).price;

function fresh() {
  return {
    steps: 0, // 현재 걸음(환전 잔액)
    taps: 0, // 평생 친 키(단조 증가=병합 기준)
    coins: 0, // 🦴 돈
    stepPerKey: 1, // 키당 걸음
    owned: ["cheese"], // 가진 강아지
    selDog: "cheese", // 선택한 강아지
  };
}

// 안전 정수 상한(이상은 정밀도 손실/Infinity 위험) — 숫자 필드를 여기로 클램프.
const MAX_NUM = Number.MAX_SAFE_INTEGER;
function num(v, def, min, max) {
  v = typeof v === "number" ? v : Number(v); // 문자열 등은 강제 변환
  if (!Number.isFinite(v)) v = def; // NaN·Infinity·"abc" → 기본값
  v = Math.floor(v);
  return v < min ? min : v > max ? max : v;
}

// 저장 스키마를 '알려진 모양'으로 정규화 = 타입/범위 강제 + 미지 필드 제거.
// ⚠️ 서버리스라 소유자 본인 치트는 못 막는다. 목적은 손상·버전스큐·오염된 sync로부터
//    게임이 깨지지 않게 하는 견고성(NaN 전염·배율 폭주·병합 동결·쿼터 오염 차단).
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  let owned = Array.isArray(r.owned) ? r.owned.filter((x) => DOGIDS.includes(x)) : [];
  if (!owned.includes("cheese")) owned.unshift("cheese");
  owned = [...new Set(owned)]; // 중복 제거
  let selDog = DOGIDS.includes(r.selDog) ? r.selDog : "cheese";
  if (!owned.includes(selDog)) selDog = "cheese";
  return {
    steps: num(r.steps, 0, 0, MAX_NUM),
    taps: num(r.taps, 0, 0, MAX_NUM),
    coins: num(r.coins, 0, 0, MAX_NUM),
    stepPerKey: num(r.stepPerKey, 1, 1, 1000), // 항상 1이지만 손상 대비 1~1000 클램프
    owned,
    selDog,
  };
}

async function load() {
  const o = await chrome.storage.local.get(KEY);
  return normalize(o[KEY]); // 미지 필드(예: 옛 equipped)는 화이트리스트로 자동 탈락
}

async function save(s) {
  await chrome.storage.local.set({ [KEY]: s });
  queueSync(s);
}

let syncTimer = null;
function queueSync(s) {
  if (syncTimer) return;
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    try {
      await chrome.storage.sync.set({ [KEY]: s });
    } catch (_) {}
  }, 15000);
}

let reconciled = false;
async function reconcile() {
  reconciled = true;
  try {
    const [l, sy] = await Promise.all([
      chrome.storage.local.get(KEY),
      chrome.storage.sync.get(KEY),
    ]);
    // ⚠️ 양쪽 다 정규화 후 비교/채택 — 오염된 원격을 날것으로 받아들이지 않는다.
    const local = l[KEY] ? normalize(l[KEY]) : null;
    const remote = sy[KEY] ? normalize(sy[KEY]) : null;
    const lt = local ? local.taps : -1; // 레코드 없음=-1(taps 0인 정상 레코드와 구분)
    const rt = remote ? remote.taps : -1;
    if (remote && rt > lt) await chrome.storage.local.set({ [KEY]: remote }); // 원격 채택(정규화본)
    else if (local && lt > rt && lt > 0) await chrome.storage.sync.set({ [KEY]: local }).catch(() => {}); // 로컬을 sync로(정규화본=오염 정리). ⚠️lt>0: 아직 안 내려온 원격을 빈 fresh(taps=0)로 덮어쓰지 않게
  } catch (_) {}
}

// per-key 걸음: 모았다가 throttle(800ms) 저장
let pending = 0;
let flushTimer = null;

// 모든 상태 변이를 한 줄로 직렬화 = buy/exchange 이중지불·flush 경합 차단.
// load→검사→save 사이에 다른 변이가 끼어들지 못하게 단일 프라미스 체인으로 순서화한다.
let opChain = Promise.resolve();
function enqueue(fn) {
  const run = opChain.then(fn, fn); // 앞 작업이 끝난 뒤에만 실행(성공/실패 무관)
  opChain = run.catch(() => {});    // 한 작업이 실패해도 체인은 이어감
  return run;
}
// 모아둔 걸음(pending)을 상태에 반영. 변경되면 true.
function applyPending(s) {
  if (pending <= 0) return false;
  const n = pending;
  pending = 0;
  s.steps += n * s.stepPerKey;
  s.taps += n;
  return true;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const t = msg && msg.type;

  if (t === "vid") {
    // 자식 프레임의 영상 재생 보고 → 같은 탭의 TOP 프레임(frameId 0)에만 중계.
    // 웹페이지는 chrome.runtime을 못 써서 이 채널 자체가 위·변조 불가.
    const tabId = _sender.tab && _sender.tab.id;
    if (tabId != null) {
      chrome.tabs.sendMessage(
        tabId,
        { type: "vidFrame", frameId: _sender.frameId, playing: !!msg.playing },
        { frameId: 0 },
        () => void chrome.runtime.lastError // 수신자(TOP content script) 없을 때 에러 무시
      );
    }
    return;
  }
  if (t === "key" || t === "taps") {
    pending += t === "taps" ? num(msg.n, 0, 0, MAX_NUM) : 1; // |0(32비트 절단) 대신 안전 정수 강제
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        enqueue(async () => {
          if (!reconciled) await reconcile();
          const s = await load();
          if (applyPending(s)) await save(s);
        });
      }, 800);
    }
    return;
  }
  if (t === "shop") {
    sendResponse(DOGS);
    return;
  }

  enqueue(async () => {
    if (!reconciled) await reconcile();
    const s = await load();
    let dirty = applyPending(s); // 모인 걸음 먼저 반영

    switch (t) {
      case "exchange": {
        if (s.steps > 0) {
          s.coins += Math.floor(s.steps);
          s.steps = 0;
          dirty = true;
        }
        break;
      }
      case "buy": {
        // 강아지 구매 → 자동 선택
        const p = priceOf(msg.id);
        if (p != null && !s.owned.includes(msg.id) && s.coins >= p) {
          s.coins -= p;
          s.owned.push(msg.id);
          s.selDog = msg.id;
          dirty = true;
        }
        break;
      }
      case "select": {
        // 가진 강아지로 교체
        if (s.owned.includes(msg.id)) {
          s.selDog = msg.id;
          dirty = true;
        }
        break;
      }
    }

    if (dirty) await save(s);
    sendResponse(s);
  });
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const o = await chrome.storage.local.get([KEY]);
  if (!o[KEY]) await chrome.storage.local.set({ [KEY]: fresh() });
  await reconcile();
});
chrome.runtime.onStartup?.addListener(reconcile);

// 아이콘 클릭은 이제 팝업(popup.html)을 연다(강아지 ON/OFF + 게임 열기).
// 게임 사이드패널은 팝업의 '게임 열기' 버튼에서 sidePanel.open()으로 연다 → 자동열기 끔.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

// 강아지 OFF면 아이콘에 'OFF' 뱃지 — 한눈에 상태 보이게.
function updateBadge(on) {
  chrome.action.setBadgeText({ text: on ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#9aa0a6" });
}
chrome.storage.local.get("petOn").then((o) => updateBadge(o.petOn !== false)).catch(() => {});
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && c.petOn) updateBadge(c.petOn.newValue !== false);
  // 다른 컴퓨터의 진행이 sync로 뒤늦게 도착하면(설치 직후엔 몇 초~분 지연) 여기서 채택.
  // reconcile은 install/startup/최초입력 때만 돌기에, 지연 도착분은 이 리스너가 없으면 재시작까지 반영 안 됨.
  if (area === "sync" && c[KEY]) {
    enqueue(async () => {
      const remote = c[KEY].newValue ? normalize(c[KEY].newValue) : null;
      if (!remote) return;
      const l = await chrome.storage.local.get(KEY);
      const local = l[KEY] ? normalize(l[KEY]) : null;
      const lt = local ? local.taps : -1;
      if (remote.taps > lt) await chrome.storage.local.set({ [KEY]: remote }); // taps 큰 쪽(=더 많이 논 기기) 채택
    });
  }
});
