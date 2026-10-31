/**
 * Documento com texto escondido ou frase dirigida a uma IA (a varredura do
 * envio): um selo nas listas e a faixa no arquivo aberto, com o trecho.
 */
import { CircleAlert } from "lucide-react";
import { Faixa } from "@/componentes/ui";
import type { AlertaDoDocumento } from "@/lib/tipos";

const TIPO: Record<AlertaDoDocumento["tipo"], string> = {
  texto_oculto: "Texto marcado como oculto",
  fonte_branca: "Texto em fonte branca",
  fonte_minuscula: "Texto em fonte minúscula",
  texto_invisivel: "Texto invisível no PDF",
  codigo_de_campo: "Instrução no código de um campo do Word",
  metadados: "Instrução nas propriedades do arquivo",
  comando_para_ia: "Frase dirigida a uma IA",
};

const soFrases = (alertas: AlertaDoDocumento[]) => alertas.every((a) => a.tipo === "comando_para_ia");

export function SeloDoAlerta({ alertas }: { alertas: AlertaDoDocumento[] }) {
  return (
    <span className="dc-selo dc-selo--vencido" title={alertas.map((a) => `${TIPO[a.tipo]}: ${a.trecho}`).join("\n")}>
      {soFrases(alertas) ? "Comando para IA" : "Texto escondido"}
    </span>
  );
}

export function FaixaDoAlerta({ alertas }: { alertas: AlertaDoDocumento[] | undefined }) {
  if (!alertas?.length) return null;
  return (
    <Faixa tipo="erro">
      <CircleAlert />
      <span className="dc-alerta-doc">
        Este documento tem {soFrases(alertas) ? "frases dirigidas a uma IA" : "texto que não aparece na página, mas a IA lê"}. A IA do Decreta lê o arquivo como dado e não segue o que ele pede; confira antes de usar.
        <ul>
          {alertas.map((a) => (
            <li key={`${a.tipo}:${a.trecho}`}>
              {TIPO[a.tipo]}: “{a.trecho}”
            </li>
          ))}
        </ul>
      </span>
    </Faixa>
  );
}
