/**
 * O que preenche os cadastros sem digitar: a empresa pelo CNPJ, o endereço pelo
 * CEP, o aviso de documento repetido e o nome da OAB no Diário. Na
 * demonstração, CNPJ e CEP respondem com exemplos inventados
 * (demonstracao/receita.ts) e a OAB só é conferida contra a própria equipe.
 */
import { enderecoEmTexto, formatarDocumento, formatarTelefone, hojeEm, somarDias, type Endereco, type ParteDoCadastro } from "@decreta/core";
import { clientes, equipe, partes, processos, type Tx } from "@decreta/db";
import { buscarCep, buscarCnpj, buscarNoDjen, nomesDaOab, type EmpresaDaReceita } from "@decreta/tribunais";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { empresaDeExemplo, enderecoDeExemplo } from "../demonstracao/receita.ts";
import type { DepsDaCaptura } from "./captura.ts";
import type { SituacaoDaFonte } from "./consulta.ts";

export interface ConsultaDoCnpj {
  cnpj: string;
  fonte: SituacaoDaFonte;
  empresa: (EmpresaDaReceita & { enderecoEmTexto: string | null }) | null;
  /** Cliente que já tem este CNPJ. */
  cliente: { id: string; nome: string } | null;
  exemplo: boolean;
}

export interface ConsultaDoCep {
  cep: string;
  fonte: SituacaoDaFonte;
  endereco: Endereco | null;
  exemplo: boolean;
}

export interface ConsultaDaOab {
  oab: string;
  fonte: SituacaoDaFonte;
  /** Os nomes que o Diário mostra com esta OAB, do mais visto ao menos. */
  nomes: { nome: string; publicacoes: number }[];
  dias: number;
  exemplo: boolean;
}

/** Dias de Diário que a conferência da OAB olha. */
export const DIAS_DA_OAB = 60;

/** O cliente que já tem o documento, fora o que está sendo editado. */
export async function clienteComODocumento(tx: Tx, documento: string, ignorar?: string | null): Promise<{ id: string; nome: string } | null> {
  const [c] = await tx
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(and(eq(clientes.documento, documento), ignorar ? ne(clientes.id, ignorar) : undefined))
    .limit(1);
  return c ?? null;
}

/** A empresa da Receita, ou o exemplo da demonstração. Sem resposta das fontes, `falhou`. */
export async function empresaDoCnpj(deps: Pick<DepsDaCaptura, "fetch" | "log">, cnpj: string, demonstracao: boolean): Promise<{ fonte: SituacaoDaFonte; empresa: EmpresaDaReceita | null }> {
  if (demonstracao) return { fonte: "achou", empresa: empresaDeExemplo(cnpj) };
  try {
    const empresa = await buscarCnpj(cnpj, { fetch: deps.fetch });
    return { fonte: empresa ? "achou" : "nao_achou", empresa };
  } catch (e) {
    deps.log?.("consulta do CNPJ falhou", { erro: String(e) });
    return { fonte: "falhou", empresa: null };
  }
}

export async function consultarCnpj(deps: Pick<DepsDaCaptura, "fetch" | "log">, tx: Tx, cnpj: string, opcoes: { demonstracao: boolean; ignorar?: string | null }): Promise<ConsultaDoCnpj> {
  const [r, cliente] = await Promise.all([empresaDoCnpj(deps, cnpj, opcoes.demonstracao), clienteComODocumento(tx, cnpj, opcoes.ignorar)]);
  return {
    cnpj: formatarDocumento(cnpj),
    fonte: r.fonte,
    empresa: r.empresa ? { ...r.empresa, enderecoEmTexto: r.empresa.endereco ? enderecoEmTexto(r.empresa.endereco) : null, telefone: r.empresa.telefone ? formatarTelefone(r.empresa.telefone) : null } : null,
    cliente,
    exemplo: opcoes.demonstracao,
  };
}

