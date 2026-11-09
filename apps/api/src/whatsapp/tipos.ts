/** O que o agente do WhatsApp usa para trabalhar: o banco, o canal, a IA e as regras do escritório. */
import type { Database } from "@decreta/db";
import type { Armazenamento } from "@decreta/documentos";
import type { Ia } from "@decreta/ia";
import type { LimitesDaIa } from "../servicos/uso-ia.ts";
import type { Canal } from "./canal.ts";
import type { Log } from "./mensagens.ts";

export interface DepsDoAgente {
  db: Database;
  canal: Canal;
  log: Log;
  ia: Ia | null;
  arquivos: Armazenamento;
  /** O endereço das telas, para os links ("https://decreta.site"). */
  telas: string;
  /** Como falar com uma pessoa da equipe do Decreta (exigência da Meta para atendimento automático). */
  suporte: string;
  cobrancaAtiva: boolean;
  limites?: LimitesDaIa;
  /** Pede o rascunho da peça do prazo confirmado. */
  pedirRascunho?: (organizationId: string, prazoId: string) => Promise<void>;
  /** "laboratorio": a conversa do painel da plataforma, que não sai para ninguém. */
  origem: "agente" | "laboratorio";
  agora?: () => Date;
}

export const agoraDe = (deps: Pick<DepsDoAgente, "agora">) => deps.agora?.() ?? new Date();
