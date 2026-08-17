---
name: research
description: 제품 Discovery와 live 외부 근거 검증을 하나의 Research Markdown 산출물로 작성·갱신하는 범용 스킬
---

- 신규 Research는 항상 live 검색과 실제 원문 확인을 수행한다.
- Research는 문제·사용자·가치·성공 신호·가설·대안·잠정 선호와 verified findings를 함께 관리한다.
- `searched_at`, `evidence_valid_until=searched_at+7일`, scope와 직접 URL을 기록한다.
- scope는 `{"claims":[],"include":[],"exclude":[],"versions":[],"regions":[]}` key 순서를 사용하는 한 줄 canonical minified JSON이다. 각 배열은 trim 후 dedupe(중복 제거)하고 UTF-8 오름차순으로 sort한다.
- update는 7일 안이고 기존·신규 canonical scope가 byte-exact로 같을 때만 기존 evidence를 재사용한다.
- 저장·수정은 등록된 Project에서 `get_research`, `create_research`, `update_research`로 수행하고 재조회한다.
- 사용자 명령 없이는 Plan으로 전환하지 않는다.

## Markdown sections

```text
Research Metadata
Problem and Audience
Expected Value and Success Signals
Goals and Non-goals
Verified Findings
Hypotheses and Assumptions
Alternatives and Provisional Preference
Decisions and Open Questions
Sources
Next Step
```
