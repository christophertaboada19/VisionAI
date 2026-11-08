/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { fileURLToPath } from "node:url";

const BACKEND = "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => ({
  // `npm run dev:celular` activa HTTPS (certificado local): los celulares solo permiten usar
  // la cámara en páginas seguras. `npm run dev` sigue siendo HTTP normal.
  plugins: [react(), tailwindcss(), ...(mode === "celular" ? [basicSsl()] : [])],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    // Accesible desde otros equipos de la red (celulares en el mismo Wi-Fi).
    host: true,
    // Desde el celular la API se pide a esta misma dirección y Vite la reenvía al backend local:
    // así funciona sin configurar IPs y sin bloqueos por HTTPS/HTTP mezclados.
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/health": { target: BACKEND, changeOrigin: true },
    },
  },
  // Pre-empaquetadas al arrancar: evita que Vite recargue la página la primera vez que se exporta a PDF/Excel.
  optimizeDeps: { include: ["exceljs", "jspdf", "jspdf-autotable", "hls.js"] },
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"], charts: ["recharts"], icons: ["lucide-react"] } },
    },
  },
  test: { environment: "node", include: ["src/tests/**/*.test.ts"] },
}));
