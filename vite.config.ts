import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/** Committed pointer: one path to the env file Vite should load (web / default). */
const ENV_FILE_POINTER = 'vite.env-file';
const DEFAULT_ENV_FILE = '.env.local';
/** Prefer this under Tauri CLI hooks when the file exists. */
const TAURI_ENV_FILE = '.env.tauri';

function resolveViteEnvFile(): string {
  const fromEnv = process.env.RAP_ENV_FILE?.trim();
  if (fromEnv) return fromEnv;

  // beforeDevCommand / beforeBuildCommand set TAURI_ENV_PLATFORM
  if (process.env.TAURI_ENV_PLATFORM) {
    const tauriAbs = path.resolve(process.cwd(), TAURI_ENV_FILE);
    if (fs.existsSync(tauriAbs)) return TAURI_ENV_FILE;
  }

  const pointer = path.resolve(process.cwd(), ENV_FILE_POINTER);
  if (fs.existsSync(pointer)) {
    const line = fs
      .readFileSync(pointer, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith('#'));
    if (line) return line;
  }
  return DEFAULT_ENV_FILE;
}

const envFileRel = resolveViteEnvFile();
const envFileAbs = path.isAbsolute(envFileRel)
  ? envFileRel
  : path.resolve(process.cwd(), envFileRel);

if (!fs.existsSync(envFileAbs)) {
  console.warn(`[vite] env file missing: ${envFileRel}`);
} else {
  const loaded = dotenv.config({ path: envFileAbs, override: true });
  if (loaded.error) {
    console.warn(`[vite] env load failed (${envFileRel}):`, loaded.error.message);
  } else {
    console.info(`[vite] env ← ${envFileRel}`);
  }
}

const host = process.env.TAURI_DEV_HOST;
/** Set by Tauri CLI for beforeDevCommand / beforeBuildCommand hooks. */
const underTauriCli = Boolean(process.env.TAURI_ENV_PLATFORM);

/**
 * Reserved Labs ports (see Labs/AGENTS.md → resource-allocation-planner 5400–5409):
 * - `pnpm dev` (web): Vite 5400, HMR 5401
 * - `tauri:dev`: Vite 5402, HMR 5403
 */
const vitePort = underTauriCli ? 5402 : 5400;
const hmrPort = vitePort + 1;

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Disable Vite's default .env* cascade — only the pointer / RAP_ENV_FILE file.
  // Platform env (Vercel) still wins via process.env.
  envDir: false,
  clearScreen: false,
  server: {
    port: vitePort,
    strictPort: true,
    host: host || '0.0.0.0',
    hmr: {
      protocol: 'ws',
      host: host || '127.0.0.1',
      port: hmrPort,
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
