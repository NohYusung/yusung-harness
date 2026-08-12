---
name: design
description: 디자인 작업을 담당하는 스킬
---

정리된 와이어 프레임과 에셋을 바탕으로 디자인을 진행하는 스킬

<HARD-GATE>
doc-curator 가 yusung-harness-doc mcp 서버에 먼저 조회를 실행하고, 작업하려는 페이지의 와이어 프레임과 에셋이 준비되지 않았으면, 와이어 프레임과 에셋이 준비되지 않았다는 메시지와 함계 작업을 종료한다.
이 작업은 독립 디자인 작업이 아니다. 이미 정의된 와이어프레임과 에셋 기반으로 조합하여, 두 리소스를 모두 충족하는 정확한 결과물을 산출하여야 한다.
</HARD-GATE>

## 호출할 에이전트 목록

| 에이전트명  | 하는일                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| coder       | 코드 검색, 코드 작성, 코드 수정                                                                                     |
| designer    | doc-curator에게 받은 정리된 에셋과 와이어프레임 바탕으로 ui,ux를 구현하여, 최종적으로 완성된 디자인의 아티팩트 산출 |
| doc-curator | 이미 존재하는 에셋과 와이어프레임을 mcp서버를 통해 조회하여, designer에게 전달한다.                                 |

## 워크플로우

> - doc-curator는 먼저 yusung-harness-doc mcp 서버의 'get_project'를 통해 작업 지시가 내려진 레포가 project로 등록이 되어있는지 확인한다.
> - 만약 project로 등록이 되어있지 않으면, 'project로 등록되지 않았습니다. 먼저 레포를 project로 등록하세요' 라고 반환한 후 메인 에이전트의 대화를 종료한다.
> - 디자인 작업을 위한 필수 요소는 `${타겟 프로젝트}`, `${와이어 프레임 버전}` 과 `${에셋 ID}` 이다. 이 부분이 정의가 되지않으면, 메인 에이전트의 대화를 종료시키고, 유저에게 '디자인 범위가 확정되지 않았습니다. 먼저 `${확정되지 않은 scope명시}`를 확정하세요.' 라고 명시한다.
>   - 와이어 프레임 버전에 묶인 모든 와이어프레임 페이지가 작업 대상이다.
>     - 예시)
>       | id | projectId | title | version | ... |
>       | --- | --------- | ----------- | ---- | --- |
>       | 1 | 1 | 로그인 화면 | 1 | ... |
>       | 2 | 1 | 홈 화면 | 1 | ... |
>       | 3 | 1 | 작품 화면 | 1 | ... |
>       - 이 경우, 작업하는 projectId 1에 해당하는 version 1의 모든 페이지가 작업 scope이다.
>   - 작업하는 projectId 1에 해당하는 version 1의 모든 페이지에 `${에셋 ID}`의 내용을 적용하여, 디자인으로 산출한다.
> - 이미 있는 디자인 문서의 수정 목적일 경우, `${타겟 프로젝트}`, `${와이어 프레임 버전}` 과 `${에셋 ID}` 는 필수 요소가 아니다.
> - coder는 html 을 작업한 후 doc-curator에게 전달하여 저장한 후 워크스페이스에서 개발용으로 저장한 파일을 삭제한다.

### 디자인의 생성 원칙

<RULE>
- 디자인은 wireframe과 asset의 조합을 통해 생성된다.
  - 예시)
    - **_전제조건_**: wireframeId 1과 wireframeId 2는 같은 page에 vesion만 다르다.
      > - wireframeId가 1, assetId 1을 조합해 design 1을 생성시 => design 1은 wireframeId 1의 ux에 assetId 1의 디자인 조합을 가짐.
      > - wireframeId가 1, assetId 2을 조합해 design 2를 생성시 => design 2는 design 1과 같은 ux지만, assetId 2이기 때문에 색감,로고,컨셉 등등이 다름.
      > - wireframeId가 2, assetId 1를 조합해 design 3을 생성시 => design 3은 design 1과 ux 디자인이 완전 다르지만, assetId가 1로 같기 때문에 색감, 로고, 컨셉 등등이 같음.
      > - wireframeId가 3, assetId 1을 조합해 design 4를 생성시 => design 4는 design1과 연결된 다른 페이지이다. design 1과 design4는 유저 인터렉트를 통해 상호 페이지 라우팅이 되는 html구조이다.

- 디자인은 프로덕션 레벨의 완성된, 바로 적용해도 무리없을 정도의 디자인 완성도를 목표로 한다.

