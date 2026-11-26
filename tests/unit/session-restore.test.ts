import { beforeEach, describe, expect, it, vi } from "vitest";

const pathExists = vi.fn();
const switchTab = vi.fn();
const restorePlaceholders = vi.fn((files: { filePath: string; fileName: string }[]) =>
  files.map((file) => ({ ...file, id: `id:${file.filePath}` }))
);
let saved: { paths: string[]; activePath: string | null } | null = null;
let activeTabId = "__home__";

vi.mock("../../src/lib/tauri/files", () => ({ pathExists }));
vi.mock("../../src/lib/stores/tabs", () => ({
  tabStore: {
    getSavedSession: () => saved,
    activeTabId: { subscribe: (run: (v: string) => void) => (run(activeTabId), () => {}) },
    restorePlaceholders,
    switchTab,
  },
}));

const { restoreSession } = await import("../../src/lib/tauri/session");

describe("restoreSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathExists.mockResolvedValue(true);
    activeTabId = "__home__";
    saved = null;
  });

  it("does nothing when there is no saved session", async () => {
    expect(await restoreSession()).toBe(0);
    expect(restorePlaceholders).not.toHaveBeenCalled();
  });

  it("restores placeholders in saved order and activates the previous tab", async () => {
    saved = { paths: ["/d/a.md", "/d/b.md", "/d/c.md"], activePath: "/d/b.md" };
    expect(await restoreSession()).toBe(3);
    expect(restorePlaceholders).toHaveBeenCalledWith([
      { filePath: "/d/a.md", fileName: "a.md" },
      { filePath: "/d/b.md", fileName: "b.md" },
      { filePath: "/d/c.md", fileName: "c.md" },
    ]);
    expect(switchTab).toHaveBeenCalledWith("id:/d/b.md");
  });

  it("skips missing or inaccessible files and selects the last available tab when necessary", async () => {
    saved = { paths: ["/d/a.md", "/d/gone.md", "/d/denied.md", "/d/c.md"], activePath: "/d/gone.md" };
    pathExists.mockImplementation(async (path: string) => {
      if (path.endsWith("denied.md")) throw new Error("Access denied");
      return !path.endsWith("gone.md");
    });

    expect(await restoreSession()).toBe(2);
    expect(switchTab).toHaveBeenCalledWith("id:/d/c.md");
  });

  it("keeps home selected when the previous session ended there", async () => {
    saved = { paths: ["/d/a.md"], activePath: null };
    expect(await restoreSession()).toBe(1);
    expect(switchTab).not.toHaveBeenCalled();
  });

  it("leaves an explicitly opened document selected", async () => {
    saved = { paths: ["/d/a.md"], activePath: "/d/a.md" };
    activeTabId = "requested";
    expect(await restoreSession(false)).toBe(1);
    expect(switchTab).not.toHaveBeenCalled();
  });

  it("preserves a selection made while checking saved paths", async () => {
    saved = { paths: ["/d/a.md"], activePath: "/d/a.md" };
    pathExists.mockImplementation(async () => {
      activeTabId = "user-selected";
      return true;
    });
    expect(await restoreSession()).toBe(1);
    expect(switchTab).not.toHaveBeenCalled();
  });
});
