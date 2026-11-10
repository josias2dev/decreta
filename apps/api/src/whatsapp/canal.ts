/**
 * O canal do WhatsApp: o que o agente manda e o que chega dele, sem saber de onde.
 *
 * Dois adaptadores: a API oficial da Meta (`meta.ts`) e a memória (`canalEmMemoria`), que os
 * testes e o Laboratório usam: grava o que sairia e nunca fala com ninguém.
 *
 * Os limites são os da API oficial e valem nos dois: até 3 botões de até 20 caracteres, lista
 * de até 10 itens com título de até 24, texto de até 4.096 caracteres e corpo com botões de até
 * 1.024. Quem monta a saída corta antes (`cortar`): a Meta recusa o que passa.
 */

export const TETO_DO_TEXTO = 4096;
export const TETO_DO_CORPO_INTERATIVO = 1024;
export const MAXIMO_DE_BOTOES = 3;
export const TETO_DO_BOTAO = 20;
export const MAXIMO_DE_ITENS = 10;
export const TETO_DO_ITEM = 24;
export const TETO_DA_DESCRICAO = 72;
export const TETO_DO_RODAPE = 60;

/** Para quem vai: o telefone (55 + DDD + número) e, quando a pessoa usa nome de usuário, o id dela na Meta (BSUID). */
export interface Destino {
  telefone: string;
  bsuid?: string | null;
}

export interface Botao {
  /** O que volta no toque (até 256 caracteres): "p:<id da proposta>:<escolha>" ou "a:<ação>". */
  id: string;
  titulo: string;
}

export interface ItemDaLista {
  id: string;
  titulo: string;
  descricao?: string;
}

export type Saida =
  | { tipo: "texto"; texto: string }
  /** `rodape`: até 60 caracteres embaixo, menor ("Souza & Freitas · 2 de 5"). */
  | { tipo: "botoes"; texto: string; botoes: Botao[]; rodape?: string }
  | { tipo: "lista"; texto: string; botao: string; itens: ItemDaLista[]; rodape?: string }
  /** Um botão que abre um endereço (o "Abrir conversa com a cliente", o link do Decreta). O toque não volta para o Decreta. */
  | { tipo: "link"; texto: string; rotulo: string; url: string; rodape?: string }
  | { tipo: "documento"; nome: string; mime: string; bytes: Uint8Array; legenda?: string }
  /** Modelo aprovado pela Meta (fora da janela de 24 h). `botoes`: o que volta no toque de cada botão de resposta rápida, na ordem do modelo. */
  | { tipo: "modelo"; nome: NomeDoModelo; parametros: string[]; botoes?: string[] };

/**
 * Os modelos de utilidade, em pt_BR, cadastrados na conta da Meta com estes nomes e estes textos. Cada um fala de um
 * item da conta (a data, o processo): o texto genérico, sem isso, a Meta classificou como marketing (09/11/2026).
 */
export const MODELOS = {
  agenda_do_dia: { texto: "Aviso do Decreta: o resumo dos seus prazos de {{1}}: {{2}}. Toque abaixo para ver o dia.", botoes: ["Ver o dia", "Conferir agora"] },
  vence_hoje: { texto: "Aviso do Decreta: prazos que vencem hoje e ainda estão abertos: {{1}}. Toque abaixo para ver.", botoes: ["Ver os prazos"] },
  prazo_sugerido: { texto: "Aviso do Decreta: a publicação do processo {{1}} tem prazo sugerido até {{2}}, ainda não conferido. Toque abaixo para conferir.", botoes: ["Conferir"] },
  vinculo_vencido: { texto: "Aviso do Decreta: o vínculo deste WhatsApp com a sua conta venceu em {{1}}, depois de 30 dias sem abrir o Decreta. Para voltar a receber os avisos de prazo, abra o Decreta.", botoes: [] },
  /** De autenticação (o texto é o da Meta): o código de ligar o WhatsApp, com o botão "Copiar código", que leva o mesmo código. */
  codigo_do_whatsapp: { texto: "Seu código de verificação é *{{1}}*. Para sua segurança, não o compartilhe.", botoes: [], copiarCodigo: true },
} as const;
export type NomeDoModelo = keyof typeof MODELOS;

