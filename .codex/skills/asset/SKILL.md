---
name: asset
description: 디자인 에셋을 만드는 스킬
---

## 에이전트 호출 경계

- 새 에이전트를 생성하는 `spawn_agent`는 `root만` 호출한다.
- non-root 에이전트는 `spawn_agent`를 `직접 또는 간접`으로 호출하거나 다른 에이전트에게 생성을 요청하지 않는다.
- non-root 에이전트는 root가 이미 생성한 에이전트와 협력할 때 `send_message`, `followup_task`, `wait_agent`를 사용할 수 있다.
- 추가 역할이나 에이전트가 필요하면 필요한 역할, 작업 범위와 기대 증거를 `root에 handoff`한다.

디자인 컨셉, 테마색 조합 설정, 로고, 컴포넌트 요소 등의 디자인 에셋을 정리한다.

## root가 호출할 에이전트 목록

| 에이전트명 | 하는일                                                                   |
| ---------- | ------------------------------------------------------------------------ |
| designer   | 디자인 컨셉, 테마 색 조합 설정, 로고 디자인, 컴포넌트 요소 등등을 디자인 |
| coder      | 코드 검색, 코드 작성, 코드 수정                                          |
| researcher | 비슷한 컨셉의 도메인을 서비스하는 각종 사이트들의 레퍼런스 체크          |

## 워크플로우

> - doc-curator는 먼저 yusung-harness-doc mcp 서버의 'get_project'를 통해 작업 지시가 내려진 레포가 project로 등록이 되어있는지 확인한다.
> - 만약 project로 등록이 되어있지 않으면, 'project로 등록되지 않았습니다. 먼저 레포를 project로 등록하세요' 라고 반환한 후 메인 에이전트의 대화를 종료한다.
> - 에셋의 각 요소를 디자인 시 항상 image_gen 툴을 호출한다.
>   - image_gen 호출이 불가능하면, 메인 에이전트 스레드에 이 사실을 전달 한 후 작업을 중단하고, 이유를 보고한다.
>   - image_gen 으로 산출된 image의 디자인을 참조하여, 에셋을 구현한다.
> - coder는 designer에게 디자인을 지시받아 html 을 작업한 후 doc-curator에게 전달하여 저장한 후 워크스페이스에서 개발용으로 저장한 파일을 삭제한다.

### 판단 알고리즘

```dot
digraph AssetWorkflow {
    // 전체 그래프 설정
    graph [
        label="Asset Skill Workflow",
        labelloc="t",
        fontsize=16,
        fontname="Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        rankdir=TB,
        splines=spline,
        nodesep=0.5,
        ranksep=0.6,
        bgcolor="#f8fafc"
    ];

    // 공통 노드 & 엣지 스타일
    node [
        fontname="Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontsize=11,
        shape=box,
        style="filled,rounded",
        color="#cbd5e1",
        fillcolor="#ffffff",
        penwidth=1.2,
        margin="0.2,0.1"
    ];
    edge [
        fontname="Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontsize=10,
        color="#64748b",
        arrowsize=0.8
    ];

    // 시작 / 종료 노드
    start [label="시작\n(에셋 생성 요청)", shape=ellipse, fillcolor="#e0e7ff", color="#6366f1", fontcolor="#312e81", style="filled"];
    end_not_registered [label="대화 종료\n('project로 등록되지 않았습니다' 반환)", shape=ellipse, fillcolor="#fee2e2", color="#ef4444", fontcolor="#991b1b", style="filled"];
    end_image_gen_failed [label="작업 중단 및 사유 보고\n(메인 스레드에 전달)", shape=ellipse, fillcolor="#fee2e2", color="#ef4444", fontcolor="#991b1b", style="filled"];
    end_success [label="에셋 작업 완료\n(HTML 저장 완료)", shape=ellipse, fillcolor="#dcfce7", color="#22c55e", fontcolor="#14532d", style="filled"];

    // 1. 프로젝트 등록 확인 (doc-curator)
    subgraph cluster_doc_curator_check {
        label="1. 프로젝트 등록 확인 (doc-curator)";
        style="filled,rounded";
        fillcolor="#f1f5f9";
        color="#cbd5e1";

        check_project [label="yusung-harness-doc MCP\n'get_project' 호출", fillcolor="#e2e8f0"];
        is_registered [label="프로젝트로\n등록되어 있는가?", shape=diamond, fillcolor="#fef3c7", color="#f59e0b"];
    }

    // 2. 에셋 디자인 단계 (designer)
    subgraph cluster_designer {
        label="2. 에셋 요소 디자인 (designer)";
        style="filled,rounded";
        fillcolor="#f1f5f9";
        color="#cbd5e1";

        call_image_gen [label="image_gen 툴 호출\n(각 에셋 요소별 디자인)", fillcolor="#ede9fe", color="#8b5cf6"];
        is_image_gen_ok [label="image_gen\n호출 성공 여부?", shape=diamond, fillcolor="#fef3c7", color="#f59e0b"];
        ref_image [label="산출된 이미지 참조하여\n에셋 디자인 및 구현 지시", fillcolor="#ede9fe", color="#8b5cf6"];
    }

    // 3. HTML 작업 및 저장·정리 (coder & doc-curator)
    subgraph cluster_coder_and_save {
        label="3. HTML 작업 및 정리 (coder & doc-curator)";
        style="filled,rounded";
        fillcolor="#f1f5f9";
        color="#cbd5e1";

        code_html [label="coder:\n디자인 지시 기반 HTML 작업", fillcolor="#e0f2fe", color="#0284c7"];
        send_to_doc_curator [label="coder ➔ doc-curator:\n작업된 HTML 전달", fillcolor="#e0f2fe", color="#0284c7"];
        save_html [label="doc-curator:\n에셋 HTML 저장", fillcolor="#e2e8f0", color="#64748b"];
        cleanup_temp [label="coder:\n워크스페이스 개발용 임시 파일 삭제", fillcolor="#e0f2fe", color="#0284c7"];
    }

    // 흐름 연결 (Edges)
    start -> check_project;
    check_project -> is_registered;

    is_registered -> end_not_registered [label=" 미등록 (No)", color="#ef4444", fontcolor="#dc2626"];
    is_registered -> call_image_gen [label=" 등록됨 (Yes)", color="#16a34a", fontcolor="#15803d"];

    call_image_gen -> is_image_gen_ok;
    is_image_gen_ok -> end_image_gen_failed [label=" 호출 불가 (No)", color="#ef4444", fontcolor="#dc2626"];
    is_image_gen_ok -> ref_image [label=" 호출 성공 (Yes)", color="#16a34a", fontcolor="#15803d"];

    ref_image -> code_html [label=" 디자인 지시"];
    code_html -> send_to_doc_curator;
    send_to_doc_curator -> save_html;
    save_html -> cleanup_temp;
    cleanup_temp -> end_success;
}

```

