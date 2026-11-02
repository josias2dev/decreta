# Revisão de segurança, lógica e bugs — 1º de novembro de 2026

Revisão de tudo o que entrou de `b0f565b` a `099097e` (36 commits: Fase 0, Fase 1 com o 1.3, Fase 3, Fase 4, Fase 5 e o radar de precedentes). Seis revisores leram o código por área (superfícies públicas, isolamento entre escritórios, fontes externas, camada de IA, cálculos e telas), cada achado foi conferido no código antes de entrar aqui, e o que era crítico, alto ou rápido foi corrigido nos commits `d3da44a`, `7124bda`, `bd65ed5`, `3449701` e `5734952`. Depois das correções: 494 testes do servidor e 190 de tela passam, tipos limpos.

Não houve achado **crítico**: a RLS cobre todas as tabelas de domínio, nenhum caminho cruza escritórios, os segredos ficam só como hash no banco e a IA não alcança nenhuma ação com efeito sem um clique humano.

## 1. Corrigido

### Rotas sem login (link de envio do cliente, conector MCP, convite)

| Gravidade | Achado | Correção |
|---|---|---|
| Alto | O teto de 20 arquivos por link era lido antes e incrementado sem condição: envios ao mesmo tempo furavam o teto, e cada foto enfileira leitura por IA. | Vaga reservada de forma atômica (`update … where recebidos < 20 returning`) antes do trabalho pesado; a vaga volta se o envio falhar antes de o documento existir. Testado com 5 envios simultâneos. |
| Alto | O upload público lia o arquivo inteiro (até 45 MB) em várias cópias na memória, sem teto próprio nem limite de envios paralelos; a API tem `MemoryMax=400M`. | Teto de 20 MB pelo link, recusado antes de ler (`bodyLimit`), e no máximo dois envios ao mesmo tempo (503 "ocupado" além disso). |
| Médio | O tipo do arquivo vinha só do cabeçalho do cliente; o nome ia sem tratamento para a pasta e para o download. | O tipo sai da assinatura dos bytes (JPEG, PNG, WebP, PDF); o nome perde caracteres de controle e separadores de pasta, é cortado em 120 e ganha a extensão do tipo real. |
| Médio | Sem limite de tentativas por endereço: cada segredo ou token bem formado abria uma transação no banco. O Caddy não limita taxa. | Limitador em memória por IP na própria API: 60/min em `/api/envio`, 120/min em `/api/mcp`, 30/min em `/api/convites` (429 com `retry-after`). |
| Médio | O segredo do link ia para o log da API (`c.req.path` no erro 500), para o log de acesso do Caddy e para o Sentry do navegador (URL da página e migalhas de `fetch`); link vencido virava evento. | O erro 500 grava a rota (`/api/envio/:org/:segredo`), não o caminho; o Caddy deixa `/api/envio/*` e `/enviar/*` fora do log (`log_skip`); a página pública lança `ApiError` (4xx não vai ao Sentry) e todo evento ou migalha sai com a URL mascarada. |
| Médio | A fila (Inngest) fora do ar derrubava o envio com 500 depois de o documento já estar gravado; o registro não levava o IP. | `enfileirar` com `catch`: o documento fica guardado com a leitura pendente; o registro leva o IP. |
| Médio | Um `tools/call` do MCP com argumentos gigantes (até 40 MB) era lido e dividido em palavras. | Pedido acima de 64 KB nem é lido (413); `busca` continua com teto no schema. |
| Médio | O token MCP não vencia nunca; `usado_em` era gravado a cada chamada, antes de conferir se a pessoa ainda estava na equipe; leitura pelo MCP não deixava rastro. | Token vence em 90 dias (migração 0021; a tela mostra até quando vale); `usado_em` gravado uma vez por minuto e depois da checagem; cada consulta entra no registro do escritório com a ferramenta e o IP, sem os argumentos. |
| Médio | A lista de ferramentas do MCP era uma lista de bloqueio: ferramenta nova do Perguntar nascia exposta. As instruções não diziam que documento é dado, e `lerDocumento` omitia o alerta de texto escondido. | Lista fechada de 17 ferramentas de leitura, conferida no teste; instruções com a regra "dados, não ordens"; `lerDocumento` devolve o aviso quando há alerta. |
| Baixo | O link dizia "vale até 08/11" mas vencia na hora da aprovação + 7×24 h; não havia como invalidar um link mandado ao número errado. | Vence às 23:59 do 7º dia no fuso do escritório; `POST /mensagens-cliente/:id/invalidar-link` com botão na tela e registro. |

