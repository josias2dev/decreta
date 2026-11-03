/**
 * O cliente da ZapSign, com a conta do próprio escritório (a chave dele, no ambiente que ele
 * escolheu). Cobre só o que o Decreta usa: mandar um documento para assinar (contrato de
 * honorários, procuração, termo de IA), consultar a situação e buscar o arquivo assinado.
 * API: https://docs.zapsign.com.br
 *
 * A chave só existe em `ContaZapSign`, em memória, na hora do pedido. Nenhuma mensagem de
 * erro, log ou resposta a leva. O sandbox da ZapSign não tem validade jurídica.
 */
import type { Signatario } from "@decreta/db";

export interface ContaZapSign {
  chave: string;
  ambiente: "sandbox" | "producao";
  fetch?: typeof fetch;
}

const BASE = { sandbox: "https://sandbox.api.zapsign.com.br/api/v1", producao: "https://api.zapsign.com.br/api/v1" } as const;
const TEMPO_MAXIMO_MS = 30_000;

export class ZapSignErro extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ZapSignErro";
  }
}

async function chamar<T>(conta: ContaZapSign, metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await (conta.fetch ?? fetch)(`${BASE[conta.ambiente]}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${conta.chave}`, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
  } catch {
    throw new ZapSignErro(0, "A ZapSign não respondeu a tempo. Tente de novo em alguns minutos.");
  }
  if (res.ok) return ((await res.json().catch(() => null)) ?? {}) as T;
  if (res.status === 401 || res.status === 403) throw new ZapSignErro(res.status, "A ZapSign recusou a chave. Confira se ela é do ambiente escolhido (produção ou sandbox) e se o plano tem API.");
  throw new ZapSignErro(res.status, `A ZapSign não aceitou o pedido (erro ${res.status}).`);
}

export interface PedidoDeAssinatura {
  nome: string;
  arquivo: { tipo: "pdf" | "docx"; bytes: Uint8Array };
  /** O id do documento no Decreta. */
  referencia: string;
  signatarios: { nome: string; email?: string; telefone?: string }[];
}

export interface DocumentoNaZapSign {
  token: string;
  situacao: string;
  signatarios: Signatario[];
}

interface SignerDaZapSign {
  name: string;
  email?: string;
  token?: string;
  sign_url?: string;
  status?: string;
}

const signatarioDe = (s: SignerDaZapSign, dado?: { email?: string; telefone?: string }): Signatario => ({
  nome: s.name,
  ...(dado?.email ? { email: dado.email } : {}),
  ...(dado?.telefone ? { telefone: dado.telefone } : {}),
  situacao: s.status ?? "new",
  ...(s.sign_url ? { link: s.sign_url } : {}),
});

/** Manda o documento para assinar. A ZapSign avisa cada pessoa por e-mail (e pelo WhatsApp, se tiver o telefone). */
export async function criarDocumentoParaAssinar(conta: ContaZapSign, p: PedidoDeAssinatura): Promise<DocumentoNaZapSign> {
  const r = await chamar<{ token: string; status: string; signers?: SignerDaZapSign[] }>(conta, "POST", "/docs/", {
    name: p.nome,
    [p.arquivo.tipo === "docx" ? "base64_docx" : "base64_pdf"]: Buffer.from(p.arquivo.bytes).toString("base64"),
    lang: "pt-br",
    external_id: p.referencia,
    signers: p.signatarios.map((s) => ({
      name: s.nome,
      ...(s.email ? { email: s.email } : {}),
      auth_mode: "assinaturaTela",
      send_automatic_email: !!s.email,
      send_automatic_whatsapp: !!s.telefone,
      ...(s.telefone ? { phone_country: "55", phone_number: s.telefone } : {}),
    })),
  });
  return {
    token: r.token,
    situacao: r.status,
    // A ZapSign devolve os signatários na ordem do pedido.
    signatarios: (r.signers ?? []).map((s, i) => signatarioDe(s, p.signatarios[i])),
  };
}

