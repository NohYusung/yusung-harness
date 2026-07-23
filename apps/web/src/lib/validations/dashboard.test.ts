import { describe, expect, it } from "vitest";
import { projectContextSchema } from "@/lib/validations/dashboard";
import { createArtifact, createAsset, createProjectContext } from "@/test/fixtures/dashboard";

describe("projectContextSchema HTML artifacts", () => {
  it("프로젝트는 하나 이상의 typed repository 경로를 요구한다", () => {
    const context = createProjectContext();

    expect(projectContextSchema.safeParse(context).success).toBe(true);
    expect(
      projectContextSchema.safeParse({ ...context, repoPaths: [] }).success,
    ).toBe(false);
    expect(
      projectContextSchema.safeParse({
        ...context,
        repoPaths: undefined,
        repoPath: "/workspace/legacy",
        repoType: "LOCAL",
      }).success,
    ).toBe(false);
  });

  it("완전한 HTML을 사용하는 Asset 응답을 허용한다", () => {
    const asset = createAsset();

    expect(
      projectContextSchema.safeParse(
        createProjectContext({ assets: [asset] }),
      ).success,
    ).toBe(true);
  });

  it("Asset의 plain text html과 Draft의 누락된 content를 구분한다", () => {
    const invalidAsset = createAsset({ html: "Primary color: #3559c7" });
    const draft = createArtifact({ content: "Draft text remains content." });
    const result = projectContextSchema.safeParse(
      createProjectContext({ assets: [invalidAsset], drafts: [draft] }),
    );

    expect(result.success).toBe(false);
    expect(draft.content).toBe("Draft text remains content.");
  });
});
