import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createErd,
  createErdDocument,
} from "@/test/fixtures/dashboard";
import { ErdDineugCanvas } from "./ErdDineugCanvas";
import { ErdDineugPreview } from "./ErdDineugPreview";

const dynamicCanvasMock = vi.hoisted(() => vi.fn());

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockDineugCanvas(props: {
      document: unknown;
      recordId: number;
      title: string;
    }) {
      dynamicCanvasMock(props);
      return (
        <div
          aria-label={`${props.title} ERD preview`}
          data-testid="mock-dineug-canvas"
          role="region"
        />
      );
    },
}));

vi.mock("@dineug/erd-editor", () => ({}));

class MockErdEditorElement extends HTMLElement {
  static instances: MockErdEditorElement[] = [];

  readonly = false;
  systemDarkMode = false;
  enableThemeBuilder = true;
  destroy = vi.fn();
  setInitialValue = vi.fn();

  constructor() {
    super();
    MockErdEditorElement.instances.push(this);
  }
}

describe("ErdDineugPreview", () => {
  beforeAll(() => {
    if (!customElements.get("erd-editor")) {
      customElements.define("erd-editor", MockErdEditorElement);
    }
  });

  beforeEach(() => {
    dynamicCanvasMock.mockReset();
    MockErdEditorElement.instances.length = 0;
  });

  it("검증한 document를 iframe 없이 Dineug canvas에 전달한다", async () => {
    const record = createErd({ id: 41, title: "Project schema" });
    const { container } = render(<ErdDineugPreview record={record} />);

    expect(
      await screen.findByRole("region", {
        name: "Project schema ERD preview",
      }),
    ).toBe(screen.getByTestId("mock-dineug-canvas"));
    expect(dynamicCanvasMock).toHaveBeenCalledWith({
      document: createErdDocument(),
      recordId: 41,
      title: "Project schema",
    });
    expect(container.querySelector("iframe")).toBeNull();
  });

  it.each([
    [null, "Dineug ERD document is not available."],
    ["", "Dineug ERD document is not available."],
    ["<!doctype html><html><body>Legacy ERD</body></html>", "not valid JSON"],
    ['{"version":"3.0.0"', "not valid JSON"],
    [
      JSON.stringify(createErdDocument({ version: "2.0.0" })),
      "Invalid input",
    ],
  ] as const)(
    "null·invalid document %p를 crash 없이 record fallback으로 격리한다",
    async (document, message) => {
      const { container } = render(
        <ErdDineugPreview
          record={createErd({
            document,
            id: 42,
            title: "Invalid schema",
          })}
        />,
      );

      expect(
        await screen.findByRole("alert", {
          name: "Invalid schema ERD preview error",
        }),
      ).toHaveTextContent(message);
      expect(screen.getByText("ERD #42")).toBeInTheDocument();
      expect(dynamicCanvasMock).not.toHaveBeenCalled();
      expect(container.querySelector("erd-editor")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
    },
  );
});

describe("ErdDineugCanvas custom element lifecycle", () => {
  beforeEach(() => {
    MockErdEditorElement.instances.length = 0;
  });

  it("erd-editor를 readonly로 만들고 setInitialValue로 초기 문서를 주입한다", async () => {
    const document = createErdDocument();
    const { container } = render(
      <ErdDineugCanvas
        document={document as never}
        recordId={51}
        title="Readonly schema"
      />,
    );

    expect(
      screen.getByRole("status", { name: "Loading Dineug ERD" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(MockErdEditorElement.instances).toHaveLength(1),
    );

    const editor = MockErdEditorElement.instances[0]!;
    expect(editor.readonly).toBe(true);
    expect(editor.systemDarkMode).toBe(true);
    expect(editor.enableThemeBuilder).toBe(false);
    expect(editor.setInitialValue).toHaveBeenCalledOnce();
    expect(editor.setInitialValue).toHaveBeenCalledWith(
      JSON.stringify(document),
    );
    expect(editor).toHaveAttribute(
      "aria-label",
      "Readonly schema Dineug ERD canvas",
    );
    expect(container.querySelector("erd-editor")).toBe(editor);
    expect(container.querySelector("iframe")).toBeNull();
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Loading Dineug ERD" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("record key가 바뀌거나 unmount되면 이전 editor를 destroy한다", async () => {
    const document = createErdDocument();
    const rendered = render(
      <ErdDineugCanvas
        document={document as never}
        recordId={61}
        title="Lifecycle schema"
      />,
    );
    await waitFor(() =>
      expect(MockErdEditorElement.instances).toHaveLength(1),
    );
    const firstEditor = MockErdEditorElement.instances[0]!;

    rendered.rerender(
      <ErdDineugCanvas
        document={document as never}
        recordId={62}
        title="Lifecycle schema"
      />,
    );
    await waitFor(() =>
      expect(MockErdEditorElement.instances).toHaveLength(2),
    );
    expect(firstEditor.destroy).toHaveBeenCalledOnce();

    const secondEditor = MockErdEditorElement.instances[1]!;
    rendered.unmount();
    expect(secondEditor.destroy).toHaveBeenCalledOnce();
  });
});
