/**
 * O que identifica a demonstração. As OABs e os números de processo dela são
 * inventados e podem coincidir com os de gente de verdade, então nada do
 * escritório vai ao DJEN nem ao DataJud.
 */
export const SLUG_DA_DEMONSTRACAO = "demonstracao";

/** O login que vai para quem quer conhecer o Decreta: a sócia da demonstração. */
export const LOGIN_DA_DEMONSTRACAO = "teste@decreta.site";
/** O resto da equipe da demonstração (rafael@, tiago@, camila@). */
export const DOMINIO_DA_DEMONSTRACAO = "demo.decreta.app";

/**
 * Conta da demonstração: várias pessoas entram com a mesma senha, então ela não
 * troca a senha, o e-mail nem liga a verificação em duas etapas.
 */
export function ehContaDaDemonstracao(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e === LOGIN_DA_DEMONSTRACAO || e.endsWith(`@${DOMINIO_DA_DEMONSTRACAO}`);
}
