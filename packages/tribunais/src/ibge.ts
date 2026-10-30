/**
 * A comarca do processo. O DataJud manda o código IBGE da cidade do órgão
 * julgador; o nome vem da API de localidades do IBGE (servicodados.ibge.gov.br),
 * guardado em memória porque cidade não muda de nome. Sem resposta do IBGE,
 * vale o que o próprio nome do órgão diz ("... da Comarca de Joinville").
 */
import { nomeProprio } from "@decreta/core";
import { z } from "zod";

export const IBGE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

const municipioSchema = z.object({ nome: z.string() }).loose();

const nomes = new Map<number, string>();

/** O nome da cidade pelo código IBGE, ou `null` se o IBGE não responder. */
export async function nomeDoMunicipio(codigo: number, opcoes: { fetch?: typeof fetch } = {}): Promise<string | null> {
  const guardado = nomes.get(codigo);
  if (guardado) return guardado;
  try {
    const res = await (opcoes.fetch ?? fetch)(`${IBGE_URL}/${codigo}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const r = municipioSchema.safeParse(await res.json().catch(() => null));
    if (!r.success) return null;
    nomes.set(codigo, r.data.nome);
    return r.data.nome;
  } catch {
    return null;
  }
}

/**
 * A cidade escrita no nome do órgão: "2ª Vara Cível da Comarca de Joinville",
 * "Foro Regional de Santo Amaro", "1ª Vara do Trabalho de Blumenau",
 * "Subseção Judiciária de Itajaí". Só esses jeitos: "Vara da Fazenda Pública"
 * não é cidade.
 */
export function comarcaDoOrgao(orgao: string | null | undefined): string | null {
  if (!orgao) return null;
  const m =
    /\b(?:comarca|foro(?: regional)?|subse[çc][ãa]o judici[áa]ria|circunscri[çc][ãa]o judici[áa]ria) d[aeo]s? (.+?)\s*$/i.exec(orgao) ??
    /\bvara do trabalho d[aeo]s? (.+?)\s*$/i.exec(orgao) ??
    /^(.+?)\s+-\s+\d+ª\s+vara\b/i.exec(orgao);
  const cidade = m?.[1]?.replace(/\s*[-–(].*$/, "").trim();
  return cidade ? nomeProprio(cidade) : null;
}

/** O órgão sem a cidade, quando a comarca vai ao lado: "2ª Vara Cível da Comarca de Joinville" → "2ª Vara Cível". */
export function orgaoSemComarca(orgao: string | null | undefined): string | null {
  if (!orgao) return null;
  const curto = orgao
    .replace(/\s+d[aeo]s? comarca d[aeo]s? .+$/i, "")
    .replace(/^.+?\s+-\s+(?=\d+ª\s+vara\b)/i, "")
    .trim();
  return curto || orgao;
}
