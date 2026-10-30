/**
 * A publicação colada à mão (veio por e-mail ou pelo sistema do tribunal): o
 * número do processo, a data de disponibilização e o tipo saem do próprio
 * texto. Só o que está escrito com todas as letras; o resto a pessoa escolhe.
 */
import { lerCnj } from "./cnj.ts";

export interface PublicacaoColada {
  /** Com máscara. O primeiro número do texto com o dígito verificador certo. */
  cnj: string | null;
  /** AAAA-MM-DD */
  disponibilizadaEm: string | null;
  tipoComunicacao: string | null;
}

export const TIPOS_DE_COMUNICACAO = ["Intimação", "Citação", "Notificação", "Edital", "Despacho", "Sentença", "Acórdão"];

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const tipoPeloNome = (nome: string) => TIPOS_DE_COMUNICACAO.find((t) => semAcento(t) === semAcento(nome)) ?? null;

function dia(valor: string): string | null {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  const [a, m, d] = br ? [br[3], br[2], br[1]] : (/^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)?.slice(1) ?? []);
  if (!a || !m || !d) return null;
  const data = new Date(`${a}-${m}-${d}T12:00:00Z`);
  return Number.isNaN(data.getTime()) || data.getUTCDate() !== Number(d) ? null : `${a}-${m}-${d}`;
}

export function lerPublicacaoColada(texto: string): PublicacaoColada {
  const numeros = texto.match(/\d{7}\s?-?\s?\d{2}\s?\.?\s?\d{4}\s?\.?\s?\d\s?\.?\s?\d{2}\s?\.?\s?\d{4}/g) ?? [];
  const cnj = numeros.map((n) => lerCnj(n)).find(Boolean)?.formatado ?? null;
  // "Data de disponibilização: 28/10/2026", "Disponibilizado no DJEN em 28/10/2026", "Data de divulgação 28/10/2026".
  const data = /(?:disponibiliza|divulga)\p{L}*[^\d\n]{0,40}(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/iu.exec(texto);
  const rotulado = /tipo\s+de\s+comunica\p{L}+\s*:?\s*(\p{L}+)/iu.exec(texto);
  // Sem rótulo, o título em maiúsculas no começo: "INTIMAÇÃO", "EDITAL DE CITAÇÃO".
  const titulo = /\b(INTIMAÇÃO|INTIMACAO|CITAÇÃO|CITACAO|NOTIFICAÇÃO|NOTIFICACAO|EDITAL)\b/.exec(texto.slice(0, 400));
  return {
    cnj,
    disponibilizadaEm: data ? dia(data[1]!) : null,
    tipoComunicacao: (rotulado && tipoPeloNome(rotulado[1]!)) ?? (titulo ? (/^EDITAL/.test(titulo[1]!) ? "Edital" : tipoPeloNome(titulo[1]!)) : null),
  };
}
