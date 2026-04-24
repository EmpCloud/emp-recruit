import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 5179,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:4500",
        changeOrigin: true,
      },
      // #27 — static uploads (resumes, offer letters) are served from the
      // backend at /uploads. Without this proxy, <a href="/uploads/...">
      // resolves to the Vite origin and 404s.
      "/uploads": {
        target: "http://localhost:4500",
        changeOrigin: true,
      },
    },
  },
});
