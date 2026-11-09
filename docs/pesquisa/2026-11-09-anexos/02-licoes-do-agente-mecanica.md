# Anexo 02: o que aprender com o agente-mecanica

Leitura de 09/11/2026 do repositório `agente-mecanica` (versão 2.9.6), feita para o [plano do agente no WhatsApp](../2026-11-09-agente-no-whatsapp.md). Os caminhos são relativos a esse repositório. Nada foi alterado lá.

## O que ele é

Agente de WhatsApp de uma oficina, num processo Node separado (Fastify). O fluxo:
- recebe o webhook do wameow, um gateway não oficial, e o da Cloud API;
- descobre a oficina pelo telefone de quem escreveu;
- conversa com a IA usando as ferramentas do servidor MCP do app, que está na Vercel;
- responde no WhatsApp.

A equipe usa o wameow porque trabalha em grupos. O cliente final usa a API oficial.

## O fato que mais importa

`PLANO-V3.md`, 11/08/2026: o uso real do agente era **pedir o PDF de um orçamento ou OS. Só.**
- Ditado de OS, financeiro no chat e visão de nota foram construídos, funcionavam e não foram usados.
- Os proativos estavam quase todos desligados.
- A conclusão: toda entrega nova precisa "se acoplar ao gesto que já existe" ou "rodar sem exigir gesto nenhum". E cada aposta ganha um critério de morte: sem uso em N semanas, desliga.

## O caminho de uma mensagem

1. **Recepção.** `POST /webhook` autentica pelo segredo, comparado em tempo constante (`webhook-auth.ts`), responde 200 na hora e processa em segundo plano (`main.ts:248`).
2. **Quem é.** `resolveTenant` (`tenant.ts:91`) vai do telefone ao usuário e à organização. Número desconhecido não recebe resposta.
3. **Sessão.** A sessão dura 24 h, e a idempotência é por `waMessageId` (`conversation.ts`).
4. **Mídia.** Áudio é transcrito e foto ou PDF passa pela visão antes de entrar no transcript.
5. **Rajada.** O debounce de 2 s junta a rajada (`debounce.ts`).
6. **O turno.** Roda sob trava por conversa (`processTurn`, `main.ts:1073`):
   - se chegou mensagem nova durante a geração, o coalescer (`turn-coalescer.ts`) descarta o rascunho e refaz;
   - o que já foi executado entra marcado `[JÁ EXECUTADO]` ou `[NÃO EXECUTADO]`;
   - limite de 3 rodadas e 90 s.
7. **Saída.** O Markdown vira marcas do WhatsApp no código (`format.ts`) antes do envio.

## O loop da IA (`ai.ts`)

- **Ferramentas:** as do MCP mais as locais, filtradas por papel **antes** de a IA ver a lista e **de novo** na execução, porque a IA pode inventar um nome que viu no histórico.
- **Limites:** 8 iterações e 75 s de prazo do turno. Quem manda é o relógio.
- **Erro de ferramenta:** volta para a IA como `{error}`. Se o turno cai depois de já ter gravado, `AgentLoopError` diz quantas ferramentas já rodaram, para não mandar "tente de novo" e duplicar a OS.
- **Ferramentas que gravam:** rodam em série, porque duas gravações em paralelo na mesma OS apagavam um item com 200 nas duas.
- **Custo:**
  - o transcript enviado vai até 60 mensagens e 12 mil caracteres;
  - o evento `turn` mede tokens de entrada, de saída e em cache.
- **Cache de prompt:** sem marcação explícita. O prompt tem só a data, sem a hora, para o prefixo durar o dia.

## A confirmação em duas fases

- **Ações sensíveis:**
  - a lista fica em `sensitive-calls.ts`: NF, exclusão, cancelamento e envio ao cliente;
  - a decisão é do servidor e não da IA;
  - valor tirado de foto ou PDF também pede confirmação (`valorVeioDaMidia`).
- **Fase 1:** o despachante não executa. Ele congela nome e argumentos em `AgentPendingAction` e devolve "AÇÃO NÃO EXECUTADA".
- **Fase 2:** `confirm_pending_action` executa exatamente o que foi congelado, e a IA não reenvia os argumentos.
- **Os remendos que isso exigiu:**
  - bloqueio de confirmar no mesmo turno em que a ação nasceu;
  - checagem do aprovador antes de consumir a pendência;
  - execução única por update condicionado;
  - validade de 30 minutos;
  - lembrete de pendência no fim do contexto, porque o id morria com o turno (OS 221, 17/08: 7 pendências, nenhuma executada).
- **Quem aprova** (`engines/aprovacao.ts`): é conferido pelo telefone de quem falou, não pelo dono da conversa.

**No Decreta, o botão interativo da API oficial tira a IA da confirmação.** Quase todos esses remendos deixam de ser necessários. A parte que continua valendo: congelar no servidor, executar uma vez, conferir quem toca e a validade.

## Memória

