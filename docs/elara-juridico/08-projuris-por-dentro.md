# Projuris ADV por dentro

Análise feita em 02/11/2026 na conta de teste do Projuris ADV (7 dias, 100 créditos), aberta no Chrome, com leitura das telas e uso com dados fictícios.

**Limite principal:** nenhum processo real entrou na conta. Não vimos intimação chegando, andamento vindo do tribunal, monitoramento, cálculo de prazo a partir de intimação nem a visão do cliente. A seção "O que não foi visto" lista o que ficou de fora.

## Conclusão

- **Amplitude:** é um sistema completo e bem organizado: contencioso, financeiro com repasse, contratos de honorários, workflow, timesheet, relatórios e portal do cliente.
- **Falha mais grave:** a peça gerada por IA **não usou a petição anexada**. Ela afirmou que o autor não alegava perda de evento, mas a petição cita uma reunião familiar.
- **Prazos:** o sistema aceita prazo fatal em feriado sem avisar. A lista de feriados não tem 20/11 nem o recesso forense, e por isso um modelo de contestação marcou o protocolo um dia antes do que nossa conta indica.
- **Assistente de IA:** leu o PDF corretamente quando apontei o arquivo dentro do processo, mas fez muitas perguntas antes de responder e não entregou nenhum julgado.
- **Preço:** é montado por módulo, sem pacote fechado. Financeiro, workflow e cobrança são itens à parte.

## Mapa do produto

| Módulo | O que tem |
|---|---|
| Painel de Controle | Visão pessoal ou do escritório; contadores de tarefas, intimações, andamentos, audiências e compromissos; agenda por mês, semana e dia, com feriados; exportação para calendário (.ics) |
| Atividades | Lista com tarefas, audiências e compromissos; painel (minhas tarefas, delegadas, da semana); kanban com vários quadros |
| Processos | Cadastro simples, avançado ou automático por CNJ; judicial ou extrajudicial; filtros Incompletos, Movimentados e Parados; ações em lote |
| Intimações | Lista, descartadas e captura, com lista de tribunais e diários disponíveis |
| Monitoramento (Push) | Captura individual ou em lote pela OAB, com franquia e lista de tribunais |
| Andamentos processuais | Tela própria, reunindo os andamentos |
| Pessoa | Física ou jurídica, com ficha de telefones, endereços, processos, atendimentos, tarefas, documentos e comentários com @ |
| Atendimento | Assunto, data, situação, cliente, descrição, marcadores e responsáveis |
| Financeiro | Receitas e despesas, extrato, conciliação bancária, solicitações, contratos de honorários e cobranças |
| Relatórios | Gestão, atividades, processos e financeiro, gerados e guardados em uma lista |
| Produtividade | Workflow, timesheet com cronômetro no cabeçalho e dashboards |
| Documentos | Arquivos e modelos, com biblioteca pronta (trabalhista, cível, consumidor, família, contratos) |
| Projuris IA | Dentro do processo: criação de documentos, prognóstico jurídico e resumo de petição inicial |
| Assistente de IA | Chat em beta em todas as telas, ciente do módulo aberto, com anexos e consulta aos dados da conta |
| Configurações | Cadastros gerais, importação, notificações, área do cliente e registro de acessos |
| Marketplace | Acordos, Peticiona e Jurimetria, oferecidos à parte |

No cabeçalho ficam busca geral, atalho "Novo" (processo, tarefa, compromisso, pessoa, atendimento), Assistente de IA, cronômetro e notificações.

## Detalhes que importam

### Processo

- **Processo "Incompleto":** salva mesmo sem os obrigatórios. Antes de salvar, a tela lista o que falta (no teste, só o órgão), oferece "Salvar mesmo assim" ou "Corrigir", e o processo ganha um marcador e um filtro próprios.
- **Campos:** numeração CNJ e complementar, situação, assunto, descrição, marcadores, pastas, unidade organizacional, responsável, grupos, endereçamento (justiça, instância, órgão), datas (distribuição, citação, recebimento, arquivamento, encerramento), área, fase, classe e assunto do CNJ, segredo de justiça.
- **Pedidos e risco:** valor da ação, valor provisionado, provisionamento, risco e probabilidade de êxito ou perda.
- **Extrajudicial:** é uma aba do mesmo formulário, com número livre e cadastro próprio de órgãos. Não vi etapas ou situações específicas.
- **Pesquisa de jurisprudência:** um botão ao lado do assunto leva ao site do Jusbrasil. Não vi busca própria.

### Tarefa e prazo

