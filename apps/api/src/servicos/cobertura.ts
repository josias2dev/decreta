/**
 * A cobertura por tribunal, para a página aberta /cobertura: o que o tribunal
 * enviou ao DJEN por último, quando o Decreta leu o caderno dele e qual
 * calendário a conta usa. Só dados públicos e datas: nada de escritório.
 */
import { temCalendarioProprio, TRIBUNAIS_DO_DJEN, type Dia, type TribunalDoDjen } from "@decreta/core";
import type { Database } from "@decreta/db";
import { ultimosEnviosAoDjen } from "@decreta/tribunais";
import { sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";

export interface LinhaDaCobertura {
  sigla: string;
  nome: string;
  ramo: TribunalDoDjen["ramo"] | "outro";
  calendario: "proprio" | "nacional";
  /** O último caderno lido com sucesso. Nulo: nenhum escritório lê este caderno, ou a leitura ainda não deu certo. */
  ultimaLeitura: { dia: Dia; em: string } | null;
  ultimoEnvio: Dia | null;
}

export interface Cobertura {
  geradaEm: string;
  /** A lista de envios do DJEN respondeu. Falso: `ultimoEnvio` é o que ficou guardado na última leitura. */
  listaDoDjen: boolean;
  tribunais: LinhaDaCobertura[];
}

type LinhaDoBanco = { tribunal: string; dia: string | null; lido_em: Date | string | null; ultimo_envio: string | null };

export async function montarCobertura(deps: { db: Database; fetch?: typeof fetch; log?: (msg: string, extra?: Record<string, unknown>) => void }): Promise<Cobertura> {
  const linhas = await deps.db.execute<LinhaDoBanco>(sql`select tribunal, dia, lido_em, ultimo_envio from cobertura_do_djen(${SLUG_DA_DEMONSTRACAO})`);
  const lidos = new Map([...linhas].map((l) => [l.tribunal, l]));
  let listaDoDjen = true;
  const envios = await ultimosEnviosAoDjen({ fetch: deps.fetch, timeout: 10_000 }).catch((err: unknown) => {
    listaDoDjen = false;
    deps.log?.("cobertura: a lista de tribunais do DJEN falhou", { error: err instanceof Error ? err.message : String(err) });
    return new Map<string, Dia>();
  });

  const conhecidos = new Set(TRIBUNAIS_DO_DJEN.map((t) => t.sigla));
  const outros = [...new Set([...envios.keys(), ...lidos.keys()])]
    .filter((s) => !conhecidos.has(s))
    .sort()
    .map((sigla): Pick<LinhaDaCobertura, "sigla" | "nome" | "ramo"> => ({ sigla, nome: sigla, ramo: "outro" }));

  const tribunais = [...TRIBUNAIS_DO_DJEN, ...outros].map((t): LinhaDaCobertura => {
    const lido = lidos.get(t.sigla);
    return {
      sigla: t.sigla,
      nome: t.nome,
      ramo: t.ramo,
      calendario: temCalendarioProprio(t.sigla) ? "proprio" : "nacional",
      ultimaLeitura: lido?.dia && lido.lido_em ? { dia: lido.dia, em: new Date(lido.lido_em).toISOString() } : null,
      ultimoEnvio: envios.get(t.sigla) ?? lido?.ultimo_envio ?? null,
    };
  });
  return { geradaEm: new Date().toISOString(), listaDoDjen, tribunais };
}
