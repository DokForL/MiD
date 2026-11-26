import { beforeEach, describe, expect, it, vi } from "vitest";

// The tab store persists a restorable session on every change (#72). These
// tests run it against a fake localStorage and read the key back directly.
const SESSION_KEY = "mid-session";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

async function freshStore(initial: Record<string, string> = {}) {
  vi.resetModules();
  (globalThis as any).localStorage = fakeStorage(initial);
  (globalThis as any).window = { scrollY: 0 };
  const mod = await import("../../src/lib/stores/tabs");
  return mod.tabStore;
}

function session() {
  return JSON.parse((globalThis as any).localStorage.getItem(SESSION_KEY));
}

describe("tab session persistence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("records on-disk tabs in order and which one is active", async () => {
    const store = await freshStore();
    store.addTab("/docs/a.md", "a.md", "", "");
    store.addTab("/docs/b.md", "b.md", "", "");
    store.addTab("/docs/c.md", "c.md", "", "");
    store.switchTab(store.getActiveTab()!.id); // no-op switch keeps c active

    expect(session()).toEqual({ paths: ["/docs/a.md", "/docs/b.md", "/docs/c.md"], activePath: "/docs/c.md" });
  });

  it("leaves out tabs that have no file to come back from", async () => {
    const store = await freshStore();
    store.addTab("/docs/a.md", "a.md", "", "");
    store.addTab("paste://1", "Pasted", "", "");
    store.addTab("url://https://example.com/x.md", "x.md", "", "");
    store.addTab("new://2", "Untitled", "", "");

    expect(session()).toEqual({ paths: ["/docs/a.md"], activePath: null });
  });

  it("records the home tab as no active file", async () => {
    const store = await freshStore();
    store.addTab("/docs/a.md", "a.md", "", "");
    store.goHome();

    expect(session().activePath).toBeNull();
    expect(session().paths).toEqual(["/docs/a.md"]);
  });

  it("follows closes and reorders", async () => {
    const store = await freshStore();
    store.addTab("/docs/a.md", "a.md", "", "");
    const b = store.addTab("/docs/b.md", "b.md", "", "");
    store.addTab("/docs/c.md", "c.md", "", "");

    store.reorderTabs(2, 0);
    expect(session().paths).toEqual(["/docs/c.md", "/docs/a.md", "/docs/b.md"]);

    store.closeTab(b);
    expect(session()).toEqual({ paths: ["/docs/c.md", "/docs/a.md"], activePath: "/docs/c.md" });
  });

  it("makes a new document restorable once it is saved to a path", async () => {
    const store = await freshStore();
    const id = store.addTab("new://1", "Untitled", "", "");
    expect(session().paths).toEqual([]);

    store.rebindPath(id, "/docs/saved.md", "saved.md");
    expect(session()).toEqual({ paths: ["/docs/saved.md"], activePath: "/docs/saved.md" });
  });

  it("hands back the previous run's session, not the empty one it just wrote", async () => {
    const store = await freshStore({
      [SESSION_KEY]: JSON.stringify({ paths: ["/docs/old.md", "paste://9"], activePath: "/docs/old.md" }),
    });

    // The store's own persistence has already overwritten the key on init...
    expect(session()).toEqual({ paths: [], activePath: null });
    // ...but the captured copy is what restoreSession needs, sentinels dropped.
    expect(store.getSavedSession()).toEqual({ paths: ["/docs/old.md"], activePath: "/docs/old.md" });
  });

  it("treats a corrupt or missing session as nothing to restore", async () => {
    expect((await freshStore({ [SESSION_KEY]: "{not json" })).getSavedSession()).toBeNull();
    expect((await freshStore({ [SESSION_KEY]: JSON.stringify({ nope: 1 }) })).getSavedSession()).toBeNull();
    expect((await freshStore()).getSavedSession()).toBeNull();
  });
});

describe("rendered tab cache", () => {
  it("evicts old HTML while retaining edits and the selected tab", async () => {
    const store = await freshStore();
    const first = store.addTab("/docs/a.md", "a.md", "source", "<p>source</p>");
    store.setEditing(first, true);
    store.updateEditContent(first, "unsaved");
    for (let i = 0; i < 10; i++) {
      store.addTab(`/docs/b-${i}.md`, `b-${i}.md`, "second", "<p>second</p>");
    }

    expect(store.getActiveTab()?.renderedHtml).toBe("<p>second</p>");
    store.switchTab(first);
    expect(store.getActiveTab()).toMatchObject({
      editContent: "unsaved", dirty: true, renderedHtml: "", needsRender: true,
    });
    store.restoreRenderedHtml(first, "wrong source", "<p>Wrong</p>");
    expect(store.getActiveTab()?.needsRender).toBe(true);
    store.restoreRenderedHtml(first, "source", "<p>Restored</p>");
    expect(store.getActiveTab()).toMatchObject({
      editContent: "unsaved", dirty: true, renderedHtml: "<p>Restored</p>",
    });
    expect(store.getActiveTab()?.needsRender).toBeUndefined();
  });
});

it("writes session storage only when the saved tab state changes", async () => {
  const store = await freshStore();
  const storage = vi.spyOn(globalThis.localStorage, "setItem");
  const id = store.addTab("/docs/a.md", "a.md", "saved", "<p>saved</p>");
  storage.mockClear();

  store.setEditing(id, true);
  store.updateEditContent(id, "draft");
  store.saveScrollPosition();
  expect(storage).not.toHaveBeenCalled();

  store.goHome();
  expect(storage).toHaveBeenCalledTimes(1);
  expect(session()).toEqual({ paths: ["/docs/a.md"], activePath: null });
});
