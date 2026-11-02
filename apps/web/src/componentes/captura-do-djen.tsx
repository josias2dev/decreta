/**
 * A captura do DJEN, aberta pela tela de Publicações: o caderno de cada
 * tribunal (lido, sem caderno ou com erro), quando o tribunal enviou ao DJEN
 * pela última vez, os avisos e as publicações que ainda não estão ligadas a
 * um processo.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Carregando, Faixa, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro, SO_LEITURA } from "@/lib/api";
import { ehSocio } from "@/lib/auth";
import { equipeQuery, escritorioQuery, podeCriar } from "@/lib/consultas";
import { diaCurto, diaDoInstante, hora } from "@/lib/formato";
import type { DoDjen, Eu, SaudeDaCaptura, TribunalNaCaptura } from "@/lib/tipos";

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

type Falta = "desligada" | "sem_oab";

const FALTA: Record<Falta, { titulo: string; texto: string; aoSocio: string; aosOutros: string }> = {
  sem_oab: {
    titulo: "Falta a OAB para achar as publicações",
    texto: "O Decreta busca as publicações no DJEN pela OAB da equipe. Sem nenhuma cadastrada, esta caixa pode ficar vazia mesmo quando há intimação.",
    aoSocio: "Cadastrar a OAB",
    aosOutros: "Peça a um sócio para cadastrar a OAB na tela da Equipe.",
  },
  desligada: {
    titulo: "A busca no DJEN está desligada",
    texto: "Com ela desligada, nenhuma publicação chega sozinha: esta caixa fica vazia mesmo quando há intimação.",
    aoSocio: "Ligar a busca",
    aosOutros: "Peça a um sócio para ligar a busca em Configurações.",
  },
};

/**
 * O que impede a busca no DJEN: ela desligada ou nenhuma OAB para procurar. Com isso a caixa fica vazia sem estar em
 * dia, e a tela não pode dizer que não há nada. `undefined` enquanto ainda não dá para saber.
 */
export function useFaltaParaBuscar(ligado: boolean): Falta | null | undefined {
  const escritorio = useQuery({ ...escritorioQuery, enabled: ligado });
  const equipe = useQuery({ ...equipeQuery, enabled: ligado });
  if (!escritorio.data || !equipe.data) return undefined;
  if (!escritorio.data.capturaDjen) return "desligada";
  return equipe.data.pessoas.some((p) => p.oabNumero) ? null : "sem_oab";
}

/** Quem pode resolver vai direto: a OAB entra no /comecar enquanto ele está pendente (salvar lá já busca), senão na Equipe. */
function Resolver({ falta, eu }: { falta: Falta; eu: Eu }) {
  if (falta === "desligada") {
    return (
      <Link to="/configuracoes" search={{ aba: "avisos" }} className="dc-btn dc-btn--primaria dc-btn--sm">
        {FALTA.desligada.aoSocio}
      </Link>
    );
  }
  return (
    <Link to={eu.escritorio.onboarding ? "/comecar" : "/equipe"} className="dc-btn dc-btn--primaria dc-btn--sm">
      {FALTA.sem_oab.aoSocio}
    </Link>
  );
}

/** A caixa vazia por causa da falta, na tela de Publicações. */
export function VazioPorFalta({ falta, eu }: { falta: Falta; eu: Eu }) {
  const pode = podeCriar(eu);
  const socio = ehSocio(eu.usuario.papel);
  return (
    <Vazio titulo={FALTA[falta].titulo} acao={pode && socio && <Resolver falta={falta} eu={eu} />}>
      {FALTA[falta].texto}
      {!pode ? <span>{SO_LEITURA}</span> : !socio && <span>{FALTA[falta].aosOutros}</span>}
    </Vazio>
  );
}

/** A mesma falta, em uma faixa: no painel e no cartão do Hoje, onde a caixa não está à vista. */
export function AvisoDaFalta({ falta, eu }: { falta: Falta; eu: Eu }) {
  const pode = podeCriar(eu) && ehSocio(eu.usuario.papel);
  return (
    <Faixa tipo="aviso">
      <CircleAlert />
      <span className="flex-1">{pode ? FALTA[falta].titulo : `${FALTA[falta].titulo}. ${FALTA[falta].aosOutros}`}</span>
      {pode && (
        <Link to={falta === "desligada" ? "/configuracoes" : eu.escritorio.onboarding ? "/comecar" : "/equipe"} search={falta === "desligada" ? { aba: "avisos" } : undefined} className="dc-link flex-none">
          {FALTA[falta].aoSocio}
        </Link>
      )}
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
