// popup.js — 아이콘 클릭 팝업: ① 강아지 표시 ON/OFF 토글 ② 게임(사이드패널) 열기.
// 토글은 chrome.storage.local 의 petOn(boolean)만 바꾼다 → content.js가 즉시 반영(강아지 표시),
// background.js가 OFF 뱃지를 갱신. ⚠️ 걸음 집계(steps/taps)는 건드리지 않음 = OFF여도 그대로 적립.

const toggle = document.getElementById("toggle");
const stateEl = document.getElementById("state");

function render(on) {
  toggle.setAttribute("aria-pressed", on ? "true" : "false");
  stateEl.textContent = on ? "켜짐" : "꺼짐 (걸음수는 유지)";
}

chrome.storage.local.get("petOn", ({ petOn }) => render(petOn !== false));

toggle.addEventListener("click", () => {
  const on = toggle.getAttribute("aria-pressed") !== "true"; // 다음 상태
  render(on);
  chrome.storage.local.set({ petOn: on });
});

// 게임은 사이드패널로(기존 동작 유지). 버튼 클릭 = 유저 제스처라 open() 허용됨.
document.getElementById("openGame").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  } catch (_) {}
});
