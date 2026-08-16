import sharedValidator from "./validate-erd-excalidraw-scene.cjs";

/** ESM backfill callers도 동일한 CJS runtime validator 구현을 사용한다. */
export const { validateErdExcalidrawScene } = sharedValidator;
