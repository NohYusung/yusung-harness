const summarySkeletons = ["합계", "작업", "계획", "활동"];
const navigationSkeletons = Array.from({ length: 9 }, (_, index) => index);

export default function ProjectLoading() {
  return (
    <main aria-busy="true" className="min-h-dvh bg-canvas">
      <span className="sr-only">프로젝트를 불러오는 중입니다.</span>
      <div aria-hidden="true" className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden h-dvh border-r bg-surface p-5 lg:block">
          <div className="h-10 w-36 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
          <div className="mt-8 h-16 animate-pulse rounded-card bg-surface-muted motion-reduce:animate-none" />
          <div className="mt-8 space-y-2">
            {navigationSkeletons.map((item) => (
              <div
                key={item}
                className="h-10 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        </aside>
        <div className="mx-auto w-full max-w-[96rem] p-5 sm:p-8 lg:p-10">
          <div className="h-5 w-28 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
          <div className="mt-4 h-10 w-2/3 max-w-lg animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summarySkeletons.map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-card border bg-surface motion-reduce:animate-none" />
            ))}
          </div>
          <div className="mt-6 h-40 animate-pulse rounded-card border bg-surface motion-reduce:animate-none" />
          <div className="mt-6 h-[30rem] animate-pulse rounded-card border bg-surface motion-reduce:animate-none" />
        </div>
      </div>
    </main>
  );
}
