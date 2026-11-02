/**
 * Cada fato da peça aponta para o trecho. A IA diz de onde tirou cada afirmação;
 * quem confere é o código: o trecho existe no documento, a data e o valor batem
 * com a fonte, o evento e a folha existem, e o julgado veio do acervo ou dos autos.
 * O que não confere sai marcado [A COMPROVAR: ...] no texto, à vista no editor.
 */
import { extrairCitacoes } from "./citacoes.ts";
import { extrairFontes } from "./fontes.ts";
import { blocosComPosicao } from "./peca.ts";

export type TipoDaFonteDoFato = "documento" | "publicacao" | "andamento" | "instrucoes" | "cadastro" | "calculo" | "prazo";

/** Um pedaço do material que a peça pode usar, com a referência que a IA aponta ("D1"). */
export interface FonteDoFato {
  ref: string;
  tipo: TipoDaFonteDoFato;
  /** "Laudo pericial.docx · evento 87" */
  rotulo: string;
  texto: string;
  documentoId?: string | null;
  /** O nome do arquivo, para achar `(documento "x.pdf")`. */
  nome?: string | null;
  evento?: number | null;
  paginas?: number | null;
}

/** O que a IA devolve para cada afirmação de fato. */
export interface FatoListado {
  afirmacao: string;
  fonte: string | null;
  trecho: string | null;
  falta: string | null;
}

export type SituacaoDoFato = "conferido" | "com_aviso" | "a_comprovar";

export interface FatoDaPeca {
  /** A frase, como está no texto da peça. */
  afirmacao: string;
  situacao: SituacaoDoFato;
  fonte: { ref: string; tipo: TipoDaFonteDoFato; rotulo: string; documentoId: string | null; evento: number | null; folha: number | null } | null;
  /** O trecho que está na fonte; nulo quando não confere. */
  trecho: string | null;
  motivo: string | null;
}

export interface AvisoDaConferencia {
  tipo: "data" | "valor" | "fonte" | "julgado";
  trecho: string;
  mensagem: string;
}

export interface ResultadoDaConferencia {
  /** O texto com as marcas [A COMPROVAR: ...] nos pontos que não conferem. */
  texto: string;
  fatos: FatoDaPeca[];
  avisos: AvisoDaConferencia[];
  resumo: { conferidos: number; comAviso: number; aComprovar: number };
}

/* ------------------------------------------------------------------ */
/* Datas e valores                                                       */
/* ------------------------------------------------------------------ */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const POR_EXTENSO = new RegExp(String.raw`(?<![\d/.])(\d{1,2})[º°]?\s+de\s+(${MESES.join("|")})(?:\s+de\s+(\d{4}))?(?![\p{L}\d])`, "giu");
const NUMERICA = /(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\d/-]|\.\d)/g;
const CURTA = /(?<=(?<![\p{L}])(?:em|dia|de|até|desde|a)\s)(\d{1,2})\/(\d{1,2})(?![\d/])/giu;

export interface DataNoTexto {
  texto: string;
  inicio: number;
  dia: number;
  mes: number;
  ano: number | null;
}

export function datasDe(texto: string): DataNoTexto[] {
  const saida: DataNoTexto[] = [];
  const guardar = (m: RegExpMatchArray, dia: number, mes: number, ano: number | null) => {
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) saida.push({ texto: m[0], inicio: m.index!, dia, mes, ano });
  };
  for (const m of texto.matchAll(POR_EXTENSO)) guardar(m, Number(m[1]), MESES.indexOf(m[2]!.toLocaleLowerCase("pt-BR")) + 1, m[3] ? Number(m[3]) : null);
  for (const m of texto.matchAll(NUMERICA)) guardar(m, Number(m[1]), Number(m[2]), m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]));
  for (const m of texto.matchAll(CURTA)) guardar(m, Number(m[1]), Number(m[2]), null);
  return saida.sort((a, b) => a.inicio - b.inicio);
}

export interface ValorNoTexto {
  texto: string;
  inicio: number;
  /** O mesmo valor escrito de outro jeito tem a mesma chave: "R$ 800" e "R$ 800,00". */
  chave: string;
}

