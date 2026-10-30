/** O worker do pdf.js roda na própria página da prévia: um HTML só não tem outro arquivo para ele. */
import * as worker from "pdfjs-dist/build/pdf.worker.min.mjs";

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
