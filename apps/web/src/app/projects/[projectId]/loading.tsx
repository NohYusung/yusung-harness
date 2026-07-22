/** 사이드바의 프로젝트 자리표시자 key. */
const projectSkeletons = Array.from({ length: 3 }, (_, index) => index);
/** 7개 상단 workspace 메뉴의 자리표시자 key. */
const viewSkeletons = Array.from({ length: 7 }, (_, index) => index);

/** Resolved dashboard와 같은 full-bleed geometry를 유지하는 loading shell. */
export default function ProjectLoading() {
  return (
    <main aria-busy="true" className="min-h-dvh bg-canvas">
      <span className="sr-only">Loading Project.</span>
      <div aria-hidden="true" className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden h-dvh border-r bg-sidebar p-4 lg:block">
          <div className="h-10 w-36 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
          <div className="mt-10 h-3 w-20 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
          <div className="mt-8 space-y-2">
            {projectSkeletons.map((item) => (
              <div
                key={item}
                className="h-11 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        </aside>
        <div className="min-w-0 lg:h-dvh lg:overflow-hidden">
          <div className="flex min-h-dvh w-full flex-col lg:h-full">
            <div className="shrink-0 px-5 pt-6 sm:px-8 sm:pt-8 lg:px-8 lg:pt-8 2xl:px-10">
              <div className="mb-8 h-16 animate-pulse rounded-card border bg-sidebar motion-reduce:animate-none lg:hidden" />
              <div className="h-5 w-28 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
              <div className="mt-4 h-10 w-2/3 max-w-lg animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
              <div className="mt-3 h-5 w-1/2 max-w-2xl animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
              <div className="mt-4 h-4 w-2/5 max-w-lg animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
            </div>
            <div className="mt-6 flex shrink-0 gap-2 overflow-hidden border-b px-5 pb-2 sm:px-8 lg:px-8 2xl:px-10">
              {viewSkeletons.map((item) => (
                <div
                  key={item}
                  className="h-8 w-16 shrink-0 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none"
                />
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-surface lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto border-r p-5">
                <div className="h-16 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
                <div className="mt-3 h-16 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
              </div>
              <div className="hidden min-h-0 overflow-y-auto p-8 lg:block">
                <div className="h-6 w-40 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
                <div className="mt-6 h-40 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
