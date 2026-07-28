# yusung-harness-doc mcp서버의 ArchitecturePlan 테이블 문서 저장 정책 관리 문서

- architecture Plan은 content와 html로 이루어져있다.
- architecture Plan을 작성 시 content에는 md파일 형식의 아키텍쳐 구성 설명을, html에는 인프라 구성도를 그린다.
- 필수 생성 내용은 반드시 작성한다. 나머지 내용은 요구사항에 맞게 적절히 작성한다.

## content의 필수 생성 내용

```md
# 기술 스택

- `${표 형태로 정리}`

# 네트워크

- ASCII art(아스키 아트) 형태로 그림을 그림

# 배포 전략
```

## html의 필수 생성 내용

- html 로 배포 인프라 구조도를 그린다.
- 배포 인프라의 아이콘을 사용해서 그린다.
  - ex: Supabase 배포 시 Supabase의 리소스 아이콘들. AWS 배포 시 AWS의 리소스 아이콘들.
