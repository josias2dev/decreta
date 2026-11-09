/**
 * Os ajustes que o dono muda no painel da plataforma sem mexer no `.env` nem reiniciar a API: a duração do teste,
 * a cotação do dólar e os limites da IA (ver `AJUSTES_DA_PLATAFORMA` em @decreta/core).
 *
 * O padrão de cada um continua vindo do `.env` (ou do código). A tabela `ajustes_da_plataforma` guarda só o que foi
 * mudado, com quem mudou e quando. A API é um processo só: os valores ficam na memória, nos mesmos objetos que as
 * rotas e as rotinas já usam (`LimitesDaIa` e a config do painel), e mudar um ajuste troca o valor ali na hora.
 */
import { AJUSTES_DA_PLATAFORMA, definicaoDoAjuste, recusaDoAjuste, TESTE_DIAS_PADRAO, type AjusteDaPlataforma, type ChaveDoAjuste, type ValoresDosAjustes } from "@decreta/core";
import { ajustesDaPlataforma, auditoriaDaPlataforma, type Database } from "@decreta/db";
import { eq } from "drizzle-orm";
import type { ConfigDoPainel } from "./painel-da-plataforma.ts";
import { RecusaDaPlataforma } from "./plataforma.ts";
import type { LimitesDaIa } from "./uso-ia.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

/** O padrão de cada ajuste: o que vale sem ninguém mudar no painel. */
export function padraoDosAjustes(limites: LimitesDaIa, cotacaoUsd: number, testeDias = TESTE_DIAS_PADRAO): ValoresDosAjustes {
  return {
    testeDias,
    cotacaoUsd,
    "ia.tetoSiteUsd": limites.tetoSiteUsd,
    "ia.tetoPessoaUsd": limites.tetoPessoaUsd,
    "ia.mensagensPorDia": limites.mensagensPorDia,
    "ia.mensagensPorMinuto": limites.mensagensPorMinuto,
    "ia.simultaneos": limites.simultaneos,
    "ia.demonstracaoTetoUsd": limites.demonstracao.tetoUsd,
    "ia.demonstracaoMensagensPorDia": limites.demonstracao.mensagensPorDia,
  };
}

interface Mudado {
  valor: number;
  mudadoPor: string;
  mudadoEm: Date;
}

export class Ajustes {
  readonly padrao: ValoresDosAjustes;
  private readonly mudados = new Map<ChaveDoAjuste, Mudado>();

  /**
   * `limites` e `painel` são os objetos que as rotas, as rotinas e o painel já usam: os ajustes escrevem neles.
   * Sem eles (os testes que só querem o teste de N dias), os ajustes só guardam os valores.
   */
  constructor(
    private readonly alvos: { limites?: LimitesDaIa; painel?: ConfigDoPainel },
    padrao?: ValoresDosAjustes,
  ) {
    this.padrao = padrao ?? padraoDosAjustes(alvos.limites ?? SEM_LIMITES_DE_REFERENCIA, alvos.painel?.cotacaoUsd ?? 5.5);
  }

  valor(chave: ChaveDoAjuste): number {
    return this.mudados.get(chave)?.valor ?? this.padrao[chave];
  }

  get testeDias(): number {
    return this.valor("testeDias");
  }

  /** Lê o que foi mudado no painel. Uma linha que não vale mais (o ajuste saiu do código, ou o valor ficou fora da faixa) é ignorada. */
  async carregar(db: Database, log?: Log): Promise<void> {
    const linhas = await db.select().from(ajustesDaPlataforma);
    this.mudados.clear();
    for (const l of linhas) {
      const valor = Number(l.valor);
      if (!definicaoDoAjuste(l.chave) || recusaDoAjuste(l.chave, valor)) {
        log?.("ajuste da plataforma ignorado", { chave: l.chave, valor: l.valor });
        continue;
      }
      this.mudados.set(l.chave as ChaveDoAjuste, { valor, mudadoPor: l.mudadoPor, mudadoEm: l.mudadoEm });
    }
    this.aplicar();
  }

  listar(): AjusteDaPlataforma[] {
    return AJUSTES_DA_PLATAFORMA.map((d) => {
      const m = this.mudados.get(d.chave);
      return { ...d, valor: this.valor(d.chave), padrao: this.padrao[d.chave], mudadoPor: m?.mudadoPor ?? null, mudadoEm: m?.mudadoEm.toISOString() ?? null };
    });
  }

  /** Muda um ajuste (ou o volta ao padrão, com `null`), grava na auditoria e passa a valer na hora. */
  async mudar(db: Database, operador: string, chave: string, valor: number | null, agora = new Date()): Promise<AjusteDaPlataforma> {
    const d = definicaoDoAjuste(chave);
    if (!d) throw new RecusaDaPlataforma(404, "Ajuste desconhecido.");
    if (valor !== null) {
      const recusa = recusaDoAjuste(chave, valor);
      if (recusa) throw new RecusaDaPlataforma(422, recusa);
    }
    const antes = this.valor(d.chave);
    const volta = valor === null || valor === this.padrao[d.chave];
    await db.transaction(async (tx) => {
      if (volta) await tx.delete(ajustesDaPlataforma).where(eq(ajustesDaPlataforma.chave, d.chave));
      else
        await tx
          .insert(ajustesDaPlataforma)
          .values({ chave: d.chave, valor, mudadoPor: operador, mudadoEm: agora })
          .onConflictDoUpdate({ target: ajustesDaPlataforma.chave, set: { valor, mudadoPor: operador, mudadoEm: agora } });
      await tx.insert(auditoriaDaPlataforma).values({ operador, acao: "plataforma.ajuste", detalhes: { chave: d.chave, rotulo: d.rotulo, de: antes, para: volta ? this.padrao[d.chave] : valor, padrao: volta } });
    });
    if (volta) this.mudados.delete(d.chave);
    else this.mudados.set(d.chave, { valor: valor!, mudadoPor: operador, mudadoEm: agora });
    this.aplicar();
    return this.listar().find((a) => a.chave === d.chave)!;
  }

  /** Escreve os valores de agora nos objetos que as rotas usam. */
  private aplicar(): void {
    const { limites, painel } = this.alvos;
    if (limites) {
      limites.tetoSiteUsd = this.valor("ia.tetoSiteUsd");
      limites.tetoPessoaUsd = this.valor("ia.tetoPessoaUsd");
      limites.mensagensPorDia = this.valor("ia.mensagensPorDia");
      limites.mensagensPorMinuto = this.valor("ia.mensagensPorMinuto");
      limites.simultaneos = this.valor("ia.simultaneos");
      limites.demonstracao.tetoUsd = this.valor("ia.demonstracaoTetoUsd");
      limites.demonstracao.mensagensPorDia = this.valor("ia.demonstracaoMensagensPorDia");
    }
    if (painel) {
      painel.cotacaoUsd = this.valor("cotacaoUsd");
      painel.tetos.siteUsd = this.valor("ia.tetoSiteUsd");
      painel.tetos.avaliacaoUsd = this.valor("ia.demonstracaoTetoUsd");
    }
  }
}

/** Só para montar o padrão quando ninguém deu os limites (os testes): o mesmo que "sem limite". */
const SEM_LIMITES_DE_REFERENCIA: LimitesDaIa = { mensagensPorMinuto: 0, mensagensPorDia: 0, tetoPessoaUsd: 0, tetoSiteUsd: 0, demonstracao: { mensagensPorDia: 0, tetoUsd: 0 }, simultaneos: 0, preco: { entrada: 0, saida: 0 } };
