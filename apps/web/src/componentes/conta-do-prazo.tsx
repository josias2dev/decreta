/**
 * A conta do prazo à mostra, para auditar: os marcos (disponibilização,
 * publicação, intimação pelo sistema), a regra, o calendário, o que ficou
 * fora, quem confirmou e o tópico de tempestividade da peça. E a segunda
 * conferência da sugestão da IA, com a confiança e o porquê.
 */
import { CircleAlert, Copy, FileDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAviso } from "@/componentes/avisos";
import { API_URL } from "@/lib/api";
import { Botao, Campo, Dados, Faixa, Painel } from "@/componentes/ui";
import { diaCompleto, diaCurto, diaDaSemana, diaDoInstante, hora, juntar } from "@/lib/formato";
import type { Contagem, ContaDoPrazo, PreviaDaConta, SegundaConferencia } from "@/lib/tipos";

const CONFIANCA = { alta: ["dc-selo--ok", "Confiança alta"], media: ["dc-selo--prazo", "Confiança média"], baixa: ["dc-selo--vencido", "Confiança baixa"] } as const;

/** A segunda conferência da sugestão: os dias batem com a lei, o ato combina com o documento, a equipe costuma descartar. */
export function ConferenciaDaSugestao({ conferencia: c }: { conferencia: SegundaConferencia }) {
  const [classe, rotulo] = CONFIANCA[c.confianca];
  return (
    <div className="dc-conferencia">
      <span className={`dc-selo ${classe}`}>{rotulo}</span>
      {c.motivos.length === 1 ? (
        <p>{c.motivos[0]}</p>
      ) : (
        <ul>
          {c.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Dupla intimação: pela intimação no sistema vence em 18/11; pela publicação no DJEN, em 23/11. …" */
export function duplaIntimacao(pelo: ContaDoPrazo["pelo"], fim: string, outroFim: string): string {
  const [este, outro] = pelo === "sistema" ? ["pela intimação no sistema", "pela publicação no DJEN"] : ["pela publicação no DJEN", "pela intimação no sistema"];
  return `Dupla intimação: ${este} vence em ${diaCurto(fim)}; ${outro}, em ${diaCurto(outroFim)}. Vale a data mais cedo enquanto o STJ não decide o Tema 1.180.`;
}

const dia = (d: string) => (
  <span>
    <strong className="dc-num">{diaCompleto(d)}</strong> <span className="text-[var(--tinta-2)]">{diaDaSemana(d)}</span>
  </span>
);

/** "Fins de semana, 02/11 (Finados) e 20/11 (Consciência Negra)". */
function foraDaConta(conta: ContaDoPrazo, contagem: Contagem): string {
  const dias = conta.desconsiderados.map((d) => `${diaCurto(d.dia)} (${d.nome})`);
  if (contagem === "uteis") return dias.length ? `Fins de semana, ${juntar(dias)}` : "Fins de semana";
  return dias.length ? juntar(dias) : "Nada";
}

function Tempestividade({ texto, certidaoDe }: { texto: string; certidaoDe: string | null }) {
  const [copiado, setCopiado] = useState(false);
  const avisar = useAviso();
  return (
    <details className="dc-conta__tempestividade">
      <summary>Tópico de tempestividade da peça</summary>
      <p>{texto}</p>
      <Botao pequeno onClick={() => void navigator.clipboard?.writeText(texto).then(() => setCopiado(true), () => avisar("Não deu para copiar. Selecione o texto e copie à mão.", { erro: true }))}>
        <Copy /> {copiado ? "Copiado" : "Copiar"}
      </Botao>
      {certidaoDe && (
        <a href={`${API_URL}/api/app/publicacoes/${certidaoDe}/certidao`} target="_blank" rel="noreferrer" className="dc-link inline-flex items-center gap-1">
          <FileDown className="size-3.5" /> Baixar a certidão do DJEN para anexar
        </a>
      )}
    </details>
  );
}

export function PainelDaConta({ conta, contagem, conferencia, aoAjustar }: { conta: ContaDoPrazo; contagem: Contagem; conferencia: SegundaConferencia | null; aoAjustar?: () => void }) {
  const linhas: [ReactNode, ReactNode][] = [];
  if (conta.disponibilizadaEm) linhas.push(["Disponibilizada", dia(conta.disponibilizadaEm)]);
  linhas.push(["Publicada", dia(conta.publicadoEm)]);
  if (conta.intimadoNoSistemaEm) linhas.push(["Intimação pelo sistema", dia(conta.intimadoNoSistemaEm)]);
  linhas.push(["Começa", dia(conta.inicio)], ["Vence", dia(conta.fim)], ["Regra", conta.regra], ["Calendário", conta.calendario], ["Fora da conta", foraDaConta(conta, contagem)]);
  if (conta.prorrogadoDe && !conta.fimDigitado) linhas.push(["Prorrogado", `Caía em ${diaCurto(conta.prorrogadoDe)}, sem expediente completo`]);
  linhas.push([
    "Confirmado",
    conta.confirmadoEm ? `${conta.confirmadoPor?.apelido ?? "Alguém"} · ${diaCurto(diaDoInstante(conta.confirmadoEm))} às ${hora(conta.confirmadoEm)}` : "Ainda não: confira e confirme",
  ]);
  return (
    <Painel titulo="A conta">
      <div className="dc-conta">
        {conferencia && (
          <div className="dc-par">
            <span className="dc-rotulo">Segunda conferência</span>
            <ConferenciaDaSugestao conferencia={conferencia} />
          </div>
        )}
        {conta.pelaConta && !conta.fimDigitado && (
          <Faixa tipo="aviso">
            <CircleAlert />
            <span className="flex-1">O calendário mudou depois da confirmação: pela conta de hoje, vence em {diaCompleto(conta.pelaConta)}. Ajuste o prazo para recontar.</span>
            {aoAjustar && (
              <button type="button" className="dc-link" onClick={aoAjustar}>
                Ajustar
              </button>
            )}
          </Faixa>
        )}
        <Dados linhas={linhas} />
        {conta.outra && (
          <Faixa tipo="ia">
            <span>{duplaIntimacao(conta.pelo, conta.fim, conta.outra.fim)}</span>
          </Faixa>
        )}
        {conta.fimDigitado && conta.pelaConta && (
          <Faixa tipo="aviso">
            <span>Data final digitada à mão. Pela conta do Decreta, venceria em {diaCompleto(conta.pelaConta)}.</span>
          </Faixa>
        )}
        {conta.tempestividade && <Tempestividade texto={conta.tempestividade} certidaoDe={conta.certidaoDe} />}
      </div>
    </Painel>
  );
}

/** O campo da dupla intimação, nos diálogos de ajuste e confirmação. */
export function CampoIntimacaoNoSistema({ id, valor, aoMudar }: { id: string; valor: string; aoMudar: (v: string) => void }) {
  return (
    <Campo rotulo="Intimação pelo sistema (opcional)" htmlFor={id} ajuda="Se o sistema do tribunal também intimou, o Decreta conta pelos dois e vale o que vence primeiro (Tema 1.180 do STJ, ainda sem tese).">
      <input id={id} type="date" value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </Campo>
  );
}

/** A prévia nos diálogos: a data final, a explicação e, com dupla intimação, a outra conta. */
export function PreviaNoDialogo({ fim, previa, sabeData }: { fim: string; previa: PreviaDaConta | undefined; sabeData: boolean }) {
  const conta = !sabeData ? previa : undefined;
  return (
    <Faixa tipo="ia">
      <span>
        Vence em <strong className="dc-num">{diaCompleto(fim)}</strong>, {diaDaSemana(fim)}.{conta ? ` ${conta.explicacao}` : ""}
        {conta?.outra ? ` ${duplaIntimacao(conta.pelo, conta.fim, conta.outra.fim)}` : ""}
      </span>
    </Faixa>
  );
}

/** Os motivos da conferência baixa no topo do diálogo: é por eles que a pessoa está conferindo. */
export function MotivosParaConferir({ conferencia }: { conferencia: SegundaConferencia | null | undefined }) {
  if (conferencia?.confianca !== "baixa") return null;
  return (
    <Faixa tipo="aviso">
      <CircleAlert />
      <span>Confira antes de confirmar. {conferencia.motivos.join(" ")}</span>
    </Faixa>
  );
}