- **Campos:** tipo de vínculo (sem vínculo, atendimento, intimação, pessoa, processo, receita ou despesa), tipo de tarefa, título, data base, data prevista, data fatal, horas, local ou link, descrição, responsável, grupos e opção de mostrar no kanban.
- **Conta nova sem tipos:** a lista de tipos de tarefa vem vazia, e o tipo é obrigatório. Dá para criar na hora, digitando o nome.
- **Tipos de tarefa:** a configuração diz aceitar prazo padrão e responsáveis. Não testei.
- **Cálculo de prazos:** é item de franquia. Segundo a tela de contratação, parte das intimações e considera norma, tribunal e tipo de processo. No formulário de tarefa não há contagem de dias. Não testei, porque precisaria de uma intimação real.

### Feriados

- **Boa parte:** a lista vem pronta, com feriados móveis por ano, e aceita feriados municipais e estaduais. A tela não mostra o ano; pelas datas de Carnaval, a lista parece ir de 2016 a 2030.
- **Lacuna:** a busca por "Consci", "Zumbi" e "Recesso" não trouxe nada, e o dia 20/11 aparece sem marcação na agenda. Esse feriado é nacional desde a Lei 14.759/2023.

### Workflow

- **Etapas:** criar tarefa, com prazo previsto e fatal em dias a partir do início. A etapa seguinte pode começar quando a anterior for concluída com sucesso.
- **Modelos prontos:** vi quatro: Embargos de Declaração, Audiência (Trabalhista), Petição Intermediária (Trabalhista) e Contestação.
- **Gatilho:** manual no modelo de Contestação, e o fluxo criado nasce desabilitado.

### Financeiro

- **Lançamento:** cliente, responsável, unidade, tipo de documento, datas de exercício e emissão, vínculo, itens com plano de contas e centro de custo, recorrência e condição de pagamento.
- **Formas de pagamento:** boleto (com código de barras), cartão de crédito e débito, cheque, depósito, dinheiro, duplicata, débito em conta, Pix e transferência.
- **Repasse:** um ou mais favorecidos, cada um com taxa em percentual ou valor, vencimento, conta e forma de pagamento. Em lançamento parcelado, vale a mesma taxa em todas as parcelas.
- **Contratos de honorários:** tipo, vigência, mês e índice de reajuste, partes, vínculos, valor de entrada e regras de cobrança.
- **Outros recursos vistos, não testados:** cadastro de lançamento via documento, conciliação bancária, reembolsos e avisos de boleto novo, cancelado ou com erro.

### Portal do cliente

Cada cliente recebe login e senha. As permissões são separadas para atendimento e processo: arquivos, andamentos, horas, dados básicos, lançamentos financeiros e tarefas.

### Administração

- **Notificações:** matriz por evento com dois canais, sistema e e-mail. Não vi WhatsApp nessa matriz.
- **Importação:** planilhas XLSX de até 5 MB e 20.000 linhas, com modelos para baixar e uma ordem indicada (pessoas, processos, andamentos, tarefas). Roda agendada e avisa ao terminar. O texto da tela avisa que um registro já existente será duplicado.
- **Segurança:** verificação em duas etapas, registro de acessos com data, login e IP, perfis, permissões, grupos e unidades organizacionais.
- **Privacidade:** "Excluir dados" e "Solicitar cancelamento" ficam na própria conta. Não acionei nenhum dos dois.
- **Integrações:** webhooks nos cadastros. Não testei.

## Teste com dados fictícios

### Cadastros

A entrada passa por uma janela que exige OAB e não fecha. Usei o número fictício 999999/AC, com as duas capturas desmarcadas, e pulei o convite de colegas. Depois criei cliente, processo e tarefa sem dificuldade, e o processo sem órgão entrou como "Incompleto".

### Prazo em feriado

Criei uma tarefa com previsão e data fatal em 15/11/2026, domingo e Proclamação da República. **Não houve aviso**, embora a agenda do próprio sistema mostre o feriado nesse dia.

### Contagem do modelo de Contestação

A prévia, aberta em 02/11/2026, prometia "15 dias úteis". A conta conferida:

| Etapa | Regra | Data fatal |
|---|---|---|
| Elaborar contestação | +10 dias | 16/11/2026 |
| Revisar contestação | +12 dias | 18/11/2026 |
| Protocolar contestação | +15 dias | **23/11/2026** |

A contagem é em dias úteis e pula fins de semana. Mas trata 20/11 como dia útil: começando em 03/11 e pulando esse feriado, o 15º dia seria **24/11**. O erro antecipa a data, o que é o lado seguro, mas o sistema afirma uma conta que está errada. O modelo também parte do início do fluxo, então a data correta depende de quem inicia o fluxo no dia certo.

