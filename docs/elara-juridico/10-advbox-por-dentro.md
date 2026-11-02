# ADVBOX por dentro

Análise feita em 02/11/2026 na conta de teste do ADVBOX aberta no Chrome (teste gratuito de 7 dias, com o aviso de dias restantes fixo no rodapé), em duas partes: leitura das telas do menu e dos planos, e uso com dados fictícios, descrito em "Teste com dados fictícios".

**Limite principal:** o teste de 7 dias bloqueia justamente o que mais interessa. O cadastro de termos monitorados não abre, as IAs (Justin-e, Donna e os 17 agentes de petição) estão todas desativadas e a cobrança por boleto depende de uma integração não conectada. Por isso a contestação com o PDF fictício **não foi testada**, e nada em "IA" vale como teste: é o que o ADVBOX declara no site e nos termos de uso. A seção "O que não foi visto" lista o restante.

## Mapa do produto

| Módulo | O que tem |
|---|---|
| Meu Painel | Abas Visão geral, Lista, Quadro, Desempenho e Configurações. Tarefas concluídas, pontos acumulados, pendentes, alcance da meta, gráfico "Taskscore" por pessoa e calendário do mês |
| Agenda | Visões de mês, dia e semana, com filtro por pessoa, por data do compromisso e por situação (pendentes, concluídas, atrasadas) |
| Atividades | Lista de tarefas com filtros e exportação, gráfico de pendentes, atrasadas e resolvidas no mês |
| CRM | Funil de processos em quadro kanban: uma aba por fase (Marketing, Negociação, Consultoria, Administrativo, Judicial, Recursal, Execução, Financeiro e Arquivamento) e uma coluna por etapa. Indicadores de processos, recebido no mês, valor e estagnados |
| Contatos | Cadastro de pessoas, com origem obrigatória. Gráficos de origem, faixa etária e profissão |
| Processos | Lista com volume por fase, fechamentos e meta. Painel lateral do processo com dados, nuvem de documentos, tarefas, compartilhamento com outro escritório e financeiro |
| Intimações | Lista de intimações recebidas, com filtro de período e responsável. Na conta de teste está vazia, com aviso de que não há termo monitorado |
| Parceiros | Rede de escritórios: processos compartilhados e demandas pendentes de cada lado |
| Modelos e IA | Três áreas: Agentes Jurídicos IA (aplicação LawX embutida), Meus modelos (editor de documentos com preenchimento automático) e Biblioteca pública |
| Financeiro | Saldo, receita e despesa previstas, pagamentos atrasados, gráfico de cinco meses, contas bancárias e lançamentos |
| Relatórios | Painel de agilidade e produtividade e sete relatórios: produtividade, tarefas atrasadas, registros de acesso, novos clientes, novos processos, processos ganhos e processos perdidos |
| Configurações | Quinze abas: usuários, inteligência artificial, termos monitorados, financeiro, tarefas, workflow, grupos de ação, tipos de ação, etapas, metas, origem de pessoas, parceiros, caixa de entrada, notificações e integrações e API |
| Conta e assinatura | Dados do escritório, plano e pagamento e termos de uso (PDF de 15 páginas) |
| Rodapé e menu | Central de ajuda (link externo), Suporte, indicação do produto e botão "Falar com consultor". Não abri esses itens |

## Detalhes que importam

### Primeiro uso

- **Ao entrar,** um modal pede a inscrição na OAB e a seccional, com o atalho "informar depois". Usei o atalho. Em seguida vem uma tela de boas-vindas e o painel.
- **A conta já traz dados de exemplo:** um contato com o nome do titular, um processo de exemplo, duas tarefas de boas-vindas (uma delas oferece cadastrar ou contratar a migração de dados), seis grupos de ação, os tipos de tarefa, as etapas e os modelos.
- **Não vi checklist por módulo** como o do Astrea. O botão de contratar, com a contagem de dias, fica fixo no rodapé.

### Tarefa é um item de catálogo, com pontos

