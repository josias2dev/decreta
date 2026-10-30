/**
 * DataJud, a API pública de metadados processuais do CNJ
 * (api-publica.datajud.cnj.jus.br). Um índice por tribunal; a busca é pelo
 * número do processo, sem máscara. Devolve classe, assuntos, órgão julgador e
 * os movimentos (códigos da tabela processual unificada), sem o teor dos atos:
 * o teor vem pelo DJEN ou pelo documento anexado.
 *
 * A chave pública fica no wiki do DataJud e muda de tempos em tempos
 * (DATAJUD_API_KEY no .env).
 */
import { indiceDataJud, limparCnj, nomeProprio } from "@decreta/core";
import { z } from "zod";

export const DATAJUD_URL = "https://api-publica.datajud.cnj.jus.br";

const nomeado = z.object({ codigo: z.union([z.number(), z.string()]).optional(), nome: z.string().optional() }).loose();

const orgaoSchema = nomeado.extend({ codigoMunicipioIBGE: z.union([z.number(), z.string()]).optional() });

const movimentoSchema = z
  .object({
    codigo: z.union([z.number(), z.string()]).optional(),
    nome: z.string().optional(),
    dataHora: z.string().optional(),
    complementosTabelados: z.array(z.object({ nome: z.string().optional(), descricao: z.string().optional(), valor: z.unknown().optional() }).loose()).optional().catch([]),
  })
  .loose();

const fonteSchema = z
  .object({
    numeroProcesso: z.string().optional(),
    classe: nomeado.optional(),
    assuntos: z.array(nomeado).optional().catch([]),
    orgaoJulgador: orgaoSchema.optional(),
    sistema: nomeado.optional(),
    dataAjuizamento: z.string().optional(),
    dataHoraUltimaAtualizacao: z.string().optional(),
    grau: z.string().optional(),
    nivelSigilo: z.number().optional(),
    movimentos: z.array(movimentoSchema).optional().catch([]),
  })
  .loose();

const respostaSchema = z.object({ hits: z.object({ hits: z.array(z.object({ _source: z.unknown() }).loose()).default([]) }).loose() }).loose();

export interface MovimentoDataJud {
  /** Identidade estável do movimento: o mesmo não entra duas vezes. */
  chave: string;
  em: string;
  codigo: number | null;
  titulo: string;
  descricao: string | null;
}

export interface ProcessoDataJud {
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  /** Código IBGE da cidade do órgão julgador: vira a comarca (ver ibge.ts). */
  municipioIbge: number | null;
  /** "PJe", "eproc", "e-SAJ", "Projudi". */
  sistema: string | null;
  grau: string | null;
  distribuidoEm: string | null;
  sigilo: boolean;
  atualizadoEm: string | null;
  movimentos: MovimentoDataJud[];
}

const SISTEMAS: Record<string, string> = { pje: "PJe", eproc: "eproc", saj: "e-SAJ", esaj: "e-SAJ", "e-saj": "e-SAJ", projudi: "Projudi", tucujuris: "Tucujuris", sei: "SEI" };

/** O nome do sistema como o tribunal escreve ("Pje" → "PJe"). "Outros" e "Inexistente" não dizem nada. */
export function nomeDoSistema(nome: string | undefined): string | null {
  const chave = (nome ?? "").trim().toLocaleLowerCase("pt-BR");
  if (!chave || /^(outros?|inexistente|n[ãa]o informado)$/.test(chave)) return null;
  return SISTEMAS[chave] ?? SISTEMAS[chave.split(/\s+/)[0]!] ?? nome!.trim();
}

/** "20260115103000" ou ISO → ISO. */
export function instante(valor: string | undefined): string | null {
  if (!valor) return null;
  const compacto = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(valor);
  if (compacto) {
    const [, a, m, d, h = "00", mi = "00", s = "00"] = compacto;
    return new Date(`${a}-${m}-${d}T${h}:${mi}:${s}-03:00`).toISOString();
  }
  const t = new Date(valor);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** Nomes da TPU vêm em caixa alta às vezes ("JUNTADA DE PETIÇÃO"): deixa só a primeira maiúscula. */
function caixaDeFrase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  const baixa = s.toLocaleLowerCase("pt-BR");
  return baixa.charAt(0).toLocaleUpperCase("pt-BR") + baixa.slice(1);
}

