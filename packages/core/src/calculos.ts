/**
 * Atualização monetária de parcelas, por mês cheio: a parcela que venceu em
 * janeiro e é calculada em janeiro do ano seguinte leva os índices de janeiro
 * a dezembro (do mês do vencimento ao mês anterior ao do cálculo), como nas
 * tabelas dos tribunais. Os juros são simples e incidem sobre o valor
 * corrigido. Os índices chegam prontos (SGS do Banco Central, em
 * @decreta/tribunais): aqui só há conta.
 */

/** "AAAA-MM" */
export type Mes = string;
/** Variação ou taxa do mês, em %. */
export interface ValorDoMes {
  mes: Mes;
  valor: number;
}
export type Serie = ValorDoMes[];

export type Indice = "ipca" | "inpc" | "ipcae" | "selic" | "tr";
export type Indices = Partial<Record<Indice | "taxaLegal", Serie>>;

export type Regime =
  /** Débito civil: IPCA (art. 389, p. único, do CC) e juros pela Taxa Legal (art. 406). */
  | { tipo: "civil" }
  /**
   * Fazenda Pública: SELIC uma vez só, pela EC 113/2021 (antes de 12/2021,
   * IPCA-E). Com a data de expedição do requisitório, daí em diante IPCA mais
   * 2% ao ano, limitado à SELIC do período (EC 136/2025).
   */
  | { tipo: "fazenda"; expedicao?: string }
  /** Índice e juros do contrato ou do título. */
  | { tipo: "contratual"; indice: Indice | "nenhum"; jurosAoMes: number };

export interface Parcela {
  descricao: string;
  valor: number;
  /** AAAA-MM-DD */
  vencimento: string;
}

export interface PedidoDeAtualizacao {
  parcelas: Parcela[];
  /** AAAA-MM-DD */
  dataDoCalculo: string;
  /** Início dos juros (citação, evento danoso); sem ele, o vencimento de cada parcela. */
  jurosDesde?: string;
  regime: Regime;
}

export interface LinhaDaAtualizacao {
  descricao: string;
  vencimento: string;
  valor: number;
  fator: number;
  corrigido: number;
  /** Soma das taxas de juros do período, em %. */
  jurosPercentual: number;
  juros: number;
  total: number;
  /** Como a linha foi atualizada, em palavras, para a memória de cálculo. */
  criterio: string;
}

export interface ResultadoDaAtualizacao {
  linhas: LinhaDaAtualizacao[];
  total: { valor: number; corrigido: number; juros: number; total: number };
  ressalvas: string[];
}

export class ErroDeCalculo extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroDeCalculo";
  }
}

export const centavos = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

const mesDe = (dia: string): Mes => dia.slice(0, 7);

