import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, CircleAlert, FolderPlus, MessageSquarePlus, UserPlus } from "lucide-react";
import { useState } from "react";
import { AuditoriaDaCarteira } from "@/componentes/auditoria";
import { AvisoDaCaptura, AvisoDaFalta, useFaltaParaBuscar } from "@/componentes/captura-do-djen";
import { DataViva } from "@/componentes/data-viva";
import { AvisoDoTeste } from "@/componentes/faixa-do-plano";
import { BotaoBuscar, Pagina, TelaCelular } from "@/componentes/moldura";
import { NovoAtendimento, NovoCliente, NovoProcesso } from "@/componentes/novos";
import { Avatar, Botao, Cabecalho, Carregando, Chip, Cnj, Faixa, MarcaIa, Painel, Responsavel, Selo, Vazio } from "@/componentes/ui";
import { SO_LEITURA } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery, hojeQuery, podeCriar } from "@/lib/consultas";
import { diaCurto } from "@/lib/formato";
import { usePreCarga } from "@/lib/pre-carga";
import type { ItemDoDia, PainelDoDia } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { TerminarDeConfigurar } from "./comecar";

type Filtro = "tudo" | "prazo" | "audiencia" | "tarefa";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function AvisoDaLeitura({ n }: { n: number }) {
  if (!n) return null;
  return (
    <Faixa tipo="aviso">
      <CircleAlert />
      <span className="flex-1">{n === 1 ? "1 publicação nova ficou sem leitura da IA. Confira o prazo nela." : `${n} publicações novas ficaram sem leitura da IA. Confira o prazo em cada uma.`}</span>
      <Link to="/publicacoes" className="dc-link">Ver</Link>
    </Faixa>
  );
}