export function lerProcessoDataJud(bruto: unknown): ProcessoDataJud | null {
  const r = fonteSchema.safeParse(bruto);
  if (!r.success) return null;
  const p = r.data;
  const movimentos: MovimentoDataJud[] = [];
  for (const m of p.movimentos ?? []) {
    const em = instante(m.dataHora);
    if (!em || !m.nome) continue;
    const complementos = (m.complementosTabelados ?? [])
      .map((c) => c.nome ?? c.descricao)
      .filter((x): x is string => !!x)
      .map(caixaDeFrase);
    const codigo = m.codigo != null && Number.isFinite(Number(m.codigo)) ? Number(m.codigo) : null;
    movimentos.push({
      chave: `datajud:${codigo ?? m.nome}:${em}`,
      em,
      codigo,
      titulo: caixaDeFrase(m.nome),
      descricao: complementos.length ? complementos.join("; ") : null,
    });
  }
  movimentos.sort((a, b) => a.em.localeCompare(b.em));
  const distribuido = instante(p.dataAjuizamento);
  return {
    classe: p.classe?.nome ? nomeProprio(p.classe.nome) : null,
    assunto: p.assuntos?.[0]?.nome ? caixaDeFrase(p.assuntos[0].nome) : null,
    orgao: p.orgaoJulgador?.nome ? nomeProprio(p.orgaoJulgador.nome) : null,
    municipioIbge: Number(p.orgaoJulgador?.codigoMunicipioIBGE) || null,
    sistema: nomeDoSistema(p.sistema?.nome),
    grau: p.grau ?? null,
    distribuidoEm: distribuido ? distribuido.slice(0, 10) : null,
    sigilo: (p.nivelSigilo ?? 0) > 0,
    atualizadoEm: instante(p.dataHoraUltimaAtualizacao),
    movimentos,
  };
}

export interface OpcoesDataJud {
  apiKey: string;
  fetch?: typeof fetch;
}

export class ErroDataJud extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** O processo no DataJud, ou `null` se o tribunal ainda não enviou (processo novo leva dias para aparecer). */
export async function buscarNoDataJud(cnj: string, opcoes: OpcoesDataJud): Promise<ProcessoDataJud | null> {
  const indice = indiceDataJud(cnj);
  if (!indice) throw new ErroDataJud(`tribunal sem índice no DataJud: ${cnj}`);
  if (!opcoes.apiKey) throw new ErroDataJud("DATAJUD_API_KEY não configurada");
  const fetchImpl = opcoes.fetch ?? fetch;
  const res = await fetchImpl(`${DATAJUD_URL}/${indice}/_search`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `APIKey ${opcoes.apiKey}` },
    body: JSON.stringify({ query: { match: { numeroProcesso: limparCnj(cnj) } }, size: 5 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new ErroDataJud(`DataJud respondeu HTTP ${res.status}`, res.status);
  const corpo = respostaSchema.safeParse(await res.json().catch(() => null));
  if (!corpo.success) throw new ErroDataJud("DataJud devolveu um formato desconhecido");
  // O mesmo número pode vir em mais de um grau: junta os movimentos de todos.
  const lidos = corpo.data.hits.hits.map((h) => lerProcessoDataJud(h._source)).filter((x): x is ProcessoDataJud => x !== null);
  if (!lidos.length) return null;
  const primeiro = lidos.find((l) => l.grau === "G1") ?? lidos[0]!;
  const movimentos = new Map<string, MovimentoDataJud>();
  for (const l of lidos) for (const m of l.movimentos) movimentos.set(m.chave, m);
  return { ...primeiro, movimentos: [...movimentos.values()].sort((a, b) => a.em.localeCompare(b.em)) };
}
