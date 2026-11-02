/**
 * A estratégia antes de gerar: partes do cadastro, teses com a evidência, provas,
 * capítulos e as perguntas que mudam a peça. A pessoa edita, reordena e remove; o
 * que for removido não volta na peça.
 */
import type { EstrategiaDaPeca, ParteDoCadastro } from "@decreta/core";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Botao, Faixa } from "@/componentes/ui";

const novoId = (prefixo: string) => `${prefixo}-${crypto.randomUUID().slice(0, 8)}`;
const NOME_DO_TIPO = { pf: "Pessoa física", pj: "Pessoa jurídica" } as const;

function trocar<T>(lista: readonly T[], i: number, parcial: Partial<T>): T[] {
  return lista.map((x, j) => (j === i ? { ...x, ...parcial } : x));
}

function mover<T>(lista: readonly T[], i: number, para: number): T[] {
  const copia = [...lista];
  const [item] = copia.splice(i, 1);
  copia.splice(para, 0, item!);
  return copia;
}

function ControlesDaLinha({ nome, i, total, aoMover, aoRemover }: { nome: string; i: number; total: number; aoMover: (para: number) => void; aoRemover: () => void }) {
  return (
    <span className="dc-estrategia__controles">
      <Botao variante="fantasma" pequeno disabled={i === 0} aria-label={`Subir ${nome}`} onClick={() => aoMover(i - 1)}>
        <ArrowUp />
      </Botao>
      <Botao variante="fantasma" pequeno disabled={i === total - 1} aria-label={`Descer ${nome}`} onClick={() => aoMover(i + 1)}>
        <ArrowDown />
      </Botao>
      <Botao variante="fantasma" pequeno aria-label={`Remover ${nome}`} onClick={aoRemover}>
        <Trash2 />
      </Botao>
    </span>
  );
}

function Secao({ titulo, nota, acao, children }: { titulo: string; nota?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="dc-estrategia__secao" aria-label={titulo}>
      <div className="dc-estrategia__topo">
        <h3>{titulo}</h3>
        {nota && <span className="dc-nota">{nota}</span>}
        {acao}
      </div>
      {children}
    </section>
  );
}

