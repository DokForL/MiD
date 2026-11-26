import { writable, get } from "svelte/store";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type ThemeMode = "light" | "dark" | "system";

const initialMode = globalThis.document?.documentElement.dataset.themeMode;
export const themeMode = writable<ThemeMode>(
  initialMode === "light" || initialMode === "dark" ? initialMode : "system",
);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getEffectiveTheme(): "light" | "dark" {
  const mode = get(themeMode);
  if (mode === "system") return getSystemTheme();
  return mode;
}

export function applyCurrentTheme(): void {
  const theme = getEffectiveTheme();
  const html = globalThis.document?.documentElement;
  if (!html) return;

  if (theme === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }
  if (isTauri()) {
    void invoke("set_title_bar_theme", { dark: theme === "dark" }).catch(console.error);
  }
}

export function initThemeListener(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", applyCurrentTheme);
  const unsubscribe = themeMode.subscribe((mode) => {
    try {
      localStorage.setItem("mid-theme", mode);
    } catch {
      // Keep theme switching usable when storage is unavailable.
    }
    applyCurrentTheme();
  });

  return () => {
    unsubscribe();
    mq.removeEventListener("change", applyCurrentTheme);
  };
}

export function cycleTheme(current: ThemeMode): ThemeMode {
  const order: ThemeMode[] = ["system", "light", "dark"];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}
