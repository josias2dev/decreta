import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Download, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { BotaoBuscar, Pagina, TelaCelular } from "@/componentes/moldura";
import { NovoPrazo } from "@/componentes/novo-prazo";
import { Avatar, Botao, Cabecalho, Carregando, Chip, Cnj, MarcaIa, Responsavel, Selo, Vazio } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaDaSemana, diaMes } from "@/lib/formato";
import type { ListaDePrazos, PrazoNaLista, Quando } from "@/lib/tipos";

const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Vencidos, hoje, o próximo dia útil, o resto da semana e depois. */
function agrupar(itens: PrazoNaLista[], hoje: string, quando: Quando) {
  if (quando === "cumpridos") return [{ chave: "cumpridos", titulo: "Cumpridos", itens }];
  const grupos = new Map<string, { chave: string; titulo: string; itens: PrazoNaLista[] }>();
  const futuros = itens.filter((i) => i.fim > hoje).map((i) => i.fim);
  const proximo = futuros.length ? futuros.reduce((a, b) => (a < b ? a : b)) : null;
  const semana = somarDias(hoje, 7);
  for (const i of itens) {
    let chave: string;
    let titulo: string;
    if (i.fim < hoje) [chave, titulo] = ["vencidos", "Vencidos"];
    else if (i.fim === hoje) [chave, titulo] = ["hoje", `Hoje · ${diaDaSemana(hoje).replace("-feira", "")}, ${diaMes(hoje)}`];
    else if (i.fim === proximo && i.fim <= semana) [chave, titulo] = ["proximo", `${i.fim === somarDias(hoje, 1) ? "Amanhã" : "Próximo dia útil"} · ${diaDaSemana(i.fim).replace("-feira", "")}, ${diaMes(i.fim)}`];
    else if (i.fim <= semana) [chave, titulo] = ["semana", "Próximos 7 dias"];
    else [chave, titulo] = ["depois", "Próximas semanas"];
    const g = grupos.get(chave) ?? { chave, titulo, itens: [] };
    g.itens.push(i);
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}

export function Situacao({ item }: { item: Pick<PrazoNaLista, "situacao" | "confirmadoHoje" | "origem"> }) {
  const rotulo =
    item.situacao === "a_confirmar" ? (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-[var(--acento)]">
        <MarcaIa /> Confirmar sugestão
      </span>
    ) : item.situacao === "peca_em_revisao" ? (
      <span className="font-medium text-[var(--hoje)]">Peça em revisão</span>
    ) : item.situacao === "cumprido" ? (
      <Selo urgencia="cumprido">Cumprido</Selo>
    ) : item.situacao === "descartado" ? (
      <span className="text-[var(--tinta-3)]">Descartado</span>
    ) : (
      <span className="text-[var(--tinta)]">{item.confirmadoHoje ? "Confirmado hoje" : "Confirmado"}</span>
    );
  return (
    <span className="dc-celula">
      <span>{rotulo}</span>
      <span className="dc-celula__2 dc-num">{item.origem}</span>
    </span>
  );
}

export function PrazosPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/prazos" });
  const navigate = useNavigate({ from: "/prazos" });
  const quando: Quando = search.quando ?? "abertos";
  const responsavel = search.responsavel;
  const eu = useQuery(euQuery);
  const qc = useQueryClient();
  const avisar = useAviso();
  const params = new URLSearchParams({ quando, ...(responsavel ? { responsavel } : {}) }).toString();
  const lista = useQuery({ queryKey: ["prazos", quando, responsavel ?? ""], queryFn: () => api<ListaDePrazos>(`/prazos?${params}`), placeholderData: (a) => a });
  const [novo, setNovo] = useState(false);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [paraQuem, setParaQuem] = useState("");
  const definir = useMutation({
    mutationFn: () => api<{ alterados: number }>("/prazos/responsavel", { json: { ids: [...selecao], responsavelId: paraQuem || null } }),
    onSuccess: (r) => {
      avisar(r.alterados === 1 ? "Responsável definido." : `Responsável definido em ${r.alterados} prazos.`);
      setSelecao(new Set());
      void qc.invalidateQueries({ queryKey: ["prazos"] });
      void qc.invalidateQueries({ queryKey: ["hoje"] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  const l = lista.data;
  const grupos = useMemo(() => (l ? agrupar(l.itens, l.hoje, quando) : []), [l, quando]);
  const ir = (q: Quando) => {
    setSelecao(new Set());
    void navigate({ search: (s) => ({ ...s, quando: q === "abertos" || q === quando ? undefined : q }) });
  };
  const porPessoa = (id: string | undefined) => void navigate({ search: (s) => ({ ...s, responsavel: id === responsavel ? undefined : id }) });
  const vencidos = l?.chips.vencidos ? ` · ${l.chips.vencidos} ${l.chips.vencidos === 1 ? "vencido" : "vencidos"}` : "";
  const sub = l ? `${l.chips.abertos} em aberto · ${l.chips.semana} vencem nesta semana${vencidos}` : " ";

  const chips = l && (
    <div className="dc-chips">
      <Chip ligado={quando === "abertos"} n={l.chips.abertos} onClick={() => ir("abertos")}>
        Em aberto
      </Chip>
      <Chip ligado={quando === "hoje"} n={l.chips.hoje} onClick={() => ir("hoje")}>
        Hoje
      </Chip>
      <Chip ligado={quando === "semana"} n={l.chips.semana} onClick={() => ir("semana")}>
        Semana
      </Chip>
      <Chip ligado={quando === "vencidos"} alerta={l.chips.vencidos > 0} n={l.chips.vencidos} onClick={() => ir("vencidos")}>
        Vencidos
      </Chip>
      <Chip ligado={quando === "cumpridos"} onClick={() => ir("cumpridos")}>
        Cumpridos
      </Chip>
    </div>
  );
  const pessoas = l && l.responsaveis.length > 0 && (
    <div className="dc-chips">
      {l.responsaveis.map((r) => (
        <Chip key={r.pessoa?.id ?? "sem"} ligado={responsavel === (r.pessoa?.id ?? "sem")} alerta={!r.pessoa} n={r.n} onClick={() => porPessoa(r.pessoa?.id ?? "sem")}>
          {r.pessoa ? (
            <>
              <Avatar pessoa={r.pessoa} />
              {r.pessoa.apelido}
            </>
          ) : (
            "Sem responsável"
          )}
        </Chip>
      ))}
    </div>
  );

  if (celular) {
    return (
      <TelaCelular
        titulo="Prazos"
        sobre={l ? `${l.chips.abertos} em aberto${vencidos}` : " "}
        direita={
          <>
            <BotaoBuscar />
            <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Novo prazo" onClick={() => setNovo(true)}>
              <Plus />
            </button>
          </>
        }
      >
        {!l ? (
          <Carregando />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {chips}
              {pessoas}
            </div>
            {grupos.length ? (
              grupos.map((g) => (
                <section key={g.chave} className="dc-secao">
                  <h2 className="dc-secao__titulo" style={{ fontSize: 15 }}>
                    {g.titulo} <span className="dc-num font-medium text-[var(--tinta-3)]">· {g.itens.length}</span>
                  </h2>
                  <div className="dc-lista">
                    {g.itens.map((i) => (
                      <Link key={i.id} className="dc-item" to="/prazos/$id" params={{ id: i.id }}>
                        <span className="dc-item__titulo">{i.tipo}</span>
                        <Selo urgencia={i.situacao === "cumprido" ? "cumprido" : i.urgencia}>{i.quando}</Selo>
                        <span className="dc-item__meta">{[i.processo.titulo, i.processo.orgao].filter(Boolean).join(" · ")}</span>
                        <span className="dc-item__pe">
                          <Avatar pessoa={i.responsavel} /> {i.responsavel?.apelido ?? "Sem responsável"} ·{" "}
                          {i.situacao === "a_confirmar" ? <span className="text-[var(--acento)]">Confirmar sugestão</span> : i.situacao === "peca_em_revisao" ? <span className="text-[var(--hoje)]">Peça em revisão</span> : <span>{i.origem}</span>}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <Vazio titulo={quando === "cumpridos" ? "Nenhum prazo cumprido" : "Nenhum prazo aqui"}>{quando === "vencidos" ? "Nada vencido. Bom trabalho." : "Os prazos novos chegam das publicações do DJEN."}</Vazio>
            )}
          </>
        )}
        <NovoPrazo aberto={novo} aoFechar={() => setNovo(false)} />
      </TelaCelular>
    );
  }

  const todosVisiveis = l?.itens.map((i) => i.id) ?? [];
  const marcarTodos = selecao.size > 0 && selecao.size === todosVisiveis.length;
  return (
    <Pagina>
      <Cabecalho
        titulo="Prazos"
        sub={sub}
        acoes={
          <>
            <a className="dc-btn dc-btn--secundaria dc-btn--md" href={`${API_URL}/api/app/prazos/exportar?${params}`} download>
              <Download /> Exportar
            </a>
            <Botao variante="primaria" onClick={() => setNovo(true)}>
              <Plus /> Novo prazo
            </Botao>
          </>
        }
      />
      {!l ? (
        <Carregando />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {chips}
            {pessoas}
          </div>
          <section className="dc-painel">
            {l.itens.length ? (
              <div className="dc-tabela-caixa">
                <table className="dc-tabela">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          className="dc-checa"
                          aria-label="Selecionar todos"
                          checked={marcarTodos}
                          onChange={(e) => setSelecao(e.target.checked ? new Set(todosVisiveis) : new Set())}
                        />
                      </th>
                      <th style={{ width: 124 }}>Vence</th>
                      <th>Prazo</th>
                      <th style={{ width: 136 }}>Responsável</th>
                      <th style={{ width: 200 }}>Situação</th>
                    </tr>
                  </thead>
                  {grupos.map((g) => (
                    <tbody key={g.chave}>
                      <tr>
                        <td colSpan={5} className="dc-tabela__grupo" style={g.chave === "vencidos" ? { color: "var(--vencido)" } : undefined}>
                          {g.titulo} · <span className="dc-num">{g.itens.length}</span>
                        </td>
                      </tr>
                      {g.itens.map((i) => (
                        <tr key={i.id} className={selecao.has(i.id) ? "is-on" : undefined} data-link="" onClick={() => void navigate({ to: "/prazos/$id", params: { id: i.id } })}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="dc-checa"
                              aria-label={`Selecionar ${i.tipo}`}
                              checked={selecao.has(i.id)}
                              onChange={(e) => {
                                const s = new Set(selecao);
                                if (e.target.checked) s.add(i.id);
                                else s.delete(i.id);
                                setSelecao(s);
                              }}
                            />
                          </td>
                          <td>
                            <Selo urgencia={i.situacao === "cumprido" ? "cumprido" : i.urgencia}>{i.quando}</Selo>
                          </td>
                          <td>
                            <span className="dc-celula">
                              <Link className="dc-celula__1" to="/prazos/$id" params={{ id: i.id }} onClick={(e) => e.stopPropagation()}>
                                {i.tipo}
                              </Link>
                              <span className="dc-celula__2">{[i.processo.titulo, i.processo.orgao && i.processo.comarca ? `${i.processo.orgao} de ${i.processo.comarca}` : i.processo.orgao].filter(Boolean).join(" · ")}</span>
                              <Cnj cnj={i.processo.cnj} className="dc-celula__2" />
                            </span>
                          </td>
                          <td>
                            <Responsavel pessoa={i.responsavel} />
                          </td>
                          <td>
                            <Situacao item={i} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            ) : (
              <Vazio titulo={quando === "cumpridos" ? "Nenhum prazo cumprido" : "Nenhum prazo aqui"}>{quando === "vencidos" ? "Nada vencido." : "Os prazos novos chegam das publicações do DJEN."}</Vazio>
            )}
            {selecao.size > 0 && (
              <div className="flex items-center gap-3 border-t border-[var(--borda)] px-4 py-2.5" style={{ background: "var(--superficie-2)", borderRadius: "0 0 12px 12px" }}>
                <span className="text-[13px] font-medium">
                  {selecao.size} {selecao.size === 1 ? "selecionado" : "selecionados"}
                </span>
                <div className="dc-campo" style={{ display: "block" }}>
                  <select aria-label="Responsável" value={paraQuem} onChange={(e) => setParaQuem(e.target.value)} style={{ width: 200 }}>
                    <option value="">Sem responsável</option>
                    {eu.data?.equipe.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <Botao variante="primaria" pequeno onClick={() => definir.mutate()} ocupado={definir.isPending}>
                  Definir responsável
                </Botao>
                <button type="button" className="dc-link ml-auto text-[13px]" onClick={() => setSelecao(new Set())}>
                  Limpar seleção
                </button>
              </div>
            )}
          </section>
        </>
      )}
      <NovoPrazo aberto={novo} aoFechar={() => setNovo(false)} />
    </Pagina>
  );
}
