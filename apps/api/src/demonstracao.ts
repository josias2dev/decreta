/**
 * Escritório de demonstração, com os dados inventados de ./demonstracao/dados.ts.
 *
 * As datas saem do dia de hoje (prazo que vence hoje, publicação de ontem) e
 * passam pelo mesmo motor de prazos das telas: abrir um prazo e "Ajustar" dá
 * a mesma data final. As análises da IA ficam gravadas como se ela tivesse
 * lido, para a demonstração funcionar mesmo sem o gateway. O volume (uns cem
 * clientes e processos a mais) sai de ./demonstracao/volume.ts.
 */
import { calendarioPara, contarPrazo, dataDaPublicacao, dvCnj, ehDiaUtil, formatarDiaCurto, instanteLocal, somarDias, type Calendario, type Contagem, type Dia } from "@decreta/core";
import {
  alvaras,
  analises,
  atendimentos,
  audiencias,
  capturas,
  clientes,
  documentos,
  equipe,
  escritorios,
  member,
  mensagensIa,
  movimentacoes,
  negocios,
  organization,
  partes,
  pecas,
  prazos,
  processos,
  publicacoes,
  suspensoes,
  tarefas,
  twoFactor,
  user,
  withTenant,
  type Database,
} from "@decreta/db";
import { chaveDoDocumento, gerarDocx, MIME_DOCX, type Armazenamento } from "@decreta/documentos";
import { impressao } from "@decreta/ia";
import { existsSync, readFileSync } from "node:fs";
import { and, eq, like, or } from "drizzle-orm";
import type { Auth } from "./auth.ts";
import {
  ALVARAS,
  ANDAMENTOS,
  ATENDIMENTOS,
  AUDIENCIAS,
  BRIEFING_MARINA,
  CHAT_MARINA,
  CLIENTES,
  EQUIPE,
  ESCRITORIO,
  NEGOCIOS,
  PRAZOS,
  PREPARACAO_CARLOS,
  PROCESSOS,
  PUBLICACOES,
  RESUMO_MARINA,
  SUSPENSOES,
  TAREFAS,
  type ProcessoDemo,
  type Quem,
} from "./demonstracao/dados.ts";
import { criarNovidades } from "./demonstracao/novidades.ts";
import { DOMINIO_DA_DEMONSTRACAO, LOGIN_DA_DEMONSTRACAO } from "./demonstracao/slug.ts";
import { gerarVolume } from "./demonstracao/volume.ts";
import { carregarContexto } from "./servicos/contexto.ts";
import { contagemNaTela, criarPrazoSugerido, type SugestaoNaTela } from "./servicos/prazos.ts";
import { CHECKLIST_DA_TRIAGEM } from "./rotas/negocios.ts";

/** Fotos de perfil e logo inventados (gerados por IA), se estiverem no repositório. */
const FOTOS = new URL("../../web/public/demonstracao/", import.meta.url);
const LOGO = new URL("./demonstracao/imagens/logo.png", import.meta.url);
const fotoDe = (q: Quem) => (existsSync(new URL(`${q}.jpg`, FOTOS)) ? `/demonstracao/${q}.jpg` : null);

/** O e-mail de cada pessoa: a sócia entra com o login da demonstração. */
export const emailDaDemonstracao = (q: Quem) => EQUIPE[q].email ?? `${q}@${DOMINIO_DA_DEMONSTRACAO}`;

export interface OpcoesDaDemonstracao {
  /** Dia da demonstração; os prazos e publicações saem dele. */
  hoje: Dia;
  /** Senha das quatro pessoas. Sem ela, quem já existe fica com a senha que tem. */
  senha?: string;
  arquivos: Armazenamento;
  timezone?: string;
  /** Recriar com o mesmo id: quem já entrou continua no escritório. */
  organizationId?: string;
}

/**
 * Apaga a demonstração: o escritório, os arquivos dele e as quatro pessoas.
 * Com `manterPessoas`, as contas e as sessões ficam (para renovar as datas sem
 * tirar ninguém do sistema). Nenhum outro escritório é tocado.
 */
