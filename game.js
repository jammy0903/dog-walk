// game.js — 강아지 산책 화면(사이드패널 + 새 탭 공유).
// 상태는 백그라운드(storage)가 가짐. 행동(환전/구매/선택)은 백그라운드로 메시지 = 단일 작성자.

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString("en-US");

let DOGS = []; // 강아지 상점 목록(백그라운드에서 받음)
let last = null;
let dispSteps = 0; // 화면 걸음(키마다 즉시 +, storage 동기화 때 정정)
let walkPhase = 0;
let restTimer = null;
let curDog = null; // 현재 표시 중인 강아지

// 선택한 강아지의 스프라이트 경로
const dogPrefix = (id) => (id === "cheese" ? "dog" : "dog-" + id);
let REST = "assets/dog-rest.webp";
let WALK = [1, 2, 3, 4].map((n) => `assets/dog-walk${n}.webp`);
const SEQ = [0, 1, 2, 3, 2, 1]; // 핑퐁

function setDog(id) {
  const p = dogPrefix(id);
  REST = `assets/${p}-rest.webp`;
  WALK = [1, 2, 3, 4].map((n) => `assets/${p}-walk${n}.webp`);
  [REST, ...WALK].forEach((src) => {
    const i = new Image();
    i.src = src; // 미리 로드
  });
  const d = $("dog");
  if (d && !d.classList.contains("walking")) d.src = REST; // 쉴 때면 즉시 교체
}

// 키 한 번 = 다음 프레임. 멈추면 잠시 후 쉼.
function stepLeg() {
  const d = $("dog");
  if (!d) return;
  d.classList.remove("breath");
  d.classList.add("walking");
  walkPhase = (walkPhase + 1) % SEQ.length;
  d.src = WALK[SEQ[walkPhase]];
  clearTimeout(restTimer);
  restTimer = setTimeout(() => {
    d.classList.remove("walking");
    d.classList.add("breath");
    d.src = REST;
  }, 600);
}

function send(msg) {
  try {
    chrome.runtime.sendMessage(msg, (s) => {
      if (chrome.runtime.lastError) return;
      render(s);
    });
  } catch (_) {}
}

function render(s) {
  if (!s) return;
  last = s;
  dispSteps = s.steps;
  $("steps").textContent = fmt(s.steps);
  $("coins").textContent = fmt(s.coins);
  $("taps").textContent = fmt(s.taps);
  $("exchange").disabled = !(s.steps > 0);
  if (s.selDog !== curDog) {
    curDog = s.selDog;
    setDog(curDog);
  }
  renderShop(s);
}

function renderShop(s) {
  if (!DOGS.length) return;
  const items = $("items");
  items.innerHTML = "";
  for (const d of DOGS) {
    const owned = (s.owned || []).includes(d.id);
    const sel = s.selDog === d.id;
    const row = document.createElement("div");
    row.className = "item";
    const nm = (LANG === "en") ? (d.nameEn || NAME_EN[d.id] || d.name) : d.name;
    row.innerHTML =
      `<img class="ico" src="assets/${dogPrefix(d.id)}-rest.webp" alt="" style="height:28px;width:auto;vertical-align:middle" />` +
      `<span class="nm">${nm}</span>` +
      (owned
        ? `<button class="act ${sel ? "eq" : ""}" data-sel="${d.id}" ${sel ? "disabled" : ""}>${sel ? t("walking") : t("select")}</button>`
        : `<span class="pr">🦴 ${d.price}</span>` +
          `<button class="act" data-buy="${d.id}" ${s.coins >= d.price ? "" : "disabled"}>${t("adopt")}</button>`);
    items.appendChild(row);
  }
}

// 상점 버튼(입양/선택)
$("items").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.buy) send({ type: "buy", id: b.dataset.buy });
  else if (b.dataset.sel) send({ type: "select", id: b.dataset.sel });
});

$("exchange").addEventListener("click", () => send({ type: "exchange" }));

// storage 변화 → 갱신 (어느 탭에서 타이핑해도 공유)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.g) render(changes.g.newValue);
});

// content.js가 키마다 보내는 신호 → 다리 한 번 + 걸음 즉시 +1 (1:1)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "key") {
    stepLeg();
    dispSteps += (last && last.stepPerKey) || 1;
    $("steps").textContent = fmt(dispSteps);
  }
});

