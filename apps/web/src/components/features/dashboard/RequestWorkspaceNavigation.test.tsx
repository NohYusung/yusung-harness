import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectContext,
  createProjectSummary,
  createRequest,
} from "@/test/fixtures/dashboard";
import { Dashboard } from "./Dashboard";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplace,
  }),
}));

describe("Request workspace navigation", () => {
  beforeEach(() => {
    routerReplace.mockClear();
  });

  it("좌측 Project records에서 Request count를 표시하고 선택 URL을 유지한다", () => {
    const context = createProjectContext({
      requests: [
        createRequest({ id: 101, title: "Add Request menu" }),
        createRequest({ id: 102, title: "Verify Request detail" }),
      ],
    });

    render(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Artifact types",
    });
    const requestMenu = within(navigation).getByRole("button", {
      name: /Requests\s*2/,
    });

    expect(within(requestMenu).getByText("Requests")).toBeInTheDocument();
    expect(within(requestMenu).getByText("2")).toBeInTheDocument();
    expect(requestMenu).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(requestMenu);

    expect(requestMenu).toHaveAttribute("aria-pressed", "true");
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=requests",
      { scroll: false },
    );
    expect(
      within(
        screen.getByRole("listbox", { name: "Artifact records" }),
      ).getAllByRole("option"),
    ).toHaveLength(2);
  });

  it("Request row의 status를 표시하고 선택 시 detail과 request URL을 연결한다", () => {
    const request = createRequest({
      content: "Expose project requests in the left navigation.",
      id: 101,
      status: "IN_PROGRESS",
      title: "Add Request workspace",
    });
    const context = createProjectContext({ requests: [request] });

    render(
      <Dashboard
        activeRelation="requests"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Artifact types",
    });
    expect(
      within(navigation).getByRole("button", { name: /Requests\s*1/ }),
    ).toHaveAttribute("aria-pressed", "true");

    const records = screen.getByRole("listbox", {
      name: "Artifact records",
    });
    const requestRow = within(records).getByRole("option", {
      name: /Title Add Request workspace/,
    });
    expect(requestRow).toHaveAccessibleName(/Type Request/);
    expect(requestRow).toHaveAccessibleName(/Status In progress/);

    fireEvent.click(requestRow);

    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=requests&id=101",
      { scroll: false },
    );
    const detailPane = screen.getByRole("complementary", {
      name: "Add Request workspace",
    });
    expect(
      within(detailPane).getByText("Request", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(
      within(detailPane).getByText("In progress", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(
      within(detailPane).getByText("request/101", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(
      within(detailPane).getByText(
        "Expose project requests in the left navigation.",
      ),
    ).toBeInTheDocument();
  });
});
