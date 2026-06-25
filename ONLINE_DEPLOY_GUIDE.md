# Th!nc Lie Detector — 온라인 클라우드 서버 무료 배포 가이드

이 가이드는 로컬 컴퓨터에서만 실행되던 음성 stress 분석 및 유튜브 자막 수집용 Node.js 백엔드 서버를 **Render.com** 또는 **Railway.app** 등 무료 클라우드 서비스에 배포하고, AWS Amplify 등에 배포된 프론트엔드 웹앱에 5분 만에 연결하여 언제 어디서나 사용할 수 있게 만드는 방법을 안내합니다.

---

## 💡 왜 서버를 온라인에 배포해야 하나요?

1. **상시 기동**: 본인 컴퓨터의 로컬 서버(`server.js`)를 매번 켜두지 않아도 24시간 작동합니다.
2. **모바일 및 타 기기 완벽 지원**: 스마트폰이나 태블릿, 외부 PC에서도 주소만 입력하면 실시간 자막 수집 및 VSA 분석이 가능해집니다.
3. **보안/Mixed Content 방지**: HTTPS 암호화 통신을 기본 지원하여 크롬 등 최신 브라우저의 보안 경고(Mixed Content)를 차단합니다.

---

## 🚀 방법 1: Render.com에 무료 배포하기 (가장 추천)

Render.com은 무료 플랜(Free Tier)을 지원하며, 제공되는 `render.yaml` 설정 파일을 통해 마우스 몇 번 클릭만으로 서버를 배포할 수 있습니다.

### 1단계: GitHub에 소스코드 올리기
1. [GitHub](https://github.com/) 계정이 없다면 회원가입합니다.
2. 새 리포지토리(New Repository)를 생성합니다. (이름 예: `thinc-lie-detector`, Private으로 설정 권장)
3. 현재 폴더에 있는 파일들을 GitHub 리포지토리에 커밋하여 푸시(Push)합니다.
   * `render.yaml` 및 `Dockerfile` 파일이 루트 폴더에 포함되어 있는지 확인하세요.
   * `webapp` 폴더와 그 안의 `server.js` 등이 포함되어 있어야 합니다.

### 2단계: Render.com에 배포 신청
1. [Render 웹사이트](https://render.com/)에 접속하여 GitHub 계정으로 가입 및 로그인합니다.
2. 우측 상단의 **[New]** 버튼을 클릭하고 **[Blueprint]**를 선택합니다.
3. 방금 생성한 GitHub 리포지토리를 연동(Connect)합니다.
4. Render가 소스코드 내의 `render.yaml` 파일을 자동으로 감지하여 빌드/실행 설정을 세팅합니다.
   * 설정명이나 서비스명은 기본값으로 두고 **[Apply]**를 누릅니다.
5. 자동으로 빌드가 시작됩니다. (약 2~3분 소요)
6. 빌드가 완료되면 화면 좌측 상단에 `https://thinc-lie-server-xxxx.onrender.com` 과 같은 형태의 고유 주소가 생성됩니다. 이 주소를 복사해 둡니다.

---

## 🚄 방법 2: Railway.app에 배포하기 (대안)

Railway는 Docker 배포를 지원하여 루트에 제공된 `Dockerfile`을 자동으로 인지하여 구동됩니다.

1. [Railway.app](https://railway.app/)에 가입 및 로그인합니다.
2. **[New Project]** -> **[Deploy from GitHub repo]**를 선택하여 소스코드가 담긴 리포지토리를 선택합니다.
3. Railway가 자동으로 루트의 `Dockerfile`을 감지하여 Node.js 20 환경에서 백엔드를 빌드합니다.
4. 배포 성공 후, 서비스 설정의 **[Settings]** -> **[Domains]** 탭에서 **[Generate Domain]**을 클릭하면 고유한 HTTPS 백엔드 주소가 생성됩니다. 이 주소를 복사합니다.

---

## 🔗 3단계: 온라인 배포된 웹앱에 연결하기

클라우드 서버 배포가 끝났다면 이제 프론트엔드 웹앱이 해당 주소를 바라보게 등록해주어야 합니다. 소스코드를 일일이 고쳐서 재배포할 필요 없이, **어드민 콘솔**에서 간단하게 연동할 수 있습니다.

1. AWS Amplify 등으로 배포된 웹앱의 **어드민 페이지**에 접속합니다.
   * 예: `https://social.d2c4634txdspss.amplifyapp.com/admin.html`
2. 보안 인증 비밀번호인 `koko`를 입력하여 어드민 대시보드에 진입합니다.
3. **"2. Global Scaling Settings"** 영역 하단으로 스크롤을 내립니다.
4. **"🌐 Custom Backend URL (Online Server)"** 필드를 찾습니다.
5. 방금 전 Render나 Railway에서 복사한 주소를 붙여넣습니다.
   * 입력 예시: `https://thinc-lie-server.onrender.com`
   * (주의) 주소 끝에 슬래시(`/`)는 입력하지 않아도 자동으로 제거되어 안전하게 처리됩니다.
6. 하단의 **[💾 Save & Apply Settings]** 버튼을 눌러 설정을 저장합니다.
7. 메인 페이지(`index.html` 또는 `desktop.html`)로 돌아가서 원하시는 유튜브 영상을 검색 후 재생해 봅니다.
   * 웹앱이 사용자가 방금 등록한 온라인 백엔드 서버를 1순위로 호출하여 자막 데이터를 1초 만에 불러옵니다!
   * 만약 온라인 서버가 꺼져있거나 느린 경우, 자동으로 로컬 서버(`http://localhost:8080`)로 통신을 우회(Fallback)하므로 매우 유연하고 안정적입니다.