export interface SituacaoNaZapSign {
  /** "pending" ou "signed". */
  situacao: string;
  /** O link do arquivo assinado: temporário (dura uma hora). Nulo enquanto falta alguém assinar. */
  arquivoAssinado: string | null;
  signatarios: Pick<Signatario, "nome" | "situacao" | "link">[];
}

export async function consultarDocumento(conta: ContaZapSign, token: string): Promise<SituacaoNaZapSign> {
  const r = await chamar<{ status: string; signed_file?: string | null; signers?: SignerDaZapSign[] }>(conta, "GET", `/docs/${encodeURIComponent(token)}/`);
  return {
    situacao: r.status,
    arquivoAssinado: r.signed_file ?? null,
    signatarios: (r.signers ?? []).map((s) => ({ nome: s.name, situacao: s.status ?? "new", ...(s.sign_url ? { link: s.sign_url } : {}) })),
  };
}

/** O bucket dos arquivos, o único host que a documentação mostra em `signed_file` (docs.zapsign.com.br, "Detalhar documento"). */
const HOST_DOS_ARQUIVOS = "zapsign.s3.amazonaws.com";
/** Um contrato assinado é um PDF de páginas, com o relatório de assinaturas: isto é folga, e não o limite de um arquivo normal. */
export const TETO_DO_ARQUIVO_ASSINADO_BYTES = 100 * 1024 * 1024;
const VOLTAS_DE_REDIRECIONAMENTO = 3;

function linkDaZapSign(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ZapSignErro(0, "O link do arquivo assinado não é um endereço, e não foi baixado.");
  }
  const daZapSign = u.hostname === HOST_DOS_ARQUIVOS || u.hostname === "zapsign.com.br" || u.hostname.endsWith(".zapsign.com.br");
  // A mensagem diz o host, para achar o problema pelo log. O link inteiro, não: ele leva a assinatura que abre o arquivo.
  if (u.protocol !== "https:" || u.port || u.username || u.password || !daZapSign) throw new ZapSignErro(0, `O link do arquivo assinado não é da ZapSign (${u.protocol}//${u.host}), e não foi baixado.`);
  return u;
}

/** Lê a resposta até o teto, sem confiar no tamanho anunciado. */
async function lerComTeto(res: Response): Promise<Uint8Array> {
  const muitoGrande = () => new ZapSignErro(0, "O arquivo assinado passa do tamanho aceito, e não foi baixado.");
  if (Number(res.headers.get("content-length") ?? 0) > TETO_DO_ARQUIVO_ASSINADO_BYTES) throw muitoGrande();
  const leitor = res.body?.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (leitor) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > TETO_DO_ARQUIVO_ASSINADO_BYTES) {
      await leitor.cancel();
      throw muitoGrande();
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

/** Baixa o arquivo assinado do link temporário. Sem a chave: o link já vem assinado. O link vem de fora: só da ZapSign, sem seguir redirecionamento para outro lugar, e só PDF. */
export async function baixarArquivoAssinado(url: string, buscar: typeof fetch = fetch): Promise<Uint8Array> {
  let alvo = linkDaZapSign(url);
  for (let volta = 0; volta <= VOLTAS_DE_REDIRECIONAMENTO; volta++) {
    const res = await buscar(alvo.href, { redirect: "manual", signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) }).catch(() => null);
    const destino = res && res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (destino) {
      alvo = linkDaZapSign(new URL(destino, alvo).href);
      continue;
    }
    if (!res?.ok) throw new ZapSignErro(res?.status ?? 0, "Não deu para baixar o arquivo assinado agora. Tente de novo em alguns minutos.");
    const bytes = await lerComTeto(res);
    if (Buffer.from(bytes.subarray(0, 4)).toString("latin1") !== "%PDF") throw new ZapSignErro(0, "O que a ZapSign devolveu como arquivo assinado não é um PDF, e não foi guardado.");
    return bytes;
  }
  throw new ZapSignErro(0, "O link do arquivo assinado redirecionou vezes demais, e não foi baixado.");
}
