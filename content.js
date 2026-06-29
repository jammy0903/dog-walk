// content.js — ① 키 신호 전송(모든 프레임) ② 화면 테두리(바닥·양벽·천장)를 도는 강아지 펫
//
// ⚠️ 개인정보: keydown '발생'만 안다. 무슨 키인지(e.key)는 절대 안 읽음 = 키로거 아님.
// v2: 타자 한 글자 또는 마우스 왼클릭 = 신호 1발(걸음 +1) + 펫 한 걸음. 펫은 크기조절 + 선택 강아지 반영.
// 펫은 바닥→오른벽→천장→왼벽 순으로 테두리를 돈다(모서리에서 회전, 발이 벽에 붙음).

(() => {
  const TOP = window.top === window; // 펫은 메인 화면(최상위 프레임)에만 1마리
  const url = (p) => chrome.runtime.getURL(p);
  const SEQ = [0, 1, 2, 3, 2, 1]; // 핑퐁
  const dogPrefix = (id) => (id === "cheese" ? "dog" : "dog-" + id);

  let selDog = "cheese",
    REST = url("assets/dog-rest.webp"),
    WALK = [1, 2, 3, 4].map((n) => url(`assets/dog-walk${n}.webp`));

  function setDogSprites(id) {
    selDog = id || "cheese";
    const p = dogPrefix(selDog);
    REST = url(`assets/${p}-rest.webp`);
    WALK = [1, 2, 3, 4].map((n) => url(`assets/${p}-walk${n}.webp`));
    if (img && !walking) img.src = REST;
  }

  let wrap = null,
    img = null,
    edge = "bottom", // 현재 붙어있는 면
    p = 60, // 그 면에서 진행한 거리(px)
    curAng = 0,
    phase = 0,
    restTimer = null,
    petOn = true,
    petSize = 92,
    walking = false,
    vidHide = false; // 동영상/전체화면 중엔 강아지 숨김(가림 방지)

  const NEXT = { bottom: "right", right: "top", top: "left", left: "bottom" };

  // 전체화면이거나 '충분히 큰' 동영상이 재생 중이면 강아지를 가린다.
  // (배경 자동재생 같은 작은 데코 영상은 무시 — 가로≥320·세로≥240만 '시청'으로 본다.)
  function fsActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function bigVideoPlaying() {
    for (const v of document.querySelectorAll("video")) {
      if (v.paused || v.ended || v.readyState < 2) continue;
      const r = v.getBoundingClientRect();
      if (r.width >= 320 && r.height >= 240) return true;
    }
    return false;
  }
  function applyVisibility() {
    // 강아지 표시 = 토글 ON 그리고 동영상/전체화면 아님. (OFF여도 걸음 집계는 계속됨)
    if (wrap) wrap.style.display = petOn && !vidHide ? "" : "none";
  }
  function localActive() {
    return fsActive() || bigVideoPlaying(); // '이' 프레임 자체의 재생/전체화면
  }

  // 임베드 대응: 강아지는 TOP에만 있으므로, 자식 프레임(iframe)은 자기 영상 상태를
  // chrome.runtime으로 background에 보고 → background가 같은 탭의 TOP 프레임에만 중계한다.
  // (웹페이지는 chrome.runtime을 못 써서 위·변조 불가 + 키=실제 frameId라 무한 증가 없음.)
  const childPlaying = new Map(); // TOP만 사용: frameId(number) -> bool
  let lastReported = null; // 자식 보고 디듀프
  function anyChildPlaying() {
    for (const v of childPlaying.values()) if (v) return true;
    return false;
  }
  function recalcHide() {
    const local = localActive();
    if (TOP) {
      const next = local || anyChildPlaying();
      if (next === vidHide) return;
      vidHide = next;
      applyVisibility(); // 숨김/등장(걸음·위치 상태는 그대로 보존)
    } else if (local !== lastReported) {
      lastReported = local; // 내 영상 상태가 바뀔 때만 background로 보고
      try {
        chrome.runtime.sendMessage({ type: "vid", playing: local });
      } catch (_) {}
    }
  }

  function makePet() {
    if (!TOP || wrap || !document.body) return;
    document.getElementById("__aingan_dog")?.remove(); // 옛/중복 인스턴스 잔재(확장 리로드 등) 제거 → 강아지 한 마리만
    wrap = document.createElement("div");
    wrap.id = "__aingan_dog";
    // 발(이미지 하단 중앙)이 (left,top)에 오도록 translate(-50%,-100%)
    wrap.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483600;pointer-events:none;" +
      "transform:translate(-50%,-100%);will-change:left,top;";
    img = document.createElement("img");
    img.src = REST;
    img.draggable = false;
    img.style.cssText =
      "display:block;width:auto;transform-origin:50% 100%;filter:drop-shadow(0 5px 4px rgba(0,0,0,.18));";
    img.style.height = petSize + "px";
    wrap.appendChild(img);
    document.body.appendChild(wrap);
    place();
    recalcHide(); // 만들 때 이미 동영상/전체화면이면 곧바로 숨김
  }

  function removePet() {
    if (wrap) wrap.remove();
    wrap = img = null;
  }

  // 현재 면·진행도에서 발 좌표·회전각·면 길이
  function geom() {
    const vw = window.innerWidth,
      vh = window.innerHeight,
      m = 4;
    switch (edge) {
      case "right": return { fx: vw - m, fy: vh - p, ang: -90, len: vh }; // 위로
      case "top": return { fx: vw - p, fy: m, ang: 180, len: vw }; // 왼쪽(거꾸로)
      case "left": return { fx: m, fy: p, ang: 90, len: vh }; // 아래로
      default: return { fx: p, fy: vh - m, ang: 0, len: vw }; // bottom, 오른쪽
    }
  }

  function place() {
    if (!wrap) return;
    const g = geom();
    curAng = g.ang;
    if (p > g.len) p = g.len;
    wrap.style.left = g.fx + "px";
    wrap.style.top = g.fy + "px";
    img.style.transform = `rotate(${g.ang}deg)`;
  }

  function advance() {
    p += 7;
    if (p >= geom().len) {
      edge = NEXT[edge]; // 모서리 → 다음 면으로 회전
      p = 0;
    }
  }

  function setPetSize(px) {
    petSize = Math.max(32, Math.min(240, px | 0)) || 92;
    if (img) img.style.height = petSize + "px";
    place();
  }

  // 키 한 번 = 다리 한 번 + 테두리 한 걸음 전진.
  function petStep() {
    if (!wrap) return;
    walking = true;
    phase = (phase + 1) % SEQ.length;
    img.src = WALK[SEQ[phase]];
    advance();
    place();
    img.animate(
      [
        { transform: `rotate(${curAng}deg) translateY(0)` },
        { transform: `rotate(${curAng}deg) translateY(-6px)` },
        { transform: `rotate(${curAng}deg) translateY(0)` },
      ],
      { duration: 220, easing: "ease-in-out" }
    );
    clearTimeout(restTimer);
    restTimer = setTimeout(() => {
      walking = false;
      if (img) img.src = REST; // 그 자리(벽이든 천장이든)에 쉼
    }, 600);
  }

  // 한 걸음 신호(걸음 +1 + 펫 한 걸음). 막지 않고 곁눈질만.
  function signalStep() {
    try {
      chrome.runtime.sendMessage({ type: "key" });
    } catch (_) {}
    if (petOn) petStep();
  }

  // 타자 한 글자 = 한 걸음
  window.addEventListener(
    "keydown",
    (e) => {
      if (!e.isTrusted) return; // 실제 사용자 입력만(스크립트 합성 이벤트로 걸음 조작 차단)
      if (e.repeat) return; // 꾹 누름 자동연타 제외
      signalStep();
    },
    true
  );

  // 마우스 왼쪽 클릭 한 번 = 한 걸음 (오른/가운데 클릭 제외)
  window.addEventListener(
    "mousedown",
    (e) => {
      if (!e.isTrusted) return; // 실제 사용자 입력만
      if (e.button !== 0) return;
      signalStep();
    },
    true
  );

  window.addEventListener("resize", place);

  // 동영상 재생/전체화면 진입·이탈을 감지해 숨김 상태 재계산.
  // play/pause는 버블 안 하지만 capture 단계 document 리스너는 자식 video의 이벤트도 받는다.
  ["fullscreenchange", "webkitfullscreenchange"].forEach((ev) =>
    document.addEventListener(ev, recalcHide, true)
  );
  ["play", "playing", "pause", "ended", "emptied"].forEach((ev) =>
    document.addEventListener(ev, recalcHide, true)
  );

  if (TOP) {
    // background가 중계한 자식 프레임 영상 보고 수신 → 합산 후 숨김 재계산.
    // (웹페이지가 못 끼어드는 신뢰 채널 + 키는 실제 frameId라 엔트리 수가 프레임 수로 제한됨)
    chrome.runtime.onMessage.addListener((m) => {
      if (m && m.type === "vidFrame" && typeof m.frameId === "number") {
        childPlaying.set(m.frameId, !!m.playing);
        recalcHide();
      }
    });
  } else {
    // 자식이 떠나면(닫힘/이동) '재생 중' 보고가 영영 남아 강아지가 계속 숨지 않도록 false 통지
    window.addEventListener("pagehide", () => {
      try {
        chrome.runtime.sendMessage({ type: "vid", playing: false });
      } catch (_) {}
    });
  }

  recalcHide(); // 스크립트 주입 시 이미 재생 중이면 즉시 반영(이벤트가 안 와도)

  chrome.storage.local.get(["petSize", "g", "petOn"], ({ petSize: ps, g, petOn: po }) => {
    petOn = po !== false; // 기본 ON(미설정=true). 팝업 토글이 false로 끄면 강아지만 숨김
    if (ps) petSize = ps;
    if (g && g.selDog) setDogSprites(g.selDog);
    makePet(); // 만들되 applyVisibility가 petOn에 따라 표시 결정
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    if (c.petOn) {
      petOn = c.petOn.newValue !== false; // 팝업에서 ON/OFF 바뀌면 즉시 반영
      applyVisibility();
    }
    if (c.petSize) setPetSize(c.petSize.newValue || 92);
    if (c.g && c.g.newValue && c.g.newValue.selDog !== selDog) {
      setDogSprites(c.g.newValue.selDog);
    }
  });
})();
