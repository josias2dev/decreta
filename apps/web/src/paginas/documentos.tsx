/**
 * Documentos de todo o escritório: dos autos, dos clientes e as peças baixadas.
 * Clicar num abre o arquivo à direita, sem sair da lista (no celular, em tela
 * cheia). O aberto fica no endereço (?doc=), então o "voltar" do celular fecha.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Download, ExternalLink, Trash2, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { IconeDoArquivo } from "@/componentes/icone-arquivo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { Rolagem } from "@/componentes/rolagem";
import { Botao, Cabecalho, CampoDeBusca, Carregando, Faixa, Vazio } from "@/componentes/ui";
import { abreNoNavegador, urlDoArquivo, VerDocumento } from "@/componentes/ver-documento";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { diaCompleto, diaCurto, diaDoInstante, numero, tamanho } from "@/lib/formato";
import type { Documento } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { FaixaDoAlerta } from "@/componentes/alerta-do-documento";
import { enquantoLe, Enviar, LeituraDaIa } from "./processo";

const ORIGEM = { upload: "Enviado", peca: "Peça", captura: "Dos autos" } as const;

/** Dos autos · evento 89 · 4 p. · 12 KB */
const sobre = (d: Documento) => [ORIGEM[d.origem], d.evento != null && `evento ${d.evento}`, d.paginas && `${d.paginas} p.`, tamanho(d.tamanho)].filter(Boolean).join(" · ");
const deQuem = (d: Documento) => d.processo?.titulo ?? d.cliente?.nome ?? d.negocio?.nome ?? "Escritório";

/** De quem é o documento, com o link para o processo, o cliente ou os novos negócios. */
function De({ d }: { d: Documento }) {
  const para = (e: React.MouseEvent) => e.stopPropagation();
  if (d.processo)
    return (
      <Link to="/processos/$id" params={{ id: d.processo.id }} className="text-inherit no-underline hover:underline" onClick={para}>
        {d.processo.titulo}
      </Link>
    );
  if (d.cliente)
    return (
      <Link to="/clientes/$id" params={{ id: d.cliente.id }} className="text-inherit no-underline hover:underline" onClick={para}>
        {d.cliente.nome}
      </Link>
    );
  if (d.negocio)
    return (
      <Link to="/negocios" className="text-inherit no-underline hover:underline" onClick={para}>
        {d.negocio.nome}
      </Link>
    );
  return <>Escritório</>;
}

