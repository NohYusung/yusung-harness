"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { parseErdExcalidrawScene } from "@/lib/erd-excalidraw";
import type { Erd } from "@/types/dashboard";

type ExcalidrawModule = typeof import("@excalidraw/excalidraw");
type RestoredScene = Awaited<ReturnType<ExcalidrawModule["loadFromBlob"]>>;

const excalidrawAssetPath = "/excalidraw/";

function configureExcalidrawAssets() {
  if (typeof window !== "undefined") {
    (
      window as typeof window & { EXCALIDRAW_ASSET_PATH?: string }
    ).EXCALIDRAW_ASSET_PATH = excalidrawAssetPath;
  }
}

const Excalidraw = dynamic(
  async () => {
    configureExcalidrawAssets();
    const excalidrawModule = await import("@excalidraw/excalidraw");
    return excalidrawModule.Excalidraw;
  },
  {
    loading: () => (
      <div
        aria-label="Loading ERD preview"
        className="grid h-full min-h-72 place-items-center text-sm text-muted"
        role="status"
      >
        Loading ERD…
      </div>
    ),
    ssr: false,
  },
);

interface ErdExcalidrawPreviewProps {
  record: Erd;
}

/** 저장된 scene을 복원해 확대·이동만 허용하는 client-only ERD canvas를 렌더한다. */
export function ErdExcalidrawPreview({
  record,
}: ErdExcalidrawPreviewProps) {
  const parsedScene = useMemo(
    () => parseErdExcalidrawScene(record.scene),
    [record.scene],
  );
  const [restoration, setRestoration] = useState<{
    data: RestoredScene | null;
    error: string | null;
    source: string | null;
  }>(() => ({ data: null, error: null, source: record.scene }));

  useEffect(() => {
    let isActive = true;
    if (!parsedScene.data) return () => undefined;

    async function restoreScene() {
      try {
        configureExcalidrawAssets();
        const { loadFromBlob } = await import("@excalidraw/excalidraw");
        const restoredScene = await loadFromBlob(
          new Blob([JSON.stringify(parsedScene.data)], {
            type: "application/json",
          }),
          null,
          null,
        );

        if (isActive) {
          setRestoration({
            data: restoredScene,
            error: null,
            source: record.scene,
          });
        }
      } catch {
        if (isActive) {
          setRestoration({
            data: null,
            error: "Excalidraw could not restore this ERD scene.",
            source: record.scene,
          });
        }
      }
    }

    void restoreScene();
    return () => {
      isActive = false;
    };
  }, [parsedScene.data, record.scene]);

  const currentRestoration =
    restoration.source === record.scene ? restoration : null;
  const initialData = currentRestoration?.data ?? null;
  const error = parsedScene.error ?? currentRestoration?.error ?? null;

  if (error) {
    const errorTitle =
      record.scene === null
        ? "Legacy ERD conversion required"
        : "Excalidraw scene invalid";

    return (
      <div
        aria-label={`${record.title} ERD preview error`}
        className="grid h-full min-h-72 place-items-center rounded-card border border-danger/30 bg-danger-soft p-8 text-center"
        role="alert"
      >
        <div className="max-w-md">
          <p className="m-0 text-sm font-semibold text-danger">
            {errorTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">{error}</p>
          <p className="mt-2 font-mono text-xs text-subtle">
            ERD #{record.id}
          </p>
        </div>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div
        aria-label="Loading ERD scene"
        className="grid h-full min-h-72 place-items-center rounded-card border border-line bg-surface text-sm text-muted"
        role="status"
      >
        Restoring ERD scene…
      </div>
    );
  }

  return (
    <div
      aria-label={`${record.title} ERD preview`}
      className="h-full min-h-72 w-full overflow-hidden rounded-card border border-line bg-white shadow-card"
      data-erd-excalidraw-preview
      role="region"
    >
      <Excalidraw
        autoFocus={false}
        handleKeyboardGlobally={false}
        initialData={{
          appState: initialData.appState,
          elements: initialData.elements,
          files: initialData.files,
          scrollToContent: true,
        }}
        theme="light"
        viewModeEnabled
        zenModeEnabled
      />
    </div>
  );
}
