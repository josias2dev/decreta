/**
 * "Antes de protocolar": o que a checagem por código achou na peça, junto do que
 * a conferência dos fatos e dos julgados deixou em aberto. Clicar leva ao ponto do
 * texto. Não bloqueia o download: avisa.
 */
import { checarPeca, type ParteDoCadastro } from "@decreta/core";
import { BookMarked, CircleHelp, Link2Off, Scale, TextCursorInput, TriangleAlert, type LucideIcon } from "lucide-react";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Painel } from "@/componentes/ui";
import type { Peca } from "@/lib/tipos";

export type TipoNaLista = "falta" | "frase" | "marca" | "fato" | "julgado" | "parte" | "conferencia";

export interface PontoNaLista {
  chave: string;
  tipo: TipoNaLista;
  mensagem: string;
  /** Onde está no texto; nulo no que vale para a peça inteira. */
  inicio: number | null;
  fim: number | null;
}

const ICONES: Record<TipoNaLista, LucideIcon> = {
  falta: TextCursorInput,
  frase: TriangleAlert,
  marca: TriangleAlert,
  fato: CircleHelp,
  julgado: Scale,
  parte: BookMarked,
  conferencia: Link2Off,
};

const TIPO_DO_PONTO = { completar: "falta", colchete: "falta", campo_vazio: "falta", jurisprudencia: "julgado", a_comprovar: "fato", frase_quebrada: "frase", marca_interna: "marca", forca_sem_citacao: "julgado", qualificacao: "parte" } as const;

/** Tudo que está em aberto, na ordem do texto. O que vale para a peça inteira vem primeiro. */
export function pontosAntesDeProtocolar(texto: string, partes: readonly ParteDoCadastro[], peca: Peca | undefined): PontoNaLista[] {
  if (!texto.trim()) return [];
  const pontos: PontoNaLista[] = checarPeca(texto, { partes })
    // O aviso do julgado fora do acervo, abaixo, diz mais que a marca.
    .filter((p) => !(p.tipo === "a_comprovar" && p.trecho.includes("julgado fora do acervo") && peca?.conferencia?.atual))
    .map((p) => ({ chave: `${p.tipo}-${p.inicio}`, tipo: TIPO_DO_PONTO[p.tipo], mensagem: p.mensagem, inicio: p.inicio, fim: p.fim }));
  const emTexto = (t: string) => {
    const i = texto.indexOf(t);
    return i < 0 ? { inicio: null, fim: null } : { inicio: i, fim: i + t.length };
  };
  const c = peca?.conferencia;
  if (c?.atual) {
    for (const f of c.fatos) if (f.situacao === "com_aviso" && f.motivo) pontos.push({ chave: `fato-${f.afirmacao}`, tipo: "fato", mensagem: f.motivo, ...emTexto(f.afirmacao) });
    for (const a of c.avisos) pontos.push({ chave: `aviso-${a.tipo}-${a.trecho}`, tipo: a.tipo === "julgado" ? "julgado" : "fato", mensagem: a.mensagem, ...emTexto(a.trecho) });
  }
  if (peca) {
    if (!c) pontos.push({ chave: "sem-conferencia", tipo: "conferencia", mensagem: "Os fatos ainda não foram conferidos nos autos.", inicio: null, fim: null });
    else if (!c.atual) pontos.push({ chave: "conferencia-velha", tipo: "conferencia", mensagem: "O texto mudou depois da conferência dos fatos. Confira de novo.", inicio: null, fim: null });
    else if (c.semLigacao === "ia_falhou") pontos.push({ chave: "ia-falhou", tipo: "conferencia", mensagem: "A IA não ligou os fatos aos trechos: só datas, valores e eventos foram conferidos.", inicio: null, fim: null });
    for (const j of peca.julgados) {
      if (!texto.includes(j.citacao)) continue;
      if (j.selo !== "verificada") pontos.push({ chave: `julgado-${j.chave}`, tipo: "julgado", mensagem: `${j.rotulo}: ${j.motivo}`, ...emTexto(j.citacao) });
      if (j.avisoDeForca) pontos.push({ chave: `forca-${j.chave}`, tipo: "julgado", mensagem: j.avisoDeForca, ...emTexto(j.afirmacao) });
    }
  }
  return pontos.sort((a, b) => (a.inicio ?? -1) - (b.inicio ?? -1));
}

function Lista({ pontos, aoIr }: { pontos: readonly PontoNaLista[]; aoIr?: (p: PontoNaLista) => void }) {
  return (
    <ul className="dc-pontos" aria-label="Pontos em aberto">
      {pontos.map((p) => {
        const Icone = ICONES[p.tipo];
        const conteudo = (
          <>
            <Icone aria-hidden />
            <span>{p.mensagem}</span>
          </>
        );
        return (
          <li key={p.chave}>
            {aoIr && p.inicio !== null ? (
              <button type="button" className="dc-pontos__item" onClick={() => aoIr(p)}>
                {conteudo}
              </button>
            ) : (
              <span className="dc-pontos__item dc-pontos__item--fixo">{conteudo}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function AntesDeProtocolar({ pontos, aoIr }: { pontos: readonly PontoNaLista[]; aoIr: (p: PontoNaLista) => void }) {
  return (
    <Painel titulo="Antes de protocolar" acao={<span className="dc-nota">{pontos.length ? (pontos.length === 1 ? "1 ponto" : `${pontos.length} pontos`) : "sem pontos"}</span>} corpo={false}>
      {pontos.length ? <Lista pontos={pontos} aoIr={aoIr} /> : <p className="dc-citacoes__nota dc-pontos__vazio">Sem colchete, campo vazio, frase quebrada ou marca interna no texto. Confira os fatos nos autos antes de protocolar.</p>}
    </Painel>
  );
}

/** O aviso na hora de baixar: mostra o que falta, e o download continua à mão. */
export function AvisoAoBaixar({ aberto, pontos, docx, aoFechar }: { aberto: boolean; pontos: readonly PontoNaLista[]; docx: string | undefined; aoFechar: () => void }) {
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Antes de protocolar"
      descricao={`${pontos.length === 1 ? "Há 1 ponto em aberto" : `Há ${pontos.length} pontos em aberto`} nesta peça. O DOCX sai com o que falta marcado em amarelo.`}
      className="dc-dialogo--versoes"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Voltar ao texto
          </Botao>
          <a className="dc-btn dc-btn--primaria dc-btn--md" href={docx} download onClick={aoFechar}>
            Baixar assim mesmo
          </a>
        </>
      }
    >
      <Lista pontos={pontos} />
    </Dialogo>
  );
}
