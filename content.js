// content.js — ① 키 신호 전송(모든 프레임) ② 화면 테두리(바닥·양벽·천장)를 도는 강아지 펫
//
// ⚠️ 개인정보: keydown '발생'만 안다. 무슨 키인지(e.key)는 절대 안 읽음 = 키로거 아님.
// v2: 타자 한 글자 또는 마우스 왼클릭 = 신호 1발(걸음 +1) + 펫 한 걸음. 펫은 크기조절 + 선택 강아지 반영.
// 펫은 바닥→오른벽→천장→왼벽 순으로 테두리를 돈다(모서리에서 회전, 발이 벽에 붙음).

(() => {
  const TOP = window.top === window; // 펫은 메인 화면(최상위 프레임)에만 1마리

  // 확장이 리로드/업데이트되면 이 content script는 '고아'가 되어 chrome.runtime이 무효화된다.
  // 그 뒤 chrome-extension:// 리소스 요청은 전부 실패(net::ERR_FAILED) → 강아지가 깨진 아이콘으로 박힌다.
  // 컨텍스트가 죽으면 강아지를 깔끔히 걷어낸다(다음 페이지 로드 때 새 스크립트가 정상 재생성).
  let dead = false;
  function contextAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }
  function teardown() {
    dead = true;
    removePet(); // removePet은 함수 선언(호이스팅)이라 여기서 안전하게 호출됨
  }
  const url = (p) => {
    try { return chrome.runtime.getURL(p); } catch (_) { teardown(); return ""; }
  };
  const SEQ = [0, 1, 2, 3, 2, 1]; // 핑퐁
  const dogPrefix = (id) => (id === "cheese" ? "dog" : "dog-" + id);

  // 대부분의 종은 '오른쪽'을 바라보게 그려져 있고, 테두리 걷기·회전 로직도 그 전제로 짜였다.
  // 재미는 원본이 '왼쪽'을 바라봐서 뒤로 걷는 것처럼 보였다 → 이 종만 좌우 반전(scaleX(-1))해
  // 오른쪽을 보게 만든다. 여기 id를 추가하면 다른 좌향 종도 똑같이 뒤집을 수 있다.
  const FLIP_DOGS = new Set(["jaemi"]);
  const flipTf = () => (FLIP_DOGS.has(selDog) ? " scaleX(-1)" : "");

  let selDog = "cheese",
    REST = url("assets/dog-rest.webp"),
    WALK = [1, 2, 3, 4].map((n) => url(`assets/dog-walk${n}.webp`));

  // 디코드된 프레임 보관(GC 방지 → src 교체 시 항상 캐시에서 즉시 표시)
  let preloadCache = [];
  // src → "W / H". 프레임마다 자연 종횡비가 다르므로(특히 '재미': 1.06~1.53)
  // '지금 보여주는 그 프레임'의 비율로 박스를 맞춰야 늘어남/찌부가 없다.
  let ratioBySrc = Object.create(null);

  // <img>에 프레임을 건다. 그 프레임의 종횡비를 알면 박스도 즉시 그 비율로 고정한다.
  // 이렇게 프레임별로 맞춰야 object-fit:fill이 다른 비율 이미지를 뭉개는 일이 없고,
  // 아직 디코드 안 된 찰나에도 박스 가로폭이 0으로 붕괴하지 않는다('1자' 찌부 방지).
  function showFrame(src) {
    if (!img) return;
    img.src = src;
    const r = ratioBySrc[src];
    if (r) img.style.aspectRatio = r;
  }

  // 현재 강아지의 REST+WALK 프레임을 미리 받아 디코드까지 강제 + 프레임별 종횡비 기록.
  function preloadFrames() {
    preloadCache = [REST, ...WALK].map((src) => {
      const im = new Image();
      im.src = src;
      (im.decode ? im.decode() : Promise.resolve())
        .then(() => {
          if (!im.naturalWidth || !im.naturalHeight) return;
          ratioBySrc[src] = im.naturalWidth + " / " + im.naturalHeight;
          // 지금 화면에 떠 있는 프레임이면 비율도 곧바로 반영
          if (img && img.src === src) img.style.aspectRatio = ratioBySrc[src];
        })
        .catch(() => {});
      return im;
    });
  }

  function setDogSprites(id) {
    selDog = id || "cheese";
    const p = dogPrefix(selDog);
    REST = url(`assets/${p}-rest.webp`);
    WALK = [1, 2, 3, 4].map((n) => url(`assets/${p}-walk${n}.webp`));
    preloadFrames(); // 새 강아지 프레임 미리 디코드 + 종횡비 갱신
    if (img && !walking) showFrame(REST);
    place(); // 종 변경 시 좌우반전(flip) 여부를 즉시 transform에 반영(img 없으면 no-op)
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

  // 인쇄물엔 강아지가 안 찍히게 한다. 화면에선 보이지만 @media print에서만 숨김.
  // (토글 상태와 무관하게 항상 적용 = '안보이게하기'를 안 해도 프린트엔 안 나옴)
  function injectPrintHide() {
    if (document.getElementById("__aingan_dog_pstyle")) return;
    const st = document.createElement("style");
    st.id = "__aingan_dog_pstyle";
    st.textContent = "@media print{#__aingan_dog{display:none!important}}";
    (document.head || document.documentElement).appendChild(st);
  }

  function makePet() {
    if (!TOP || wrap || !document.body) return;
    document.getElementById("__aingan_dog")?.remove(); // 옛/중복 인스턴스 잔재(확장 리로드 등) 제거 → 강아지 한 마리만
    injectPrintHide(); // 인쇄 시 강아지 숨김 규칙 주입
    wrap = document.createElement("div");
    wrap.id = "__aingan_dog";
    // 발(이미지 하단 중앙)이 (left,top)에 오도록 translate(-50%,-100%)
    wrap.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483600;pointer-events:none;" +
      "transform:translate(-50%,-100%);will-change:left,top;";
    img = document.createElement("img");
    img.draggable = false;
    // 프레임 로드 실패 시: 확장이 무효화된 상태면 깨진 아이콘 대신 강아지를 제거.
    // (컨텍스트가 살아있는데 실패하는 경우는 사실상 없어, 정상 동작 중 오제거를 막는다.)
    img.onerror = () => { if (!contextAlive()) teardown(); };
    // object-fit:contain + 하단 정렬 = 박스 비율이 프레임과 잠깐 어긋나도
    // 이미지를 뭉개지 않고 여백을 두며, 발은 항상 바닥(하단 중앙)에 붙는다.
    img.style.cssText =
      "display:block;width:auto;object-fit:contain;object-position:50% 100%;" +
      "transform-origin:50% 100%;filter:drop-shadow(0 5px 4px rgba(0,0,0,.18));";
    img.style.height = petSize + "px";
    showFrame(REST); // 첫 프레임(비율은 preload 디코드 시 반영)
    wrap.appendChild(img);
    document.body.appendChild(wrap);
    preloadFrames(); // 기본(치즈) 강아지 프레임도 미리 디코드 + 종횡비 고정
    place();
    recalcHide(); // 만들 때 이미 동영상/전체화면이면 곧바로 숨김
    applyVisibility(); // ⚠️ OFF 상태로 새로 로드된 페이지도 즉시 숨김(makePet은 기본 display로 생성됨)
  }

  function removePet() {
    if (wrap) wrap.remove();
    wrap = img = null;
  }

  // 현재 면·진행도에서 발 좌표·회전각·면 길이
  // ⚠️ innerWidth/innerHeight가 아니라 clientWidth/clientHeight를 쓴다.
  // innerWidth는 세로 스크롤바 폭(~15px)까지 포함하므로, 오른쪽 벽 강아지를
  // vw-4에 놓으면 몸 일부가 스크롤바 뒤로 가려져 '오른쪽에서만 작아 보이는' 버그가 났다.
  // clientWidth/Height는 스크롤바를 뺀 '실제 보이는 영역'이라 강아지가 온전히 붙는다.
  function geom() {
    const de = document.documentElement,
      vw = de.clientWidth || window.innerWidth,
      vh = de.clientHeight || window.innerHeight,
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
    // scaleX(-1)은 rotate 오른쪽(=먼저 적용)에 둬서 '스프라이트를 뒤집은 뒤 회전' 순서를 지킨다.
    // → 좌향 종도 우향 종과 똑같은 회전 결과(발이 벽에 붙음)를 얻는다.
    img.style.transform = `rotate(${g.ang}deg)` + flipTf();
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
    showFrame(WALK[SEQ[phase]]);
    advance();
    place();
    const f = flipTf(); // 좌향 종은 회전 뒤 좌우반전(세로 뜀 translateY엔 영향 없음)
    img.animate(
      [
        { transform: `rotate(${curAng}deg)${f} translateY(0)` },
        { transform: `rotate(${curAng}deg)${f} translateY(-6px)` },
        { transform: `rotate(${curAng}deg)${f} translateY(0)` },
      ],
      { duration: 220, easing: "ease-in-out" }
    );
    clearTimeout(restTimer);
    restTimer = setTimeout(() => {
      walking = false;
      showFrame(REST); // 그 자리(벽이든 천장이든)에 쉼
    }, 600);
  }

  // 한 걸음 신호(걸음 +1 + 펫 한 걸음). 막지 않고 곁눈질만.
  function signalStep() {
    if (dead) return;
    if (!contextAlive()) { teardown(); return; } // 리로드 후 첫 입력에서 고아 감지 → 정리
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
  // 다른 기기에서 끈 상태(sync)면 이 탭도 반영 — 로컬 기본값(ON)이 계정 설정을 이기지 않게.
  chrome.storage.sync.get("petOn", ({ petOn: po }) => {
    if (po !== undefined) { petOn = po !== false; applyVisibility(); }
  });
  chrome.storage.onChanged.addListener((c, area) => {
    // petOn은 local(같은 브라우저 즉시)·sync(다른 기기) 어느 쪽에서 바뀌든 반영
    if (c.petOn && (area === "local" || area === "sync")) {
      petOn = c.petOn.newValue !== false;
      applyVisibility();
    }
    if (area !== "local") return;
    if (c.petSize) setPetSize(c.petSize.newValue || 92);
    if (c.g && c.g.newValue && c.g.newValue.selDog !== selDog) {
      setDogSprites(c.g.newValue.selDog);
    }
  });
})();