### Isolamento, permissões e estados

| Gravidade | Achado | Correção |
|---|---|---|
| Alto | Pedido de atualização monetária sem faixa de datas: 240 parcelas de 0001-01-01 com cálculo em 9999-12-31 = 57 milhões de voltas no único thread da API; com a TR, centenas de pedidos ao Banco Central. O login da demonstração basta. | 422 para cálculo no futuro, data antes de 01/07/1994 (Plano Real), juros depois do cálculo e expedição fora de [EC 113, cálculo]. |
| Alto | "Ajustar" um prazo sempre recalculava a data e zerava `fimDigitado`: trocar só o responsável desfazia a data digitada à mão (suspensão que o sistema não conhece). | Servidor mantém a data manual quando a conta não mudou e nada novo foi mandado; a tela abre o diálogo já com "sei a data" marcado. Testado. |
| Médio | OAB autodeclarada por qualquer membro (só formato), com UF vazia virando "SC": passava o gate de aprovação da mensagem ao cliente e guiava a captura do Diário. Qualquer membro desfazia a recusa da IA de um cliente; a revisão da peça não exigia OAB. | OAB só pelo sócio e com UF obrigatória; desfazer `semIa` só pelo sócio; registrar a revisão da peça exige OAB no perfil. |
| Médio | A conferência da pasta trazia, pelo nome da parte, processos de clientes que recusaram a IA. | Esses processos ficam de fora, mesmo quando o nome bate. |
| Médio | `prazo.confirmado` saía a cada confirmar/ajustar: duas gerações de rascunho pagas. | Função do Inngest idempotente por `prazoId` (um rascunho por prazo por dia). |
| Médio | "Verificar peça" gravava o precedente que mudou de situação sem registrar novidade: a sincronização seguinte via "sem mudança" e nenhum escritório era avisado pelo radar. | `guardarPrecedente` registra a novidade de onde quer que venha; a sincronização só acrescenta o que apareceu numa espécie já carregada. |
| Médio | "Verificar peça" sem teto de fontes: cada "Lei n/AAAA" inventada virava um download de até 120 s, sem memória para a mesma lei inexistente citada várias vezes. | Teto de 30 pedidos às fontes por peça (o que passa fica "sem conferência; verifique de novo") e memória por lei dentro da mesma verificação. |
| Baixo | `?processo=`, `?cliente=`, `?prazo=` fora do formato UUID davam 500. | 400 com `id_invalido`. |
| Baixo | `POST /avisos/teste` mandava WhatsApp real na demonstração. | 403 na demonstração. |
| Baixo | "constructor" e "toString" passavam como nível de automação (`in` no lugar de `hasOwn`). | `Object.hasOwn`. |
| Baixo | A mensagem ao cliente podia sair vazia (só cabeçalho e rodapé). | Mínimo no schema da IA e 422 na rota. |
| Baixo | O laço de páginas do BNP não tinha teto: um BNP que ignorasse a página pedida prenderia a sincronização. | 200 páginas no máximo, com erro claro. |

### Camada de IA

| Gravidade | Achado | Correção |
|---|---|---|
| Médio | `citar` aceitava qualquer chave bem formada: "só chaves que vieram da busca" era regra só de prompt, e uma chave inventada virava cartão com trecho inventado. | A busca anota as chaves que devolveu nesta resposta; `citar` com chave fora delas é erro de ferramenta. Testado. |
| Médio | Sem teto de `citar` por resposta (cada uma custa uma consulta e um passo de IA) nem memória para pedido repetido. | Teto de 12 por resposta e memória por (chave, trecho, afirmação); a tela não duplica o cartão. |
| Médio | O trecho era conferido contra tese + questão julgada, mas a tela mostra só a tese: a questão virava "verificada". | Conferido só contra a tese guardada. |
| Médio | "[3]" no texto sem citação conferida ficava como texto solto; a afirmação e o trecho entravam no prompt do segundo passo entre `"""` sem neutralizar `"""` dentro deles. | "[n]" órfão vira citação "não verificada" (só no modo Jurisprudência); aspas triplas são trocadas; a varredura das citações roda também na resposta que parou no meio. |
| Médio | A peça da outra parte (o documento mais hostil do sistema) entrava inteira, sem corte e sem o alerta de texto escondido; os pontos a rebater entravam no prompt da peça sem rótulo. | Cortada no teto, marcada como dado com o alerta quando há; os pontos a rebater entram rotulados como dados. |
| Baixo | O método novo `mensagem-cliente` ia ao gateway com nome que ele não conhece: a mensagem ao cliente falharia em produção. | Mapeado para um método conhecido, como os demais novos. |

