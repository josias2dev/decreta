/**
 * Configuração inicial do escritório (/comecar), logo depois do cadastro: uma
 * etapa por tela — você, o escritório, o Diário e os avisos — e os atalhos
 * para começar. Cada etapa grava pelas rotas que já existem; "Pular" segue
 * sem gravar. O estado (pendente ou concluído) fica em `escritorios`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, FolderPlus, Sparkles, Sun, UserPlus, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Marca } from "@/componentes/marca";
import { Botao, Campo, Carregando, Faixa } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import type { Escritorio, Eu } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { escritorioQuery } from "./configuracoes";

const ETAPAS = [
  { id: "voce", rotulo: "Você" },
  { id: "escritorio", rotulo: "Escritório" },
  { id: "diario", rotulo: "Diário e avisos" },
  { id: "pronto", rotulo: "Pronto" },
] as const;
type Etapa = (typeof ETAPAS)[number]["id"];

const TRIBUNAIS = [
  { id: "TJSC", nome: "TJSC · Justiça estadual de Santa Catarina" },
  { id: "TRT12", nome: "TRT12 · Justiça do Trabalho em SC" },
  { id: "TRF4", nome: "TRF4 · Justiça Federal da 4ª Região" },
];
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"];

/** O app abre em /comecar uma vez por sessão do navegador enquanto a configuração está pendente. */
const CHAVE = "dc-comecar-aberto";
export function comecarJaAberto(): boolean {
  try {
    return sessionStorage.getItem(CHAVE) === "1";
  } catch {
    return true;
  }
}
export function marcarComecarAberto() {
  try {
    sessionStorage.setItem(CHAVE, "1");
  } catch {
    // Sem armazenamento (navegação privada estrita): só não repete o redirecionamento.
  }
}

/** Conclui a configuração inicial (ou a dispensa de vez) e atualiza o /eu. */
function useConcluir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/escritorio/onboarding", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eu"] }),
  });
}

/** O aviso discreto do Hoje enquanto a configuração está pendente. */
export function TerminarDeConfigurar({ eu }: { eu: Eu | undefined }) {
  const concluir = useConcluir();
  if (!eu?.escritorio.onboarding) return null;
  return (
    <div className="dc-comecar-aviso" role="status">
      <Sparkles aria-hidden />
      <Link to="/comecar" className="dc-comecar-aviso__link">
        Terminar de configurar o escritório
      </Link>
      <span className="dc-comecar-aviso__sep" aria-hidden>
        ·
      </span>
      <button type="button" className="dc-comecar-aviso__fechar" onClick={() => concluir.mutate()} disabled={concluir.isPending}>
        Não mostrar mais
      </button>
    </div>
  );
}

export function ComecarPage() {
  const eu = useQuery(euQuery);
  const escritorio = useQuery(escritorioQuery);
  const [etapa, setEtapa] = useState<Etapa>("voce");
  const n = ETAPAS.findIndex((e) => e.id === etapa);
  const ir = (passo: 1 | -1) => setEtapa(ETAPAS[Math.min(ETAPAS.length - 1, Math.max(0, n + passo))]!.id);

  return (
    <div className="dc dc-comecar">
      <header className="dc-comecar__topo">
        <Marca />
        {etapa !== "pronto" && (
          <button type="button" className="dc-comecar__pular" onClick={() => ir(1)}>
            Pular esta etapa
          </button>
        )}
      </header>
      <main className="dc-comecar__meio">
        <ol className="dc-comecar__progresso" aria-label="Etapas">
          {ETAPAS.map((e, i) => (
            <li key={e.id} className={cn(i < n && "is-feita", i === n && "is-atual")} aria-current={i === n ? "step" : undefined}>
              <span className="dc-comecar__traco" aria-hidden />
              <span className="dc-comecar__rotulo">{e.rotulo}</span>
            </li>
          ))}
        </ol>
        {!eu.data || !escritorio.data ? (
          <section className="dc-comecar__cartao">
            <Carregando linhas={3} />
          </section>
        ) : etapa === "voce" ? (
          <EtapaVoce key="voce" eu={eu.data} n={n} aoSeguir={() => ir(1)} />
        ) : etapa === "escritorio" ? (
          <EtapaEscritorio key="escritorio" eu={eu.data} e={escritorio.data} n={n} aoVoltar={() => ir(-1)} aoSeguir={() => ir(1)} />
        ) : etapa === "diario" ? (
          <EtapaDiario key="diario" e={escritorio.data} n={n} aoVoltar={() => ir(-1)} aoSeguir={() => ir(1)} />
        ) : (
          <EtapaPronto eu={eu.data} />
        )}
      </main>
    </div>
  );
}

