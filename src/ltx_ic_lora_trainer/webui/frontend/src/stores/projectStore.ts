import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

interface ProjectState {
  recentProjects: RecentProject[];
  addRecent: (p: Omit<RecentProject, "lastOpened">) => void;
  removeRecent: (path: string) => void;
  clearRecents: () => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      recentProjects: [],
      addRecent: (p) =>
        set((s) => {
          const without = s.recentProjects.filter((r) => r.path !== p.path);
          return {
            recentProjects: [{ ...p, lastOpened: Date.now() }, ...without].slice(0, 20),
          };
        }),
      removeRecent: (path) =>
        set((s) => ({ recentProjects: s.recentProjects.filter((r) => r.path !== path) })),
      clearRecents: () => set({ recentProjects: [] }),
    }),
    { name: "ltx2-recent-projects" }
  )
);
