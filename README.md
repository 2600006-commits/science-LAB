# 🧪 과학실 재고 관리 시스템

Google 드라이브(스프레드시트 + Drive) 를 무료 백엔드로, GitHub Pages를 프론트엔드 호스팅으로 사용하는
과학실 재고 관리 웹앱입니다.

- **재고관리**: 물품 추가/검색/재고 조정, 엑셀 일괄 등록, 구매요청
- **LAB 관리**: 보관위치·타입·판매처·등록자 관리
- **구매관리**: 요청→승인→주문→수령 진행상황, 엑셀 다운로드, 수령 시 재고 자동 반영
- **회원가입/로그인**: 이메일 회원가입 + 관리자 승인제
- **모바일 사진 촬영**: 물품에 사진을 찍어서 바로 첨부/삭제
- **재고 변경 이력 자동 기록**

---

## 1. 구조

```
lab-inventory/
├── index.html          # 메인 화면
├── css/style.css        # 디자인
├── js/api.js             # 백엔드(Apps Script) 통신
├── js/app.js             # 화면 로직 전체
├── backend/Code.gs       # Google Apps Script 백엔드 코드
└── README.md
```

프론트엔드(html/css/js)는 **GitHub Pages**에, 백엔드(Code.gs)는 **Google Apps Script**에 각각 배포합니다.
데이터는 Google 스프레드시트에, 사진은 Google 드라이브 폴더에 저장됩니다.

---

## 2. 백엔드 설정 (Google Apps Script)

1. [Google Sheets](https://sheets.google.com)에서 **새 스프레드시트**를 만듭니다. (예: "과학실 재고 관리 DB")
2. 상단 메뉴 **확장 프로그램 → Apps Script** 클릭
3. 기본으로 열려 있는 `Code.gs` 파일 내용을 전부 지우고, 이 저장소의 `backend/Code.gs` 내용을 통째로 붙여넣습니다.
4. 저장(⌘/Ctrl+S) 후, 함수 선택 드롭다운에서 **`setupSpreadsheet`** 를 선택하고 ▶ 실행 버튼을 클릭합니다.
   - 최초 실행 시 권한 승인 화면이 뜨면 본인 계정으로 허용해주세요.
   - 실행이 끝나면 스프레드시트에 필요한 시트(Users, Locations, Items 등)가 자동 생성됩니다.
   - 관리자 기본 비밀번호는 `admin1234` 로 설정됩니다. **반드시 아래 6번 안내에 따라 변경하세요.**
5. 상단의 **배포 → 새 배포** 클릭
   - 유형: **웹 앱**
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자** (Anyone) — 이래야 로그인 전에도 로그인/회원가입 요청이 가능합니다.
   - **배포** 클릭 → 생성된 **웹 앱 URL**을 복사해둡니다. (`https://script.google.com/macros/s/xxxx/exec` 형태)

> ⚠️ 코드를 수정한 뒤에는 "배포 → 배포 관리 → 수정(연필 아이콘) → 새 버전"으로 다시 배포해야 반영됩니다.

---

## 3. 프론트엔드에 백엔드 URL 연결

`js/api.js` 파일을 열어 아래 줄을 방금 복사한 웹 앱 URL로 교체합니다.

```js
const GAS_WEB_APP_URL = 'PUT_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
```
↓
```js
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/여기에_본인_URL/exec';
```

---

## 4. GitHub에 올리고 Pages로 배포

1. GitHub에서 새 저장소 생성 (예: `lab-inventory`)
2. 이 폴더(`lab-inventory/`) 전체를 그대로 push
   ```bash
   git init
   git add .
   git commit -m "과학실 재고 관리 시스템 초기 구축"
   git branch -M main
   git remote add origin https://github.com/<본인계정>/lab-inventory.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages**
   - Source: `Deploy from a branch`
   - Branch: `main` / `/ (root)` 선택 후 저장
4. 몇 분 뒤 `https://<본인계정>.github.io/lab-inventory/` 로 접속 확인

---

## 5. 사용 흐름

1. 사이트 접속 → 사이드바 **회원가입**으로 계정 생성 (관리자 승인 전까지 로그인 불가)
2. 우측 상단 **관리자** 버튼 클릭 → 관리자 비밀번호 입력 → 가입 승인 대기 목록에서 **승인**
3. 승인된 계정으로 **로그인** → LAB 관리에서 보관위치/타입/판매처를 먼저 세팅
4. 재고관리에서 물품 추가, 엑셀 일괄 등록, 구매요청 진행
5. 구매관리에서 요청 → 승인 → 주문 → 수령 순서로 상태 변경 시, **수령**으로 바꾸면 재고에 자동 반영됩니다.
6. 물품의 "사진" 버튼으로 모바일 카메라 촬영 사진을 즉시 업로드/삭제할 수 있습니다.
7. 물품의 "이력" 버튼으로 재고 수량 변경 히스토리를 확인할 수 있습니다.

---

## 6. 보안 관련 필수 체크리스트

- **관리자 비밀번호 변경(필수)**: Apps Script 편집기에서 아래 함수를 임시로 추가해 한 번 실행한 뒤 삭제하세요.
  ```js
  function changeAdminPassword() {
    setConfig('adminPasswordHash', hashText('새로운비밀번호'));
  }
  ```
- 회원 비밀번호는 SHA-256 + salt로 해시 저장되며, 평문으로 저장되지 않습니다.
- 스프레드시트 자체 공유 권한은 본인(관리자) 계정만 편집 가능하도록 유지하세요. (Apps Script는 별도 인증으로 접근하므로 스프레드시트를 공유하지 않아도 앱은 정상 동작합니다.)
- `js/api.js`의 `GAS_WEB_APP_URL`은 외부에 공개되어도 되지만(웹 앱 특성상 코드가 공개됨), 관리자 비밀번호와 사용자 비밀번호는 항상 안전하게 관리하세요.

---

## 7. 알아두면 좋은 한계

이 프로젝트는 **무료 · 노서버** 구성을 위해 Google Apps Script를 백엔드로 사용합니다. 학교 과학실처럼 동시 사용자가 많지 않은 환경에는 충분하지만, 아래 제약이 있습니다.

| 항목 | 내용 |
|---|---|
| 응답 속도 | 일반 서버보다 느릴 수 있음 (요청당 약 1~3초) |
| 동시 처리 | Apps Script 무료 할당량 내에서 동작 (개인 계정 기준 일일 실행 제한 있음) |
| 실시간 동기화 | 실시간 반영이 아닌, 새로고침/재조회 기반 |
| 관리자 세션 | 관리자 인증은 하루 단위로 유효한 간단한 토큰 방식입니다 |

사용자가 많아지거나 실시간성이 중요해지면 Firebase 또는 자체 서버(Node.js + DB)로 이전을 고려하세요.

---

## 8. 커스터마이징 팁

- 디자인 토큰(색상, 폰트, 라운드 등)은 `css/style.css` 상단 `:root` 변수에서 한 번에 조정할 수 있습니다.
- 엑셀 템플릿 컬럼 순서는 `js/app.js`의 `EXCEL_COLUMNS` 배열과 `submitExcelUpload()` 함수의 컬럼 인덱스를 함께 수정하세요.
- 구매 진행 상태 단계는 `backend/Code.gs`의 `PURCHASE_STATUS`와 `js/app.js`의 `PO_STATUSES`를 함께 수정하세요.