- **Sessão:** 24 h. Quando a sessão recomeça, as últimas 6 mensagens da anterior entram cortadas, sem IA.
- **Longo prazo** (`memoria.ts`):
  - a IA grava e apaga com as ferramentas `lembrar` e `esquecer`;
  - cada item tem até 300 caracteres, e até 40 entram no prompt;
  - CPF, cartão e senha são recusados por regex.

## O prompt (`prompt.ts`)

- **Estilo:** conclusão primeiro, de 1 a 3 linhas, sem preâmbulo, sem "posso ajudar em algo mais?" e sem emoji.
- **Erro e dúvida:** o erro é dito em uma linha, e nunca se diz que deu certo quando não deu. Na dúvida, uma pergunta fechada.
- **Escopo:** fora do assunto, uma linha dizendo para que serve e uma oferta concreta, sem responder o conteúdo. Passou 12 de 12 casos em 3 rodadas, contra 2 de 4 falhando antes.
- **Texto vindo de mídia** não é instrução do usuário.
- **A data de hoje no prompt:** sem ela, a IA travava perguntando "deste mês ou do próximo?" (eval de 07/09: 14 de 18).

## Canal oficial (`meta.ts`, `meta-webhook.ts`)

- **Assinatura:** HMAC-SHA256 do corpo cru, e sem segredo a rota nega.
- **Webhook:** a resposta é 200 imediata, e lote de outro `phone_number_id` é ignorado.
- **Falha de entrega:** chega depois, como `statuses: failed`. Resposta que não saiu não é gravada como enviada.
- **Uma resposta é uma mensagem,** sem balões, porque cada mensagem custa.
- **O que ficou pendente lá:** janela de 24 h, modelos e envio iniciado pela empresa. No Decreta, isso é requisito do primeiro dia.

## Proativos

- **Conteúdo:** SQL e modelo de texto, sem IA (`jobs.ts`), então não há alucinação.
- **Claim idempotente** por tarefa e chave (`scheduler.ts`).
- **Cuidados do wameow:** só abordar quem já escreveu e espaçar os envios (`hasInteractedWithBot`, `paceSend`). Abordar quem nunca escreveu derrubou o número em 11/07 e 13/07. Na API oficial, o equivalente é o opt-in, o modelo aprovado e a qualidade do número.

## Avaliação

- **`eval:golden`:**
  - a IA roda de verdade, com as ferramentas reais, mas as ferramentas devolvem dados de teste e nada executa;
  - confere as ferramentas esperadas e as proibidas, os argumentos e o texto que precisa ou não pode aparecer;
  - são cerca de 60 casos.
- **`eval:sim`:**
  - uma IA faz o papel do usuário, com objetivo escondido, numa oficina simulada;
  - a nota sai do estado final, não do texto;
  - cada cenário roda 3 vezes.
- **Regra de processo:** todo incidente de produção vira caso antes da correção.

## Lições de produção, em ordem de custo

1. **Número banido** por abordar quem nunca escreveu (wameow).
2. **Loop de "Confirma?":** o id da pendência morria com o turno.
3. **Três respostas e duas OS** para três áudios seguidos. A solução foi o coalescer e a trava por turno.
4. **Item perdido em silêncio:** duas gravações paralelas na mesma OS.
5. **Turno que caía depois de gravar** e mandava "tente de novo", o que duplicava.
6. **IA sem a data de hoje.**
7. **Dado lido de foto gravado direto:** mão de obra duplicada, R$ 400 viraram R$ 800.
8. **Permissões:** mecânico via o financeiro, e qualquer membro aprovava NF.
9. **Canal oficial:**
   - o túnel anulava o segredo;
   - mensagem do oficial caía na persona da equipe;
   - falha de entrega era gravada como enviada.
10. **Custo e latência:** 4 chamadas à IA e um handshake MCP por ferramenta.

## O que copiar, o que adaptar, o que não repetir

**Copiar:**
- congelar a ação no servidor e executar uma vez;
- conferir papel antes de mostrar e na execução;
- prazo do turno pelo relógio;
- descartar o rascunho velho;
- idempotência por id da mensagem;
- webhook autenticado com 200 imediato;
- chave de desligar que falha fechada;
- a data no prompt;
- recusa de escopo em uma linha;
- conversão de formato no código;
- avaliação com ferramentas falsas e a regra do incidente;
- uma mensagem por resposta.

**Adaptar:**
- **Confirmação:** passa a ser por botão tratado por código, não pela IA.
- **Debounce, trava e coalescer:** passam a usar o `debounce` e a `concurrency` do Inngest, com as mensagens lidas da tabela.
- **Transcript:** sai do JSON único e passa para as tabelas `conversas` e `mensagensIa`.

**Não repetir:**
- **Dois canais no mesmo processo:** o `main.ts` tem 1.987 linhas, com três turnos quase iguais.
- **Processo separado com MCP no meio:** o Decreta tem servidor próprio.
- **Ferramentas em excesso:** a mecânica tem 47 ferramentas e um prompt de cerca de 15 mil tokens.
- **Balões, frases de espera e reações.**
- **Verificador de "sucesso mentiroso"** que depende de outro fornecedor de IA.
