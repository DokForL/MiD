import { get } from "svelte/store";
import { tabStore } from "../stores/tabs";
import { basename } from "../utils/path";
import { pathExists } from "./files";

/** Restore tab order from metadata. Activating a placeholder loads its document. */
export async function restoreSession(activate = true): Promise<number> {
  const saved = tabStore.getSavedSession();
  if (!saved?.paths.length) return 0;

  const initialTabId = get(tabStore.activeTabId);
  const paths = [...new Set(saved.paths)];
  const available = await Promise.all(paths.map((path) => pathExists(path).catch(() => false)));
  const files = paths.flatMap((filePath, index) =>
    available[index] ? [{ filePath, fileName: basename(filePath) }] : []
  );
  if (!files.length) return 0;

  const restored = tabStore.restorePlaceholders(files);
  if (activate && initialTabId === get(tabStore.activeTabId) && saved.activePath !== null) {
    const active = restored.find((tab) => tab.filePath === saved.activePath) ?? restored.at(-1);
    if (active) tabStore.switchTab(active.id);
  }
  return restored.length;
}
