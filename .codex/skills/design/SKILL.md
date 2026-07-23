---
name: design
description: 디자인 작업을 담당하는 스킬
---

정리된 와이어 프레임과 에셋을 바탕으로 디자인을 진행하는 스킬

<HARD-GATE>
doc-curator 가 yusung-harness-doc mcp 서버에 먼저 조회를 실행하고, 작업하려는 페이지의 와이어 프레임과 에셋이 준비되지 않았으면, 와이어 프레임과 에셋이 준비되지 않았다는 메시지와 함계 작업을 종료한다.
</HARD-GATE>

## 호출할 에이전트 목록

> | 에이전트명  | 하는일                                                                                                              |
> | ----------- | ------------------------------------------------------------------------------------------------------------------- |
> | designer    | doc-curator에게 받은 정리된 에셋과 와이어프레임 바탕으로 ui,ux를 구현하여, 최종적으로 완성된 디자인의 아티팩트 산출 |
> | coder       | design 아티팩트 코드 작성                                                                                           |
> | researcher  | 비슷한 컨셉의 도메인을 서비스하는 각종 사이트들의 레퍼런스 체크                                                     |
> | doc-curator | 이미 존재하는 에셋과 와이어프레임을 mcp서버를 통해 조회하여, designer에게 전달한다.                                 |

## 디자인의 저장 단위

- 디자인은 wireframe과 asset의 조합을 통해 생성된다.
  - 예시)
    - **_전제조건_**: wireframeId 1과 wireframeId 2는 같은 page에 vesion만 다르다.
      > - wireframeId가 1, assetId 1을 조합해 design 1을 생성시 => design 1은 wireframeId 1의 ux에 assetId 1의 디자인 조합을 가짐.
      > - wireframeId가 1, assetId 2을 조합해 design 2를 생성시 => design 2는 design 1과 같은 ux지만, assetId 2이기 때문에 색감,로고,컨셉 등등이 다름.
      > - wireframeId가 2, assetId 1를 조합해 design 3을 생성시 => design 3은 design 1과 ux 디자인이 완전 다르지만, assetId가 1로 같기 때문에 색감, 로고, 컨셉 등등이 같음.
      > - wireframeId가 3, assetId 1을 조합해 design 4를 생성시 => design 4는 design1과 연결된 다른 페이지이다. design 1과 design4는 유저 인터렉트를 통해 상호 페이지 라우팅이 되는 html구조이다.
