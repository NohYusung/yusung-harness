import { z } from "zod";

const maximumSceneBytes = 5 * 1024 * 1024;
const maximumElementCount = 5_000;
const allowedElementTypes = [
  "arrow",
  "rectangle",
  "text",
] as const;

const elementBindingSchema = z
  .object({
    elementId: z.string().min(1),
  })
  .passthrough();

const erdExcalidrawElementSchema = z
  .object({
    id: z.string().min(1),
    link: z.string().nullable().optional(),
    startBinding: elementBindingSchema.nullable().optional(),
    endBinding: elementBindingSchema.nullable().optional(),
    type: z.enum(allowedElementTypes),
  })
  .passthrough();

export const erdExcalidrawSceneSchema = z
  .object({
    type: z.literal("excalidraw"),
    version: z.literal(2),
    source: z.literal("yusung-harness:erd"),
    elements: z
      .array(erdExcalidrawElementSchema)
      .min(1)
      .max(maximumElementCount),
    appState: z.record(z.string(), z.unknown()),
    files: z.record(z.string(), z.unknown()),
  })
  .superRefine((scene, context) => {
    if (Object.keys(scene.files).length > 0) {
      context.addIssue({
        code: "custom",
        message: "ERD scene files must be empty",
        path: ["files"],
      });
    }

    const elementIds = new Set<string>();
    for (const [index, element] of scene.elements.entries()) {
      if (elementIds.has(element.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate element ID: ${element.id}`,
          path: ["elements", index, "id"],
        });
      }
      elementIds.add(element.id);

      if (element.link) {
        context.addIssue({
          code: "custom",
          message: "ERD elements cannot contain external links",
          path: ["elements", index, "link"],
        });
      }
    }

    for (const [index, element] of scene.elements.entries()) {
      for (const [bindingName, binding] of [
        ["startBinding", element.startBinding],
        ["endBinding", element.endBinding],
      ] as const) {
        if (binding && !elementIds.has(binding.elementId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown ${bindingName} element: ${binding.elementId}`,
            path: ["elements", index, bindingName, "elementId"],
          });
        }
      }
    }
  });

export type ErdExcalidrawScene = z.infer<typeof erdExcalidrawSceneSchema>;

export type ErdSceneParseResult =
  | { data: ErdExcalidrawScene; error: null }
  | { data: null; error: string };

/** 저장된 ERD JSON을 파싱하고 iframe 없는 렌더링에 필요한 보안 경계를 검증한다. */
export function parseErdExcalidrawScene(
  serializedScene: string | null,
): ErdSceneParseResult {
  if (serializedScene === null) {
    return { data: null, error: "Excalidraw scene is not available." };
  }

  if (new TextEncoder().encode(serializedScene).byteLength > maximumSceneBytes) {
    return { data: null, error: "Excalidraw scene exceeds the size limit." };
  }

  if (serializedScene.trim() === "") {
    return { data: null, error: "Excalidraw scene is not available." };
  }

  let parsedScene: unknown;
  try {
    parsedScene = JSON.parse(serializedScene);
  } catch {
    return { data: null, error: "Excalidraw scene is not valid JSON." };
  }

  const result = erdExcalidrawSceneSchema.safeParse(parsedScene);
  if (!result.success) {
    return {
      data: null,
      error: result.error.issues[0]?.message ?? "Excalidraw scene is invalid.",
    };
  }

  return { data: result.data, error: null };
}