- **Não existe tarefa de texto livre.** O campo "Tarefa" é uma lista fechada: digitar um nome novo devolve "nenhum resultado". A conta já traz 149 tipos, agrupados por fase (negociação, administrativo, judicial, recursal, execução, RH/financeiro, arquivamento e marketing), como contestação com ou sem modelo, audiência de conciliação e réplica.
- **Cada tipo vale pontos** (por exemplo, 50 para contestação com modelo e 150 para contestação complexa). Os pontos alimentam o "Taskscore", as metas por pessoa e os relatórios de produtividade.
- **O texto livre vai na descrição.** O cartão da tarefa mostra o tipo como título e a descrição embaixo.
- **O que a tarefa pede:** processo ou caso, responsável (obrigatório, com opção de escolher um time inteiro), tarefa, data, hora, prazo fatal, mostrar na agenda, informar término, dia inteiro, local, descrição, anexos e marcadores de importante, urgente, futura, recorrente, privada e retroativa.

### Processo

- **Obrigatórios:** parte (cliente ou contrária), grupo de ação, tipo de ação e fase. O número CNJ não é exigido.
- **Campos do processo:** número CNJ, protocolo ou requerimento, processo originário, pasta ou caso, data do requerimento, valor da causa, valor e percentual dos honorários, contingenciamento (de remota a provável), datas de cadastro, fechamento, trânsito em julgado e arquivamento, resultado, responsável, fase e etapa.
- **Aviso ao cliente:** o painel do processo tem "Notificar cliente?" por SMS ou e-mail ao atualizar. Não o vi marcado em nenhuma tela.
- **Sem campo de título.** O processo é identificado pelas partes e pelo tipo de ação. Na conta de teste só havia 10 tipos de ação (ex.: reintegração de posse, reclamatória trabalhista), e o campo oferece criar um tipo novo na hora.
- **Compartilhar processo:** uma aba do painel convida outro escritório da rede de parceiros, com sincronização em tempo real das alterações.
- **Certificado digital A1:** cadastrado por usuário (arquivo .pfx), para monitorar intimações eletrônicas. Certificados A3 e em nuvem não são aceitos.

### Prazo e agenda

- **O prazo fatal é uma data digitada à mão**, sem marca de obrigatório, ao lado da data do compromisso (que assume o dia de hoje por padrão). O calendário do campo não marca feriados, e o cartão mostra só o dia da semana.
- **Não encontrei calculadora de prazos** em nenhuma tela da conta de teste. A contagem de prazo aparece apenas na descrição comercial da Justin-e (paga), que promete cálculo de D0 a D-5 considerando feriados. Não testei.
- **Caixa de entrada** (Configurações): seis seções reordenáveis, com "Prazo fatal" no topo, depois intimações, não lidas, urgentes, importantes e as demais.
- **Quadro de tarefas** no painel: na conta de teste, colunas fixas por data e situação (todas, hoje, próximos dias, fazendo, concluídas hoje). As colunas editáveis estão no CRM.

### Workflow, etapas e CRM

- **Workflow:** lista de tarefas do catálogo, cada uma com responsável e prazo em dias a partir da data em que o fluxo é aplicado. Não há campo de dia útil.
- **Etapa do CRM:** aceita nome, fase, um workflow sugerido ao mover o processo e a marca "estagnado".
- **Tarefa que muda de etapa:** ao aplicar um workflow, uma tarefa pode mover o processo para outra fase e etapa, com a opção de avisar o cliente por SMS ou e-mail.
- **Não há entidade de lead.** O funil é de processos: o lead é um contato com um processo na fase de Marketing ou Negociação.

### Financeiro

- **Estrutura:** quatro contas padrão (cartão de crédito, conta principal, dinheiro e investimentos), um centro de custo (Geral), e categorias prontas.
- **Receitas prontas:** honorários de consultoria, mensalidade, iniciais, finais, de sucumbência, multa e juros, **alvarás, RPVs e precatórios**, aporte e integralização de sócio e reembolso de custo por clientes. Despesas: dezenas de categorias numeradas (pessoal, impostos, escritório, OAB, cartório, custas pagas pelo cliente).
- **Lançamento:** tipo (despesa, receita, transferência), conta, centro de custo, categoria, pessoa, processo, descrição, valor, vencimento, competência, pagamento e anexo.
- **Repetição:** recorrente ou parcelado, de 2 até 100 parcelas.
- **Cobrança:** a opção "Gerar cobrança no boleto ou cartão" aparece desabilitada na conta de teste. Os tipos de cobrança listados são boleto e cartão de crédito. Não vi Pix como forma de cobrança nem emissão de nota fiscal.
- **Por lançamento:** marcar como pago, "Gerar recibo" e mover para a lixeira. Não cliquei no recibo.
- **Repasse:** só encontrei a transferência entre contas e o tipo de tarefa "Pagar/repassar valor para cliente". Não há fluxo próprio de repasse.
- **Acesso ao financeiro** é um interruptor por usuário na lista de usuários.

