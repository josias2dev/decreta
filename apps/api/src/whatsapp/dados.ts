/**
 * Os dados do escritório como a IA do WhatsApp os vê: os mesmos do Perguntar, com dois cortes feitos
 * aqui, antes de a IA ler, e não nas instruções:
 *
 * - segredo de justiça: o processo, as publicações e os documentos dele vêm sem o teor (os autos, o
 *   texto). A mensagem fica no celular, no backup e na notificação da tela bloqueada;
 * - CPF e telefone saem mascarados. Um WhatsApp tomado por golpe não vira lista de clientes com
 *   documento e celular, que é a matéria-prima do golpe do falso advogado.
 */
import { processos, withTenant, type Database } from "@decreta/db";
import type { DadosDoEscritorio, DocumentoNaIa, PublicacaoNaIa } from "@decreta/ia";
import { eq } from "drizzle-orm";

const CPF = /\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g;
const CELULAR = /(\(?\b\d{2}\)?\s?)(9\d{4})[-\s]?(\d{4})\b/g;
const FIXO = /(\(\d{2}\)\s?)(\d{4})[-\s]?(\d{4})\b/g;

/** "123.456.789-01" vira "***.***.***-01"; "(47) 99123-4567" vira "(47) 9****-4567". */
export function mascarar(texto: string): string {
  return texto
    .replace(CPF, (_m, _a, _b, _c, d: string) => `***.***.***-${d}`)
    .replace(CELULAR, (_m, ddd: string, meio: string, fim: string) => `${ddd}${meio[0]}****-${fim}`)
    .replace(FIXO, (_m, ddd: string, _meio: string, fim: string) => `${ddd}****-${fim}`);
}

/** Máscara em tudo o que é texto, a qualquer profundidade (listas, fichas, autos). */
export function mascararTudo<T>(v: T): T {
  if (typeof v === "string") return mascarar(v) as T;
  if (Array.isArray(v)) return v.map(mascararTudo) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mascararTudo(x)])) as T;
  return v;
}

const SEGREDO = "[processo em segredo de justiça: o teor não vai para o WhatsApp]";

export function dadosParaWhatsapp(d: DadosDoEscritorio, escopo: { db: Database; organizationId: string }): DadosDoEscritorio {
  let segredos: Promise<Set<string>> | null = null;
  /** Os processos em segredo do escritório, lidos uma vez por turno. */
  const emSegredo = () =>
    (segredos ??= withTenant(escopo.db, escopo.organizationId, async (tx) => new Set((await tx.select({ id: processos.id }).from(processos).where(eq(processos.segredo, true))).map((p) => p.id))));
  const publicacaoSemSegredo = async (p: PublicacaoNaIa): Promise<PublicacaoNaIa> => (p.processo && (await emSegredo()).has(p.processo.id) ? { ...p, teor: SEGREDO, resumo: null } : p);
  const documentoSemSegredo = async <T extends DocumentoNaIa & { texto?: string | null }>(doc: T): Promise<T> =>
    doc.processo && (await emSegredo()).has(doc.processo.id) ? { ...doc, trecho: null, ...("texto" in doc ? { texto: SEGREDO } : {}) } : doc;

  const m = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...a: A) => mascararTudo(await fn(...a));
  return {
    ...d,
    panorama: d.panorama,
    prazos: m(d.prazos),
    processos: m(d.processos),
    processo: m(async (id: string) => {
      const f = await d.processo(id);
      if (!f) return f;
      return f.processo.segredo ? { ...f, autos: SEGREDO } : f;
    }),
    publicacoes: m(async (f) => {
      const r = await d.publicacoes(f);
      return { ...r, itens: await Promise.all(r.itens.map(publicacaoSemSegredo)) };
    }),
    publicacao: m(async (id: string) => {
      const p = await d.publicacao(id);
      return p ? publicacaoSemSegredo(p) : p;
    }),
    audiencias: m(d.audiencias),
    agenda: m(d.agenda),
    clientes: m(d.clientes),
    cliente: m(d.cliente),
    documentos: m(async (f) => {
      const r = await d.documentos(f);
      return { ...r, itens: await Promise.all(r.itens.map(documentoSemSegredo)) };
    }),
    documento: m(async (id: string) => {
      const doc = await d.documento(id);
      return doc ? documentoSemSegredo(doc) : doc;
    }),
    alvaras: m(d.alvaras),
    negocios: m(d.negocios),
    equipe: m(d.equipe),
  };
}
