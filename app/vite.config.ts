import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
      // Atlas tiles are proxied in dev so we can swap in a local cache later without touching the client.
      "/tiles": {
        target: "https://atlas.plan-ops.fr",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tiles/, "/data/1/maps/124"),
      },
    },
  },
});