function Cartao({ n, titulo, sub, children }: { n: number; titulo: string; sub: ReactNode; children: ReactNode }) {
  return (
    <section className="dc-comecar__cartao" aria-labelledby="comecar-titulo">
      <p className="dc-comecar__passo">
        Etapa {n + 1} de {ETAPAS.length}
      </p>
      <h1 id="comecar-titulo" className="dc-comecar__titulo">
        {titulo}
      </h1>
      <p className="dc-comecar__sub">{sub}</p>
      {children}
    </section>
  );
}

function Pe({ aoVoltar, ocupado, pronto = true, rotulo = "Continuar" }: { aoVoltar?: () => void; ocupado: boolean; pronto?: boolean; rotulo?: string }) {
  return (
    <div className="dc-comecar__pe">
      {aoVoltar ? (
        <Botao variante="fantasma" onClick={aoVoltar}>
          <ArrowLeft /> Voltar
        </Botao>
      ) : (
        <span />
      )}
      <Botao type="submit" variante="primaria" ocupado={ocupado} disabled={!pronto}>
        {rotulo}
        <ArrowRight />
      </Botao>
    </div>
  );
}

function Interruptor({ rotulo, ajuda, ligado, aoMudar, id }: { rotulo: string; ajuda: string; ligado: boolean; aoMudar: (v: boolean) => void; id: string }) {
  return (
    <label className="dc-comecar__opcao" htmlFor={id}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14px] font-medium">{rotulo}</span>
        <span className="dc-nota">{ajuda}</span>
      </span>
      <input id={id} type="checkbox" className="dc-interruptor mt-0.5" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} />
    </label>
  );
}

