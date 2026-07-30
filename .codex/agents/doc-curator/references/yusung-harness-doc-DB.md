# yusung-harness-doc mcp서버의 DB 테이블 문서 저장 정책 관리 문서

- DB 테이블에 저장되는 분류 단위는 타겟 프로젝트 DB의 테이블 단위이다.
  - 예시1: "TEST 프로젝트의 테이블이 ADMIN, USER, NOTICE, SERIES일 경우"
    |id|projectId|createdAt|updatedAt|title|content|
    |---|---|---|---|---|---|
    |1|5|...|...|ADMIN|...|
    |1|5|...|...|USER|...|
    |1|5|...|...|NOTICE|...|
    |1|5|...|...|SERIES|...|
    이런 식으로 테이블 별로 문서를 저장한다.