export async function apagarDemonstracao(db: Database, o: { arquivos?: Armazenamento; manterPessoas?: boolean } = {}): Promise<string | null> {
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, ESCRITORIO.slug));
  if (org) {
    if (o.arquivos) {
      const chaves = await withTenant(db, org.id, (tx) => tx.select({ chave: documentos.chave }).from(documentos));
      for (const { chave } of chaves) await o.arquivos.delete(chave).catch(() => {});
    }
    await db.delete(organization).where(eq(organization.id, org.id));
  }
  if (!o.manterPessoas) await db.delete(user).where(or(like(user.email, `%@${DOMINIO_DA_DEMONSTRACAO}`), eq(user.email, LOGIN_DA_DEMONSTRACAO)));
  return org?.id ?? null;
}

const digitos = (base: string, pesos: number[]) => {
  const s = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0) % 11;
  return s < 2 ? 0 : 11 - s;
};

/** CPF ou CNPJ inventado, com os verificadores certos. */
export function documentoValido(base: string): string {
  if (base.length === 9) {
    const d1 = digitos(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = digitos(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return `${base}${d1}${d2}`;
  }
  const d1 = digitos(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitos(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}

function cnjDe(n: [string, string, string, string, string]): string {
  const [seq, ano, seg, trib, origem] = n;
  return `${seq}-${dvCnj(seq, ano, seg, trib, origem)}.${ano}.${seg}.${trib}.${origem}`;
}

/** n dias úteis a partir de `dia` (negativo volta). */
function diasUteis(dia: Dia, n: number, cal: Calendario): Dia {
  let d = dia;
  let falta = Math.abs(n);
  const passo = n < 0 ? -1 : 1;
  while (!ehDiaUtil(d, cal)) d = somarDias(d, passo);
  while (falta > 0) {
    d = somarDias(d, passo);
    if (ehDiaUtil(d, cal)) falta--;
  }
  return d;
}

/** A disponibilização mais recente cujo prazo termina em `fim` (ou o mais perto antes dele). */
function disponibilizacaoPara(fim: Dia, dias: number, contagem: Contagem, cal: Calendario): Dia {
  let melhor: Dia | null = null;
  for (let d = somarDias(fim, -1); d > somarDias(fim, -dias * 3 - 60); d = somarDias(d, -1)) {
    if (!ehDiaUtil(d, cal)) continue;
    const r = contarPrazo({ publicacao: dataDaPublicacao(d, cal), dias, contagem, calendario: cal });
    if (r.fim === fim) return d;
    if (r.fim < fim && !melhor) melhor = d;
  }
  return melhor ?? somarDias(fim, -dias * 2);
}

export async function criarDemonstracao(db: Database, auth: Auth, o: OpcoesDaDemonstracao): Promise<{ organizationId: string; emails: string[] }> {
  const tz = o.timezone ?? "America/Sao_Paulo";
  const hoje = o.hoje;
  const ctx = await auth.$context;
  const em = (dia: Dia, hora = "09:00") => instanteLocal(dia, hora, tz);
  const calTJSC = calendarioPara({ tribunal: "TJSC" });
  const calDe = (tribunal?: string) => calendarioPara({ tribunal: tribunal ?? "TJSC" });
  const util = (n: number) => diasUteis(hoje, n, calTJSC);
  const volume = gerarVolume(hoje);
  const clientesDemo = { ...CLIENTES, ...volume.clientes };
  const processosDemo: Record<string, ProcessoDemo> = {
    ...Object.fromEntries(Object.entries(PROCESSOS).map(([chave, p]) => [chave, { ...p, movimentacoes: p.movimentacoes ?? ANDAMENTOS[chave] }])),
    ...volume.processos,
  };

  // Equipe: quem já existe (renovação) fica com a conta e as sessões, e volta
  // ao nome, à senha e ao login sem verificação em duas etapas.
  const ids = {} as Record<Quem, string>;
  for (const [quem, p] of Object.entries(EQUIPE) as [Quem, (typeof EQUIPE)[Quem]][]) {
    const email = emailDaDemonstracao(quem);
    const [existe] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (existe) {
      ids[quem] = existe.id;
      await db.update(user).set({ name: p.nome, image: fotoDe(quem), twoFactorEnabled: false }).where(eq(user.id, existe.id));
      await db.delete(twoFactor).where(eq(twoFactor.userId, existe.id));
      if (o.senha) await ctx.internalAdapter.updatePassword(existe.id, await ctx.password.hash(o.senha));
      continue;
    }
    if (!o.senha) throw new Error(`falta a senha para criar ${email}`);
    const criado = await ctx.internalAdapter.createUser({ email, name: p.nome, emailVerified: true, image: fotoDe(quem) }, { method: "email-password" });
    await ctx.internalAdapter.linkAccount({ userId: criado.id, providerId: "credential", accountId: criado.id, password: await ctx.password.hash(o.senha) });
    ids[quem] = criado.id;
  }
  const pessoa = (q: Quem | null | undefined) => (q ? ids[q] : null);

  const organizationId = o.organizationId ?? crypto.randomUUID();
  await db.insert(organization).values({ id: organizationId, name: ESCRITORIO.nome, slug: ESCRITORIO.slug, timezone: tz });
  await db.insert(member).values(
    (Object.keys(EQUIPE) as Quem[]).map((q) => ({ id: crypto.randomUUID(), organizationId, userId: ids[q], role: EQUIPE[q].papel })),
  );

  // Documentos vão para o armazenamento depois da transação.
  const arquivos: { chave: string; bytes: Uint8Array; mime: string }[] = [];

  const { sugestoes, marinaId } = await withTenant(db, organizationId, async (tx) => {
    // O logo entra como o da tela de Configurações: um documento do escritório.
    let logoDocumentoId: string | undefined;
    if (existsSync(LOGO)) {
      const bytes = new Uint8Array(readFileSync(LOGO));
      logoDocumentoId = crypto.randomUUID();
      const chave = chaveDoDocumento(organizationId, logoDocumentoId);
      arquivos.push({ chave, bytes, mime: "image/png" });
      await tx.insert(documentos).values({ id: logoDocumentoId, organizationId, nome: "Logo do escritório.png", mime: "image/png", tamanho: bytes.length, chave, origem: "upload", enviadoPor: ids.beatriz, createdAt: em(somarDias(hoje, -400)) });
    }
    await tx.insert(escritorios).values({ organizationId, tribunal: "TJSC", timbre: { ...ESCRITORIO.timbre, logoDocumentoId }, avisos: { manha: false, hora: "07:30" }, capturaDjen: false, capturaDatajud: false });
    await tx.insert(equipe).values(
      (Object.keys(EQUIPE) as Quem[]).map((q) => ({
        organizationId,
        userId: ids[q],
        apelido: EQUIPE[q].nome.split(" ")[0],
        cargo: EQUIPE[q].cargo,
        oabNumero: EQUIPE[q].oab ?? null,
        oabUf: EQUIPE[q].oab ? "SC" : null,
        avisoManha: false,
      })),
    );
    await tx.insert(suspensoes).values(SUSPENSOES.map((s) => ({ organizationId, dia: s.dia, motivo: s.motivo, tipo: s.tipo, tribunal: s.tribunal ?? null, comarca: s.comarca ?? null })));

    // Clientes
    const clienteId: Record<string, string> = {};
    for (const [chave, c] of Object.entries(clientesDemo)) {
      const [linha] = await tx
        .insert(clientes)
        .values({ organizationId, nome: c.nome, tipo: c.tipo, documento: documentoValido(c.base), telefone: c.telefone, email: c.email ?? null, endereco: c.endereco ?? null, createdAt: em(somarDias(hoje, -(c.desdeHa ?? 400 - Object.keys(clienteId).length * 13))) })
        .returning({ id: clientes.id });
      clienteId[chave] = linha!.id;
    }

    // Processos, partes e movimentações (a da última publicação entra depois do resumo da IA)
    const processoId: Record<string, string> = {};
    for (const [chave, p] of Object.entries(processosDemo)) {
      const cnj = p.numero ? cnjDe(p.numero) : null;
      const [linha] = await tx
        .insert(processos)
        .values({
          organizationId,
          cnj,
          titulo: p.titulo,
          tipo: p.tipo ?? "judicial",
          tribunal: p.tribunal ?? null,
          classe: p.classe,
          assunto: p.assunto,
          orgao: p.orgao ?? null,
          comarca: p.comarca ?? null,
          sistema: p.sistema ?? null,
          valorCausa: p.valor != null ? p.valor.toFixed(2) : null,
          fase: p.fase ?? null,
          situacao: p.situacao ?? "ativo",
          segredo: p.segredo ?? false,
          clienteId: clienteId[p.cliente]!,
          poloCliente: p.poloCliente,
          responsavelId: pessoa(p.responsavel),
          distribuidoEm: somarDias(hoje, -p.distribuidoHa),
          datajudEm: p.numero ? em(hoje, "05:12") : null,
          createdAt: em(somarDias(hoje, -p.distribuidoHa)),
        })
        .returning({ id: processos.id });
      processoId[chave] = linha!.id;
      const c = clientesDemo[p.cliente]!;
      const outraPolo = p.poloCliente === "ativo" ? "passivo" : "ativo";
      await tx.insert(partes).values([
        { organizationId, processoId: linha!.id, nome: c.nome, polo: p.poloCliente, papel: p.papelCliente, documento: documentoValido(c.base), cliente: true, ordem: p.poloCliente === "ativo" ? 0 : 1 },
        { organizationId, processoId: linha!.id, nome: p.outraParte.nome, polo: outraPolo, papel: p.outraParte.papel, cliente: false, ordem: p.poloCliente === "ativo" ? 1 : 0 },
      ]);
    }

    const ultimaDisp = util(-1);
    /** `capturadaAs`: a hora em que o DataJud trouxe a movimentação (o resumo da Marina é das 18:30). */
    const gravarMovimentacoes = async (chave: string, filtro: (evento: number) => boolean, capturadaAs = "18:10") => {
      const p = processosDemo[chave]!;
      for (const m of p.movimentacoes ?? []) {
        if (!filtro(m.evento)) continue;
        const dia = somarDias(ultimaDisp, -m.antes);
        await tx.insert(movimentacoes).values({
          organizationId,
          processoId: processoId[chave]!,
          em: em(dia, m.autor === "partes" ? "17:20" : "14:05"),
          evento: m.evento,
          titulo: m.titulo,
          descricao: m.descricao,
          autor: m.autor,
          fonte: p.tipo === "extrajudicial" ? "manual" : "datajud",
          chave: `demo:${m.evento}`,
          createdAt: em(dia, capturadaAs),
        });
        if (m.documento) {
          const documentoId = crypto.randomUUID();
          const chaveArquivo = chaveDoDocumento(organizationId, documentoId);
          const bytes = await gerarDocx({ titulo: m.documento.nome.replace(/\.docx$/, ""), texto: m.documento.texto, timbre: { nome: "Cópia dos autos" } });
          arquivos.push({ chave: chaveArquivo, bytes, mime: MIME_DOCX });
          await tx.insert(documentos).values({
            id: documentoId,
            organizationId,
            processoId: processoId[chave]!,
            nome: m.documento.nome,
            mime: MIME_DOCX,
            tamanho: bytes.length,
            paginas: m.documento.paginas,
            chave: chaveArquivo,
            texto: m.documento.texto,
            origem: "captura",
            evento: m.evento,
            createdAt: em(dia, "18:00"),
          });
        }
      }
      const [ultima] = (p.movimentacoes ?? []).filter((m) => filtro(m.evento)).sort((a, b) => a.antes - b.antes);
      if (ultima) await tx.update(processos).set({ ultimaMovimentacaoEm: em(somarDias(ultimaDisp, -ultima.antes), "17:20") }).where(eq(processos.id, processoId[chave]!));
    };

    // Marina: o resumo foi lido até o evento 88; a petição da ré (89) chegou depois.
    await gravarMovimentacoes("marina", (e) => e <= 88);
    const antesDa89 = await carregarContexto(tx, processoId.marina!);
    const preencher = (s: string) => s.replace("{fim}", formatarDiaCurto(contarPrazo({ publicacao: dataDaPublicacao(ultimaDisp, calTJSC), dias: 15, contagem: "uteis", calendario: calTJSC }).fim)).replace("{disp}", formatarDiaCurto(ultimaDisp));
    await tx.insert(analises).values({
      organizationId,
      alvo: "processo",
      alvoId: processoId.marina!,
      acao: "resumo-autos",
      situacao: "pronto",
      conteudo: { ...RESUMO_MARINA, oQueFazer: RESUMO_MARINA.oQueFazer.map(preencher), ultimoAto: preencher(RESUMO_MARINA.ultimoAto) },
      fonte: antesDa89!.fonte,
      base: antesDa89!.base,
      pedidaPor: ids.beatriz,
      createdAt: em(ultimaDisp, "18:30"),
    });
    await gravarMovimentacoes("marina", (e) => e > 88, "19:40");
    for (const chave of Object.keys(processosDemo)) if (chave !== "marina") await gravarMovimentacoes(chave, () => true);

    // Publicações da caixa, com a leitura da IA
    const oab = (q: Quem | null) => (q && EQUIPE[q].oab ? [{ nome: EQUIPE[q].nome, oab: EQUIPE[q].oab!, uf: "SC" }] : [{ nome: EQUIPE.beatriz.nome, oab: EQUIPE.beatriz.oab!, uf: "SC" }]);
    let idExterno = 512_300_000;
    let ordem = 0;
    const novaPublicacao = async (x: { processo: string; disponibilizadaEm: Dia; tipoComunicacao: string; tipoDocumento: string; teor: string; situacao: "nova" | "pendente" | "lida" | "vinculada"; tratadaPor?: string | null }) => {
      const p = processosDemo[x.processo]!;
      const cal = calDe(p.tribunal);
      const publicadaEm = dataDaPublicacao(x.disponibilizadaEm, cal);
      const [pub] = await tx
        .insert(publicacoes)
        .values({
          organizationId,
          fonte: "djen",
          idExterno: String(idExterno++),
          disponibilizadaEm: x.disponibilizadaEm,
          publicadaEm,
          tribunal: p.tribunal ?? "TJSC",
          orgao: [p.orgao, p.comarca].filter(Boolean).join(" de "),
          tipoComunicacao: x.tipoComunicacao,
          tipoDocumento: x.tipoDocumento,
          classe: p.classe,
          cnj: p.numero ? cnjDe(p.numero) : null,
          processoId: processoId[x.processo]!,
          texto: x.teor,
          destinatarios: [{ nome: clientesDemo[p.cliente]!.nome, polo: p.poloCliente }],
          advogados: oab(p.responsavel),
          situacao: x.situacao,
          tratadaPor: x.tratadaPor ?? null,
          tratadaEm: x.tratadaPor ? em(publicadaEm, "09:12") : null,
          // Na caixa, a ordem do dado: a primeira da lista é a mais recente.
          createdAt: new Date(em(publicadaEm, "06:40").getTime() - ++ordem * 1000),
        })
        .returning();
      return pub!;
    };
    const lerComIa = async (pub: typeof publicacoes.$inferSelect, cal: Calendario, s: { geraPrazo: boolean; tipo: string; dias: number | null; contagem: Contagem; fundamento: string | null; resumo: string; assunto: string; audiencia: SugestaoNaTela["audiencia"] } | null, responsavel: string | null) => {
      const quando = em(pub.publicadaEm, "06:41");
      if (!s) {
        await tx.insert(analises).values({ organizationId, alvo: "publicacao", alvoId: pub.id, acao: "sugerir-prazo", situacao: "recusa", conteudo: { recusa: "Falta o teor da publicação. Abra a íntegra no sistema do tribunal e cole aqui, ou anexe a decisão." }, fonte: `DJEN · ${pub.disponibilizadaEm.split("-").reverse().join("/")}`, base: impressao(pub.texto), createdAt: quando });
        return null;
      }
      const contagemCalculada = s.geraPrazo && s.dias ? contagemNaTela(contarPrazo({ publicacao: pub.publicadaEm, dias: s.dias, contagem: s.contagem, calendario: cal })) : null;
      const conteudo: SugestaoNaTela = { ...s, recusa: null, contagemCalculada, responsavelId: responsavel };
      await tx.insert(analises).values({ organizationId, alvo: "publicacao", alvoId: pub.id, acao: "sugerir-prazo", situacao: "pronto", conteudo: conteudo as unknown as Record<string, unknown>, fonte: `DJEN · ${pub.disponibilizadaEm.split("-").reverse().join("/")}`, base: impressao(pub.texto), createdAt: quando });
      return conteudo;
    };

    const sugestoes: { pubId: string; s: SugestaoNaTela }[] = [];
    for (const x of [...PUBLICACOES, ...volume.publicacoes]) {
      const p = processosDemo[x.processo]!;
      const cal = calDe(p.tribunal);
      const disp = diasUteis(hoje, -x.disp, cal);
      const pub = await novaPublicacao({ processo: x.processo, disponibilizadaEm: disp, tipoComunicacao: x.tipoComunicacao, tipoDocumento: x.tipoDocumento, teor: x.teor, situacao: x.situacao, tratadaPor: x.situacao === "lida" ? pessoa(p.responsavel) ?? ids.beatriz : null });
      const audiencia = x.sugestao?.audiencia ? { data: diasUteis(hoje, x.sugestao.audiencia.emDiasUteis, cal), hora: x.sugestao.audiencia.hora, tipo: x.sugestao.audiencia.tipo, porVideo: x.sugestao.audiencia.porVideo } : null;
      const s = await lerComIa(
        pub,
        cal,
        x.sugestao
          ? { geraPrazo: x.sugestao.dias != null, tipo: x.sugestao.tipo, dias: x.sugestao.dias, contagem: x.sugestao.contagem ?? "uteis", fundamento: x.sugestao.fundamento ?? null, resumo: x.sugestao.resumo, assunto: x.sugestao.assunto, audiencia }
          : null,
        pessoa(p.responsavel),
      );
      if (s && x.situacao !== "lida") sugestoes.push({ pubId: pub.id, s });
    }

    // Prazos confirmados e cumpridos, cada um com a publicação de onde veio
    for (const z of [...PRAZOS, ...volume.prazos]) {
      const p = processosDemo[z.processo]!;
      const cal = calDe(p.tribunal);
      const contagem = z.contagem ?? "uteis";
      const fimAlvo = diasUteis(hoje, z.fim, cal);
      const disp = disponibilizacaoPara(fimAlvo, z.dias, contagem, cal);
      const r = contarPrazo({ publicacao: dataDaPublicacao(disp, cal), dias: z.dias, contagem, calendario: cal });
      const responsavel = z.responsavel === undefined ? pessoa(p.responsavel) : pessoa(z.responsavel);
      let publicacaoId: string | null = null;
      if (z.fonte === "djen") {
        const pub = await novaPublicacao({ processo: z.processo, disponibilizadaEm: disp, tipoComunicacao: "Intimação", tipoDocumento: "Despacho", teor: z.teor ?? z.tipo, situacao: "vinculada", tratadaPor: responsavel ?? ids.beatriz });
        await lerComIa(pub, cal, { geraPrazo: true, tipo: z.tipo, dias: z.dias, contagem, fundamento: z.fundamento, resumo: z.tipo, assunto: z.tipo.toLowerCase(), audiencia: null }, responsavel);
        publicacaoId = pub.id;
      }
      const confirmadoEm = em(r.publicacao, "09:12");
      const [linha] = await tx
        .insert(prazos)
        .values({
          organizationId,
          processoId: processoId[z.processo]!,
          publicacaoId,
          tipo: z.tipo,
          fundamento: z.fundamento,
          dias: z.dias,
          contagem,
          publicadoEm: r.publicacao,
          inicio: r.inicio,
          fim: r.fim,
          desconsiderados: r.desconsiderados.map((f) => ({ dia: f.dia, nome: f.nome, tipo: f.tipo })),
          situacao: z.estado === "cumprido" ? "cumprido" : "aberto",
          origem: z.fonte === "djen" ? "ia" : "manual",
          responsavelId: responsavel,
          confirmadoPor: responsavel ?? ids.beatriz,
          confirmadoEm,
          cumpridoPor: z.estado === "cumprido" ? (responsavel ?? ids.beatriz) : null,
          cumpridoEm: z.estado === "cumprido" ? em(somarDias(r.fim, -1), "16:40") : null,
          createdAt: z.fonte === "manual" ? em(somarDias(r.fim, -z.dias - 2), "10:30") : em(r.publicacao, "06:41"),
        })
        .returning({ id: prazos.id });
      if (z.peca) {
        await tx.insert(pecas).values({ organizationId, processoId: processoId[z.processo]!, prazoId: linha!.id, tipo: z.peca.tipo, titulo: z.peca.titulo, instrucoes: null, texto: z.peca.texto, situacao: "rascunho", criadaPor: responsavel, createdAt: em(util(-1), "15:10") });
      }
    }

    // Audiências (a do Carlos já tem a preparação da IA)
    for (const a of [...AUDIENCIAS, ...volume.audiencias]) {
      const p = processosDemo[a.processo]!;
      const dia = diasUteis(hoje, a.dia, calDe(p.tribunal));
      const [linha] = await tx
        .insert(audiencias)
        .values({
          organizationId,
          processoId: processoId[a.processo]!,
          em: em(dia, a.hora),
          tipo: a.tipo,
          local: a.local,
          porVideo: a.porVideo,
          situacao: a.situacao ?? "marcada",
          responsavelId: pessoa(a.responsavel),
          checklist: a.preparada ? PREPARACAO_CARLOS.checklist.map((texto, i) => ({ texto, feito: i < 1 })) : [],
        })
        .returning({ id: audiencias.id });
      if (a.preparada) {
        const ctxCarlos = await carregarContexto(tx, processoId[a.processo]!);
        await tx.insert(analises).values({ organizationId, alvo: "audiencia", alvoId: linha!.id, acao: "preparar-audiencia", situacao: "pronto", conteudo: PREPARACAO_CARLOS, fonte: ctxCarlos!.fonte, base: ctxCarlos!.base, pedidaPor: ids.rafael, createdAt: em(util(-1), "17:45") });
      }
    }

    // Novos negócios, tarefas, alvarás, atendimentos
    const negocioId: Record<string, string> = {};
    for (const n of NEGOCIOS) {
      const [linha] = await tx
        .insert(negocios)
        .values({
          organizationId,
          nome: n.nome,
          telefone: n.telefone,
          assunto: n.assunto,
          area: n.area,
          pasta: n.pasta,
          etapa: n.etapa,
          checklist: CHECKLIST_DA_TRIAGEM.map((texto, i) => ({ texto, feito: i < n.feitos })),
          responsavelId: pessoa(n.responsavel),
          observacoes: n.observacoes ?? null,
          createdAt: em(somarDias(hoje, -2 - NEGOCIOS.indexOf(n)), "11:00"),
        })
        .returning({ id: negocios.id });
      negocioId[n.chave] = linha!.id;
    }
    for (const t of [...TAREFAS, ...volume.tarefas]) {
      await tx.insert(tarefas).values({
        organizationId,
        titulo: t.titulo,
        detalhe: t.detalhe,
        dia: util(t.dia),
        concluidaEm: t.concluida ? em(util(t.dia), "17:40") : null,
        responsavelId: ids[t.responsavel],
        processoId: t.processo ? processoId[t.processo]! : null,
        negocioId: t.negocio ? negocioId[t.negocio]! : null,
        criadaPor: ids.beatriz,
      });
    }
    for (const a of [...ALVARAS, ...volume.alvaras]) {
      const expedidoEm = somarDias(hoje, -a.expedidoHa);
      await tx.insert(alvaras).values({
        organizationId,
        processoId: processoId[a.processo]!,
        descricao: a.descricao,
        valor: a.valor.toFixed(2),
        valorRecebido: a.recebido != null ? a.recebido.toFixed(2) : null,
        etapa: a.etapa,
        expedidoEm,
        sacadoEm: a.etapa === "sacado" || a.etapa === "repassado" || a.etapa === "finalizado" ? somarDias(expedidoEm, 4) : null,
        repassadoEm: a.etapa === "repassado" || a.etapa === "finalizado" ? somarDias(expedidoEm, 6) : null,
      });
    }
    for (const [i, a] of [...ATENDIMENTOS, ...volume.atendimentos].entries()) {
      const hora = i < ATENDIMENTOS.length ? "15:30" : `${String(9 + ((i * 7) % 9)).padStart(2, "0")}:${["05", "20", "35", "50"][i % 4]}`;
      await tx.insert(atendimentos).values({ organizationId, clienteId: clienteId[a.cliente]!, processoId: a.processo ? processoId[a.processo]! : null, em: em(somarDias(hoje, -a.haDias), hora), canal: a.canal, resumo: a.resumo, autorId: ids[a.autor] });
    }

    // Chat do processo da Marina
    for (const [i, m] of CHAT_MARINA.entries()) {
      await tx.insert(mensagensIa).values({ organizationId, processoId: processoId.marina!, userId: ids[m.quem], papel: m.papel, texto: m.texto, createdAt: new Date(em(util(-1), "16:02").getTime() + i * 9000) });
    }

    // Captura de hoje cedo no DJEN
    const novas = PUBLICACOES.filter((p) => p.situacao === "nova").length;
    await tx.insert(capturas).values({ organizationId, fonte: "djen", iniciadaEm: em(hoje, "06:40"), terminadaEm: em(hoje, "06:40"), encontradas: novas + 2, novas });

    return { sugestoes, marinaId: processoId.marina! };
  });

  for (const a of arquivos) await o.arquivos.put(a.chave, a.bytes, a.mime);
  // As sugestões viram prazos "Confirmar sugestão" pelo mesmo caminho da IA.
  for (const { pubId, s } of sugestoes) await criarPrazoSugerido(db, organizationId, pubId, s);

  // Briefing do prazo da Marina, lido com os autos como estão agora.
  await withTenant(db, organizationId, async (tx) => {
    const ctxMarina = await carregarContexto(tx, marinaId);
    const [doLaudo] = await tx
      .select({ id: prazos.id, fim: prazos.fim })
      .from(prazos)
      .where(and(eq(prazos.processoId, marinaId), eq(prazos.situacao, "aberto")));
    if (doLaudo) {
      const fim = formatarDiaCurto(doLaudo.fim);
      await tx.insert(analises).values({
        organizationId,
        alvo: "prazo",
        alvoId: doLaudo.id,
        acao: "briefing-prazo",
        situacao: "pronto",
        conteudo: { ...BRIEFING_MARINA, fazer: BRIEFING_MARINA.fazer.map((f) => f.replace("{fim}", fim)) },
        fonte: `DJEN · ${formatarDiaCurto(util(-1))}/${util(-1).slice(0, 4)} · laudo do evento 87`,
        base: ctxMarina!.base,
        pedidaPor: ids.beatriz,
        createdAt: em(hoje, "06:42"),
      });
    }
  });

  // Leitura da sentença, modelos, conferência da pasta e retorno sobre a IA.
  await criarNovidades(db, organizationId, { hoje, timezone: tz, arquivos: o.arquivos, pessoas: ids });

  return { organizationId, emails: (Object.keys(EQUIPE) as Quem[]).map(emailDaDemonstracao) };
}
