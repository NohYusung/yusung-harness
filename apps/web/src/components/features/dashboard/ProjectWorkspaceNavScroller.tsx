"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { WorkspaceRelation } from "./ArtifactBrowser";

/** RSC 경계를 통과하는 단일 workspace 메뉴의 primitive 표시 정보. */
export interface ProjectWorkspaceNavItem {
  count: number;
  label: string;
  relation: WorkspaceRelation;
}

/** client leaf가 링크와 활성 메뉴 reveal을 렌더링하는 데 필요한 primitive props. */
interface ProjectWorkspaceNavScrollerProps {
  activeRelation: WorkspaceRelation;
  items: ReadonlyArray<ProjectWorkspaceNavItem>;
  projectId: number;
}

/** workspace 링크를 렌더링하고 활성 링크를 가로 scroll 영역 안으로 드러낸다. */
export function ProjectWorkspaceNavScroller({
  activeRelation,
  items,
  projectId,
}: ProjectWorkspaceNavScrollerProps) {
  const activeLinkRef = useRef<HTMLAnchorElement>(null);

  /** mount와 relation 전환 시 가로 스크롤 밖의 활성 메뉴를 가장 가까운 위치로 드러낸다. */
  useEffect(() => {
    const activeLink = activeLinkRef.current;

    /** jsdom 등 scrollIntoView 미지원 환경에서는 reveal 호출을 생략한다. */
    if (typeof activeLink?.scrollIntoView !== "function") return;

    activeLink.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeRelation]);

  return (
    <nav
      aria-label="Project artifacts"
      className="sticky top-0 z-20 mt-6 shrink-0 border-b bg-canvas/95 px-5 backdrop-blur-sm sm:px-8 lg:px-8 2xl:px-10"
    >
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        {items.map((item) => {
          const isActive = activeRelation === item.relation;

          return (
            <Link
              ref={isActive ? activeLinkRef : undefined}
              key={item.relation}
              href={`/projects/${projectId}?type=${item.relation}`}
              aria-label={`${item.label} ${item.count}`}
              aria-current={isActive ? "page" : undefined}
              scroll={false}
              className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none ${
                isActive
                  ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary"
                  : "text-muted hover:bg-hover hover:text-ink"
              }`}
            >
              {item.label}
              <span className="font-mono text-micro text-subtle">
                {item.count}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