/** Os meses de `de` (inclusive) até `ate` (exclusive). */
export function mesesEntre(de: Mes, ate: Mes): Mes[] {
  const saida: Mes[] = [];
  let [a, m] = de.split("-").map(Number) as [number, number];
  const fim = ate;
  for (;;) {
    const atual = `${a}-${String(m).padStart(2, "0")}`;
    if (atual >= fim) return saida;
    saida.push(atual);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
}

function valoresDosMeses(serie: Serie | undefined, meses: Mes[], nome: string): number[] {
  const porMes = new Map((serie ?? []).map((v) => [v.mes, v.valor]));
  const faltam = meses.filter((m) => !porMes.has(m));
  if (faltam.length) throw new ErroDeCalculo(`Faltam valores de ${nome} para ${faltam.map(mesEmTexto).join(", ")}.`);
  return meses.map((m) => porMes.get(m)!);
}

/** "2026-03" → "03/2026" */
export const mesEmTexto = (mes: Mes) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

const NOMES: Record<Indice | "taxaLegal", string> = { ipca: "IPCA", inpc: "INPC", ipcae: "IPCA-E", selic: "SELIC", tr: "TR", taxaLegal: "Taxa Legal" };

/** Fator composto das variações: Π(1 + v/100). */
function fatorComposto(valores: number[]): number {
  return valores.reduce((f, v) => f * (1 + v / 100), 1);
}

/** A Taxa Legal (art. 406 do CC, Lei 14.905/2024) vale desde 30/08/2024: o primeiro mês cheio é setembro. */
export const TAXA_LEGAL_DESDE: Mes = "2024-09";

export function atualizar(pedido: PedidoDeAtualizacao, indices: Indices): ResultadoDaAtualizacao {
  const fimDoCalculo = mesDe(pedido.dataDoCalculo);
  const { regime } = pedido;
  const ressalvas = new Set<string>();
  const linhas = pedido.parcelas.map((p): LinhaDaAtualizacao => {
    const meses = mesesEntre(mesDe(p.vencimento), fimDoCalculo);
    const mesesDeJuros = mesesEntre(mesDe(pedido.jurosDesde ?? p.vencimento), fimDoCalculo);
    const linha = (fator: number, jurosPercentual: number, criterio: string): LinhaDaAtualizacao => {
      const corrigido = centavos(p.valor * fator);
      const juros = centavos((corrigido * jurosPercentual) / 100);
      return { descricao: p.descricao, vencimento: p.vencimento, valor: p.valor, fator, corrigido, jurosPercentual, juros, total: centavos(corrigido + juros), criterio };
    };
    switch (regime.tipo) {
      case "civil": {
        const fator = fatorComposto(valoresDosMeses(indices.ipca, meses, NOMES.ipca));
        const antes = mesesDeJuros.filter((m) => m < TAXA_LEGAL_DESDE);
        const depois = mesesDeJuros.filter((m) => m >= TAXA_LEGAL_DESDE);
        if (antes.length)
          ressalvas.add(`Juros de ${periodo(antes)} não calculados: antes de 30/08/2024 (Lei 14.905/2024), a taxa depende do título. Para esse período, use o regime de índice contratual.`);
        // Art. 406, § 3º: taxa legal negativa vale zero.
        const taxas = valoresDosMeses(indices.taxaLegal, depois, NOMES.taxaLegal).map((t) => Math.max(0, t));
        return linha(fator, somaExata(taxas), `IPCA de ${periodo(meses)}; juros pela Taxa Legal de ${periodo(depois)}, negativa contada como zero`);
      }
      case "fazenda":
        return linhaDaFazenda(p, meses, indices, regime.expedicao ? mesDe(regime.expedicao) : null, ressalvas);
      case "contratual": {
        const fator = regime.indice === "nenhum" ? 1 : fatorComposto(valoresDosMeses(indices[regime.indice], meses, NOMES[regime.indice]));
        const correcao = regime.indice === "nenhum" ? "sem correção" : `${NOMES[regime.indice]} de ${periodo(meses)}`;
        return linha(fator, somaExata([regime.jurosAoMes * mesesDeJuros.length]), `${correcao}; juros simples de ${numeroBr(regime.jurosAoMes)}% ao mês de ${periodo(mesesDeJuros)}`);
      }
    }
  });
  return { linhas, total: somar(linhas), ressalvas: [...ressalvas] };
}

/** A EC 113/2021 vale desde 09/12/2021: a SELIC começa em dezembro. */
export const EC_113_DESDE: Mes = "2021-12";

function linhaDaFazenda(p: Parcela, meses: Mes[], indices: Indices, expedicao: Mes | null, ressalvas: Set<string>): LinhaDaAtualizacao {
  const antesDaEc = meses.filter((m) => m < EC_113_DESDE);
  const ateExpedicao = meses.filter((m) => m >= EC_113_DESDE && (!expedicao || m < expedicao));
  const requisitorio = expedicao ? meses.filter((m) => m >= expedicao) : [];
  const partes: string[] = [];

  let valor = p.valor;
  if (antesDaEc.length) {
    ressalvas.add(`De ${periodo(antesDaEc)}, antes da EC 113/2021, o valor foi corrigido pelo IPCA-E (Tema 810 do STF); os juros da poupança desse período não estão no cálculo.`);
    valor *= fatorComposto(valoresDosMeses(indices.ipcae, antesDaEc, NOMES.ipcae));
    partes.push(`IPCA-E de ${periodo(antesDaEc)}`);
  }
  if (ateExpedicao.length) {
    const selic = somaExata(valoresDosMeses(indices.selic, ateExpedicao, NOMES.selic));
    valor *= 1 + selic / 100;
    partes.push(`SELIC simples de ${periodo(ateExpedicao)} (${numeroBr(selic)}%, EC 113/2021)`);
  }
  if (requisitorio.length) {
    const pelaSelic = valor * (1 + somaExata(valoresDosMeses(indices.selic, requisitorio, NOMES.selic)) / 100);
    const peloIpca = valor * fatorComposto(valoresDosMeses(indices.ipca, requisitorio, NOMES.ipca)) * (1 + (2 / 12 / 100) * requisitorio.length);
    const ipcaMenor = centavos(peloIpca) <= centavos(pelaSelic);
    valor = ipcaMenor ? peloIpca : pelaSelic;
    partes.push(ipcaMenor ? `IPCA + 2% a.a. de ${periodo(requisitorio)} (EC 136/2025)` : `IPCA + 2% a.a. limitado à SELIC de ${periodo(requisitorio)} (EC 136/2025): vale a SELIC, que ficou abaixo`);
  }
  const total = centavos(valor);
  return { descricao: p.descricao, vencimento: p.vencimento, valor: p.valor, fator: valor / p.valor, corrigido: total, jurosPercentual: 0, juros: 0, total, criterio: partes.join("; ") || "sem atualização" };
}

/** Meses em que duas fontes do mesmo índice não batem (o SGS contra o SIDRA), ou em que uma delas não tem o valor. */
export function divergencias(a: Serie, b: Serie): { mes: Mes; a: number; b: number | null }[] {
  const deB = new Map(b.map((v) => [v.mes, v.valor]));
  return a.filter((v) => deB.get(v.mes) !== v.valor).map((v) => ({ mes: v.mes, a: v.valor, b: deB.get(v.mes) ?? null }));
}

/** O mês anterior: o último índice que o cálculo usa. */
function mesAnterior(mes: Mes): Mes {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** As séries que o cálculo vai ler e de que mês a que mês, para buscar só o necessário. */
export function indicesNecessarios(pedido: PedidoDeAtualizacao): { indices: Array<Indice | "taxaLegal">; de: Mes; ate: Mes } {
  const inicios = [...pedido.parcelas.map((p) => mesDe(p.vencimento)), ...(pedido.jurosDesde ? [mesDe(pedido.jurosDesde)] : [])].sort();
  const de = inicios[0] ?? mesDe(pedido.dataDoCalculo);
  const ate = mesAnterior(mesDe(pedido.dataDoCalculo));
  const { regime } = pedido;
  const indices: Array<Indice | "taxaLegal"> =
    regime.tipo === "civil"
      ? ["ipca", "taxaLegal"]
      : regime.tipo === "fazenda"
        ? [...(de < EC_113_DESDE ? (["ipcae"] as const) : []), "selic", ...(regime.expedicao ? (["ipca"] as const) : [])]
        : regime.indice === "nenhum"
          ? []
          : [regime.indice];
  return { indices, de, ate };
}

const reais = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const diaBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

function regimeEmTexto(regime: Regime): string {
  switch (regime.tipo) {
    case "civil":
      return "Débito civil: correção pelo IPCA (art. 389, parágrafo único, do Código Civil) e juros pela Taxa Legal (art. 406 do Código Civil, Lei 14.905/2024), com a taxa negativa contada como zero.";
    case "fazenda":
      return `Fazenda Pública: SELIC uma única vez, somada mês a mês, que já inclui correção e juros (art. 3º da EC 113/2021)${regime.expedicao ? `; a partir da expedição do requisitório em ${diaBr(regime.expedicao)}, IPCA mais juros simples de 2% ao ano, limitado à SELIC do período (EC 136/2025)` : ""}.`;
    case "contratual":
      return `Índice do contrato ou do título: ${regime.indice === "nenhum" ? "sem correção" : NOMES[regime.indice]}, com juros simples de ${numeroBr(regime.jurosAoMes)}% ao mês.`;
  }
}

/**
 * A memória de cálculo em Markdown simples (o formato das peças): vira DOCX
 * no timbre e entra no cumprimento de sentença.
 */
export function memoriaDaAtualizacao(pedido: PedidoDeAtualizacao, r: ResultadoDaAtualizacao, extra: { titulo: string; processo?: string | null; fontes: string[] }): string {
  const linhas = r.linhas.map((l) => {
    const juros = l.juros || l.jurosPercentual ? `; juros de ${numeroBr(l.jurosPercentual)}% = ${reais(l.juros)}` : "";
    return `- **${l.descricao}**, vencida em ${diaBr(l.vencimento)}: ${reais(l.valor)} × ${numeroBr(l.fator, 6)} = ${reais(l.corrigido)}${juros}; total ${reais(l.total)}. Critério: ${l.criterio}.`;
  });
  const { total } = r;
  return [
    `## Memória de cálculo · ${extra.titulo}`,
    `${extra.processo ? `Processo ${extra.processo}. ` : ""}Cálculo em ${diaBr(pedido.dataDoCalculo)}.${pedido.jurosDesde ? ` Juros desde ${diaBr(pedido.jurosDesde)}.` : ""}`,
    regimeEmTexto(pedido.regime),
    "### Parcelas",
    linhas.join("\n"),
    "### Total",
    `**Total atualizado: ${reais(total.total)}** (principal ${reais(total.valor)}; correção ${reais(centavos(total.corrigido - total.valor))}; juros ${reais(total.juros)}).`,
    ...(r.ressalvas.length ? ["### Ressalvas", r.ressalvas.map((x) => `- ${x}`).join("\n")] : []),
    "### Fontes",
    extra.fontes.map((f) => `- ${f}`).join("\n"),
  ].join("\n\n");
}

/** "01/2023 a 12/2023", "03/2024" ou "nenhum mês". */
function periodo(meses: Mes[]): string {
  if (!meses.length) return "nenhum mês";
  return meses.length === 1 ? mesEmTexto(meses[0]!) : `${mesEmTexto(meses[0]!)} a ${mesEmTexto(meses.at(-1)!)}`;
}

export const numeroBr = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 6) });

/** Soma de percentuais sem o resíduo do ponto flutuante (0,1 + 0,2 = 0,3). */
const somaExata = (valores: number[]) => Math.round(valores.reduce((s, v) => s + v, 0) * 1e8) / 1e8;

function somar(linhas: LinhaDaAtualizacao[]): ResultadoDaAtualizacao["total"] {
  const s = (f: (l: LinhaDaAtualizacao) => number) => centavos(linhas.reduce((t, l) => t + f(l), 0));
  return { valor: s((l) => l.valor), corrigido: s((l) => l.corrigido), juros: s((l) => l.juros), total: s((l) => l.total) };
}
