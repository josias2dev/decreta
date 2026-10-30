/**
 * O que preenche os cadastros sem digitar: a empresa pelo CNPJ, o endereço pelo
 * CEP, o aviso de documento repetido e o nome da OAB no Diário. Na
 * demonstração, CNPJ e CEP respondem com exemplos inventados
 * (demonstracao/receita.ts) e a OAB só é conferida contra a própria equipe.
 */
import { enderecoEmTexto, formatarDocumento, formatarTelefone, hojeEm, somarDias, type Endereco } from "@decreta/core";
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
  cliente: { nome: string; tipo: "pf" | "pj"; documento: string | null; endereco: string | null } | null;
  /** As outras partes com CNPJ na ficha. */
  empresas: { nome: string; cnpj: string }[];
}

/** O que a qualificação lê do banco. A Receita é consultada depois, fora da transação. */
export async function paraQualificar(tx: Tx, processoId: string): Promise<ParaQualificar> {
  const [p] = await tx.select({ clienteId: processos.clienteId }).from(processos).where(eq(processos.id, processoId));
  const [cliente] = p?.clienteId ? await tx.select().from(clientes).where(eq(clientes.id, p.clienteId)) : [];
  const pts = await tx.select().from(partes).where(eq(partes.processoId, processoId)).orderBy(asc(partes.ordem));
  return {
    cliente: cliente ? { nome: cliente.nome, tipo: cliente.tipo, documento: cliente.documento, endereco: cliente.endereco } : null,
    empresas: pts.filter((x) => !x.cliente && x.documento?.length === 14).map((x) => ({ nome: x.nome, cnpj: x.documento! })),
  };
}

/**
 * A qualificação das partes para a peça: o cliente com o documento e o
 * endereço da ficha, e a empresa da outra parte com a razão social e a sede da
 * Receita. O que não se sabe fica de fora; a IA marca [COMPLETAR].
 */
export async function qualificacaoDasPartes(deps: Pick<DepsDaCaptura, "fetch" | "log">, dados: ParaQualificar, demonstracao: boolean): Promise<string | null> {
  const linhas: string[] = [];
  const { cliente } = dados;
  if (cliente && (cliente.documento || cliente.endereco)) {
    const doc = cliente.documento ? `${cliente.tipo === "pj" ? "CNPJ" : "CPF"} ${formatarDocumento(cliente.documento)}` : null;
    linhas.push(`- ${cliente.nome} (cliente): ${[doc, cliente.endereco && `endereço: ${cliente.endereco}`].filter(Boolean).join("; ")}.`);
  }
  for (const x of dados.empresas.slice(0, 4)) {
    const r = await empresaDoCnpj(deps, x.cnpj, demonstracao);
    // O exemplo inventado da demonstração leva o nome da própria parte.
    const empresa = r.empresa && demonstracao ? { ...r.empresa, razaoSocial: x.nome } : r.empresa;
    if (!empresa) {
      linhas.push(`- ${x.nome}: CNPJ ${formatarDocumento(x.cnpj)}.`);
      continue;
    }
    const sede = empresa.endereco ? `, com sede em ${enderecoEmTexto(empresa.endereco)}` : "";
    const natureza = empresa.naturezaJuridica ? `${empresa.naturezaJuridica.toLocaleLowerCase("pt-BR")}, ` : "";
    const situacao = empresa.ativa ? "" : ` Atenção: na Receita a empresa está ${empresa.situacao.toLocaleLowerCase("pt-BR")}${empresa.situacaoDesde ? ` desde ${empresa.situacaoDesde.split("-").reverse().join("/")}` : ""}.`;
    linhas.push(`- ${x.nome}: ${empresa.razaoSocial}, ${natureza}inscrita no CNPJ sob o nº ${formatarDocumento(empresa.cnpj)}${sede} (dados da Receita Federal).${situacao}`);
  }
  return linhas.length ? linhas.join("\n") : null;
}
