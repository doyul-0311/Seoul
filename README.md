# 광화문 오늘 뭐 먹지

광화문·시청·종각·서촌 직장인용 점심·회식 장소 고르기 앱입니다.
메뉴 타일 → 도보 순 목록, ‘아무거나’ 랜덤 추천, 동료 후기(별점·한 줄 평), 동료 평점·구글 평점 정렬, 단골집 추가, ‘없어진 집’ 신고를 지원합니다.

- 화면: 그냥 HTML·CSS·JS (빌드 과정 없음)
- 배포: Vercel (무료)
- 후기 저장: Firebase Firestore + 익명 로그인 (무료 요금제로 충분)
- 구글 평점: Vercel 서버 함수 + Google Places API (선택, 결제 카드 등록 필요)

Firebase와 구글 키가 없어도 식당 목록·메뉴 고르기·아무거나는 바로 동작합니다. 설정할 때마다 기능이 하나씩 켜집니다.

## 파일 구성

| 파일 | 하는 일 |
|---|---|
| `index.html`, `style.css`, `app.js` | 화면과 동작 |
| `places.js` | **식당 목록과 기점.** 식당 추가·수정은 여기서 |
| `firebase-config.js` | Firebase 연결값 (2단계에서 채움) |
| `firestore.rules` | Firestore 보안 규칙 (2단계에서 붙여 넣음) |
| `api/ratings.js` | 구글 평점을 가져오는 서버 함수 (4단계) |
| `manifest.webmanifest`, `icons/` | 홈 화면 앱 아이콘 |

---

## 1단계. GitHub에 올리기

1. https://github.com 에 가입하고 오른쪽 위 **+ → New repository**.
2. 이름 예: `gwanghwamun-lunch`, Public 또는 Private 아무거나 → **Create repository**.
3. 만들어진 저장소 화면에서 **uploading an existing file** 링크를 누르고,
   이 폴더 **안의 파일과 폴더 전체**(`index.html`, `api/`, `icons/` 등)를 끌어다 놓은 뒤 **Commit changes**.
   - 폴더째가 아니라 *내용물*을 올려야 `index.html`이 저장소 맨 위에 옵니다.

## 2단계. 후기 저장소 만들기 (Firebase)

1. https://console.firebase.google.com → **프로젝트 추가** → 이름 입력 (Google 애널리틱스는 꺼도 됩니다).
2. **Firestore 만들기**: 왼쪽 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기**
   - 위치: `asia-northeast3 (서울)` 추천 (나중에 못 바꿉니다)
   - 모드: 아무거나 고른 뒤, 만들어지면 **규칙** 탭으로 가서 `firestore.rules` 내용을 통째로 붙여 넣고 **게시**.
3. **익명 로그인 켜기**: **빌드 → Authentication → 시작하기 → 로그인 방법 → 익명 → 사용 설정 → 저장**.
   - 앱은 사람들에게 로그인을 요구하지 않고, 뒤에서 자동으로 익명 로그인해 ‘내 후기 삭제’와 스팸 방지에 씁니다.
