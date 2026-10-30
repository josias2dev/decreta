/** Configurações do escritório: timbre das peças, avisos e captura, calendário forense e o registro. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Send, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { Abas, Botao, Cabecalho, Campo, Carregando, Faixa, Painel, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { ehSocio } from "@/lib/auth";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaCurto, diaDaSemana, diaDoInstante, hora } from "@/lib/formato";
import type { Escritorio, Feriados, Registro, RetornosDaIa, Timbre } from "@/lib/tipos";
import { Folha } from "./peca";

type Aba = "escritorio" | "avisos" | "calendario" | "ia" | "registro";
const FONTES = ["Arial", "Times New Roman", "Calibri", "Garamond"] as const;
const TRIBUNAIS = [
  { id: "TJSC", nome: "TJSC · Justiça estadual de Santa Catarina" },
  { id: "TRT12", nome: "TRT12 · Justiça do Trabalho em SC" },
  { id: "TRF4", nome: "TRF4 · Justiça Federal da 4ª Região" },
];
const TIPO_DE_SUSPENSAO = { local: "Feriado municipal", forense: "Sem expediente forense", recesso: "Recesso ou suspensão de prazos", reduzido: "Expediente reduzido" } as const;
const EXEMPLO = "# Excelentíssimo Senhor Doutor Juiz de Direito da 2ª Vara Cível da Comarca de Joinville/SC\n\nProcesso nº 0000000-00.2026.8.24.0038\n\n**FULANA DE TAL**, já qualificada nos autos, vem, por seus procuradores, manifestar-se sobre o laudo pericial.\n\n## 1. Da concordância com o laudo\n\nO perito confirmou o nexo causal e a incapacidade parcial.";

export const escritorioQuery = { queryKey: ["escritorio"], queryFn: () => api<Escritorio>("/escritorio") } as const;

export function ConfiguracoesPage() {
  const celular = useCelular();
  const eu = useQuery(euQuery);
  const q = useQuery(escritorioQuery);
  const [aba, setAba] = useState<Aba>("escritorio");
  const socio = ehSocio(eu.data?.usuario.papel);
  const abas = (
    <Abas
      pagina={!celular}
      ativa={aba}
      aoMudar={setAba}
      abas={[
        { id: "escritorio", rotulo: "Timbre" },
        { id: "avisos", rotulo: "Avisos e captura" },
        { id: "calendario", rotulo: "Calendário" },
        ...(socio ? [{ id: "ia" as const, rotulo: celular ? "IA" : "Retorno sobre a IA" }, { id: "registro" as const, rotulo: "Registro" }] : []),
      ]}
    />
  );
  const e = q.data;
  const corpo = !e ? (
    <Carregando />
  ) : aba === "escritorio" ? (
    <AbaTimbre e={e} socio={socio} celular={celular} />
  ) : aba === "avisos" ? (
    <AbaAvisos e={e} socio={socio} />
  ) : aba === "calendario" ? (
    <AbaCalendario e={e} socio={socio} celular={celular} />
  ) : aba === "ia" ? (
    <AbaRetorno celular={celular} />
  ) : (
    <AbaRegistro />
  );
  const soLeitura = e && !socio && <Faixa tipo="aviso">Só os sócios mudam as configurações. Você vê como estão.</Faixa>;
  if (celular) {
    return (
      <TelaCelular titulo="Configurações" sobre={eu.data?.escritorio.nome} voltar>
        <div className="-mx-4 px-4">{abas}</div>
        {soLeitura}
        {corpo}
      </TelaCelular>
    );
  }
  return (
    <Pagina>
      <div className="dc-topo-pagina">
        <Cabecalho titulo="Configurações" sub={eu.data?.escritorio.nome} />
        {abas}
      </div>
      {soLeitura}
      {corpo}
    </Pagina>
  );
}

function useSalvarEscritorio() {
  const qc = useQueryClient();
  const avisar = useAviso();
  return useMutation({
    mutationFn: (corpo: Partial<Pick<Escritorio, "tribunal" | "timbre" | "avisos" | "capturaDjen" | "capturaDatajud">>) => api("/escritorio", { method: "PUT", json: corpo }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["escritorio"] });
      avisar("Configuração salva.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
}

function AbaTimbre({ e, socio, celular }: { e: Escritorio; socio: boolean; celular: boolean }) {
  const salvar = useSalvarEscritorio();
  const qc = useQueryClient();
  const avisar = useAviso();
  const entrada = useRef<HTMLInputElement>(null);
  const t0 = e.timbre ?? { nome: e.nome };
  const [t, setT] = useState<Timbre>({ ...t0, fonte: t0.fonte ?? "Arial", tamanho: t0.tamanho ?? 12, cor: t0.cor ?? "#2F2E38" });
  const [tribunal, setTribunal] = useState(e.tribunal);
  const logo = useMutation({
    mutationFn: (f: File) => {
      const form = new FormData();
      form.set("logo", f);
      return api("/escritorio/logo", { form });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["escritorio"] });
      avisar("Logo guardado. Sai no alto das peças em DOCX.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const campo = (k: "nome" | "registro" | "endereco" | "contato", rotulo: string, placeholder?: string) => (
    <Campo rotulo={rotulo} htmlFor={`tb-${k}`}>
      <input id={`tb-${k}`} value={t[k] ?? ""} onChange={(ev) => setT({ ...t, [k]: ev.target.value })} placeholder={placeholder} disabled={!socio} />
    </Campo>
  );
  const limpo = (x: Timbre): Timbre => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== "" && v != null)) as unknown as Timbre;
  return (
    <div className={celular ? "flex flex-col gap-6" : "dc-colunas dc-colunas--meio"}>
      <Painel titulo="Timbre das peças">
        <div className="dc-form">
          {campo("nome", "Nome no timbre")}
          {campo("registro", "Registro na OAB", "OAB/SC 0.000")}
          {campo("endereco", "Endereço", "Rua, número, sala, cidade/UF")}
          {campo("contato", "Contato", "(47) 3000-0000 · contato@escritorio.adv.br")}
          <div className="dc-grade-2">
            <Campo rotulo="Fonte" htmlFor="tb-fonte">
              <select id="tb-fonte" value={t.fonte} onChange={(ev) => setT({ ...t, fonte: ev.target.value })} disabled={!socio}>
                {FONTES.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Tamanho" htmlFor="tb-tam">
              <select id="tb-tam" value={t.tamanho} onChange={(ev) => setT({ ...t, tamanho: Number(ev.target.value) })} disabled={!socio}>
                {[10, 11, 12, 13, 14].map((n) => (
                  <option key={n} value={n}>
                    {n} pt
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Cor do timbre" htmlFor="tb-cor">
              <span className="flex items-center gap-2">
                <input id="tb-cor" type="color" value={t.cor} onChange={(ev) => setT({ ...t, cor: ev.target.value })} disabled={!socio} className="dc-cor" />
                <span className="dc-num text-[13px] uppercase text-[var(--tinta-2)]">{t.cor}</span>
              </span>
            </Campo>
            <Campo rotulo="Logo (PNG)" htmlFor="tb-logo" ajuda={e.timbre?.logoDocumentoId ? "Logo guardado" : "Sem logo"}>
              <input ref={entrada} id="tb-logo" type="file" accept="image/png" hidden onChange={(ev) => ev.target.files?.[0] && logo.mutate(ev.target.files[0])} />
              <span className="flex items-center gap-3">
                {e.timbre?.logoDocumentoId && <img src={`/api/app/escritorio/logo?v=${e.timbre.logoDocumentoId}`} alt="Logo do escritório" className="dc-logo-previa" />}
                <Botao onClick={() => entrada.current?.click()} ocupado={logo.isPending} disabled={!socio}>
                  <Upload /> {e.timbre?.logoDocumentoId ? "Trocar logo" : "Enviar logo"}
                </Botao>
              </span>
            </Campo>
          </div>
          <Campo rotulo="Tribunal principal" htmlFor="tb-trib" ajuda="Define o calendário de feriados forenses da contagem dos prazos.">
            <select id="tb-trib" value={tribunal} onChange={(ev) => setTribunal(ev.target.value)} disabled={!socio}>
              {TRIBUNAIS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </Campo>
          {socio && (
            <Botao className="md:self-start" variante="primaria" onClick={() => salvar.mutate({ timbre: limpo(t), tribunal })} ocupado={salvar.isPending} disabled={(t.nome ?? "").trim().length < 2}>
              Salvar timbre
            </Botao>
          )}
        </div>
      </Painel>
      <Painel titulo="Como sai na peça">
        <div className="dc-folha-fundo" style={{ borderRadius: 8 }}>
          <Folha texto={EXEMPLO} timbre={t} />
        </div>
      </Painel>
    </div>
  );
}

function Interruptor({ rotulo, ajuda, ligado, aoMudar, desligado }: { rotulo: string; ajuda?: string; ligado: boolean; aoMudar: (v: boolean) => void; desligado?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-[14px] font-medium">{rotulo}</span>
        {ajuda && <span className="dc-nota">{ajuda}</span>}
      </span>
      <input type="checkbox" className="dc-interruptor mt-0.5" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} disabled={desligado} />
    </label>
  );
}

function AbaAvisos({ e, socio }: { e: Escritorio; socio: boolean }) {
  const salvar = useSalvarEscritorio();
  const avisar = useAviso();
  const [horaDoAviso, setHora] = useState(e.avisos.hora);
  const teste = useMutation({
    mutationFn: () => api<{ texto: string }>("/avisos/teste", { method: "POST" }),
    onSuccess: () => avisar("Mandei o resumo de hoje no seu WhatsApp."),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const estado = (ligado: boolean, sim: string, nao: string) => <span className={ligado ? "text-[var(--cumprido)]" : "text-[var(--hoje)]"}>{ligado ? sim : nao}</span>;
  return (
    <div className="dc-colunas dc-colunas--meio max-md:!grid-cols-1">
      <Painel titulo="Resumo da manhã no WhatsApp">
        <div className="dc-form">
          <Interruptor
            rotulo="Mandar o resumo de manhã"
            ajuda="Cada pessoa com WhatsApp no perfil recebe o que vence no dia, as audiências e as publicações novas."
            ligado={e.avisos.manha}
            aoMudar={(manha) => salvar.mutate({ avisos: { manha, hora: horaDoAviso } })}
            desligado={!socio}
          />
          <Campo rotulo="Horário" htmlFor="av-hora" ajuda="De segunda a sexta. Sai depois da busca das 06:40 no DJEN.">
            <input id="av-hora" type="time" value={horaDoAviso} min="06:45" max="10:45" step={900} onChange={(ev) => setHora(ev.target.value)} onBlur={() => horaDoAviso !== e.avisos.hora && salvar.mutate({ avisos: { manha: e.avisos.manha, hora: horaDoAviso } })} disabled={!socio} />
          </Campo>
          <p className="dc-nota m-0">WhatsApp do Decreta: {estado(e.whatsappLigado, "ligado", "ainda não ligado neste servidor")}</p>
          <Botao onClick={() => teste.mutate()} ocupado={teste.isPending} disabled={!e.whatsappLigado}>
            <Send /> Mandar teste para o meu WhatsApp
          </Botao>
        </div>
      </Painel>
      <Painel titulo="Captura automática">
        <div className="dc-form">
          {e.demonstracao && <Faixa tipo="aviso">Na demonstração a busca fica desligada: as OABs e os números de processo são inventados.</Faixa>}
          <Interruptor rotulo="Publicações do DJEN" ajuda="Busca pelas OABs da equipe às 06:40, 12:40 e 18:40, de segunda a sexta." ligado={e.capturaDjen} aoMudar={(v) => salvar.mutate({ capturaDjen: v })} desligado={!socio || e.demonstracao} />
          <Interruptor
            rotulo="Movimentações do DataJud"
            ajuda="Atualiza as movimentações dos processos ativos toda madrugada, às 05:00."
            ligado={e.capturaDatajud}
            aoMudar={(v) => salvar.mutate({ capturaDatajud: v })}
            desligado={!socio || e.demonstracao}
          />
          <div className="flex flex-col gap-1">
            <p className="dc-nota m-0">Chave do DataJud: {estado(e.datajudLigado, "configurada", "falta no servidor")}</p>
            <p className="dc-nota m-0">IA do escritório: {estado(e.iaLigada, "ligada", "ainda não ligada neste servidor")}</p>
          </div>
        </div>
      </Painel>
    </div>
  );
}

function AbaCalendario({ e, socio, celular }: { e: Escritorio; socio: boolean; celular: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const anoAtual = Number((eu.data?.hoje ?? "2026").slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const feriados = useQuery({ queryKey: ["feriados", ano], queryFn: () => api<Feriados>(`/feriados?ano=${ano}`) });
  const [nova, setNova] = useState(false);
  const tirar = useMutation({
    mutationFn: (id: string) => api(`/suspensoes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      for (const k of ["escritorio", "feriados", "prazos", "calcular"]) void qc.invalidateQueries({ queryKey: [k] });
      avisar("Dia tirado. Os prazos novos já contam sem ele.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const f = feriados.data;
  return (
    <div className={celular ? "flex flex-col gap-6" : "dc-colunas"}>
      <Painel
        titulo={`Feriados de ${ano} · ${f?.tribunal ?? e.tribunal}`}
        acao={
          <span className="flex gap-1">
            {[anoAtual, anoAtual + 1].map((a) => (
              <Botao key={a} variante={a === ano ? "secundaria" : "fantasma"} pequeno onClick={() => setAno(a)}>
                {a}
              </Botao>
            ))}
          </span>
        }
        corpo={false}
      >
        {!f ? (
          <div className="p-4">
            <Carregando linhas={3} />
          </div>
        ) : (
          <>
            <div className="dc-linhas">
              {f.dias.map((d) => (
                <div key={`${d.dia}-${d.nome}`} className="dc-linhas__item items-center">
                  <span className="dc-num w-[52px] flex-none font-medium">{diaCurto(d.dia)}</span>
                  <span className="dc-celula min-w-0 flex-1">
                    <span className="dc-celula__1">{d.nome}</span>
                    <span className="dc-celula__2">
                      {diaDaSemana(d.dia)} · {d.origem === "lei" ? "feriado nacional" : d.origem}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="dc-rodape-lista">
              Suspensão de prazos de fim de ano: {diaCurto(f.suspensaoDeFimDeAno.de)} a {diaCompleto(f.suspensaoDeFimDeAno.ate)} (art. 220 do CPC).
            </div>
          </>
        )}
      </Painel>
      <Painel
        titulo="Dias que o escritório marcou"
        acao={
          socio && (
            <Botao variante="fantasma" pequeno onClick={() => setNova(true)}>
              <Plus /> Marcar
            </Botao>
          )
        }
        corpo={false}
      >
        {e.suspensoes.length ? (
          <div className="dc-linhas">
            {e.suspensoes.map((s) => (
              <div key={s.id} className="dc-linhas__item items-center">
                <span className="dc-num w-[52px] flex-none font-medium">{diaCurto(s.dia)}</span>
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">{s.motivo}</span>
                  <span className="dc-celula__2">{[TIPO_DE_SUSPENSAO[s.tipo], s.comarca].filter(Boolean).join(" · ")}</span>
                </span>
                {socio && (
                  <button type="button" className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Tirar ${s.motivo}`} onClick={() => tirar.mutate(s.id)}>
                    <Trash2 />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Vazio titulo="Nenhum dia marcado">Feriado municipal, falha no sistema do tribunal ou suspensão por portaria: marque aqui e a contagem já desconta.</Vazio>
        )}
      </Painel>
      <NovaSuspensao aberto={nova} aoFechar={() => setNova(false)} />
    </div>
  );
}

function NovaSuspensao({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const vazio = { dia: "", ate: "", motivo: "", tipo: "local" as keyof typeof TIPO_DE_SUSPENSAO, comarca: "" };
  const [f, setF] = useState(vazio);
  const criar = useMutation({
    mutationFn: () => api<{ dias: number }>("/suspensoes", { json: { dia: f.dia, ate: f.ate || undefined, motivo: f.motivo, tipo: f.tipo, comarca: f.comarca || null } }),
    onSuccess: (r) => {
      for (const k of ["escritorio", "feriados", "calcular"]) void qc.invalidateQueries({ queryKey: [k] });
      avisar(r.dias === 1 ? "Dia marcado." : `${r.dias} dias marcados.`);
      setF(vazio);
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Marcar dia sem prazo"
      descricao="Vale para os prazos contados daqui em diante. Os já confirmados não mudam sozinhos: ajuste se precisar."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={!f.dia || f.motivo.trim().length < 2}>
            Marcar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <div className="dc-grade-2">
          <Campo rotulo="De" htmlFor="ns-dia">
            <input id="ns-dia" type="date" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} />
          </Campo>
          <Campo rotulo="Até (opcional)" htmlFor="ns-ate">
            <input id="ns-ate" type="date" value={f.ate} min={f.dia} onChange={(e) => setF({ ...f, ate: e.target.value })} />
          </Campo>
        </div>
        <Campo rotulo="Motivo" htmlFor="ns-motivo">
          <input id="ns-motivo" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Aniversário de Joinville" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Tipo" htmlFor="ns-tipo">
            <select id="ns-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as keyof typeof TIPO_DE_SUSPENSAO })}>
              {Object.entries(TIPO_DE_SUSPENSAO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Comarca (opcional)" htmlFor="ns-comarca" ajuda="Vazio vale para todas">
            <input id="ns-comarca" value={f.comarca} onChange={(e) => setF({ ...f, comarca: e.target.value })} placeholder="Joinville" />
          </Campo>
        </div>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

/** Onde está a saída avaliada, para abrir e ver. */
function Abrir({ onde, celular }: { onde: RetornosDaIa["errados"][number]["onde"]; celular: boolean }) {
  if (!onde) return null;
  const rotulo = "Abrir";
  if (onde.tipo === "peca") return <Link to="/pecas" search={{ id: onde.id }} className="dc-link flex-none">{rotulo}</Link>;
  if (onde.tipo === "publicacao")
    return celular ? <Link to="/publicacoes/$id" params={{ id: onde.id }} className="dc-link flex-none">{rotulo}</Link> : <Link to="/publicacoes" search={{ id: onde.id }} className="dc-link flex-none">{rotulo}</Link>;
  if (onde.tipo === "prazo") return <Link to="/prazos/$id" params={{ id: onde.id }} className="dc-link flex-none">{rotulo}</Link>;
  if (onde.tipo === "processo") return <Link to="/processos/$id" params={{ id: onde.id }} className="dc-link flex-none">{rotulo}</Link>;
  if (onde.tipo === "audiencia") return <Link to="/audiencias/$id" params={{ id: onde.id }} className="dc-link flex-none">{rotulo}</Link>;
  if (onde.tipo === "cliente") return <Link to="/clientes/$id" params={{ id: onde.id }} className="dc-link flex-none">{rotulo}</Link>;
  if (onde.tipo === "negocio") return <Link to="/negocios" className="dc-link flex-none">{rotulo}</Link>;
  return null;
}

