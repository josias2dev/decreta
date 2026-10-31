/**
 * A captura do DJEN, aberta pela tela de Publicações: o caderno de cada
 * tribunal (lido, sem caderno ou com erro), quando o tribunal enviou ao DJEN
 * pela última vez, os avisos e as publicações que ainda não estão ligadas a
 * um processo.
 */
import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Carregando, Faixa } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { diaCurto, diaDoInstante, hora } from "@/lib/formato";
import type { DoDjen, SaudeDaCaptura, TribunalNaCaptura } from "@/lib/tipos";

export const saudeDaCapturaQuery = {
  queryKey: ["publicacoes", "saude"],
  queryFn: () => api<SaudeDaCaptura>("/publicacoes/saude"),
  staleTime: 5 * 60_000,
};

const SELO = { lido: ["dc-selo--ok", "Lido"], ausente: ["dc-selo--prazo", "Sem caderno"], erro: ["dc-selo--vencido", "Erro"] } as const;

const contar = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n.toLocaleString("pt-BR")} ${varios}`);

/** "às 04:31" no próprio dia do caderno; "em 30/10 às 04:31" quando foi relido depois. */
function lidoEm(iso: string, dia: string) {
  const d = diaDoInstante(iso);
  return d === dia ? `às ${hora(iso)}` : `em ${diaCurto(d)} às ${hora(iso)}`;
}

function Tribunal({ t }: { t: TribunalNaCaptura }) {
  const { ultimo: u, lido: l } = t;
  const [classe, rotulo] = SELO[u.situacao];
  const linha =
    u.situacao === "lido" && l
      ? [`Caderno de ${diaCurto(l.dia)}, lido ${lidoEm(l.em, l.dia)}`, contar(l.total, "comunicação", "comunicações"), l.casadas ? `${l.casadas} do escritório` : "nenhuma do escritório", l.canceladas ? contar(l.canceladas, "cancelada", "canceladas") : null]
      : [u.situacao === "erro" ? `Não deu para ler o caderno de ${diaCurto(u.dia)}` : `Sem caderno em ${diaCurto(u.dia)}`, l ? `último lido: ${diaCurto(l.dia)}` : "nenhum lido ainda"];
  return (
    <li className="dc-captura__tribunal">
      <div className="dc-captura__texto">
        <strong>{t.tribunal}</strong>
        <span className="dc-nota">{linha.filter(Boolean).join(" · ")}</span>
        {t.envio && <span className="dc-nota">Último envio do tribunal ao DJEN: {diaCurto(t.envio)}</span>}
        {u.situacao === "erro" && u.erro && <span className="dc-nota dc-captura__erro">{u.erro}</span>}
      </div>
      <span className={`dc-selo ${classe}`}>{rotulo}</span>
    </li>
  );
}

export function CapturaDoDjen({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const q = useQuery({ ...saudeDaCapturaQuery, enabled: aberto });
  const s = q.data;
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Captura do DJEN"
      descricao="De madrugada, o Decreta lê o caderno do dia de cada tribunal no DJEN e guarda só o que é do escritório. A busca pela OAB da equipe roda às 12:40 e às 18:40, como reforço."
      acoes={
        <Botao variante="primaria" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      {!s ? (
        q.error ? <Faixa tipo="erro">{mensagemDoErro(q.error)}</Faixa> : <Carregando linhas={3} />
      ) : (
        <div className="dc-captura">
          {s.alertas.map((a) => (
            <Faixa key={a} tipo="aviso">
              <CircleAlert />
              <span>{a}</span>
            </Faixa>
          ))}
          {s.tribunais.length ? (
            <ul className="dc-captura__lista" aria-label="Cadernos por tribunal">
              {s.tribunais.map((t) => (
                <Tribunal key={t.tribunal} t={t} />
              ))}
            </ul>
          ) : (
            <p className="dc-nota m-0">A primeira leitura dos cadernos roda de madrugada, às 04:30, nos dias úteis.</p>
          )}
          {s.semProcesso > 0 && (
            <p className="dc-nota m-0">
              {s.semProcesso === 1 ? "1 publicação nova ou pendente não está ligada a um processo" : `${s.semProcesso} publicações novas ou pendentes não estão ligadas a um processo`}: vincule para o prazo contar.
            </p>
          )}
        </div>
      )}
    </Dialogo>
  );
}

/** O tribunal cancelou a comunicação depois de disponibilizar (veio numa versão nova do caderno). */
export function Cancelada({ cancelada, comPrazo }: { cancelada: NonNullable<DoDjen["cancelada"]>; comPrazo: boolean }) {
  return (
    <Faixa tipo="erro">
      <CircleAlert />
      <span>
        O tribunal cancelou esta publicação no DJEN{cancelada.motivo ? ` (${cancelada.motivo})` : ""}. {comPrazo ? "Confira se o prazo que ela abriu ainda vale." : "Não conte prazo por ela."}
      </span>
    </Faixa>
  );
}

/** Caderno do DJEN que faltou ou falhou, em Hoje e em Publicações: a caixa vazia pode não ser o dia todo. */
export function AvisoDaCaptura({ alertas, acao }: { alertas: string[] | undefined; acao: ReactNode }) {
  if (!alertas?.length) return null;
  return (
    <Faixa tipo="aviso">
      <CircleAlert />
      <span className="flex-1">{alertas.length === 1 ? alertas[0] : `${alertas.length} avisos sobre a captura do DJEN.`}</span>
      {acao}
    </Faixa>
  );
}
