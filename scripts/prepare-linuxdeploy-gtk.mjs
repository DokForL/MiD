import { execFileSync } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifest = fileURLToPath(new URL('../src-tauri/Cargo.toml', import.meta.url));
const metadata = execFileSync('cargo', [
  'metadata', '--no-deps', '--format-version', '1', '--manifest-path', manifest,
], { encoding: 'utf8' });
const tools = join(JSON.parse(metadata).target_directory, '.tauri');
const plugin = join(tools, 'linuxdeploy-plugin-gtk.sh');

const revision = 'dda522bce37387f1b853d9095713bfaa924c8423';
const url = `https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gtk/${revision}/linuxdeploy-plugin-gtk.sh`;
const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Could not download the GTK bundling plugin (HTTP ${response.status})`);
}

const source = await response.text();
const forcedBackend = /^export GDK_BACKEND=x11(?:[ \t]+#[^\n]*)?\n/m;
if (!forcedBackend.test(source)) {
  throw new Error('Expected the GTK bundling plugin to force the X11 backend');
}

// Let GTK select the session backend and honor an explicitly configured GDK_BACKEND.
const temporaryPlugin = `${plugin}.${process.pid}.tmp`;
await mkdir(tools, { recursive: true });
await writeFile(temporaryPlugin, source.replace(forcedBackend, ''), { mode: 0o755 });
await rename(temporaryPlugin, plugin);