/** Para os sócios: quanto a equipe achou útil cada leitura da IA, e o que disse que estava errado. */
function AbaRetorno({ celular }: { celular: boolean }) {
  const eu = useQuery(euQuery);
  const q = useQuery({ queryKey: ["ia", "retornos"], queryFn: () => api<RetornosDaIa>("/ia/retornos") });
  if (!q.data) return <Carregando linhas={4} />;
  const { porAcao, errados } = q.data;
  if (!porAcao.length) {
    return (
      <Painel titulo="Retorno sobre a IA">
        <Vazio titulo="Ninguém avaliou a IA ainda">Cada leitura da IA e cada peça têm os botões Útil e Errado no rodapé. O que a equipe marcar aparece aqui.</Vazio>
      </Painel>
    );
  }
  return (
    <div className="dc-pilha">
      <Painel titulo="Como a IA está indo" acao={<span className="dc-nota">Últimos 90 dias</span>} corpo={false}>
        <div className="dc-linhas">
          {porAcao.map((a) => (
            <div key={a.acao} className="dc-linhas__item items-center">
              <span className="min-w-0 flex-1 text-[14px] font-medium">{a.rotulo}</span>
              <span className="dc-num flex-none text-[13px] text-[var(--tinta-2)]">
                {a.uteis} {a.uteis === 1 ? "útil" : "úteis"} · {a.errados} {a.errados === 1 ? "errado" : "errados"}
              </span>
            </div>
          ))}
        </div>
      </Painel>
      <Painel titulo="O que estava errado" corpo={false}>
        {errados.length ? (
          <div className="dc-linhas">
            {errados.map((r) => (
              <div key={r.id} className="dc-linhas__item">
                <span className="dc-num w-[92px] flex-none text-[13px] text-[var(--tinta-2)]">{diaDoInstante(r.em) === eu.data?.hoje ? hora(r.em) : diaCurto(diaDoInstante(r.em))}</span>
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">{r.rotulo}</span>
                  <span className="dc-celula__2">{[r.comentario ?? "Sem comentário", r.pessoa?.apelido].filter(Boolean).join(" · ")}</span>
                </span>
                <Abrir onde={r.onde} celular={celular} />
              </div>
            ))}
          </div>
        ) : (
          <Vazio titulo="Nada marcado como errado" />
        )}
      </Painel>
    </div>
  );
}

function AbaRegistro() {
  const eu = useQuery(euQuery);
  const q = useQuery({ queryKey: ["registro"], queryFn: () => api<Registro>("/registro") });
  return (
    <Painel titulo="Quem fez o quê" acao={<span className="dc-nota">Os últimos registros, para a segurança do escritório</span>} corpo={false}>
      {!q.data ? (
        <div className="p-4">
          <Carregando linhas={4} />
        </div>
      ) : q.data.itens.length ? (
        <div className="dc-linhas">
          {q.data.itens.map((r) => (
            <div key={r.id} className="dc-linhas__item">
              <span className="dc-num w-[92px] flex-none text-[13px] text-[var(--tinta-2)]">{diaDoInstante(r.em) === eu.data?.hoje ? hora(r.em) : `${diaCurto(diaDoInstante(r.em))} ${hora(r.em)}`}</span>
              <span className="dc-celula min-w-0 flex-1">
                <span className="dc-celula__1">{r.rotulo}</span>
                <span className="dc-celula__2">{r.nome ?? "Sistema"}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Vazio titulo="Nada registrado ainda" />
      )}
    </Painel>
  );
}
