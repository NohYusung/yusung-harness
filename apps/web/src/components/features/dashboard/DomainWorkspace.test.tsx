import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainWorkspace } from "./DomainWorkspace";
import { createArtifact } from "@/test/fixtures/dashboard";

const domainErdContent = JSON.stringify({
  kind: "domain-erd",
  schemaVersion: 1,
  name: "Commerce domain",
  generatedAt: "2026-07-20T00:00:00.000Z",
  sourceRevision: "abc123",
  entities: [
    {
      id: "project",
      name: "Project",
      domain: "Core",
      description: "Completed project aggregate root.",
      fields: [
        {
          name: "id",
          type: "Int",
          nullable: false,
          primaryKey: true,
          unique: true,
        },
      ],
    },
    {
      id: "plan",
      name: "Plan",
      fields: [
        {
          name: "id",
          type: "Int",
          nullable: false,
          primaryKey: true,
        },
        {
          name: "projectId",
          type: "Int",
          nullable: false,
          foreignKey: true,
        },
      ],
    },
  ],
  relationships: [
    {
      id: "project-plans",
      label: "owns",
      source: { entityId: "project", field: "id", cardinality: "1" },
      target: { entityId: "plan", field: "projectId", cardinality: "N" },
    },
  ],
});

describe("DomainWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("레코드 선택 없이 최신 valid snapshot을 프로젝트 ERD로 즉시 렌더한다", () => {
    const latestLegacyRecord = createArtifact({
      id: 3,
      title: "Legacy architecture note",
      content: "The project delegates persistence to repositories.",
      updatedAt: "2026-07-20T01:00:00.000Z",
    });
    const latestValidSnapshot = createArtifact({
      id: 2,
      title: "Completed commerce domain",
      content: domainErdContent,
      updatedAt: "2026-07-20T00:00:00.000Z",
    });

    render(
      <DomainWorkspace domains={[latestLegacyRecord, latestValidSnapshot]} />,
    );

    expect(
      screen.getByRole("heading", { name: "Domain model" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 entities · 1 relationship")).toBeInTheDocument();

    const diagram = screen.getByRole("region", {
      name: "Commerce domain ERD",
    });
    const projectNode = within(diagram).getByRole("button", {
      name: /Project entity/i,
    });
    const planNode = within(diagram).getByRole("button", {
      name: /Plan entity/i,
    });

    expect(projectNode).toBeInTheDocument();
    expect(planNode).toBeInTheDocument();
    expect(
      within(diagram).getByText("Project.id 1 → N Plan.projectId · owns"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Select a record")).not.toBeInTheDocument();

    fireEvent.click(planNode);
    const inspector = screen.getByRole("complementary", {
      name: "Plan entity details",
    });
    expect(within(inspector).getByText("projectId")).toBeInTheDocument();
    expect(within(inspector).getByText("FK")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("complementary", { name: "Plan entity details" }),
    ).not.toBeInTheDocument();
    expect(planNode).toHaveFocus();
  });

  it("legacy plain text record만 있으면 ERD를 가장하지 않고 경고한다", () => {
    render(
      <DomainWorkspace
        domains={[
          createArtifact({
            title: "System Context & Boundaries",
            content: "Harness Agent → NestJS → Prisma → SQLite",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/legacy|ERD/i);
    expect(
      screen.getByText("System Context & Boundaries"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Harness Agent → NestJS → Prisma → SQLite"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /ERD/ }),
    ).not.toBeInTheDocument();
  });

  it("Domain snapshot이 없으면 domain model empty state를 표시한다", () => {
    render(<DomainWorkspace domains={[]} />);

    expect(
      screen.getByRole("heading", { name: "No domain model yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /ERD/ })).not.toBeInTheDocument();
  });

  it("canvas resize와 inspector open·close에 맞춰 diagram zoom을 다시 계산한다", () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const observe = vi.fn();

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      disconnect = vi.fn();
      observe = observe;
      unobserve = vi.fn();
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    render(
      <DomainWorkspace
        domains={[
          createArtifact({
            title: "Completed commerce domain",
            content: domainErdContent,
          }),
        ]}
      />,
    );

    const diagram = screen.getByRole("region", {
      name: "Commerce domain ERD",
    });
    const planNode = within(diagram).getByRole("button", {
      name: /Plan entity/i,
    });
    expect(observe).toHaveBeenCalledWith(diagram);

    fireEvent.click(planNode);
    Object.defineProperty(diagram, "clientWidth", {
      configurable: true,
      value: 388,
    });
    act(() => {
      resizeCallback?.(
        [{ target: diagram }] as unknown as ResizeObserverEntry[],
        {} as ResizeObserver,
      );
    });
    expect(screen.getByText("55%")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close entity details" }),
    );
    Object.defineProperty(diagram, "clientWidth", {
      configurable: true,
      value: 744,
    });
    act(() => {
      resizeCallback?.(
        [{ target: diagram }] as unknown as ResizeObserverEntry[],
        {} as ResizeObserver,
      );
    });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
