# Th!nc Lie Detector 프로젝트 배포 및 검증 절대 규칙

이 규칙은 이 프로젝트에서 작업하는 모든 AI 에이전트가 최우선적으로 반드시 준수해야 하는 절대 규칙입니다.

## 1. Railway 배포 토큰 및 설정값
- **유효한 RAILWAY_TOKEN**: "00a47422-e97b-446a-b8e4-d04076dba030"
- **RAILWAY_PROJECT_ID**: "a8d045da-5ec9-43f6-850b-5a5585f2f136"
- **RAILWAY_SERVICE_ID**: "8f3d0685-6b8a-443c-9c46-a3c075121333"
- **ENVIRONMENT**: "production"

## 2. 배포 및 검증 작업 프로세스 의무화
- 어드민 페이지(admin.html, admin/index.html)나 백엔드 로직(server.js)을 포함하여 웹앱 구성 요소를 수정할 때마다 **아래 절차를 자동으로 밟아 배포를 끝맺어야 합니다.**
  1. 깃 커밋 및 푸시 (git push origin main) 완료
  2. 위 토큰 및 타겟 정보(ID)를 쉘 환경 변수에 설정하고 CLI 업로드 배포 강제 실행:
     `powershell
     $env:RAILWAY_TOKEN="00a47422-e97b-446a-b8e4-d04076dba030"
     $env:RAILWAY_PROJECT_ID="a8d045da-5ec9-43f6-850b-5a5585f2f136"
     $env:RAILWAY_SERVICE_ID="8f3d0685-6b8a-443c-9c46-a3c075121333"
     npx @railway/cli up --project a8d045da-5ec9-43f6-850b-5a5585f2f136 --service 8f3d0685-6b8a-443c-9c46-a3c075121333 --environment production -y
     `
  3. 배포 실행 후 **절대로 빌드 중인 상태에서 지레짐작으로 배포 성공 보고를 올리지 마십시오.**
  4. 타이머를 걸고 대기한 뒤, 온라인 서비스 주소(https://thinc-lie-detector-production.up.railway.app/admin/index.html)의 실제 HTML 내용을 read_url_content 등의 도구로 긁어옵니다.
  5. 다운로드한 소스코드에서 본인이 작업한 새로운 클래스명, 마크업 구조, 혹은 버전 꼬리표(예: v1.6.0-MODAL)가 **정상 확인될 때까지 교차 검증한 후** 비로소 사용자에게 배포 완료 리포트를 전송하십시오.
