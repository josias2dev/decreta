/**
 * Regra do prazo e segunda conferência da sugestão da IA. A IA lê a
 * publicação e diz o ato e os dias; aqui uma tabela fixa confere se a
 * quantidade de dias bate com a lei e se o ato combina com o documento.
 */
import type { Contagem } from "./prazos.ts";

/** Que lei rege a contagem: CPC (art. 219), CLT (art. 775) ou Juizado Especial (Lei 9.099/1995, art. 12-A). */
export type Rito = "cpc" | "clt" | "jec";

export function ritoDoProcesso(p: { tribunal: string | null; classe?: string | null; orgao?: string | null }): Rito {
  if (p.tribunal && /^(TRT|TST)/i.test(p.tribunal)) return "clt";
  if (/juizado especial/i.test(`${p.classe ?? ""} ${p.orgao ?? ""}`)) return "jec";
  return "cpc";
}

const DIAS_UTEIS: Record<Rito, string> = {
  cpc: "CPC, art. 219",
  clt: "CLT, art. 775",
  jec: "Lei 9.099/1995, art. 12-A",
};

/** "Dias úteis (CPC, art. 219)". */
export function regraDaContagem(rito: Rito, contagem: Contagem): string {
  return contagem === "uteis" ? `Dias úteis (${DIAS_UTEIS[rito]})` : "Dias corridos";
}

type Fundamento = readonly [dias: number, artigo: string];

interface Ato {
  nome: string;
  padrao: RegExp;
  dias: Partial<Record<Rito, Fundamento>>;
  /** Recurso: não cabe contra despacho (CPC, art. 1.001). */
  recurso?: boolean;
  /** Ato do começo do processo: não vem depois de sentença ou acórdão. */
  inicial?: boolean;
}

const RECURSO_15: Fundamento = [15, "CPC, art. 1.003, § 5º"];

/** Da mais específica para a mais geral: "contrarrazões de apelação" antes de "apelação". Os padrões leem o texto já sem acento. */
const ATOS: readonly Ato[] = [
  { nome: "embargos de declaração", padrao: /embargos de declara/, dias: { cpc: [5, "CPC, art. 1.023"], clt: [5, "CLT, art. 897-A"], jec: [5, "Lei 9.099/1995, art. 49"] } },
  { nome: "contrarrazões", padrao: /contra-?r?raz/, dias: { cpc: RECURSO_15, clt: [8, "CLT, art. 900"], jec: [10, "Lei 9.099/1995, art. 42, § 2º"] } },
  { nome: "impugnação ao cumprimento de sentença", padrao: /impugnacao (ao )?cumprimento/, dias: { cpc: [15, "CPC, art. 525"] } },
  { nome: "embargos à execução", padrao: /embargos (a|do) (execucao|devedor)/, dias: { cpc: [15, "CPC, art. 915"], clt: [5, "CLT, art. 884"] } },
  { nome: "réplica", padrao: /replica|impugnacao (a )?contestacao/, dias: { cpc: [15, "CPC, arts. 350 e 351"] }, inicial: true },
  { nome: "contestação", padrao: /contestacao|contestar/, dias: { cpc: [15, "CPC, art. 335"] }, inicial: true },
  { nome: "apelação", padrao: /apelacao|apelar/, dias: { cpc: RECURSO_15 }, recurso: true },
  { nome: "agravo de instrumento", padrao: /agravo de instrumento/, dias: { cpc: RECURSO_15, clt: [8, "CLT, art. 897"] }, recurso: true },
  { nome: "agravo de petição", padrao: /agravo de peticao/, dias: { clt: [8, "CLT, art. 897"] }, recurso: true },
  { nome: "agravo interno", padrao: /agravo interno/, dias: { cpc: [15, "CPC, art. 1.070"] }, recurso: true },
  { nome: "recurso especial", padrao: /recurso especial|recurso extraordinario/, dias: { cpc: RECURSO_15 }, recurso: true },
  { nome: "recurso ordinário", padrao: /recurso ordinario/, dias: { cpc: RECURSO_15, clt: [8, "CLT, art. 895"] }, recurso: true },
  { nome: "recurso de revista", padrao: /recurso de revista/, dias: { clt: [8, "CLT, art. 896"] }, recurso: true },
  { nome: "recurso inominado", padrao: /recurso inominado/, dias: { jec: [10, "Lei 9.099/1995, art. 42"] }, recurso: true },
  { nome: "manifestação sobre o laudo", padrao: /laudo/, dias: { cpc: [15, "CPC, art. 477, § 1º"] } },
  { nome: "pagamento", padrao: /pagamento|pagar/, dias: { cpc: [15, "CPC, art. 523"] } },
];

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const atoDe = (tipo: string) => {
  const t = semAcento(tipo);
  return ATOS.find((a) => a.padrao.test(t)) ?? null;
};

/** Junta grafias do mesmo ato ("Apelação", "Interpor apelação"), para contar o que a equipe descarta. */
export function chaveDoAto(tipo: string): string {
  return atoDe(tipo)?.nome ?? semAcento(tipo);
}

export type Confianca = "alta" | "media" | "baixa";

export interface Conferencia {
  confianca: Confianca;
  /** Por que a confiança é essa, em frases curtas para a tela. */
  motivos: string[];
}

export interface SugestaoAConferir {
  tipo: string;
  dias: number;
  contagem: Contagem;
  rito: Rito;
  /** O tipo do documento publicado ("Despacho", "Sentença"), quando o DJEN informa. */
  documento?: string | null;
  /** O que a equipe fez com as sugestões do mesmo ato. */
  historico?: { descartadas: number; confirmadas: number };
}

/** A partir de quantos descartes, sem nenhuma confirmação, o ato vira suspeito. */
export const DESCARTES_PARA_DESCONFIAR = 3;

export function conferirSugestao(s: SugestaoAConferir): Conferencia {
  const ato = atoDe(s.tipo);
  const lei = ato?.dias[s.rito] ?? null;
  const documento = semAcento(s.documento ?? "");
  const alertas: string[] = [];

  if (ato?.recurso && documento === "despacho") alertas.push(`Despacho não tem recurso (CPC, art. 1.001); a sugestão é de ${ato.nome}.`);
  if (ato?.inicial && (documento === "sentenca" || documento === "acordao")) alertas.push(`${maiuscula(ato.nome)} depois de ${s.documento!.toLowerCase()} não combina; confira o ato.`);
  if (lei && lei[0] !== s.dias) alertas.push(`Para ${ato!.nome}, a lei dá ${lei[0]} dias (${lei[1]}); a sugestão diz ${s.dias}.`);
  if (s.contagem === "corridos") alertas.push(`Prazo processual conta em dias úteis (${DIAS_UTEIS[s.rito]}); a sugestão conta em dias corridos.`);
  const h = s.historico;
  if (h && h.descartadas >= DESCARTES_PARA_DESCONFIAR && h.confirmadas === 0) {
    alertas.push(`A equipe descartou ${h.descartadas} sugestões de ${ato?.nome ?? s.tipo.replace(/\s+/g, " ").trim().toLowerCase()} e não confirmou nenhuma.`);
  }

  if (alertas.length) return { confianca: "baixa", motivos: alertas };
  if (lei) return { confianca: "alta", motivos: [`Bate com a lei: ${lei[0]} dias (${lei[1]}).`] };
  return { confianca: "media", motivos: ["Sem prazo fixo em lei para conferir: os dias vêm da publicação."] };
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