/** Etapa 1: cargo, OAB (a que guia a busca no Diário) e o WhatsApp do resumo da manhã. */
function EtapaVoce({ eu, n, aoSeguir }: { eu: Eu; n: number; aoSeguir: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ cargo: eu.usuario.cargo ?? "", oabNumero: "", oabUf: "SC", whatsapp: "" });
  const semUf = f.oabNumero.trim() !== "" && !f.oabUf;
  const salvar = useMutation({
    mutationFn: () =>
      api(`/equipe/${eu.usuario.id}`, {
        method: "PUT",
        json: {
          cargo: f.cargo.trim() || null,
          ...(f.oabNumero.trim() ? { oabNumero: f.oabNumero.replace(/\D/g, ""), oabUf: f.oabUf } : {}),
          ...(f.whatsapp.trim() ? { whatsapp: f.whatsapp.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["eu"] });
      aoSeguir();
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };
  return (
    <Cartao n={n} titulo={`Olá, ${eu.usuario.apelido}`} sub="Como você aparece para a equipe e como o Decreta encontra as suas publicações.">
      <form className="dc-form" onSubmit={enviar}>
        <Campo rotulo="Cargo" htmlFor="co-cargo">
          <input id="co-cargo" placeholder="Advogada" autoComplete="organization-title" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} autoFocus />
        </Campo>
        <div className="dc-campo">
          <label htmlFor="co-oab">OAB</label>
          <div className="dc-comecar__oab">
            <input id="co-oab" inputMode="numeric" placeholder="41233" value={f.oabNumero} onChange={(e) => setF({ ...f, oabNumero: e.target.value.replace(/\D/g, "").slice(0, 7) })} />
            <select aria-label="UF da OAB" value={f.oabUf} onChange={(e) => setF({ ...f, oabUf: e.target.value })}>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>
          {semUf ? <span className="dc-erro-campo">Informe a UF junto com o número.</span> : <span className="dc-campo__ajuda">É por esta OAB que o Decreta busca as suas publicações no Diário (DJEN), todo dia útil.</span>}
        </div>
        <Campo rotulo="WhatsApp (opcional)" htmlFor="co-zap" ajuda="Para o resumo da manhã com os seus prazos do dia.">
          <input id="co-zap" inputMode="tel" autoComplete="tel" placeholder="(47) 99123-4567" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
        </Campo>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
        <Pe ocupado={salvar.isPending} pronto={!semUf} />
      </form>
    </Cartao>
  );
}

/** Etapa 2: o timbre, a cidade, o tribunal padrão e o WhatsApp oficial. */
function EtapaEscritorio({ eu, e, n, aoVoltar, aoSeguir }: { eu: Eu; e: Escritorio; n: number; aoVoltar: () => void; aoSeguir: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ nome: e.timbre?.nome ?? eu.escritorio.nome, cidade: e.timbre?.endereco ?? "", tribunal: e.tribunal, whatsappOficial: e.whatsappOficial ?? "" });
  const salvar = useMutation({
    mutationFn: () =>
      api("/escritorio", {
        method: "PUT",
        json: {
          timbre: { ...(e.timbre ?? {}), nome: f.nome.trim(), endereco: f.cidade.trim() || undefined },
          tribunal: f.tribunal,
          whatsappOficial: f.whatsappOficial.trim() || null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["escritorio"] });
      aoSeguir();
    },
  });
  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    salvar.mutate();
  };
  return (
    <Cartao n={n} titulo="O escritório" sub="O que vai no timbre das peças e nas mensagens ao cliente.">
      <form className="dc-form" onSubmit={enviar}>
        <Campo rotulo="Nome no timbre" htmlFor="co-nome">
          <input id="co-nome" value={f.nome} onChange={(ev) => setF({ ...f, nome: ev.target.value })} autoFocus />
        </Campo>
        <Campo rotulo="Cidade e UF" htmlFor="co-cidade" ajuda="Fica embaixo do nome no timbre.">
          <input id="co-cidade" placeholder="Joinville/SC" autoComplete="address-level2" value={f.cidade} onChange={(ev) => setF({ ...f, cidade: ev.target.value })} />
        </Campo>
        <Campo rotulo="Tribunal padrão" htmlFor="co-tribunal" ajuda="O calendário forense que conta os prazos quando o processo não diz outro.">
          <select id="co-tribunal" value={f.tribunal} onChange={(ev) => setF({ ...f, tribunal: ev.target.value })}>
            {TRIBUNAIS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="WhatsApp oficial do escritório (opcional)" htmlFor="co-oficial" ajuda="Vai no rodapé de toda mensagem ao cliente, para ele saber de que número o escritório fala. Contra o golpe do falso advogado.">
          <input id="co-oficial" inputMode="tel" placeholder="(47) 3433-1000" value={f.whatsappOficial} onChange={(ev) => setF({ ...f, whatsappOficial: ev.target.value })} />
        </Campo>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
        <Pe aoVoltar={aoVoltar} ocupado={salvar.isPending} pronto={f.nome.trim().length >= 2} />
      </form>
    </Cartao>
  );
}

/** Etapa 3: a captura do DJEN e o resumo da manhã. */
function EtapaDiario({ e, n, aoVoltar, aoSeguir }: { e: Escritorio; n: number; aoVoltar: () => void; aoSeguir: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ capturaDjen: e.capturaDjen, manha: e.avisos.manha, hora: e.avisos.hora });
  const salvar = useMutation({
    mutationFn: () => api("/escritorio", { method: "PUT", json: { capturaDjen: f.capturaDjen, avisos: { manha: f.manha, hora: f.hora } } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["escritorio"] });
      aoSeguir();
    },
  });
  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    salvar.mutate();
  };
  return (
    <Cartao n={n} titulo="Diário e avisos" sub="O que o Decreta faz sozinho todo dia útil.">
      <form className="dc-form" onSubmit={enviar}>
        <Interruptor
          id="co-djen"
          rotulo="Publicações do DJEN"
          ajuda="Lê o caderno de cada tribunal de madrugada e busca pelas OABs da equipe três vezes por dia. Cada intimação chega explicada, com o prazo sugerido."
          ligado={f.capturaDjen}
          aoMudar={(v) => setF({ ...f, capturaDjen: v })}
        />
        <Interruptor id="co-manha" rotulo="Resumo da manhã no WhatsApp" ajuda="Cada pessoa recebe os próprios prazos do dia, com o link do briefing." ligado={f.manha} aoMudar={(v) => setF({ ...f, manha: v })} />
        {f.manha && (
          <Campo rotulo="Hora do resumo" htmlFor="co-hora">
            <input id="co-hora" type="time" min="06:45" max="10:45" step={900} value={f.hora} onChange={(ev) => setF({ ...f, hora: ev.target.value })} className="max-w-[140px]" />
          </Campo>
        )}
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
        <Pe aoVoltar={aoVoltar} ocupado={salvar.isPending} />
      </form>
    </Cartao>
  );
}