### Documentos e modelos

- **Três modelos de exemplo:** contrato de honorários de ação previdenciária e duas procurações. Cada modelo tem "Gerar documento", "Criar uma cópia", "Editar modelo" e "Excluir".
- **Editor próprio**, aberto em nova aba, com menus de variáveis (cliente, processo, escritório e local) e painel de "Preenchimento automático": escolhe-se cliente, processo e usuário. Botões "Salvar na nuvem", "Imprimir" e "Enviar documento por e-mail".
- **Variáveis do cliente:** nome, sobrenome, qualificação, CPF ou CNPJ, RG, tipo de pessoa, idade, nascimento (inclusive por extenso), estado civil, nacionalidade, sexo, profissão, telefones, e-mail, endereço, cidade, UF, país, PIS e CTPS, entre outras.
- **A nuvem de documentos** é por cliente e por processo, com pasta principal.

### Notificações, integrações e usuários

- **Quatro avisos internos** com responsável configurável: novo cliente, novo processo, compartilhamentos e parceiros e intimações judiciais.
- **Integrações (15 cartões, todos com interruptor):** API do ADVBOX, onze parceiros de atendimento e WhatsApp com IA (Atende Direito, Briefing Jurídico Ria, Chat Jurídico, Chatguru, Digisac, Guimoo, Idvzap, Liderhub, Mindchat, Sabio Adv e Touchworks), Asaas, agenda (Google, Apple e Outlook) e RD Station Marketing. Os planos listam WhatsApp entre os canais de atendimento, mas na conta de teste só encontrei parceiros de WhatsApp com IA, sem envio nativo à vista. Não liguei nenhum.
- **Usuários:** perfis Gestor e Administrador. A conta nasce com um usuário "Suporte ADVBOX", com perfil de administrador. Há troca em massa de tarefas pendentes de um usuário para outro, protegida por uma frase de confirmação.
- **Dados do usuário:** inclui cargo, salário, admissão, jornada e meta pessoal de pontos, além de "mostrar na procuração como outorgado".

### IA (o que o ADVBOX declara)

| IA | O que diz fazer | Preço público |
|---|---|---|
| Justin-e | Controladoria: recebe intimações, resume, aponta o impacto no caso, sugere tarefas já cadastradas e calcula prazos de D0 a D-5 com feriados. Alega 99,9% de precisão e ser 8 vezes mais rápida que uma pessoa | A partir de R$ 200/mês |
| Donna | Copiloto: consulta processos, clientes, tarefas, agenda e financeiro, cadastra clientes e processos por comando, altera fases e gera relatórios | A partir de R$ 200/mês |
| Agentes IA | Petições e recursos por área do Direito, em mais de 20 áreas | A partir de R$ 200/mês por agente |
| Flowter | Automação por gatilho (tarefa concluída ou etapa alterada), ação (criar tarefas, distribuir, calcular prazo, chamada HTTP) e tempo (imediato, dias úteis ou corridos) | A partir de R$ 280/mês |

- **Agentes por área (aplicação LawX embutida):** administrativo, ambiental e agro, assistencial, bancário, consumidor, contratual e financeiro, penal, digital, empresarial, família, imobiliário, previdenciário, responsabilidade civil, saúde, trabalhista, trânsito e tributário. Todos aparecem com cadeado.
- **Configurações do LawX:** perfil profissional (nome que assina, OAB, escritório, endereço e timbrado), "Meu estilo de peças" (em beta: o usuário envia de 3 a 5 petições próprias e a IA monta um guia de estilo), 35 "tools jurídicas" (motores de raciocínio por área do Direito, como o auditor revisor da peça final, cada um rodando cerca de um minuto em segundo plano) e tokens de integração.
- **O chat só abre depois do envio de documentos.**
- **Ativar a IA** é um link que cria um "usuário bot" na conta. Não cliquei, para não contratar.

### Termos de uso (contrato de 15 páginas)

Li as páginas 1 a 13 por amostragem; o que segue vem dessas cláusulas.

