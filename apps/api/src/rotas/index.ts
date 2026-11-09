/**
 * API das telas (`/api/app/*`). Toda rota exige sessão do Better Auth com um
 * escritório ativo do qual a pessoa é membro; esse escritório é o tenant de
 * tudo que a rota lê ou grava.
 */
import { avisoDaAssinatura, avisoForaDoPlano, FUNCIONALIDADES_DO_PLANO, funcionalidadeDaRota, funcionalidadeLiberada, hojeEm, somarDias, type FuncionalidadesDoPlano } from "@decreta/core";
import { alvaras, clientes, equipe, escritorios, negocios, organization, planos, prazos, processos, publicacoes, type Tx } from "@decreta/db";
import { and, asc, eq, ilike, inArray, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { registrarAcesso } from "../acessos.ts";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { acessoLiberado, colunasDaAssinatura, estadoDoEscritorio, recusaDeAcesso } from "../servicos/assinatura.ts";
import { AVISO_DO_ENCERRAMENTO } from "../servicos/encerramento.ts";
import { contarParcelasEmAtraso } from "../servicos/honorarios.ts";
import { ehOperador } from "../servicos/plataforma.ts";
import { ehMembro, pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { painelDoDia } from "../servicos/hoje.ts";
import { ehSocio, semAcentoNoBanco, tenant, termoSemAcento, type Ambiente, type DepsDasRotas } from "./base.ts";
import { rotasDaAgenda } from "./agenda.ts";
import { rotasDosCalculos } from "./calculos.ts";
import { rotasDosCamposComIa } from "./campos-com-ia.ts";
import { rotasDasAssinaturas } from "./assinaturas.ts";
import { rotasDosClientes } from "./clientes.ts";
import { rotasDaCobranca } from "./cobranca.ts";
import { rotasDasConsultas } from "./consultas.ts";
import { rotasDoFinanceiro } from "./financeiro.ts";
import { rotasDaPrestacao } from "./prestacao.ts";
import { rotasDosDocumentos } from "./documentos.ts";
import { rotasDoEscritorio } from "./escritorio.ts";
import { rotasDosDadosDoEscritorio } from "./dados-do-escritorio.ts";
import { rotasDaIa } from "./ia.ts";
import { rotasDosTokensMcp } from "./mcp.ts";
import { rotasDasMensagensAoCliente } from "./mensagens-cliente.ts";
import { rotasDosModelos } from "./modelos.ts";
import { rotasDosNegocios } from "./negocios.ts";
import { rotasDasPecas } from "./pecas.ts";
import { rotasDosPrazos } from "./prazos.ts";
import { rotasDosProcessos } from "./processos.ts";
import { rotasDasPublicacoes } from "./publicacoes.ts";
import { rotasDoPlano } from "./plano.ts";
import { rotasDoRadar } from "./radar.ts";
import { rotasDoWhatsappNoApp } from "../whatsapp/rotas.ts";
import { renovarPeloUso } from "../whatsapp/vinculo.ts";

export function createRotas(deps: DepsDasRotas) {
  const { db, auth } = deps;
  const cobrancaAtiva = !!deps.cobranca?.ativa;
  const app = new Hono<Ambiente>();

  app.use("*", async (c, next) => {
    const sessao = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!sessao) return c.json({ erro: "nao_autenticado" }, 401);
    const orgId = sessao.session.activeOrganizationId;
    if (!orgId) return c.json({ erro: "sem_escritorio" }, 403);
    // O escritório ativo fica gravado na sessão; confere que o vínculo ainda existe.
    const papel = await ehMembro(db, orgId, sessao.user.id);
    if (!papel) return c.json({ erro: "sem_escritorio" }, 403);
    const [org] = await db
      .select({ nome: organization.name, slug: organization.slug, emAvaliacao: organization.emAvaliacao, encerradoEm: organization.encerradoEm, funcionalidades: planos.funcionalidades, ...colunasDaAssinatura })
      .from(organization)
      .leftJoin(planos, eq(planos.id, organization.planoId))
      .where(eq(organization.id, orgId));
    // Escritório encerrado: ninguém mais usa, mesmo com a sessão ainda de pé.
    if (org?.encerradoEm) return c.json({ erro: "escritorio_encerrado", detalhe: AVISO_DO_ENCERRAMENTO }, 403);
    // Sem a cobrança ligada, o acesso é sempre total. Com ela, o escritório sem acesso total só lê (e paga, leva os dados e encerra) ou, bloqueado, só paga e leva os dados.
    const assinatura = estadoDoEscritorio(org ?? { situacao: "cortesia", testeAte: null, inadimplenteDesde: null, acessoAte: null, timezone: "America/Sao_Paulo" }, cobrancaAtiva);
    if (!acessoLiberado(assinatura.acesso, c.req.method, c.req.path.replace(/^\/api\/app/, ""))) {
      const recusa = recusaDeAcesso(assinatura);
      return c.json({ erro: recusa.erro, detalhe: recusa.detalhe }, recusa.status);
    }
    // O que o plano deixa de fora para de gravar (a demonstração mostra tudo).
    const funcionalidades: FuncionalidadesDoPlano = org?.slug === SLUG_DA_DEMONSTRACAO ? {} : (org?.funcionalidades ?? {});
    const fora = funcionalidadeDaRota(c.req.method, c.req.path.replace(/^\/api\/app/, ""));
    if (fora && !funcionalidadeLiberada({ funcionalidades }, fora)) return c.json({ erro: "fora_do_plano", detalhe: avisoForaDoPlano(fora) }, 403);
    c.set("funcionalidades", funcionalidades);
    c.set("orgId", orgId);
    c.set("orgNome", org?.nome ?? "");
    c.set("demonstracao", org?.slug === SLUG_DA_DEMONSTRACAO);
    c.set("emAvaliacao", org?.emAvaliacao ?? false);
    c.set("assinatura", assinatura);
    c.set("timezone", org?.timezone ?? "America/Sao_Paulo");
    c.set("userId", sessao.user.id);
    c.set("userEmail", sessao.user.email);
    // Com o e-mail desligado não há o que confirmar: a tela não pede um link que não chegaria.
    c.set("emailConfirmado", sessao.user.emailVerified || !deps.mailer.enabled);
    c.set("userNome", sessao.user.name || sessao.user.email);
    c.set("papel", papel);
    await registrarAcesso(db, { organizationId: orgId, userId: sessao.user.id, userAgent: c.req.header("user-agent") }, deps.log);
    await next();
  });

  /** Quem está logado, em qual escritório, a equipe e os números do menu. */
  app.get("/eu", async (c) => {
    const hoje = hojeEm(c.get("timezone"));
    // A tela pede isto ao abrir: quem usa o Decreta logado continua com o WhatsApp ligado.
    await renovarPeloUso(db, c.get("userId")).catch((err) => deps.log("a renovação do WhatsApp pelo uso falhou", { userId: c.get("userId"), error: err instanceof Error ? err.message : String(err) }));
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const conta = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
      const n = sql<number>`count(*)::int`;
      const [prazosSemana, prazosHoje, pubsNovas, nProcessos, nClientes, nNegocios, nAlvaras, [esc], [perfil]] = await Promise.all([
        conta(tx.select({ n }).from(prazos).where(and(eq(prazos.situacao, "aberto"), lte(prazos.fim, somarDias(hoje, 7))))),
        conta(tx.select({ n }).from(prazos).where(and(eq(prazos.situacao, "aberto"), lte(prazos.fim, hoje)))),
        conta(tx.select({ n }).from(publicacoes).where(eq(publicacoes.situacao, "nova"))),
        conta(tx.select({ n }).from(processos).where(inArray(processos.situacao, ["ativo", "suspenso"]))),
        conta(tx.select({ n }).from(clientes)),
        conta(tx.select({ n }).from(negocios).where(eq(negocios.etapa, "triagem"))),
        conta(tx.select({ n }).from(alvaras).where(inArray(alvaras.etapa, ["novo", "aguardando_saque", "sacado"]))),
        tx.select({ timbre: escritorios.timbre, onboardingConcluidoEm: escritorios.onboardingConcluidoEm }).from(escritorios),
        tx.select({ financeiro: equipe.financeiro }).from(equipe).where(eq(equipe.userId, c.get("userId"))),
      ]);
      const eu = pessoas.get(c.get("userId"));
      // O Financeiro é dos sócios e de quem eles liberaram; o número do menu (parcelas em atraso) só aparece para eles.
      const financeiro = ehSocio(c.get("papel")) || !!perfil?.financeiro;
      const emAtraso = financeiro ? await contarParcelasEmAtraso(tx, hoje) : 0;
      return c.json({
        usuario: { id: c.get("userId"), nome: c.get("userNome"), apelido: eu?.apelido ?? c.get("userNome"), iniciais: eu?.iniciais ?? "?", foto: eu?.foto ?? null, cargo: eu?.cargo ?? null, papel: c.get("papel"), financeiro, email: c.get("userEmail"), emailConfirmado: c.get("emailConfirmado") },
        // O logo do timbre aparece no menu; ele sai de GET /escritorio/logo.
        // `onboarding`: a configuração inicial ainda está pendente, e esta pessoa (sócia) pode fazê-la.
        escritorio: { id: c.get("orgId"), nome: c.get("orgNome"), pessoas: pessoas.size, timezone: c.get("timezone"), logo: !!esc?.timbre?.logoDocumentoId, demonstracao: c.get("demonstracao"), onboarding: !!esc && !esc.onboardingConcluidoEm && ehSocio(c.get("papel")) },
        // A assinatura só aparece com a cobrança ligada: o aviso (com data) que a moldura mostra em toda tela e o que o escritório pode fazer.
        ...(cobrancaAtiva ? { assinatura: { situacao: c.get("assinatura").situacao, acesso: c.get("assinatura").acesso, aviso: avisoDaAssinatura(c.get("assinatura")) } } : {}),
        // Só o operador da plataforma vê o link do painel.
        ...(ehOperador(deps.plataformaEmails ?? new Set(), c.get("userEmail")) ? { plataforma: true } : {}),
        hoje,
        ia: deps.ia !== null,
        // O que o plano do escritório inclui: o menu esconde o que ficou de fora.
        plano: Object.fromEntries(FUNCIONALIDADES_DO_PLANO.map((f) => [f, funcionalidadeLiberada({ funcionalidades: c.get("funcionalidades") }, f)])),
        equipe: [...pessoas.values()].map((p) => ({ id: p.id, nome: p.nome, apelido: p.apelido, iniciais: p.iniciais, foto: p.foto, cargo: p.cargo, papel: p.papel })),
        menu: { prazos: prazosSemana, prazosHoje, publicacoes: pubsNovas, processos: nProcessos, clientes: nClientes, negocios: nNegocios, alvaras: nAlvaras, financeiro: emAtraso },
      });
    });
  });

  app.get("/hoje", async (c) => {
    const hoje = hojeEm(c.get("timezone"));
    return c.json(await tenant(c, deps, (tx) => painelDoDia(db, tx, c.get("orgId"), hoje, c.get("timezone"), { iaLigada: !!deps.ia })));
  });

  /**
   * Busca do menu (⌘K): processos por número, partes ou título; clientes por nome, documento ou telefone;
   * e os prazos que esperam confirmação. Sem termo, só os prazos mais próximos.
   */
  app.get("/busca", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const aConfirmar = (tx: Tx, filtro?: SQL) =>
      tx
        .select({ id: prazos.id, tipo: prazos.tipo, fim: prazos.fim, processo: { id: processos.id, titulo: processos.titulo } })
        .from(prazos)
        .innerJoin(processos, eq(processos.id, prazos.processoId))
        .where(and(eq(prazos.situacao, "aberto"), isNull(prazos.confirmadoEm), filtro))
        .orderBy(asc(prazos.fim), asc(prazos.createdAt))
        .limit(5);
    if (q.length < 2) return tenant(c, deps, async (tx) => c.json({ processos: [], clientes: [], prazos: await aConfirmar(tx) }));
    const digitos = q.replace(/\D/g, "");
    const termo = termoSemAcento(q);
    return tenant(c, deps, async (tx) => {
      const [ps, cs, pz] = await Promise.all([
        tx
          .select({ id: processos.id, titulo: processos.titulo, cnj: processos.cnj, tipo: processos.tipo, orgao: processos.orgao })
          .from(processos)
          .where(or(like(semAcentoNoBanco(sql`${processos.titulo}`), termo), digitos.length >= 4 ? sql`regexp_replace(coalesce(${processos.cnj}, ''), '\\D', '', 'g') like ${`%${digitos}%`}` : sql`false`))
          .limit(8),
        tx
          .select({ id: clientes.id, nome: clientes.nome, documento: clientes.documento, telefone: clientes.telefone })
          .from(clientes)
          .where(or(like(semAcentoNoBanco(sql`${clientes.nome}`), termo), digitos.length >= 4 ? or(ilike(clientes.documento, `%${digitos}%`), sql`regexp_replace(coalesce(${clientes.telefone}, ''), '\\D', '', 'g') like ${`%${digitos}%`}`) : sql`false`))
          .limit(8),
        aConfirmar(tx, or(like(semAcentoNoBanco(sql`${prazos.tipo}`), termo), like(semAcentoNoBanco(sql`${processos.titulo}`), termo), digitos.length >= 4 ? sql`regexp_replace(coalesce(${processos.cnj}, ''), '\\D', '', 'g') like ${`%${digitos}%`}` : sql`false`)),
      ]);
      return c.json({ processos: ps, clientes: cs, prazos: pz });
    });
  });

  rotasDosPrazos(app, deps);
  rotasDasPublicacoes(app, deps);
  rotasDosProcessos(app, deps);
  rotasDosClientes(app, deps);
  rotasDasConsultas(app, deps);
  rotasDaIa(app, deps);
  rotasDosCamposComIa(app, deps);
  rotasDasPecas(app, deps);
  rotasDosModelos(app, deps);
  rotasDosDocumentos(app, deps);
  rotasDaAgenda(app, deps);
  rotasDosCalculos(app, deps);
  rotasDosNegocios(app, deps);
  rotasDoEscritorio(app, deps);
  rotasDosDadosDoEscritorio(app, deps);
  rotasDasMensagensAoCliente(app, deps);
  rotasDosTokensMcp(app, deps);
  rotasDoRadar(app, deps);
  rotasDoFinanceiro(app, deps);
  rotasDaCobranca(app, deps);
  rotasDaPrestacao(app, deps);
  rotasDasAssinaturas(app, deps);
  rotasDoPlano(app, deps);
  rotasDoWhatsappNoApp(app, deps);
  return app;
}
