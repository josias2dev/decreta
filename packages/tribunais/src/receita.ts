/**
 * A empresa pelo CNPJ, dos dados abertos da Receita Federal (atualizados uma
 * vez por mês). Primeiro a BrasilAPI; se ela não responder, a API aberta do
 * CNPJá. As duas são grátis e limitam o ritmo, então a resposta fica guardada
 * em memória por um dia. Os sócios não são lidos: o cadastro não precisa deles.
 */
import { cepComMascara, limparCnpj, nomeProprio, type Endereco } from "@decreta/core";
import { z } from "zod";

export const BRASILAPI_CNPJ_URL = "https://brasilapi.com.br/api/cnpj/v1";
export const CNPJA_URL = "https://open.cnpja.com/office";

export interface EmpresaDaReceita {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  /** "Ativa", "Baixada", "Inapta", "Suspensa", "Nula". */
  situacao: string;
  ativa: boolean;
  /** AAAA-MM-DD */
  situacaoDesde: string | null;
  abertura: string | null;
  atividade: string | null;
  naturezaJuridica: string | null;
  endereco: Endereco | null;
  telefone: string | null;
  email: string | null;
  fonte: "BrasilAPI" | "CNPJá";
}

export class ErroDaReceita extends Error {}

const texto = z.preprocess((v) => (v == null || v === "" ? undefined : String(v)), z.string().optional());
const dia = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const bonito = (v: string | undefined) => (v?.trim() ? nomeProprio(v.trim()) : null);
const telefone = (v: string | undefined) => (v && v.replace(/\D/g, "").length >= 10 ? v.replace(/\D/g, "") : null);
const situacaoBonita = (v: string) => nomeProprio(v.trim()).replace(/^./, (c) => c.toLocaleUpperCase("pt-BR"));

const brasilApiSchema = z
  .object({
    cnpj: texto,
    razao_social: texto,
    nome_fantasia: texto,
    descricao_situacao_cadastral: texto,
    data_situacao_cadastral: texto,
    data_inicio_atividade: texto,
    cnae_fiscal_descricao: texto,
    natureza_juridica: texto,
    descricao_tipo_de_logradouro: texto,
    logradouro: texto,
    numero: texto,
    complemento: texto,
    bairro: texto,
    municipio: texto,
    uf: texto,
    cep: texto,
    ddd_telefone_1: texto,
    email: texto,
  })
  .loose();

const cnpjaSchema = z
  .object({
    taxId: texto,
    alias: texto,
    founded: texto,
    statusDate: texto,
    status: z.object({ text: texto }).loose().optional(),
    company: z.object({ name: texto, nature: z.object({ text: texto }).loose().optional() }).loose().optional(),
    address: z.object({ street: texto, number: texto, details: texto, district: texto, city: texto, state: texto, zip: texto }).loose().optional(),
    phones: z.array(z.object({ area: texto, number: texto }).loose()).optional().catch([]),
    emails: z.array(z.object({ address: texto }).loose()).optional().catch([]),
    mainActivity: z.object({ text: texto }).loose().optional(),
  })
  .loose();

/** A resposta da BrasilAPI, ou `null` se não der para ler. */
export function lerEmpresaDaBrasilApi(bruto: unknown): EmpresaDaReceita | null {
  const r = brasilApiSchema.safeParse(bruto);
  if (!r.success || !r.data.cnpj || !r.data.razao_social) return null;
  const e = r.data;
  const situacao = situacaoBonita(e.descricao_situacao_cadastral ?? "Desconhecida");
  const rua = [e.descricao_tipo_de_logradouro, e.logradouro].filter(Boolean).join(" ");
  return {
    cnpj: limparCnpj(e.cnpj!),
    razaoSocial: nomeProprio(e.razao_social!),
    nomeFantasia: bonito(e.nome_fantasia),
    situacao,
    ativa: situacao === "Ativa",
    situacaoDesde: dia(e.data_situacao_cadastral),
    abertura: dia(e.data_inicio_atividade),
    atividade: e.cnae_fiscal_descricao?.trim() || null,
    naturezaJuridica: e.natureza_juridica?.trim() || null,
    endereco: e.municipio
      ? { logradouro: bonito(rua), numero: e.numero?.trim() || null, complemento: bonito(e.complemento), bairro: bonito(e.bairro), cidade: nomeProprio(e.municipio), uf: e.uf?.toUpperCase() ?? null, cep: e.cep ? cepComMascara(e.cep) : null }
      : null,
    telefone: telefone(e.ddd_telefone_1),
    email: e.email?.trim().toLocaleLowerCase("pt-BR") || null,
    fonte: "BrasilAPI",
  };
}