### Cálculos e núcleo

| Gravidade | Achado | Correção |
|---|---|---|
| Alto | Juros corriam desde `jurosDesde` mesmo para parcela que venceu depois: 11 meses no lugar de 2. | Início dos juros = máx(início pedido, vencimento); a memória diz que os juros contam por mês cheio, sem pro rata, e nunca antes do vencimento. Testado com números à mão. |
| Alto | Expedição do requisitório sem validação: aplicava "IPCA + 2% (EC 136/2025)" a meses antes da emenda e, com expedição antes de 12/2021, corrigia o mesmo mês duas vezes. | Faixa validada na rota; requisitório expedido antes de 10/2025 ganha ressalva na memória para o advogado conferir o regime até a emenda. |
| Alto | ReDoS: "art. 5" seguido de 3.200 espaços levava 8,6 s na extração de citações (teto da peça é 400 mil caracteres; entra por `POST /pecas/:id/verificar` e pelo texto da IA); quadrático também na data do previdenciário. | Todo `\s*` ao redor de partes opcionais virou `\s{0,3}`; teste com 20 mil espaços em menos de 500 ms. |
| Alto | "CPC/73", "CC/16" viravam o código vigente: "art. 159 do CC/16" saía "verificada, em vigor" com o art. 159 do CC/2002. | Sigla própria (`CPC-1973`, `CC-1916`) e selo "com ressalva: código revogado, confira o artigo correspondente". |
| Baixo | Juros ao mês "1,5." ou vazio na tela viravam 0% em silêncio. | Validação na tela e botão desabilitado. |

### Telas

| Gravidade | Achado | Correção |
|---|---|---|
| Médio | Link externo escrito pela IA em markdown escondia o destino (injeção num PDF poderia gerar um link de golpe com rótulo inocente). | O domínio aparece ao lado do rótulo. |
| Baixo | "Aprovar e enviar" reabilitava antes do refetch: segundo toque dava 409 com toast de erro logo após "enviada". | A invalidação devolve a promessa; o botão só reabilita com a lista nova. |
| Baixo | O `catch` de "linha cortada" do stream engolia também erro ao tratar o evento (resposta incompleta sem erro e sem Sentry). | Só o `JSON.parse` fica no `catch`. |

## 2. Ainda em aberto (por gravidade)

### Médio