export function valoresDe(texto: string): ValorNoTexto[] {
  const saida: ValorNoTexto[] = [];
  // O banco escreve com ponto ("R$ 80000.50"); o texto, com vírgula. O mesmo valor tem a mesma chave.
  for (const m of texto.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2})(?!\d))?/g)) {
    const centavos = Number(m[1]!.replace(/\./g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
    saida.push({ texto: m[0], inicio: m.index!, chave: `r:${centavos}` });
  }
  for (const m of texto.matchAll(/(?<![\d.,])(\d+(?:,\d+)?)\s?%/g)) saida.push({ texto: m[0], inicio: m.index!, chave: `p:${Number(m[1]!.replace(",", "."))}` });
  return saida.sort((a, b) => a.inicio - b.inicio);
}

const bateData = (d: DataNoTexto, outras: readonly DataNoTexto[]) => outras.some((o) => o.dia === d.dia && o.mes === d.mes && (d.ano === null || o.ano === null || o.ano === d.ano));

/* ------------------------------------------------------------------ */
/* Achar um trecho no texto                                              */
/* ------------------------------------------------------------------ */

/** Menos que isso não prova nada: "o autor" está em todo documento. */
const TRECHO_MINIMO = 8;
const PONTAS = /^[\s"'“”‘’.,;:…]+|[\s"'“”‘’.,;:…]+$/g;

interface Normalizado {
  texto: string;
  /** A posição, no original, de cada letra do normalizado. */
  mapa: number[];
}

/**
 * Iguala o que não muda o sentido: caixa, acento, espaços, aspas curvas,
 * travessões, a palavra partida no fim da linha, o negrito e a marca da folha.
 */
function normalizar(t: string): Normalizado {
  const semFolhas = t.replace(/\[fl\. \d+\]/g, (m) => " ".repeat(m.length));
  let texto = "";
  const mapa: number[] = [];
  for (let i = 0; i < semFolhas.length; i++) {
    const c = semFolhas[i]!;
    if (c === "*") continue;
    if (c === "-" && /\p{L}/u.test(semFolhas[i - 1] ?? "")) {
      const partida = /^-[^\S\n]*\n\s*(?=\p{L})/u.exec(semFolhas.slice(i, i + 40));
      if (partida) {
        i += partida[0].length - 1;
        continue;
      }
    }
    if (/\s/.test(c)) {
      if (texto && !texto.endsWith(" ")) {
        texto += " ";
        mapa.push(i);
      }
      continue;
    }
    const igualado = c === "“" || c === "”" || c === "«" || c === "»" ? '"' : c === "‘" || c === "’" ? "'" : /[‐‑‒–—]/.test(c) ? "-" : c.normalize("NFD")[0]!.toLowerCase()[0]!;
    texto += igualado;
    mapa.push(i);
  }
  return { texto, mapa };
}

function acharNoNormalizado(n: Normalizado, trecho: string): { inicio: number; fim: number } | null {
  const t = normalizar(trecho).texto.replace(PONTAS, "");
  if (t.length < TRECHO_MINIMO) return null;
  const i = n.texto.indexOf(t);
  if (i < 0) return null;
  return { inicio: n.mapa[i]!, fim: n.mapa[i + t.length - 1]! + 1 };
}

function folhaEm(texto: string, posicao: number): number | null {
  const i = texto.lastIndexOf("[fl. ", posicao);
  const m = i < 0 ? null : /^\[fl\. (\d+)\]/.exec(texto.slice(i, i + 16));
  return m ? Number(m[1]) : null;
}

/** O trecho está no documento? Devolve a folha em que ele começa (nula sem as marcas de folha). */
export function localizarTrecho(documento: string, trecho: string): { folha: number | null } | null {
  const achado = acharNoNormalizado(normalizar(documento), trecho);
  return achado ? { folha: folhaEm(documento, achado.inicio) } : null;
}

/* ------------------------------------------------------------------ */
/* A conferência                                                         */
/* ------------------------------------------------------------------ */

/** O título da seção que narra os fatos: nela, toda frase precisa de fonte. */
const SECAO_DE_FATOS = /\b(?:fatos?|s[íi]ntese|relat[óo]rio|hist[óo]rico|contrato de trabalho)\b/iu;
/** "Dos fatos e do direito": mistura tese com fato, e a frase de tese não pede fonte. */
const SECAO_MISTA = /\b(?:direito|fundamentos?|m[ée]rito)\b/iu;
/** Frase curta na seção de fatos não afirma nada ("É o relato."). */
const FRASE_MINIMA = 40;
const MARCA_DE_REVISAO = /\[(?:COMPLETAR|A COMPROVAR|JURISPRUD[ÊE]NCIA)[^\]]*\]/g;
const LINHA_DO_FECHO = /^[^,\n]{2,60},\s*\d{1,2}[º°]?\s+de\s+\p{L}+\s+de\s+\d{4}\.?\s*$/gmu;
const FIM_DE_FRASE = /[.!?]+(?=\s+[\p{Lu}"“(\[]|\s*$)/gu;

/** O fim da frase em que a posição está, sem passar da linha: é onde a marca entra. */
function fimDaFrase(texto: string, posicao: number): number {
  const fimDaLinha = texto.indexOf("\n", posicao);
  const linha = texto.slice(posicao, fimDaLinha < 0 ? texto.length : fimDaLinha);
  // A afirmação pode ter terminado com o próprio ponto.
  if (/[.!?]$/.test(texto.slice(0, posicao)) && !/^\s*\(/.test(linha)) return posicao;
  const m = new RegExp(FIM_DE_FRASE.source, "u").exec(linha);
  return m ? posicao + m.index + m[0].length : posicao;
}

function frasesDe(texto: string, inicio: number): { texto: string; inicio: number; fim: number }[] {
  const saida: { texto: string; inicio: number; fim: number }[] = [];
  let de = 0;
  for (const m of texto.matchAll(FIM_DE_FRASE)) {
    const ate = m.index + m[0].length;
    saida.push({ texto: texto.slice(de, ate).trim(), inicio: inicio + de + (texto.slice(de, ate).length - texto.slice(de, ate).trimStart().length), fim: inicio + ate });
    de = ate;
  }
  if (texto.slice(de).trim()) saida.push({ texto: texto.slice(de).trim(), inicio: inicio + de + (texto.slice(de).length - texto.slice(de).trimStart().length), fim: inicio + texto.length });
  return saida;
}

export function conferirFatos(entrada: {
  texto: string;
  fontes: readonly FonteDoFato[];
  /** O que a IA ligou. Nulo sem a IA (cliente sem IA, escrita à mão): confere só datas, valores, referências e julgados. */
  listados: readonly FatoListado[] | null;
  /** Eventos que existem nos autos, mesmo sem documento lido. */
  eventos?: readonly number[];
  /** Chaves das citações que o acervo tem. */
  citacoesAceitas?: ReadonlySet<string>;
}): ResultadoDaConferencia {
  const { texto, fontes, listados } = entrada;
  const noTexto = normalizar(texto);
  const indice = new Map(fontes.map((f) => [f.ref, { fonte: f, normal: normalizar(f.texto), datas: datasDe(f.texto), valores: new Set(valoresDe(f.texto).map((v) => v.chave)) }]));
  const todasAsDatas = [...indice.values()].flatMap((i) => i.datas);
  const todosOsValores = new Set([...indice.values()].flatMap((i) => [...i.valores]));

  const fatos: (FatoDaPeca & { inicio: number; fim: number })[] = [];
  const marcas: { posicao: number; falta: string }[] = [];
  const marcar = (fim: number, falta: string) => marcas.push({ posicao: fimDaFrase(texto, fim), falta });
  const jaAvisados = new Set<string>();

  for (const l of listados ?? []) {
    const achada = acharNoNormalizado(noTexto, l.afirmacao);
    // A IA listou uma frase que não está na peça: não há o que ligar.
    if (!achada || fatos.some((f) => f.inicio === achada.inicio)) continue;
    // A pontuação final que a IA copiou faz parte da frase.
    const comPonto = /[.!?;:]$/.test(l.afirmacao.trim()) && /[.!?;:]/.test(texto[achada.fim] ?? "");
    const onde = { inicio: achada.inicio, fim: achada.fim + (comPonto ? 1 : 0) };
    const base = { afirmacao: texto.slice(onde.inicio, onde.fim), inicio: onde.inicio, fim: onde.fim };
    const i = l.fonte ? indice.get(l.fonte) : undefined;
    if (!i) {
      const motivo = l.fonte ? "A IA apontou uma fonte que não está nos autos." : "Sem fonte nos autos.";
      fatos.push({ ...base, situacao: "a_comprovar", fonte: null, trecho: null, motivo });
      marcar(onde.fim, l.falta?.trim() || "sem fonte nos autos");
      continue;
    }
    const f = i.fonte;
    const fonte = { ref: f.ref, tipo: f.tipo, rotulo: f.rotulo, documentoId: f.documentoId ?? null, evento: f.evento ?? null, folha: null as number | null };
    if (!l.trecho?.trim()) {
      fatos.push({ ...base, situacao: "a_comprovar", fonte, trecho: null, motivo: `A IA não copiou o trecho de ${f.rotulo}.` });
      marcar(onde.fim, l.falta?.trim() || "sem trecho da fonte");
      continue;
    }
    const achado = acharNoNormalizado(i.normal, l.trecho);
    if (!achado) {
      fatos.push({ ...base, situacao: "a_comprovar", fonte, trecho: null, motivo: `A IA citou um trecho que não está em ${f.rotulo}.` });
      marcar(onde.fim, "o trecho citado não está nos autos");
      continue;
    }
    const naFrase = texto.slice(onde.inicio, fimDaFrase(texto, onde.fim));
    const avisos = [
      ...datasDe(naFrase)
        .filter((d) => !bateData(d, i.datas))
        .map((d) => {
          jaAvisados.add(d.texto);
          return `A data ${d.texto} não está em ${f.rotulo}.`;
        }),
      ...valoresDe(naFrase)
        .filter((v) => !i.valores.has(v.chave))
        .map((v) => {
          jaAvisados.add(v.texto);
          return `O valor ${v.texto} não está em ${f.rotulo}.`;
        }),
    ];
    fatos.push({ ...base, situacao: avisos.length ? "com_aviso" : "conferido", fonte: { ...fonte, folha: folhaEm(f.texto, achado.inicio) }, trecho: l.trecho.trim(), motivo: avisos.length ? avisos.join(" ") : null });
  }

  // Cobertura: a IA pode ter deixado de listar uma frase da narrativa. Sem ligação, ela não passa calada.
  if (listados) {
    let naSecaoDeFatos = false;
    for (const b of blocosComPosicao(texto)) {
      if (b.tipo === "secao" || b.tipo === "subtitulo") {
        if (b.tipo === "secao") naSecaoDeFatos = SECAO_DE_FATOS.test(b.texto) && !SECAO_MISTA.test(b.texto);
        continue;
      }
      if (!naSecaoDeFatos || b.tipo === "enderecamento") continue;
      for (const frase of frasesDe(texto.slice(b.inicio, b.fim), b.inicio)) {
        if (frase.texto.length < FRASE_MINIMA || frase.texto.search(MARCA_DE_REVISAO) >= 0 || extrairCitacoes(frase.texto).length) continue;
        if (fatos.some((f) => f.inicio < frase.fim && f.fim > frase.inicio)) continue;
        fatos.push({ afirmacao: frase.texto, situacao: "a_comprovar", fonte: null, trecho: null, motivo: "A IA não ligou esta frase a nenhuma fonte.", inicio: frase.inicio, fim: frase.fim });
        marcar(frase.fim, "sem fonte nos autos");
      }
    }
  }

  // Datas e valores da peça inteira: o que não está em nenhuma fonte. Não entra o que está numa marca nem a linha do fecho.
  const fora = [...[...texto.matchAll(MARCA_DE_REVISAO)], ...[...texto.matchAll(LINHA_DO_FECHO)]].map((m) => [m.index!, m.index! + m[0].length] as const);
  const contar = (inicio: number) => !fora.some(([de, ate]) => inicio >= de && inicio < ate);
  const naPeca: (AvisoDaConferencia & { inicio: number })[] = [
    ...datasDe(texto)
      .filter((d) => contar(d.inicio) && !bateData(d, todasAsDatas) && !jaAvisados.has(d.texto))
      .map((d) => ({ tipo: "data" as const, trecho: d.texto, mensagem: `A data ${d.texto} não aparece nos autos.`, inicio: d.inicio })),
    ...valoresDe(texto)
      .filter((v) => contar(v.inicio) && !todosOsValores.has(v.chave) && !jaAvisados.has(v.texto))
      .map((v) => ({ tipo: "valor" as const, trecho: v.texto, mensagem: `O valor ${v.texto} não aparece nos autos.`, inicio: v.inicio })),
  ];

  // As referências aos autos: o evento e a folha existem?
  const eventos = new Set([...(entrada.eventos ?? []), ...fontes.map((f) => f.evento).filter((e): e is number => e != null)]);
  for (const r of extrairFontes(texto)) {
    if (r.evento != null && !eventos.has(r.evento)) {
      naPeca.push({ tipo: "fonte", trecho: r.trecho, mensagem: `O evento ${r.evento} não está nos autos.`, inicio: r.inicio });
    } else if (r.evento != null && r.folha != null) {
      const paginas = fontes.filter((f) => f.evento === r.evento && f.paginas != null).map((f) => f.paginas!);
      const maior = paginas.length ? Math.max(...paginas) : null;
      if (maior != null && r.folha > maior) naPeca.push({ tipo: "fonte", trecho: r.trecho, mensagem: `A folha ${r.folha} do evento ${r.evento} não existe: o documento tem ${maior} folhas.`, inicio: r.inicio });
    } else if (r.documento && !fontes.some((f) => f.nome?.toLocaleLowerCase("pt-BR") === r.documento!.toLocaleLowerCase("pt-BR"))) {
      naPeca.push({ tipo: "fonte", trecho: r.trecho, mensagem: `O documento "${r.documento}" não está nos autos.`, inicio: r.inicio });
    }
  }

  // A regra de ouro: julgado na peça vem do acervo ou está nos autos. Artigo de lei tem o "Verificar citações".
  const dosAutos = new Set(fontes.flatMap((f) => extrairCitacoes(f.texto).map((c) => c.chave)));
  for (const c of extrairCitacoes(texto)) {
    if (c.tipo === "dispositivo" || dosAutos.has(c.chave) || entrada.citacoesAceitas?.has(c.chave)) continue;
    naPeca.push({ tipo: "julgado", trecho: c.trecho, mensagem: `${c.trecho} não veio do acervo nem dos autos. Busque no acervo ou apague.`, inicio: c.inicio });
    marcas.push({ posicao: c.inicio + c.trecho.length, falta: "julgado fora do acervo" });
  }

  // Do fim para o começo: uma marca não muda a posição das anteriores.
  let comMarcas = texto;
  const unicas = [...new Map(marcas.map((m) => [m.posicao, m])).values()].sort((a, b) => b.posicao - a.posicao);
  for (const m of unicas) {
    if (/^\s*\[A COMPROVAR/.test(comMarcas.slice(m.posicao))) continue;
    comMarcas = `${comMarcas.slice(0, m.posicao)} [A COMPROVAR: ${m.falta}]${comMarcas.slice(m.posicao)}`;
  }

  const ordenados = fatos.sort((a, b) => a.inicio - b.inicio);
  return {
    texto: comMarcas,
    fatos: ordenados.map(({ inicio: _i, fim: _f, ...f }) => f),
    avisos: naPeca.sort((a, b) => a.inicio - b.inicio).map(({ inicio: _i, ...a }) => a),
    resumo: {
      conferidos: ordenados.filter((f) => f.situacao === "conferido").length,
      comAviso: ordenados.filter((f) => f.situacao === "com_aviso").length,
      aComprovar: ordenados.filter((f) => f.situacao === "a_comprovar").length,
    },
  };
}
