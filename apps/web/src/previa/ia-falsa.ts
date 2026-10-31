/**
 * A IA de mentira da prévia, no Perguntar: responde aos poucos como a de
 * verdade (pensa, consulta, escreve em pedaços), com os resultados das
 * amostras, e o Parar corta a resposta como a rede corta. As conversas novas
 * (e as de amostra que ganham pergunta) ficam guardadas enquanto a prévia está
 * aberta, gravadas como o servidor grava: a resposta com o id do "inicio" e,
 * se a pessoa parou, com o aviso no fim.
 */
type Amostra = { path: string; corpo: any };
type Parte = { tipo: "texto"; texto: string } | { tipo: "ferramenta"; id: string; nome: string; entrada: unknown; saida?: unknown; erro?: string };
type Mensagem = { id: string; papel: "pessoa" | "ia"; texto: string; partes: Parte[] | null; em: string };
type Conversa = { rodape: string; conversa: { id: string; titulo: string; modo: string; fixada: boolean; criadaEm: string; atualizadaEm: string; processo: unknown }; mensagens: Mensagem[] };
type Roteiro = { titulo: string; ferramentas: { nome: string; entrada: unknown; saida: unknown }[]; texto: string };

const porArquivo = import.meta.glob<Amostra>("../../e2e/amostras/*.json", { eager: true, import: "default" });
const amostras = Object.values(porArquivo);
const amostra = (path: string) => amostras.find((a) => a.path === path)?.corpo;
const daAmostra = (id: string) => amostras.find((a) => a.path === `/ia/conversas/${id}`)?.corpo as Conversa | undefined;
const conversasDaAmostra = (amostra("/ia/conversas") as { conversas: Conversa["conversa"][] }).conversas;

const PAROU = "[Você parou a resposta aqui.]";
const RODAPE = "Gerado por IA. Confira nos autos.";
const guardadas = new Map<string, Conversa>();
const apagadas = new Set<string>();
const agora = () => new Date().toISOString();
/** Um uuid v4 (o crypto.randomUUID só existe em https, e a prévia pode abrir de outro jeito). */
const novoId = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const json = (status: number, dados: unknown) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });
const textoDe = (partes: Parte[]) => partes.flatMap((p) => (p.tipo === "texto" ? [p.texto] : [])).join("\n\n");
const reais = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/* ---------- As respostas: das conversas de amostra ou montadas com os dados das amostras ---------- */

/** A resposta da IA numa conversa de amostra (e2e/amostras/<arquivo>.json, a n-ésima resposta dela). */
function daConversa(titulo: string, arquivo: string, n = 0): Roteiro {
  const c = porArquivo[`../../e2e/amostras/${arquivo}.json`]?.corpo as Conversa | undefined;
  const partes = c?.mensagens.filter((m) => m.papel === "ia")[n]?.partes ?? [];
  return {
    titulo,
    ferramentas: partes.flatMap((p) => (p.tipo === "ferramenta" ? [{ nome: p.nome, entrada: p.entrada, saida: p.saida }] : [])),
    texto: textoDe(partes),
  };
}

/** O panorama do "Como está o meu dia", da resposta de amostra (perguntarEventos). */
function panorama(): Roteiro {
  const eventos = amostra("/ia/perguntar?eventos") as { t: string; nome?: string; entrada?: unknown; saida?: unknown; v?: string }[];
  return {
    titulo: "Resumo do dia",
    ferramentas: eventos.flatMap((e) => (e.t === "resultado" ? [{ nome: e.nome!, entrada: {}, saida: e.saida }] : [])),
    texto: eventos.flatMap((e) => (e.t === "texto" ? [e.v!] : [])).join(""),
  };
}

