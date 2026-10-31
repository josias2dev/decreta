/**
 * Conferência da pasta antes de protocolar: a IA lê os documentos e diz, item
 * por item, o que está certo, o que pede atenção e o que falta.
 */
import { Check, CircleAlert, CircleDashed } from "lucide-react";
import type { Analise, Conferencia, ItemDaConferencia } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { BlocoIa, ListaIa, SecaoIa } from "./ui";

export const ITEM_DA_CONFERENCIA: Record<ItemDaConferencia, string> = {
  procuracao: "Procuração",
  comprovante_residencia: "Comprovante de residência",
  documento_identidade: "Documento com foto",
  cpf: "CPF",
  hipossuficiencia: "Declaração de hipossuficiência",
  contrato_honorarios: "Contrato de honorários",
  litispendencia: "Litispendência",
  termo_ia: "Termo de uso de IA",
};
const SITUACAO = { certo: "Certo", atencao: "Atenção", falta: "Falta" } as const;
const ICONE = { certo: Check, atencao: CircleAlert, falta: CircleDashed } as const;

export function ConferenciaDaPasta({
  analise,
  aoConferir,
  conferindo,
  semDocumentos,
}: {
  analise: Analise<Conferencia> | null;
  /** Sem a IA ligada, não há botão. */
  aoConferir?: () => void;
  conferindo: boolean;
  semDocumentos: boolean;
}) {
  const c = analise?.situacao === "pronto" ? analise.conteudo : null;
  return (
    <BlocoIa
      titulo="Conferência da pasta"
      analise={analise}
      aoRefazer={semDocumentos && !analise ? undefined : aoConferir}
      refazendo={conferindo}
      rotuloGerar="Conferir"
      avisoDesatualizada="A pasta mudou desde esta conferência."
      rodape="Gerado por IA. Confira os documentos antes de protocolar."
    >
      {c ? (
        <>
          <p className="m-0 text-[14px] leading-[21px]">{c.resumo}</p>
          <div className="dc-conferencia">
            {c.itens.map((i) => {
              const Icone = ICONE[i.situacao];
              return (
                <div key={i.item} className={cn("dc-conferencia__item", `is-${i.situacao}`)}>
                  <Icone aria-hidden />
                  <span className="dc-conferencia__texto">
                    <strong>{ITEM_DA_CONFERENCIA[i.item] ?? i.item}</strong>
                    <span>{i.detalhe}</span>
                    {i.documento && <span className="dc-conferencia__arquivo">{i.documento}</span>}
                  </span>
                  <span className="dc-conferencia__situacao">{SITUACAO[i.situacao]}</span>
                </div>
              );
            })}
          </div>
          {c.outros.length > 0 && (
            <SecaoIa titulo="Também vi">
              <ListaIa itens={c.outros} />
            </SecaoIa>
          )}
        </>
      ) : !analise ? (
        <p className="m-0 text-[14px] leading-[21px]">
          {semDocumentos
            ? "Envie os documentos da pasta (PDF, DOCX ou foto). A IA confere procuração, comprovante de residência, documento com foto, CPF, hipossuficiência, honorários e se já há processo igual."
            : "A IA confere procuração, comprovante de residência, documento com foto, CPF, hipossuficiência, contrato de honorários e se já há processo igual."}
        </p>
      ) : null}
    </BlocoIa>
  );
}
