/**
 * Escritório novo: a organização, a ficha do escritório e a primeira pessoa
 * (sócia, papel owner). Quem vem depois entra por convite pela tela da Equipe.
 *
 * Usado pelo cadastro aberto (POST /api/cadastro), pelo script
 * `escritorio:criar`, pela demonstração e pelos testes.
 */
import type { Dia, SituacaoDoEscritorio } from "@decreta/core";
import { equipe, escritorios, member, organization, user, withTenant, type Database } from "@decreta/db";
import { eq } from "drizzle-orm";
import type { Auth } from "./auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "./demonstracao/slug.ts";

export interface EscritorioNovo {
  nome: string;
  /** Endereço curto e único ("souza-mendes"). */
  slug: string;
  tribunal?: string;
  timezone?: string;
  /** Pelo cadastro aberto: o escritório nasce em avaliação e a configuração inicial das telas fica pendente (`onboarding_concluido_em` nulo). */
  cadastroAberto?: boolean;
  /** Como o escritório começa na assinatura (ver `comoNasce`). Sem isto nasce cortesia: o que a equipe cria nunca é travado. */
  assinatura?: { situacao: SituacaoDoEscritorio; testeAte: Dia | null };
  /** `termosVersao`: a versão dos Termos de Uso que a pessoa aceitou (só o cadastro aberto pede o aceite). */
  dono: { email: string; nome: string; senha: string; apelido?: string; cargo?: string; oabNumero?: string; oabUf?: string; whatsapp?: string; termosVersao?: string };
}

/** O endereço curto a partir do nome: "Souza & Mendes Advocacia" → "souza-mendes-advocacia". */
export function slugDoNome(nome: string): string {
  const s = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return s || "escritorio";
}

/** O slug do nome, com sufixo numérico quando já existe um escritório com ele ("souza-mendes-2"). */
export async function slugUnico(db: Database, nome: string): Promise<string> {
  const base = slugDoNome(nome);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (slug === SLUG_DA_DEMONSTRACAO) continue;
    const [jaTem] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug));
    if (!jaTem) return slug;
  }
}

/**
 * A equipe vai criar um escritório para quem já tem conta. A senha passa a ser a que a equipe entrega, as sessões abertas
 * caem e o e-mail fica confirmado: se alguém tinha cadastrado o e-mail dessa pessoa, perde a conta aqui. Diz se a conta já existia.
 */
export async function redefinirSeJaTemConta(db: Database, auth: Auth, emailDoDono: string, senha: string): Promise<boolean> {
  const email = emailDoDono.trim().toLowerCase();
  const [pessoa] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!pessoa) return false;
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(senha);
  const contas = await ctx.internalAdapter.findAccounts(pessoa.id);
  if (contas.some((c) => c.providerId === "credential")) await ctx.internalAdapter.updatePassword(pessoa.id, hash);
  else await ctx.internalAdapter.linkAccount({ userId: pessoa.id, providerId: "credential", accountId: pessoa.id, password: hash });
  await ctx.internalAdapter.deleteUserSessions(pessoa.id);
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, pessoa.id));
  return true;
}

export async function criarEscritorio(db: Database, auth: Auth, e: EscritorioNovo): Promise<{ organizationId: string; userId: string }> {
  const email = e.dono.email.trim().toLowerCase();
  if (e.dono.senha.length < 10) throw new Error("a senha precisa de pelo menos 10 caracteres");
  const [jaTem] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, e.slug));
  if (jaTem) throw new Error(`já existe um escritório com o endereço ${e.slug}`);

  const ctx = await auth.$context;
  let [pessoa] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!pessoa) {
    // O cadastro aberto não provou que o e-mail é da pessoa; o que a equipe cria, ela conferiu.
    const criado = await ctx.internalAdapter.createUser({ email, name: e.dono.nome, emailVerified: !e.cadastroAberto, ...(e.dono.termosVersao ? { termosVersao: e.dono.termosVersao, termosAceitosEm: new Date() } : {}) }, { method: "email-password" });
    await ctx.internalAdapter.linkAccount({ userId: criado.id, providerId: "credential", accountId: criado.id, password: await ctx.password.hash(e.dono.senha) });
    pessoa = { id: criado.id };
  }

  const organizationId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      name: e.nome,
      slug: e.slug,
      timezone: e.timezone ?? "America/Sao_Paulo",
      emAvaliacao: !!e.cadastroAberto,
      situacao: e.assinatura?.situacao ?? "cortesia",
      testeAte: e.assinatura?.testeAte ?? null,
    });
    await tx.insert(member).values({ id: crypto.randomUUID(), organizationId, userId: pessoa.id, role: "owner" });
  });
  await withTenant(db, organizationId, async (tx) => {
    await tx.insert(escritorios).values({ organizationId, tribunal: e.tribunal ?? "TJSC", ...(e.cadastroAberto ? { onboardingConcluidoEm: null } : {}) });
    await tx.insert(equipe).values({
      organizationId,
      userId: pessoa.id,
      apelido: e.dono.apelido ?? e.dono.nome.split(" ")[0],
      cargo: e.dono.cargo ?? null,
      oabNumero: e.dono.oabNumero ?? null,
      oabUf: e.dono.oabUf ?? null,
      whatsapp: e.dono.whatsapp ?? null,
    });
  });
  return { organizationId, userId: pessoa.id };
}