- **Publicações:** dois níveis. O DJEN entrega entre 1 minuto e 8 horas depois da disponibilização. O completo usa as credenciais dos sistemas dos tribunais (inclusive segredo de justiça).
- **Garantia de entrega:** R$ 50 por dia de atraso no DJEN e R$ 200 por dia no completo, quando o atraso passa de 48 horas. A indenização por falha na entrega chega a R$ 200 mil numa cláusula e a R$ 1 milhão em outra. Não conciliei os dois valores.
- **Disponibilidade:** 99,9% ao ano, com crédito de 5% a 30% do valor anual conforme a faixa.
- **Captura de andamentos:** entrega em 24 horas úteis, podendo subir para 72 horas se o tribunal mudar o layout.
- **Dados:** o gestor exporta em XLS e PDF. A exportação do arquivo de documentos pelo ADVBOX leva até 45 dias e é um serviço à parte. Itens excluídos vão para a lixeira, e a tarefa excluída permanece no histórico com o nome de quem removeu.
- **Óbito do titular:** a conta é resguardada, com regras para herdeiros, sócios e conflito entre eles, e exportação sem custo.
- **Reajuste anual pelo IGP-M**, multa de 2% e juros de 1% ao mês no atraso. A página de preços diz que não há fidelidade mínima.
- **Não achei no app a tela de exportação completa nem a de encerramento de conta.** Só o texto dos termos.

## Teste com dados fictícios

Feito em 02/11/2026, com cliente, processo, tarefa, workflow, etapa e honorário inventados, rotulados com "TESTE", sem CPF nem número de processo. Não houve busca em tribunal ou OAB, nem envio de mensagem, e-mail ou notificação.

### Cadastro

- **Cliente:** só nome e origem são obrigatórios. O envio vazio avisa os dois campos. CPF, e-mail e telefone ficaram livres.
- **Origem:** lista fixa de oito itens (anúncio, escritório, Facebook, Google, indicação, Instagram, parte contrária e site).
- **O fluxo continua sozinho:** ao criar o contato, o painel já abre "Criar novo processo" com o cliente vinculado.
- **Processo:** o envio sem grupo e tipo de ação avisa os dois campos. Sem número CNJ, o sistema aceitou e **não pediu nem avisou nada**.
- **Como a ausência do número aparece:** a lista mostra N/A, o painel diz "Processo sem número", o financeiro mostra S/N e a tarefa mostra "Numeração não informada". Está consistente, mas sem alerta de que o processo não será monitorado.
- **Atrito:** na primeira tentativa vazia a página voltou ao painel inicial e eu não vi mensagem de erro; na segunda, o aviso apareceu. Em nenhuma das duas o processo foi criado.

### Prazo e feriado

- **O prazo não confere a data.** Criei uma tarefa com prazo fatal em 15/11/2026, domingo e feriado nacional, e o sistema salvou sem aviso. O cartão mostra "domingo, 15/11/2026".
- **Workflow com prazo em dias:** apliquei um fluxo com três tarefas de 5, 13 e 15 dias. Os prazos saíram como **dias corridos a partir de hoje (02/11)**: 07/11 (sábado), 15/11 (domingo e feriado) e 17/11 (terça). Nenhum pulou fim de semana nem feriado, e só a data do compromisso foi preenchida, não o prazo fatal.
- **A agenda de novembro** não marcou nenhum feriado nas células.
- **Justin-e:** a contagem "considerando feriados" é do produto pago. Não testei.

### Workflow, etapas e CRM

- **Aplicar o workflow** abre uma tarefa por vez, com data calculada, opção de pular e a mudança de etapa associada.
- **Etapa fictícia no CRM:** criei uma etapa na fase de Marketing e liguei o workflow a ela. **Arrastar o cartão funcionou** e o sistema perguntou se queria atribuir o workflow agora (sim ou não). Aceitei, vi a primeira tarefa, que moveria o processo para Negociação com o aviso ao cliente desmarcado, e fechei sem criar.
- **Lead:** um contato de origem Instagram com processo na fase de Marketing entrou na primeira etapa dessa fase.

### Financeiro

- **Honorário fictício de R$ 1.000,00** em 2 parcelas, categoria honorários finais, vinculado ao cliente e ao processo. O sistema calculou "2 parcelas de R$ 500,00" (o valor digitado é o total) e criou os lançamentos de 30/11 e 30/12/2026, pendentes.
- **Valor:** o campo trata os dígitos como centavos: "100000" vira 1.000,00.
- **Fluxo de caixa:** a tela mostrou R$ 500,00 de receita prevista em novembro e dezembro, no gráfico de cinco meses. O saldo ficou em zero. Não vi DRE nem DFC, só a visão por vencimento.
- **Cobrança:** a opção de gerar boleto ou cartão ficou desabilitada, então não houve emissão. Não vi Pix, nota fiscal nem repasse.