- **Histórico da conversa reenvia dados de cliente que depois recusou a IA.** As partes de ferramenta guardadas (processo, publicação, documento) voltam ao modelo na pergunta seguinte sem rechecar `semIa`; a rota só checa o processo-foco. Correção: ao montar o histórico, descartar ou mascarar partes ligadas a cliente `semIa` (`rotas/ia.ts`, `packages/ia/src/assistente.ts`).
- **Rascunho automático do prazo fora do teto de gasto do site.** Roda com `origem: "fundo"`, e `gasto_da_ia_no_site` soma só `tela`; é a geração mais cara e o disparo é de usuário. A idempotência reduz repetições, mas o gasto ainda não entra no teto. Correção: contar esse tipo de fundo no teto do site (`servicos/uso-ia.ts`, `inngest.ts`).
- **`/ia/transcrever` e `/ia/atendimento` só checam `semIa` quando a tela manda `clienteId`.** Áudio gravado antes de escolher o cliente vai ao modelo. Decisão de produto: exigir o cliente antes de transcrever, ou aceitar.
- **Tokens MCP não são revogados ao trocar a senha nem quando a pessoa sai e volta à equipe;** o sócio não lista nem revoga tokens de membros. Correção: revogar em `changePassword` e na remoção do membro; tela de tokens da equipe para o sócio.
- **PJe-Calc: resumo parcial sem aviso.** Qualquer PDF com "resumo do cálculo" vira cálculo com campos nulos; "1234,56" lê 234,56; "31/02/2026" passa; honorários somam linhas do reclamante. Correção: exigir `totalReclamado`, `ehDia` nas datas, âncoras de número e conferência da soma (`packages/core/src/pjecalc.ts`).
- **Higiene de documento:** `&#x110000;` faz `fromCodePoint` lançar e a varredura grava `alertas: []` em silêncio; U+200B dentro de "Ignore" e o bloco Unicode Tags passam. Correção: achado `varredura_falhou` e remoção de zero-width antes de comparar (`packages/documentos/src/higiene.ts`).
- **DOCX sem teto descomprimido:** 204 KB expandem a 60 MB e 6 s; `<w:p>` sem fechar é quadrático. Correção: teto do descomprimido e de páginas na leitura.
- **Tabela previdenciária sem fim de vigência:** `parametrosPrevidenciarios("2027-03-01")` devolve os valores de 2026 sem aviso. Correção: `null`/"desatualizado" além do último ano e teste que falhe em janeiro.
- **Revisional:** o tópico diz "o Banco Central divulgou a taxa média", mas é a média simples feita pelo sistema das taxas semanais do mês, não a da data do contrato. Correção: dizer "média aritmética simples de N taxas semanais" e pedir a data da contratação.
- **Cálculos na peça:** entra sempre o último cálculo de cada tipo (um cenário exploratório substitui o oficial) e o prompt diz "conferidos pelo advogado" sem campo de conferência. Correção: marcar o cálculo que vai à peça.
- **Extração de citações:** falsos negativos ("arts. 186 e 927 do CC", "Súmulas 7 e 83 do STJ", "Súmula 331, IV, do TST", "Lei nº 8.213, de 24 de julho de 1991") e falsos positivos ("o sistema 12 do STJ" → Tema 12, "CCB" → Código Civil). Correção: enumerações e exigir a palavra "Tema".
- **`enviada` é gravada antes de o WhatsApp aceitar:** deploy no meio deixa "enviada" sem envio e trava o reenvio (409). Correção: estado "enviando" com retomada.
- **Dependências:** `zod` 3.25 (via `inngest`, `better-auth` e `ai-sdk`) tem advisory alto de esgotamento de memória em coleções grandes; o corpo já é limitado a 45 MB no Caddy e a 64 KB no MCP. `esbuild` antigo é só de desenvolvimento; `glob`/`minimatch` são transitivos do `inngest`. Acompanhar as atualizações do `inngest`.

### Baixo

- Arredondamento em ponto flutuante: 1.001,00 × 3,5% = 35,035 → 35,03 (certo: 35,04); o fator com 6 casas na memória não refaz a conta exata; regime fazenda ignora `jurosDesde` mas a memória diz "juros desde". Correção: contas em centavos inteiros.
- Média 0 na revisional → "∞ vezes"; `Number("")` no SGS vira 0 e "R$ NaN" com 201; Olinda sem `segmento` mistura PF e PJ (a tela sempre manda); conferência da pasta sem prazo em dobro (CPC 180/183/186).
- `analises.ts` leva `err.message` (que pode embutir JSON derivado de documento de cliente) ao log e à tela; o `catch` do passo "sustenta" não loga; `lerPecaContraria`, `mensagemAoCliente` e a transcrição não recebem `AbortSignal`; `buscarJurisprudencia` devolve até 20 teses inteiras.
- `href` de fonte externa sem checar o esquema (`citacoes-da-resposta`, `verificacao-da-peca`, `radar-do-processo`, `publicacoes`, `prazo`); o CSP já barra `javascript:`. Correção: `urlHttps()` na ingestão (`normas.ts`, `djen.ts`) e na tela.
- Sair da conta com resposta chegando não aborta o stream (`conversa-ia.tsx`); no dev com StrictMode o fundo ASCII some (`loseContext`).
- Página pública de envio: recarregar apaga a lista de enviados (a API devolve `recebidos`); sem "Enviando…"; sem checagem de tamanho no cliente antes de subir; sem e2e para 410 e 429.
- `anexar` duas vezes cria segundo documento e troca o `documentoId` do relatório PJe-Calc; o radar corta em 100 avisos sem avisar; INSERTs com `processoId`/`clienteId`/`responsavelId` de fora não conferem o escritório (a RLS impede a leitura, mas apagar no outro escritório anula linhas deste).
- A revisão das fontes externas (DJEN, DataJud, SGS/SIDRA/Olinda) travou antes de terminar; o que conferi à mão: todo `fetch` tem timeout, a busca no acervo é parametrizada, a demonstração não sai à rede. Fica por fazer uma leitura dedicada de `djen.ts`, `datajud.ts` e `captura.ts`.

