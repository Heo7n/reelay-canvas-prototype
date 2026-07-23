import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface ProjectMenuContextValue {
  activeProjectId: string | null;
  closeMenu: () => void;
  toggleMenu: (projectId: string, trigger: HTMLElement) => void;
}

const ProjectMenuContext = createContext<ProjectMenuContextValue | null>(null);

interface ProjectMenuProviderProps {
  children: ReactNode;
}

export function ProjectMenuProvider({ children }: ProjectMenuProviderProps) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const activeTrigger = useRef<HTMLElement | null>(null);
  const closeMenu = useCallback(() => {
    activeTrigger.current = null;
    setActiveProjectId(null);
  }, []);
  const toggleMenu = useCallback((projectId: string, trigger: HTMLElement) => {
    setActiveProjectId((current) => {
      if (current === projectId) {
        activeTrigger.current = null;
        return null;
      }
      activeTrigger.current = trigger;
      return projectId;
    });
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;

    function clickedInsideActiveMenu(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false;
      return target.closest<HTMLElement>("[data-project-menu-id]")?.dataset.projectMenuId === activeProjectId;
    }

    function closeFromOutside(event: PointerEvent | FocusEvent): void {
      if (!clickedInsideActiveMenu(event.target)) closeMenu();
    }

    function closeFromEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const trigger = activeTrigger.current;
      closeMenu();
      trigger?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("focusin", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("focusin", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [activeProjectId, closeMenu]);

  const contextValue = useMemo<ProjectMenuContextValue>(() => ({
    activeProjectId,
    closeMenu,
    toggleMenu,
  }), [activeProjectId, closeMenu, toggleMenu]);

  return <ProjectMenuContext.Provider value={contextValue}>{children}</ProjectMenuContext.Provider>;
}

export function useProjectMenu(projectId: string) {
  const context = useContext(ProjectMenuContext);
  if (!context) throw new Error("ProjectCard must be rendered inside ProjectMenuProvider.");

  return {
    closeMenu: context.closeMenu,
    menuOpen: context.activeProjectId === projectId,
    toggleMenu: (trigger: HTMLElement) => context.toggleMenu(projectId, trigger),
  };
}
