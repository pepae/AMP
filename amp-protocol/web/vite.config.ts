import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Set VITE_BASE_URL env var when deploying to a subdirectory on GitHub Pages,
  // e.g. VITE_BASE_URL=/amp-protocol/ for username.github.io/amp-protocol/
  base: process.env.VITE_BASE_URL ?? "/",
  server: {
    port: 5173,
  },
});
