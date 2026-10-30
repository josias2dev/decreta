import * as schema from "@decreta/db";
import type { Database } from "@decreta/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { organization, twoFactor } from "better-auth/plugins";
import { registrar } from "./auditoria.ts";
import { ehContaDaDemonstracao } from "./demonstracao/slug.ts";
import { PAPEL, type Mailer } from "./email.ts";
import type { Env } from "./env.ts";

/** O que a conta da demonstração não muda, para ninguém trancar os outros do lado de fora. */
const FIXOS_NA_DEMONSTRACAO = new Set(["/change-password", "/change-email", "/two-factor/enable", "/delete-user"]);

/** Convite vale uma semana; depois, quem é sócio reenvia pela tela da Equipe. */
export const DIAS_DO_CONVITE = 7;

type Log = (msg: string, extra?: Record<string, unknown>) => void;

/** Ações do Better Auth que vão para o registro do escritório. */
const REGISTRADAS: Record<string, string> = {
  "/sign-in/email": "login",
  "/change-password": "senha.trocada",
  "/two-factor/enable": "2fa.ligada",
  "/two-factor/disable": "2fa.desligada",
  "/organization/invite-member": "convite.enviado",
  "/organization/accept-invitation": "convite.aceito",
  "/organization/remove-member": "membro.removido",
  "/organization/update-member-role": "membro.papel",
};

/**
 * Login da equipe. O escritório ativo da sessão é o tenant que as telas
 * enxergam; as rotas abrem `withTenant` com ele.
 *
 * Escritório novo nasce pelo script `escritorio:criar`, nunca pelo `create` do
 * plugin. Quem entra depois chega por convite (e-mail com o link /convite/:id).
 * Conta nova só abre para um e-mail com convite pendente: o Decreta não tem
 * cadastro aberto.
 */
export function createAuth(db: Database, env: Env, opts: { mailer?: Mailer; onEmailError?: (err: unknown) => void; log?: Log } = {}) {
  const telas = env.WEB_ORIGIN.replace(/\/$/, "");
  const enviar = async (email: Parameters<Mailer["send"]>[0]) => {
    try {
      await opts.mailer?.send(email);
    } catch (err) {
      opts.onEmailError?.(err);
    }
  };
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_ORIGIN],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (FIXOS_NA_DEMONSTRACAO.has(ctx.path)) {
          const s = await getSessionFromCtx(ctx);
          if (s && ehContaDaDemonstracao(s.user.email)) {
            throw new APIError("FORBIDDEN", { code: "DEMONSTRACAO", message: "Na demonstração a senha, o e-mail e a verificação em duas etapas não mudam: todo mundo entra com a mesma conta." });
          }
          return;
        }
        if (ctx.path !== "/sign-up/email") return;
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase();
        if (!email || !(await temConvite(db, email))) {
          throw new APIError("FORBIDDEN", { code: "SEM_CONVITE", message: "Conta nova só por convite do escritório." });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const acao = REGISTRADAS[ctx.path];
        const devolvido = ctx.context.returned;
        if (!acao || !devolvido || isAPIError(devolvido) || devolvido instanceof Error) return;
        const sessao = (ctx.context.newSession ?? ctx.context.session) as { user: { id: string; name: string; email: string }; session: { activeOrganizationId?: string | null } } | null;
        const corpo = (ctx.body ?? {}) as Record<string, unknown>;
        const org = (corpo.organizationId as string | undefined) ?? sessao?.session.activeOrganizationId ?? null;
        if (!org) return;
        const headers = ctx.request?.headers ?? ctx.headers;
        await registrar(
          db,
          {
            organizationId: org,
            userId: sessao?.user.id ?? null,
            nome: sessao ? sessao.user.name || sessao.user.email : null,
            acao,
            detalhes: acao === "convite.enviado" ? { email: corpo.email, papel: corpo.role } : {},
            ip: headers?.get("cf-connecting-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          },
          opts.log,
        );
      }),
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    databaseHooks: {
      session: {
        create: {
          // Quem entra já cai no próprio escritório: a sessão nasce com ele ativo.
          before: async (sessao) => {
            if ((sessao as { activeOrganizationId?: string | null }).activeOrganizationId) return;
            const [m] = await db
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .where(eq(schema.member.userId, sessao.userId))
              .orderBy(asc(schema.member.createdAt))
              .limit(1);
            return m ? { data: { ...sessao, activeOrganizationId: m.organizationId } } : undefined;
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, token }) =>
        enviar({
          to: user.email,
          subject: "Redefinir sua senha no Decreta",
          paragraphs: [`Olá, ${user.name || user.email}.`, "Recebemos um pedido para redefinir a sua senha. O link vale por 1 hora."],
          action: { label: "Criar nova senha", url: `${telas}/redefinir-senha?token=${encodeURIComponent(token)}` },
        }),
    },
    session: {
      // A equipe usa no celular o dia todo: a sessão dura 30 dias e renova sozinha a cada dia de uso.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      twoFactor({ issuer: "Decreta" }),
      organization({
        allowUserToCreateOrganization: false,
        invitationExpiresIn: DIAS_DO_CONVITE * 24 * 60 * 60,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: async ({ id, email, role, organization: org, inviter }) =>
          enviar({
            to: email,
            subject: `Convite para a equipe de ${org.name} no Decreta`,
            paragraphs: [
              `${inviter.user.name || inviter.user.email} convidou você para a equipe de ${org.name} no Decreta, como ${PAPEL[role] ?? role}.`,
              `No Decreta o escritório acompanha prazos, publicações e processos. O convite vale por ${DIAS_DO_CONVITE} dias.`,
            ],
            action: { label: "Aceitar convite", url: `${telas}/convite/${id}` },
          }),
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

async function temConvite(db: Database, email: string): Promise<boolean> {
  const [c] = await db
    .select({ id: schema.invitation.id })
    .from(schema.invitation)
    .where(and(sql`lower(${schema.invitation.email}) = ${email}`, eq(schema.invitation.status, "pending"), gt(schema.invitation.expiresAt, new Date())))
    .limit(1);
  return !!c;
}
