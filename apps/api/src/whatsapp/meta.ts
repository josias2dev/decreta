/**
 * O canal pela API oficial do WhatsApp (Meta Cloud API, na Graph API): manda as saídas do agente,
 * marca como lida, baixa a mídia que chegou e lê o webhook.
 * API: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * O token só existe em `ConfigDaMeta`, em memória, na hora do pedido. Nenhuma mensagem de erro o
 * leva, nem quando a Meta o devolve no texto do erro.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { dentroDosLimites, FalhaNoCanal, MODELOS, type Canal, type Conteudo, type Entrada, type Saida } from "./canal.ts";

export interface ConfigDaMeta {
  phoneNumberId: string;
  accessToken: string;
  /** Assina o corpo do webhook (`X-Hub-Signature-256`). */
  appSecret: string;
  /** O que a Meta manda no GET de cadastro do webhook. */
  verifyToken: string;
  /** Padrão "v23.0". */
  versao?: string;
  /** Padrão "https://graph.facebook.com". */
  graphUrl?: string;
  fetch?: typeof fetch;
}

const VERSAO = "v23.0";
const GRAPH = "https://graph.facebook.com";
const TEMPO_MAXIMO_MS = 20_000;
/** Áudio e vídeo vão até 16 MB na Meta; documento pode ir a 100 MB, mas o que passa de 25 o agente não lê. */
const TETO_DA_MIDIA_BYTES = 25 * 1024 * 1024;

type Dados = Record<string, unknown>;
type Documento = Extract<Saida, { tipo: "documento" }>;

