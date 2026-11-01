/**
 * Temas repetitivos do STJ, pelo Portal de Dados Abertos (CKAN, licença CC BY):
 * o conjunto "precedentes-qualificados" traz o Temas.csv, trocado no mesmo
 * endereço a cada atualização. O arquivo tem uma linha por tema de repercussão
 * geral do STF ligado ao tema; aqui cada tema vira um só, com a lista do STF.
 */

export const STJ_DADOS_ABERTOS = "https://dadosabertos.web.stj.jus.br";

export interface TemaDoStj {
  numero: number;
  /** Como o STJ escreve: "Trânsito em Julgado", "Afetado", "Cancelado", "Revisado"… */
  situacao: string;
  questao: string | null;
  tese: string | null;
  /** "S1", "S2", "CE"… */
  orgao: string | null;
  /** AAAA-MM-DD */
  julgadoEm: string | null;
  publicadoEm: string | null;
  /** Temas de repercussão geral do STF ligados a este. */
  temasDoStf: number[];
  /** A página do tema no site do STJ. */
  url: string;
}

export class ErroStj extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroStj";
  }
}

export interface OpcoesStj {
  fetch?: typeof fetch;
  timeout?: number;
}

/** CSV com vírgula, aspas ("" é aspa) e quebra de linha dentro da célula. */
function linhasDoCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (entreAspas) {
      if (c !== '"') campo += c;
      else if (texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else entreAspas = false;
    } else if (c === '"') entreAspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo.replace(/\r$/, ""));
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length) linhas.push([...linha, campo.replace(/\r$/, "")]);
  return linhas;
}

const COLUNAS = ["tipoPrecedente", "numeroPrecedente", "situacao", "questaoSubmetidaAJulgamento", "teseFirmada", "orgaoJulgador", "dataJulgamento", "dataPublicacaoAcordao", "numeroRepercussaoGeralSTF"] as const;

const urlDoTema = (n: number) => `https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T&cod_tema_inicial=${n}&cod_tema_final=${n}`;

export function lerTemasDoStj(csv: string): TemaDoStj[] {
  const [cabecalho, ...linhas] = linhasDoCsv(csv.replace(/^﻿/, ""));
  const faltam = COLUNAS.filter((c) => !cabecalho?.includes(c));
  if (faltam.length) throw new ErroStj(`O Temas.csv do STJ mudou de formato: faltam as colunas ${faltam.join(", ")}`);
  const col = Object.fromEntries(COLUNAS.map((c) => [c, cabecalho!.indexOf(c)])) as Record<(typeof COLUNAS)[number], number>;
  const valor = (l: string[], c: (typeof COLUNAS)[number]) => l[col[c]]?.trim() || null;

  const temas = new Map<number, TemaDoStj>();
  for (const l of linhas) {
    if (valor(l, "tipoPrecedente") !== "Tema") continue;
    const numero = Number(valor(l, "numeroPrecedente"));
    if (!Number.isInteger(numero) || numero <= 0) continue;
    const doStf = Number(valor(l, "numeroRepercussaoGeralSTF"));
    const ja = temas.get(numero);
    if (ja) {
      if (doStf && !ja.temasDoStf.includes(doStf)) ja.temasDoStf.push(doStf);
      continue;
    }
    temas.set(numero, {
      numero,
      situacao: valor(l, "situacao") ?? "",
      questao: valor(l, "questaoSubmetidaAJulgamento"),
      tese: valor(l, "teseFirmada"),
      orgao: valor(l, "orgaoJulgador"),
      julgadoEm: valor(l, "dataJulgamento"),
      publicadoEm: valor(l, "dataPublicacaoAcordao"),
      temasDoStf: doStf ? [doStf] : [],
      url: urlDoTema(numero),
    });
  }
  return [...temas.values()];
}

interface Recurso {
  name?: string;
  url?: string;
  last_modified?: string | null;
}

/** Acha o Temas.csv pelo catálogo do portal (o endereço do arquivo pode mudar) e lê. */
export async function baixarTemasDoStj(opcoes: OpcoesStj = {}): Promise<{ temas: TemaDoStj[]; atualizadoEm: string | null }> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const pedir = async (url: string) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(opcoes.timeout ?? 60_000) });
    if (!res.ok) throw new ErroStj(`O portal de dados abertos do STJ respondeu HTTP ${res.status}`, res.status);
    return res;
  };
  const pacote = (await (await pedir(`${STJ_DADOS_ABERTOS}/api/3/action/package_show?id=precedentes-qualificados`)).json().catch(() => null)) as {
    result?: { resources?: Recurso[] };
  } | null;
  const recurso = pacote?.result?.resources?.find((r) => r.name?.toLowerCase() === "temas.csv" && r.url);
  if (!recurso) throw new ErroStj("O catálogo do STJ não tem mais o Temas.csv");
  const temas = lerTemasDoStj(await (await pedir(recurso.url!)).text());
  return { temas, atualizadoEm: recurso.last_modified ?? null };
}
