import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, FolderPlus, MessageSquarePlus, UserPlus } from "lucide-react";
import { useState } from "react";
import { BotaoBuscar, Pagina, TelaCelular } from "@/componentes/moldura";
import { NovoAtendimento, NovoCliente, NovoProcesso } from "@/componentes/novos";
import { Avatar, Botao, Cabecalho, Carregando, Chip, Cnj, MarcaIa, Painel, Responsavel, Selo, Vazio } from "@/componentes/ui";
import { api } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import type { ItemDoDia, PainelDoDia } from "@/lib/tipos";

type Filtro = "tudo" | "prazo" | "audiencia" | "tarefa";

export const hojeQuery = { queryKey: ["hoje"], queryFn: () => api<PainelDoDia>("/hoje"), refetchInterval: 60_000 } as const;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function HojePage() {
  const celular = useCelular();
  const eu = useQuery(euQuery);
  const painel = useQuery(hojeQuery);
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [novo, setNovo] = useState<"cliente" | "processo" | "atendimento" | null>(null);

  const p = painel.data;
  const itens = p?.itens.filter((i) => filtro === "tudo" || i.tipo === filtro) ?? [];
  const conta = (t: Filtro) => (t === "tudo" ? (p?.itens.length ?? 0) : (p?.itens.filter((i) => i.tipo === t).length ?? 0));
  const rotuloDoDia = p ? p.rotulo.charAt(0).toUpperCase() + p.rotulo.slice(1) : "";
  const sub = p ? `${rotuloDoDia} · ${plural(p.itens.length, "item no dia", "itens no dia")}${p.contadores.vencidos ? `, ${plural(p.contadores.vencidos, "vencido", "vencidos")}` : ""}` : "";

  const chips = (
    <div className="dc-chips">
      <Chip ligado={filtro === "tudo"} n={conta("tudo")} onClick={() => setFiltro("tudo")}>
        Tudo
      </Chip>
      <Chip ligado={filtro === "prazo"} n={conta("prazo")} onClick={() => setFiltro("prazo")}>
        Prazos
      </Chip>
      <Chip ligado={filtro === "audiencia"} n={conta("audiencia")} onClick={() => setFiltro("audiencia")}>
        Audiências
      </Chip>
      <Chip ligado={filtro === "tarefa"} n={conta("tarefa")} onClick={() => setFiltro("tarefa")}>
        Tarefas
      </Chip>
    </div>
  );

  const atalhos = (pequeno: boolean) => (
    <>
      <Botao pequeno={pequeno} onClick={() => setNovo("cliente")}>
        <UserPlus /> Cliente
      </Botao>
      <Botao pequeno={pequeno} onClick={() => setNovo("processo")}>
        <FolderPlus /> Processo
      </Botao>
      <Botao pequeno={pequeno} onClick={() => setNovo("atendimento")}>
        <MessageSquarePlus /> Atendimento
      </Botao>
    </>
  );

  const dialogos = (
    <>
      <NovoCliente aberto={novo === "cliente"} aoFechar={() => setNovo(null)} />
      <NovoProcesso aberto={novo === "processo"} aoFechar={() => setNovo(null)} />
      <NovoAtendimento aberto={novo === "atendimento"} aoFechar={() => setNovo(null)} />
    </>
  );

  if (celular) {
    return (
      <TelaCelular
        titulo="Hoje"
        sobre={rotuloDoDia || " "}
        direita={
          <>
            <BotaoBuscar />
            <Link to="/conta" aria-label="Minha conta" style={{ textDecoration: "none" }}>
              <Avatar pessoa={eu.data?.usuario} grande />
            </Link>
          </>
        }
      >
        {!p ? (
          <Carregando />
        ) : (
          <>
            <Numeros painel={p} celular />
            {p.contadores.publicacoesNovas > 0 && (
              <Link to="/publicacoes" className="dc-cartao" style={{ flexDirection: "row", alignItems: "center", gap: 12, background: "var(--acento-suave)", borderColor: "var(--acento-borda)", boxShadow: "none" }}>
                <MarcaIa />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="dc-cartao__titulo">{plural(p.contadores.publicacoesNovas, "publicação nova", "publicações novas")} do DJEN</span>
                  <span className="dc-cartao__linha">
                    {p.contadores.publicacoesComPrazo ? `Prazo sugerido em ${p.contadores.publicacoesComPrazo}. Falta confirmar.` : "Nenhuma abre prazo. Revise e marque como lidas."}
                  </span>
                </span>
                <ChevronRight size={18} className="text-[var(--tinta-3)]" />
              </Link>
            )}
            <section className="dc-secao" id="lista">
              <div className="dc-secao__topo">
                <h2 className="dc-secao__titulo">Do dia</h2>
                <Link to="/agenda" className="dc-link">
                  Ver agenda
                </Link>
              </div>
              {chips}
              <div className="dc-lista">
                {itens.length ? itens.map((i) => <CartaoDoDia key={`${i.tipo}-${i.id}`} item={i} />) : <Vazio titulo="Nada para hoje">Nenhum prazo, audiência ou tarefa no dia.</Vazio>}
              </div>
            </section>
            <section className="dc-secao">
              <h2 className="dc-secao__titulo">Atalhos</h2>
              <div className="dc-linha-acoes">{atalhos(true)}</div>
            </section>
          </>
        )}
        {dialogos}
      </TelaCelular>
    );
  }

  return (
    <Pagina>
      <Cabecalho titulo="Hoje" sub={sub || " "} acoes={atalhos(false)} />
      {!p ? (
        <Carregando />
      ) : (
        <>
          <Numeros painel={p} />
          <div className="dc-colunas">
            <Painel titulo="Do dia" acao={chips} corpo={false}>
              {itens.length ? (
                <div className="dc-tabela-caixa">
                  <table className="dc-tabela">
                    <thead>
                      <tr>
                        <th style={{ width: 124 }}>Quando</th>
                        <th>O que</th>
                        <th style={{ width: 136 }}>Responsável</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((i) => (
                        <LinhaDoDia key={`${i.tipo}-${i.id}`} item={i} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Vazio titulo="Nada para hoje">Nenhum prazo, audiência ou tarefa no dia.</Vazio>
              )}
            </Painel>
            <aside className="dc-pilha">
              <Painel
                titulo={
                  <h2 className="dc-painel__titulo flex items-center gap-2">
                    <MarcaIa /> Publicações novas
                  </h2>
                }
                acao={
                  p.contadores.publicacoesNovas > 0 ? (
                    <Link to="/publicacoes" className="dc-link">
                      Revisar {p.contadores.publicacoesNovas}
                    </Link>
                  ) : undefined
                }
              >
                {p.publicacoes.length ? (
                  <div className="flex flex-col gap-3.5">
                    {p.publicacoes.map((x) => (
                      <Link key={x.id} to="/publicacoes" search={{ id: x.id }} className="flex flex-col gap-0.5 no-underline">
                        <span className="text-[14px] font-semibold leading-5 text-[var(--tinta)]">{x.titulo}</span>
                        <span className="text-[13px] leading-[18px] text-[var(--tinta-2)]">{x.detalhe}</span>
                      </Link>
                    ))}
                    {p.contadores.publicacoesNovas > p.publicacoes.length && (
                      <Link to="/publicacoes" className="dc-link text-[13px]">
                        Mais {p.contadores.publicacoesNovas - p.publicacoes.length}
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="dc-nota m-0">Nenhuma publicação nova. A próxima busca no DJEN sai no horário de sempre.</p>
                )}
              </Painel>
              <Painel titulo="Por responsável" acao={<span className="dc-nota">Hoje · semana</span>} corpo={false}>
                <div className="dc-tabela-caixa">
                  <table className="dc-tabela">
                    <tbody>
                      {p.porResponsavel.map((r) => (
                        <tr key={r.pessoa?.id ?? "sem"}>
                          <td>
                            <Responsavel pessoa={r.pessoa} />
                          </td>
                          <td className="dc-direita dc-num" style={{ width: 48, color: r.hoje ? "var(--hoje)" : "var(--tinta-3)", fontWeight: 500 }}>
                            {r.hoje}
                          </td>
                          <td className="dc-direita dc-num" style={{ width: 48 }}>
                            {r.semana}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Painel>
            </aside>
          </div>
        </>
      )}
      {dialogos}
    </Pagina>
  );
}

function Numeros({ painel, celular }: { painel: PainelDoDia; celular?: boolean }) {
  const c = painel.contadores;
  // No celular os rótulos são curtos e de uma linha só, para os números ficarem alinhados.
  const r = celular
    ? { hoje: "Hoje", vencido: c.vencidos === 1 ? "Vencido" : "Vencidos", publicacoes: "Publicações", audiencias: "Audiências", alvaras: "Alvarás" }
    : {
        hoje: c.vencemHoje === 1 ? "Prazo vence hoje" : "Prazos vencem hoje",
        vencido: c.vencidos === 1 ? "Prazo vencido" : "Prazos vencidos",
        publicacoes: c.publicacoesNovas === 1 ? "Publicação nova" : "Publicações novas",
        audiencias: c.audienciasHoje === 1 ? "Audiência hoje" : "Audiências hoje",
        alvaras: c.alvarasAguardando === 1 ? "Alvará aguardando saque" : "Alvarás aguardando saque",
      };
  return (
    <div className="dc-numeros dc-numeros--dia" aria-label="Números do dia">
      <Link className="dc-contador dc-contador--hoje" to="/prazos" search={{ quando: "hoje" }} aria-label={`${c.vencemHoje} prazos vencem hoje`}>
        <span className="dc-contador__n">{c.vencemHoje}</span>
        <span className="dc-contador__rotulo">{r.hoje}</span>
      </Link>
      <Link className="dc-contador dc-contador--vencido" to="/prazos" search={{ quando: "vencidos" }} aria-label={`${c.vencidos} prazos vencidos`}>
        <span className="dc-contador__n">{c.vencidos}</span>
        <span className="dc-contador__rotulo">{r.vencido}</span>
      </Link>
      <Link className="dc-contador" to="/publicacoes" aria-label={`${c.publicacoesNovas} publicações novas`}>
        <span className="dc-contador__n">{c.publicacoesNovas}</span>
        <span className="dc-contador__rotulo">{r.publicacoes}</span>
      </Link>
      <Link className="dc-contador" to="/agenda" aria-label={`${c.audienciasHoje} audiências hoje`}>
        <span className="dc-contador__n">{c.audienciasHoje}</span>
        <span className="dc-contador__rotulo">{r.audiencias}</span>
      </Link>
      <Link className="dc-contador" to="/alvaras" aria-label={`${c.alvarasAguardando} alvarás aguardando saque`}>
        <span className="dc-contador__n">{c.alvarasAguardando}</span>
        <span className="dc-contador__rotulo">{r.alvaras}</span>
      </Link>
    </div>
  );
}

function seloDoItem(i: ItemDoDia, celular?: boolean) {
  if (i.tipo === "tarefa") return <Selo urgencia={celular ? "breve" : "tarefa"}>{celular ? "Tarefa · hoje" : "Tarefa"}</Selo>;
  if (i.tipo === "audiencia") return <Selo urgencia="audiencia">{i.quando}</Selo>;
  return <Selo urgencia={i.urgencia as "vencido" | "hoje"}>{i.quando}</Selo>;
}

function useAbrir(i: ItemDoDia) {
  const navigate = useNavigate();
  if (i.tipo === "prazo") return () => void navigate({ to: "/prazos/$id", params: { id: i.id } });
  if (i.tipo === "audiencia") return () => void navigate({ to: "/audiencias/$id", params: { id: i.id } });
  if (i.processoId) return () => void navigate({ to: "/processos/$id", params: { id: i.processoId! } });
  return undefined;
}

function LinhaDoDia({ item: i }: { item: ItemDoDia }) {
  const abrir = useAbrir(i);
  return (
    <tr data-link={abrir ? "" : undefined} onClick={abrir}>
      <td>{seloDoItem(i)}</td>
      <td>
        <span className="dc-celula">
          <span className="dc-celula__1">
            {i.tipo === "prazo" ? (
              <Link to="/prazos/$id" params={{ id: i.id }} onClick={(e) => e.stopPropagation()}>
                {i.titulo}
              </Link>
            ) : (
              i.titulo
            )}
            {i.aConfirmar && <span className="dc-selo dc-selo--prazo ml-2" style={{ color: "var(--acento)" }}>IA · a confirmar</span>}
          </span>
          {i.detalhe && <span className="dc-celula__2">{i.detalhe}</span>}
          {i.cnj && <Cnj cnj={i.cnj} className="dc-celula__2" />}
        </span>
      </td>
      <td>
        <Responsavel pessoa={i.responsavel} />
      </td>
    </tr>
  );
}

function CartaoDoDia({ item: i }: { item: ItemDoDia }) {
  const conteudo = (
    <>
      <span className="dc-item__titulo">{i.tipo === "audiencia" ? `${i.titulo.replace(" · por vídeo", "")} · ${i.quando}` : i.titulo}</span>
      {i.tipo === "audiencia" ? <Selo urgencia="audiencia">{i.titulo.includes("por vídeo") ? "Por vídeo" : "Presencial"}</Selo> : seloDoItem(i, true)}
      {i.detalhe && <span className="dc-item__meta">{i.detalhe}</span>}
      <span className="dc-item__pe">
        <Avatar pessoa={i.responsavel} /> {i.responsavel?.apelido ?? "Sem responsável"}
        {i.cnj && (
          <>
            {" · "}
            <span className="dc-num">{i.cnj}</span>
          </>
        )}
        {i.aConfirmar && <span style={{ color: "var(--acento)" }}> · a confirmar</span>}
      </span>
    </>
  );
  if (i.tipo === "prazo")
    return (
      <Link className="dc-item" to="/prazos/$id" params={{ id: i.id }}>
        {conteudo}
      </Link>
    );
  if (i.tipo === "audiencia")
    return (
      <Link className="dc-item" to="/audiencias/$id" params={{ id: i.id }}>
        {conteudo}
      </Link>
    );
  if (i.processoId)
    return (
      <Link className="dc-item" to="/processos/$id" params={{ id: i.processoId }}>
        {conteudo}
      </Link>
    );
  return <div className="dc-item">{conteudo}</div>;
}
