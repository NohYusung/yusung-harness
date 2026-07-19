"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ProjectSummary } from "@/types/dashboard";

interface ProjectSwitcherProps {
  currentProjectId: number;
  id: string;
  projects: ProjectSummary[];
}

export function ProjectSwitcher({
  currentProjectId,
  id,
  projects,
}: ProjectSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-xs font-semibold tracking-[0.12em] text-muted uppercase">
        Project
      </span>
      <span className="relative block">
        <select
          id={id}
          value={currentProjectId}
          disabled={isPending}
          onChange={(event) => {
            const nextProjectId = event.target.value;
            startTransition(() => router.push(`/projects/${nextProjectId}`));
          }}
          className="min-h-11 w-full appearance-none rounded-control border bg-surface py-2 pr-9 pl-3 text-sm font-semibold text-ink transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title} · {project.repoType}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted"
        >
          {isPending ? "…" : "⌄"}
        </span>
      </span>
    </label>
  );
}