### Peça com IA

Pedi uma contestação com a petição fictícia em PDF, a mesma usada no [teste do Astrea](06-astrea-por-dentro.md), anexada no campo próprio para contra-argumentação. O fluxo é uma descrição livre, sem perguntas, e abre um editor com chat de ajustes. A peça sai em cerca de 1 minuto e é salva no processo em .docx, com opção de baixar em .docx ou PDF.

| Aspecto | Resultado |
|---|---|
| Leitura do PDF | **Não usou.** Valor, datas, reunião familiar e contatos por telefone ficaram de fora; só apareceu o que digitei na descrição |
| Contradição | Diz que não há alegação de fatos excepcionais, como perda de evento; a petição alega a reunião de 27/09/2026 |
| Fatos sem base | Afirma problema logístico já regularizado, produto em perfeitas condições, suporte prestado e alternativas oferecidas |
| Dados do processo | Não usou: autor, ré, vara e número ficaram como lacunas entre colchetes, apesar do aviso de que consideraria os dados cadastrados |
| Ré pessoa jurídica | Correto, porque eu informei na descrição |
| Julgados | Nenhum citado; só afirma "jurisprudência consolidada do STJ" sem indicar decisão |
| Normas | Súmula 362 do STJ, CDC e CPC citados de forma coerente; não confirmei cada um em fonte oficial |
| Resumo no chat | Menciona o art. 944 do CC, que não está no texto da peça |

Quando pedi no chat que usasse os fatos da petição anexada, a resposta foi que ela não havia sido anexada, e nenhum fato foi inventado nessa resposta. **Ressalva:** anexei por ferramenta automática, sem usar a janela de arquivos do Windows. A tela mostrou o arquivo anexado com nome e tamanho, mas não dá para descartar que o envio tenha falhado nesse fluxo.

A tela informa que os dados vão para um serviço de IA de terceiros e diz, sobre o ChatGPT, que a empresa não se responsabiliza pelos dados enviados nem pelas respostas. A resposta da IA apareceu com data errada, 02/12/2026 ("em um mês").

### Assistente de IA

- **Dados da conta:** perguntei sobre processos incompletos e a próxima data fatal. Ele levou quatro rodadas de opções antes de responder e não reconheceu o marcador "Incompleto" do próprio sistema. No fim, os dados estavam certos, mas ele não alertou que a tarefa caía em feriado.
- **Anexo direto no chat:** a primeira tentativa terminou em erro, e o anexo sumiu.
- **PDF dentro do processo:** quando indiquei o arquivo e o processo, ele extraiu corretamente valor, datas, reunião familiar e pedido. A leitura de PDF existe e funciona nesse caminho.
- **Julgados:** não entregou nenhum depois de várias rodadas. Declarou conhecimento até 06/2024, primeiro disse não ter busca pública e depois ofereceu essa busca. Ao aceitar, deu erro. Não inventou citação, mas também não respondeu.

### Bloqueios da IA

- **Prognóstico jurídico:** recusa sem número de processo, então não testei, para não inventar um CNJ.
- **Resumo de petição inicial:** exige um arquivo do tipo "Petição Inicial", que não existe na lista padrão de tipos. Anexei o PDF como "Arquivos Processo", e a tela continuou dizendo que não havia arquivo. Não testei criar esse tipo.

O saldo seguiu em 100 créditos depois de todos esses usos. O Assistente aparece como gratuito por tempo limitado.

### O que ficou na conta

Pessoa "TESTE Cliente Ficticio", processo PRO.0000001 com o assunto "TESTE Indenizacao ficticia", os arquivos `peticao-teste-v2.pdf` e a peça gerada, tipo de tarefa "TESTE Prazo", tarefa TAR.0000001, fluxo "Contestação" desabilitado, duas conversas de IA e a OAB fictícia 999999/AC.

## Planos e preços

A contratação tem quatro etapas: perfil, sugestões, personalização e pagamento. Não há plano fechado: cada item tem controle e preço próprios. Valores que a tela abre, sem ajuste:

