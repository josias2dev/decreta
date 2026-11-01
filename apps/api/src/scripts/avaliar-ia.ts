/**
 * Conjunto-ouro contra a IA de verdade (pelo gateway). Rode a cada troca de
 * modelo no painel do gateway ou de prompt em packages/ia:
 *
 *   bun run avaliar
 *
 * Sai com erro quando algum prazo não cai no dia exato, quando um resumo fica
 * abaixo de 80% na rubrica ou quando há citação fora da fonte. Gasta uns
 * centavos de IA; nunca roda na suíte de testes.
 */
import { avaliarConjunto, createGatewayIa, placarEmTexto } from "@decreta/ia";
import { CONJUNTO_OURO } from "@decreta/ia/conjunto-ouro";
import { readEnv } from "../env.ts";

const NOTA_MINIMA_DO_RESUMO = 0.8;

const env = readEnv({ DATABASE_URL: "postgres://nao-usado/x", BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "http://localhost", ...process.env });
if (!env.LLM_API_KEY) {
  console.error("Sem LLM_API_KEY no .env: a avaliação precisa do gateway.");
  process.exit(1);
}
const ia = createGatewayIa({
  baseUrl: env.LLM_BASE_URL,
  apiKey: env.LLM_API_KEY,
  modelos: { juridico: env.MODELO_JURIDICO, autos: env.MODELO_AUTOS, documentos: env.MODELO_DOCUMENTOS, pdf: env.MODELO_PDF, vision: env.MODELO_VISION },
  modeloTranscricao: env.MODELO_TRANSCRICAO,
});

const placar = await avaliarConjunto(ia, CONJUNTO_OURO);
console.log(placarEmTexto(placar));
const passou = placar.prazos.acertos === placar.prazos.total && placar.resumos.nota >= NOTA_MINIMA_DO_RESUMO && placar.citacoesForaDaFonte === 0;
process.exit(passou ? 0 : 1);
