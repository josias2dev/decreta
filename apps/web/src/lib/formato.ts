/** Datas e números como o escritório lê: 23/11/2026, 23 nov, R$ 86.400,00. */
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const partes = (dia: string) => dia.slice(0, 10).split("-").map(Number) as [number, number, number];

export const diaCompleto = (dia: string) => {
  const [a, m, d] = partes(dia);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
};
export const diaCurto = (dia: string) => diaCompleto(dia).slice(0, 5);
export const diaMes = (dia: string) => {
  const [, m, d] = partes(dia);
  return `${String(d).padStart(2, "0")} ${MESES[m - 1]}`;
};
export const diaDaSemana = (dia: string) => {
  const [a, m, d] = partes(dia);
  return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]!;
};

const TZ = "America/Sao_Paulo";
/** Data local (AAAA-MM-DD) de um instante. */
export const diaDoInstante = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const hora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
/** "09:12" se foi hoje, "28/10 09:12" se não. */
export const quando = (iso: string, hoje?: string) => {
  const d = diaDoInstante(iso);
  return d === hoje ? hora(iso) : `${diaCurto(d)} ${hora(iso)}`;
};

export const dinheiro = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
export const numero = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export const prazoEmDias = (dias: number, contagem: "uteis" | "corridos") => `${dias} ${dias === 1 ? "dia" : "dias"} ${contagem === "uteis" ? (dias === 1 ? "útil" : "úteis") : dias === 1 ? "corrido" : "corridos"}`;

export const tamanho = (bytes: number) => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1).replace(".", ",")} MB`);

export const telefone = (digitos: string | null | undefined) => {
  if (!digitos) return "";
  const d = digitos.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
};

/** "a, b e c" */
export const juntar = (itens: string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);

/** "2ª Vara Cível de Joinville" (sem repetir a comarca quando o órgão já diz). */
export const ondeTramita = (p: { orgao?: string | null; comarca?: string | null }) =>
  p.orgao && p.comarca && !p.orgao.toLocaleLowerCase("pt-BR").includes(p.comarca.toLocaleLowerCase("pt-BR")) ? `${p.orgao} de ${p.comarca}` : (p.orgao ?? p.comarca ?? null);

export const POLO_DO_CLIENTE = { ativo: "cliente no polo ativo", passivo: "cliente no polo passivo", terceiro: "cliente como terceiro" } as const;

/** "1.234,56" → "1234.56" (como a API guarda valores em reais); null se não for número. */
export const paraValor = (texto: string): string | null => {
  const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(limpo) ? limpo : null;
};
/** "1234.5" → "1.234,50" para o campo. */
export const valorNoCampo = (v: string | null | undefined) => (v == null || v === "" ? "" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v)));

/** Como o juízo decidiu, pelo pedido do autor (a mesma lista da API). */
export const RESULTADO_DA_DECISAO = {
  procedente: "Procedente",
  parcialmente_procedente: "Parcialmente procedente",
  improcedente: "Improcedente",
  sem_merito: "Extinto sem mérito",
  acordo_homologado: "Acordo homologado",
  outro: "Outro resultado",
} as const;
export const TIPO_DA_DECISAO = { sentenca: "Sentença", acordao: "Acórdão" } as const;
