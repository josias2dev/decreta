/** Documentos de todo o escritório: dos autos, dos clientes e as peças baixadas. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { IconeDoArquivo } from "@/componentes/icone-arquivo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { Rolagem } from "@/componentes/rolagem";
import { Botao, Cabecalho, CampoDeBusca, Carregando, Faixa, Vazio } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { diaCompleto, diaCurto, diaDoInstante, numero, tamanho } from "@/lib/formato";
import type { Documento } from "@/lib/tipos";
import { enquantoLe, Enviar, LeituraDaIa } from "./processo";

const arquivo = (id: string) => `${API_URL}/api/app/documentos/${id}/arquivo`;
const ORIGEM = { upload: "Enviado", peca: "Peça", captura: "Dos autos" } as const;

export function DocumentosPage() {
  const celular = useCelular();
  const [texto, setTexto] = useState("");
  const busca = useDeferredValue(texto.trim());
  const docs = useQuery({ queryKey: ["documentos", "todos", busca], queryFn: () => api<{ itens: Documento[] }>(`/documentos${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`), placeholderData: (a) => a, refetchInterval: enquantoLe });
  const [apagando, setApagando] = useState<Documento | null>(null);
  const itens = docs.data?.itens ?? [];
  const sub = docs.data ? `${numero(itens.length)}${itens.length === 200 ? "+" : ""} ${itens.length === 1 ? "documento" : "documentos"}${busca ? " encontrados" : ", os mais recentes primeiro"}` : " ";
  const de = (d: Documento) =>
    d.processo ? (
      <Link to="/processos/$id" params={{ id: d.processo.id }} className="text-inherit no-underline hover:underline" onClick={(e) => e.stopPropagation()}>
        {d.processo.titulo}
      </Link>
    ) : d.cliente ? (
      <Link to="/clientes/$id" params={{ id: d.cliente.id }} className="text-inherit no-underline hover:underline" onClick={(e) => e.stopPropagation()}>
        {d.cliente.nome}
      </Link>
    ) : (
      "Escritório"
    );
  const campo = <CampoDeBusca valor={texto} aoMudar={setTexto} rotulo="Buscar documento" placeholder="Nome do arquivo" />;
  const vazio = <Vazio titulo={busca ? "Nada encontrado" : "Nenhum documento ainda"}>{busca ? "Tente outra parte do nome." : "Os documentos enviados nos processos e clientes aparecem aqui."}</Vazio>;
  const dialogo = apagando && <Apagar d={apagando} aoFechar={() => setApagando(null)} />;

  if (celular) {
    return (
      <TelaCelular titulo="Documentos" sobre={sub} voltar direita={<Enviar />} fixo={campo}>
        {!docs.data ? (
          <Carregando />
        ) : itens.length ? (
          <section className="dc-painel">
            <div className="dc-linhas">
              {itens.map((d) => (
                <a key={d.id} href={arquivo(d.id)} className="dc-linhas__item">
                  <IconeDoArquivo nome={d.nome} mime={d.mime} />
                  <span className="dc-celula min-w-0 flex-1">
                    <span className="dc-celula__1 truncate">{d.nome}</span>
                    <span className="dc-celula__2 truncate">
                      {d.processo?.titulo ?? d.cliente?.nome ?? "Escritório"} · {diaCurto(diaDoInstante(d.em))}
                    </span>
                  </span>
                  <LeituraDaIa d={d} />
                </a>
              ))}
            </div>
          </section>
        ) : (
          vazio
        )}
        {dialogo}
      </TelaCelular>
    );
  }
  return (
    <Pagina cheia>
      <Cabecalho titulo="Documentos" sub={sub} acoes={<Enviar />} />
      <div className="dc-filtros">{campo}</div>
      <section className="dc-painel">
        {!docs.data ? (
          <div className="p-4">
            <Carregando />
          </div>
        ) : itens.length ? (
          <Rolagem id="documentos" topo={busca} className="dc-tabela-caixa">
            <table className="dc-tabela">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th style={{ width: 260 }}>De</th>
                  <th style={{ width: 112 }}>Enviado</th>
                  <th style={{ width: 150 }}>Leitura da IA</th>
                  <th style={{ width: 84 }} />
                </tr>
              </thead>
              <tbody>
                {itens.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="flex items-start gap-2.5">
                        <IconeDoArquivo nome={d.nome} mime={d.mime} />
                        <span className="dc-celula min-w-0">
                          <a className="dc-celula__1 no-underline hover:underline" href={`${arquivo(d.id)}?ver=1`} target="_blank" rel="noreferrer">
                            {d.nome}
                          </a>
                          <span className="dc-celula__2">{[ORIGEM[d.origem], d.evento != null && `evento ${d.evento}`, d.paginas && `${d.paginas} p.`, tamanho(d.tamanho), d.enviadoPor?.apelido].filter(Boolean).join(" · ")}</span>
                        </span>
                      </span>
                    </td>
                    <td className="truncate">{de(d)}</td>
                    <td className="dc-num">{diaCompleto(diaDoInstante(d.em))}</td>
                    <td>
                      <LeituraDaIa d={d} reler />
                    </td>
                    <td>
                      <span className="flex justify-end">
                        <a href={arquivo(d.id)} className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Baixar ${d.nome}`}>
                          <Download />
                        </a>
                        <button type="button" className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Apagar ${d.nome}`} onClick={() => setApagando(d)}>
                          <Trash2 />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        ) : (
          vazio
        )}
      </section>
      {dialogo}
    </Pagina>
  );
}

function Apagar({ d, aoFechar }: { d: Documento; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const apagar = useMutation({
    mutationFn: () => api(`/documentos/${d.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      void qc.invalidateQueries({ queryKey: ["processo"] });
      void qc.invalidateQueries({ queryKey: ["cliente"] });
      avisar("Documento apagado.");
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo="Apagar documento"
      descricao={`${d.nome} sai do Decreta e a IA para de usar o texto dele. Não dá para desfazer.`}
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="perigo" onClick={() => apagar.mutate()} ocupado={apagar.isPending}>
            Apagar
          </Botao>
        </>
      }
    >
      {apagar.error && <Faixa tipo="erro">{mensagemDoErro(apagar.error)}</Faixa>}
    </Dialogo>
  );
}