## 2.1. Cadastro aberto (publicado no mesmo dia)

Corrigido na revisão, antes de publicar:

- **Número e e-mail do Decreta como relé:** a conta nasce sem ninguém conferir quem é, e a OAB é só declarada. Sem teto, dava para mandar texto livre a qualquer telefone pelo WhatsApp do Decreta e convites a qualquer e-mail, com o nome do escritório escolhido por quem cadastrou. Agora o escritório do cadastro nasce **em avaliação** (`organization.em_avaliacao`): até 10 mensagens de WhatsApp e 5 convites por dia, e no máximo 60 e 30 somando todos os em avaliação. Ver `servicos/em-avaliacao.ts`.
- **IA do site esgotada por contas novas:** duas contas gastavam o teto diário do site inteiro. Em avaliação, o escritório fica no mesmo teto da demonstração (US$ 0,50 por dia).
- **Sessão forçada por outro site:** um formulário de fora podia criar a conta e abrir no navegador da vítima a sessão do atacante. `/api/cadastro` agora recusa formulário de outra origem e corpo acima de 16 KB, e a senha vai até 128 caracteres.

Para liberar um escritório: `update organization set em_avaliacao = false where slug = '...'`.

Em aberto:

- **Médio — e-mail não confirmado:** dá para cadastrar com o e-mail de outra pessoa. Ela recupera a conta pela redefinição de senha, que derruba as sessões, mas a verificação em duas etapas ligada por quem cadastrou continua e a tranca do lado de fora. Confirmar o e-mail antes de abrir a conta resolve.
- **Médio — leitura de publicações em segundo plano:** não passa pelos tetos do site. Uma conta nova que declare uma OAB com muitas publicações gasta IA até o teto do projeto no gateway, e aí a leitura para para todos os escritórios.
- **Baixo — volume por conta nova:** não há teto de OABs consultadas no DJEN nem de espaço em documentos.
- **Baixo — e-mail já cadastrado:** o 409 revela que o e-mail tem conta; só o limite de 10 pedidos por hora por endereço segura a enumeração.

## 2.2. Mensagem ao cliente marcada como enviada sem ter saído (corrigido no mesmo dia)

A mensagem virava "enviada" antes de o WhatsApp responder. Se o servidor caísse nesse intervalo, ela ficava como enviada sem ter saído, e o escritório achava que o cliente tinha sido avisado. Agora ela fica em "enviando" até a resposta. Sem resposta em 20 segundos, ou com o envio interrompido há mais de 1 minuto, a tela pede para conferir a conversa e o Decreta não reenvia sozinho, para o cliente não receber duas vezes. O link de documentos abre enquanto ninguém sabe se saiu, porque o cliente pode ter recebido, e fecha quando a pessoa diz que não saiu.

Em aberto:

- **Baixo — onde o aviso aparece:** a conferência só aparece no prazo ou na ficha do cliente, não no Hoje.
- **Baixo — queda de conexão no meio do envio:** só o tempo esgotado conta como "pode ter saído". Uma conexão cortada depois de o pedido chegar ao WhatsApp ainda vira "falhou" e oferece reenviar.

## 2.3. Publicação que a IA não leu passava despercebida (corrigido no mesmo dia)

A falha só aparecia no selo da lista de publicações, e no Hoje apenas nas três primeiras novas. Uma publicação cuja rotina de fundo não rodou ficava para sempre em "IA lendo", sem botão para tentar de novo. Agora o Hoje e o resumo da manhã contam as publicações novas sem leitura: falha da IA, falta de teor e nenhuma leitura uma hora depois de chegar. Cliente sem IA, publicação cancelada e servidor com a IA desligada não contam. A publicação parada mostra que a IA não conseguiu ler e oferece "Ler de novo".