export function DocumentosPage() {
  const celular = useCelular();
  const { doc, pagina } = useSearch({ from: "/app/documentos" });
  const navigate = useNavigate({ from: "/documentos" });
  const [texto, setTexto] = useState("");
  const busca = useDeferredValue(texto.trim());
  const docs = useQuery({ queryKey: ["documentos", "todos", busca], queryFn: () => api<{ itens: Documento[] }>(`/documentos${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`), placeholderData: (a) => a, refetchInterval: enquantoLe });
  const [apagando, setApagando] = useState<Documento | null>(null);
  const itens = docs.data?.itens ?? [];
  // O aberto vem da lista; se a busca o tirou dela (ou o endereço veio de fora), pede só ele.
  const daLista = doc ? itens.find((d) => d.id === doc) : undefined;
  const sozinho = useQuery({ queryKey: ["documentos", "um", doc], queryFn: () => api<Documento>(`/documentos/${doc}`), enabled: !!doc && !!docs.data && !daLista, retry: false });
  const aberto = daLista ?? (sozinho.data?.id === doc ? sozinho.data : undefined);
  // No computador trocar de documento não empilha no histórico; no celular, o voltar fecha o aberto.
  const abrir = (id: string | undefined) => void navigate({ search: (s) => ({ ...s, doc: id, pagina: undefined }), replace: !celular || !id, resetScroll: false });
  useEffect(() => {
    if (sozinho.isError) void navigate({ search: (s) => ({ ...s, doc: undefined }), replace: true, resetScroll: false });
  }, [sozinho.isError, navigate]);

  const sub = docs.data ? `${numero(itens.length)}${itens.length === 200 ? "+" : ""} ${itens.length === 1 ? "documento" : "documentos"}${busca ? " encontrados" : ", os mais recentes primeiro"}` : " ";
  const campo = <CampoDeBusca valor={texto} aoMudar={setTexto} rotulo="Buscar documento" placeholder="Nome, processo ou cliente" />;
  const vazio = <Vazio titulo={busca ? "Nada encontrado" : "Nenhum documento ainda"}>{busca ? "Tente outra palavra do nome, do processo ou do cliente." : "Os documentos enviados nos processos e clientes aparecem aqui."}</Vazio>;
  const dialogo = apagando && <Apagar d={apagando} aoFechar={() => setApagando(null)} aoApagar={() => apagando.id === doc && abrir(undefined)} />;

  if (celular) {
    if (doc)
      return (
        <TelaCelular
          titulo={aberto?.nome ?? "Documento"}
          sobre={aberto && sobre(aberto)}
          voltar
          direita={
            aberto && (
              <a className="dc-btn dc-btn--fantasma" href={urlDoArquivo(aberto.id)} aria-label={`Baixar ${aberto.nome}`}>
                <Download />
              </a>
            )
          }
        >
          {aberto ? (
            <>
              <div className="dc-doc__dados dc-doc__dados--celular">
                <span className="truncate">
                  <De d={aberto} />
                </span>
                <LeituraDaIa d={aberto} reler />
              </div>
              <FaixaDoAlerta alertas={aberto.alertas} />
              <VerDocumento d={aberto} naPagina pagina={pagina} className="dc-doc__ver" />
            </>
          ) : (
            <Carregando />
          )}
        </TelaCelular>
      );
    return (
      <TelaCelular titulo="Documentos" sobre={sub} voltar direita={<Enviar />} fixo={campo}>
        {!docs.data ? (
          <Carregando />
        ) : itens.length ? (
          <section className="dc-painel">
            <div className="dc-linhas">
              {itens.map((d) => (
                <Link key={d.id} to="/documentos" search={{ doc: d.id }} className="dc-linhas__item">
                  <IconeDoArquivo nome={d.nome} mime={d.mime} />
                  <span className="dc-celula min-w-0 flex-1">
                    <span className="dc-celula__1 truncate">{d.nome}</span>
                    <span className="dc-celula__2 truncate">
                      {deQuem(d)} · {diaCurto(diaDoInstante(d.em))}
                    </span>
                  </span>
                  <LeituraDaIa d={d} />
                </Link>
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
      <div className={cn("dc-docs", doc && "dc-docs--aberto")}>
        <section className="dc-painel dc-docs__lista">
          {!docs.data ? (
            <div className="p-4">
              <Carregando />
            </div>
          ) : itens.length ? (
            <Lista itens={itens} aberto={doc} busca={busca} abrir={abrir} apagar={setApagando} />
          ) : (
            vazio
          )}
        </section>
        {doc && (aberto ? <DocumentoAberto d={aberto} pagina={pagina} aoFechar={() => abrir(undefined)} aoApagar={() => setApagando(aberto)} /> : <section className="dc-painel dc-doc" aria-busy />)}
      </div>
      {dialogo}
    </Pagina>
  );
}

/**
 * A tabela. Com um documento aberto, fica só a coluna do nome, com de quem é
 * e o dia embaixo; as setas para cima e para baixo trocam o aberto, e o Esc fecha.
 */
function Lista({ itens, aberto, busca, abrir, apagar }: { itens: Documento[]; aberto: string | undefined; busca: string; abrir: (id: string | undefined) => void; apagar: (d: Documento) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const teclas = useRef({ itens, aberto, abrir });
  teclas.current = { itens, aberto, abrir };

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || alvo?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const { itens, aberto, abrir } = teclas.current;
      if (e.key === "Escape") return abrir(undefined);
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const i = itens.findIndex((d) => d.id === aberto);
      const prox = itens[i < 0 ? 0 : i + (e.key === "ArrowDown" ? 1 : -1)];
      if (!prox) return;
      e.preventDefault();
      abrir(prox.id);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  // O aberto fica à vista na lista (seta, ou endereço com ?doc=), e o foco do teclado vai junto.
  useEffect(() => {
    const linha = aberto ? caixa.current?.querySelector<HTMLElement>(`[data-doc="${aberto}"]`) : null;
    if (!linha) return;
    linha.scrollIntoView({ block: "nearest" });
    if (caixa.current?.contains(document.activeElement)) linha.querySelector<HTMLElement>(".dc-celula__1")?.focus({ preventScroll: true });
  }, [aberto]);

  return (
    <div ref={caixa} className="contents">
      <Rolagem id="documentos" topo={busca} className="dc-tabela-caixa">
        <table className="dc-tabela dc-tabela--docs">
          <thead>
            <tr>
              <th>Documento</th>
              <th className="dc-docs__col" style={{ width: 260 }}>
                De
              </th>
              <th className="dc-docs__col" style={{ width: 112 }}>
                Enviado
              </th>
              <th className="dc-docs__col" style={{ width: 150 }}>
                Leitura da IA
              </th>
              <th className="dc-docs__col" style={{ width: 84 }} />
            </tr>
          </thead>
          <tbody>
            {itens.map((d) => (
              <tr key={d.id} data-link data-doc={d.id} className={cn(d.id === aberto && "is-on")} aria-selected={d.id === aberto} onClick={(e) => !(e.target as Element).closest("a, button") && abrir(d.id)}>
                <td>
                  <span className="flex items-start gap-2.5">
                    <IconeDoArquivo nome={d.nome} mime={d.mime} />
                    <span className="dc-celula min-w-0">
                      <Link to="/documentos" search={(s) => ({ ...s, doc: d.id })} replace resetScroll={false} className="dc-celula__1 no-underline hover:underline">
                        {d.nome}
                      </Link>
                      <span className="dc-celula__2">{aberto ? `${deQuem(d)} · ${diaCompleto(diaDoInstante(d.em))}` : [sobre(d), d.enviadoPor?.apelido].filter(Boolean).join(" · ")}</span>
                    </span>
                  </span>
                </td>
                <td className="dc-docs__col truncate">
                  <De d={d} />
                </td>
                <td className="dc-docs__col dc-num">{diaCompleto(diaDoInstante(d.em))}</td>
                <td className="dc-docs__col">
                  <LeituraDaIa d={d} reler />
                </td>
                <td className="dc-docs__col">
                  <span className="flex justify-end">
                    <a href={urlDoArquivo(d.id)} className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Baixar ${d.nome}`}>
                      <Download />
                    </a>
                    <button type="button" className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Apagar ${d.nome}`} onClick={() => apagar(d)}>
                      <Trash2 />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rolagem>
    </div>
  );
}

/** O painel à direita: o nome e as ações em cima, de quem é e a leitura da IA, e o arquivo. */
function DocumentoAberto({ d, pagina, aoFechar, aoApagar }: { d: Documento; pagina?: number; aoFechar: () => void; aoApagar: () => void }) {
  return (
    <section className="dc-painel dc-doc" aria-label={`Documento aberto: ${d.nome}`}>
      <header className="dc-doc__topo">
        <IconeDoArquivo nome={d.nome} mime={d.mime} />
        <span className="dc-celula min-w-0 flex-1">
          <h2 className="dc-doc__nome" title={d.nome}>
            {d.nome}
          </h2>
          <span className="dc-celula__2 truncate">{sobre(d)}</span>
        </span>
        <span className="dc-doc__acoes">
          {abreNoNavegador(d.mime) && (
            <a className="dc-btn dc-btn--fantasma dc-btn--sm" href={`${urlDoArquivo(d.id)}?ver=1`} target="_blank" rel="noreferrer" aria-label="Abrir em outra aba" title="Abrir em outra aba">
              <ExternalLink />
            </a>
          )}
          <a className="dc-btn dc-btn--fantasma dc-btn--sm" href={urlDoArquivo(d.id)} aria-label={`Baixar ${d.nome}`} title="Baixar">
            <Download />
          </a>
          <button type="button" className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Apagar ${d.nome}`} title="Apagar" onClick={aoApagar}>
            <Trash2 />
          </button>
          <span className="dc-doc__divisa" aria-hidden />
          <button type="button" className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label="Fechar o documento" title="Fechar" onClick={aoFechar}>
            <X />
          </button>
        </span>
      </header>
      <div className="dc-doc__dados">
        <span className="truncate">
          <De d={d} />
        </span>
        <span className="dc-doc__quando">
          {diaCompleto(diaDoInstante(d.em))}
          {d.enviadoPor && `, por ${d.enviadoPor.apelido}`}
        </span>
        <LeituraDaIa d={d} reler />
      </div>
      <FaixaDoAlerta alertas={d.alertas} />
      <VerDocumento d={d} pagina={pagina} className="dc-doc__ver" />
    </section>
  );
}

function Apagar({ d, aoFechar, aoApagar }: { d: Documento; aoFechar: () => void; aoApagar?: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const apagar = useMutation({
    mutationFn: () => api(`/documentos/${d.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      void qc.invalidateQueries({ queryKey: ["processo"] });
      void qc.invalidateQueries({ queryKey: ["cliente"] });
      avisar("Documento apagado.");
      aoApagar?.();
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