/** O texto que o modelo mostra, com os parâmetros no lugar (o Laboratório e o painel de conversas mostram assim). */
export function textoDoModelo(nome: NomeDoModelo, parametros: readonly string[]): string {
  return MODELOS[nome].texto.replace(/\{\{(\d+)\}\}/g, (_, n: string) => parametros[Number(n) - 1] ?? "");
}

/** O que chega da Meta, já lido e conferido. */
export type Entrada =
  | {
      tipo: "mensagem";
      wamid: string;
      de: { telefone: string | null; bsuid: string | null; nome: string | null };
      em: Date;
      /** A mensagem a que esta responde (o toque num botão sempre traz a que tinha o botão). */
      responde: string | null;
      conteudo: Conteudo;
    }
  | { tipo: "status"; wamid: string; status: "enviada" | "entregue" | "lida" | "falhou"; em: Date; para: string | null; erro: { codigo: number; titulo: string } | null; categoria: string | null };

export type Conteudo =
  | { tipo: "texto"; texto: string }
  /** Toque num botão de resposta, num item de lista ou num botão de modelo: o id que o Decreta pôs nele. */
  | { tipo: "escolha"; id: string; titulo: string }
  | { tipo: "midia"; midia: "audio" | "imagem" | "documento" | "video" | "figurinha"; id: string; mime: string; nome: string | null; legenda: string | null; voz: boolean }
  /** A reação a uma mensagem (`wamid`, a reagida). Não tem resposta; o 👎 marca a resposta para revisão. */
  | { tipo: "reacao"; emoji: string | null; wamid: string }
  /** Localização, contato e o que mais o Decreta não trata: responde que não entende esse tipo. */
  | { tipo: "outro"; nome: string };

export interface MidiaBaixada {
  bytes: Uint8Array;
  mime: string;
}

export interface OpcoesDoCanal {
  /** A mensagem que esta cita (a que tinha o botão tocado): aparece num balão em cima da resposta. */
  responde?: string | null;
}

export interface Canal {
  /** Manda e devolve o id da mensagem na Meta. Erro da Meta vira `FalhaNoCanal` (com o código, para o 131047). */
  enviar(para: Destino, saida: Saida, opcoes?: OpcoesDoCanal): Promise<{ wamid: string }>;
  /** Marca como lida e mostra o "digitando" (some ao responder ou em 25 s). */
  marcarLido(wamid: string): Promise<void>;
  /** Baixa a mídia que chegou: o link da Meta vale 5 minutos, então é na hora. */
  baixarMidia(id: string): Promise<MidiaBaixada>;
}