/** Etapa 4: três atalhos; qualquer um conclui a configuração. */
function EtapaPronto({ eu }: { eu: Eu }) {
  const navigate = useNavigate();
  const concluir = useConcluir();
  const seguir = (to: "/processos" | "/equipe" | "/hoje") =>
    concluir.mutate(undefined, {
      onSettled: () => void navigate(to === "/processos" ? { to, search: { novo: true } } : { to }),
    });
  const atalhos = [
    { to: "/processos" as const, icone: FolderPlus, titulo: "Cadastrar o primeiro processo", linha: "Digite o número CNJ e o Decreta busca as partes, a classe e os andamentos." },
    { to: "/equipe" as const, icone: UserPlus, titulo: "Convidar a equipe", linha: "Cada pessoa entra com a própria conta; as OABs guiam a busca no Diário." },
    { to: "/hoje" as const, icone: Sun, titulo: "Ver o Hoje", linha: "Prazos, audiências e publicações do dia, com a urgência e o responsável." },
  ];
  return (
    <section className="dc-comecar__cartao dc-comecar__cartao--pronto" aria-labelledby="comecar-titulo">
      <span className="dc-comecar__ok" aria-hidden>
        <Check />
      </span>
      <h1 id="comecar-titulo" className="dc-comecar__titulo">
        Tudo pronto, {eu.usuario.apelido}
      </h1>
      <p className="dc-comecar__sub">{eu.escritorio.nome} já está no Decreta. Por onde quer começar?</p>
      <div className="dc-comecar__atalhos">
        {atalhos.map((a) => (
          <button key={a.to} type="button" className="dc-comecar__atalho" onClick={() => seguir(a.to)} disabled={concluir.isPending}>
            <span className="dc-comecar__atalho-icone">
              <a.icone />
            </span>
            <span className="min-w-0">
              <strong>{a.titulo}</strong>
              <small>{a.linha}</small>
            </span>
            <ArrowRight className="dc-comecar__atalho-seta" aria-hidden />
          </button>
        ))}
      </div>
      {concluir.error && (
        <Faixa tipo="erro">
          <X /> {mensagemDoErro(concluir.error)}
        </Faixa>
      )}
    </section>
  );
}
