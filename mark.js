// document_start 에 <html> 에 마커 클래스를 심어, 확장 설치를 웹페이지가 감지할 수 있게 한다.
// 하우스 광고(예: 사이트에 걸어다니는 강아지 배너)를 우리 확장 사용자에게 숨기는 용도.
// content.js 는 document_idle 이라 늦음 → CSS 로 숨기려면 이 마커가 먼저 심어져야 깜빡임 없음.
document.documentElement.classList.add('dog-walk-ext-installed');