### Documentos

- **Procuração com o cliente fictício:** o preenchimento automático trouxe nome e e-mail e deixou **em branco, sem aviso**, RG, CPF, endereço e demais campos que o cadastro não tinha. O texto ficou com vírgulas soltas.
- **O trecho do outorgado** continuou com marcadores manuais como "(nome)" e "XX".
- **Nada foi salvo:** o editor pede um nome para ativar o salvamento automático, e eu não dei.
- **Três cliques em pontos diferentes do cartão do modelo** abriram três abas do editor, todas com o mesmo documento. O site abre o editor em aba nova a cada acionamento.

### Publicações e intimações

- **A captura não pôde ser cadastrada.** "Adicionar novo termo" mostra o aviso "Acesso limitado! Faça a assinatura/upgrade do seu plano." A tela de termos diz que o monitoramento da OAB cobre diários oficiais, INSS, SEEU e outros produtos, e que é preciso assinar para cadastrar termos.
- **A tela de intimações** só mostra o estado vazio, o filtro e as colunas (processo, publicação, tribunal, número, responsável e situação).

### IA

- **Contestação não testada.** Os 17 agentes aparecem com cadeado e a mensagem diz que o agente de consumidor não está contratado. Justin-e e Donna estão desativadas. Não contratei nem cliquei em "Ativar".
- **Preço e bloqueio:** a partir de R$ 200/mês por IA, e R$ 280/mês no Flowter, segundo o site. O teste não libera nada disso.
- **Por isso, não verifiquei** se a IA lê o PDF, se inventa fatos ou se cita julgados.

### Atritos

- **Tipo de ação:** só existia um tipo para o grupo cível. Quem não perceber que o campo aceita criar um tipo novo fica sem opção.
- **Tarefa de catálogo:** para quem chega de outro sistema, não poder digitar "Prazo X" é uma barreira. O texto livre só cabe na descrição.
- **Sem número, sem alerta:** o processo sem CNJ convive sem nenhuma indicação de que não recebe andamento.

## Planos e preços

Lidos em 02/11/2026 na tela interna de pagamento e na página pública de planos, aba "Mensal". A aba "Plano Anual" não foi lida. A tela de pagamento mostrou o plano Banca Max (R$ 900,00) com valor de assinatura R$ 0: a conta de teste tem workflow e quatro contas financeiras, o que combina com Banca Max ou acima. O painel de controladoria e o BI não apareceram no menu.

| Plano | Por mês | Termos de publicação (DJEN) | Espaço | Processos ativos |
|---|---|---|---|---|
| Essencial | R$ 220 (a partir de) | 1 | 50 GB | Limite de 2.000 |
| Banca Jurídica | R$ 450 (a partir de) | 1 | 70 GB | Ilimitado |
| Banca Max ("mais escolhido") | R$ 900 (a partir de) | 25 | 90 GB | Ilimitado |
| Elite | R$ 1.800 (a partir de) | 100 | 100 GB | Ilimitado |
| Big Offices | R$ 5.000 (a partir de) | Sob consulta | Banco dedicado | Acima de 20 mil |

Usuários são ilimitados em todos os planos. Todos cobram taxa de ativação (valor não encontrado). A tabela marca 500 processos ativos com aviso (push) em todos e trata a captura automática de andamentos como opcional, sem dizer o preço. O FAQ cita Pix ou cartão; os termos citam cartão ou boleto.

### O que cada plano acrescenta

| Plano | Acrescenta |
|---|---|
| Essencial | Tarefas, prazos, intimações distribuídas aos responsáveis, pauta de audiências, agenda integrada, kanban de tarefas, sugestão de próxima tarefa por IA, CRM por fase, editor de documentos. Suporte só por chat. Sem financeiro |
| Banca Jurídica | Financeiro (cobrança por boleto e cartão, recorrente, inadimplência, Asaas), controle de prazos com aviso por e-mail, relatórios de gestão. Contas, centros e cartões limitados a um de cada. Suporte por e-mail e WhatsApp |
| Banca Max | Painel de controladoria, times, workflow automático de tarefas e por etapa, contingenciamento, fluxo de caixa por conta, DRE e DFC, modo escuro e onboarding individual |
| Elite | Painel de tarefas em tempo real, setores e unidades, produtividade avançada, estoque de processos, rentabilidade por tipo de ação, safras por ano e BI integrado |

