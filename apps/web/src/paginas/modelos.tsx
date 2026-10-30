/**
 * Modelos: o banco de teses do escritório. As peças boas ficam aqui e, ao
 * gerar uma peça, a IA segue as duas mais parecidas (mesmo tipo e assunto).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookMarked, Plus, Trash2, Upload } from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { Rolagem } from "@/componentes/rolagem";
import { Botao, Cabecalho, CampoDeBusca, Campo, Carregando, Chip, Faixa, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { diaCompleto, diaCurto, diaDoInstante, numero } from "@/lib/formato";
import type { Catalogo, Modelo, ModeloNaLista } from "@/lib/tipos";

type Lista = { total: number; itens: ModeloNaLista[] };

const catalogoQuery = { queryKey: ["pecas", "catalogo"], queryFn: () => api<Catalogo>("/pecas/catalogo"), staleTime: Infinity };

function OpcoesDeTipo({ catalogo }: { catalogo: Catalogo | undefined }) {
  return (
    <>
      {catalogo?.grupos.map((g) => (
        <optgroup key={g.nome} label={g.nome}>
          {g.tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function ModelosPage() {
  const celular = useCelular();
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("");
  const busca = useDeferredValue(texto.trim());
  const params = new URLSearchParams({ ...(busca ? { busca } : {}), ...(tipo ? { tipo } : {}) }).toString();
  const q = useQuery({ queryKey: ["modelos", busca, tipo], queryFn: () => api<Lista>(`/modelos${params ? `?${params}` : ""}`), placeholderData: (a) => a });
  const catalogo = useQuery(catalogoQuery);
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const itens = q.data?.itens ?? [];
  const filtrando = !!busca || !!tipo;
  const sub = !q.data
    ? " "
    : !q.data.total
      ? "Nenhum modelo ainda"
      : filtrando
        ? `${numero(itens.length)} de ${numero(q.data.total)} ${q.data.total === 1 ? "modelo" : "modelos"}`
        : `${numero(q.data.total)} ${q.data.total === 1 ? "modelo" : "modelos"}${celular ? "" : " · a IA segue os mais parecidos ao gerar"}`;
  const filtros = (
    <div className="dc-filtros">
      <CampoDeBusca valor={texto} aoMudar={setTexto} rotulo="Buscar modelo" placeholder="Tese, assunto ou palavra do texto" />
      <div className="dc-campo dc-filtro-tipo">
        <select aria-label="Tipo de peça" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <OpcoesDeTipo catalogo={catalogo.data} />
        </select>
      </div>
    </div>
  );
  const vazio =
    q.data && !q.data.total ? (
      <Vazio titulo="Nenhum modelo ainda">
        Guarde aqui as peças boas do escritório: em Gerar peça, depois de revisar, use Guardar como modelo. Ou envie o DOCX que já está no computador.
        <Botao variante="primaria" pequeno onClick={() => setNovo(true)}>
          <Plus /> Novo modelo
        </Botao>
      </Vazio>
    ) : (
      <Vazio titulo="Nada encontrado">Tente outra palavra ou outro tipo.</Vazio>
    );
  const dialogos = (
    <>
      {aberto && <VerModelo id={aberto} aoFechar={() => setAberto(null)} />}
      <NovoModelo aberto={novo} aoFechar={() => setNovo(false)} />
    </>
  );

  if (celular) {
    return (
      <TelaCelular
        titulo="Modelos"
        sobre={sub}
        voltar
        direita={
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Novo modelo" onClick={() => setNovo(true)}>
            <Plus />
          </button>
        }
        fixo={filtros}
      >
        {q.error ? (
          <FalhaAoCarregar erro={q.error} sumiu="Modelos não encontrados" aoTentar={() => void q.refetch()} />
        ) : !q.data ? (
          <Carregando />
        ) : itens.length ? (
          <section className="dc-painel">
            <div className="dc-linhas">
              {itens.map((m) => (
                <button key={m.id} type="button" className="dc-linhas__item w-full border-0 bg-transparent text-left" onClick={() => setAberto(m.id)}>
                  <BookMarked className="mt-0.5 size-4 flex-none text-[var(--tinta-3)]" />
                  <span className="dc-celula min-w-0 flex-1">
                    <span className="dc-celula__1">{m.titulo}</span>
                    <span className="dc-celula__2 truncate">{[m.tipoNome, m.tese ?? m.assunto].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          vazio
        )}
        {dialogos}
      </TelaCelular>
    );
  }

  return (
    <Pagina cheia>
      <Cabecalho
        titulo="Modelos"
        sub={sub}
        acoes={
          <Botao variante="primaria" onClick={() => setNovo(true)}>
            <Plus /> Novo modelo
          </Botao>
        }
      />
      {filtros}
      <section className="dc-painel">
        {q.error ? (
          <FalhaAoCarregar erro={q.error} sumiu="Modelos não encontrados" aoTentar={() => void q.refetch()} />
        ) : !q.data ? (
          <div className="p-4">
            <Carregando />
          </div>
        ) : itens.length ? (
          <Rolagem id="modelos" topo={params} className="dc-tabela-caixa">
            <table className="dc-tabela">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th style={{ width: 220 }}>Tipo</th>
                  <th style={{ width: 180 }}>Assunto</th>
                  <th style={{ width: 150 }}>Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((m) => (
                  <tr key={m.id} data-link onClick={() => setAberto(m.id)}>
                    <td>
                      <span className="dc-celula">
                        <button type="button" className="dc-celula__1 border-0 bg-transparent p-0 text-left hover:underline" onClick={() => setAberto(m.id)}>
                          {m.titulo}
                        </button>
                        {m.tese && <span className="dc-celula__2">{m.tese}</span>}
                      </span>
                    </td>
                    <td>{m.tipoNome}</td>
                    <td className="text-[var(--tinta-2)]">{m.assunto ?? "—"}</td>
                    <td>
                      <span className="dc-celula">
                        <span className="dc-num">{diaCompleto(diaDoInstante(m.em))}</span>
                        {m.criadoPor && <span className="dc-celula__2">{m.criadoPor.apelido}</span>}
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
      {dialogos}
    </Pagina>
  );
}

function VerModelo({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ["modelos", "um", id], queryFn: () => api<Modelo>(`/modelos/${id}`) });
  const [f, setF] = useState<{ titulo: string; tese: string; assunto: string } | null>(null);
  const [apagando, setApagando] = useState(false);
  const m = q.data;
  const campos = f ?? (m ? { titulo: m.titulo, tese: m.tese ?? "", assunto: m.assunto ?? "" } : null);
  const mudou = !!f && !!m && (f.titulo !== m.titulo || f.tese !== (m.tese ?? "") || f.assunto !== (m.assunto ?? ""));
  const salvar = useMutation({
    mutationFn: () => api(`/modelos/${id}`, { method: "PUT", json: { titulo: campos!.titulo.trim(), tese: campos!.tese.trim() || null, assunto: campos!.assunto.trim() || null } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["modelos"] });
      avisar("Modelo salvo.");
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const apagar = useMutation({
    mutationFn: () => api(`/modelos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["modelos"] });
      avisar("Modelo apagado. A IA não usa mais.");
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={m?.titulo ?? "Modelo"}
      descricao={m ? [m.tipoNome, m.criadoPor?.apelido, `atualizado em ${diaCurto(diaDoInstante(m.em))}`].filter(Boolean).join(" · ") : undefined}
      className="dc-dialogo--largo"
      acoes={
        m &&
        (apagando ? (
          <>
            <Botao variante="fantasma" onClick={() => setApagando(false)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={() => apagar.mutate()} ocupado={apagar.isPending}>
              Apagar modelo
            </Botao>
          </>
        ) : (
          <>
            <Botao variante="fantasma" className="mr-auto" onClick={() => setApagando(true)}>
              <Trash2 /> Apagar
            </Botao>
            <Botao variante="fantasma" onClick={aoFechar}>
              Fechar
            </Botao>
            <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!mudou || (campos?.titulo.trim().length ?? 0) < 2}>
              Salvar
            </Botao>
          </>
        ))
      }
    >
      {!m || !campos ? (
        q.error ? (
          <FalhaAoCarregar erro={q.error} sumiu="Modelo não encontrado" />
        ) : (
          <Carregando linhas={3} />
        )
      ) : (
        <div className="dc-form">
          {apagando && <Faixa tipo="erro">A IA para de seguir este modelo. A peça de origem continua no processo. Não dá para desfazer.</Faixa>}
          <Campo rotulo="Nome do modelo" htmlFor="vm-titulo">
            <input id="vm-titulo" value={campos.titulo} onChange={(e) => setF({ ...campos, titulo: e.target.value })} />
          </Campo>
          <div className="dc-grade-2">
            <Campo rotulo="Tese" htmlFor="vm-tese">
              <input id="vm-tese" value={campos.tese} onChange={(e) => setF({ ...campos, tese: e.target.value })} placeholder="Opcional" />
            </Campo>
            <Campo rotulo="Assunto" htmlFor="vm-assunto">
              <input id="vm-assunto" value={campos.assunto} onChange={(e) => setF({ ...campos, assunto: e.target.value })} placeholder="Opcional" />
            </Campo>
          </div>
          <div className="dc-campo">
            <span className="flex items-baseline justify-between gap-2">
              <label>Texto</label>
              {m.pecaId && (
                <Link to="/pecas" search={{ id: m.pecaId }} className="dc-link text-[13px]">
                  Abrir a peça de origem
                </Link>
              )}
            </span>
            <p className="dc-teor dc-modelo__texto">{m.texto}</p>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

const ACEITOS = ".docx,.pdf,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain";

function NovoModelo({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const catalogo = useQuery(catalogoQuery);
  const entrada = useRef<HTMLInputElement>(null);
  const inicial = () => ({ jeito: "arquivo" as "arquivo" | "texto", arquivo: null as File | null, titulo: "", tipo: "", tese: "", assunto: "", texto: "" });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const salvar = useMutation({
    mutationFn: () => {
      if (f.jeito === "arquivo") {
        const form = new FormData();
        form.set("arquivo", f.arquivo!);
        form.set("tipo", f.tipo);
        if (f.titulo.trim()) form.set("titulo", f.titulo.trim());
        if (f.tese.trim()) form.set("tese", f.tese.trim());
        if (f.assunto.trim()) form.set("assunto", f.assunto.trim());
        return api("/modelos/arquivo", { form });
      }
      return api("/modelos", { json: { titulo: f.titulo.trim(), tipo: f.tipo, texto: f.texto, tese: f.tese.trim() || null, assunto: f.assunto.trim() || null } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["modelos"] });
      avisar("Modelo guardado. A IA segue nas próximas peças do tipo.");
      aoFechar();
    },
  });
  const pronto = !!f.tipo && (f.jeito === "arquivo" ? !!f.arquivo : f.titulo.trim().length >= 2 && f.texto.trim().length >= 200);
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo modelo"
      descricao="Uma peça boa do escritório. A IA segue a estrutura e os argumentos, nunca os fatos e nomes."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!pronto}>
            Guardar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <div className="flex gap-2">
          <Chip ligado={f.jeito === "arquivo"} onClick={() => setF({ ...f, jeito: "arquivo" })}>
            Enviar arquivo
          </Chip>
          <Chip ligado={f.jeito === "texto"} onClick={() => setF({ ...f, jeito: "texto" })}>
            Colar o texto
          </Chip>
        </div>
        <Campo rotulo="Tipo de peça" htmlFor="nm-tipo">
          <select id="nm-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="">Escolha</option>
            <OpcoesDeTipo catalogo={catalogo.data} />
          </select>
        </Campo>
        {f.jeito === "arquivo" ? (
          <div className="dc-campo">
            <label>Arquivo</label>
            <input
              ref={entrada}
              type="file"
              hidden
              accept={ACEITOS}
              onChange={(e) => {
                const a = e.target.files?.[0] ?? null;
                e.target.value = "";
                setF({ ...f, arquivo: a });
              }}
            />
            <span className="flex min-w-0 items-center gap-3">
              <Botao onClick={() => entrada.current?.click()}>
                <Upload /> {f.arquivo ? "Trocar" : "Escolher"}
              </Botao>
              <span className="dc-nota min-w-0 truncate">{f.arquivo?.name ?? "DOCX, PDF com texto ou TXT"}</span>
            </span>
          </div>
        ) : (
          <Campo rotulo="Texto da peça" htmlFor="nm-texto" ajuda={f.texto.trim().length < 200 ? "Cole a peça inteira." : undefined}>
            <textarea id="nm-texto" rows={8} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
          </Campo>
        )}
        <Campo rotulo="Nome do modelo" htmlFor="nm-titulo" ajuda={f.jeito === "arquivo" ? "Se ficar vazio, vale o nome do arquivo." : undefined}>
          <input id="nm-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Contestação · negativa de cobertura" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Tese" htmlFor="nm-tese">
            <input id="nm-tese" value={f.tese} onChange={(e) => setF({ ...f, tese: e.target.value })} placeholder="Opcional" />
          </Campo>
          <Campo rotulo="Assunto" htmlFor="nm-assunto">
            <input id="nm-assunto" value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} placeholder="Opcional" />
          </Campo>
        </div>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