export async function consultarCep(deps: Pick<DepsDaCaptura, "fetch" | "log">, cep: string, demonstracao: boolean): Promise<ConsultaDoCep> {
  const d = cep.replace(/\D/g, "");
  const formatado = `${d.slice(0, 5)}-${d.slice(5)}`;
  if (demonstracao) return { cep: formatado, fonte: "achou", endereco: enderecoDeExemplo(d), exemplo: true };
  try {
    const endereco = await buscarCep(d, { fetch: deps.fetch });
    return { cep: formatado, fonte: endereco ? "achou" : "nao_achou", endereco, exemplo: false };
  } catch (e) {
    deps.log?.("consulta do CEP falhou", { erro: String(e) });
    return { cep: formatado, fonte: "falhou", endereco: null, exemplo: false };
  }
}

/**
 * Quem o Diário mostra com a OAB, nos últimos 60 dias. Na demonstração as OABs
 * são inventadas: vale só a da própria equipe.
 */
export async function consultarOab(
  deps: Pick<DepsDaCaptura, "fetch" | "log" | "djen">,
  tx: Tx,
  oab: { numero: string; uf: string },
  opcoes: { demonstracao: boolean; timezone: string; nomeDe: (userId: string) => string | undefined },
): Promise<ConsultaDaOab> {
  const base = { oab: `OAB/${oab.uf} ${oab.numero}`, dias: DIAS_DA_OAB, exemplo: opcoes.demonstracao };
  if (opcoes.demonstracao) {
    const [dono] = await tx
      .select({ userId: equipe.userId })
      .from(equipe)
      .where(and(sql`regexp_replace(coalesce(${equipe.oabNumero}, ''), '\\D', '', 'g') = ${oab.numero}`, eq(equipe.oabUf, oab.uf)))
      .limit(1);
    const nome = dono && opcoes.nomeDe(dono.userId);
    return { ...base, fonte: nome ? "achou" : "nao_achou", nomes: nome ? [{ nome, publicacoes: 12 + (Number(oab.numero) % 30) }] : [] };
  }
  const ate = hojeEm(opcoes.timezone);
  try {
    const itens = await buscarNoDjen({ oab: oab.numero, uf: oab.uf, de: somarDias(ate, -DIAS_DA_OAB), ate }, { fetch: deps.fetch, ...deps.djen, maxPaginas: 2, timeout: 20_000 });
    const nomes = nomesDaOab(itens, oab);
    return { ...base, fonte: nomes.length ? "achou" : "nao_achou", nomes };
  } catch (e) {
    deps.log?.("conferência da OAB no DJEN falhou", { erro: String(e) });
    return { ...base, fonte: "falhou", nomes: [] };
  }
}

export interface ParaQualificar {
  cliente: { nome: string; tipo: "pf" | "pj"; documento: string | null; endereco: string | null; polo: ParteDoCadastro["polo"] } | null;
  /** As outras partes com CNPJ na ficha. */
  empresas: { nome: string; cnpj: string; polo: ParteDoCadastro["polo"] }[];
  /** Todas as partes, com o tipo e o polo do cadastro. O tipo nunca sai da interpretação do texto. */
  partes: ParteDoCadastro[];
}

/** Pessoa física ou jurídica: a ficha do cliente; das outras partes, o tamanho do documento. Sem isso, o cadastro não diz. */
function tipoDaParte(x: { cliente: boolean; documento: string | null }, cliente: { tipo: "pf" | "pj" } | undefined): ParteDoCadastro["tipo"] {
  if (x.cliente && cliente) return cliente.tipo;
  if (x.documento?.length === 14) return "pj";
  if (x.documento?.length === 11) return "pf";
  return null;
}