4. **웹 앱 등록**: 프로젝트 개요 옆 톱니바퀴 → **프로젝트 설정 → 내 앱 → 웹(</>)** → 앱 이름 입력 → 등록.
   나오는 `firebaseConfig = { ... }` 값을 복사해서 GitHub의 `firebase-config.js`를 열고(연필 아이콘) 이렇게 바꿉니다:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "...firebaseapp.com",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   };
   ```
   이 값은 원래 공개되는 값이라 GitHub에 올려도 괜찮습니다. 데이터 보호는 3번의 보안 규칙이 합니다.

## 3단계. 배포하기 (Vercel)

1. https://vercel.com → **Continue with GitHub**로 가입.
2. **Add New… → Project** → 1단계 저장소 옆 **Import**.
3. Framework Preset은 **Other** 그대로, 다른 설정은 건드리지 않고 **Deploy**.
4. 1분쯤 뒤 `https://gwanghwamun-lunch-xxxx.vercel.app` 같은 주소가 생깁니다. 이 주소를 동료들에게 공유하면 끝.
5. Firebase 콘솔 **Authentication → 설정 → 승인된 도메인**에 이 vercel 주소(https:// 없이)를 추가해 두세요.

이후 GitHub에서 파일을 고치면 Vercel이 자동으로 다시 배포합니다.
주소를 바꾸고 싶으면 Vercel 프로젝트 **Settings → Domains**에서 `gwh-lunch.vercel.app`처럼 바꿀 수 있습니다.

## 4단계 (선택). 구글 평점 켜기

구글 평점은 Google Places API를 써서 **서버 함수**(`api/ratings.js`)가 가져옵니다. API 키는 Vercel에만 두고 브라우저에는 나가지 않습니다.

1. https://console.cloud.google.com → 새 프로젝트 (2단계 Firebase 프로젝트를 골라도 됩니다).
2. **결제** 메뉴에서 결제 계정 연결 (카드 등록 필요).
   요금과 월 무료 사용량은 바뀔 수 있으니 *Google Maps Platform 가격표*에서 **Places API (New)**의 Text Search·Place Details 항목을 직접 확인하세요.
   평점(rating)을 받아 오는 호출은 상위 요금 등급에 속하는 것으로 안내돼 있습니다.
3. **API 및 서비스 → 라이브러리**에서 **Places API (New)** 검색 → 사용.
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키**.
   만든 키의 **API 제한사항**에서 *Places API (New)*만 허용하세요. (서버에서만 쓰니 ‘애플리케이션 제한사항’은 없음으로 둡니다.)
5. **요금 폭탄 방지 (꼭 하세요)**
   - **API 및 서비스 → Places API (New) → 할당량**에서 하루 요청 수 상한을 예: 300으로 낮춥니다.
   - **결제 → 예산 및 알림**에서 월 예산 알림을 걸어 둡니다.
6. Vercel 프로젝트 **Settings → Environment Variables**에 추가:
   - `GOOGLE_PLACES_API_KEY` = 4번에서 만든 키
   - (선택) `RATINGS_CACHE_SECONDS` = 결과 재사용 시간(초). 기본 3600(1시간).
7. **Deployments → 가장 최근 배포 ⋯ → Redeploy**. 앱 상단에 ‘구글 평점 표시 중’이 보이고 정렬에 **구글 평점** 버튼이 생기면 성공.

**호출 수 감 잡기.** 한 번 갱신할 때 기본 식당 34곳 = API 호출 34번입니다. 결과를 1시간 재사용하므로, 매일 점심 무렵 몇 시간만 쓰면 하루 수백 번 이하입니다.
누가 앱을 열 때마다 호출하는 구조가 아니라, 캐시가 만료된 뒤 첫 요청 때만 다시 가져옵니다.

**구글이 엉뚱한 집을 찾을 때.** 배포 주소 뒤에 `/api/ratings`를 붙여 열면 식당별로 구글이 찾은 이름(`name`)과 ID(`gid`)가 보입니다.
틀린 곳은 구글 지도에서 맞는 가게를 찾아 Place ID를 알아낸 뒤 `places.js`의 해당 식당에 `gid: 'ChIJ...'`를 넣으면 그 가게로 고정됩니다. (Place ID는 저장해 둬도 되는 값입니다.)
앱 상세 화면에도 이름이 다르면 ‘구글 등록명’이 같이 표시됩니다.

**지켜야 할 것.** 구글 평점을 보여 줄 때는 ‘Google 지도’ 출처 표기를 붙여야 하고(앱에 이미 들어 있음), 평점 같은 장소 정보를 데이터베이스에 저장해 두면 안 됩니다.
그래서 이 앱은 평점을 저장하지 않고 매번 서버 함수로 받아 오며, 짧게(기본 1시간) 재사용만 합니다. 정확한 조건은 Google Maps Platform 서비스 약관을 확인하세요.
사용자가 직접 추가한 식당은 구글 평점 대신 ‘구글 지도’ 링크만 보입니다(아무 이름이나 조회되어 비용이 새는 것을 막기 위해).

## 식당 고치기·추가하기

`places.js`의 `BASE` 목록을 수정합니다. 각 필드 설명은 파일 맨 위 주석에 있습니다.
- `id`에 후기가 묶이므로 한 번 정한 `id`는 바꾸지 마세요.
- 좌표(`lat`, `lng`)는 구글 지도에서 가게를 길게 눌러 나오는 숫자를 쓰면 정확해집니다.
- 기본 데이터는 2026년 10월 웹 자료로 정리한 것이라, 휴·폐업 여부는 한 번씩 확인하세요.

## 휴대폰에서 앱처럼 쓰기

- 아이폰(사파리): 공유 버튼 → **홈 화면에 추가**
- 안드로이드(크롬): ⋮ 메뉴 → **홈 화면에 추가** 또는 **앱 설치**

## 내 컴퓨터에서 미리 보기 (선택)

```bash
npm i -g vercel
vercel dev        # http://localhost:3000 — 서버 함수까지 함께 실행
```
Node.js 18 이상이 필요합니다. 구글 평점까지 보려면 `.env.local` 파일에 `GOOGLE_PLACES_API_KEY=...`를 넣으세요(이 파일은 GitHub에 올라가지 않습니다).

## 관리 팁

- 이상한 후기는 Firebase 콘솔 **Firestore Database → 데이터 → reviews**에서 문서를 지우면 됩니다.
- ‘없어진 집’ 신고는 `closed` 컬렉션에 쌓이고, 앱 맨 아래 ‘숨긴 곳 보기’에서 누구나 되돌릴 수 있습니다.