- 웹 UI 디자인은 모바일과 데스크톱을 모두 필수 scope로 취급한다.
  - 페이지마다 모바일·데스크톱 표현을 함께 지원하는 하나의 반응형 완전 HTML 문서를 생성한다.
  - 완전 HTML 문서의 `<head>`에는 `<meta name="viewport" content="width=device-width, initial-scale=1" />`를 포함한다.
  - CSS는 mobile-first로 작성하고, breakpoint는 콘텐츠와 interaction이 깨지는 지점을 기준으로 설정한다.
  - 모바일·데스크톱별 HTML, Design record, title suffix 또는 version을 별도로 생성하지 않는다.
  - viewport가 달라도 콘텐츠, 핵심 action, route target, 의미 있는 DOM 순서와 접근성 정보는 유지한다.
  - 모바일에서 sidebar를 drawer나 bottom navigation으로 바꾸는 등 새로운 IA·navigation·interaction이 필요하지만 Wireframe에 정의되어 있지 않으면 임의로 추가하지 않는다. 이 경우 디자인 저장을 중단하고 Wireframe 보완을 요청한다.
  - touch·pointer·keyboard 입력으로 같은 핵심 여정을 완료할 수 있어야 하며, 주요 touch target은 최소 `44 × 44 CSS px`를 확보한다.
  - document 전체의 비의도적 가로 overflow, 콘텐츠·control·focus ring의 겹침이나 잘림을 금지한다. 표·canvas처럼 수평 이동이 필요한 영역은 명시된 지역 scroll container가 overflow를 소유한다.
  - fixed·sticky control은 safe area, virtual keyboard와 focus ring을 가리지 않아야 한다.

- 디자인도 와이어프레임처럼 페이지 컴포넌트 별로 저장한다.
  - 예시)
    |id|projectId|title|html|...|
    |---|---|---|---|---|
    |1|1|로그인 화면|...|...|
    |2|1|홈 화면|...|...|
    |3|1|작품 화면|...|...|
    - title의 생성 규칙은 작업 scope의 와이어 프레임의 title을 그대로 따라간다.

- 디자인된 각 화면의 html들은 서로 이어져있어 유저 action에 따른 인터렉티브 ux 트랜지션이 가능해야 한다.
  - 예시)
    > 유저가 '로그인' 버튼 클릭 -> home 화면 -> '작품 보러가기' 버튼 클릭 -> 작품 화면

- **_참조하는 wireframe과 asset은 단순 참고 리소스가 아니고, 구현을 위한 source of truth이다._**
  - 즉, 반드시 wireframe과 동일한 ux, ui구조를 갖춰야 하며, 반드시 asset에서 정의한 리소스 들을 사용하여야만 한다.

- design도 wireframe처럼 관리 기준은 version이다.
  - 디자인된 html들은 같은 version들끼리 라우팅이 되는 구조이다.

- yusung-harness-doc 웹 대시보드의 Wireframe과 Design preview는 같은 HTML을 다음 artifact viewport로 번갈아 렌더링할 수 있어야 한다.
  - `Mobile`: `390 × 844 CSS px`
  - `Desktop`: `1440 × 900 CSS px`
  - 기본 mode는 `Desktop`이며, 사용자가 선택한 mode는 같은 dashboard Workbench mount에서 record나 relation을 이동해도 유지한다. full reload 또는 Workbench remount 시에는 `Desktop`으로 초기화한다.
  - viewport 전환은 같은 record, Design version, `wireframeId`, `assetId`와 `html`을 유지하고 iframe의 실제 width와 height만 변경한다.
  - preview mode는 HTML 내부 control이나 저장 payload가 아니라 dashboard preview chrome의 UI 상태이다.
  - host pane보다 iframe이 크면 preview canvas가 overflow를 소유한다. iframe을 host 폭에 강제로 맞추거나 실제 iframe 크기 변경 없이 `transform: scale()`만 적용해서는 안 된다.
  - control은 `Preview viewport`라는 접근 가능한 단일 선택 그룹으로 제공하고 현재 mode와 치수를 시각적 label 및 접근성 상태로 노출한다.
  - Asset, Architecture Plan과 ERD preview에는 이 모바일·데스크톱 토글을 적용하지 않는다.

- 이번 작업 scope의 디자인 페이지는 저장 hand-off 전에 viewport별 품질을 검증한다.
  - Design 생성은 선택한 Wireframe version의 모든 페이지, 기존 Design 수정은 수정 대상 페이지, 검증 전용 작업은 승인된 검증 범위만 대상으로 한다.
  - 중립 렌더러에서 `320 × 568`, `390 × 844`, `768 × 1024`, `1440 × 900 CSS px`로 반응형 reflow를 확인한다.
  - 페이지가 breakpoint `B`를 선언하면 영향을 받는 화면을 `B-1px`과 `Bpx`에서도 추가 검증한다.
  - dashboard preview에서 `Mobile 390 × 844`와 `Desktop 1440 × 900`을 각각 선택하여 실제 iframe 크기, CSP와 route 연결 호환성을 확인한다.
  - 모바일과 데스크톱에서 같은 핵심 여정을 처음부터 끝까지 실행한다.
  - fixed·sticky control이나 입력 form이 있는 화면은 viewport 높이 축소, 입력 focus와 safe-area inset 상태에서도 primary action과 focus target이 가려지지 않는지 확인한다.
  - 검증 evidence에는 대상 record 또는 Design ID, renderer, mode, 실제 width와 height, 실행 action·route, 기대·실제 결과, 재현 가능한 증거 참조와 finding ID를 기록한다. 대상 페이지와 필수 viewport의 모든 조합에 evidence가 있어야 완료할 수 있다.
  - primary action 접근 불가, 비의도적 document 가로 overflow, 콘텐츠·control·focus ring 잘림이나 겹침, hover-only action 또는 touch·keyboard 여정 실패가 있으면 완료 및 저장 hand-off를 금지한다.

</RULE>