/** O que a qualificação lê do banco. A Receita é consultada depois, fora da transação. */
export async function paraQualificar(tx: Tx, processoId: string): Promise<ParaQualificar> {
  const [p] = await tx.select({ clienteId: processos.clienteId, poloCliente: processos.poloCliente }).from(processos).where(eq(processos.id, processoId));
  const [cliente] = p?.clienteId ? await tx.select().from(clientes).where(eq(clientes.id, p.clienteId)) : [];
  const pts = await tx.select().from(partes).where(eq(partes.processoId, processoId)).orderBy(asc(partes.ordem));
  return {
    cliente: cliente ? { nome: cliente.nome, tipo: cliente.tipo, documento: cliente.documento, endereco: cliente.endereco, polo: pts.find((x) => x.cliente)?.polo ?? p!.poloCliente } : null,
    empresas: pts.filter((x) => !x.cliente && x.documento?.length === 14).map((x) => ({ nome: x.nome, cnpj: x.documento!, polo: x.polo })),
    partes: pts.map((x) => ({ nome: x.nome, tipo: tipoDaParte(x, cliente), polo: x.polo, cliente: x.cliente })),
  };
}

const NOME_DO_TIPO = { pf: "pessoa física", pj: "pessoa jurídica" } as const;

/**
 * A qualificação das partes para a peça: o cliente com o tipo, o documento e o
 * endereço da ficha, a empresa da outra parte com a razão social e a sede da
 * Receita, e cada uma com o polo do cadastro. O que não se sabe fica dito; a IA
 * marca [COMPLETAR].
 */
export async function qualificacaoDasPartes(deps: Pick<DepsDaCaptura, "fetch" | "log">, dados: ParaQualificar, demonstracao: boolean): Promise<string | null> {
  const linhas: string[] = [];
  const { cliente } = dados;
  const listados = new Set<string>();
  if (cliente) {
    const doc = cliente.documento ? `${cliente.tipo === "pj" ? "CNPJ" : "CPF"} ${formatarDocumento(cliente.documento)}` : null;
    const ficha = [doc, cliente.endereco && `endereço: ${cliente.endereco}`].filter(Boolean).join("; ");
    linhas.push(`- ${cliente.nome} (cliente, ${NOME_DO_TIPO[cliente.tipo]}, polo ${cliente.polo}): ${ficha || "sem documento nem endereço no cadastro"}.`);
    listados.add(cliente.nome);
    for (const x of dados.partes) if (x.cliente) listados.add(x.nome);
  }
  for (const x of dados.empresas.slice(0, 4)) {
    listados.add(x.nome);
    const r = await empresaDoCnpj(deps, x.cnpj, demonstracao);
    // O exemplo inventado da demonstração leva o nome da própria parte.
    const empresa = r.empresa && demonstracao ? { ...r.empresa, razaoSocial: x.nome } : r.empresa;
    const quem = `- ${x.nome} (pessoa jurídica, polo ${x.polo})`;
    if (!empresa) {
      linhas.push(`${quem}: CNPJ ${formatarDocumento(x.cnpj)}.`);
      continue;
    }
    const sede = empresa.endereco ? `, com sede em ${enderecoEmTexto(empresa.endereco)}` : "";
    const natureza = empresa.naturezaJuridica ? `${empresa.naturezaJuridica.toLocaleLowerCase("pt-BR")}, ` : "";
    const situacao = empresa.ativa ? "" : ` Atenção: na Receita a empresa está ${empresa.situacao.toLocaleLowerCase("pt-BR")}${empresa.situacaoDesde ? ` desde ${empresa.situacaoDesde.split("-").reverse().join("/")}` : ""}.`;
    linhas.push(`${quem}: ${empresa.razaoSocial}, ${natureza}inscrita no CNPJ sob o nº ${formatarDocumento(empresa.cnpj)}${sede} (dados da Receita Federal).${situacao}`);
  }
  for (const x of dados.partes) {
    if (listados.has(x.nome)) continue;
    linhas.push(x.tipo ? `- ${x.nome} (${NOME_DO_TIPO[x.tipo]}, polo ${x.polo}).` : `- ${x.nome} (polo ${x.polo}): o cadastro não diz se é pessoa física ou jurídica; marque [COMPLETAR] em vez de deduzir.`);
  }
  return linhas.length ? linhas.join("\n") : null;
}
