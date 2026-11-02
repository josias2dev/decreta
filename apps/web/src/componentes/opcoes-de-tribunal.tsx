/** As opções do seletor de tribunal (/comecar e Configurações): quem tem calendário próprio num grupo, quem usa só o nacional e o recesso em outro. */
import { temCalendarioProprio } from "@decreta/core";

const TRIBUNAIS = [
  { id: "TJSC", nome: "TJSC · Justiça estadual de Santa Catarina" },
  { id: "TRT12", nome: "TRT12 · Justiça do Trabalho em SC" },
  { id: "TRF1", nome: "TRF1 · Justiça Federal da 1ª Região" },
  { id: "TRF2", nome: "TRF2 · Justiça Federal da 2ª Região" },
  { id: "TRF3", nome: "TRF3 · Justiça Federal da 3ª Região" },
  { id: "TRF4", nome: "TRF4 · Justiça Federal da 4ª Região" },
  { id: "TRF5", nome: "TRF5 · Justiça Federal da 5ª Região" },
  { id: "TRF6", nome: "TRF6 · Justiça Federal da 6ª Região" },
  { id: "TJSP", nome: "TJSP · Justiça estadual de São Paulo" },
  { id: "TJRJ", nome: "TJRJ · Justiça estadual do Rio de Janeiro" },
  { id: "TJMG", nome: "TJMG · Justiça estadual de Minas Gerais" },
  { id: "TJPR", nome: "TJPR · Justiça estadual do Paraná" },
  { id: "TJRS", nome: "TJRS · Justiça estadual do Rio Grande do Sul" },
];

export function OpcoesDeTribunal() {
  const grupo = (rotulo: string, proprio: boolean) => (
    <optgroup label={rotulo}>
      {TRIBUNAIS.filter((t) => temCalendarioProprio(t.id) === proprio).map((t) => (
        <option key={t.id} value={t.id}>
          {t.nome}
        </option>
      ))}
    </optgroup>
  );
  return (
    <>
      {grupo("Com calendário próprio", true)}
      {grupo("Sem calendário próprio: só feriados nacionais e recesso", false)}
    </>
  );
}
