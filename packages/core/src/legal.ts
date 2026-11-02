/**
 * Termos de Uso e Política de Privacidade: a versão que a pessoa aceita e os
 * dados de quem responde pelo Decreta.
 *
 * `EMPRESA` é o único lugar onde a razão social, o CNPJ, o endereço e o
 * encarregado de dados entram. Enquanto estiverem nulos, as páginas
 * /termos e /privacidade simplesmente não trazem as frases sobre eles.
 */

/**
 * O dia do texto que a pessoa aceita ao criar a conta. Mudou o texto de
 * /termos ou de /privacidade, mude aqui: o aceite fica gravado com esta versão.
 */
export const VERSAO_DOS_TERMOS = "2026-11-02";

export interface DadosDaEmpresa {
  razaoSocial: string | null;
  cnpj: string | null;
  endereco: string | null;
  /** O encarregado pelo tratamento de dados pessoais (art. 41 da LGPD). */
  encarregado: { nome: string; email: string } | null;
  /** O contato que já existe no site: o WhatsApp da equipe. `whatsapp` é só dígitos, com o 55. */
  contato: { whatsapp: string; exibicao: string };
}

/** Preencha aqui quando houver: aparece nos Termos de Uso e na Política de Privacidade. */
export const EMPRESA: DadosDaEmpresa = {
  razaoSocial: null,
  cnpj: null,
  endereco: null,
  encarregado: null,
  contato: { whatsapp: "5546999074372", exibicao: "(46) 99907-4372" },
};

/** "O Decreta é oferecido por X, CNPJ Y, com sede em Z." Sem razão social não há frase. */
export function quemOferece(e: DadosDaEmpresa): string | null {
  if (!e.razaoSocial) return null;
  // "Ltda." já traz o ponto: a frase termina com um só.
  return `O Decreta é oferecido por ${e.razaoSocial}${e.cnpj ? `, CNPJ ${e.cnpj}` : ""}${e.endereco ? `, com sede em ${e.endereco}` : ""}`.replace(/\.?$/, ".");
}

export function quemEncarrega(e: DadosDaEmpresa): string | null {
  return e.encarregado ? `O encarregado pelo tratamento de dados pessoais é ${e.encarregado.nome}, em ${e.encarregado.email}.` : null;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-11-02" → "2 de novembro de 2026". */
export function versaoPorExtenso(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${Number(d) === 1 ? "1º" : Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}
