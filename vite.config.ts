import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/** Committed pointer: one path to the env file Vite should load. */
const ENV_FILE_POINTER = 'vite.env-file';
const DEFAULT_ENV_FILE = '.env.local';

function resolveViteEnvFile(): string {
  const fromEnv = process.env.RAP_ENV_FILE?.trim();
  if (fromEnv) return fromEnv;

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

/** Reserved Labs ports: Vite 5400, HMR 5401 (see Labs/AGENTS.md). */
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Disable Vite's default .env* cascade — only the pointer / RAP_ENV_FILE file.
  // Platform env (Vercel) still wins via process.env.
  envDir: false,
  clearScreen: false,
  server: {
    port: 5400,
    strictPort: true,
    host: host || '0.0.0.0',
    hmr: {
      protocol: 'ws',
      host: host || '127.0.0.1',
      port: 5401,
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