export function HojePage() {
  const celular = useCelular();
  const eu = useQuery(euQuery);
  const painel = useQuery(hojeQuery);
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [novo, setNovo] = useState<"cliente" | "processo" | "atendimento" | null>(null);

  const p = painel.data;
  // Sem publicação nova à vista: sem OAB ou com a busca desligada, a frase da próxima busca seria falsa.
  const falta = useFaltaParaBuscar(!!p && !p.publicacoes.length);
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

  const pode = podeCriar(eu.data);
  const NOME_DO_FILTRO = { prazo: "Nenhum prazo vence hoje", audiencia: "Nenhuma audiência hoje", tarefa: "Nenhuma tarefa para hoje" } as const;
  const semItens =
    !p || itens.length > 0 ? null : p.itens.length > 0 && filtro !== "tudo" ? (
      <Vazio
        titulo={NOME_DO_FILTRO[filtro]}
        acao={
          <Botao pequeno onClick={() => setFiltro("tudo")}>
            Ver tudo
          </Botao>
        }
      >
        O dia tem {plural(p.itens.length, "item", "itens")} em outros filtros.
      </Vazio>
    ) : eu.data?.menu.processos ? (
      <Vazio
        titulo="Nada para hoje"
        acao={
          <Link to="/prazos" className="dc-link">
            Ver os próximos prazos
          </Link>
        }
      >
        Nenhum prazo, audiência ou tarefa no dia.
      </Vazio>
    ) : (
      <Vazio
        titulo="Aqui fica o trabalho de cada dia"
        acao={
          pode && (
            <Botao variante="primaria" pequeno onClick={() => setNovo("processo")}>
              <FolderPlus /> Cadastrar o primeiro processo
            </Botao>
          )
        }
      >
        Os prazos que vencem, as audiências e as tarefas do dia entram nesta lista, com o responsável de cada um. Comece pelo processo: digite o número CNJ e o Decreta busca as partes, a classe e os andamentos.
        {!pode && <span>{SO_LEITURA}</span>}
      </Vazio>
    );

  const atalhos = (pequeno: boolean) => pode && (
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
            <Link to="/conta" aria-label="Minha conta" className="no-underline">
              <Avatar pessoa={eu.data?.usuario} grande />
            </Link>
          </>
        }
      >
        {!p ? (
          <Carregando />
        ) : (
          <>
            <AvisoDoTeste aviso={eu.data?.assinatura?.aviso} />
            <TerminarDeConfigurar eu={eu.data} />
            <Numeros painel={p} celular />
            <AvisoDaCaptura alertas={p.alertasDaCaptura} acao={<Link to="/publicacoes" className="dc-link">Ver</Link>} />
            <AvisoDaLeitura n={p.contadores.publicacoesSemLeitura} />
            {falta && eu.data && <AvisoDaFalta falta={falta} eu={eu.data} />}
            {p.contadores.publicacoesNovas > 0 && (
              <Link to="/publicacoes" className="dc-cartao dc-cartao--ia">
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
                {itens.length ? itens.map((i) => <CartaoDoDia key={`${i.tipo}-${i.id}`} item={i} />) : semItens}
              </div>
            </section>
            {p.auditoria && <AuditoriaDaCarteira auditoria={p.auditoria} />}
            {pode && (
              <section className="dc-secao">
                <h2 className="dc-secao__titulo">Atalhos</h2>
                <div className="dc-linha-acoes">{atalhos(true)}</div>
              </section>
            )}
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
          <AvisoDoTeste aviso={eu.data?.assinatura?.aviso} />
          <TerminarDeConfigurar eu={eu.data} />
          <Numeros painel={p} />
          <AvisoDaCaptura alertas={p.alertasDaCaptura} acao={<Link to="/publicacoes" className="dc-link">Ver</Link>} />
          <AvisoDaLeitura n={p.contadores.publicacoesSemLeitura} />
          <div className="dc-colunas">
            <Painel titulo="Do dia" acao={chips} corpo={false}>
              {itens.length ? (
                <div className="dc-tabela-caixa">
                  <table className="dc-tabela dc-tabela--fixa">
                    <thead>
                      <tr>
                        <th className="dc-col--quando">Quando</th>
                        <th>O que</th>
                        <th className="dc-col--pessoa">Responsável</th>
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
                semItens
              )}
            </Painel>
            <aside className="dc-pilha">
              {p.auditoria && <AuditoriaDaCarteira auditoria={p.auditoria} />}
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
                      <div key={x.id} className="dc-com-esticado flex flex-col gap-0.5">
                        <Link to="/publicacoes" search={{ id: x.id }} className="dc-esticado dc-t-corpo font-semibold text-[var(--tinta)]">
                          {x.titulo}
                        </Link>
                        <span className="dc-t-meta text-[var(--tinta-2)]">
                          <DetalheDaPublicacao publicacao={x} />
                        </span>
                      </div>
                    ))}
                    {p.contadores.publicacoesNovas > p.publicacoes.length && (
                      <Link to="/publicacoes" className="dc-link">
                        Mais {p.contadores.publicacoesNovas - p.publicacoes.length}
                      </Link>
                    )}
                  </div>
                ) : falta && eu.data ? (
                  <AvisoDaFalta falta={falta} eu={eu.data} />
                ) : falta === null ? (
                  <p className="dc-nota m-0">Nenhuma publicação nova. A próxima busca no DJEN sai no horário de sempre.</p>
                ) : null}
              </Painel>
              <Painel titulo="Por responsável" acao={<span className="dc-nota">Hoje · semana</span>} corpo={false}>
                {p.porResponsavel.length ? (
                  <div className="dc-tabela-caixa">
                    <table className="dc-tabela">
                      <tbody>
                        {p.porResponsavel.map((r) => (
                          <tr key={r.pessoa?.id ?? "sem"}>
                            <td>
                              <Responsavel pessoa={r.pessoa} />
                            </td>
                            <td className={cn("dc-direita dc-num dc-col--n-curto", r.hoje ? "dc-hoje" : "dc-apagado")}>
                              {r.hoje}
                            </td>
                            <td className="dc-direita dc-num dc-col--n-curto">
                              {r.semana}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="dc-nota m-0 p-[var(--respiro-painel)]">A carga de cada pessoa aparece aqui quando houver prazo aberto.</p>
                )}
              </Painel>
            </aside>
          </div>
        </>
      )}
      {dialogos}
    </Pagina>
  );
}

