import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import process from 'node:process';

/** Tauri ships the SPA from disk — no service worker. */
const underTauriCli = Boolean(process.env.TAURI_ENV_PLATFORM);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html',
    }),
    prerender: {
      handleUnseenRoutes: 'ignore',
    },
    serviceWorker: {
      register: !underTauriCli,
    },
  },
};

export default config;
