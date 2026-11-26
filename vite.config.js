import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

const renderRevision = createHash("sha256");
for (const path of [
  "./pnpm-lock.yaml",
  "./src/lib/renderer/parse-markdown.ts",
  "./src/lib/renderer/math-markdown.ts",
  "./src/lib/renderer/document-info.ts",
  "./src/lib/renderer/finalize-markdown.ts",
]) {
  renderRevision.update(readFileSync(new URL(path, import.meta.url)));
}

// https://vite.dev/config/
export default defineConfig({
  define: { __MID_RENDER_REVISION__: JSON.stringify(renderRevision.copy().digest("hex")) },
  worker: { format: "es" },
  plugins: [sveltekit(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**", "**/tests/**", "**/target/**"],
    },
  },
});
