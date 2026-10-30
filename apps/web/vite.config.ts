import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    // Mesma origem que a API: o cookie de sessão vale sem CORS no dev.
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
  },
  // Prévia sem servidor (scripts/previa.ts junta tudo num HTML só): fontes e fotos embutidas.
  ...(mode === "previa" && {
    publicDir: false,
    build: { outDir: "dist-previa", assetsInlineLimit: () => true, rollupOptions: { input: "previa.html" } },
  }),
}));
