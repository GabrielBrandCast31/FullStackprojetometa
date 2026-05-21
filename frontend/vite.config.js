import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O FastAPI serve o build (frontend/dist) na raiz e a API em /api.
// Em dev, o Vite roda na 5173 e faz proxy de /api -> backend 127.0.0.1:8000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
