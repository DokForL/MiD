// Native menu and toolbar output paths share the mounted viewer's deferred work.
const viewers = new Set<(loadImages: boolean) => Promise<void>>();

export function registerDocumentOutput(prepare: (loadImages: boolean) => Promise<void>): () => void {
  viewers.add(prepare);
  return () => viewers.delete(prepare);
}

export async function prepareDocumentOutput(loadImages = true): Promise<void> {
  await Promise.all([...viewers].map((prepare) => prepare(loadImages)));
}