/** "Marina Duarte · prazo sugerido 23/11": a data sugerida abre a conta. */
function DetalheDaPublicacao({ publicacao: x }: { publicacao: PainelDoDia["publicacoes"][number] }) {
  const data = x.fimSugerido ? diaCurto(x.fimSugerido) : null;
  if (!data || !x.detalhe.includes(data)) return <>{x.detalhe}</>;
  const [antes, depois] = x.detalhe.split(data);
  return (
    <>
      {antes}
      <DataViva alvo={{ publicacao: x.id }} texto>
        {data}
      </DataViva>
      {depois}
    </>
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
      <Link className={cn("dc-contador", c.vencemHoje > 0 && "dc-contador--hoje")} to="/prazos" search={{ quando: "hoje" }} aria-label={`${c.vencemHoje} prazos vencem hoje`}>
        <span className="dc-contador__n">{c.vencemHoje}</span>
        <span className="dc-contador__rotulo">{r.hoje}</span>
      </Link>
      <Link className={cn("dc-contador", c.vencidos > 0 && "dc-contador--vencido")} to="/prazos" search={{ quando: "vencidos" }} aria-label={`${c.vencidos} prazos vencidos`}>
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
  return (
    <span title={i.interno ? [i.interno.regra, i.interno.aviso].filter(Boolean).join(". ") : undefined}>
      <DataViva alvo={{ prazo: i.id }}>
        <Selo urgencia={i.urgencia as "vencido" | "hoje" | "breve"}>{i.quando}</Selo>
      </DataViva>
    </span>
  );
}

/** O item é o prazo interno: o fatal vem antes das partes. */
const fatalDoInterno = (i: ItemDoDia) => (i.interno ? `Fatal ${diaCurto(i.interno.fatal)} · ` : "");

function useAbrir(i: ItemDoDia) {
  const navigate = useNavigate();
  if (i.tipo === "prazo") return () => void navigate({ to: "/prazos/$id", params: { id: i.id } });
  if (i.tipo === "audiencia") return () => void navigate({ to: "/audiencias/$id", params: { id: i.id } });
  if (i.processoId) return () => void navigate({ to: "/processos/$id", params: { id: i.processoId! } });
  return undefined;
}

function LinhaDoDia({ item: i }: { item: ItemDoDia }) {
  const abrir = useAbrir(i);
  const preCarga = usePreCarga();
  const destino = i.tipo === "prazo" ? ({ to: "/prazos/$id", params: { id: i.id } } as const) : i.tipo === "audiencia" ? ({ to: "/audiencias/$id", params: { id: i.id } } as const) : i.processoId ? ({ to: "/processos/$id", params: { id: i.processoId } } as const) : null;
  return (
    <tr data-link={abrir ? "" : undefined} {...(destino ? preCarga(destino) : {})} onClick={abrir}>
      <td>{seloDoItem(i)}</td>
      <td>
        <span className="dc-celula">
          <span className="dc-celula__1 dc-celula__1--uma">
            {i.tipo === "prazo" ? (
              <Link to="/prazos/$id" params={{ id: i.id }} onClick={(e) => e.stopPropagation()}>
                {i.titulo}
              </Link>
            ) : (
              <span className="dc-corta">{i.titulo}</span>
            )}
            {i.aConfirmar && <span className="dc-selo dc-selo--ia">IA · a confirmar</span>}
          </span>
          {(i.detalhe || i.cnj) && (
            <span className="dc-celula__2 dc-celula__2--cnj">
              {i.detalhe && (
                <span className="dc-corta">
                  {fatalDoInterno(i)}
                  {i.detalhe}
                </span>
              )}
              {i.cnj && <Cnj cnj={i.cnj} />}
            </span>
          )}
        </span>
      </td>
      <td>
        <Responsavel pessoa={i.responsavel} />
      </td>
    </tr>
  );
}

function CartaoDoDia({ item: i }: { item: ItemDoDia }) {
  const titulo = i.tipo === "audiencia" ? `${i.titulo.replace(" · por vídeo", "")} · ${i.quando}` : i.titulo;
  const resto = (
    <>
      {i.tipo === "audiencia" ? <Selo urgencia="audiencia">{i.titulo.includes("por vídeo") ? "Por vídeo" : "Presencial"}</Selo> : seloDoItem(i, true)}
      {i.detalhe && (
        <span className="dc-item__meta">
          {fatalDoInterno(i)}
          {i.detalhe}
        </span>
      )}
      <span className="dc-item__pe">
        <Avatar pessoa={i.responsavel} />
        {/* Um texto só, que quebra como frase, e não em colunas. */}
        <span className="min-w-0">
          {i.responsavel?.apelido ?? "Sem responsável"}
          {i.cnj && (
            <>
              {" · "}
              <Cnj cnj={i.cnj} />
            </>
          )}
          {i.aConfirmar && <span className="dc-acento"> · a confirmar</span>}
        </span>
      </span>
    </>
  );
  // O prazo tem a data viva por cima: o link cobre o cartão sem envolver o botão.
  if (i.tipo === "prazo")
    return (
      <div className="dc-item dc-com-esticado">
        <Link className="dc-item__titulo dc-esticado" to="/prazos/$id" params={{ id: i.id }}>
          {titulo}
        </Link>
        {resto}
      </div>
    );
  const conteudo = (
    <>
      <span className="dc-item__titulo">{titulo}</span>
      {resto}
    </>
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
