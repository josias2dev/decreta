/**
 * Cliente da API das telas. A sessão vai no cookie do Better Auth; no dev o
 * Vite faz proxy de `/api`. No servidor a própria API serve as telas
 * (`WEB_DIST`), então fica na mesma origem.
 */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ?? code);
  }
}

type Pedido = { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal };

export const api = <T>(path: string, init: Pedido = {}) => request<T>(`/api/app${path}`, init);

function opcoes(init: Pedido): RequestInit {
  return {
    method: init.method ?? (init.form || init.json !== undefined ? "POST" : "GET"),
    credentials: "include",
    headers: init.json !== undefined ? { "content-type": "application/json" } : undefined,
    // FormData leva o próprio content-type (com o boundary do multipart).
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    signal: init.signal,
  };
}

async function request<T>(path: string, init: Pedido): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, opcoes(init));
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { erro?: string; detalhe?: string; motivo?: string } | null;
  if (!res.ok) throw new ApiError(res.status, body?.erro ?? `http_${res.status}`, body?.detalhe ?? body?.motivo);
  return body as T;
}

/**
 * Resposta que chega aos poucos (peça, chat, Perguntar): chama `aoChegar` com
 * o texto acumulado e devolve a resposta inteira e os cabeçalhos.
 */
export async function aosPoucos(path: string, init: Pedido, aoChegar: (texto: string) => void): Promise<{ texto: string; headers: Headers }> {
  const res = await fetch(`${API_URL}/api/app${path}`, opcoes(init));
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { erro?: string; detalhe?: string; motivo?: string } | null;
    throw new ApiError(res.status, body?.erro ?? `http_${res.status}`, body?.detalhe ?? body?.motivo);
  }
  const leitor = res.body?.getReader();
  const decod = new TextDecoder();
  let texto = "";
  if (leitor) {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      texto += decod.decode(value, { stream: true });
      aoChegar(texto);
    }
  }
  texto += decod.decode();
  aoChegar(texto);
  return { texto, headers: res.headers };
}

/** Mensagem que a tela mostra quando a API recusa. */
export function mensagemDoErro(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "dados_invalidos") {
      // "campo: mensagem; ...": só a mensagem escrita por nós vai para a tela; as do zod (em inglês) viram um aviso geral.
      const msg = err.detail?.split("; ")[0]?.replace(/^[\w.]+: /, "") ?? "";
      return msg && !/^(Too|Invalid|Expected|Required|Unrecognized)/.test(msg) ? msg : "Confira os campos.";
    }
    if (err.detail) return err.detail;
    const MENSAGENS: Record<string, string> = {
      ia_desligada: "A IA ainda não está ligada neste escritório.",
      nao_encontrado: "Não encontrei. Pode ter sido apagado.",
      processo_nao_encontrado: "Processo não encontrado.",
      cliente_nao_encontrado: "Cliente não encontrado.",
      so_socios: "Só quem é sócio pode fazer isso.",
      cnj_invalido: "Confira o número do processo: os dígitos verificadores não batem.",
      processo_existe: "Já existe um processo com este número.",
      cliente_existe: "Já existe um cliente com este CPF ou CNPJ.",
      documento_invalido: "Confira o CPF ou CNPJ.",
      whatsapp_invalido: "Confira o número do WhatsApp, com DDD.",
      arquivo_grande: "O arquivo passa do tamanho máximo.",
      tipo_nao_aceito: "Este tipo de arquivo não é aceito. Envie PDF, DOCX, imagem ou texto.",
      logo_png: "O logo precisa ser um PNG.",
      logo_grande: "O logo passa de 1 MB.",
    };
    return MENSAGENS[err.code] ?? (err.status >= 500 ? "Não deu certo agora. Tente de novo em instantes." : "Confira os dados e tente de novo.");
  }
  return "Sem conexão com o servidor. Confira a internet e tente de novo.";
}
