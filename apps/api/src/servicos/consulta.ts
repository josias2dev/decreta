/**
 * Consulta pelo número: o que o tribunal já sabe do processo, para o Novo
 * processo vir preenchido. Classe, vara, comarca e sistema vêm do DataJud;
 * partes e advogados, do DJEN (o DataJud não traz nomes). As duas buscas
 * correm juntas e uma não depende da outra: o que vier é sugestão, e a pessoa
 * confere antes de salvar.
 */
import { formatarCnj, limparCnj, tribunalDoCnj } from "@decreta/core";
import { clientes, equipe, partes as partesDoProcesso, processos, publicacoes, withTenant, type Database, type Tx } from "@decreta/db";
import { buscarDjenDoProcesso, buscarNoDataJud, comarcaDoOrgao, nomeDoMunicipio, orgaoSemComarca, partesDoDjen, type ComunicacaoDjen, type ParteDjen, type ProcessoDataJud } from "@decreta/tribunais";
import { asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { consultaDeExemplo } from "../demonstracao/consulta.ts";
import { semAcentoNoBanco } from "../rotas/base.ts";
import type { DepsDaCaptura } from "./captura.ts";

/** Como foi cada fonte: achou, não tem o processo, não respondeu ou está desligada no servidor. */
export type SituacaoDaFonte = "achou" | "nao_achou" | "falhou" | "desligado";

export interface ParteNaConsulta {
  nome: string;
  polo: "ativo" | "passivo" | "terceiro";
  /** "Beatriz Souza (OAB/SC 45678)", como a ficha guarda. */
  advogados: string | null;
  /** O cliente já cadastrado com este nome. */
  cliente: { id: string; nome: string } | null;
}

export interface ConsultaDoCnj {
  cnj: string;
  tribunal: string | null;
  /** O processo já está neste escritório. */
  cadastrado: { id: string; titulo: string } | null;
  /** Demonstração: dados inventados, nada foi ao tribunal. */
  exemplo: boolean;
  fontes: { datajud: SituacaoDaFonte; djen: SituacaoDaFonte };
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  comarca: string | null;
  sistema: string | null;
  distribuidoEm: string | null;
  segredo: boolean;
  movimentacoes: number;
  ultimaMovimentacao: { em: string; titulo: string } | null;
  partes: ParteNaConsulta[];
  /** De que lado o cliente está: pela OAB da equipe ou pelo cliente achado entre as partes. */
  poloCliente: "ativo" | "passivo" | null;
  cliente: { id: string; nome: string } | null;
}

/** Igual ao `semAcentoNoBanco`: minúsculas, sem acento, espaços simples. */
export const nomeParaComparar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function advogadosEmTexto(lista: { nome: string; oab?: string; uf?: string }[]): string | null {
  const t = lista.map((a) => (a.oab ? `${a.nome} (OAB/${(a.uf ?? "").toUpperCase()} ${a.oab})` : a.nome)).join("; ");
  return t || null;
}

/** A cidade do órgão: pelo código IBGE do DataJud ou, sem ele, pelo nome do órgão. */
export async function comarcaDoDataJud(dados: Pick<ProcessoDataJud, "municipioIbge" | "orgao">, fetchImpl?: typeof fetch): Promise<string | null> {
  const doIbge = dados.municipioIbge ? await nomeDoMunicipio(dados.municipioIbge, { fetch: fetchImpl }) : null;
  return doIbge ?? comarcaDoOrgao(dados.orgao);
}

export async function oabsDaEquipe(tx: Tx) {
  const linhas = await tx.select({ numero: equipe.oabNumero, uf: equipe.oabUf }).from(equipe).where(isNotNull(equipe.oabNumero));
  return linhas.map((l) => ({ numero: l.numero!, uf: l.uf ?? "SC" }));
}

/** Os clientes cadastrados com o nome de alguma das partes. */
async function clientesComONome(tx: Tx, nomes: string[]): Promise<Map<string, { id: string; nome: string }>> {
  const alvo = [...new Set(nomes.map(nomeParaComparar))].filter(Boolean);
  if (!alvo.length) return new Map();
  const linhas = await tx.select({ id: clientes.id, nome: clientes.nome }).from(clientes).where(inArray(semAcentoNoBanco(sql`${clientes.nome}`), alvo));
  return new Map(linhas.map((l) => [nomeParaComparar(l.nome), l]));
}

/** Monta a resposta: casa as partes com os clientes e escolhe o lado do cliente. */
export function montarConsulta(
  base: Omit<ConsultaDoCnj, "partes" | "poloCliente" | "cliente">,
  partes: ParteDjen[],
  poloDaEquipe: "ativo" | "passivo" | null,
  doCadastro: Map<string, { id: string; nome: string }>,
): ConsultaDoCnj {
  const lista: ParteNaConsulta[] = partes.map((p) => ({ nome: p.nome, polo: p.polo, advogados: advogadosEmTexto(p.advogados), cliente: doCadastro.get(nomeParaComparar(p.nome)) ?? null }));
  const doLado = poloDaEquipe ? lista.filter((p) => p.polo === poloDaEquipe) : [];
  const conhecidos = lista.filter((p) => p.cliente && p.polo !== "terceiro");
  // O cliente é a parte cadastrada do lado da equipe; sem a OAB da equipe, a única parte cadastrada.
  const escolhido = doLado.find((p) => p.cliente) ?? (!poloDaEquipe && conhecidos.length === 1 ? conhecidos[0] : undefined);
  const polo = poloDaEquipe ?? (escolhido && escolhido.polo !== "terceiro" ? escolhido.polo : null);
  return { ...base, partes: lista, poloCliente: polo, cliente: escolhido?.cliente ?? null };
}

export async function consultarCnj(deps: DepsDaCaptura & { db: Database }, organizationId: string, numero: string, demonstracao: boolean): Promise<ConsultaDoCnj> {
  const cnj = formatarCnj(numero);
  const tribunal = tribunalDoCnj(cnj);
  const { cadastrado, oabs } = await withTenant(deps.db, organizationId, async (tx) => {
    const [p] = await tx.select({ id: processos.id, titulo: processos.titulo }).from(processos).where(eq(processos.cnj, cnj));
    return { cadastrado: p ?? null, oabs: await oabsDaEquipe(tx) };
  });

  if (demonstracao) {
    const exemplo = consultaDeExemplo(cnj);
    const doCadastro = await withTenant(deps.db, organizationId, async (tx) => {
      // Na demonstração o cliente do exemplo é um dos cadastrados, para a tela mostrar o casamento.
      const todos = await tx.select({ id: clientes.id, nome: clientes.nome }).from(clientes).orderBy(clientes.nome).limit(40);
      const escolhido = todos.length ? todos[Number(limparCnj(cnj).slice(0, 7)) % todos.length] : undefined;
      if (escolhido) exemplo.partes[0]!.nome = escolhido.nome;
      return new Map(escolhido ? [[nomeParaComparar(escolhido.nome), escolhido]] : []);
    });
    return montarConsulta({ ...exemplo.base, cnj, tribunal, cadastrado }, exemplo.partes, exemplo.poloDaEquipe, doCadastro);
  }

  const [dj, dn] = await Promise.allSettled([
    deps.datajudKey ? buscarNoDataJud(cnj, { apiKey: deps.datajudKey, fetch: deps.fetch }) : Promise.resolve(undefined),
    buscarDjenDoProcesso(cnj, { fetch: deps.fetch, ...deps.djen, timeout: 20_000, maxPaginas: 2 }),
  ]);
  if (dj.status === "rejected") deps.log?.("consulta no DataJud falhou", { cnj, error: dj.reason instanceof Error ? dj.reason.message : String(dj.reason) });
  if (dn.status === "rejected") deps.log?.("consulta no DJEN falhou", { cnj, error: dn.reason instanceof Error ? dn.reason.message : String(dn.reason) });

  const dados = dj.status === "fulfilled" ? (dj.value ?? null) : null;
  const comunicacoes = dn.status === "fulfilled" ? dn.value : [];
  const doDjen = partesDoDjen(comunicacoes, oabs);
  const comarca = dados ? await comarcaDoDataJud(dados, deps.fetch) : comarcaDoOrgao(doDjen.orgao);
  const ultima = dados?.movimentos.at(-1);
  const doCadastro = await withTenant(deps.db, organizationId, (tx) => clientesComONome(tx, doDjen.partes.map((p) => p.nome)));

  return montarConsulta(
    {
      cnj,
      tribunal,
      cadastrado,
      exemplo: false,
      fontes: {
        datajud: !deps.datajudKey ? "desligado" : dj.status === "rejected" ? "falhou" : dados ? "achou" : "nao_achou",
        djen: dn.status === "rejected" ? "falhou" : comunicacoes.length ? "achou" : "nao_achou",
      },
      classe: dados?.classe ?? doDjen.classe,
      assunto: dados?.assunto ?? null,
      orgao: orgaoSemComarca(dados?.orgao ?? doDjen.orgao),
      comarca,
      sistema: dados?.sistema ?? null,
      distribuidoEm: dados?.distribuidoEm ?? null,
      segredo: dados?.sigilo ?? false,
      movimentacoes: dados?.movimentos.length ?? 0,
      ultimaMovimentacao: ultima ? { em: ultima.em, titulo: ultima.titulo } : null,
    },
    doDjen.partes,
    doDjen.poloDaEquipe,
    doCadastro,
  );
}

/** "Autor" e "Réu"; na Justiça do Trabalho, "Reclamante" e "Reclamado". */
export function papelDoPolo(polo: "ativo" | "passivo" | "terceiro", cnj: string | null): string | null {
  const trabalho = cnj ? limparCnj(cnj)[13] === "5" : false;
  if (polo === "ativo") return trabalho ? "Reclamante" : "Autor";
  if (polo === "passivo") return trabalho ? "Reclamado" : "Réu";
  return null;
}

/** As publicações já guardadas do processo, no formato do DJEN: as partes saem delas sem nova consulta. */
export async function comunicacoesGuardadas(tx: Tx, processoId: string): Promise<ComunicacaoDjen[]> {
  const linhas = await tx
    .select({ id: publicacoes.id, em: publicacoes.disponibilizadaEm, orgao: publicacoes.orgao, classe: publicacoes.classe, destinatarios: publicacoes.destinatarios, advogados: publicacoes.advogados })
    .from(publicacoes)
    .where(eq(publicacoes.processoId, processoId));
  return linhas.map((l) => ({
    idExterno: l.id,
    disponibilizadaEm: l.em,
    tribunal: null,
    orgao: l.orgao,
    tipoComunicacao: null,
    tipoDocumento: null,
    classe: l.classe,
    cnj: null,
    texto: "",
    link: null,
    destinatarios: l.destinatarios.map((d) => ({ nome: d.nome, polo: d.polo })),
    advogados: l.advogados.filter((a) => a.nome).map((a) => ({ nome: a.nome, oab: a.oab?.replace(/\D/g, ""), uf: a.uf })),
  }));
}

/**
 * Põe na ficha as partes que faltam e os advogados de quem está sem. Quem já
 * está (pelo nome, sem acento) fica como a equipe deixou. A parte com o nome do
 * cliente do processo é marcada como cliente.
 */
export async function completarPartes(tx: Tx, organizationId: string, processoId: string, novas: ParteDjen[]): Promise<{ novas: number; atualizadas: number }> {
  const [p] = await tx.select({ cnj: processos.cnj, cliente: clientes.nome }).from(processos).leftJoin(clientes, eq(clientes.id, processos.clienteId)).where(eq(processos.id, processoId));
  if (!p) return { novas: 0, atualizadas: 0 };
  const atuais = await tx.select().from(partesDoProcesso).where(eq(partesDoProcesso.processoId, processoId)).orderBy(asc(partesDoProcesso.ordem));
  const porNome = new Map(atuais.map((a) => [nomeParaComparar(a.nome), a]));
  const temCliente = atuais.some((a) => a.cliente);
  let ordem = Math.max(-1, ...atuais.map((a) => a.ordem)) + 1;
  let inseridas = 0;
  let atualizadas = 0;
  for (const n of novas) {
    const chave = nomeParaComparar(n.nome);
    const advogados = advogadosEmTexto(n.advogados);
    const existente = porNome.get(chave);
    if (existente) {
      if (!existente.advogados && advogados) {
        await tx.update(partesDoProcesso).set({ advogados }).where(eq(partesDoProcesso.id, existente.id));
        atualizadas++;
      }
      continue;
    }
    const cliente = !temCliente && !!p.cliente && nomeParaComparar(p.cliente) === chave;
    await tx.insert(partesDoProcesso).values({ organizationId, processoId, nome: n.nome, polo: n.polo, papel: papelDoPolo(n.polo, p.cnj), advogados, cliente, ordem: ordem++ });
    porNome.set(chave, { nome: n.nome } as (typeof atuais)[number]);
    inseridas++;
  }
  return { novas: inseridas, atualizadas };
}
