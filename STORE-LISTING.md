# 크롬 웹스토어 등록 — 복붙용 문구 + 체크리스트

> 배포 zip: `dog-walk-store.zip` (manifest 루트, DEV/대용량 제외)
> 개인정보 처리방침 URL: **https://aingan.click/extension-privacy**

---

## 1. 기본 정보
- **이름**: 강아지 산책 — 타자로 걷기
- **카테고리**: 재미(Fun)  ※ 검색량 보고 '생산성'도 고려
- **언어**: 한국어(기본) + English

## 2. 설명 (Description)

### 한국어
```
키보드 한 글자가 강아지의 한 걸음! 🐕

아무 사이트에서나 타자를 칠수록 강아지가 화면을 걸어다녀요 — 바닥에서 벽으로, 천장까지 한 바퀴. 타자·클릭으로 모은 걸음을 🦴으로 환전해 11가지 품종(시바·웰시코기·치와와·토이푸들·프렌치불독·보더콜리·차우차우·이탈리안그레이하운드·골든리트리버…)을 입양·수집하세요.

· 옆 사이드패널에서 강아지·상점·크기조절 (툴바 아이콘 클릭)
· 화면 위 강아지는 항상 함께 산책
· 자동으로 안 걸어요 — 친 만큼만, 정확히

🔒 개인정보: 키를 친 '횟수(개수)'만 셉니다. 무슨 키를 눌렀는지는 절대 보지 않아요 = 키로거 아님. 외부 서버로 아무것도 보내지 않고, 본인 기기/구글 계정에만 저장됩니다.
```

### English
```
Every keystroke is a step for your dog! 🐕

Type on any website and your dog walks across your screen — floor to walls to ceiling, all the way around. Turn the steps you earn from typing & clicking into 🦴 coins, and adopt & collect 11 breeds (Shiba, Corgi, Chihuahua, Toy Poodle, French Bulldog, Border Collie, Chow Chow, Italian Greyhound, Golden Retriever…).

· Side panel for your dog, shop, and size (click the toolbar icon)
· Your on-screen dog is always walking with you
· No idle — it walks only as much as you type

🔒 Privacy: counts only the NUMBER of key presses, never which key you press (not a keylogger). Nothing is sent to any server; data stays on your device / your Google account.
```

## 3. 개인정보 보호(Privacy) 탭

- **개인정보처리방침 URL**: `https://aingan.click/extension-privacy`
- **단일 목적(Single purpose)**:
  ```
  타이핑/클릭 횟수를 강아지의 '걸음'으로 바꿔, 화면 위 펫으로 키우고 품종을 수집하는 노벨티 게임.
  ```
- **권한 사용 사유(Permission justification)** — 심사에서 특히 host 권한을 봅니다:
  - `storage`:
    ```
    게임 진행(걸음·코인·보유/선택 강아지)을 저장하고, 사용자의 구글 계정으로 기기끼리 동기화하기 위함.
    ```
  - 호스트 권한 `<all_urls>` (content script):
    ```
    사용자가 어느 웹페이지에서 타자를 쳐도 '키 입력 횟수만' 세어 강아지를 한 걸음 걷게 하기 위함.
    페이지 내용이나 입력한 키의 '내용'(e.key)은 전혀 읽지 않으며, 발생 횟수(카운트)만 사용합니다.
    ```
  - `sidePanel`:
    ```
    게임 화면(강아지·상점)을 브라우저 옆 사이드패널에 표시하기 위함.
    ```
- **원격 코드 사용**: 아니요(No) — 모든 코드는 패키지에 포함.
- **데이터 수집/판매**: 개인 식별 데이터를 수집·판매·공유하지 않음. (로컬 카운트만)

---

## 4. 무야호님이 직접 해야 하는 것 (여기서 못 만드는 자산)
- [ ] **크롬 개발자 계정** 등록($5 1회) — chrome.google.com/webstore/devconsole
- [ ] **128×128 아이콘** — `icons/icon-512.png`를 128로 줄여 업로드 (그림판/온라인 리사이저)
- [ ] **스크린샷 1~5장** (1280×800 또는 640×400) — ① 타자→강아지가 화면 걷기 ② 사이드패널(강아지+상점) ③ 품종 수집 ④ "업무위장 배경"(엑셀/크롬) ⑤ 환전
- [ ] (선택) 프로모 타일 440×280

## 5. 제출 순서
1. 개발자 콘솔 → **새 항목** → `dog-walk-store.zip` 업로드
2. 스토어 등록정보: 위 이름/설명/카테고리/언어 + 아이콘·스크린샷
3. 개인정보 보호 탭: 위 단일목적·권한사유 + 처리방침 URL
4. **검토를 위해 제출** → 구글 심사(수일~, `<all_urls>` 때문에 길어질 수 있음)
