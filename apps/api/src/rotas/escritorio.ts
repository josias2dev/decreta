import { automacaoValida, ehDia, feriadosForenses, feriadosNacionais, formatarTelefone, hojeEm, nivelDaAcao, REGRAS_DE_AUTOMACAO, telefoneWhatsapp } from "@decreta/core";
import { documentos, equipe, escritorios, invitation, suspensoes, type Timbre } from "@decreta/db";
import { chaveDoDocumento, MIME_DOCX, nomeDoArquivo } from "@decreta/documentos";
import { tipoDePeca } from "@decreta/ia";
import { and, asc, eq, gte } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { listarRegistro, registrar } from "../auditoria.ts";
import { enviarWhatsapp, resumoDaManha } from "../servicos/avisos.ts";
import { AVISO_DO_WHATSAPP, WHATSAPP_EM_AVALIACAO } from "../servicos/em-avaliacao.ts";
import { painelDoDia } from "../servicos/hoje.ts";
import { pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { textoDaPolitica, TITULO_DA_POLITICA } from "../servicos/politica-ia.ts";
import { docxNoTimbre, timbreDoEscritorio } from "../servicos/timbre.ts";
import { corpo, ehSocio, falha, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

const timbre = z.object({
  nome: z.string().trim().min(2).max(200),
  registro: z.string().max(120).optional(),
  endereco: z.string().max(300).optional(),
  contato: z.string().max(200).optional(),
  fonte: z.enum(["Arial", "Times New Roman", "Calibri", "Garamond"]).optional(),
  tamanho: z.number().min(10).max(14).optional(),
  cor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  logoDocumentoId: z.string().uuid().optional(),
});

export function rotasDoEscritorio(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const soSocios = (c: C) => {
    if (!ehSocio(c.get("papel"))) falha(403, "so_socios", "Só os sócios mudam isso.");
  };

  app.get("/escritorio", async (c) =>
    tenant(c, deps, async (tx) => {
      const [e] = await tx.select().from(escritorios).where(eq(escritorios.organizationId, c.get("orgId")));
      const hoje = hojeEm(c.get("timezone"));
      const susp = await tx.select().from(suspensoes).where(gte(suspensoes.dia, `${hoje.slice(0, 4)}-01-01`)).orderBy(asc(suspensoes.dia));
      return c.json({
        nome: c.get("orgNome"),
        tribunal: e?.tribunal ?? "TJSC",
        timbre: e?.timbre ?? { nome: c.get("orgNome") },
        avisos: e?.avisos ?? { manha: true, hora: "07:30" },
        capturaDjen: e?.capturaDjen ?? true,
        capturaDatajud: e?.capturaDatajud ?? true,
        demonstracao: c.get("demonstracao"),
        whatsappLigado: !!deps.wameow,
        whatsappOficial: e?.whatsappOficial ?? null,
        jeito: e?.jeito ?? {},
        /** O nível que vale em cada ação, já com o padrão e as travas. */
        automacao: Object.fromEntries(REGRAS_DE_AUTOMACAO.map((r) => [r.id, nivelDaAcao(e?.automacao ?? {}, r.id)])),
        datajudLigado: !!deps.captura.datajudKey,
        iaLigada: !!deps.ia,
        suspensoes: susp.map((s) => ({ id: s.id, dia: s.dia, motivo: s.motivo, tipo: s.tipo, tribunal: s.tribunal, comarca: s.comarca })),
      });
    }),
  );

  app.put("/escritorio", async (c) => {
    soSocios(c);
    const b = await corpo(
      c,
      z.object({
        tribunal: z.string().min(2).max(20).optional(),
        timbre: timbre.optional(),
        avisos: z.object({ manha: z.boolean(), hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).optional(),
        capturaDjen: z.boolean().optional(),
        capturaDatajud: z.boolean().optional(),
        /** O número oficial do rodapé das mensagens ao cliente. Vazio apaga. */
        whatsappOficial: z
          .string()
          .trim()
          .max(30)
          .nullable()
          .optional()
          .refine((v) => !v || telefoneWhatsapp(v) !== null, "Número de telefone inválido."),
        /** Como o escritório faz cada peça; a chave é o tipo do catálogo ou "geral". Manda o mapa inteiro. */
        jeito: z
          .record(z.string(), z.object({ estilo: z.string().max(3000), teses: z.string().max(3000), evitar: z.string().max(3000) }))
          .refine((j) => Object.keys(j).every((k) => k === "geral" || !!tipoDePeca(k)), "Tipo de peça fora do catálogo.")
          .optional(),
        /** O nível de automação por ação. Prazo, mensagem ao cliente e valores não mudam: sempre exigem confirmação. */
        automacao: z.record(z.string(), z.string()).refine(automacaoValida, "Nível de automação que esta ação não aceita.").optional(),
      }),
    );
    if (c.get("demonstracao") && (b.capturaDjen || b.capturaDatajud)) falha(403, "demonstracao", "Na demonstração a busca no DJEN e no DataJud fica desligada: as OABs e os números de processo são inventados e trariam dados de gente de verdade.");
    await tenant(c, deps, async (tx) => {
      const valores = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as Partial<typeof escritorios.$inferInsert>;
      if (b.timbre) valores.timbre = { ...b.timbre, cor: b.timbre.cor ? `#${b.timbre.cor.replace("#", "")}` : undefined } as Timbre;
      if (b.whatsappOficial !== undefined) valores.whatsappOficial = b.whatsappOficial ? formatarTelefone(b.whatsappOficial) : null;
      await tx
        .insert(escritorios)
        .values({ organizationId: c.get("orgId"), ...valores })
        .onConflictDoUpdate({ target: escritorios.organizationId, set: valores });
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "escritorio.alterado", detalhes: { campos: Object.keys(b) }, ip: ip(c) }, deps.log);
    return c.json({ ok: true });
  });

  /** A configuração inicial (/comecar) terminou, ou a pessoa dispensou de vez: o aviso sai do Hoje e o app abre direto no dia. */
  app.post("/escritorio/onboarding", async (c) => {
    soSocios(c);
    await tenant(c, deps, (tx) => tx.update(escritorios).set({ onboardingConcluidoEm: new Date() }).where(eq(escritorios.organizationId, c.get("orgId"))));
    return c.json({ ok: true });
  });

  /** O logo do timbre, para o menu e a prévia da folha. */
  app.get("/escritorio/logo", async (c) => {
    const chave = await tenant(c, deps, async (tx) => {
      const [e] = await tx.select({ timbre: escritorios.timbre }).from(escritorios).where(eq(escritorios.organizationId, c.get("orgId")));
      const logo = e?.timbre?.logoDocumentoId;
      if (!logo) return null;
      const [d] = await tx.select({ chave: documentos.chave }).from(documentos).where(eq(documentos.id, logo));
      return d?.chave ?? null;
    });
    const bytes = chave ? await deps.arquivos.read(chave).catch(() => null) : null;
    if (!bytes) falha(404, "sem_logo", "O escritório ainda não tem logo.");
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, { "content-type": "image/png", "cache-control": "private, max-age=3600" });
  });

  /** O modelo de política interna de uso de IA (Recomendação CFOAB 001/2024, item 3.6), no timbre. O sócio que baixa responde por ela. */
  app.get("/escritorio/politica-ia", async (c) => {
    soSocios(c);
    const { t, responsavel } = await tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      return { t: await timbreDoEscritorio(tx, c.get("orgId"), c.get("orgNome")), responsavel: pessoas.get(c.get("userId")) };
    });
    const texto = textoDaPolitica({ escritorio: t.timbre.nome, responsavel: { nome: responsavel?.nome ?? c.get("userNome"), oab: responsavel?.oab ?? null }, seguranca: `${deps.telas}/seguranca` });
    const docx = await docxNoTimbre(deps.arquivos, t, { titulo: TITULO_DA_POLITICA, texto });
    return new Response(docx, {
      headers: {
        "content-type": MIME_DOCX,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeDoArquivo(TITULO_DA_POLITICA))}`,
        "cache-control": "no-store",
      },
    });
  });

  /** Logo do timbre: PNG, guardado como documento do escritório. */
  app.post("/escritorio/logo", async (c) => {
    soSocios(c);
    const form = await c.req.formData().catch(() => null);
    const arquivo = form?.get("logo");
    if (!(arquivo instanceof File) || arquivo.type !== "image/png") falha(422, "logo_png", "Envie o logo em PNG.");
    if (arquivo.size > 2_000_000) falha(422, "logo_grande", "O logo passa de 2 MB.");
    const docId = crypto.randomUUID();
    const chave = chaveDoDocumento(c.get("orgId"), docId);
    await deps.arquivos.put(chave, new Uint8Array(await arquivo.arrayBuffer()), "image/png");
    await tenant(c, deps, async (tx) => {
      await tx.insert(documentos).values({ id: docId, organizationId: c.get("orgId"), nome: arquivo.name || "logo.png", mime: "image/png", tamanho: arquivo.size, chave, enviadoPor: c.get("userId") });
      const [e] = await tx.select({ timbre: escritorios.timbre }).from(escritorios).where(eq(escritorios.organizationId, c.get("orgId")));
      const t: Timbre = { ...(e?.timbre ?? { nome: c.get("orgNome") }), logoDocumentoId: docId };
      await tx.insert(escritorios).values({ organizationId: c.get("orgId"), timbre: t }).onConflictDoUpdate({ target: escritorios.organizationId, set: { timbre: t } });
    });
    return c.json({ id: docId });
  });

  app.get("/equipe", async (c) =>
    tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const convites = await db
        .select({ id: invitation.id, email: invitation.email, papel: invitation.role, expiraEm: invitation.expiresAt })
        .from(invitation)
        .where(and(eq(invitation.organizationId, c.get("orgId")), eq(invitation.status, "pending")));
      const perfis = await tx.select().from(equipe);
      return c.json({
        pessoas: [...pessoas.values()].map((p) => {
          const perfil = perfis.find((x) => x.userId === p.id);
          return { ...p, oabNumero: perfil?.oabNumero ?? null, oabUf: perfil?.oabUf ?? null };
        }),
        convites: convites.filter((x) => x.expiraEm.getTime() > Date.now()).map((x) => ({ ...x, expiraEm: x.expiraEm.toISOString(), link: `${deps.telas}/convite/${x.id}` })),
        emailLigado: deps.mailer.enabled,
      });
    }),
  );

  /** Perfil de uma pessoa: ela mesma muda o próprio; os sócios mudam o de todos. */
  app.put("/equipe/:userId", async (c) => {
    const userId = c.req.param("userId");
    if (userId !== c.get("userId")) soSocios(c);
    const b = await corpo(
      c,
      z.object({
        apelido: z.string().trim().max(60).nullable().optional(),
        cargo: z.string().trim().max(80).nullable().optional(),
        oabNumero: z.string().regex(/^\d{1,7}$/).nullable().optional().or(z.literal("").transform(() => null)),
        oabUf: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
        whatsapp: z.string().max(30).nullable().optional(),
        avisoManha: z.boolean().optional(),
      }),
    );
    if (b.whatsapp && !telefoneWhatsapp(b.whatsapp)) falha(422, "whatsapp_invalido", "Confira o número: DDD e número, como (47) 99123-4567.");
    // A OAB abre a aprovação de mensagem ao cliente e guia a captura do Diário: só o sócio a grava, e com a UF.
    if (b.oabNumero !== undefined || b.oabUf !== undefined) soSocios(c);
    if (b.oabNumero && !b.oabUf) falha(422, "sem_uf", "Informe a UF da OAB junto com o número.");
    await tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      if (!pessoas.has(userId)) falha(404, "nao_encontrado");
      const valores = Object.fromEntries(Object.entries({ ...b, whatsapp: b.whatsapp ? telefoneWhatsapp(b.whatsapp) : b.whatsapp }).filter(([, v]) => v !== undefined));
      await tx
        .insert(equipe)
        .values({ organizationId: c.get("orgId"), userId, ...valores })
        .onConflictDoUpdate({ target: [equipe.organizationId, equipe.userId], set: valores });
    });
    return c.json({ ok: true });
  });

  /** Feriados e suspensões do ano, para a tela de Configurações conferir o calendário. */
  app.get("/feriados", async (c) => {
    const ano = Number(c.req.query("ano")) || Number(hojeEm(c.get("timezone")).slice(0, 4));
    return tenant(c, deps, async (tx) => {
      const [e] = await tx.select({ tribunal: escritorios.tribunal }).from(escritorios).where(eq(escritorios.organizationId, c.get("orgId")));
      const tribunal = e?.tribunal ?? "TJSC";
      const proprios = await tx.select().from(suspensoes).where(and(gte(suspensoes.dia, `${ano}-01-01`)));
      return c.json({
        ano,
        tribunal,
        dias: [
          ...feriadosNacionais(ano).map((f) => ({ ...f, origem: "lei" })),
          ...feriadosForenses(ano, tribunal).map((f) => ({ ...f, origem: tribunal })),
          ...proprios.filter((s) => s.dia <= `${ano}-12-31`).map((s) => ({ dia: s.dia, nome: s.motivo, tipo: s.tipo, origem: [s.tribunal, s.comarca].filter(Boolean).join(" · ") || "escritório", id: s.id })),
        ].sort((a, b) => a.dia.localeCompare(b.dia)),
        suspensaoDeFimDeAno: { de: `${ano}-12-20`, ate: `${ano + 1}-01-20` },
      });
    });
  });

  app.post("/suspensoes", async (c) => {
    const b = await corpo(
      c,
      z.object({
        dia: z.string().refine(ehDia),
        ate: z.string().refine(ehDia).optional(),
        motivo: z.string().trim().min(2).max(200),
        tipo: z.enum(["local", "forense", "recesso", "reduzido"]).default("local"),
        tribunal: z.string().max(20).nullable().optional(),
        comarca: z.string().max(120).nullable().optional(),
      }),
    );
    const dias: string[] = [];
    for (let d = new Date(`${b.dia}T00:00:00Z`); d.toISOString().slice(0, 10) <= (b.ate ?? b.dia) && dias.length < 60; d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
    await tenant(c, deps, (tx) => tx.insert(suspensoes).values(dias.map((dia) => ({ organizationId: c.get("orgId"), dia, motivo: b.motivo, tipo: b.tipo, tribunal: b.tribunal ?? null, comarca: b.comarca ?? null }))));
    return c.json({ dias: dias.length }, 201);
  });

  app.delete("/suspensoes/:id", async (c) => {
    const susId = c.req.param("id");
    await tenant(c, deps, (tx) => tx.delete(suspensoes).where(eq(suspensoes.id, susId)));
    return c.json({ ok: true });
  });

  /** Manda agora o resumo da manhã para o próprio WhatsApp, para conferir. */
  app.post("/avisos/teste", async (c) => {
    if (c.get("demonstracao")) falha(403, "demonstracao", "Na demonstração nada sai no WhatsApp.");
    if (!deps.wameow) falha(503, "whatsapp_desligado", "O WhatsApp do Decreta ainda não foi ligado neste servidor.");
    const hoje = hojeEm(c.get("timezone"));
    const { painel, eu } = await tenant(c, deps, async (tx) => ({
      painel: await painelDoDia(db, tx, c.get("orgId"), hoje, c.get("timezone")),
      eu: (await pessoasDoEscritorio(db, tx, c.get("orgId"))).get(c.get("userId")),
    }));
    if (!eu?.whatsapp) falha(422, "sem_whatsapp", "Cadastre o seu WhatsApp no seu perfil primeiro.");
    if (c.get("emAvaliacao") && !WHATSAPP_EM_AVALIACAO.permitir(c.get("orgId"))) falha(429, "teto_em_avaliacao", AVISO_DO_WHATSAPP);
    const texto = resumoDaManha(painel, eu, deps.telas) ?? `Bom dia, ${eu.apelido}. Nada vence hoje no Decreta.`;
    await enviarWhatsapp(deps.wameow, eu.whatsapp, texto);
    return c.json({ ok: true, texto });
  });

  app.get("/registro", async (c) => {
    soSocios(c);
    return c.json({ itens: await listarRegistro(db, c.get("orgId")) });
  });
}
