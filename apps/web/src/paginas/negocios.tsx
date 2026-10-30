/** Novos negócios: a triagem de quem chega, com o checklist da pasta, até virar cliente. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileText, MessageCircle, Plus, UserCheck } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { ConferenciaDaPasta } from "@/componentes/conferencia";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { Avatar, Botao, Cabecalho, Campo, Carregando, Chip, Faixa, Vazio } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCurto, diaDoInstante, telefone } from "@/lib/formato";
import type { EtapaNegocio, Negocio, Pasta, PastaDoNegocio } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { enquantoLe, Enviar, LeituraDaIa } from "./processo";

const ETAPAS: { id: EtapaNegocio; rotulo: string }[] = [
  { id: "triagem", rotulo: "Triagem" },
  { id: "repassado", rotulo: "Repassados" },
  { id: "concluido", rotulo: "Viraram clientes" },
  { id: "desistiu", rotulo: "Desistiram" },
];
const PASTA: Record<Pasta, { rotulo: string; classe: string }> = {
  completa: { rotulo: "Pasta completa", classe: "dc-selo--ok" },
  faltam_documentos: { rotulo: "Faltam documentos", classe: "dc-selo--breve" },
  sem_pasta: { rotulo: "Sem pasta", classe: "dc-selo--prazo" },
};

type Lista = { contagens: Partial<Record<EtapaNegocio, number>>; itens: Negocio[] };

export function NegociosPage() {
  const celular = useCelular();
  const q = useQuery({ queryKey: ["negocios"], queryFn: () => api<Lista>("/negocios?etapa=todos") });
  const [etapa, setEtapa] = useState<EtapaNegocio>("triagem");
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const itens = q.data?.itens ?? [];
  const n = (e: EtapaNegocio) => q.data?.contagens[e] ?? 0;
  const selecionado = itens.find((i) => i.id === aberto) ?? null;
  const sub = q.data ? `${n("triagem")} em triagem · ${n("repassado")} ${n("repassado") === 1 ? "repassado" : "repassados"} a um advogado` : " ";

  const cartao = (i: Negocio) => {
    const feitos = i.checklist.filter((c) => c.feito).length;
    return (
      <button key={i.id} type="button" className="dc-cartao w-full cursor-pointer text-left" onClick={() => setAberto(i.id)}>
        <span className="flex items-start justify-between gap-2">
          <span className="dc-cartao__titulo">{i.nome}</span>
          <span className="dc-nota dc-num flex-none">{diaCurto(diaDoInstante(i.em))}</span>
        </span>
        <span className="dc-cartao__linha">{[i.assunto, i.area].filter(Boolean).join(" · ")}</span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className={cn("dc-selo", PASTA[i.pasta].classe)}>{PASTA[i.pasta].rotulo}</span>
          {i.checklist.length > 0 && (
            <span className="dc-nota dc-num">
              {feitos}/{i.checklist.length}
            </span>
          )}
          <span className="ml-auto">
            <Avatar pessoa={i.responsavel} />
          </span>
        </span>
      </button>
    );
  };
  const vazio = (e: EtapaNegocio) => <Vazio titulo={e === "triagem" ? "Ninguém em triagem" : "Nada aqui"}>{e === "triagem" ? "Quem procura o escritório entra aqui até a pasta ficar pronta." : null}</Vazio>;

  const dialogos = (
    <>
      <NovoNegocio aberto={novo} aoFechar={() => setNovo(false)} />
      {selecionado && <VerNegocio n={selecionado} aoFechar={() => setAberto(null)} />}
    </>
  );

  if (celular) {
    const daEtapa = itens.filter((i) => i.etapa === etapa);
    return (
      <TelaCelular
        titulo="Novos negócios"
        sobre={q.data ? `${n("triagem")} em triagem` : " "}
        voltar
        direita={
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Novo negócio" onClick={() => setNovo(true)}>
            <Plus />
          </button>
        }
      >
        <div className="dc-chips">
          {ETAPAS.map((e) => (
            <Chip key={e.id} ligado={etapa === e.id} n={n(e.id)} onClick={() => setEtapa(e.id)}>
              {e.rotulo}
            </Chip>
          ))}
        </div>
        {!q.data ? <Carregando /> : daEtapa.length ? <div className="dc-lista">{daEtapa.map(cartao)}</div> : vazio(etapa)}
        {dialogos}
      </TelaCelular>
    );
  }
  return (
    <Pagina larga>
      <Cabecalho
        titulo="Novos negócios"
        sub={sub}
        acoes={
          <Botao variante="primaria" onClick={() => setNovo(true)}>
            <Plus /> Novo negócio
          </Botao>
        }
      />
      {!q.data ? (
        <Carregando />
      ) : (
        <div className="dc-quadro">
          {ETAPAS.map((e) => {
            const daEtapa = itens.filter((i) => i.etapa === e.id);
            return (
              <section key={e.id} className="dc-quadro__coluna">
                <div className="dc-quadro__topo">
                  {e.rotulo} <span>{n(e.id)}</span>
                </div>
                {daEtapa.length ? daEtapa.map(cartao) : e.id === "triagem" ? <div className="dc-painel">{vazio(e.id)}</div> : <div className="dc-quadro__vazio">Nada aqui</div>}
              </section>
            );
          })}
        </div>
      )}
      {dialogos}
    </Pagina>
  );
}

function NovoNegocio({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const vazio = { nome: "", telefone: "", assunto: "", area: "" };
  const [f, setF] = useState(vazio);
  const criar = useMutation({
    mutationFn: () => api("/negocios", { json: { nome: f.nome, telefone: f.telefone || null, assunto: f.assunto, area: f.area || null } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["negocios"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar("Negócio na triagem.");
      setF(vazio);
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo negócio"
      descricao="Quem procurou o escritório. A pasta começa com o checklist padrão."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={f.nome.trim().length < 2 || f.assunto.trim().length < 2}>
            Criar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Nome" htmlFor="nn-nome">
          <input id="nn-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </Campo>
        <Campo rotulo="Telefone ou WhatsApp" htmlFor="nn-tel">
          <input id="nn-tel" inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
        </Campo>
        <Campo rotulo="Assunto" htmlFor="nn-assunto">
          <input id="nn-assunto" value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} placeholder="Acidente de trânsito, seguradora não pagou" />
        </Campo>
        <Campo rotulo="Área" htmlFor="nn-area">
          <input id="nn-area" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="Cível, trabalhista, previdenciário" />
        </Campo>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function VerNegocio({ n, aoFechar }: { n: Negocio; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navigate = useNavigate();
  const eu = useQuery(euQuery);
  const [obs, setObs] = useState(n.observacoes ?? "");
  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: ["negocios"] });
    void qc.invalidateQueries({ queryKey: ["eu"] });
    void qc.invalidateQueries({ queryKey: ["hoje"] });
  };
  const mudar = useMutation({
    mutationFn: (corpo: Partial<Pick<Negocio, "etapa" | "checklist" | "observacoes" | "pasta">> & { responsavelId?: string | null }) => api(`/negocios/${n.id}`, { method: "PUT", json: corpo }),
    onSuccess: atualizar,
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const concluir = useMutation({
    mutationFn: () => api<{ clienteId: string }>(`/negocios/${n.id}/concluir`, { json: {} }),
    onSuccess: (r) => {
      atualizar();
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      avisar("Virou cliente do escritório.");
      aoFechar();
      void navigate({ to: "/clientes/$id", params: { id: r.clienteId } });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const zap = n.telefone ? `https://wa.me/${n.telefone.replace(/\D/g, "").replace(/^(?!55)/, "55")}` : null;
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={n.nome}
      descricao={[n.assunto, n.area, telefone(n.telefone)].filter(Boolean).join(" · ")}
      acoes={
        n.etapa === "concluido" ? (
          n.clienteId && (
            <Botao variante="primaria" onClick={() => void navigate({ to: "/clientes/$id", params: { id: n.clienteId! } })}>
              Abrir cliente
            </Botao>
          )
        ) : (
          <>
            {zap && (
              <a className="dc-btn dc-btn--secundaria dc-btn--md" href={zap} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            )}
            <Botao variante="primaria" onClick={() => concluir.mutate()} ocupado={concluir.isPending}>
              <UserCheck /> Virar cliente
            </Botao>
          </>
        )
      }
    >
      <div className="dc-form">
        <div className="dc-grade-2">
          <Campo rotulo="Etapa" htmlFor="vn-etapa">
            <select id="vn-etapa" value={n.etapa} onChange={(e) => mudar.mutate({ etapa: e.target.value as EtapaNegocio })}>
              {ETAPAS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Quem cuida" htmlFor="vn-resp">
            <select id="vn-resp" value={n.responsavel?.id ?? ""} onChange={(e) => mudar.mutate({ responsavelId: e.target.value || null })}>
              <option value="">Ninguém ainda</option>
              {eu.data?.equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="dc-campo">
          <div className="flex items-center justify-between gap-2">
            <label>Checklist da pasta</label>
            <span className={cn("dc-selo", PASTA[n.pasta].classe)}>{PASTA[n.pasta].rotulo}</span>
          </div>
          <div className="dc-painel">
            <div className="dc-linhas">
              {n.checklist.map((item, k) => (
                <label key={k} className="dc-linhas__item cursor-pointer items-center">
                  <input type="checkbox" className="dc-checa" checked={item.feito} onChange={(e) => mudar.mutate({ checklist: n.checklist.map((x, j) => (j === k ? { ...x, feito: e.target.checked } : x)) })} />
                  <span className={cn("text-[14px]", item.feito ? "text-[var(--tinta)]" : "text-[var(--tinta-2)]")}>{item.texto}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        {n.etapa !== "concluido" && <ArquivosDaPasta negocioId={n.id} />}
        <Campo rotulo="Observações" htmlFor="vn-obs">
          <textarea id="vn-obs" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} onBlur={() => obs !== (n.observacoes ?? "") && mudar.mutate({ observacoes: obs || null })} />
        </Campo>
      </div>
    </Dialogo>
  );
}

/** Os documentos que a pessoa trouxe na triagem e a conferência da IA antes de virar cliente. */
function ArquivosDaPasta({ negocioId }: { negocioId: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const q = useQuery({ queryKey: ["pasta", "negocio", negocioId], queryFn: () => api<PastaDoNegocio>(`/negocios/${negocioId}/pasta`), refetchInterval: enquantoLe });
  const conferir = useMutation({
    mutationFn: () => api(`/negocios/${negocioId}/conferir`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pasta", "negocio", negocioId] }),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const docs = q.data?.documentos ?? [];
  return (
    <div className="dc-campo">
      <div className="flex items-center justify-between gap-2">
        <label>Documentos da pasta</label>
        <Enviar negocioId={negocioId} />
      </div>
      {docs.length > 0 && (
        <div className="dc-painel">
          <div className="dc-linhas">
            {docs.map((d) => (
              <div key={d.id} className="dc-linhas__item items-center">
                <FileText className="size-4 flex-none text-[var(--tinta-3)]" />
                <a className="dc-celula__1 min-w-0 flex-1 truncate no-underline hover:underline" href={`${API_URL}/api/app/documentos/${d.id}/arquivo?ver=1`} target="_blank" rel="noreferrer">
                  {d.nome}
                </a>
                <LeituraDaIa d={d} reler />
              </div>
            ))}
          </div>
        </div>
      )}
      {q.data && (
        <ConferenciaDaPasta
          analise={q.data.conferencia}
          aoConferir={eu.data?.ia ? () => conferir.mutate() : undefined}
          conferindo={conferir.isPending}
          semDocumentos={!docs.some((d) => d.lido)}
        />
      )}
    </div>
  );
}
