import { describe, expect, it } from "vitest";
import {
  erdExcalidrawSceneSchema,
  parseErdExcalidrawScene,
} from "@/lib/erd-excalidraw";
import { createErdScene } from "@/test/fixtures/dashboard";

describe("ERD Excalidraw scene contract", () => {
  it("canonical scene JSON을 검증된 renderer 입력으로 복원한다", () => {
    const scene = createErdScene();

    expect(erdExcalidrawSceneSchema.safeParse(scene).success).toBe(true);
    expect(parseErdExcalidrawScene(JSON.stringify(scene))).toEqual({
      data: scene,
      error: null,
    });
  });

  it.each([null, "", "   "])(
    "scene이 %p이면 null-safe unavailable 결과를 반환한다",
    (scene) => {
      expect(parseErdExcalidrawScene(scene)).toEqual({
        data: null,
        error: "Excalidraw scene is not available.",
      });
    },
  );

  it.each([
    ["legacy HTML", "<!doctype html><html><body>ERD</body></html>"],
    ["malformed JSON", '{"type":"excalidraw"'],
  ])("%s을 Excalidraw scene으로 가장하지 않는다", (_label, scene) => {
    expect(parseErdExcalidrawScene(scene)).toEqual({
      data: null,
      error: "Excalidraw scene is not valid JSON.",
    });
  });

  it.each([
    ["wrong source", createErdScene({ source: "https://example.invalid" })],
    ["empty element list", createErdScene({ elements: [] })],
    [
      "unsupported frame element",
      createErdScene({
        elements: [{ id: "frame", type: "frame" }],
      }),
    ],
    [
      "unsupported line element",
      createErdScene({
        elements: [{ id: "line", type: "line" }],
      }),
    ],
    ["embedded files", createErdScene({ files: { file: { id: "file" } } })],
    [
      "external element link",
      createErdScene({
        elements: [
          {
            id: "linked-table",
            link: "https://example.invalid/users",
            type: "rectangle",
          },
        ],
      }),
    ],
    [
      "duplicate element id",
      createErdScene({
        elements: [
          { id: "duplicate", type: "rectangle" },
          { id: "duplicate", text: "users", type: "text" },
        ],
      }),
    ],
    [
      "dangling binding",
      createErdScene({
        elements: [
          {
            endBinding: { elementId: "missing-table" },
            id: "relationship",
            type: "arrow",
          },
        ],
      }),
    ],
  ])("%s을 renderer 경계에서 거부한다", (_label, scene) => {
    const result = parseErdExcalidrawScene(JSON.stringify(scene));

    expect(result.data).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });

  it("UTF-8 기준 5 MiB를 넘는 scene을 JSON parse 전에 차단한다", () => {
    const oversizedScene = " ".repeat(5 * 1024 * 1024 + 1);

    expect(parseErdExcalidrawScene(oversizedScene)).toEqual({
      data: null,
      error: "Excalidraw scene exceeds the size limit.",
    });
  });

  it("ERD element 수를 최대 5,000개로 제한한다", () => {
    const scene = createErdScene({
      elements: Array.from({ length: 5_001 }, (_value, index) => ({
        id: `table-${index}`,
        type: "rectangle",
      })),
    });

    const result = parseErdExcalidrawScene(JSON.stringify(scene));
    expect(result.data).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });
});
