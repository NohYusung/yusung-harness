import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArchitectureWorkspace } from "./ArchitectureWorkspace";
import { createArchitecture } from "@/test/fixtures/dashboard";

const deploymentContent = JSON.stringify({
  kind: "deployment-architecture",
  schemaVersion: 1,
  name: "Harness production",
  environments: [
    { id: "browser", name: "Browser", kind: "client" },
    { id: "production", name: "Production", kind: "cloud", provider: "Vercel" },
  ],
  nodes: [
    { id: "web", name: "Next.js Web", kind: "client", environmentId: "browser" },
    { id: "api", name: "Nest API", kind: "service", environmentId: "production" },
  ],
  connections: [
    {
      id: "web-api",
      sourceNodeId: "web",
      targetNodeId: "api",
      label: "Dashboard API",
      protocol: "HTTPS",
    },
  ],
});

describe("ArchitectureWorkspace deployment graph", () => {
  it("최신 valid deployment snapshot의 node·connection을 렌더한다", () => {
    render(
      <ArchitectureWorkspace
        architectures={[
          createArchitecture({
            id: 2,
            title: "Legacy deployment note",
            content: "Web -> API",
            updatedAt: "2026-07-21T10:00:00.000Z",
          }),
          createArchitecture({
            id: 1,
            title: "Production deployment",
            content: deploymentContent,
            updatedAt: "2026-07-21T09:00:00.000Z",
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Deployment architecture" }),
    ).toBeInTheDocument();
    const graph = screen.getByRole("region", {
      name: "Harness production deployment architecture",
    });
    expect(within(graph).getByText("Next.js Web")).toBeInTheDocument();
    expect(within(graph).getByText("Nest API")).toBeInTheDocument();
    expect(within(graph).getByText(/Dashboard API.*HTTPS|HTTPS.*Dashboard API/)).toBeInTheDocument();
  });

  it("legacy prose만 있으면 graph를 가장하지 않고 원문을 보존한다", () => {
    render(
      <ArchitectureWorkspace
        architectures={[
          createArchitecture({
            title: "Legacy deployment",
            content: "Harness Agent -> MCP -> SQLite",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/legacy|deployment/i);
    expect(screen.getByText("Legacy deployment")).toBeInTheDocument();
    expect(screen.getByText("Harness Agent -> MCP -> SQLite")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /deployment architecture/i })).not.toBeInTheDocument();
  });

  it("Architecture record가 없으면 deployment empty state를 표시한다", () => {
    render(<ArchitectureWorkspace architectures={[]} />);

    expect(
      screen.getByRole("heading", { name: "No deployment architecture yet" }),
    ).toBeInTheDocument();
  });
});