A rotina `reler-publicacoes` roda de hora em hora e relê sozinha o que falhou: a espera dobra a cada falha (1, 2, 4, 8 e 16 horas), até seis falhas, e são no máximo 20 por escritório a cada rodada. Falta de teor, cliente sem IA, publicação cancelada e a demonstração ficam de fora.

Em aberto:

- **Baixo — leitura da sentença:** a rotina `reler-publicacoes` cobre a sugestão de prazo. A leitura da sentença que falhou continua esperando alguém pedir.
- **Baixo — seis falhas:** depois disso a rotina desiste, com o aviso no Hoje e o botão "Ler de novo". Uma falha de mais de um dia precisa de alguém.

## 2.4. De onde veio cada resultado da IA (corrigido no mesmo dia)

Não dava para responder "o que gerou este prazo errado?": o modelo pode mudar no painel do gateway sem deploy, e nada guardava qual respondeu. Agora as análises (sugestão de prazo, briefing, resumo dos autos, audiência, leitura da sentença e conferência da pasta), as peças, as revisões de peça e as mensagens ao cliente guardam em `procedencia` o commit em uso e, em cada chamada, o alias, o modelo que respondeu e a impressão das instruções. O texto do caso não entra na impressão. Quem falhou também fica registrado, sem modelo.

Em aberto:

- **Baixo — sem tela:** a procedência só é lida por consulta ao banco.
- **Baixo — fora do registro:** o Perguntar, a leitura de documentos, a conferência de citações e a transcrição de áudio ainda não guardam a procedência.
- **Baixo — resultados antigos:** o que foi gerado antes desta mudança fica sem procedência.

## 2.5. Testar modelo ou prompt novo sem risco (modo observar)

Trocar o modelo da sugestão de prazo era aposta: a régua fixa do conjunto-ouro não cobre o que chega de verdade. Com `MODELO_OBSERVAR` preenchido, o candidato lê as mesmas publicações em paralelo, depois da leitura atual. A leitura dele fica em `observacoes_da_ia`, sem virar prazo nem aparecer em tela, e `bun run observacao` compara as duas com o que as pessoas decidiram (só contagens). Para testar um prompt novo, preencha `INSTRUCOES_DO_PRAZO_EM_OBSERVACAO` em `packages/ia/src/acoes.ts`.

Vem desligado. Cliente que recusou a IA e a demonstração nunca vão ao candidato.

Em aberto:

- **Médio — mesmo teto:** a observação gasta do teto do projeto no gateway, o mesmo que lê os prazos de verdade. O limite é de 30 leituras por escritório por dia e o gasto fica à parte em `uso_ia` (`observar-prazo`), mas um teto apertado no gateway pode ser consumido por ela.
- **Médio — outro fornecedor:** o teor das publicações e o contexto do processo vão também ao modelo candidato. Confira a política de dados dele (ZDR) antes de ligar.
- **Baixo — só o prazo:** o resumo, o briefing e a peça não têm observação.
- **Baixo — o que é acerto:** o placar compara se gera prazo, os dias e a contagem. O descarte de um prazo conta como "não gera", mesmo quando o motivo foi outro.

## 3. Depende de você

- **Cobrança e duração do acesso de contas novas:** hoje o cadastro não tem período de teste nem pagamento, e o escritório em avaliação fica assim até alguém liberar à mão.

- **`BACKUP_KEY` vazia no `.env` do servidor:** o timer `decreta-backup` está desligado e o serviço falha ("expected string to have >=40 characters"). Criar uma chave com 40 caracteres ou mais, guardá-la fora do servidor, e ligar o timer (`sudo systemctl enable --now decreta-backup.timer`). Até lá, o backup é só o manual que faço antes de cada deploy (`/var/backups/decreta/`).
- **Chave de deploy do GitHub:** não instalada (a instalação em `authorized_keys` foi barrada). O workflow `deploy.yml` segue sem uso.
- **Decisões de produto** listadas acima em "Ainda em aberto": transcrição sem cliente, histórico e `semIa`, prazo em dobro.