| Item | Quantidade | Valor |
|---|---|---|
| Usuários | 1 | R$ 42,00 |
| Armazenamento | 5 GB | R$ 8,00 |
| Cadastro de processos | 1.000 | R$ 10,00 |
| Captura de intimações | 1 | R$ 37,00 |
| Intimações eletrônicas | 4 | R$ 40,00 |
| Capturas de andamentos | 50 | R$ 17,50 |
| Cálculo de prazos | 10 | R$ 10,00 |
| Protocolos (petições) | 20 | R$ 84,60 |
| Projuris IA (com ChatGPT) | 25 | R$ 10,00 |
| Atendimento | Incluído | R$ 16,90 |
| Timesheet | Incluído | R$ 16,90 |
| **Total exibido** | | **R$ 292,90** |

Módulos que começam desligados:

| Módulo | Valor |
|---|---|
| Financeiro | R$ 52,90 |
| Modelos de documentos | R$ 30,90 |
| Workflow | R$ 85,00 |
| Cobranças (contratos de honorários) | R$ 84,90 |
| Área do cliente | R$ 16,90 |
| Campos personalizados | R$ 84,90 |

- **Soma com tudo ligado:** R$ 648,40, pela minha conta, se os valores forem somados sem desconto.
- **Período:** há opção de valores anuais com 10% de desconto ou mensais, e parcelamento em até 12 vezes. Não confirmei qual período esse total representava.
- **Limites do teste:** 5 GB, 5 processos monitorados, 5 capturas de intimações, 4 intimações eletrônicas, 5 peticionamentos e 100 créditos. A janela de entrada fala em até 15 processos capturados pela OAB.
- **Preço de entrada:** o [anexo 03](../pesquisa/2026-10-31-anexos/03-concorrencia-brasil.md) registra ADV Start a partir de R$ 79/mês. Não reduzi os controles até o mínimo, então não confirmei esse valor nessa tela.

Não avancei para a etapa de pagamento nem vi a etapa de sugestões.

## O que não foi visto

- **Com dados reais:** intimações, andamentos, monitoramento, captura pela OAB, cálculo de prazo e prognóstico.
- **Financeiro em uso:** nenhum lançamento foi salvo, e não vi boleto emitido, contrato, conciliação nem cadastro via documento. Não vi emissão de nota fiscal.
- **Portal do cliente:** só o formulário; não criei login.
- **Outros módulos:** timesheet e atendimento em uso, importação, webhooks, perfis e permissões, Office 365, aplicativo de celular, comentários e compartilhamento por WhatsApp.
- **Dashboards:** a tela abriu vazia, sem nenhuma mensagem, mesmo com um processo cadastrado.
- **Kanban:** a tarefa de teste não apareceu no quadro, e não confirmei se a opção de exibi-la vinha desligada.
- **Marketplace:** as páginas de Jurimetria e Peticiona não abriram, então Jurimetria segue sem verificação.

## O que levar

1. **Salvar incompleto com marcador.** Salvar o processo sem os obrigatórios, listar o que falta e filtrar depois tira o atrito do cadastro sem esconder a pendência. É a melhor ideia do produto.
2. **Avisar quando o prazo cai em feriado.** Nosso motor de prazos já conta com 20/11 e com o recesso, e o [conjunto de casos](../../packages/ia/src/conjunto-ouro.ts) cobre esse tipo de conta. Vale mostrar isso como diferencial e conferir se o aviso aparece também em datas digitadas à mão.
3. **Peça tem que provar que leu o documento.** Se o anexo não foi lido, avisar antes de gerar. Cada fato deve apontar para um documento ou sair marcado como "a comprovar", a mesma lição do Astrea.
4. **Preencher a peça com os dados do processo.** Promessa de usar os dados cadastrados, seguida de lacunas entre colchetes, gera retrabalho e desconfiança.
5. **Assistente com menos perguntas.** Deve conhecer os conceitos do próprio produto e responder com um padrão declarado, perguntando só quando a resposta mudar de fato.
6. **Prazo ligado ao fato que o dispara.** Fluxo que conta do clique em iniciar depende da pessoa. Citação e publicação deveriam ser a data de partida.
7. **Repasse por favorecido.** É uma referência direta para a Fase 2 do [plano de execução](../pesquisa/2026-10-31-plano-de-execucao.md): do alvará ao honorário, com percentual, conta e forma de pagamento.
8. **Exclusão e cancelamento na própria conta.** É uma lacuna nossa, já apontada na [comparação](07-comparacao-com-o-decreta.md).
9. **Primeira entrada sem bloqueio.** Uma janela que exige OAB e não fecha barra quem só quer conhecer o sistema. Quando a captura for opcional, a etapa também deve ser.
10. **Cuidado com preço por módulo.** Parece barato, mas o financeiro, o workflow e a cobrança somam mais que o pacote inicial. Plano simples pode ser um argumento de venda.
