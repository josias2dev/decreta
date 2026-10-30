/**
 * Ícone do arquivo pelo tipo: uma folha com a dobra e um selo colorido com a
 * extensão (PDF, DOC, XLS, JPG, MP3…), nas cores que todo mundo associa.
 * O tipo sai da extensão do nome e, sem ela, do mime. `pequeno` é o das
 * linhas de uma linha só: a folha com a faixa da cor, sem o texto.
 */
import { cn } from "@/lib/util";

type Tipo = "pdf" | "doc" | "planilha" | "imagem" | "audio" | "texto" | "outro";

const POR_EXTENSAO: Record<string, Tipo> = {
  pdf: "pdf",
  doc: "doc",
  docx: "doc",
  odt: "doc",
  rtf: "doc",
  xls: "planilha",
  xlsx: "planilha",
  ods: "planilha",
  csv: "planilha",
  png: "imagem",
  jpg: "imagem",
  jpeg: "imagem",
  webp: "imagem",
  gif: "imagem",
  heic: "imagem",
  mp3: "audio",
  ogg: "audio",
  oga: "audio",
  opus: "audio",
  m4a: "audio",
  wav: "audio",
  webm: "audio",
  txt: "texto",
};

const ROTULO: Partial<Record<string, string>> = { docx: "DOC", odt: "DOC", rtf: "DOC", xlsx: "XLS", ods: "XLS", jpeg: "JPG", oga: "OGG" };

function doMime(mime: string | undefined): { tipo: Tipo; rotulo: string } | null {
  if (!mime) return null;
  if (mime === "application/pdf") return { tipo: "pdf", rotulo: "PDF" };
  if (mime.includes("wordprocessingml") || mime === "application/msword") return { tipo: "doc", rotulo: "DOC" };
  if (mime.includes("spreadsheetml")) return { tipo: "planilha", rotulo: "XLS" };
  if (mime.startsWith("image/")) return { tipo: "imagem", rotulo: mime.slice(6).replace("jpeg", "jpg").toUpperCase().slice(0, 4) };
  if (mime.startsWith("audio/")) return { tipo: "audio", rotulo: ({ "audio/mpeg": "MP3", "audio/mp4": "M4A", "audio/ogg": "OGG", "audio/webm": "WEBM" } as Record<string, string>)[mime] ?? "AUD" };
  if (mime === "text/plain") return { tipo: "texto", rotulo: "TXT" };
  return null;
}

export function tipoDoArquivo(nome: string, mime?: string): { tipo: Tipo; rotulo: string } {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(nome.trim())?.[1]?.toLowerCase();
  const tipo = ext ? POR_EXTENSAO[ext] : undefined;
  if (ext && tipo) return { tipo, rotulo: ROTULO[ext] ?? ext.toUpperCase() };
  return doMime(mime) ?? { tipo: "outro", rotulo: ext ? ext.toUpperCase().slice(0, 4) : "ARQ" };
}

export function IconeDoArquivo({ nome, mime, pequeno, className }: { nome: string; mime?: string; pequeno?: boolean; className?: string }) {
  const { tipo, rotulo } = tipoDoArquivo(nome, mime);
  return (
    <svg className={cn("dc-arquivo", `dc-arquivo--${tipo}`, pequeno && "dc-arquivo--pequeno", className)} viewBox="0 0 24 28" aria-hidden>
      <path className="dc-arquivo__folha" d="M5.5 1.5h10l5.5 5.5v17.5a2 2 0 0 1-2 2h-13.5a2 2 0 0 1-2-2v-21a2 2 0 0 1 2-2z" />
      <path className="dc-arquivo__dobra" d="M15.5 1.5v4a1.5 1.5 0 0 0 1.5 1.5h4" />
      {pequeno ? (
        <rect className="dc-arquivo__selo" x="3.5" y="15" width="17.5" height="5" rx="1" />
      ) : (
        <>
          <rect className="dc-arquivo__selo" x="0.5" y="13" width={rotulo.length > 3 ? 21 : 17} height="9" rx="2" />
          <text className="dc-arquivo__rotulo" x={rotulo.length > 3 ? 11 : 9} y="19.7" textAnchor="middle">
            {rotulo}
          </text>
        </>
      )}
    </svg>
  );
}