/** A resposta do CNPJá, ou `null` se não der para ler. */
export function lerEmpresaDoCnpja(bruto: unknown): EmpresaDaReceita | null {
  const r = cnpjaSchema.safeParse(bruto);
  if (!r.success || !r.data.taxId || !r.data.company?.name) return null;
  const e = r.data;
  const situacao = situacaoBonita(e.status?.text ?? "Desconhecida");
  const a = e.address;
  const fone = e.phones?.[0];
  return {
    cnpj: limparCnpj(e.taxId!),
    razaoSocial: nomeProprio(e.company!.name!),
    nomeFantasia: bonito(e.alias),
    situacao,
    ativa: situacao === "Ativa",
    situacaoDesde: dia(e.statusDate),
    abertura: dia(e.founded),
    atividade: e.mainActivity?.text?.trim() || null,
    naturezaJuridica: e.company?.nature?.text?.trim() || null,
    endereco: a?.city
      ? { logradouro: bonito(a.street), numero: a.number?.trim() || null, complemento: bonito(a.details), bairro: bonito(a.district), cidade: nomeProprio(a.city), uf: a.state?.toUpperCase() ?? null, cep: a.zip ? cepComMascara(a.zip) : null }
      : null,
    telefone: telefone(`${fone?.area ?? ""}${fone?.number ?? ""}`),
    email: e.emails?.[0]?.address?.trim().toLocaleLowerCase("pt-BR") || null,
    fonte: "CNPJá",
  };
}

const UM_DIA = 86_400_000;
const guardadas = new Map<string, { em: number; empresa: EmpresaDaReceita | null }>();

/**
 * A empresa do CNPJ. `null` quando a Receita não tem o número; erro quando
 * nenhuma das duas fontes respondeu.
 */
export async function buscarCnpj(cnpj: string, opcoes: { fetch?: typeof fetch; timeout?: number; agora?: () => number } = {}): Promise<EmpresaDaReceita | null> {
  const numero = limparCnpj(cnpj);
  const agora = (opcoes.agora ?? Date.now)();
  const guardada = guardadas.get(numero);
  if (guardada && agora - guardada.em < UM_DIA) return guardada.empresa;
  const fetchImpl = opcoes.fetch ?? fetch;
  const fontes: [string, (b: unknown) => EmpresaDaReceita | null][] = [
    [`${BRASILAPI_CNPJ_URL}/${numero}`, lerEmpresaDaBrasilApi],
    [`${CNPJA_URL}/${numero}`, lerEmpresaDoCnpja],
  ];
  let naoTem = 0;
  for (const [url, ler] of fontes) {
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opcoes.timeout ?? 8_000) });
      if (res.status === 404) {
        naoTem++;
        continue;
      }
      if (!res.ok) continue;
      const empresa = ler(await res.json().catch(() => null));
      if (!empresa) continue;
      guardar(numero, { em: agora, empresa });
      return empresa;
    } catch {
      // Tenta a próxima fonte.
    }
  }
  // As duas dizem que não existe: não existe. Uma só pode ser CNPJ novo que ela ainda não tem.
  if (naoTem === fontes.length) {
    guardar(numero, { em: agora, empresa: null });
    return null;
  }
  throw new ErroDaReceita("Nem a BrasilAPI nem o CNPJá responderam.");
}

function guardar(numero: string, valor: { em: number; empresa: EmpresaDaReceita | null }) {
  if (guardadas.size > 2_000) guardadas.delete(guardadas.keys().next().value!);
  guardadas.set(numero, valor);
}
