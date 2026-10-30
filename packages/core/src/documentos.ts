/** CPF, CNPJ e telefone: o que a ficha do cliente guarda e como mostra. */

const so = (v: string) => v.replace(/\D/g, "");

function dvCpf(base: string): string {
  let d = "";
  for (const peso of [10, 11]) {
    const nums = (base + d).split("").map(Number);
    const soma = nums.reduce((s, n, i) => s + n * (peso - i), 0);
    const r = (soma * 10) % 11;
    d += String(r === 10 ? 0 : r);
  }
  return d;
}

export function cpfValido(valor: string): boolean {
  const d = so(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  return dvCpf(d.slice(0, 9)) === d.slice(9);
}

function dvCnpj(base: string): string {
  let d = "";
  for (const pesos of [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ]) {
    const nums = (base + d).split("").map(Number);
    const soma = nums.reduce((s, n, i) => s + n * pesos[i]!, 0);
    const r = soma % 11;
    d += String(r < 2 ? 0 : 11 - r);
  }
  return d;
}

export function cnpjValido(valor: string): boolean {
  const d = so(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  return dvCnpj(d.slice(0, 12)) === d.slice(12);
}

export function formatarDocumento(valor: string): string {
  const d = so(valor);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return valor.trim();
}

/** Telefone brasileiro para o WhatsApp: 55 + DDD + número. `null` se não parece um celular ou fixo. */
export function telefoneWhatsapp(valor: string): string | null {
  let d = so(valor);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  return `55${d}`;
}

/** (47) 99123-4567 */
export function formatarTelefone(valor: string): string {
  let d = so(valor);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor.trim();
}

const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o", "à", "ao", "x"]);
const SIGLAS = new Set(["S.A.", "S/A", "SA", "ME", "EPP", "EIRELI", "LTDA", "CPF", "CNPJ", "INSS", "MP", "OAB", "TJSC", "TRT", "JEC", "SC", "PR", "RS", "SP"]);

/** "MARINA DUARTE" → "Marina Duarte"; "2ª VARA CÍVEL DA COMARCA DE JOINVILLE" → "2ª Vara Cível da Comarca de Joinville". Texto que já tem minúsculas fica como está. */
export function nomeProprio(valor: string): string {
  const s = valor.trim().replace(/\s+/g, " ");
  if (s !== s.toLocaleUpperCase("pt-BR")) return s;
  return s
    .split(" ")
    .map((palavra, i) => {
      if (SIGLAS.has(palavra) || SIGLAS.has(palavra.replace(/[,;]$/, "")) || SIGLAS.has(palavra.replace(/[.,;]$/, ""))) {
        return palavra.startsWith("LTDA") ? palavra.replace("LTDA", "Ltda") : palavra;
      }
      const baixa = palavra.toLocaleLowerCase("pt-BR");
      if (i > 0 && MINUSCULAS.has(baixa)) return baixa;
      return baixa.charAt(0).toLocaleUpperCase("pt-BR") + baixa.slice(1);
    })
    .join(" ");
}

/** "Conciliação" → "Audiência de conciliação"; "Inicial" e "Una" → "Audiência inicial", "Audiência una" (sem o "de"). */
export function nomeDaAudiencia(tipo: string): string {
  const t = tipo.trim().replace(/^audiência\s+(de\s+)?/i, "").toLocaleLowerCase("pt-BR");
  return /^(una|inicial)\b/.test(t) ? `Audiência ${t}` : `Audiência de ${t}`;
}
