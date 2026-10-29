/**
 * O que a IA lê sobre um processo, montado como texto com seções fixas. Os
 * documentos entram por último e são os primeiros a serem cortados quando o
 * texto passa do teto: dados, partes e andamentos valem mais por caractere.
 */
import { createHash } from "node:crypto";

export interface ProcessoParaIa {
  cnj: string | null;
  titulo: string;
  tribunal: string | null;
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  comarca: string | null;
  valorCausa: string | null;
  /** De que lado o cliente do escritório está. */
  poloCliente: "ativo" | "passivo" | "terceiro";
  cliente: string | null;
}

export interface ParteParaIa {
  nome: string;
  polo: string;
  papel: string | null;
  cliente: boolean;
}

export interface MovimentacaoParaIa {
  em: string;
  evento: number | null;
  titulo: string;
  descricao: string | null;
}

export interface PublicacaoParaIa {
  disponibilizadaEm: string;
  publicadaEm: string;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  orgao: string | null;
  texto: string;
}

export interface DocumentoParaIa {
  nome: string;
  evento: number | null;
  texto: string;
}

export interface PrazoParaIa {
  tipo: string;
  fim: string;
  situacao: string;
}

export interface ContextoDoProcesso {
  processo: ProcessoParaIa;
  partes: ParteParaIa[];
  movimentacoes: MovimentacaoParaIa[];
  publicacoes?: PublicacaoParaIa[];
  prazos?: PrazoParaIa[];
  documentos?: DocumentoParaIa[];
}

/** ~30 mil tokens: cabe com folga nos modelos de contexto longo e não estoura o teto diário. */
export const TETO_DO_CONTEXTO = 120_000;

const dm = (iso: string) => {
  const d = iso.slice(0, 10).split("-");
  return `${d[2]}/${d[1]}/${d[0]}`;
};

export function textoDoProcesso(ctx: ContextoDoProcesso, teto = TETO_DO_CONTEXTO): string {
  const p = ctx.processo;
  const lado = p.poloCliente === "ativo" ? "polo ativo (autor)" : p.poloCliente === "passivo" ? "polo passivo (réu)" : "terceiro";
  const linhas = [
    "## Processo",
    `Número: ${p.cnj ?? "extrajudicial, sem número"}`,
    `Partes: ${p.titulo}`,
    p.classe && `Classe: ${p.classe}`,
    p.assunto && `Assunto: ${p.assunto}`,
    (p.orgao || p.comarca || p.tribunal) && `Juízo: ${[p.orgao, p.comarca, p.tribunal].filter(Boolean).join(", ")}`,
    p.valorCausa && `Valor da causa: R$ ${p.valorCausa}`,
    `Nosso cliente: ${p.cliente ?? "não informado"}, no ${lado}`,
  ].filter(Boolean) as string[];

  if (ctx.partes.length) {
    linhas.push("", "## Partes");
    for (const pt of ctx.partes) linhas.push(`- ${pt.nome} (${pt.papel ?? pt.polo}${pt.cliente ? ", nosso cliente" : ""})`);
  }

  if (ctx.prazos?.length) {
    linhas.push("", "## Prazos em aberto");
    for (const pr of ctx.prazos.filter((x) => x.situacao === "aberto")) linhas.push(`- ${pr.tipo}: vence em ${dm(pr.fim)}`);
  }

  if (ctx.movimentacoes.length) {
    linhas.push("", "## Movimentações (mais recentes primeiro)");
    const ordenadas = [...ctx.movimentacoes].sort((a, b) => b.em.localeCompare(a.em));
    for (const m of ordenadas.slice(0, 80)) {
      const ev = m.evento != null ? `evento ${m.evento}, ` : "";
      linhas.push(`- ${dm(m.em)} (${ev}${m.titulo})${m.descricao ? `: ${m.descricao}` : ""}`);
    }
  }

  if (ctx.publicacoes?.length) {
    linhas.push("", "## Publicações (DJEN)");
    for (const pub of ctx.publicacoes.slice(0, 10)) {
      linhas.push(`### ${pub.tipoComunicacao ?? "Comunicação"} disponibilizada em ${dm(pub.disponibilizadaEm)}, publicada em ${dm(pub.publicadaEm)}`, pub.texto.trim());
    }
  }

  let texto = linhas.join("\n");
  const corte = "\n[documento cortado aqui]";
  for (const doc of ctx.documentos ?? []) {
    const cab = `\n\n## Documento: ${doc.nome}${doc.evento != null ? ` (evento ${doc.evento})` : ""}\n`;
    const sobra = teto - texto.length - cab.length - corte.length;
    if (sobra < 500) break;
    texto += cab + (doc.texto.length > sobra ? doc.texto.slice(0, sobra) + corte : doc.texto);
  }
  return texto.length > teto ? texto.slice(0, teto) : texto;
}

/** Impressão digital do que a IA leu: mudou, a análise guardada está desatualizada. */
export function impressao(...partes: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex").slice(0, 32);
}

/** "Autos · eventos 85 a 89" */
export function fonteDosAutos(movimentacoes: MovimentacaoParaIa[]): string {
  const eventos = movimentacoes.map((m) => m.evento).filter((e): e is number => e != null);
  if (!eventos.length) return movimentacoes.length ? `Autos · ${movimentacoes.length} andamentos` : "Dados do processo";
  const min = Math.min(...eventos);
  const max = Math.max(...eventos);
  return min === max ? `Autos · evento ${max}` : `Autos · eventos ${min} a ${max}`;
}