export function EstrategiaDaPecaEditor({ estrategia: e, partes, aoMudar }: { estrategia: EstrategiaDaPeca; partes: readonly ParteDoCadastro[]; aoMudar: (e: EstrategiaDaPeca) => void }) {
  const mudar = (parcial: Partial<EstrategiaDaPeca>) => aoMudar({ ...e, ...parcial });
  return (
    <div className="dc-estrategia">
      <Secao titulo="Partes" nota="do cadastro">
        <ul className="dc-estrategia__partes">
          {partes.map((p) => (
            <li key={p.nome}>
              <strong>{p.nome}</strong>
              <span>
                {p.tipo ? NOME_DO_TIPO[p.tipo] : "O cadastro não diz se é física ou jurídica: sai como [COMPLETAR]"} · polo {p.polo}
                {p.cliente ? " · nosso cliente" : ""}
              </span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo="Teoria do caso">
        <div className="dc-campo">
          <textarea aria-label="Teoria do caso" rows={2} value={e.teoria} onChange={(ev) => mudar({ teoria: ev.target.value })} />
        </div>
      </Secao>

      <Secao
        titulo="Teses"
        acao={
          <Botao variante="fantasma" pequeno onClick={() => mudar({ teses: [...e.teses, { id: novoId("t"), titulo: "", fundamento: "", evidencias: [], falta: null }] })}>
            <Plus /> Acrescentar tese
          </Botao>
        }
      >
        {e.teses.map((t, i) => {
          const nome = t.titulo || `a tese ${i + 1}`;
          const comProva = t.evidencias.some((x) => x.confere);
          return (
            <article key={t.id} className="dc-estrategia__tese">
              <div className="dc-estrategia__linha">
                <div className="dc-campo">
                  <input aria-label={`Título da tese ${i + 1}`} value={t.titulo} onChange={(ev) => mudar({ teses: trocar(e.teses, i, { titulo: ev.target.value }) })} placeholder="A tese em poucas palavras" />
                </div>
                <ControlesDaLinha nome={nome} i={i} total={e.teses.length} aoMover={(para) => mudar({ teses: mover(e.teses, i, para) })} aoRemover={() => mudar({ teses: e.teses.filter((_, j) => j !== i) })} />
              </div>
              <div className="dc-campo">
                <textarea aria-label={`Fundamento da tese ${i + 1}`} rows={2} value={t.fundamento} onChange={(ev) => mudar({ teses: trocar(e.teses, i, { fundamento: ev.target.value }) })} placeholder="Por que ela vale neste caso" />
              </div>
              {t.evidencias.length > 0 && (
                <ul className="dc-estrategia__evidencias" aria-label={`Evidências de ${nome}`}>
                  {t.evidencias.map((x, k) => (
                    <li key={k} className={x.confere ? undefined : "is-nao-confere"}>
                      {x.confere ? <Check aria-label="O trecho está na fonte" /> : <TriangleAlert aria-label="O trecho não está na fonte" />}
                      <span>
                        <q>{x.trecho}</q>
                        <small>
                          {x.rotulo}
                          {x.folha ? `, fl. ${x.folha}` : ""}
                          {x.confere ? "" : " · não achei este trecho na fonte"}
                        </small>
                      </span>
                      <Botao variante="fantasma" pequeno aria-label="Remover esta evidência" onClick={() => mudar({ teses: trocar(e.teses, i, { evidencias: t.evidencias.filter((_, j) => j !== k) }) })}>
                        <Trash2 />
                      </Botao>
                    </li>
                  ))}
                </ul>
              )}
              {!comProva && <Faixa tipo="aviso">{t.falta ? `Sem prova nos autos. Falta: ${t.falta}. O que depender disso sai como "a comprovar".` : `Sem prova nos autos. O que depender disso sai como "a comprovar".`}</Faixa>}
              {comProva && t.falta && <p className="dc-citacoes__nota">Falta ainda: {t.falta}</p>}
            </article>
          );
        })}
        {e.teses.length === 0 && <p className="dc-citacoes__nota">Sem teses: a IA escreve só com as instruções e o material.</p>}
      </Secao>

      <Secao
        titulo="Provas"
        acao={
          <Botao variante="fantasma" pequeno onClick={() => mudar({ provas: [...e.provas, { id: novoId("p"), descricao: "", rotulo: null }] })}>
            <Plus /> Acrescentar prova
          </Botao>
        }
      >
        {e.provas.map((p, i) => (
          <div key={p.id} className="dc-estrategia__linha">
            <div className="dc-campo">
              <input aria-label={`Prova ${i + 1}`} value={p.descricao} onChange={(ev) => mudar({ provas: trocar(e.provas, i, { descricao: ev.target.value }) })} placeholder="A prova" />
            </div>
            <span className="dc-nota dc-estrategia__onde">{p.rotulo ?? "a produzir"}</span>
            <ControlesDaLinha nome={p.descricao || `a prova ${i + 1}`} i={i} total={e.provas.length} aoMover={(para) => mudar({ provas: mover(e.provas, i, para) })} aoRemover={() => mudar({ provas: e.provas.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </Secao>

      <Secao
        titulo="Capítulos"
        nota="na ordem da peça"
        acao={
          <Botao variante="fantasma" pequeno onClick={() => mudar({ capitulos: [...e.capitulos, { id: novoId("c"), titulo: "", resumo: "" }] })}>
            <Plus /> Acrescentar capítulo
          </Botao>
        }
      >
        {e.capitulos.map((c, i) => (
          <div key={c.id} className="dc-estrategia__linha">
            <div className="dc-campo">
              <input aria-label={`Capítulo ${i + 1}`} value={c.titulo} onChange={(ev) => mudar({ capitulos: trocar(e.capitulos, i, { titulo: ev.target.value }) })} placeholder="O título do capítulo" />
            </div>
            <ControlesDaLinha nome={c.titulo || `o capítulo ${i + 1}`} i={i} total={e.capitulos.length} aoMover={(para) => mudar({ capitulos: mover(e.capitulos, i, para) })} aoRemover={() => mudar({ capitulos: e.capitulos.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </Secao>

      {e.perguntas.length > 0 && (
        <Secao titulo="Perguntas" nota="a resposta muda a peça">
          {e.perguntas.map((q, i) => (
            <div key={q.id} className="dc-campo dc-estrategia__pergunta">
              <label htmlFor={`pergunta-${q.id}`}>{q.pergunta}</label>
              <small>{q.muda}</small>
              <textarea id={`pergunta-${q.id}`} rows={2} value={q.resposta} onChange={(ev) => mudar({ perguntas: trocar(e.perguntas, i, { resposta: ev.target.value }) })} />
            </div>
          ))}
        </Secao>
      )}
    </div>
  );
}
