import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

/** Reserved Labs ports: Vite 5400, HMR 5401 (see Labs/AGENTS.md). */
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  clearScreen: false,
  server: {
    port: 5400,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: {
      protocol: "ws",
      host: host || "127.0.0.1",
      port: 5401,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