const rotuloDoDia = (dia: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${dia}T12:00:00Z`))
    .replace(/\.$/, "")
    .replace(/ de /g, " ");

/** A agenda da tela de Agenda, dos próximos 7 dias, no formato do verAgenda. */
function agenda(): Roteiro {
  const a = amostra("/agenda") as { hoje: string; dias: { dia: string; itens: any[] }[] };
  const ate = new Date(Date.parse(`${a.hoje}T12:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
  const dias = a.dias
    .filter((d) => d.dia <= ate)
    .map((d) => ({
      dia: d.dia,
      rotulo: rotuloDoDia(d.dia),
      itens: d.itens.map((i) =>
        i.tipo === "audiencia"
          ? { tipo: "audiencia", id: i.id, hora: i.hora, titulo: i.titulo, porVideo: i.porVideo, situacao: i.situacao ?? "marcada", processo: i.processo }
          : i.tipo === "prazo"
            ? { tipo: "prazo", id: i.id, titulo: i.titulo, urgencia: i.urgencia, processo: i.processo }
            : { tipo: "tarefa", id: i.id, titulo: i.titulo, concluida: i.concluida, processo: null },
      ),
    }));
  const itens = dias.flatMap((d) => d.itens);
  const conta = (t: string) => itens.filter((i) => i.tipo === t).length;
  const cheio = [...dias].sort((x, y) => y.itens.length - x.itens.length)[0]!;
  return {
    titulo: "Agenda dos próximos 7 dias",
    ferramentas: [{ nome: "verAgenda", entrada: { de: a.hoje, ate }, saida: { dias } }],
    texto:
      `Nos próximos 7 dias a agenda do escritório tem **${plural(conta("audiencia"), "audiência", "audiências")}**, **${plural(conta("prazo"), "prazo", "prazos")}** e **${plural(conta("tarefa"), "tarefa", "tarefas")}**.\n\n` +
      `O dia mais cheio é ${cheio.rotulo}, com ${plural(cheio.itens.length, "compromisso", "compromissos")}. Hoje há ${plural(dias[0]?.itens.length ?? 0, "item", "itens")}: comece pelas audiências da tarde e pelos prazos que vencem hoje.`,
  };
}

/** As publicações novas da caixa de entrada, no formato do buscarPublicacoes. */
function publicacoes(): Roteiro {
  const p = amostra("/publicacoes") as { itens: { id: string; titulo: string; disponibilizadaEm: string; partes: string; processoId: string | null; selo: { tipo: string; texto: string } }[] };
  const itens = p.itens.map((x) => ({
    id: x.id,
    disponibilizadaEm: x.disponibilizadaEm,
    publicadaEm: x.disponibilizadaEm,
    tipo: x.titulo,
    orgao: null,
    cnj: null,
    processo: x.processoId ? { id: x.processoId, titulo: x.partes, cnj: null } : null,
    situacao: "nova",
    resumo: x.selo.texto,
    teor: "",
  }));
  const comPrazo = p.itens.filter((x) => x.selo.tipo === "prazo");
  return {
    titulo: "Publicações novas",
    ferramentas: [{ nome: "buscarPublicacoes", entrada: { situacao: "nova" }, saida: { total: itens.length, itens } }],
    texto:
      `Chegaram **${plural(itens.length, "publicação nova", "publicações novas")}**. ${plural(comPrazo.length, "pede", "pedem")} prazo:\n\n` +
      comPrazo.map((x) => `- **${x.titulo}** em ${x.partes}: ${x.selo.texto.toLowerCase()}.`).join("\n") +
      `\n\nAs outras não geram prazo ou estão sem o teor. Abra cada uma para confirmar o prazo sugerido.`,
  };
}

/** Os alvarás que ainda não foram repassados, no formato do buscarAlvaras. */
function alvaras(): Roteiro {
  const a = amostra("/alvaras") as { totais: { pendente: string }; etapas: { etapa: string; itens: any[] }[] };
  const itens = a.etapas
    .filter((e) => ["novo", "aguardando_saque", "sacado"].includes(e.etapa))
    .flatMap((e) => e.itens.map((i) => ({ id: i.id, descricao: i.descricao, valor: i.valor, valorRecebido: i.valorRecebido, etapa: e.etapa, expedidoEm: i.expedidoEm, processo: i.processo })));
  const maior = [...itens].sort((x, y) => Number(y.valor) - Number(x.valor))[0];
  return {
    titulo: "Alvarás sem repasse",
    ferramentas: [{ nome: "buscarAlvaras", entrada: {}, saida: { total: itens.length, valorTotal: a.totais.pendente, itens } }],
    texto:
      `Há **${plural(itens.length, "alvará", "alvarás")}** ainda sem repasse ao cliente, somando **${reais(Number(a.totais.pendente))}**.` +
      (maior ? `\n\nO maior é o de [${maior.processo.titulo}](/processos/${maior.processo.id}): ${reais(Number(maior.valor))}, ${maior.descricao.toLowerCase()}.` : ""),
  };
}

