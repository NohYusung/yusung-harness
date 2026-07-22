import Link from "next/link";
import { redirect } from "next/navigation";
import { getProjects } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await getProjects();
  const firstProject = projects[0];

  if (firstProject) {
    redirect(`/projects/${firstProject.id}`);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <section className="w-full max-w-xl rounded-card border bg-surface p-8 text-center shadow-card sm:p-12">
        <span
          aria-hidden="true"
          className="mx-auto grid size-12 place-items-center rounded-card bg-primary-soft font-mono text-sm font-semibold text-primary"
        >
          YH
        </span>
        <p className="mt-6 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          Project Workbench
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          No Project connected
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          Plan, Task, Design, and Review records will appear after a harness
          agent registers a Project.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-control border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
        >
          Check again
        </Link>
      </section>
    </main>
  );
}
