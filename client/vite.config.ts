import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DEFAULT_SIM_PORT = 8787;
const simPort = process.env.SIM_PORT ?? String(DEFAULT_SIM_PORT);

export default defineConfig({
  plugins: [react()],
  // The generated Tiled map and tileset live in the repo's maps/ directory and are served at the root.
  publicDir: fileURLToPath(new URL("../maps", import.meta.url)),
  build: {
    rollupOptions: {
      input: {
        village: fileURLToPath(new URL("./index.html", import.meta.url)),
        characters: fileURLToPath(new URL("./characters.html", import.meta.url)),
        items: fileURLToPath(new URL("./items.html", import.meta.url)),
      },
    },
  },
  server: {
    proxy: {
      "/ws": { target: `http://localhost:${simPort}`, ws: true },
    },
  },
});
