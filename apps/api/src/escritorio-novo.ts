/**
 * Escritório novo: a organização, a ficha do escritório e a primeira pessoa
 * (sócia, papel owner). Quem vem depois entra por convite pela tela da Equipe.
 *
 * Usado pelo script `escritorio:criar`, pela demonstração e pelos testes.
 */
import { equipe, escritorios, member, organization, user, withTenant, type Database } from "@decreta/db";
import { eq } from "drizzle-orm";
import type { Auth } from "./auth.ts";

export interface EscritorioNovo {
  nome: string;
  /** Endereço curto e único ("souza-mendes"). */
  slug: string;
  tribunal?: string;
  timezone?: string;
  dono: { email: string; nome: string; senha: string; apelido?: string; cargo?: string; oabNumero?: string; oabUf?: string; whatsapp?: string };
}

export async function criarEscritorio(db: Database, auth: Auth, e: EscritorioNovo): Promise<{ organizationId: string; userId: string }> {
  const email = e.dono.email.trim().toLowerCase();
  if (e.dono.senha.length < 10) throw new Error("a senha precisa de pelo menos 10 caracteres");
  const [jaTem] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, e.slug));
  if (jaTem) throw new Error(`já existe um escritório com o endereço ${e.slug}`);

  const ctx = await auth.$context;
  let [pessoa] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!pessoa) {
    const criado = await ctx.internalAdapter.createUser({ email, name: e.dono.nome, emailVerified: true }, { method: "email-password" });
    await ctx.internalAdapter.linkAccount({ userId: criado.id, providerId: "credential", accountId: criado.id, password: await ctx.password.hash(e.dono.senha) });
    pessoa = { id: criado.id };
  }

  const organizationId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({ id: organizationId, name: e.nome, slug: e.slug, timezone: e.timezone ?? "America/Sao_Paulo" });
    await tx.insert(member).values({ id: crypto.randomUUID(), organizationId, userId: pessoa.id, role: "owner" });
  });
  await withTenant(db, organizationId, async (tx) => {
    await tx.insert(escritorios).values({ organizationId, tribunal: e.tribunal ?? "TJSC" });
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
