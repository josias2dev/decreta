import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { landingEstatica } from "./scripts/vite-landing";

/**
 * Os decodificadores do pdf.js para as imagens dos PDFs escaneados (JBIG2,
 * JPEG 2000) vão para /pdfjs/ com o nome que ele procura (lib/pdf.ts).
 */
function decodificadoresDoPdf(): Plugin {
  const pasta = new URL("wasm/", `file://${createRequire(import.meta.url).resolve("pdfjs-dist/package.json")}`);
  return {
    name: "decodificadores-do-pdf",
    apply: "build",
    generateBundle() {
      for (const nome of ["jbig2.wasm", "jbig2_nowasm_fallback.js", "openjpeg.wasm"]) this.emitFile({ type: "asset", fileName: `pdfjs/${nome}`, source: readFileSync(new URL(nome, pasta)) });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "previa" ? [] : [decodificadoresDoPdf(), landingEstatica()])],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    // Mesma origem que a API: o cookie de sessão vale sem CORS no dev.
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
  },
  // A landing é uma página à parte, estática, com o JavaScript só dela; o app fica em index.html.
  build: { rollupOptions: { input: { index: "index.html", landing: "landing.html" } } },
  // Prévia sem servidor (scripts/previa.ts junta tudo num HTML só): fontes, fotos e o PDF e o Word embutidos.
  ...(mode === "previa" && {
    base: "./",
    publicDir: false,
    build: { outDir: "dist-previa", assetsInlineLimit: () => true, rollupOptions: { input: "previa.html", output: { inlineDynamicImports: true } } },
  }),
}));