### Leitura para o Decreta

- **O preço sobe por termos de publicação e por IA, não por usuário.** O corte funcional está em R$ 900: workflow, controladoria e DRE só entram no Banca Max.
- **A IA forte é add-on em todos os planos.** Só a sugestão da próxima tarefa vem incluída. Justin-e, Donna e cada agente de petição custam a partir de R$ 200 por mês cada, e o Flowter, R$ 280. As quatro IAs, com um agente de petição, somam R$ 880 por mês sobre o plano.
- **O teste esconde a parte principal.** Sem publicação e sem IA, só dá para avaliar o organizador de tarefas.
- **Inconsistências da página:** a tabela comparativa marca o kanban de tarefas no Essencial, no Banca Max e no Elite, mas não no Banca Jurídica. Cita também um plano "CRM" que não aparece na lista. O [02-concorrentes-e-benchmark.md](02-concorrentes-e-benchmark.md) registra 1.000 processos ativos incluídos e R$ 100 a cada 500 a mais; a tabela de hoje diz 500 incluídos e limite de 2.000 só no Essencial. Vale reconferir antes de citar números.

## O que não foi visto

- Publicações e intimações reais, captura de andamentos e o formulário de termos monitorados (bloqueado no teste).
- Qualquer IA: Justin-e, Donna, agentes de petição e Flowter. A contestação com o PDF fictício não foi feita.
- Boleto, Pix, nota fiscal, recibo, DRE, DFC e conciliação.
- Portal do cliente: os termos falam em módulo de atendimento virtual, mas não o achei no app.
- WhatsApp ao cliente: só os cartões de parceiros, sem ligar nenhum.
- Biblioteca pública de modelos, criação de modelo novo, "Salvar na nuvem" e envio por e-mail.
- Exportação completa e encerramento de conta: só o texto dos termos.
- Metas e produtividade com dados, o aplicativo de celular e o plano anual.
- Páginas de Suporte e de indicação, e a central de ajuda.

## O que levar para o Decreta

1. **Prazo auditável fica como diferencial.** O ADVBOX aceita prazo em domingo e feriado sem aviso, calcula o workflow em dias corridos e vende o cálculo com feriados como IA paga. A regra com data conferida, incluída no produto, é argumento direto.
2. **Etapa que sugere o próximo passo.** Mover o cartão e perguntar "atribuir o workflow agora?" é uma mecânica simples, com consentimento. O aviso ao cliente nasce desmarcado.
3. **Processo sem número com marcação clara.** O ADVBOX trata o "caso" sem número de forma consistente (N/A e S/N em todas as telas), mas sem alerta. O Decreta pode marcar que o processo não é monitorado e oferecer buscar o número.
4. **Preenchimento de documentos que mostra o que falta.** O ADVBOX deixa vírgulas soltas. Marcar cada campo vazio em destaque evitaria procuração com RG em branco.
5. **Estilo de peças a partir das petições do usuário.** O guia de estilo com 3 a 5 petições e o perfil profissional para assinar (OAB e timbrado) são bons desenhos para peças com IA, se cada fato da peça apontar para um documento.
6. **Garantias de publicações como padrão de mercado.** Disponibilidade de 99,9%, crédito escalonado e indenização por atraso estão no contrato. Se o Decreta vender publicações, vai ser comparado a isso. Já a precisão de 99,9% que o ADVBOX alega para a Justin-e é o tipo de promessa que nosso [plano de execução](../pesquisa/2026-10-31-plano-de-execucao.md) evita de propósito.
7. **Exportação e óbito do titular.** O contrato prevê exportação em XLS e PDF e regras de sucessão da conta. O benchmark já lista exportação e encerramento como pendência da LGPD.
8. **Acesso ao financeiro por pessoa e perfis simples.** Um interruptor por usuário na lista resolve o caso comum, como no Astrea.

## Onde o Decreta já ganha

- **Prazo:** conta com regra, feriados e conferência, onde o ADVBOX usa data manual e dias corridos.
- **IA incluída:** o ADVBOX cobra cada IA à parte e o teste não libera nenhuma. Vale manter a IA dentro do plano ao definir os preços.
- **Alvarás:** o ADVBOX tem categorias de receita chamadas alvarás, RPVs e precatórios, mas não vi módulo para acompanhá-los.