function escolher(texto: string, modo: string): Roteiro {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (modo === "jurisprudencia") return daConversa("Pesquisa de jurisprudência", "conversaJurisprudencia");
  if (/contar|uteis|corridos|vence quando/.test(t)) return daConversa("Contagem de prazo", "conversaContagem");
  if (/agenda|o que tenho|minha semana/.test(t)) return agenda();
  if (/lembr|tarefa|ligar/.test(t)) return daConversa("Tarefa para amanhã", "conversaProcesso", 1);
  if (/publica/.test(t)) return publicacoes();
  if (/alvara/.test(t)) return alvaras();
  if (/processo|em que pe|autos|marina/.test(t)) return daConversa("Processo da Marina Duarte", "conversaProcesso");
  if (/audiencia/.test(t)) return daConversa("Audiências da semana", "conversaSemana", 1);
  if (/prazo|venc/.test(t)) return daConversa("Prazos dos próximos 7 dias", "conversaSemana");
  return panorama();
}

/** Pedaços de 3 a 12 letras, como a IA manda. */
function pedacos(texto: string): string[] {
  const saida: string[] = [];
  for (let i = 0; i < texto.length; ) {
    const n = 3 + Math.floor(Math.random() * 10);
    saida.push(texto.slice(i, i + n));
    i += n;
  }
  return saida;
}

/* ---------- O POST /ia/perguntar ---------- */

function responder(corpo: { texto?: string; modo?: string; conversaId?: string | null; refazer?: string }, signal: AbortSignal | null | undefined): Response {
  const modo = corpo.modo === "jurisprudencia" ? "jurisprudencia" : "pergunte";
  let conversa = corpo.conversaId ? abrir(corpo.conversaId) : undefined;
  if (corpo.conversaId && !conversa) return json(404, { erro: "nao_encontrado", detalhe: "Conversa não encontrada." });
  const nova = !conversa;
  if (!conversa) {
    const titulo = (corpo.texto ?? "").replace(/[?.!]+$/, "").slice(0, 60) || "Conversa";
    conversa = { rodape: RODAPE, conversa: { id: novoId(), titulo, modo, fixada: false, criadaEm: agora(), atualizadaEm: agora(), processo: null }, mensagens: [] };
  }
  const c = conversa;
  guardadas.set(c.conversa.id, c);
  let pergunta: Mensagem;
  if (corpo.refazer) {
    // Refazer: a mesma pergunta (a última), sem gravar outra; a resposta cortada sai.
    const i = c.mensagens.findIndex((m) => m.id === corpo.refazer && m.papel === "pessoa");
    if (i < 0) return json(400, { erro: "pedido_invalido", detalhe: "Essa pergunta não está nesta conversa." });
    pergunta = c.mensagens[i]!;
    c.mensagens.splice(i + 1);
  } else {
    if (!corpo.texto?.trim()) return json(400, { erro: "pedido_invalido", detalhe: "Escreva a pergunta." });
    pergunta = { id: novoId(), papel: "pessoa", texto: corpo.texto.trim(), partes: null, em: agora() };
    c.mensagens.push(pergunta);
  }
  const respostaId = novoId();
  const roteiro = escolher(pergunta.texto, modo);
  const partes: Parte[] = [];
  let gravada = false;
  const gravar = (parou: boolean) => {
    if (gravada) return;
    gravada = true;
    // Como o servidor: a consulta sem resultado fica com erro, e a parada ganha o aviso.
    const finais: Parte[] = partes.map((p) => (p.tipo === "ferramenta" && p.saida === undefined && !p.erro ? { ...p, saida: null, erro: "Parou antes de terminar." } : p));
    if (parou) finais.push({ tipo: "texto", texto: PAROU });
    c.mensagens.push({ id: respostaId, papel: "ia", texto: textoDe(finais), partes: finais, em: agora() });
    c.conversa.atualizadaEm = agora();
  };

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let parou = false;
      const mandar = (e: unknown) => ctrl.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
      const aoParar = () => {
        if (parou) return;
        parou = true;
        gravar(true);
        try {
          ctrl.error(new DOMException("A pessoa parou a resposta.", "AbortError"));
        } catch {
          // já fechou
        }
      };
      if (signal?.aborted) return aoParar();
      signal?.addEventListener("abort", aoParar);
      mandar({ t: "inicio", conversa: { id: c.conversa.id, titulo: c.conversa.titulo, modo: c.conversa.modo }, pergunta: { id: pergunta.id }, resposta: { id: respostaId } });
      await esperar(900);
      for (const [n, f] of roteiro.ferramentas.entries()) {
        if (parou) return;
        // Único na conversa, como o id que a IA de verdade dá (o "Agora não" da tarefa guarda por ele).
        const id = `chamada-${respostaId}-${n}`;
        partes.push({ tipo: "ferramenta", id, nome: f.nome, entrada: f.entrada });
        mandar({ t: "ferramenta", id, nome: f.nome, entrada: f.entrada });
        await esperar(f.nome === "lerProcesso" ? 2200 : 1100);
        if (parou) return;
        partes[partes.length - 1] = { tipo: "ferramenta", id, nome: f.nome, entrada: f.entrada, saida: f.saida };
        mandar({ t: "resultado", id, nome: f.nome, saida: f.saida });
        await esperar(300);
      }
      for (const v of pedacos(roteiro.texto)) {
        if (parou) return;
        const ultima = partes.at(-1);
        if (ultima?.tipo === "texto") ultima.texto += v;
        else partes.push({ tipo: "texto", texto: v });
        mandar({ t: "texto", v });
        await esperar(25 + Math.random() * 45);
      }
      if (parou) return;
      signal?.removeEventListener("abort", aoParar);
      gravar(false);
      mandar({ t: "fim", mensagem: { id: respostaId } });
      if (nova) {
        // O nome da conversa vem depois, como a IA de verdade dá.
        await esperar(500);
        c.conversa.titulo = roteiro.titulo;
        mandar({ t: "titulo", v: roteiro.titulo });
      }
      ctrl.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } });
}

