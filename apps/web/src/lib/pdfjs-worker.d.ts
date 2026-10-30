// O worker do pdf.js não traz tipos; a prévia só o carrega para rodar na página.
declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  export const WorkerMessageHandler: unknown;
}