export function canalDaMeta(config: ConfigDaMeta): Canal {
  const base = `${(config.graphUrl ?? GRAPH).replace(/\/+$/, "")}/${config.versao ?? VERSAO}`;
  const mensagens = `${base}/${config.phoneNumberId}/messages`;
  const buscar = config.fetch ?? fetch;
  const semToken = (s: string) => (config.accessToken ? s.replaceAll(config.accessToken, "[token]") : s);

  async function pedir(url: string, corpo?: Dados | FormData): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${config.accessToken}` };
    // O FormData leva o próprio Content-Type, com o boundary: não pode ser posto à mão.
    if (corpo && !(corpo instanceof FormData)) headers["Content-Type"] = "application/json";
    try {
      return await buscar(url, {
        method: corpo ? "POST" : "GET",
        headers,
        body: corpo instanceof FormData ? corpo : corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
      });
    } catch {
      throw new FalhaNoCanal("A Meta não respondeu a tempo ou a conexão caiu.", null, null);
    }
  }

  /** O pedido à Graph, com a resposta lida. A recusa vira `FalhaNoCanal` com o código da Graph (o 131047, por exemplo). */
  async function chamar(url: string, corpo?: Dados | FormData): Promise<{ dados: Dados; status: number }> {
    const res = await pedir(url, corpo);
    const dados = obj(await res.json().catch(() => null)) ?? {};
    if (res.ok) return { dados, status: res.status };
    const erro = obj(dados.error);
    const motivo = texto(erro?.message);
    const codigo = typeof erro?.code === "number" ? erro.code : null;
    throw new FalhaNoCanal(semToken(motivo ? `A Meta recusou o pedido (erro ${res.status}): ${motivo}` : `A Meta recusou o pedido (erro ${res.status}).`), codigo, res.status);
  }

  /** O documento sobe antes, e a mensagem leva só o id dele. */
  async function subir(d: Documento): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", d.mime);
    form.append("file", new Blob([Buffer.from(d.bytes)], { type: d.mime }), d.nome);
    const { dados, status } = await chamar(`${base}/${config.phoneNumberId}/media`, form);
    const id = texto(dados.id);
    if (!id) throw new FalhaNoCanal("A Meta recebeu o arquivo, mas não devolveu o id dele.", null, status);
    return id;
  }

  async function corpoDa(s: Saida): Promise<Dados> {
    const rodape = (r: string | undefined) => (r ? { footer: { text: r } } : {});
    switch (s.tipo) {
      case "texto":
        return { type: "text", text: { body: s.texto, preview_url: false } };
      case "botoes":
        return { type: "interactive", interactive: { type: "button", body: { text: s.texto }, ...rodape(s.rodape), action: { buttons: s.botoes.map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo } })) } } };
      case "lista":
        return {
          type: "interactive",
          interactive: {
            type: "list",
            body: { text: s.texto },
            ...rodape(s.rodape),
            action: { button: s.botao, sections: [{ title: "Opções", rows: s.itens.map((i) => ({ id: i.id, title: i.titulo, ...(i.descricao ? { description: i.descricao } : {}) })) }] },
          },
        };
      case "link":
        return { type: "interactive", interactive: { type: "cta_url", body: { text: s.texto }, ...rodape(s.rodape), action: { name: "cta_url", parameters: { display_text: s.rotulo, url: s.url } } } };
      case "documento":
        return { type: "document", document: { id: await subir(s), filename: s.nome, ...(s.legenda ? { caption: s.legenda } : {}) } };
      case "modelo": {
        const componentes = [
          ...(s.parametros.length ? [{ type: "body", parameters: s.parametros.map((text) => ({ type: "text", text })) }] : []),
          ...(s.botoes ?? []).map((payload, i) => ({ type: "button", sub_type: "quick_reply", index: String(i), parameters: [{ type: "payload", payload }] })),
          // O botão de copiar do modelo de autenticação é de link: leva o mesmo código do corpo.
          ...("copiarCodigo" in MODELOS[s.nome] ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: s.parametros[0] ?? "" }] }] : []),
        ];
        // Modelo sem variável e sem botão vai sem `components`.
        return { type: "template", template: { name: s.nome, language: { code: "pt_BR" }, ...(componentes.length ? { components: componentes } : {}) } };
      }
    }
  }

  return {
    async enviar(para, saida, opcoes) {
      const corpo = await corpoDa(dentroDosLimites(saida));
      const citada = opcoes?.responde ? { context: { message_id: opcoes.responde } } : {};
      const { dados, status } = await chamar(mensagens, { messaging_product: "whatsapp", recipient_type: "individual", to: para.telefone, ...citada, ...corpo });
      const wamid = texto(obj(lista(dados.messages)[0])?.id);
      if (!wamid) throw new FalhaNoCanal("A Meta aceitou a mensagem, mas não devolveu o id dela.", null, status);
      return { wamid };
    },

    async marcarLido(wamid) {
      await chamar(mensagens, { messaging_product: "whatsapp", status: "read", message_id: wamid, typing_indicator: { type: "text" } });
    },

    async baixarMidia(id) {
      const { dados } = await chamar(`${base}/${encodeURIComponent(id)}`);
      const url = texto(dados.url);
      // O link leva o token junto: só por https.
      if (!url?.startsWith("https://")) throw new FalhaNoCanal(`A Meta não devolveu o link da mídia ${id}.`, null, null);
      if (Number(dados.file_size) > TETO_DA_MIDIA_BYTES) throw muitoGrande(id);
      const res = await pedir(url);
      if (!res.ok) throw new FalhaNoCanal(`Não deu para baixar a mídia ${id} (erro ${res.status}).`, null, res.status);
      const bytes = await lerComTeto(res, id);
      return { bytes, mime: texto(dados.mime_type) ?? res.headers.get("content-type") ?? "application/octet-stream" };
    },
  };
}

const muitoGrande = (id: string) => new FalhaNoCanal(`A mídia ${id} passa de 25 MB e não foi baixada.`, null, null);

/** Lê a resposta até o teto, sem confiar no tamanho anunciado. */
async function lerComTeto(res: Response, id: string): Promise<Uint8Array> {
  if (Number(res.headers.get("content-length") ?? 0) > TETO_DA_MIDIA_BYTES) throw muitoGrande(id);
  const leitor = res.body?.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    while (leitor) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.length;
      if (total > TETO_DA_MIDIA_BYTES) {
        await leitor.cancel();
        throw muitoGrande(id);
      }
      partes.push(value);
    }
  } catch (e) {
    // O tempo pode acabar no meio do download: quem chama só conhece `FalhaNoCanal`.
    if (e instanceof FalhaNoCanal) throw e;
    throw new FalhaNoCanal(`O download da mídia ${id} foi interrompido.`, null, null);
  }
  return Buffer.concat(partes);
}

/** O POST do webhook veio da Meta? HMAC-SHA256 do corpo cru com o app secret, no formato `sha256=<hex>`. */
export function assinaturaConfere(corpoCru: string, cabecalho: string | null | undefined, appSecret: string): boolean {
  if (!appSecret || !cabecalho?.startsWith("sha256=")) return false;
  const recebida = Buffer.from(cabecalho.slice("sha256=".length).trim().toLowerCase());
  const esperada = Buffer.from(createHmac("sha256", appSecret).update(corpoCru).digest("hex"));
  // O tamanho não é segredo (são sempre 64 caracteres); o conteúdo é comparado em tempo constante.
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}

/** O GET de cadastro do webhook (`hub.mode`, `hub.verify_token`, `hub.challenge`): o challenge volta só se o token confere. */
export function respostaDoDesafio(query: { mode?: string; token?: string; challenge?: string }, verifyToken: string): string | null {
  if (!verifyToken || query.mode !== "subscribe" || !query.token || !query.challenge) return null;
  // Os hashes têm o mesmo tamanho, então a comparação não depende do tamanho do token.
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(query.token), h(verifyToken)) ? query.challenge : null;
}

/* ---------------- O webhook ---------------- */

const obj = (x: unknown): Dados | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Dados) : null);
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const texto = (x: unknown): string | null => (typeof x === "string" && x ? x : null);
const soDigitos = (x: unknown): string | null => {
  const t = texto(x);
  return t && /^\d+$/.test(t) ? t : null;
};
/** O `timestamp` da Meta é em segundos, como texto. */
const quando = (x: unknown): Date | null => {
  const n = typeof x === "string" || typeof x === "number" ? Number(x) : NaN;
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};
/** O id do usuário por empresa (BSUID). A Meta ainda não fixou o nome do campo no contato: vale qualquer um destes. */
const bsuidDo = (c: Dados | undefined): string | null => texto(c?.user_id) ?? texto(c?.bsuid);

/**
 * O que chegou no webhook, já lido. Só o lote do nosso número; o que não dá para ler é ignorado
 * (nunca lança). Status que o Decreta não usa ("played", "deleted"...) também ficam de fora.
 */
export function lerWebhook(corpo: unknown, phoneNumberId: string): Entrada[] {
  return lista(obj(corpo)?.entry).flatMap((entry) =>
    lista(obj(entry)?.changes).flatMap((change): Entrada[] => {
      const c = obj(change);
      const value = obj(c?.value);
      if (c?.field !== "messages" || !value || texto(obj(value.metadata)?.phone_number_id) !== phoneNumberId) return [];
      const contatos = lista(value.contacts)
        .map(obj)
        .filter((x) => x !== null);
      return [...lista(value.messages).flatMap((m) => mensagemDo(obj(m), contatos) ?? []), ...lista(value.statuses).flatMap((s) => statusDo(obj(s)) ?? [])];
    }),
  );
}

function mensagemDo(m: Dados | null, contatos: Dados[]): Entrada | null {
  const wamid = texto(m?.id);
  const em = quando(m?.timestamp);
  const conteudo = m ? conteudoDa(m) : null;
  if (!m || !wamid || !em || !conteudo) return null;
  const de = remetente(m, contatos);
  // Sem telefone e sem BSUID não há a quem responder.
  if (!de.telefone && !de.bsuid) return null;
  return { tipo: "mensagem", wamid, de, em, responde: texto(obj(m.context)?.id), conteudo };
}

function remetente(m: Dados, contatos: Dados[]): { telefone: string | null; bsuid: string | null; nome: string | null } {
  const doUsuario = texto(m.from_user_id);
  const contato =
    contatos.length === 1 ? contatos[0] : contatos.find((c) => (texto(c.wa_id) !== null && c.wa_id === m.from) || (bsuidDo(c) !== null && bsuidDo(c) === (doUsuario ?? m.from)));
  const telefone = soDigitos(m.from) ?? soDigitos(contato?.wa_id);
  // Quem usa nome de usuário pode chegar sem telefone: um `from` que não é número só pode ser o BSUID.
  const bsuid = doUsuario ?? bsuidDo(contato) ?? (soDigitos(m.from) ? null : texto(m.from));
  return { telefone, bsuid, nome: texto(obj(contato?.profile)?.name) };
}

function conteudoDa(m: Dados): Conteudo | null {
  const tipo = texto(m.type);
  switch (tipo) {
    case null:
      return null;
    case "text": {
      const t = texto(obj(m.text)?.body);
      return t ? { tipo: "texto", texto: t } : null;
    }
    case "interactive": {
      const i = obj(m.interactive);
      const r = obj(i?.button_reply) ?? obj(i?.list_reply);
      // Outros interativos (resposta de flow, por exemplo) o Decreta não manda, então não trata.
      if (!r) return { tipo: "outro", nome: tipo };
      const id = texto(r.id);
      return id ? { tipo: "escolha", id, titulo: texto(r.title) ?? "" } : null;
    }
    case "button": {
      // O toque num botão de resposta rápida de modelo: o payload é o que o Decreta pôs no envio.
      const b = obj(m.button);
      const id = texto(b?.payload);
      return id ? { tipo: "escolha", id, titulo: texto(b?.text) ?? "" } : null;
    }
    case "audio":
      return midia(m, tipo, "audio");
    case "image":
      return midia(m, tipo, "imagem");
    case "document":
      return midia(m, tipo, "documento");
    case "video":
      return midia(m, tipo, "video");
    case "sticker":
      return midia(m, tipo, "figurinha");
    case "reaction": {
      // O 👎 numa resposta marca a resposta para revisão. Tirar a reação chega sem emoji.
      const r = obj(m.reaction);
      const wamid = texto(r?.message_id);
      return wamid ? { tipo: "reacao", emoji: texto(r?.emoji), wamid } : { tipo: "outro", nome: tipo };
    }
    default:
      return { tipo: "outro", nome: tipo };
  }
}

function midia(m: Dados, chave: string, qual: Extract<Conteudo, { tipo: "midia" }>["midia"]): Conteudo | null {
  const d = obj(m[chave]);
  const id = texto(d?.id);
  if (!d || !id) return null;
  return { tipo: "midia", midia: qual, id, mime: texto(d.mime_type) ?? "application/octet-stream", nome: texto(d.filename), legenda: texto(d.caption), voz: qual === "audio" && !!d.voice };
}

const STATUS = new Map<string, Extract<Entrada, { tipo: "status" }>["status"]>([
  ["sent", "enviada"],
  ["delivered", "entregue"],
  ["read", "lida"],
  ["failed", "falhou"],
]);

function statusDo(s: Dados | null): Entrada | null {
  const wamid = texto(s?.id);
  const status = STATUS.get(texto(s?.status) ?? "");
  const em = quando(s?.timestamp);
  if (!s || !wamid || !status || !em) return null;
  const e = obj(lista(s.errors)[0]);
  return {
    tipo: "status",
    wamid,
    status,
    em,
    para: texto(s.recipient_id),
    // A Meta sempre manda o código do erro; se faltar, fica 0.
    erro: e ? { codigo: Number(e.code) || 0, titulo: texto(e.title) ?? texto(e.message) ?? "" } : null,
    categoria: texto(obj(s.pricing)?.category),
  };
}
