/**
 * O WhatsApp no painel da plataforma: as conversas de verdade e o Laboratório.
 *
 * Conversas: a lista é só de metadados (quem, de qual escritório, quando, se falhou, quantas respostas
 * ficaram para revisão). O conteúdo abre com o motivo escrito, que fica no registro da plataforma e no do
 * escritório. Aberta, dá para pausar o agente daquela pessoa e escrever como Decreta (com a janela aberta).
 *
 * Laboratório: conversa com o agente como uma pessoa do escritório de demonstração. O canal é o da memória:
 * nada sai para o WhatsApp de ninguém. As propostas executam de verdade, nos dados da demonstração.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Send, Trash2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Campo, Carregando, Faixa, Interruptor, Painel, Vazio } from "@/componentes/ui";
import { apiPlataforma, mensagemDoErro } from "@/lib/api";
import { diaCurto, diaDoInstante, hora } from "@/lib/formato";
import { cn } from "@/lib/util";

/* ------------------------------------------------------------------ */
/* Tipos (os mesmos da API, apps/api/src/whatsapp/painel.ts)           */
/* ------------------------------------------------------------------ */

interface ConversaNaLista {
  organizationId: string;
  escritorio: string;
  userId: string;
  pessoa: string;
  telefone: string | null;
  ultimaEm: string;
  mensagens: number;
  falhas: number;
  ultimaDirecao: "entrada" | "saida" | null;
  ultimaSituacao: string | null;
  pausado: boolean;
}

interface MensagemNaTela {
  id: string;
  direcao: "entrada" | "saida";
  tipo: string;
  texto: string | null;
  detalhes: Record<string, unknown> | null;
  situacao: string;
  erro: string | null;
  origem: string | null;
  em: string;
  conversaId: string | null;
  revisao: string | null;
  duracaoMs: number | null;
}

interface TurnoNaTela {
  conversaId: string;
  em: string;
  ferramentas: { nome: string; entrada: unknown; erro?: string }[];
}

interface ConteudoDaConversa {
  pessoa: { userId: string; nome: string; membro: boolean };
  vinculo: { telefone: string; pausado: boolean; janelaAberta: boolean; renovarAte: string; organizationId: string } | null;
  mensagens: MensagemNaTela[];
  turnos: TurnoNaTela[];
}

interface Bastidores {
  ferramentas: { nome: string; entrada: unknown; saida: unknown; erro?: string }[];
  tokens: { entrada: number; saida: number; cache: number } | null;
  ms: number;
  propostas: string[];
  atalho?: string;
  revisao?: string;
}

interface PessoaDoLaboratorio {
  id: string;
  nome: string;
  papel: string;
  cargo: string | null;
  apelido: string | null;
}

type Toque = { id: string; titulo: string };

/* ------------------------------------------------------------------ */
/* A mensagem, como a pessoa viu no WhatsApp                           */
/* ------------------------------------------------------------------ */

