"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ProjectSummary, RepoType } from "@/types/dashboard";

/** 상단바 프로젝트 전환기에 필요한 현재 project와 목록. */
interface ProjectPickerProps {
  currentProjectId: number;
  projects: ProjectSummary[];
}

/** 프로젝트 repository type을 중복 없는 표시 순서로 축약한다. */
function getRepositoryTypes(project: ProjectSummary): RepoType[] {
  return Array.from(
    new Set(project.repoPaths.map(({ repoType }) => repoType)),
  );
}

/** repository source를 작은 앱 스타일 badge로 표시한다. */
function RepositoryTypeBadge({ repoType }: { repoType: RepoType }) {
  return (
    <span className="rounded-[4px] border border-sidebar-line bg-sidebar px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.06em] text-sidebar-subtle">
      {repoType}
    </span>
  );
}

/** 프로젝트 전환기가 기존 상단바 브랜드 위치를 유지하도록 YH mark를 표시한다. */
function ProjectMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 shrink-0 place-items-center rounded-control border border-sidebar-line bg-sidebar font-mono text-[10px] font-semibold tracking-[0.04em] text-sidebar-ink"
    >
      YH
    </span>
  );
}

/** 상단바 안에서 현재 프로젝트를 표시하고 여러 프로젝트를 link panel로 전환한다. */
export function ProjectPicker({
  currentProjectId,
  projects,
}: ProjectPickerProps) {
  const currentProject =
    projects.find(({ id }) => id === currentProjectId) ?? projects[0];
  const currentProjectIndex = Math.max(
    projects.findIndex(({ id }) => id === currentProject?.id),
    0,
  );
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const focusIndexOnOpenRef = useRef<number | null>(null);
  const menuId = useId();

  /** panel을 연 직후 요청된 project link로 focus를 이동한다. */
  useEffect(() => {
    if (!isOpen || focusIndexOnOpenRef.current === null) {
      return;
    }

    itemRefs.current[focusIndexOnOpenRef.current]?.focus();
    focusIndexOnOpenRef.current = null;
  }, [isOpen]);

  /** pointer 또는 focus가 picker 바깥으로 이동하면 열린 panel을 닫는다. */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    /** picker 외부 pointer 입력을 panel 닫힘으로 변환한다. */
    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    /** keyboard focus가 picker 외부로 빠져나가면 panel을 닫는다. */
    function closeOnOutsideFocus(event: FocusEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("focusin", closeOnOutsideFocus);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("focusin", closeOnOutsideFocus);
    };
  }, [isOpen]);

  if (!currentProject) {
    return null;
  }

  const currentRepositoryTypes = getRepositoryTypes(currentProject);

  /** 지정한 item을 focus할 상태로 panel을 연다. */
  function openAndFocus(index: number) {
    if (isOpen) {
      focusIndexOnOpenRef.current = null;
      itemRefs.current[index]?.focus();
      return;
    }

    focusIndexOnOpenRef.current = index;
    setIsOpen(true);
  }

  /** panel을 닫고 keyboard 흐름을 project trigger로 복귀시킨다. */
  function closeAndRestoreFocus() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  /** click·Enter·Space의 native button activation은 현재 프로젝트부터 panel을 연다. */
  function toggleFromTriggerActivation() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    openAndFocus(currentProjectIndex);
  }

  /** trigger의 방향키와 Escape를 link panel 열기·닫기로 연결한다. */
  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleFromTriggerActivation();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Home") {
      event.preventDefault();
      openAndFocus(0);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "End") {
      event.preventDefault();
      openAndFocus(projects.length - 1);
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeAndRestoreFocus();
    }
  }

  /** link panel 안의 방향키·Home·End·Escape focus 이동을 처리한다. */
  function handleProjectKeyDown(
    event: ReactKeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = (index + 1) % projects.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (index - 1 + projects.length) % projects.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = projects.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    itemRefs.current[nextIndex]?.focus();
  }

  /** 한 프로젝트만 연결된 환경에서는 불필요한 popup 제어를 노출하지 않는다. */
  if (projects.length === 1) {
    return (
      <div
        aria-label={`Current project: ${currentProject.title}`}
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-control border border-sidebar-line bg-sidebar-hover px-2.5 text-sidebar-ink shadow-card"
      >
        <ProjectMark />
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-semibold"
          title={currentProject.title}
        >
          {currentProject.title}
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {currentRepositoryTypes.map((repoType) => (
            <RepositoryTypeBadge key={repoType} repoType={repoType} />
          ))}
          {currentProject.repoPaths.length > 1 ? (
            <span className="font-mono text-[10px] text-sidebar-subtle">
              {currentProject.repoPaths.length} repos
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-label={`Switch project. Current project: ${currentProject.title}`}
        className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control border border-sidebar-line bg-sidebar-hover px-2.5 text-left text-sidebar-ink shadow-card transition-colors hover:border-sidebar-subtle hover:bg-sidebar-selected focus-visible:ring-2 focus-visible:ring-focus-dark focus-visible:outline-none motion-reduce:transition-none"
        onClick={toggleFromTriggerActivation}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <ProjectMark />
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-semibold"
          title={currentProject.title}
        >
          {currentProject.title}
        </span>
        <span className="hidden shrink-0 items-center gap-1 md:flex">
          {currentRepositoryTypes[0] ? (
            <RepositoryTypeBadge repoType={currentRepositoryTypes[0]} />
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-sidebar-subtle transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>

      {isOpen ? (
        <nav
          id={menuId}
          aria-label="Projects"
          className="absolute top-[calc(100%+0.5rem)] left-0 z-50 max-h-[min(24rem,calc(100dvh-5rem))] w-[22.5rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-card border border-sidebar-line bg-sidebar p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.32)]"
        >
          <div className="flex items-center justify-between gap-3 px-2.5 py-2">
            <p className="m-0 text-[10px] font-semibold tracking-[0.12em] text-sidebar-subtle uppercase">
              Projects
            </p>
            <span className="font-mono text-[10px] text-sidebar-subtle">
              {projects.length}
            </span>
          </div>
          <div className="space-y-0.5">
            {projects.map((project, index) => {
              const isCurrent = project.id === currentProject.id;
              const repositoryTypes = getRepositoryTypes(project);

              return (
                <Link
                  key={project.id}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`group flex min-h-14 min-w-0 items-center gap-3 rounded-control px-2.5 py-2 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-focus-dark focus-visible:outline-none motion-reduce:transition-none ${isCurrent ? "bg-sidebar-selected text-sidebar-ink" : ""}`}
                  href={`/projects/${project.id}`}
                  onClick={() => setIsOpen(false)}
                  onKeyDown={(event) => handleProjectKeyDown(event, index)}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-control border border-sidebar-line bg-sidebar-hover font-mono text-[11px] font-semibold text-sidebar-muted group-hover:text-sidebar-ink"
                  >
                    {project.title.trim().charAt(0).toLocaleUpperCase("en-US")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="line-clamp-2 break-words text-[13px] leading-5 font-semibold text-sidebar-ink"
                      title={project.title}
                    >
                      {project.title}
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                      {repositoryTypes.map((repoType) => (
                        <RepositoryTypeBadge
                          key={repoType}
                          repoType={repoType}
                        />
                      ))}
                      {project.repoPaths.length > 1 ? (
                        <span className="font-mono text-[10px] text-sidebar-subtle">
                          {project.repoPaths.length} repos
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {isCurrent ? (
                    <span className="shrink-0 text-sidebar-ink">
                      <Check aria-hidden="true" className="size-4" />
                      <span className="sr-only">Current project</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
