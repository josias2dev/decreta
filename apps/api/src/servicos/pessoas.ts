/** A equipe do escritório como as telas mostram: nome curto, iniciais, cargo. */
import { equipe, member, user, type Database, type Tx } from "@decreta/db";
import { and, eq } from "drizzle-orm";

export interface Pessoa {
  id: string;
  nome: string;
  /** Como aparece nas listas ("Beatriz"). */
  apelido: string;
  iniciais: string;
  /** Foto de perfil (endereço da imagem); sem ela, as telas mostram as iniciais. */
  foto: string | null;
  email: string;
  cargo: string | null;
  papel: string;
  oab: string | null;
  whatsapp: string | null;
  avisoManha: boolean;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => !/^(da|de|do|das|dos|e)$/i.test(p));
  if (!partes.length) return "?";
  const a = partes[0]![0] ?? "";
  const b = partes.length > 1 ? (partes.at(-1)![0] ?? "") : (partes[0]![1] ?? "");
  return (a + b).toLocaleUpperCase("pt-BR");
}

/** Membros (sem RLS, filtrados pelo escritório) com o perfil de `equipe` (com RLS, na transação). */
export async function pessoasDoEscritorio(db: Database | Tx, tx: Tx, organizationId: string): Promise<Map<string, Pessoa>> {
  const membros = await db
    .select({ id: user.id, nome: user.name, email: user.email, foto: user.image, papel: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId));
  const perfis = await tx.select().from(equipe);
  const porId = new Map(perfis.map((p) => [p.userId, p]));
  const mapa = new Map<string, Pessoa>();
  for (const m of membros) {
    const p = porId.get(m.id);
    const apelido = p?.apelido?.trim() || m.nome.split(/\s+/)[0] || m.email;
    mapa.set(m.id, {
      id: m.id,
      nome: m.nome || m.email,
      apelido,
      iniciais: iniciais(m.nome || m.email),
      foto: m.foto ?? null,
      email: m.email,
      cargo: p?.cargo ?? null,
      papel: m.papel,
      oab: p?.oabNumero ? `OAB/${p.oabUf ?? "SC"} ${p.oabNumero}` : null,
      whatsapp: p?.whatsapp ?? null,
      avisoManha: p?.avisoManha ?? true,
    });
  }
  return mapa;
}

export type PessoaResumida = Pick<Pessoa, "id" | "nome" | "apelido" | "iniciais" | "foto">;

export function resumir(pessoas: Map<string, Pessoa>, id: string | null | undefined): PessoaResumida | null {
  if (!id) return null;
  const p = pessoas.get(id);
  return p ? { id: p.id, nome: p.nome, apelido: p.apelido, iniciais: p.iniciais, foto: p.foto } : { id, nome: "Ex-integrante", apelido: "Ex-integrante", iniciais: "?", foto: null };
}

export async function ehMembro(db: Database, organizationId: string, userId: string): Promise<string | null> {
  const [m] = await db.select({ papel: member.role }).from(member).where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  return m?.papel ?? null;
}