/** A Meta recusou. `codigo` é o da Graph API (131047: fora da janela de 24 h). */
export class FalhaNoCanal extends Error {
  constructor(
    message: string,
    readonly codigo: number | null,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/** Fora da janela de 24 h, texto livre não sai: só modelo aprovado. */
export const FORA_DA_JANELA = 131047;

/** O texto cabe no limite, cortado na última palavra inteira. */
export function cortar(texto: string, teto: number): string {
  const t = texto.trim();
  if (t.length <= teto) return t;
  const corte = t.slice(0, teto - 1).replace(/\s+\S*$/, "");
  return `${corte || t.slice(0, teto - 1)}…`;
}

/** O rodapé no limite, ou nada. */
const rodapeNoLimite = (r: string | undefined) => (r?.trim() ? { rodape: cortar(r, TETO_DO_RODAPE) } : {});

/** A saída dentro dos limites da API: o que passa é cortado, e botões e itens além do máximo saem. */
export function dentroDosLimites(s: Saida): Saida {
  switch (s.tipo) {
    case "texto":
      return { ...s, texto: cortar(s.texto, TETO_DO_TEXTO) };
    case "botoes": {
      const { rodape, ...resto } = s;
      return { ...resto, texto: cortar(s.texto, TETO_DO_CORPO_INTERATIVO), botoes: s.botoes.slice(0, MAXIMO_DE_BOTOES).map((b) => ({ ...b, titulo: cortar(b.titulo, TETO_DO_BOTAO) })), ...rodapeNoLimite(rodape) };
    }
    case "lista": {
      const { rodape, ...resto } = s;
      return {
        ...resto,
        texto: cortar(s.texto, TETO_DO_CORPO_INTERATIVO),
        botao: cortar(s.botao, TETO_DO_BOTAO),
        itens: s.itens.slice(0, MAXIMO_DE_ITENS).map((i) => ({ id: i.id, titulo: cortar(i.titulo, TETO_DO_ITEM), ...(i.descricao ? { descricao: cortar(i.descricao, TETO_DA_DESCRICAO) } : {}) })),
        ...rodapeNoLimite(rodape),
      };
    }
    case "link": {
      const { rodape, ...resto } = s;
      return { ...resto, texto: cortar(s.texto, TETO_DO_CORPO_INTERATIVO), rotulo: cortar(s.rotulo, TETO_DO_BOTAO), ...rodapeNoLimite(rodape) };
    }
    case "documento":
      return s.legenda ? { ...s, legenda: cortar(s.legenda, TETO_DO_CORPO_INTERATIVO) } : s;
    case "modelo":
      // Variável de modelo não aceita quebra de linha, tabulação nem mais de 4 espaços seguidos.
      return { ...s, parametros: s.parametros.map((p) => cortar(p.replace(/\s+/g, " "), 300)) };
  }
}

/** O texto que a pessoa vê (o painel de conversas e o Laboratório guardam e mostram assim). */
export function textoDaSaida(s: Saida): string {
  switch (s.tipo) {
    case "texto":
    case "botoes":
    case "lista":
    case "link":
      return s.texto;
    case "documento":
      return s.legenda ? `${s.nome}\n${s.legenda}` : s.nome;
    case "modelo":
      return textoDoModelo(s.nome, s.parametros);
  }
}

export interface MensagemNaMemoria {
  para: Destino;
  saida: Saida;
  wamid: string;
  em: Date;
  /** A mensagem citada, quando há. */
  responde: string | null;
}

/**
 * O canal que não fala com ninguém: guarda o que sairia. `falharCom` simula a recusa da Meta na
 * próxima mensagem (o 131047, por exemplo); `midias` é o que `baixarMidia` devolve.
 */
export function canalEmMemoria(opcoes: { prefixo?: string } = {}) {
  const enviadas: MensagemNaMemoria[] = [];
  const lidas: string[] = [];
  const midias = new Map<string, MidiaBaixada>();
  let falha: FalhaNoCanal | null = null;
  let n = 0;
  const canal: Canal & { enviadas: MensagemNaMemoria[]; lidas: string[]; midias: Map<string, MidiaBaixada>; falharCom(codigo: number, mensagem?: string): void } = {
    enviadas,
    lidas,
    midias,
    falharCom(codigo, mensagem = "recusada") {
      falha = new FalhaNoCanal(mensagem, codigo, 400);
    },
    async enviar(para, saida, extra) {
      if (falha) {
        const f = falha;
        falha = null;
        throw f;
      }
      const wamid = `${opcoes.prefixo ?? "wamid.memoria"}.${++n}.${Date.now().toString(36)}`;
      enviadas.push({ para, saida: dentroDosLimites(saida), wamid, em: new Date(), responde: extra?.responde ?? null });
      return { wamid };
    },
    async marcarLido(wamid) {
      lidas.push(wamid);
    },
    async baixarMidia(id) {
      const m = midias.get(id);
      if (!m) throw new FalhaNoCanal(`mídia ${id} não existe`, 131052, 404);
      return m;
    },
  };
  return canal;
}
export type CanalEmMemoria = ReturnType<typeof canalEmMemoria>;
