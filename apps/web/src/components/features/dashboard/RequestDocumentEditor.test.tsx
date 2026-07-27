import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectContext,
  createProjectSummary,
  createRequest as createRequestRecord,
} from "@/test/fixtures/dashboard";
import { Dashboard } from "./Dashboard";

const createRequestAction = vi.hoisted(() => vi.fn());
const updateRequestAction = vi.hoisted(() => vi.fn());
const routerRefresh = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("@/actions/requests", () => ({
  createRequestAction,
  updateRequestAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: routerRefresh,
    replace: routerReplace,
  }),
}));

beforeEach(() => {
  createRequestAction.mockReset();
  updateRequestAction.mockReset();
  routerRefresh.mockReset();
  routerReplace.mockReset();
});

function renderRequests(
  requests: ReturnType<typeof createRequestRecord>[] = [],
) {
  const context = createProjectContext({ id: 7, requests });

  return render(
    <Dashboard
      activeRelation="requests"
      context={context}
      projects={[createProjectSummary(context)]}
      selectedArtifactId={requests[0]?.id ?? null}
      selectedTaskId={null}
    />,
  );
}

function getRequestEditor() {
  return screen.getByRole("form", { name: "Request editor" });
}

describe("Request central document mutations", () => {
  it("Content 입력은 상세 패널의 남은 높이를 사용하고 충분한 최소 편집 높이를 확보한다", () => {
    renderRequests();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    const editor = getRequestEditor();
    const content = within(editor).getByRole("textbox", { name: "Content" });
    const contentField = content.closest("label");

    expect(editor).toHaveClass("flex", "h-full", "min-h-0", "flex-col");
    expect(contentField).toHaveClass(
      "flex",
      "min-h-0",
      "flex-1",
      "flex-col",
    );
    expect(content).toHaveClass("min-h-80", "flex-1");
  });

  it("새 Request를 생성하면 API 결과를 중앙 문서와 record 목록에 즉시 반영한다", async () => {
    const created = createRequestRecord({
      content: "Write the request in the central document node.",
      id: 101,
      projectId: 7,
      title: "Central request document",
    });
    createRequestAction.mockResolvedValueOnce({ ok: true, request: created });
    renderRequests();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    const editor = getRequestEditor();
    fireEvent.change(within(editor).getByRole("textbox", { name: "Title" }), {
      target: { value: created.title },
    });
    fireEvent.change(
      within(editor).getByRole("textbox", { name: "Content" }),
      { target: { value: created.content } },
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Create request" }),
    );

    await waitFor(() =>
      expect(createRequestAction).toHaveBeenCalledWith(7, {
        title: created.title,
        content: created.content,
      }),
    );
    const records = screen.getByRole("listbox", { name: "Artifact records" });
    expect(
      await within(records).findByRole("option", {
        name: /Title Central request document/,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("complementary", { name: created.title }),
    ).toHaveTextContent(created.content);
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/7?type=requests&id=101",
      { scroll: false },
    );
    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("기존 Request 수정은 status 선택을 노출하지 않고 title/content와 현재 status를 함께 저장한다", async () => {
    const request = createRequestRecord({
      content: "Original request content.",
      id: 101,
      projectId: 7,
      status: "IN_PROGRESS",
      title: "Original request",
    });
    const updated = {
      ...request,
      content: "Updated request content.",
      title: "Updated request",
      updatedAt: "2026-07-27T02:00:00.000Z",
    };
    updateRequestAction.mockResolvedValueOnce({ ok: true, request: updated });
    renderRequests([request]);

    fireEvent.click(screen.getByRole("button", { name: "Edit request" }));
    const editor = getRequestEditor();
    const title = within(editor).getByRole("textbox", { name: "Title" });
    const content = within(editor).getByRole("textbox", { name: "Content" });
    expect(title).toHaveValue(request.title);
    expect(content).toHaveValue(request.content);
    expect(
      within(editor).queryByRole("combobox", { name: "Status" }),
    ).not.toBeInTheDocument();

    fireEvent.change(title, { target: { value: updated.title } });
    fireEvent.change(content, { target: { value: updated.content } });
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save request" }),
    );

    await waitFor(() =>
      expect(updateRequestAction).toHaveBeenCalledWith(7, request.id, {
        title: updated.title,
        content: updated.content,
        status: request.status,
      }),
    );
    const updatedRow = await screen.findByRole("option", {
      name: /Title Updated request, Status In progress/,
    });
    expect(updatedRow).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("complementary", { name: updated.title }),
    ).toHaveTextContent(updated.content);
    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("생성 실패 시 입력을 보존하고 오류를 알리며 record를 추가하지 않는다", async () => {
    createRequestAction.mockResolvedValueOnce({
      ok: false,
      message: "Request could not be created",
    });
    renderRequests();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    const editor = getRequestEditor();
    const title = within(editor).getByRole("textbox", { name: "Title" });
    const content = within(editor).getByRole("textbox", { name: "Content" });
    fireEvent.change(title, { target: { value: "Unsaved request" } });
    fireEvent.change(content, { target: { value: "Keep this draft." } });
    fireEvent.click(
      within(editor).getByRole("button", { name: "Create request" }),
    );

    expect(await within(editor).findByRole("alert")).toHaveTextContent(
      "Request could not be created",
    );
    expect(title).toHaveValue("Unsaved request");
    expect(content).toHaveValue("Keep this draft.");
    expect(
      within(
        screen.getByRole("listbox", { name: "Artifact records" }),
      ).queryByRole("option"),
    ).not.toBeInTheDocument();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("수정 실패 시 form 입력을 보존하고 기존 Request record를 변경하지 않는다", async () => {
    const request = createRequestRecord({
      content: "Persisted content.",
      id: 101,
      projectId: 7,
      title: "Persisted request",
    });
    updateRequestAction.mockResolvedValueOnce({
      ok: false,
      message: "Request could not be updated",
    });
    renderRequests([request]);

    fireEvent.click(screen.getByRole("button", { name: "Edit request" }));
    const editor = getRequestEditor();
    const title = within(editor).getByRole("textbox", { name: "Title" });
    const content = within(editor).getByRole("textbox", { name: "Content" });
    fireEvent.change(title, { target: { value: "Unsaved title" } });
    fireEvent.change(content, { target: { value: "Unsaved content." } });
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save request" }),
    );

    expect(await within(editor).findByRole("alert")).toHaveTextContent(
      "Request could not be updated",
    );
    expect(title).toHaveValue("Unsaved title");
    expect(content).toHaveValue("Unsaved content.");
    expect(
      screen.getByRole("option", { name: /Title Persisted request/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Title Unsaved title/ }),
    ).not.toBeInTheDocument();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
