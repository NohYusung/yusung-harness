import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createErd, createErdScene } from "@/test/fixtures/dashboard";
import { ErdExcalidrawPreview } from "./ErdExcalidrawPreview";

const excalidrawMocks = vi.hoisted(() => ({
  loadFromBlob: vi.fn(),
  render: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockExcalidraw(props: unknown) {
      excalidrawMocks.render(props);
      return <div data-testid="mock-excalidraw-canvas" />;
    },
}));

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: () => null,
  loadFromBlob: excalidrawMocks.loadFromBlob,
}));

describe("ErdExcalidrawPreview", () => {
  beforeEach(() => {
    excalidrawMocks.loadFromBlob.mockReset();
    excalidrawMocks.render.mockReset();
    excalidrawMocks.loadFromBlob.mockResolvedValue({
      elements: [{ id: "restored-users", type: "rectangle" }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    });
    delete (
      window as typeof window & { EXCALIDRAW_ASSET_PATH?: string }
    ).EXCALIDRAW_ASSET_PATH;
  });

  it("scene을 복원해 iframe 없이 읽기 전용 Excalidraw canvas를 렌더한다", async () => {
    const record = createErd({ id: 41, title: "Project schema" });
    const { container } = render(<ErdExcalidrawPreview record={record} />);

    expect(
      screen.getByRole("status", { name: "Loading ERD scene" }),
    ).toHaveTextContent("Restoring ERD scene");

    const preview = await screen.findByRole("region", {
      name: "Project schema ERD preview",
    });
    expect(preview).toHaveAttribute("data-erd-excalidraw-preview");
    expect(screen.getByTestId("mock-excalidraw-canvas")).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expect(excalidrawMocks.loadFromBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      null,
      null,
    );
    expect(
      (window as typeof window & { EXCALIDRAW_ASSET_PATH?: string })
        .EXCALIDRAW_ASSET_PATH,
    ).toBe("/excalidraw/");

    const props = excalidrawMocks.render.mock.calls.at(-1)?.[0] as {
      autoFocus?: boolean;
      handleKeyboardGlobally?: boolean;
      initialData?: {
        appState?: Record<string, unknown>;
        elements?: unknown[];
        files?: Record<string, unknown>;
        scrollToContent?: boolean;
      };
      theme?: string;
      viewModeEnabled?: boolean;
      zenModeEnabled?: boolean;
    };
    expect(props).toMatchObject({
      autoFocus: false,
      handleKeyboardGlobally: false,
      initialData: {
        appState: { viewBackgroundColor: "#ffffff" },
        elements: [{ id: "restored-users", type: "rectangle" }],
        files: {},
        scrollToContent: true,
      },
      theme: "light",
      viewModeEnabled: true,
      zenModeEnabled: true,
    });
  });

  it.each([
    [null, "Excalidraw scene is not available."],
    ["", "Excalidraw scene is not available."],
    ["<!doctype html><html><body>Legacy ERD</body></html>", "not valid JSON"],
    ['{"type":"excalidraw"', "not valid JSON"],
    [JSON.stringify(createErdScene({ source: "untrusted" })), "Invalid input"],
  ] as const)(
    "null·invalid scene %p를 crash 없이 오류 상태로 격리한다",
    async (scene, message) => {
      const { container } = render(
        <ErdExcalidrawPreview
          record={createErd({ id: 42, scene, title: "Invalid schema" })}
        />,
      );

      expect(
        await screen.findByRole("alert", {
          name: "Invalid schema ERD preview error",
        }),
      ).toHaveTextContent(message);
      expect(screen.getByText("ERD #42")).toBeInTheDocument();
      expect(excalidrawMocks.loadFromBlob).not.toHaveBeenCalled();
      expect(excalidrawMocks.render).not.toHaveBeenCalled();
      expect(container.querySelector("iframe")).toBeNull();
    },
  );

  it("Excalidraw restore 실패를 record 단위 fallback으로 변환한다", async () => {
    excalidrawMocks.loadFromBlob.mockRejectedValueOnce(
      new Error("restore failed"),
    );

    render(
      <ErdExcalidrawPreview
        record={createErd({ id: 43, title: "Broken restore" })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("alert", {
          name: "Broken restore ERD preview error",
        }),
      ).toHaveTextContent("Excalidraw could not restore this ERD scene."),
    );
    expect(excalidrawMocks.render).not.toHaveBeenCalled();
  });
});