// 게임 UI = 사이드패널(툴바 아이콘으로 열기). 새 탭 오버라이드는 쓰지 않음.
// 페이지펫은 항상 켜짐(무조건 화면) — 토글 제거. pet=false 잔재가 있으면 강제로 켠다.
chrome.storage.local.get("pet", ({ pet }) => { if (pet === false) chrome.storage.local.set({ pet: true }); });

// 페이지 강아지 크기
function paintPetSize(px) {
  const v = px || 92;
  $("petSize").value = v;
  $("petSizeVal").textContent = v + "px";
}
$("petSize").addEventListener("input", (e) => {
  const v = +e.target.value;
  $("petSizeVal").textContent = v + "px";
  chrome.storage.local.set({ petSize: v });
});
chrome.storage.local.get("petSize", ({ petSize }) => paintPetSize(petSize || 92));

// ── 사이드패널 무대 배경 (꽃밭/도로/엑셀/크롬) ──
const BG = ["flower", "road", "excel", "chrome"];
const BODY_TINT = { excel: "#ffffff", chrome: "#f1f3f4" };
function applyBg(name) {
  if (!BG.includes(name)) name = "flower";
  const st = document.querySelector(".stage");
  if (st) {
    BG.forEach((b) => st.classList.remove("bg-" + b));
    st.classList.add("bg-" + name);
  }
  document.body.style.background = BODY_TINT[name] || "";
  [...$("bgSeg").children].forEach((b) => b.classList.toggle("on", b.dataset.bg === name));
}
$("bgSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b && b.dataset.bg) chrome.storage.local.set({ bg: b.dataset.bg });
});
chrome.storage.local.get("bg", ({ bg }) => applyBg(bg || "flower"));

chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c.petSize) paintPetSize(c.petSize.newValue || 92);
  if (c.bg) applyBg(c.bg.newValue);
  if (c.lang) applyLang(c.lang.newValue || "ko");
});

// ── 언어(i18n): 한/영 토글. storage.local.lang에 저장, 모든 탭/패널 공유 ──
let LANG = "ko";
// 품종 영어명 폴백(id 기준) — background SW가 옛 코드(nameEn 없는 DOGS)를 줘도 영어 표시 보장
const NAME_EN = {
  cheese:"Cheese Shiba", cream:"Cream Shiba", sesame:"Sesame Shiba", corgi:"Welsh Corgi",
  chihuahua:"Chihuahua", poodle:"Toy Poodle", bulldog:"French Bulldog", border:"Border Collie",
  chow:"Chow Chow", ig:"Italian Greyhound", golden:"Golden Retriever",
};
const I18N = {
  ko: { title:"강아지 산책", sub:"타자 한 글자·마우스 클릭 = 한 걸음", steps:"걸음", keys:"글자",
    exchange:"걸음 → 🦴 환전", shop:"🐕 강아지 상점", petSize:"페이지 강아지 크기",
    bg:"배경", bgFlower:"꽃밭", bgRoad:"도로", bgExcel:"엑셀", bgChrome:"크롬",
    cloud:"☁ 구글 계정에 자동 저장 (기기끼리 동기화)",
    walking:"산책 중", select:"선택", adopt:"입양" },
  en: { title:"Dog Walk", sub:"One key or click = one step", steps:"steps", keys:"keys",
    exchange:"Steps → 🦴 Exchange", shop:"🐕 Dog Shop", petSize:"On-page dog size",
    bg:"Background", bgFlower:"Flowers", bgRoad:"Road", bgExcel:"Excel", bgChrome:"Chrome",
    cloud:"☁ Auto-saved to your Google account (synced across devices)",
    walking:"Walking", select:"Select", adopt:"Adopt" },
};
function t(key) { return (I18N[LANG] && I18N[LANG][key]) || (I18N.ko[key] || key); }
function applyLang(lang) {
  LANG = lang === "en" ? "en" : "ko";
  document.documentElement.lang = LANG;
  document.body.setAttribute("data-lang", LANG);
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  const lt = $("langToggle"); if (lt) lt.textContent = LANG === "ko" ? "EN" : "한";
  if (last) renderShop(last);   // 상점 품종명·버튼 재렌더
}
$("langToggle").addEventListener("click", () =>
  chrome.storage.local.set({ lang: LANG === "ko" ? "en" : "ko" }));
chrome.storage.local.get("lang", ({ lang }) => applyLang(lang || "ko"));

// 시작: 상점(강아지) 목록 받고 → 현재 상태 로드
chrome.runtime.sendMessage({ type: "shop" }, (dogs) => {
  if (chrome.runtime.lastError) return;
  if (Array.isArray(dogs)) DOGS = dogs;
  send({ type: "get" });
});
