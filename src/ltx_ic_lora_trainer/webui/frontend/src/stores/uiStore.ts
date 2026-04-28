import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
  selectedDatasetIndex: number | null;
  setSelectedDatasetIndex: (i: number | null) => void;
  /**
   * When false, the training page hides the "Advanced" and "Research" sidebar
   * groups, and Essentials sections drop fields that aren't typically touched.
   * Off by default — surfacing the full ~200-field surface is opt-in.
   */
  showAdvancedTraining: boolean;
  setShowAdvancedTraining: (v: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
      selectedDatasetIndex: null,
      setSelectedDatasetIndex: (i) => set({ selectedDatasetIndex: i }),
      showAdvancedTraining: false,
      setShowAdvancedTraining: (v) => set({ showAdvancedTraining: v }),
    }),
    {
      name: "ltx2-ui",
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle("dark", state.theme === "dark");
        }
      },
    }
  )
);
