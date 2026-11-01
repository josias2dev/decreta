/** Cadastros rápidos: cliente, processo e atendimento (atalhos da tela Hoje e das listas). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState, type FormEvent } from "react";
import { api, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaDoInstante, ondeTramita } from "@/lib/formato";
import type { Canal, ClienteNaLista, ConsultaDoCnj, Pagina } from "@/lib/tipos";
import { useAviso } from "./avisos";
import { CamposDoCliente, fichaVazia } from "./campos-cliente";
import { Dialogo } from "./dialogo";
import { Botao, Campo, Dados, Faixa } from "./ui";

/** Nome de empresa: termina em Ltda., S.A., ME, EIRELI. */
const pareceEmpresa = (nome: string) => /\b(ltda|s\.?\s?a|s\/a|eireli|me|epp)\.?$/i.test(nome.trim());

export function NovoCliente({ aberto, aoFechar, aoCriar, nomeInicial }: { aberto: boolean; aoFechar: () => void; aoCriar?: (c: { id: string; nome: string }) => void; nomeInicial?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const avisar = useAviso();
  const [f, setF] = useState(fichaVazia);
  // Aberto a partir de uma parte do processo: já vem com o nome dela.
  useEffect(() => {
    if (aberto && nomeInicial) setF((v) => ({ ...v, nome: nomeInicial, tipo: pareceEmpresa(nomeInicial) ? "pj" : "pf" }));
  }, [aberto, nomeInicial]);
  const criar = useMutation({
    mutationFn: () => api<{ id: string }>("/clientes", { json: { ...f, documento: f.documento || null, telefone: f.telefone || null, email: f.email || null, endereco: f.endereco.trim() || null } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar("Cliente cadastrado.");
      aoFechar();
      setF(fichaVazia());
      if (aoCriar) aoCriar({ id: r.id, nome: f.nome });
      else void navigate({ to: "/clientes/$id", params: { id: r.id } });
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    criar.mutate();
  };
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo cliente"
      descricao="Empresa: digite o CNPJ e o resto vem da Receita. Pessoa: o CEP traz a rua."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" type="submit" form="novo-cliente" ocupado={criar.isPending} disabled={f.nome.trim().length < 2}>
            Cadastrar
          </Botao>
        </>
      }
    >
      <form id="novo-cliente" className="dc-form" onSubmit={enviar}>
        <div className="flex gap-4">
          <label className="dc-opcao">
            <input type="radio" name="tipo" checked={f.tipo === "pf"} onChange={() => setF({ ...f, tipo: "pf" })} /> Pessoa física
          </label>
          <label className="dc-opcao">
            <input type="radio" name="tipo" checked={f.tipo === "pj"} onChange={() => setF({ ...f, tipo: "pj" })} /> Empresa
          </label>
        </div>
        <CamposDoCliente f={f} setF={setF} prefixo="cli" focar />
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </form>
    </Dialogo>
  );
}

/** Escolher um cliente já cadastrado pelo nome (ou cadastrar um novo ali mesmo). */
export function EscolherCliente({ valor, aoEscolher }: { valor: { id: string; nome: string } | null; aoEscolher: (c: { id: string; nome: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [novo, setNovo] = useState(false);
  const termo = useDeferredValue(q.trim());
  const r = useQuery({ queryKey: ["clientes", "escolher", termo], queryFn: () => api<Pagina<ClienteNaLista>>(`/clientes?busca=${encodeURIComponent(termo)}`), enabled: termo.length >= 2 && !valor });
  if (valor) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--borda-forte)] px-3 py-1.5">
        <span className="truncate font-medium">{valor.nome}</span>
        <button type="button" className="dc-link" onClick={() => aoEscolher(null)}>
          Trocar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CPF ou telefone" aria-label="Buscar cliente" autoComplete="off" />
      {termo.length >= 2 && (
        <div className="dc-painel dc-linhas" style={{ maxHeight: 180, overflowY: "auto" }}>
          {r.data?.itens.slice(0, 6).map((c) => (
            <button key={c.id} type="button" className="dc-linhas__item w-full cursor-pointer border-0 bg-transparent text-left hover:bg-[var(--superficie-2)]" onClick={() => aoEscolher({ id: c.id, nome: c.nome })}>
              <span className="dc-celula">
                <span className="dc-celula__1">{c.nome}</span>
                {c.documento && <span className="dc-celula__2 dc-num">{c.documento}</span>}
              </span>
            </button>
          ))}
          <button type="button" className="dc-linhas__item w-full cursor-pointer border-0 bg-transparent text-left text-[var(--acento)] hover:bg-[var(--superficie-2)]" onClick={() => setNovo(true)}>
            Cadastrar “{termo}” como cliente novo
          </button>
        </div>
      )}
      <NovoCliente aberto={novo} aoFechar={() => setNovo(false)} aoCriar={(c) => aoEscolher(c)} />
    </div>
  );
}

type ParteDaConsulta = ConsultaDoCnj["partes"][number];
type Polo = ParteDaConsulta["polo"];

const PAPEL: Record<Polo, string> = { ativo: "Autor", passivo: "Réu", terceiro: "Terceiro" };

/** Uma linha por fonte que não trouxe tudo: o que faltou e o que o Decreta faz depois. */
function avisosDaConsulta(c: ConsultaDoCnj): string[] {
  const avisos: string[] = [];
  if (c.fontes.datajud === "nao_achou") avisos.push("O DataJud ainda não tem este processo; processo novo leva alguns dias para aparecer. O Decreta tenta de novo todo dia.");
  if (c.fontes.datajud === "falhou") avisos.push("O DataJud não respondeu agora. Pode cadastrar: o Decreta busca de novo sozinho.");
  if (c.fontes.datajud === "desligado") avisos.push("A busca no DataJud está desligada no servidor.");
  if (c.segredo) avisos.push("Processo em segredo de justiça: as partes não aparecem no Diário.");
  else if (c.fontes.djen === "nao_achou") avisos.push("Ainda não há publicação deste processo no Diário, então as partes não vieram. Escolha o cliente e digite a outra parte.");
  if (c.fontes.djen === "falhou") avisos.push("O Diário não respondeu agora, então as partes não vieram. Dá para trazê-las depois, na ficha do processo.");
  return avisos;
}

/** O que o tribunal mandou, logo abaixo do número: dados, partes (quem é o cliente) e o que faltou. */
function DoTribunal({ consulta, buscando, erro, doCliente, aoEscolher, aoCadastrar }: { consulta?: ConsultaDoCnj; buscando: boolean; erro: unknown; doCliente: number | null; aoEscolher: (i: number) => void; aoCadastrar: (i: number) => void }) {
  if (buscando)
    return (
      <div className="dc-consulta dc-consulta--buscando" role="status">
        <LoaderCircle className="animate-spin" /> Buscando no DataJud e no Diário de Justiça. Pode levar até um minuto; dá para ir preenchendo.
      </div>
    );
  if (erro) return <Faixa tipo="erro">{mensagemDoErro(erro)}</Faixa>;
  if (!consulta) return null;
  const c = consulta;
  const achou = c.fontes.datajud === "achou" || c.fontes.djen === "achou";
  const fontes = [c.fontes.datajud === "achou" && "DataJud", c.fontes.djen === "achou" && "Diário de Justiça"].filter(Boolean).join(" e ");
  return (
    <div className="flex flex-col gap-2">
      {c.cadastrado && (
        <Faixa tipo="aviso">
          <span>
            Este número já está cadastrado.{" "}
            <Link to="/processos/$id" params={{ id: c.cadastrado.id }} className="dc-link">
              Abrir {c.cadastrado.titulo}
            </Link>
          </span>
        </Faixa>
      )}
      {c.exemplo && <Faixa tipo="ia">Demonstração: um exemplo com dados inventados. No escritório de verdade eles vêm do DataJud e do Diário de Justiça.</Faixa>}
      {achou && (
        <div className="dc-consulta">
          <div className="dc-consulta__titulo">Do tribunal · {c.exemplo ? "exemplo" : fontes}</div>
          <Dados
            linhas={[
              ...(c.classe ? ([["Classe", c.classe]] as [string, string][]) : []),
              ...(c.assunto ? ([["Assunto", c.assunto]] as [string, string][]) : []),
              ...(c.orgao || c.comarca ? ([["Juízo", ondeTramita(c) ?? ""]] as [string, string][]) : []),
              ...(c.sistema || c.tribunal ? ([["Sistema", [c.sistema, c.tribunal].filter(Boolean).join(" · ")]] as [string, string][]) : []),
              ...(c.distribuidoEm ? ([["Distribuído", diaCompleto(c.distribuidoEm)]] as [string, string][]) : []),
              ...(c.ultimaMovimentacao ? ([["Último ato", `${c.ultimaMovimentacao.titulo} · ${diaCompleto(diaDoInstante(c.ultimaMovimentacao.em))}`]] as [string, string][]) : []),
            ]}
          />
          {c.partes.length > 0 && (
            <div className="dc-consulta__partes" role="radiogroup" aria-label="Quem é o cliente">
              <div className="dc-consulta__titulo">Partes · marque quem é o cliente</div>
              {c.partes.map((p, i) => (
                <label key={`${p.nome}-${i}`} className={`dc-consulta__parte${doCliente === i ? " is-on" : ""}`}>
                  <input type="radio" name="parte-cliente" checked={doCliente === i} onChange={() => aoEscolher(i)} />
                  <span className="dc-celula min-w-0 flex-1">
                    <span className="dc-celula__1">{p.nome}</span>
                    <span className="dc-celula__2">{[PAPEL[p.polo], p.advogados && `adv. ${p.advogados}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  {p.cliente ? (
                    <span className="dc-consulta__selo">Já é cliente</span>
                  ) : (
                    doCliente === i && (
                      <button type="button" className="dc-link shrink-0" onClick={() => aoCadastrar(i)}>
                        Cadastrar como cliente
                      </button>
                    )
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {avisosDaConsulta(c).map((a) => (
        <Faixa key={a} tipo="aviso">
          {a}
        </Faixa>
      ))}
    </div>
  );
}

export function NovoProcesso({ aberto, aoFechar, cliente }: { aberto: boolean; aoFechar: () => void; cliente?: { id: string; nome: string } | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const vazio = { cnj: "", extrajudicial: false, titulo: "", poloCliente: "ativo" as "ativo" | "passivo", outraParte: "", orgao: "", comarca: "", classe: "", responsavelId: "" };
  const [f, setF] = useState(vazio);
  const [cli, setCli] = useState<{ id: string; nome: string } | null>(cliente ?? null);
  /** Qual parte do tribunal é o cliente. */
  const [doCliente, setDoCliente] = useState<number | null>(null);
  const [cadastrar, setCadastrar] = useState<string | null>(null);

  const digitos = f.cnj.replace(/\D/g, "");
  const buscar = aberto && !f.extrajudicial && digitos.length === 20;
  const consulta = useQuery({
    queryKey: ["consulta-cnj", digitos],
    queryFn: () => api<ConsultaDoCnj>(`/processos/consulta?cnj=${digitos}`),
    enabled: buscar,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const c = buscar ? consulta.data : undefined;

  const escolher = (i: number, lista: ParteDaConsulta[] = c?.partes ?? []) => {
    const p = lista[i];
    if (!p) return;
    setDoCliente(i);
    if (p.cliente) setCli(p.cliente);
    else setCli((atual) => (atual && lista.some((x) => x.cliente?.id === atual.id) ? null : atual));
    const outra = lista.find((x) => x.polo !== p.polo && x.polo !== "terceiro");
    setF((v) => ({ ...v, poloCliente: p.polo === "terceiro" ? v.poloCliente : p.polo, outraParte: outra?.nome ?? v.outraParte }));
  };

  // A resposta chega uma vez por número: preenche só o que ainda está vazio.
  const aplicada = useRef<string | null>(null);
  useEffect(() => {
    if (!c || aplicada.current === c.cnj) return;
    aplicada.current = c.cnj;
    setF((v) => ({ ...v, orgao: v.orgao || c.orgao || "", comarca: v.comarca || c.comarca || "", classe: v.classe || c.classe || "" }));
    const doCadastro = c.partes.findIndex((p) => p.cliente && (cli ? p.cliente.id === cli.id : p.cliente.id === c.cliente?.id));
    const doLado = c.poloCliente ? c.partes.findIndex((p) => p.polo === c.poloCliente) : -1;
    // Cliente já escolhido que não aparece entre as partes fica; só o lado vem do tribunal.
    const i = doCadastro >= 0 ? doCadastro : cli ? -1 : doLado;
    if (i >= 0) escolher(i, c.partes);
    else if (c.poloCliente) setF((v) => ({ ...v, poloCliente: c.poloCliente! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);

  /** As partes que vão para a ficha: as do tribunal, com o cliente marcado; sem elas, o cliente e a outra parte digitada. */
  const partes = () => {
    const outra = f.outraParte.trim();
    const contraria = f.poloCliente === "ativo" ? "passivo" : "ativo";
    if (c?.partes.length) {
      const lista = c.partes.map((p, i) => ({ nome: i === doCliente && cli ? cli.nome : p.nome, polo: p.polo, papel: PAPEL[p.polo], advogados: p.advogados, cliente: i === doCliente && !!cli }));
      if (cli && (doCliente == null || !lista[doCliente]?.cliente)) lista.unshift({ nome: cli.nome, polo: f.poloCliente, papel: PAPEL[f.poloCliente], advogados: null, cliente: true });
      if (outra && !lista.some((p) => p.nome.toLocaleLowerCase("pt-BR") === outra.toLocaleLowerCase("pt-BR"))) lista.push({ nome: outra, polo: contraria, papel: PAPEL[contraria], advogados: null, cliente: false });
      return lista;
    }
    return [
      ...(cli ? [{ nome: cli.nome, polo: f.poloCliente, papel: PAPEL[f.poloCliente], cliente: true }] : []),
      ...(outra ? [{ nome: outra, polo: contraria, papel: PAPEL[contraria] }] : []),
    ];
  };

  const fechar = () => {
    setF(vazio);
    setDoCliente(null);
    setCli(cliente ?? null);
    aplicada.current = null;
    aoFechar();
  };

  const criar = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/processos", {
        json: {
          tipo: f.extrajudicial ? "extrajudicial" : "judicial",
          cnj: f.extrajudicial ? null : f.cnj,
          titulo: f.titulo.trim() || undefined,
          clienteId: cli?.id ?? null,
          poloCliente: f.poloCliente,
          orgao: f.orgao || null,
          comarca: f.comarca || null,
          classe: f.classe || null,
          ...(c ? { assunto: c.assunto, sistema: c.sistema, distribuidoEm: c.distribuidoEm, segredo: c.segredo } : {}),
          responsavelId: f.responsavelId || undefined,
          partes: partes(),
        },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["processos"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar(f.extrajudicial ? "Caso cadastrado." : c && (c.fontes.datajud === "achou" || c.fontes.djen === "achou") ? "Processo cadastrado com os dados do tribunal." : "Processo cadastrado. Os andamentos chegam do DataJud em instantes.");
      fechar();
      void navigate({ to: "/processos/$id", params: { id: r.id } });
    },
  });
  const pronto = (f.extrajudicial ? f.titulo.trim().length >= 2 : digitos.length === 20) && !c?.cadastrado;
  const doTribunal = (campo: "orgao" | "comarca") => (c && c[campo] && f[campo] === c[campo] ? "Veio do tribunal" : undefined);
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={fechar}
      titulo="Novo processo"
      descricao="Digite o número: o Decreta busca no tribunal a vara, as partes e o resto."
      acoes={
        <>
          <Botao variante="fantasma" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" type="submit" form="novo-processo" ocupado={criar.isPending} disabled={!pronto}>
            Cadastrar
          </Botao>
        </>
      }
    >
      <form
        id="novo-processo"
        className="dc-form"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate();
        }}
      >
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.extrajudicial} onChange={(e) => setF({ ...f, extrajudicial: e.target.checked })} /> Caso extrajudicial (sem número)
        </label>
        {f.extrajudicial ? (
          <Campo rotulo="Título do caso" htmlFor="pr-titulo">
            <input id="pr-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Revisão do contrato social" />
          </Campo>
        ) : (
          <>
            <Campo rotulo="Número do processo (CNJ)" htmlFor="pr-cnj">
              <input id="pr-cnj" className="dc-num" inputMode="numeric" value={f.cnj} onChange={(e) => setF({ ...f, cnj: e.target.value })} placeholder="0000000-00.0000.0.00.0000" autoFocus />
            </Campo>
            {buscar && <DoTribunal consulta={c} buscando={consulta.isFetching && !c} erro={consulta.error} doCliente={doCliente} aoEscolher={(i) => escolher(i)} aoCadastrar={(i) => setCadastrar(c?.partes[i]?.nome ?? "")} />}
          </>
        )}
        <Campo rotulo="Cliente">
          <EscolherCliente valor={cli} aoEscolher={setCli} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="O cliente é" htmlFor="pr-polo">
            <select id="pr-polo" value={f.poloCliente} onChange={(e) => setF({ ...f, poloCliente: e.target.value as "ativo" | "passivo" })}>
              <option value="ativo">Autor (polo ativo)</option>
              <option value="passivo">Réu (polo passivo)</option>
            </select>
          </Campo>
          <Campo rotulo="Outra parte" htmlFor="pr-outra">
            <input id="pr-outra" value={f.outraParte} onChange={(e) => setF({ ...f, outraParte: e.target.value })} />
          </Campo>
          <Campo rotulo="Vara ou órgão" htmlFor="pr-orgao" ajuda={doTribunal("orgao")}>
            <input id="pr-orgao" value={f.orgao} onChange={(e) => setF({ ...f, orgao: e.target.value })} placeholder="2ª Vara Cível" />
          </Campo>
          <Campo rotulo="Comarca" htmlFor="pr-comarca" ajuda={doTribunal("comarca")}>
            <input id="pr-comarca" value={f.comarca} onChange={(e) => setF({ ...f, comarca: e.target.value })} placeholder="Joinville" />
          </Campo>
        </div>
        <Campo rotulo="Responsável" htmlFor="pr-resp">
          <select id="pr-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
            <option value="">Eu</option>
            {eu.data?.equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </form>
      <NovoCliente
        aberto={cadastrar !== null}
        nomeInicial={cadastrar ?? undefined}
        aoFechar={() => setCadastrar(null)}
        aoCriar={(novo) => {
          setCli(novo);
          setCadastrar(null);
        }}
      />
    </Dialogo>
  );
}

const CANAIS: { id: Canal; rotulo: string }[] = [
  { id: "presencial", rotulo: "Presencial" },
  { id: "telefone", rotulo: "Telefone" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "video", rotulo: "Vídeo" },
  { id: "email", rotulo: "E-mail" },
];

export function NovoAtendimento({ aberto, aoFechar, cliente, processoId }: { aberto: boolean; aoFechar: () => void; cliente?: { id: string; nome: string; semIa?: boolean } | null; processoId?: string | null }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [cli, setCli] = useState<{ id: string; nome: string } | null>(cliente ?? null);
  const [canal, setCanal] = useState<Canal>("presencial");
  const [resumo, setResumo] = useState("");
  const [organizando, setOrganizando] = useState(false);
  const entradaDoAudio = useRef<HTMLInputElement>(null);
  /** O áudio da conversa vira texto no campo; daí a pessoa confere e, se quiser, a IA organiza. */
  const transcrever = useMutation({
    mutationFn: (audio: File) => {
      const form = new FormData();
      form.append("audio", audio);
      if (cli) form.append("clienteId", cli.id);
      return api<{ texto: string }>("/ia/transcrever", { form });
    },
    onSuccess: (r) => {
      setResumo((atual) => (atual.trim() ? `${atual.trimEnd()}\n\n${r.texto}` : r.texto));
      avisar("Áudio transcrito. Confira o texto antes de registrar.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const salvar = useMutation({
    mutationFn: () => api(`/clientes/${cli!.id}/atendimentos`, { json: { canal, resumo, processoId: processoId ?? null } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      avisar("Atendimento registrado.");
      setResumo("");
      aoFechar();
    },
  });
  /** A IA arruma o que foi anotado às pressas em resumo, pedidos e próximos passos. */
  const organizar = async () => {
    setOrganizando(true);
    try {
      const r = await api<{ situacao: "pronto" | "recusa"; conteudo: { resumo: string; pedidos: string[]; documentosPendentes: string[]; proximosPassos: string[]; recusa?: string } }>("/ia/atendimento", { json: { transcricao: resumo, clienteId: cli?.id ?? null } });
      const c = r.conteudo;
      if (r.situacao === "recusa") {
        avisar(c.recusa ?? "A IA não conseguiu organizar este texto.", { erro: true });
        return;
      }
      const bloco = (t: string, l: string[]) => (l.length ? `\n\n${t}:\n${l.map((x) => `- ${x}`).join("\n")}` : "");
      setResumo(`${c.resumo}${bloco("Pedidos", c.pedidos)}${bloco("Documentos pendentes", c.documentosPendentes)}${bloco("Próximos passos", c.proximosPassos)}`);
    } catch (err) {
      avisar(mensagemDoErro(err), { erro: true });
    } finally {
      setOrganizando(false);
    }
  };
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Registrar atendimento"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!cli || resumo.trim().length < 3}>
            Registrar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Cliente">
          <EscolherCliente valor={cli} aoEscolher={setCli} />
        </Campo>
        <div className="dc-chips" role="radiogroup" aria-label="Canal">
          {CANAIS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={canal === c.id} className={`dc-chip${canal === c.id ? " is-on" : ""}`} onClick={() => setCanal(c.id)}>
              {c.rotulo}
            </button>
          ))}
        </div>
        <Campo rotulo="O que foi conversado" htmlFor="at-resumo">
          <textarea id="at-resumo" rows={6} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder={eu.data?.ia && !cliente?.semIa ? "Anote do jeito que vier. A IA organiza em resumo, pedidos e próximos passos." : "Anote do jeito que vier."} />
        </Campo>
        {eu.data?.ia && !cliente?.semIa && (
          <div className="dc-linha-acoes">
            <input
              ref={entradaDoAudio}
              type="file"
              accept="audio/*"
              hidden
              aria-label="Áudio do atendimento"
              onChange={(ev) => {
                const audio = ev.target.files?.[0];
                ev.target.value = "";
                if (audio) transcrever.mutate(audio);
              }}
            />
            <Botao pequeno onClick={() => entradaDoAudio.current?.click()} ocupado={transcrever.isPending}>
              {transcrever.isPending ? "Transcrevendo…" : "Enviar áudio"}
            </Botao>
            <Botao variante="ia" pequeno onClick={organizar} ocupado={organizando} disabled={resumo.trim().length < 20}>
              Organizar com IA
            </Botao>
          </div>
        )}
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
