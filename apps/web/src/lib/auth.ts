import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_URL } from "./api";

export const authClient = createAuthClient({
  baseURL: API_URL || window.location.origin,
  // O login com 2FA devolve `twoFactorRedirect`; a tela Entrar pede o código no lugar.
  plugins: [organizationClient(), twoFactorClient()],
});

/** Papéis do Better Auth com o nome que a equipe vê. */
export const PAPEIS = { owner: "Sócio", admin: "Administração", member: "Equipe" } as const;
export type Papel = keyof typeof PAPEIS;
export const papelLabel = (role: string | null | undefined) => PAPEIS[role as Papel] ?? role ?? "—";
export const ehSocio = (role: string | null | undefined) => role === "owner" || role === "admin";

const MENSAGENS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_PASSWORD: "A senha atual não confere.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Entre com ela.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Entre com ela.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 10 caracteres.",
  INVALID_EMAIL: "Confira o e-mail.",
  INVALID_TOKEN: "Este link não vale mais. Peça um novo.",
  SEM_CONVITE: "Conta nova só com convite do escritório. Peça para um sócio te convidar.",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "Esta pessoa já está na equipe.",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "Já existe um convite para este e-mail.",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: "Só sócios convidam pessoas.",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE: "Seu papel não pode convidar alguém como sócio.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: "O escritório precisa de pelo menos um sócio.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: "O escritório precisa de pelo menos um sócio.",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "Seu papel não pode mudar esta pessoa.",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "Seu papel não pode remover esta pessoa.",
  INVITATION_NOT_FOUND: "Convite não encontrado.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "Este convite é para outro e-mail. Entre com o e-mail convidado.",
  INVALID_CODE: "Código errado. Confira no app autenticador e tente de novo.",
  INVALID_BACKUP_CODE: "Código de recuperação errado ou já usado.",
  ACCOUNT_TEMPORARILY_LOCKED: "Muitos códigos errados. Espere alguns minutos e tente de novo.",
  INVALID_TWO_FACTOR_COOKIE: "O tempo para digitar o código acabou. Entre de novo com e-mail e senha.",
  TOTP_ALREADY_ENABLED: "A verificação em duas etapas já está ligada.",
};

export class AuthError extends Error {
  constructor(readonly code: string) {
    super(MENSAGENS[code] ?? "Não deu certo agora. Tente de novo em instantes.");
  }
}

/** Resposta `{ data, error }` do cliente do Better Auth vira valor ou exceção com mensagem em português. */
export async function authCall<T>(p: Promise<{ data: T | null; error: { code?: string; message?: string } | null }>): Promise<T> {
  const r = await p;
  if (r.error) throw new AuthError(r.error.code ?? r.error.message ?? "erro");
  return r.data as T;
}
