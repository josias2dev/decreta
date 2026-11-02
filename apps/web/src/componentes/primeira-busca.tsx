/**
 * O primeiro minuto, em /comecar: a busca nos últimos dias do DJEN, ao vivo. A
 * tela pergunta o andamento enquanto há o que mudar, e nada aqui segura a pessoa:
 * ela segue configurando, e a caixa de Publicações fica a um toque.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { diaCurto } from "@/lib/formato";

export interface BuscaPedida {
  pedidaEm: string;
  dias: number;
  /** "OAB/SC 41233". */
  oab: string;
}

type Leitura = "lendo" | "com_prazo" | "sem_prazo" | "sem_leitura";
interface Progresso {
  situacao: "na_fila" | "buscando" | "pronta" | "falhou";
  encontradas: number;
  novas: number;
  lidas: number;
  comPrazo: number;
  iaLigada: boolean;
  itens: { id: string; titulo: string; tribunal: string | null; disponibilizadaEm: string; leitura: Leitura; prazo: string | null }[];
  erro: string | null;
  proximaBusca: string;
}

/** Depois disso a tela para de perguntar: o que faltar chega na caixa de Publicações. */
const PARAR_DEPOIS_MS = 5 * 60_000;
const DEMORANDO_DEPOIS_MS = 45_000;

const publicacoes = (n: number) => (n === 1 ? "1 publicação" : `${n} publicações`);
const comPrazo = (n: number) => (n === 1 ? "1 com prazo" : `${n} com prazo`);

function acabou(p: Progresso | undefined): boolean {
  if (!p) return false;
  if (p.situacao === "falhou") return true;
  if (p.situacao !== "pronta") return false;
  return !p.iaLigada || p.encontradas === 0 || p.itens.every((i) => i.leitura !== "lendo");
}

function SeloDaLeitura({ leitura }: { leitura: Leitura }) {
  if (leitura === "lendo")
    return (
      <span className="dc-busca__lendo">
        <LoaderCircle aria-hidden className="animate-spin" /> A IA está lendo
      </span>
    );
  if (leitura === "sem_prazo") return <span className="dc-nota">Sem prazo</span>;
  if (leitura === "sem_leitura") return <span className="dc-nota">Sem leitura da IA</span>;
  return null;
}

export function PrimeiraBusca({ busca }: { busca: BuscaPedida }) {
  const [demorando, setDemorando] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDemorando(true), DEMORANDO_DEPOIS_MS);
    return () => window.clearTimeout(t);
  }, []);
  const q = useQuery({
    queryKey: ["primeira-busca", busca.pedidaEm],
    queryFn: () => api<Progresso>(`/escritorio/primeira-busca?desde=${encodeURIComponent(busca.pedidaEm)}`),
    refetchInterval: (query) => (acabou(query.state.data) || Date.now() - new Date(busca.pedidaEm).getTime() > PARAR_DEPOIS_MS ? false : 2000),
    retry: 2,
  });
  const p = q.data;
  const emAndamento = !p || p.situacao === "na_fila" || p.situacao === "buscando";

  return (
    <section className="dc-busca" aria-live="polite" aria-label="Busca no DJEN">
      {emAndamento ? (
        <>
          <p className="dc-busca__titulo">
            <LoaderCircle aria-hidden className="animate-spin" /> Buscando no DJEN as publicações da {busca.oab} dos últimos {busca.dias} dias…
          </p>
          <p className="dc-nota">{demorando ? "A busca está demorando. Pode seguir: as publicações chegam na caixa assim que o DJEN responder." : "Pode seguir configurando enquanto isso."}</p>
        </>
      ) : p.situacao === "falhou" ? (
        <p className="dc-busca__titulo dc-busca__titulo--aviso">
          <CircleAlert aria-hidden />
          <span>
            O DJEN não respondeu agora. A sua OAB está salva, e o Decreta olha de novo {p.proximaBusca}.
          </span>
        </p>
      ) : p.encontradas === 0 ? (
        <>
          <p className="dc-busca__titulo">Nenhuma publicação da {busca.oab} nos últimos {busca.dias} dias.</p>
          <p className="dc-nota">O Decreta olha de novo {p.proximaBusca}. Se o número estiver errado, corrija em Equipe.</p>
        </>
      ) : (
        <>
          <p className="dc-busca__titulo">
            Achei {publicacoes(p.encontradas)}
            {p.comPrazo > 0 ? `, ${comPrazo(p.comPrazo)}` : ""}
          </p>
          {p.iaLigada ? (
            <p className="dc-nota">{p.lidas >= p.encontradas ? "A IA leu todas. Falta uma pessoa conferir e confirmar." : `A IA leu ${p.lidas} de ${p.encontradas}. Uma pessoa confere e confirma cada prazo.`}</p>
          ) : (
            <p className="dc-nota">A leitura da IA não está disponível agora: as publicações ficam na caixa para você decidir.</p>
          )}
          <ul className="dc-busca__lista">
            {p.itens.map((i) => (
              <li key={i.id}>
                <span className="dc-busca__item">
                  <strong>{i.prazo ?? i.titulo}</strong>
                  <span className="dc-nota">
                    {[i.tribunal, diaCurto(i.disponibilizadaEm)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <SeloDaLeitura leitura={i.leitura} />
              </li>
            ))}
          </ul>
          <Link className="dc-link dc-busca__abrir" to="/publicacoes">
            Abrir a caixa de Publicações <ArrowRight aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}

/** O pedido não saiu (o teto de quem está em avaliação, a fila fora do ar): diz, sem segurar ninguém. */
export function BuscaNaoSaiu({ mensagem }: { mensagem: string }) {
  return (
    <section className="dc-busca" role="status">
      <p className="dc-busca__titulo dc-busca__titulo--aviso">
        <CircleAlert aria-hidden />
        <span>{mensagem}</span>
      </p>
      <p className="dc-nota">A OAB está salva. O Decreta busca as publicações nas rodadas de sempre: 04:30, 12:40 e 18:40, nos dias úteis.</p>
    </section>
  );
}