## 에셋의 생성 원칙

<RULE>
- 에셋의 저장 단위는 projectId이다. 해당 프로젝트에서 동일하게 유지할 컨셉, 색 테마, 로고 등을 유지
- 에셋별로 다른 html을 생성하는게 아니고, 에셋들을 하나의 html안에 구조화된 형태로 모두 저장한다.
- 산출물은 ***에셋 팔레트 형식의 디자인 시스템 문서***이다. 와이어 프레임과 연동된 인터렉티브 디자인이 아님.
    > 산출물의 예시는 다음과 같다. 예시는 말 그대로 예시를 보여주는 것일 뿐, 이대로 구현하거나 예시 양식을 그대로 모방하라는 것이 아니다.
    > - 예시1: [asset-example1](./references/asset-example1.html)
    > - 예시2: [asset-example2](./references/asset-example2.html)
    > - 예시3: [asset-example3](./references/asset-example3.html)

</RULE>

## 정의 되어야할 에셋의 목록

| 에셋명                      | 설명                                                                         |
| --------------------------- | ---------------------------------------------------------------------------- |
| 로고(Logo)                  | 작업 서비스를 대표할 수 있는 로고 디자인 에셋                                |
| 워드마크(WordMark)          | 서비스 이름 자체를 로고화한 디자인 에셋                                      |
| 심볼(Symbol)                | 독립적인 그래픽·아이콘·그림                                                  |
| 컬러 팔레트(Color Pallette) | 서비스 테마 컬러 색감 팔레트                                                 |
| 액션 아이콘(Action Icon)    | 애니메이션 움직이는 아이콘                                                   |
| 마스코트(Mascot)            | 서비스 아이덴티티가 포함된 서비스 마스코트                                   |
| 폰트(Fonts)                 | 서비스에서 사용할 글자 폰트                                                  |
| 타이포 그래피(Typography)   | 글자 크기, 글자 굵기, 줄간격, 자간, 제목(h1~h6) 등을 적용한 본문의 계층 구조 |
| 파비콘(Favicon)             | 웹 사이트 탭 좌측에 조그맣게 보이는 아이콘                                   |
| 앱 아이콘(App Icon)         | 앱 배포시 사용할 아이콘                                                      |
| 버튼(Button)                | 서비스에서 사용할 버튼 디자인                                                |
| Badges(배지)                | 서비스에서 상태나 플래그를 표현하는 배지 디자인                              |
| 기타                        | 정의된 에셋 외에 서비스 특성상 필요하다고 판단되는 디자인 에셋 모음          |