/** A conversa guardada nesta visita, ou a de amostra (copiada, para poder ganhar perguntas). */
function abrir(id: string): Conversa | undefined {
  if (apagadas.has(id)) return undefined;
  const g = guardadas.get(id);
  if (g) return g;
  const a = daAmostra(id);
  return a && (structuredClone(a) as Conversa);
}

/** As rotas do Perguntar na prévia; o resto fica com a API de mentira de sempre. */
export async function atenderPerguntar(metodo: string, caminho: string, busca: URLSearchParams, pedido: Request, signal?: AbortSignal | null): Promise<Response | undefined> {
  if (metodo === "POST" && caminho === "/ia/perguntar") return responder((await pedido.json().catch(() => ({}))) as Parameters<typeof responder>[0], signal ?? pedido.signal);
  if (metodo === "GET" && caminho === "/ia/conversas") {
    const termo = (busca.get("busca") ?? "").toLowerCase();
    const novas = [...guardadas.values()].map((c) => c.conversa).sort((x, y) => y.atualizadaEm.localeCompare(x.atualizadaEm));
    const todas = [...novas, ...conversasDaAmostra.filter((k) => !guardadas.has(k.id))].filter((k) => !apagadas.has(k.id) && (!termo || k.titulo.toLowerCase().includes(termo)));
    return json(200, { conversas: todas });
  }
  const uma = /^\/ia\/conversas\/([0-9a-f-]{36})$/.exec(caminho);
  if (!uma) return undefined;
  const id = uma[1]!;
  const c = abrir(id);
  if (!c) return json(404, { erro: "nao_encontrado", detalhe: "Conversa não encontrada." });
  if (metodo === "GET") return json(200, c);
  if (metodo === "DELETE") {
    guardadas.delete(id);
    apagadas.add(id);
    return json(200, { ok: true });
  }
  if (metodo === "PATCH") {
    const b = (await pedido.json().catch(() => ({}))) as { titulo?: string; fixada?: boolean };
    guardadas.set(id, { ...c, conversa: { ...c.conversa, ...(b.titulo ? { titulo: b.titulo } : {}), ...(typeof b.fixada === "boolean" ? { fixada: b.fixada } : {}) } });
    return json(200, { ok: true });
  }
  return undefined;
}