/** O *negrito* e o _itálico_ do WhatsApp, sem HTML: o texto vira pedaços de React. */
function Formatado({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <strong key={i}>{p.slice(1, -1)}</strong> : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

/** Os botões (ou os itens da lista, ou os botões do modelo) que a mensagem levou. */
function toquesDa(m: MensagemNaTela): Toque[] {
  const d = m.detalhes ?? {};
  if (m.tipo === "botoes" && Array.isArray(d.botoes)) return d.botoes as Toque[];
  if (m.tipo === "lista" && Array.isArray(d.itens)) return (d.itens as { id: string; titulo: string }[]).map((i) => ({ id: i.id, titulo: i.titulo }));
  if (m.tipo === "modelo" && Array.isArray(d.botoes)) return (d.botoes as string[]).map((id, i) => ({ id, titulo: (d.titulos as string[] | undefined)?.[i] ?? id }));
  return [];
}

const SITUACAO: Record<string, string> = { enviando: "enviando", enviada: "enviada", entregue: "entregue", lida: "lida", falhou: "não saiu", recebida: "esperando resposta", respondida: "respondida", ignorada: "sem resposta" };

/** Um balão, como no WhatsApp da pessoa: o que ela mandou à direita, o que o Decreta mandou à esquerda, com os botões. */
function Balao({ m, aoTocar, tocando }: { m: MensagemNaTela; aoTocar?: (t: Toque) => void; tocando?: string | null }) {
  const d = m.detalhes ?? {};
  const doDecreta = m.direcao === "saida";
  const toques = doDecreta ? toquesDa(m) : [];
  const corpo =
    m.tipo === "documento" ? (
      <span className="inline-flex items-center gap-2">
        <FileText className="size-4 shrink-0" aria-hidden /> {String(d.nome ?? m.texto ?? "Documento")}
      </span>
    ) : m.tipo === "escolha" ? (
      <span>▸ {m.texto}</span>
    ) : m.tipo === "reacao" ? (
      <span aria-label="Reação">{m.texto}</span>
    ) : m.texto ? (
      <Formatado texto={m.texto} />
    ) : (
      <span className="opacity-70">({m.tipo})</span>
    );
  const pe = [m.tipo === "modelo" ? `modelo ${String(d.modelo ?? "")}` : null, hora(m.em), doDecreta ? SITUACAO[m.situacao] : null, m.duracaoMs != null ? `${(m.duracaoMs / 1000).toFixed(1).replace(".", ",")} s` : null].filter(Boolean).join(" · ");
  return (
    <div className={cn("flex max-w-[88%] flex-col gap-1.5", doDecreta ? "self-start" : "self-end items-end")}>
      <div className={cn("dc-msg !max-w-full", doDecreta ? "dc-msg--ia" : "dc-msg--pessoa")}>
        {corpo}
        {typeof d.rodape === "string" && <div className="dc-msg__pe">{d.rodape}</div>}
      </div>
      {m.tipo === "link" && typeof d.url === "string" && (
        <a className="dc-btn dc-btn--secundaria dc-btn--sm self-start" href={d.url} target="_blank" rel="noopener noreferrer">
          {String(d.rotulo ?? "Abrir")}
        </a>
      )}
      {toques.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {toques.map((t) => (
            <Botao key={t.id} pequeno disabled={!aoTocar} ocupado={tocando === t.id} onClick={() => aoTocar?.(t)}>
              {t.titulo}
            </Botao>
          ))}
        </div>
      )}
      <span className="dc-nota">{pe}</span>
      {m.erro && <Faixa tipo="erro">{m.erro}</Faixa>}
      {m.revisao && <Faixa tipo="aviso">Para revisão: {m.revisao}</Faixa>}
    </div>
  );
}

/** O que a IA consultou em cada turno, logo depois da resposta dele. */
function Fio({ mensagens, turnos, aoTocar, tocando }: { mensagens: MensagemNaTela[]; turnos: TurnoNaTela[]; aoTocar?: (t: Toque) => void; tocando?: string | null }) {
  const vistos = new Set<string>();
  if (!mensagens.length) return <Vazio titulo="Nenhuma mensagem ainda" />;
  return (
    <div className="dc-conversa">
      {mensagens.map((m) => {
        const turno = m.direcao === "saida" && m.conversaId && !vistos.has(m.conversaId) ? turnos.find((t) => t.conversaId === m.conversaId && Math.abs(new Date(t.em).getTime() - new Date(m.em).getTime()) < 120_000) : undefined;
        if (turno) vistos.add(m.conversaId!);
        return (
          <Fragment key={m.id}>
            {turno && turno.ferramentas.length > 0 && <p className="dc-nota m-0 self-start">Consultou: {turno.ferramentas.map((f) => (f.erro ? `${f.nome} (erro)` : f.nome)).join(", ")}</p>}
            <Balao m={m} aoTocar={aoTocar} tocando={tocando} />
          </Fragment>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversas                                                           */
/* ------------------------------------------------------------------ */

export function ConversasDoWhatsapp() {
  const lista = useQuery({ queryKey: ["plataforma", "whatsapp"], queryFn: () => apiPlataforma<{ ligado: boolean; conversas: ConversaNaLista[] }>("/whatsapp/conversas") });
  const [aberta, setAberta] = useState<ConversaNaLista | null>(null);
  if (!lista.data) return lista.isError ? <Faixa tipo="erro">{mensagemDoErro(lista.error)}</Faixa> : <Carregando />;
  const { ligado, conversas } = lista.data;
  return (
    <div className="dc-pilha">
      {!ligado && <Faixa tipo="nota">O WhatsApp oficial não está ligado neste servidor: as conversas abaixo são só do Laboratório e de antes. Para testar o agente, use o Laboratório.</Faixa>}
      <Painel titulo="Conversas" corpo={false}>
        {conversas.length ? (
          <ul className="dc-linhas" aria-label="Conversas do WhatsApp">
            {conversas.map((c) => (
              <li key={`${c.organizationId}|${c.userId}`} className="dc-linhas__item">
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">
                    {c.pessoa} · {c.escritorio}
                  </span>
                  <span className="dc-celula__2">
                    {[c.telefone, `${c.mensagens} ${c.mensagens === 1 ? "mensagem" : "mensagens"}`, `última em ${diaCurto(diaDoInstante(c.ultimaEm))} às ${hora(c.ultimaEm)}`, c.pausado ? "pausada pelo suporte" : null].filter(Boolean).join(" · ")}
                    {c.falhas > 0 && <span className="text-[var(--vencido)]"> · {c.falhas === 1 ? "1 falha" : `${c.falhas} falhas`}</span>}
                  </span>
                </span>
                <Botao pequeno onClick={() => setAberta(c)}>
                  Abrir
                </Botao>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio titulo="Nenhuma conversa ainda">Quando alguém de um escritório ligar o WhatsApp, a conversa aparece aqui, só com quem e quando. O conteúdo abre com o motivo escrito.</Vazio>
        )}
      </Painel>
      {aberta && <Conversa conversa={aberta} ligado={ligado} aoFechar={() => setAberta(null)} />}
    </div>
  );
}

/** Abrir pede o motivo; aberta, mostra o fio, pausa e escreve como Decreta. */
function Conversa({ conversa, ligado, aoFechar }: { conversa: ConversaNaLista; ligado: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const caminho = `/whatsapp/conversas/${conversa.organizationId}/${conversa.userId}`;
  const chave = ["plataforma", "whatsapp", conversa.organizationId, conversa.userId];
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");
  const conteudo = useQuery({ queryKey: chave, queryFn: () => apiPlataforma<ConteudoDaConversa>(caminho), enabled: false, retry: false });
  const abrir = useMutation({
    mutationFn: () => apiPlataforma<ConteudoDaConversa>(`${caminho}/abrir`, { json: { motivo: motivo.trim() } }),
    onSuccess: (c) => qc.setQueryData(chave, c),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const atualizar = () => void conteudo.refetch();
  const pausar = useMutation({
    mutationFn: (pausado: boolean) => apiPlataforma(`${caminho}/pausar`, { json: { pausado } }),
    onSuccess: (_, pausado) => {
      avisar(pausado ? "Agente pausado: a pessoa fala com a equipe." : "O agente voltou a responder.");
      atualizar();
      void qc.invalidateQueries({ queryKey: ["plataforma", "whatsapp"], exact: true });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const escrever = useMutation({
    mutationFn: () => apiPlataforma(`${caminho}/escrever`, { json: { texto: texto.trim() } }),
    onSuccess: () => {
      setTexto("");
      atualizar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const c = conteudo.data;
  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={`${conversa.pessoa} · ${conversa.escritorio}`} descricao={c ? undefined : "O conteúdo é do escritório. A abertura fica no registro da plataforma e no Registro do próprio escritório, com o motivo."} className="max-w-2xl">
      {!c ? (
        <div className="dc-form">
          <Campo rotulo="Motivo" htmlFor="wa-motivo" ajuda="O escritório lê este motivo no Registro. Pelo menos 10 caracteres.">
            <textarea id="wa-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="A pessoa pediu ajuda no suporte: o resumo não chegou hoje." />
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao onClick={aoFechar}>Voltar</Botao>
            <Botao variante="primaria" onClick={() => abrir.mutate()} ocupado={abrir.isPending} disabled={motivo.trim().length < 10}>
              Abrir a conversa
            </Botao>
          </div>
        </div>
      ) : (
        <div className="dc-form">
          {c.vinculo ? (
            <p className="dc-nota m-0">
              {c.vinculo.telefone} · janela de 24 h {c.vinculo.janelaAberta ? "aberta" : "fechada"} · {c.vinculo.pausado ? "agente pausado" : "agente respondendo"}
            </p>
          ) : (
            <Faixa tipo="nota">Esta pessoa desligou o WhatsApp.</Faixa>
          )}
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            <Fio mensagens={c.mensagens} turnos={c.turnos} />
          </div>
          {c.vinculo && (
            <>
              <div className="flex flex-wrap gap-2">
                <Botao onClick={() => pausar.mutate(!c.vinculo!.pausado)} ocupado={pausar.isPending}>
                  {c.vinculo.pausado ? "Devolver ao agente" : "Pausar o agente"}
                </Botao>
                <Botao variante="fantasma" onClick={atualizar} ocupado={conteudo.isFetching}>
                  Atualizar
                </Botao>
              </div>
              {ligado && c.vinculo.janelaAberta ? (
                <div className="dc-perguntar-campo">
                  <textarea rows={1} aria-label="Escrever como a equipe do Decreta" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escrever como a equipe do Decreta" />
                  <Botao variante="primaria" pequeno onClick={() => escrever.mutate()} ocupado={escrever.isPending} disabled={!texto.trim()} aria-label="Mandar">
                    <Send />
                  </Botao>
                </div>
              ) : (
                <p className="dc-nota m-0">{ligado ? "A janela de 24 h está fechada: a pessoa precisa escrever primeiro." : "O WhatsApp oficial não está ligado neste servidor: não dá para escrever."}</p>
              )}
            </>
          )}
        </div>
      )}
    </Dialogo>
  );
}

/* ------------------------------------------------------------------ */
/* Laboratório                                                         */
/* ------------------------------------------------------------------ */

export function Laboratorio() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const pessoas = useQuery({ queryKey: ["plataforma", "laboratorio"], queryFn: () => apiPlataforma<{ escritorio: { id: string; nome: string } | null; pessoas: PessoaDoLaboratorio[] }>("/laboratorio") });
  const publicacoes = useQuery({ queryKey: ["plataforma", "laboratorio", "publicacoes"], queryFn: () => apiPlataforma<{ publicacoes: { id: string; processo: string; fim: string; tipo: string }[] }>("/laboratorio/publicacoes") });
  const [userId, setUserId] = useState<string | null>(null);
  const escolhida = userId ?? pessoas.data?.pessoas[0]?.id ?? null;
  const [janelaAberta, setJanela] = useState(true);
  const [texto, setTexto] = useState("");
  const [publicacaoId, setPublicacao] = useState("");
  const [bastidores, setBastidores] = useState<Bastidores | null>(null);
  const chave = ["plataforma", "laboratorio", escolhida];
  const conversa = useQuery({ queryKey: chave, queryFn: () => apiPlataforma<{ mensagens: MensagemNaTela[]; turnos: TurnoNaTela[]; pendentes: { id: string }[] }>(`/laboratorio/${escolhida}`), enabled: !!escolhida });
  const mandar = useMutation({
    mutationFn: (pedido: { texto: string } | { escolha: Toque } | { aviso: "resumo" | "vence" | "curto"; publicacaoId?: string }) =>
      apiPlataforma<{ bastidores: Bastidores | null; nada?: string; mensagens: MensagemNaTela[]; turnos: TurnoNaTela[] }>(`/laboratorio/${escolhida}`, { json: { janelaAberta, ...pedido } }),
    onSuccess: (r, pedido) => {
      if ("texto" in pedido) setTexto("");
      setBastidores(r.bastidores);
      if (r.nada) avisar(r.nada);
      // A resposta já traz a conversa como ficou: sem esperar outro pedido.
      qc.setQueryData(chave, (antes: { pendentes: { id: string }[] } | undefined) => ({ pendentes: antes?.pendentes ?? [], mensagens: r.mensagens, turnos: r.turnos }));
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const limpar = useMutation({
    mutationFn: () => apiPlataforma(`/laboratorio/${escolhida}`, { method: "DELETE" }),
    onSuccess: () => {
      setBastidores(null);
      void qc.invalidateQueries({ queryKey: chave });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  // A mensagem nova aparece embaixo, como no WhatsApp: a conversa rola até ela.
  const fim = useRef<HTMLDivElement>(null);
  const quantas = conversa.data?.mensagens.length ?? 0;
  useEffect(() => {
    if (fim.current) fim.current.scrollTop = fim.current.scrollHeight;
  }, [quantas, escolhida]);
  if (!pessoas.data) return pessoas.isError ? <Faixa tipo="erro">{mensagemDoErro(pessoas.error)}</Faixa> : <Carregando />;
  if (!pessoas.data.escritorio) return <Vazio titulo="Sem escritório de demonstração">O Laboratório conversa com as pessoas da demonstração. Crie-a neste servidor com bun run demonstracao.</Vazio>;
  const tocando = mandar.isPending && mandar.variables && "escolha" in mandar.variables ? mandar.variables.escolha.id : null;
  const enviar = () => texto.trim() && mandar.mutate({ texto: texto.trim() });
  return (
    <div className="dc-colunas dc-colunas--meio max-md:!grid-cols-1">
      <Painel titulo={`Conversa · ${pessoas.data.escritorio.nome}`} acao={<span className="dc-nota">Nada sai para o WhatsApp de ninguém</span>}>
        <div className="dc-form">
          <div ref={fim} className="max-h-[60vh] min-h-48 overflow-y-auto pr-1">{conversa.data ? <Fio mensagens={conversa.data.mensagens} turnos={conversa.data.turnos} aoTocar={(t) => mandar.mutate({ escolha: t })} tocando={tocando} /> : <Carregando linhas={3} />}</div>
          <form
            className="dc-perguntar-campo"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <textarea
              rows={1}
              aria-label="Mensagem como a pessoa"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Escreva como a pessoa: me manda a procuração da Marina"
            />
            <Botao type="submit" variante="primaria" pequeno ocupado={mandar.isPending && !!mandar.variables && "texto" in mandar.variables} disabled={!texto.trim()} aria-label="Mandar">
              <Send />
            </Botao>
          </form>
        </div>
      </Painel>
      <div className="dc-pilha">
        <Painel titulo="Quem escreve">
          <div className="dc-form">
            <Campo rotulo="Pessoa da demonstração" htmlFor="lab-pessoa">
              <select id="lab-pessoa" value={escolhida ?? ""} onChange={(e) => setUserId(e.target.value)}>
                {pessoas.data.pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.nome, p.cargo, p.papel === "member" ? null : "sócia ou sócio"].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </Campo>
            <Interruptor rotulo="Janela de 24 h aberta" ajuda="Fechada, os avisos saem como modelo aprovado, e o toque no modelo abre a janela." ligado={janelaAberta} aoMudar={setJanela} />
            <div>
              <Botao variante="fantasma" onClick={() => limpar.mutate()} ocupado={limpar.isPending}>
                <Trash2 /> Limpar esta conversa
              </Botao>
            </div>
          </div>
        </Painel>
        <Painel titulo="Disparar um aviso">
          <div className="dc-form">
            <div className="flex flex-wrap gap-2">
              <Botao onClick={() => mandar.mutate({ aviso: "resumo" })} ocupado={mandar.isPending && mandar.variables && "aviso" in mandar.variables && mandar.variables.aviso === "resumo"}>
                Resumo da manhã
              </Botao>
              <Botao onClick={() => mandar.mutate({ aviso: "vence" })} ocupado={mandar.isPending && mandar.variables && "aviso" in mandar.variables && mandar.variables.aviso === "vence"}>
                Aviso das 15h
              </Botao>
            </div>
            <Campo rotulo="Prazo curto, pela publicação" htmlFor="lab-pub">
              <select id="lab-pub" value={publicacaoId} onChange={(e) => setPublicacao(e.target.value)}>
                <option value="">Escolha a publicação</option>
                {publicacoes.data?.publicacoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {diaCurto(p.fim)} · {p.tipo} · {p.processo}
                  </option>
                ))}
              </select>
            </Campo>
            <div>
              <Botao onClick={() => mandar.mutate({ aviso: "curto", publicacaoId })} disabled={!publicacaoId} ocupado={mandar.isPending && mandar.variables && "aviso" in mandar.variables && mandar.variables.aviso === "curto"}>
                Avisar prazo curto
              </Botao>
            </div>
          </div>
        </Painel>
        <Painel titulo="Bastidores do último turno">{bastidores ? <VerBastidores b={bastidores} /> : <p className="dc-nota m-0">Mande uma mensagem para ver o que a IA consultou, quanto levou e quanto custou.</p>}</Painel>
      </div>
    </div>
  );
}

function VerBastidores({ b }: { b: Bastidores }) {
  const linhas: [string, ReactNode][] = [
    ["Tempo", `${(b.ms / 1000).toFixed(1).replace(".", ",")} s`],
    ...(b.tokens ? ([["Tokens", `${b.tokens.entrada} de entrada (${b.tokens.cache} do cache) · ${b.tokens.saida} de saída`]] as [string, ReactNode][]) : []),
    ...(b.atalho ? ([["Sem IA", `resolvido pelo código (${b.atalho})`]] as [string, ReactNode][]) : []),
    ...(b.propostas.length ? ([["Propostas", String(b.propostas.length)]] as [string, ReactNode][]) : []),
  ];
  return (
    <div className="dc-form">
      <dl className="dc-dados">
        {linhas.map(([r, v]) => (
          <div key={r} className="contents">
            <dt>{r}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {b.revisao && <Faixa tipo="aviso">A trava barrou a resposta: {b.revisao}</Faixa>}
      {b.ferramentas.length > 0 && (
        <ul className="dc-linhas" aria-label="O que a IA consultou">
          {b.ferramentas.map((f, i) => (
            <li key={i} className="dc-linhas__item">
              <details className="min-w-0 flex-1">
                <summary className="dc-t-corpo cursor-pointer">
                  {f.nome}
                  {f.erro && <span className="text-[var(--vencido)]"> · erro</span>}
                </summary>
                <pre className="dc-num dc-t-meta mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({ entrada: f.entrada, ...(f.erro ? { erro: f.erro } : { saida: f.saida }) }, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
