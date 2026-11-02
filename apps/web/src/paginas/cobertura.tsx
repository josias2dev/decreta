/**
 * Cobertura por tribunal (decreta.site/cobertura), aberta a quem não entrou: o
 * que o tribunal enviou ao DJEN, quando o Decreta leu o caderno e qual calendário
 * a conta usa. Com os limites ditos em cima: é isso que responde "meu tribunal
 * está coberto?" sem promessa genérica. Os dados vêm de /api/cobertura.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PaginaLegal, SecaoLegal } from "@/componentes/pagina-legal";
import { API_URL } from "@/lib/api";
import { diaCompleto, diaCurto, diaDoInstante, hora } from "@/lib/formato";

type Ramo = "estadual" | "federal" | "trabalho" | "superior" | "outro";
interface Linha {
  sigla: string;
  nome: string;
  ramo: Ramo;
  calendario: "proprio" | "nacional";
  ultimaLeitura: { dia: string; em: string } | null;
  ultimoEnvio: string | null;
}
interface Cobertura {
  geradaEm: string;
  listaDoDjen: boolean;
  tribunais: Linha[];
}

const RAMOS: { id: Ramo; rotulo: string }[] = [
  { id: "estadual", rotulo: "Justiça estadual" },
  { id: "federal", rotulo: "Justiça Federal" },
  { id: "trabalho", rotulo: "Justiça do Trabalho" },
  { id: "superior", rotulo: "Tribunais superiores" },
  { id: "outro", rotulo: "Outros no DJEN" },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

export function CoberturaPage() {
  const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["cobertura"],
    queryFn: async () => {
      const r = await fetch(`${API_URL}/api/cobertura`);
      if (!r.ok) throw new Error(`cobertura: ${r.status}`);
      return (await r.json()) as Cobertura;
    },
    staleTime: 15 * 60_000,
    retry: 1,
  });
  const lista = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (q.data?.tribunais ?? []).filter((t) => !termo || semAcento(`${t.sigla} ${t.nome}`).includes(termo));
  }, [q.data, busca]);
  const proprios = q.data?.tribunais.filter((t) => t.calendario === "proprio").map((t) => t.sigla) ?? [];

  return (
    <PaginaLegal olho="Cobertura" titulo="O que o Decreta lê em cada tribunal" intro="Por tribunal: o último envio ao DJEN, a última leitura do caderno e o calendário que a conta usa. Os limites vêm antes da tabela." atualizada={q.data ? `Dados de ${diaCurto(diaDoInstante(q.data.geradaEm))} às ${hora(q.data.geradaEm)}.` : ""}>
      <SecaoLegal id="cob-limites" titulo="Os limites">
        <ul>
          <li>O Decreta lê o que o tribunal publica no DJEN. O que não vai ao DJEN, como uma intimação só pelo sistema do tribunal, não chega aqui.</li>
          <li>O caderno de um tribunal é lido às 04:30, nos dias úteis, quando há no Decreta um escritório com processo nele ou OAB da UF dele. A busca pela OAB da equipe, às 12:40 e às 18:40, alcança todos os tribunais do DJEN.</li>
          <li>Calendário próprio: {proprios.length ? proprios.join(", ") : "alguns tribunais"}. Traz o que vale todo ano, conferido na lei e nos atos do tribunal. Nos outros, a conta usa os feriados nacionais e o recesso, e avisa.</li>
          <li>Feriado municipal, ponte e suspensão de um ano só não entram sozinhos: o escritório cadastra em Configurações. Confira sempre o calendário oficial do tribunal.</li>
        </ul>
      </SecaoLegal>
      <SecaoLegal id="cob-tribunais" titulo="Tribunal por tribunal">
        {q.error ? (
          <p>Não deu para carregar a cobertura agora. Tente de novo em alguns minutos.</p>
        ) : !q.data ? (
          <p>Carregando…</p>
        ) : (
          <>
            {!q.data.listaDoDjen && <p>A lista de envios do DJEN não respondeu agora. O último envio mostrado é o que ficou guardado na última leitura.</p>}
            <input className="lp-cobertura__busca" type="search" aria-label="Procurar tribunal" placeholder="Procurar: TJSC, Paraná, trabalho…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {RAMOS.map((r) => {
              const doRamo = lista.filter((t) => t.ramo === r.id);
              return doRamo.length ? <Grupo key={r.id} rotulo={r.rotulo} linhas={doRamo} /> : null;
            })}
            {!lista.length && <p>Nenhum tribunal com esse nome.</p>}
          </>
        )}
      </SecaoLegal>
    </PaginaLegal>
  );
}

function Grupo({ rotulo, linhas }: { rotulo: string; linhas: Linha[] }) {
  return (
    <div className="lp-cobertura__grupo">
      <h3>{rotulo}</h3>
      <div className="lp-seg__tabela lp-cobertura__tabela" role="table" aria-label={rotulo}>
        <div className="lp-seg__linha lp-seg__linha--topo" role="row">
          <span role="columnheader">Tribunal</span>
          <span role="columnheader">Último envio ao DJEN</span>
          <span role="columnheader">Última leitura do caderno</span>
          <span role="columnheader">Calendário da conta</span>
        </div>
        {linhas.map((t) => (
          <div key={t.sigla} className="lp-seg__linha" role="row">
            <span role="cell">
              <strong>{t.sigla}</strong>
              {t.nome !== t.sigla && <small>{t.nome}</small>}
            </span>
            <span role="cell">{t.ultimoEnvio ? diaCompleto(t.ultimoEnvio) : "Sem informação"}</span>
            <span role="cell">{t.ultimaLeitura ? `Caderno de ${diaCurto(t.ultimaLeitura.dia)}, lido em ${diaCurto(diaDoInstante(t.ultimaLeitura.em))} às ${hora(t.ultimaLeitura.em)}` : "Ainda sem leitura do caderno"}</span>
            <span role="cell" className={t.calendario === "proprio" ? "lp-cobertura__proprio" : undefined}>
              {t.calendario === "proprio" ? "Próprio" : "Nacional e recesso"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
