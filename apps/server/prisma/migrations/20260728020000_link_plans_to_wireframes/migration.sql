-- Plan과 Wireframe을 양쪽 모두 선택적인 다대다 관계로 연결한다.
-- 기존 Plan과 Wireframe에는 조인 행을 생성하지 않아 미연결 상태를 보존한다.
CREATE TABLE "_PlanWireframes" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_PlanWireframes_A_fkey" FOREIGN KEY ("A") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PlanWireframes_B_fkey" FOREIGN KEY ("B") REFERENCES "Wireframe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "_PlanWireframes_AB_unique" ON "_PlanWireframes"("A", "B");
CREATE INDEX "_PlanWireframes_B_index" ON "_PlanWireframes"("B");
