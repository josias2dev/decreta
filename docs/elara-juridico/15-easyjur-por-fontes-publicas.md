# EasyJur por fontes públicas

Levantamento feito em 02/11/2026 sobre o EasyJur (EasyJur OS, Work, Legal Ops, mais os complementos Talk e API), a partir de páginas públicas lidas nessa data: site, blog, central de ajuda, termos de uso e avaliações de usuários.

**Limite principal:** o sistema não foi usado. Não criei conta, não iniciei o teste, não abri nem enviei formulário, não agendei demonstração e não falei com ninguém. Tudo abaixo vem de fontes públicas, e o que a empresa diz de si (clientes, tempo economizado, cobertura de tribunais, ausência de alucinação) é autodeclarado e não foi verificado. A única observação própria é a da seção "Experiência de cadastro e teste grátis".

**Como ler as marcas:** cada fato traz uma etiqueta que remete à seção "Fontes". **[F]** é o fornecedor (site e blog, que vendem), **[D]** é a central de ajuda do fornecedor (descreve telas e é a fonte mais confiável sobre como o produto funciona), **[U]** é relato de usuário e **[T]** é terceiro. Onde as fontes se contradizem, a contradição está escrita. Onde não achei, está escrito "não encontrei".

## Conclusão

1. **O EasyJur é três contratos em um, e só o primeiro tem teste.** O OS (gestão) começa em R$ 229 por mês. A IA que executa (Work) e o BPO feito por pessoas (Legal Ops) são vendidos por cima, e a combinação dos três parte de R$ 2.749 por mês. O consumo é medido em pelo menos cinco medidores diferentes (pushs, tokens, execuções, créditos de demanda e requisições de API), com excedente cobrado à parte e taxa de adesão sem valor publicado [F1][F2].
2. **A central de ajuda mostra um produto menos autônomo que a propaganda, e o cálculo de prazo não está documentado.** O blog fala em IA que lê a publicação e cria a tarefa sem intervenção humana [F25]. A ajuda descreve outro fluxo: a pessoa abre a publicação, clica em **Executar Análise**, lê o resultado e só então usa **Cadastrar Prazo**, e a ajuda não menciona classificação de urgência [D2]. A execução automática aparece nas páginas do Work, produto pago à parte [F6]. Sobre prazo, as páginas comerciais dizem que o cálculo considera feriados locais, suspensões e particularidades da vara [F4][F5], mas o artigo de agenda não traz regra de contagem [D7]. Não testei, então não afirmo que o cálculo falha.
3. **A captura de publicações depende de credenciais do advogado em cada tribunal, de limites de push e de filtros que marcam como lida.** São os pontos onde aparece o relato de perda de prazo no Reclame Aqui (17/09/2026) [U3][D22][D23][D3]. Um artigo da própria ajuda admite que, no TJAP, a coleta não é contínua e a pessoa deve seguir conferindo o tribunal [D16].
4. **O Legal Ops é intermediação, não equipe própria.** Os termos descrevem a plataforma como intermediária entre o solicitante e advogados correspondentes independentes, com responsabilidade limitada ao valor do serviço [F9]. A página comercial fala em equipe dedicada e promete refação zero [F8].
5. **O teste grátis anunciado passa por formulário, e as avaliações públicas são antigas.** O site diz 7 dias, sem cartão, com importação de até 50 processos [F1], mas o botão abre um formulário, e o nosso usuário relatou que não conseguiu criar a conta de teste sem falar com um especialista (detalhes abaixo). As avaliações de usuários que achei são poucas e vão de 2021 a 2023, anteriores à estrutura OS, Work e Legal Ops.

## Mapa do produto

| Módulo | O que tem | Fonte |
|---|---|---|
| Processos e casos | Processo judicial, extrajudicial e administrativo, com desdobramentos, outras partes e advogados, correção monetária de pedidos, tipo de ação e assunto personalizáveis, exportação em PDF e Excel. Processos ilimitados em todos os planos. Importação por CSV só no Premium, 100 linhas por arquivo | [D1][D24][F2] |
| Andamentos (push) | Monitoramento de processos públicos nos tribunais, em duas modalidades (só andamentos ou dados completos). Cada processo ativo consome uma vaga da franquia. Leitura em massa e e-mail de andamentos ao advogado responsável | [D3][D4][D15][D25] |
| Intimações e publicações | Três vias: termos monitorados nos diários oficiais (por OAB, nome ou CNPJ), login de tribunal (PJe, Eproc, Projudi, ESAJ) e processos distribuídos por nome. Agrupamento de publicações semelhantes, filtros de leitura automática, histórico de quem leu | [D21][D22][D13][D5][D23][D6] |
| IA na publicação | Análise com resumo, ações recomendadas, prazo aplicável e data e hora de audiência, acionada pelo usuário | [D2] |
| Agenda e prazos | Agendamento com data interna e data fatal, recorrência, responsáveis, vínculo com processo, etapas de workflow, cronômetro de timesheet, aviso por e-mail e por WhatsApp | [D7] |
| Workflow | Etapas por tipo de evento; no plano, workflow básico (Premium) e avançado (Standard em diante). Página comercial cita aprovações por etapa e papéis | [D7][F2][F16] |
| IA no OS | Juris.ai (chat jurídico), SmartDocs (peça a partir do PDF da inicial), agentes de IA nativos a partir do Premium | [D8][D11][F2] |
| EasyJur Work | Agentes de IA que executam tarefas dentro do OS, cobrados por execução. Complemento do OS, não vendido sozinho | [F1][F6] |
| Legal Ops | BPO jurídico: controladoria, petições, audiências e diligências, por assinatura de créditos | [F8][F9] |
| Talk | CRM no WhatsApp oficial da Meta, atendimento por IA, qualificação e agendamento. Complemento do OS | [F10][F11] |
| Financeiro | Contratos e honorários, fluxo de caixa, conta digital (Asaas), boleto, Pix e cartão, nota fiscal, régua de cobrança (página comercial). Na ajuda, só achei Débitos e Compras e Requisição de Suprimentos, que são despesas do próprio escritório | [F5][F19][D19][D26] |
| Documentos | Modelos com tags de preenchimento (cliente, processo, advogado), procuração automática, trechos reutilizáveis, GED de 10 GB a 200 GB, biblioteca digital. Assinatura digital: fontes divergem | [D17][F2][F5] |
| Jurisprudência | Pesquisa dentro do Juris.ai e portal público gratuito (TST, STJ, STF) que diz ter mais de 4 milhões de decisões, com link para o tribunal | [D8][F29] |
| Novos negócios (CRM) | Funil em kanban (briefing, proposta, negociação, fechado, recusado), proposta por modelo enviada por e-mail e WhatsApp | [D12] |
| Dashboard e relatórios | 14 indicadores reorganizáveis; relatórios avançados com envio automático só no Growth+ | [D14][F2][F5] |
| Permissões e auditoria | Permissão por módulo e por ação, histórico de ações, linha do tempo nos módulos. A página comercial afirma que os registros de auditoria são imutáveis e cita papéis de administrador, advogado, financeiro e estagiário | [D6][D14][F5][F17] |
| Portal do cliente | Acesso de clientes ilimitado a partir do Premium. O que o cliente vê só aparece em material comercial | [F2][F21] |
| Aplicativo de celular | O blog diz que é nativo para iOS e Android. Não encontrei ficha em loja | [F22] |
| Integrações e API | API REST, webhooks, MCP e integrações com Google, Microsoft e Asaas. Produto à parte, vendido por créditos | [F13] |
| Migração e implantação | Migração assistida como serviço adicional, com prazo divergente entre páginas | [F14][F1] |
| Suporte e treinamento | Chat, WhatsApp e e-mail em horário comercial, central de ajuda e Legal Academy | [F15][F30] |

## Detalhes que importam

### Experiência de cadastro e teste grátis

- **O que o site anuncia:** teste de 7 dias em qualquer plano do OS, com acesso completo, sem cartão, importação de até 50 processos e conexão com tribunais. O botão (**Teste grátis**, **Testar 07 dias grátis**) abre um formulário em popup, não um cadastro direto [F1][F12].
- **O que nosso usuário observou em 02/11/2026:** o botão abre um formulário e ele **não conseguiu criar a conta de teste sem falar com um especialista**. Este levantamento não abriu o formulário, então não reproduzi nem desmenti o relato.
- **O que as fontes públicas não explicam:** quem libera o teste e se é autoatendimento ou passa por contato comercial. O artigo sobre o teste grátis não responde isso; os botões **Falar com Especialista** aparecem nos planos pagos, não no teste [F20]. A página do Work promete resposta comercial em até 1 dia útil [F7].
- **Demonstração:** há **Agendar Demonstração** em várias páginas [F12]. Não usei.
- **Taxa de adesão:** a página de planos diz que ela existe no OS, sem informar o valor [F1][F2].

### Publicações e intimações: três portas de entrada

A ajuda separa três mecanismos que não se confundem, e cadastrar um não ativa o outro [D4].

- **Termos monitorados (diários oficiais):** não exige login de tribunal. Cadastra-se OAB com UF (o sistema consulta a base da OAB e a pessoa confere o nome) ou CNPJ. A tela mostra quantos termos foram usados e quantos restam, com botão para contratar mais. Termo inativo não pode ser reativado: é preciso cadastrar de novo. A página não trata de homônimos nem informa a periodicidade [D21].
- **Login de intimações eletrônicas:** o robô entra no painel do advogado em cada tribunal. Há quatro formatos de credencial: certificado digital com senha, certificado com senha e código de 32 dígitos, login e senha, ou login, senha e código de 32 dígitos. O certificado precisa ser .pfx. Depois do cadastro há validação de até 72 horas, e o status fica **Monitorando** ou **Precisa de atenção**. A empresa envia resumo diário por e-mail do status dos logins e e-mail imediato em erro crítico (credencial inválida, certificado vencido). Senha expirada é causa de erro; a solução é atualizar as credenciais. A página diz que o robô acessa o painel em intervalos que não informa [D22].
- **TJAP (Tucujuris):** caso documentado de limitação. O tribunal exige código de 6 dígitos que expira rápido; a pessoa precisa atualizá-lo no EasyJur, de preferência todo dia. A própria ajuda avisa que a coleta não é contínua e que a pessoa deve seguir acompanhando o tribunal [D16].
- **Processos distribuídos:** monitora processos novos por nome ou CNPJ, com tipo de pesquisa (gramatical, igual ou fonética), parte (autor, réu ou ambos) e só a partir da ativação, sem retroativo. Há botão para excluir o que veio por homonímia. A ajuda recomenda evitar nomes genéricos porque a coleta excessiva consome o pacote e pode gerar custo adicional [D13]. Não encontrei busca por número da OAB nessa página.
- **Similaridade de publicações:** o mesmo teor republicado em Diário Oficial, PJe, Projudi e eproc é agrupado numa publicação principal, com o percentual de chance de ser a mesma. A tela compara lado a lado, destacando diferenças. Há ações em massa (marcar como lidas, cadastrar a agenda da principal em todas, excluir todas) e botão **Desvincular**. A ajuda diz que é estimativa e que a conferência humana continua necessária; um agrupamento errado pode replicar um prazo indevido [D5].
- **Filtros de leitura automática:** uma palavra ou frase marca como lida, no momento da entrada, toda publicação que a contenha. Um botão cadastra de uma vez 13 filtros comuns de escritório. A ajuda avisa que filtro amplo demais pode esconder um prazo [D23]. Essas leituras ficam atribuídas ao sistema, não a uma pessoa [D6].
- **Quem leu:** cada publicação fica **Pendente** ou **Lida**; o histórico de ações em Configurações mostra o usuário, a data e a hora da leitura manual. A permissão **Marca publicações como lida** vem desligada por padrão, até para administradores [D6].

### IA na publicação: ajuda contra propaganda

| Ponto | Blog e páginas comerciais | Central de ajuda |
|---|---|---|
| Quem aciona | A IA interpreta sozinha a publicação capturada; o blog diz que é sem intervenção humana [F25][F3] | Pessoa abre a publicação e clica em **Executar Análise** [D2] |
| O que entrega | Tipo de ato, prazos explícitos e implícitos, urgência relativa e ações sugeridas [F3] | Resumo, ações recomendadas, prazo aplicável (exemplo de 15 dias) e data e hora de audiência. Não cita tipo de ato nem urgência [D2] |
| Cria a tarefa? | Cria tarefa na agenda do advogado responsável [F25] | Prazo: pessoa revisa e usa **Cadastrar Prazo**. Audiência e sessão de julgamento: data e hora vão para o agendamento automaticamente [D2] |
| Controles | Revisar periodicamente as interpretações [F3] | Copiar, avaliar com joinha, refazer a análise. Não menciona edição do texto. Filtro por ter ou não passado pela análise [D2] |
| Tecnologia | Não detalhada | Diz usar GPT e estar integrada ao módulo de intimações [D2] |
| Plano e limite | Franquia de tokens por plano [F3] | Não informa plano, créditos nem limite [D2] |

Não encontrei aviso de conferência humana na página da ajuda sobre análise de publicação [D2]. No Work, a página diz que as exceções (prazo fatal, divergência entre fontes) são encaminhadas a uma pessoa e que as decisões do agente são auditáveis, sem listar quais ações exigem aprovação prévia [F6]. Uma página de workflow mostra 92% das execuções sem intervenção humana, mas como exemplo de painel, não dado de cliente [F16].

### Prazos e agenda

- **Formulário de agendamento:** abas Principal, Etapas Workflow, Timesheet, Envolvidos, Grupos, GED e Timeline. Campos de data **Interna** (início) e **Fatal** (conclusão), horário, local, cliente, status, processo, desdobramento, parte contrária, projeto, contrato e oportunidade. Dois responsáveis e outros envolvidos [D7].
- **Recorrência:** diária, semanal, quinzenal, mensal, trimestral, semestral ou anual, com data final obrigatória. A opção **Vencimento em Dias Úteis** gera os agendamentos só em dias úteis; a página não explica como o critério é calculado [D7].
- **Notificação:** marcas para enviar e-mail a responsáveis e clientes e **WhatsApp ao cliente**, que abre uma janela do WhatsApp Web; a página não diz se o envio é automático [D7].
- **Cálculo de prazo processual:** a ajuda de agenda não tem regra de contagem, feriado ou tribunal [D7]. O blog sobre dias úteis diz que a plataforma permite configurar prazos com as regras de contagem de cada tipo de processo, sem detalhar feriado local ou suspensão [F26]. O blog de automação diz que o cálculo considera feriados locais, suspensões e particularidades da vara, mas o próprio texto é geral e não afirma que isso é feito pelo EasyJur [F4]. A busca que fiz por documentação da calculadora não achou nada, e a lista de recursos por plano do OS não traz calculadora de prazos como item [F2].
- **Sincronização com Google Agenda e Outlook:** afirmada nas páginas comerciais [F13][F21]. A ajuda de agenda tem um link para um artigo de Google Calendar que não li [D7]. Um usuário de 2021 reclamou da ausência dessa sincronização [U1].

### Andamentos (push)

- **Pré-requisitos:** processo fora de segredo de justiça, mais de 24 horas desde a distribuição e tribunal na lista de abrangência (um link externo que não abri) [D3].
- **Status:** **VALIDANDO** (até 72 horas), **CADASTRADO** e **ARQUIVADO**, quando a coleta passa a ser quinzenal. A página não dá a frequência dos demais [D3].
- **STF e STJ:** exigem classe, autor e réu; processo cadastrado como **CADASTRADO** é monitorado 5 vezes por semana. Quem tem processo nos dois tribunais cadastra um push para cada. Problemas de coleta vão para uma equipe, com prazo de 2 a 7 dias úteis [D18].
- **Limites e erro:** cada processo com push ligado consome uma vaga da franquia (100 a 5.000 conforme o plano). Ao atingir o limite, novas ativações dão erro. Migração do sistema do tribunal (por exemplo, do e-SAJ para o EPROC) pode interromper a coleta, e então a ajuda manda abrir chamado [D4][F2].
- **Segredo de justiça:** o push não coleta; só as credenciais de login coletam intimações desses processos, e não coletam andamentos [D4].
- **E-mail de andamentos:** só chega ao usuário que tem o envio ligado no cadastro e é o advogado responsável no processo. A página não diz que o cliente recebe [D25].

### Workflow

- **Na ajuda:** o workflow aparece como aba de etapas dentro do agendamento, dependente do tipo de evento escolhido [D7], e há um vídeo sobre lançar fluxos a partir de uma oportunidade de negócio, sem passo a passo escrito [D27].
- **Na página comercial:** construtor sem código, modelos, gatilhos (captura de intimação, agendamento recorrente, condição de negócio como fatura vencida há mais de 7 dias), papéis (sócio, advogado, agente de IA, cliente) e aprovações por etapa (0, 1 ou 2). Diz ter cinco níveis de permissão sem listá-los, e não define a diferença entre workflow básico e avançado [F16].
- **Tensão interna:** a seção de capacidades fala em workflows ilimitados com IA, mas a tabela de planos reserva o avançado ao Standard em diante [F5][F2].

### Financeiro

- **Conta digital:** nativa, com tecnologia Asaas, ativada ao criar a conta no sistema, sem processo de abertura bancária. O mesmo blog de 31/03/2026 diz que é gratuita em todos os planos e, na lista de preços, marca a conta digital grátis só em Premium, Standard, Growth e Growth+ [F19]. O artigo não cita Pix, cartão, repasse nem split, e o Asaas aparece em outra página [F5][F13].
- **Boleto e nota fiscal:** boleto a R$ 2,90 por boleto compensado e nota fiscal a R$ 2,50, em todos os planos da tabela [F2]. Segundo o blog, boleto e nota saem da mesma cobrança, e o pagamento é identificado, baixado e refletido no fluxo de caixa automaticamente [F19].
- **Honorários e contratos:** as páginas comerciais dizem que honorários ficam vinculados a processo e cliente, com regras de êxito e mensalidade, timesheet, regra de cobrança automática, fluxo de caixa e relatórios de inadimplência [F5][F21]. Um guia de faturamento por contrato por hora aparece nos resultados de busca, mas não o abri.
- **Na central de ajuda:** não encontrei artigo sobre honorários, faturamento ou boleto. Só achei **Débitos e Compras** (despesas do escritório, com produtos, centro de custo, anexos e mensagens, sem vínculo com cliente ou processo descrito) [D19] e **Requisição de Suprimentos** (pedido a fornecedores ou a pessoas internas, sem fluxo de aprovação descrito) [D26].
- **Repasse:** não encontrei nada sobre repasse a cliente ou terceiros.
- **Cadastro de pessoa:** tem campos de retenção (para calcular corretamente a receita), várias contas bancárias, grupos, vínculo entre pessoas, anexos e linha do tempo. Não traz consentimento da LGPD nem campo de Pix descrito [D20].

### Documentos e peças

- **Modelos e tags:** as tags funcionam como mala direta e são trocadas pelos dados do cliente e do processo. O modelo nasce de um modelo pronto (por classificação e área) ou de um documento do escritório, e nos dois casos a pessoa transforma os campos em tags à mão. A listagem gera PDF; o editor imprime [D17].
- **SmartDocs:** pessoa escolhe o tipo de peça e a parte que defende, envia o PDF da inicial e a IA extrai fatos, argumentos e pedidos; campos opcionais melhoram o resultado. A extração tem limite de caracteres (a página dá 4.500 como exemplo), a busca de jurisprudência aceita até quatro tribunais, o resultado sai em editor próprio e exporta em .docx. Depende de créditos contratados. A página enfatiza que o advogado deve conferir teses e jurisprudência pelos links [D11]. É um fluxo parecido com o da Criação de peças do Astrea descrito em [06-astrea-por-dentro.md](06-astrea-por-dentro.md).
- **Assinatura digital: as fontes divergem.** Um blog de 2025 diz que há assinatura digital integrada [F21]. A página do OS cita DocuSign e D4Sign [F5]. A página de integrações não as cita [F13], o blog de automação lista assinatura digital entre os itens ainda não lançados [F4], e um usuário (2023) sentiu falta dela [U1].
- **Peticionamento automático e Copilot:** o blog os lista como ainda não lançados [F3][F4]. A página de roadmap que o site mantém não trouxe lista de itens [F33].

### Juris.ai e jurisprudência

- **Juris.ai:** chat jurídico para buscar jurisprudência, escrever documentos, achar modelos de peças, orientar, preparar audiência, montar estratégia e outras tarefas, com 4 milhões de decisões de STF, STJ e TST e mais de 100 mil modelos de petições (números da empresa). O consumo é em tokens, que aparecem na barra lateral e não acumulam nos planos pagos. Sem plano pago, o sistema avisa ao chegar a 10 mil tokens. A página diz que respostas longas podem passar de 3 minutos [D8].
- **O que a ajuda não diz:** como as fontes são citadas nas respostas, e nenhum aviso para conferir o resultado [D8][D10]. A redação de peças parte de um prompt escrito pela pessoa, com dez modelos de prompt, e a ajuda não explica como o sistema pesquisa ou verifica as fontes [D9].
- **Portal público de jurisprudência:** acesso gratuito, TST, STJ e STF, links para o site de origem para conferência. Os números e os adjetivos (autenticidade garantida, acesso ilimitado) são da empresa [F29].
- **Duas franquias de IA:** os blogs separam os tokens do Juris.ai dos de análise de prazos e elaboração de propostas com IA. Nas tabelas desses blogs, a segunda franquia é Premium 3.000, Standard 5.000, Growth 8.000 e Growth+ 20.000 [F3][F25]. A tabela atual de planos mostra só uma coluna de tokens [F2].

### Work (agentes de IA)

- **O que a página descreve:** a pessoa descreve a tarefa em linguagem natural; o agente consulta o OS, a jurisprudência e ferramentas externas via MCP e entrega uma ação dentro do sistema, como um esboço de contestação salvo no processo e um relatório enviado à agenda para revisão. O exemplo da página leva 72 segundos até a peça salva (ilustrativo) [F6].
- **Contexto:** declara sete camadas (dados do contencioso e consultivo, carteira de clientes, jurisprudência, estado do workflow, LGPD, modelos do escritório, execução no caso) [F6].
- **Jurisprudência:** diz ter mais de 4 milhões de decisões de STF, STJ, TST e TRFs, com link para o tribunal de origem [F6][F12]. A afirmação de que o sistema não inventa citações é da empresa; não achei teste independente.
- **Controladoria pelo agente:** captura intimações, classifica, calcula prazo e cadastra na agenda do advogado responsável, com exceções para uma pessoa [F6]. É a promessa que, no OS, a ajuda descreve como passo manual.
- **Cobrança:** por execução. Pesquisa simples, geração de peça e análise de contrato têm tarifação diferente, definida numa calculadora na contratação [F6].
- **Inconsistências na própria página:** a FAQ cita planos Essential, Practice e Scale que não existem na tabela de preços; o número de MCPs varia entre 100 e 5.254 [F6][F13].
- **Webinar:** descreve um caso em que o agente analisa as publicações do dia, identifica prazos, detecta conflito de audiência, notifica o advogado, abre solicitação no Legal Ops depois de aprovação e gera relatório. Não mostra telas [F28].

### Legal Ops (BPO jurídico)

- **O que é vendido:** controladoria (captura e triagem de intimações, conferência de prazos), audiências, diligências e petições, por plano mensal de créditos, em que cada crédito corresponde a uma demanda [F8][F1].
- **Quem executa, segundo a página comercial:** equipe EasyJur de advogados e engenheiros jurídicos, com prestadores qualificados e ranqueados por desempenho [F8].
- **Quem executa, segundo os termos de uso:** advogados correspondentes independentes. A EasyJur atua como "intermediadora tecnológica", faz o casamento entre a demanda e o prestador, não tem vínculo com os prestadores e não garante resultado processual. A relação de cada ordem de serviço é entre o solicitante e o prestador [F9]. Esta é a divergência mais importante do módulo.
- **Prazos nos termos (dias úteis):** diligência e protocolo até 3; embaixadas, consulados e certidões até 5; petição de 5 a 10 conforme o cálculo; publicações da controladoria tratadas em até 24 horas úteis; pedido urgente tem acréscimo de 50% [F9]. A página comercial dá outros números: captura em 4 horas, minuta repetitiva em 48 horas e, nos planos, 4 dias para peças [F8][F1].
- **Qualidade:** a página fala em revisão humana, sócio que revisa e assina, aprovação obrigatória em peça crítica e uma rodada de ajustes inclusa; ao mesmo tempo anuncia refação zero [F8]. Os termos dão 2 dias úteis para pedir revisão depois da entrega [F9].
- **Contrato:** franquia mensal com créditos válidos por 30 dias, sem reembolso nem transferência dos não usados; fatura consolidada com vencimento até o dia 20; reajuste anual pelo IGPM; multa de 2% e juros de 1% ao mês em atraso, com protesto e negativação previstos; rescisão com aviso prévio de 60 dias, sem devolução do já pago; cancelamento de uma ordem depois de iniciada pode ser cobrado por inteiro; responsabilidade limitada ao valor do serviço [F9]. Os termos também dizem que a EasyJur não responde por publicações fora da plataforma, que o cliente deve cadastrar corretamente os termos monitorados e que o advogado responsável continua responsável pela conferência dos prazos. Não há SLA de disponibilidade da plataforma [F34]. Os termos não tratam de uso de IA.
- **Onboarding:** cerca de 7 dias (kickoff, diagnóstico, mapeamento de modelos, configuração, piloto, operação plena) [F8].

### Talk (WhatsApp) e CRM

- **O que diz fazer:** atendimento por IA 24 horas, qualificação com área do direito, urgência e score, agendamento consultando Google Agenda ou Outlook com link de Meet ou Zoom, conversas registradas no CRM do OS com follow-up e tags por área, e aviso de andamento ao cliente por WhatsApp. Usa a API oficial da Meta [F10][F11].
- **Preço: fontes divergem.** A página de planos lista R$ 499, R$ 999 e R$ 1.990 por mês por faixa de usuários (6, 15 e 40), mais R$ 880 de implantação [F1]. A própria página do Talk também diz R$ 197 por mês por número e R$ 297 por advogado para o OS, valores que não batem com a tabela do OS. A página também não esclarece se a cobrança é por número ou por usuário [F10].
- **Não informado:** volume de mensagens, limite de uso da IA, quantos números por plano e custo cobrado pela Meta [F10].
- **CRM (Novos negócios):** kanban com valor total e quantidade por coluna, proposta gerada de um modelo de documento e enviada por e-mail e WhatsApp, com aprovação ou recusa do cliente e link copiável. A página não trata de contrato nem de conversão do negócio em cliente ou processo [D12]. Um usuário de 2023 disse que o CRM não funcionou bem para ele [U1].

### Relatórios, permissões e auditoria

- **Dashboard:** 14 indicadores (aniversariantes, agenda, compromissos, contratos por status, processos por advogado, por área e por status, projetos consultivos, tarefas concluídas por colaborador, indicador financeiro, fluxo de caixa, novos negócios, publicações), com layout em colunas, filtros por indicador e cada indicador respeitando a permissão do módulo de origem. Em Processos, Projetos e Novos Negócios o usuário vê todos ou só os seus conforme o perfil [D14].
- **Exportação:** a ajuda de dashboard não descreve. Processos e pessoas exportam em PDF e Excel [D20][D1].
- **Relatórios avançados com envio automático:** só no Growth+ [F2][F5].
- **Auditoria:** histórico de ações em Configurações, por módulo, com usuário, data e hora; linha do tempo nos cadastros e nos termos monitorados [D6][D15][D21]. Não achei documentação de retenção do histórico.

### Portal do cliente e aplicativo

- **Portal:** só encontrei descrição em páginas comerciais: o cliente acompanha andamentos e documentos liberados pelo advogado, com canal de mensagem [F21]. Na ajuda, a categoria de pessoas diz que existe um artigo separado de Área do Cliente, que não consegui abrir [D20]. A tabela de planos diz acesso de clientes ilimitado a partir do Premium [F2].
- **Aplicativo:** um blog de janeiro de 2025 (atualizado em 30/03/2026) diz que o app é nativo para iOS e Android, com consulta de processos, prazos, documentos e comunicação com clientes [F22]. A página do OS não menciona app [F5], e outro blog, de 2022, fala de aplicativo em geral sem descrever funções [F32]. As buscas que fiz nas lojas só trouxeram o aplicativo JUR:easy, que parece ser outro produto, de estudo para direito. Um agregador de software, segundo o resumo da busca, diz que não há app dedicado, mas não abri essa página. Resultado: **app não confirmado**.

### Importação, migração e implantação

- **Importação por conta própria:** só no plano Premium, por CSV com ponto e vírgula, no máximo 100 linhas por arquivo e um cliente principal por arquivo. Exige IDs de arquivos de apoio (advogado, parte contrária, juiz, tribunal, comarca, tipo de ação, rito e outros) e não aceita .xlsx. A ajuda não menciona andamentos, documentos nem importação por OAB [D24].
- **Migração assistida:** a página diz que é serviço adicional, fora dos planos, em 5 etapas (diagnóstico, mapeamento, importação, piloto em paralelo, virada), com prazo de até 7 dias e sistemas de origem como Astrea, ADVBOX, Legal One e Projuris, mais planilhas [F14]. Um blog de janeiro de 2025 só diz que há onboarding assistido, sem sistemas de origem, prazo nem custo [F24].
- **Divergências:** a página de planos lista migração assistida em até 30 dias junto ao teste grátis [F1]; a página de suporte fala em 7 a 30 dias [F15]; um resultado de busca atribuiu a outra página a frase de que a equipe migra de graça, o que contraria o custo adicional (não conferi esse trecho) [F14]; o blog de implantação não dá prazo e fala em semanas, não em meses [F23].
- **Implantação:** o blog descreve seis etapas, e cabe ao escritório mapear as peças mais usadas e criar os modelos [F23]. Existem cursos de implantação (Start e Standard) na Legal Academy [F30].

### Integrações e API

- **Tribunais:** a página diz PJe, e-SAJ, PROJUDI, e-Proc, STJ, STF, TST e INSS, com cobertura de cerca de 99% do volume processual [F13]; outra página fala em mais de 200 sistemas [F16]. Nenhuma é lista auditável. O link com a lista de tribunais da ajuda não foi aberto.
- **Google, Microsoft e outros:** Google Agenda, Gmail e Drive (sincronização), Outlook, OneDrive e Teams, Asaas, e outros (Conta Azul, Totvs, SAP, Omie, Power BI, Zapier, Make, n8n) via API ou conectores [F13].
- **API:** mais de 200 endpoints REST documentados, OAuth 2.0, webhooks com nova tentativa, SDKs em Python, Node.js e PHP, MCP para Claude, ChatGPT e Gemini [F13]. Vendida por créditos, de R$ 70 a R$ 799 por mês [F1]. A página cita limites de 100 mil requisições (Professional) e ilimitado (Enterprise), nomes que não existem na tabela de preços do OS [F13].
- **Servidor MCP de terceiros:** existe um repositório de terceiros que lista cerca de 47 ferramentas; não é documentação oficial [T4].

### LGPD e segurança

- **Política de privacidade:** cita consentimento, obrigação legal, execução de contrato, defesa em processo e legítimo interesse; compartilha com provedores de nuvem e de publicidade (Google Ads, Google Analytics, AWS). Para os dados que o cliente insere no sistema, a EasyJur diz atuar como operadora e deixa ao cliente o papel de controlador [F18].
- **IA:** a política **não menciona inteligência artificial nem treinamento de modelos**, apesar de a EasyJur vender agentes [F18]. Os termos do Legal Ops também não tratam de IA [F9]. Não encontrei documento público dizendo se os dados do escritório alimentam modelos.
- **Onde ficam os dados:** a política fala em servidores e backups no Brasil e também nos Estados Unidos, hospedagem na Microsoft Azure [F18]; a página de migração fala em data center no Brasil [F14]; uma página do site, segundo resultado de busca que não abri, fala em AWS, Azure e GCP. Fontes divergem.
- **Segurança declarada:** criptografia em trânsito e em repouso, autenticação em duas etapas, backups diários, monitoramento 24 horas [F18], e registros de auditoria que a página do OS chama de imutáveis [F5]. Não achei certificação (como ISO 27001) da própria EasyJur. No Legal Ops, os termos prometem aviso de incidente em 24 horas e sigilo por 5 anos [F9].

### Suporte e treinamento

- **Canais e horário:** chat no sistema, WhatsApp e e-mail das 9h às 17h em dias úteis; tickets com atendimento 24 horas em fins de semana e feriados. A página promete primeira resposta em menos de 2 minutos em dia útil, sem SLA por plano [F15].
- **Gerente de Sucesso:** acompanha a adoção e faz revisão trimestral. A página diz que vem a partir do Standard em um trecho e cita planos Professional e Enterprise em outro [F15]. Outra página cita suporte VIP só no Growth Plus [F22].
- **Material:** central de ajuda com 15 categorias na página inicial e, segundo a EasyJur, mais de 150 artigos [D1][F15]; Legal Academy com 10 itens, todos rotulados como livres, entre eles dois cursos de implantação [F30]. A página de vídeos de demonstração não lista vídeos e remete ao canal do YouTube, que não consegui ler [F31].

### Onde as fontes divergem

| Assunto | Versão A | Versão B |
|---|---|---|
| Preços do OS | R$ 229, 499, 990, 2.290 e 3.790 [F1][F2] | R$ 389, 599, 1.699 e 2.799 nas tabelas antigas, ainda presentes em blogs atualizados em outubro de 2026 [F3][F4][F23] |
| Talk | R$ 499, 999 e 1.990 mais R$ 880 [F1] | R$ 197 por número e R$ 297 por advogado no OS [F10] |
| Quem faz o Legal Ops | Equipe dedicada da EasyJur [F8] | Correspondentes independentes, EasyJur só intermedia [F9] |
| SLA de peça no Legal Ops | 4 dias nos planos, 48 horas para minuta repetitiva [F8][F1] | 5 a 10 dias úteis nos termos [F9] |
| IA na publicação | Sem intervenção humana e cria a tarefa [F25] | Clique em **Executar Análise** e depois **Cadastrar Prazo** [D2] |
| Conta digital | Gratuita em todos os planos, no texto do blog [F19] | Marcada só de Premium em diante, na lista de preços do mesmo blog [F19] |
| Migração | Serviço adicional, até 7 dias [F14] | Listada junto ao teste grátis, em até 30 dias [F1] |
| Assinatura digital | Integrada, ou DocuSign e D4Sign [F21][F5] | Em breve [F4] |
| Lançamento da estrutura | Maio de 2026, segundo nosso levantamento anterior | Evento de lançamento em 25 de agosto, sem o ano na página [F27][F11] |
| Aplicativo | Nativo iOS e Android [F22] | Sem ficha em loja nas buscas, sem menção na página do OS [F5] |

## Planos e preços

Valores vistos em 02/11/2026. Todos são preços de tabela do fornecedor. O consumo acima da franquia (documentos, pushs, usuários, distribuição de processos, tokens) é cobrado à parte, e há acréscimo de IVA (IBS e CBS): a página fala em alíquota de teste de 1% em 2026, com referência de longo prazo de cerca de 26,5%. A taxa de adesão do OS existe, mas o valor não é público [F1][F2].

### A combinação

| Combinação | A partir de, por mês |
|---|---|
| Só OS | R$ 229 |
| OS + Work | R$ 949 |
| OS + Work + Legal Ops | R$ 2.749 |

### EasyJur OS

| Plano | Por mês | Usuários | Processos | Pushs | Advogados com intimações ilimitadas | GED | Tokens de IA | Workflow |
|---|---|---|---|---|---|---|---|---|
| Start | R$ 229 | até 2 | ilimitados | 100 | 1 | 10 GB | 10.000 | não listado |
| Premium | R$ 499 | até 5 | ilimitados | 300 | 1 | 20 GB | 20.000 | básico |
| Standard | R$ 990 | até 10 | ilimitados | 1.000 | 2 | 40 GB | 50.000 | avançado |
| Growth | R$ 2.290 | até 15 | ilimitados | 2.000 | 3 | 80 GB | 100.000 | avançado |
| Growth+ | R$ 3.790 | a partir de 30 | ilimitados | 5.000 | 10 | 200 GB | 300.000 | avançado |

**O que cada plano acrescenta:**

- **Start:** sem agentes de IA nativos e sem acesso de cliente indicado.
- **Premium:** agentes de IA nativos, acesso de clientes ilimitado, workflow básico, importação de processos por CSV (a ajuda diz que a função é exclusiva deste plano) [D24].
- **Standard:** workflow avançado.
- **Growth:** campos personalizados.
- **Growth+:** relatórios avançados com envio automático.
- Módulos básicos (Premium), profissionais (Standard), extras (Growth) e avançados (Growth+) são contratados à parte. A API é outro produto [F1][F2].

**Tarifas unitárias:** boleto R$ 2,90 por boleto compensado e nota fiscal R$ 2,50 por nota [F2].

### EasyJur Work (sempre junto com o OS)

| Plano | Por mês | Execuções por mês | GED |
|---|---|---|---|
| Start | R$ 720 | 230 | 10 GB |
| Premium | R$ 1.499 | 480 | 50 GB |
| Standard | R$ 2.999 | 990 | 50 GB |
| Growth | R$ 4.499 | 1.490 | 200 GB |
| Growth Plus | R$ 8.880 | 2.900 | 200 GB |

Usuários, agentes e skills ilimitados. Cobrança por tarefa executada, não por token [F1][F6].

### EasyJur Legal Ops

| Plano | Créditos | Por mês | Setup | Demandas por mês | Público indicado |
|---|---|---|---|---|---|
| Start | 30 | R$ 1.800 | R$ 900 | até 10 | advogado solo |
| Premium | 60 | R$ 3.000 | R$ 1.200 | até 20 | pequeno escritório |
| Standard | 120 | R$ 5.400 | R$ 1.800 | até 40 | médio escritório |
| Growth | 200 | R$ 8.000 | R$ 2.790 | até 60 | grande escritório |

Todos com SLA de 4 dias para peças, relatório mensal de ROI e uma rodada de ajustes. Standard e Growth incluem API [F1].

### Talk e API

| Talk | Usuários | Mensalidade | 1º mês com implantação de R$ 880 |
|---|---|---|---|
| Standard | 6 | R$ 499 | R$ 1.379 |
| Growth | 15 | R$ 999 | R$ 1.879 |
| Growth Plus | 40 | R$ 1.990 | R$ 2.870 |

| API (1 requisição = 1 crédito, sem acúmulo) | Por mês |
|---|---|
| 10.000 créditos | R$ 70 |
| 20.000 | R$ 149 |
| 40.000 | R$ 299 |
| 80.000 | R$ 499 |
| 160.000 | R$ 799 |

### Condições e plano gratuito

- **Teste:** 7 dias, sem cartão, importa até 50 processos [F1].
- **Fidelidade e multa do OS:** não encontrei os termos de uso do software, só os do Legal Ops. Dois relatos citam multa de 30% por rescisão antecipada, um em avaliação de 2022 [U1] e outro em reclamação no Reclame Aqui, sem data confirmada, em que a empresa defende a cláusula assinada e o contrato é de 12 meses [U4]. Não consegui confirmar a cláusula no contrato.
- **Plano gratuito:** em 2020, o convênio OAB/RJ e CAARJ ofereceu plano gratuito de até 500 processos e 15 GB para advogados do Rio de Janeiro [T1]. Uma página de terceiro fala em versão gratuita via 13 seccionais da OAB. Não sei se continua e não há plano gratuito na tabela atual.
- **Escala declarada:** em 2024, a imprensa de startups noticiou mais de 1.300 clientes e 60 mil advogados, e equipe de 60 pessoas (autodeclarado à imprensa) [T2][T5]. O site de 2026 fala em rede de 30.000 advogados [F12]; os números não são comparáveis.

## O que os usuários relatam

Avaliações públicas que achei são poucas e antigas. Elas descrevem o produto como era antes da reorganização em OS, Work e Legal Ops, então servem como alerta de temas, não como retrato do produto atual.

### B2B Stack [U1]

- **Resumo:** nota 3,6 de 5, 13 avaliações. Por critério: facilidade de uso 4,2, custo-benefício 4,0, recursos 3,9, suporte 3,8. As avaliações que li vão de 12/07/2021 a 24/05/2023. Sete das dez da primeira página são de 23 e 24/05/2023, quase todas com nota máxima; uma é de consultor ligado à EasyJur.
- **Elogios:** módulo financeiro, organização de processos em pastas, workflow, integração entre módulos, conta digital, nota fiscal e rateio por centro de custo, filtros e relatórios, implantação, suporte presente.
- **Críticas:**
  - Busca de andamentos e intimações com erro, lentidão e sistema difícil de usar (2021 e 2022).
  - Suporte difícil de encontrar depois da implantação e atendimento só por formulário (2022 e 2023).
  - Não traz o conteúdo da publicação, obrigando a ir ao PJe (2023).
  - CRM com problemas (2023).
  - Falta de agenda e de sincronização com o Google Agenda (2021).
  - Falta de assinatura digital (um relato, 2023).
  - Multa de 30% por rescisão antecipada (2022).

### Reclame Aqui [U2][U3][U4][U5][U6][U7]

**Aviso:** a página do Reclame Aqui não abriu para mim (erro 403). Os dados abaixo vêm de resumos de resultados de busca e do nosso levantamento anterior ([03-concorrencia-brasil.md](../pesquisa/2026-10-31-anexos/03-concorrencia-brasil.md)), e não conferi cada reclamação na página.

- **Reputação:** sem selo de reputação, por ter menos de 10 reclamações avaliadas. O levantamento anterior registrou 8 reclamações no semestre, resposta em 7 dias e 21 horas e problemas de qualidade do produto (7), propaganda enganosa (7) e cancelamento (6).
- **17/09/2026, falhas diárias:** escritório que usa o sistema para controle de prazos relatou falhas quase diárias sem retorno. Segundo o levantamento anterior, a empresa atribuiu o problema a credenciais de tribunal desatualizadas e a filtros que marcavam publicações como lidas desde dezembro de 2024 [U3].
- **Julho de 2026:** cancelamento sem resposta e suporte considerado inexistente.
- **Cancelamento e multa (sem data confirmada):** reclamação sobre multa de 30% em contrato de 12 meses, com a empresa respondendo que a cláusula assinada reflete o acordo [U4]; outra sobre cobrança mantida durante quatro dias de instabilidade [U5].
- **Outros títulos:** comentários apagados no Instagram da empresa [U6] e queixa de falta de transparência [U7]. Não abri o conteúdo.
- **Também no levantamento anterior (não reaberto):** acesso bloqueado com a mensalidade paga (29/10/2026) e mais de um mês sem conseguir reduzir usuários.

### Onde não encontrei nada

- **Capterra:** não achei a página de produto com nota e avaliações. Só um artigo da Capterra Brasil de cerca de 2024, que cita o EasyJur numa lista sem nota [T3].
- **Lojas de aplicativos:** nenhuma ficha do EasyJur.
- **Vídeos e canal do YouTube:** o site remete ao canal, mas não consegui ler os títulos nem as descrições.

## O que não foi possível verificar

- **Uso real.** Não vi nenhuma tela. A ajuda descreve telas em texto, mas tudo que está acima é lido, não testado.
- **Cálculo de prazo.** Não achei documentação da calculadora, nem se feriado local e suspensão de tribunal entram. Não testei.
- **Cobertura de tribunais e periodicidade geral.** A lista de tribunais da ajuda é um link que não abri, e a coleta de intimações é descrita como periódica, sem número.
- **Teste grátis.** Não abri o formulário. Não sei quem libera o teste nem se há alternativa de autoatendimento. O relato do nosso usuário não foi reproduzido.
- **Termos de uso e contrato do OS.** Só achei os termos do Legal Ops. Fidelidade, multa de rescisão, SLA de disponibilidade e responsabilidade por prazo no OS ficam sem confirmação.
- **Valor da taxa de adesão do OS e da migração assistida.** Não publicados.
- **Honorários, repasse e régua de cobrança.** Só páginas comerciais. A ajuda não tem artigo de faturamento; um guia de faturamento por hora citado em buscas não foi aberto.
- **Portal do cliente.** Só material comercial; não abri o artigo de Área do Cliente.
- **Aplicativo.** Existência, plataformas e funções não confirmadas.
- **Work.** Quais ações exigem aprovação humana, e se o desempenho declarado (tempo, ausência de alucinação, 92% sem intervenção) vale fora de exemplos.
- **Reclame Aqui e canal do YouTube.** Não abriram.
- **Dados do cliente e IA.** A política não diz se os dados do escritório treinam modelos.

## O que levar para o Decreta

1. **Mostrar o estado de cada conexão de captura.** O EasyJur tem **Monitorando** e **Precisa de atenção**, e-mail diário e e-mail imediato de erro. É o mínimo, e mesmo assim o caso de 17/09/2026 envolveu credencial desatualizada e filtro que silenciava publicação. Vale a regra: nenhuma publicação pode sumir da lista sem registro de quem ou o que a marcou como lida, e o painel deve alertar quando a captura para.
2. **Filtro de leitura automática com cuidado.** O EasyJur tem um botão que cadastra de uma vez 13 filtros comuns, que marcam como lida na entrada, e a leitura fica no nome do sistema, não de uma pessoa. Se o Decreta tiver algo parecido, deve sugerir em vez de aplicar e listar tudo que foi silenciado.
3. **Agrupar publicações repetidas.** O mesmo teor chega por Diário, PJe e eproc. O agrupamento com percentual e comparação lado a lado reduz retrabalho; o risco descrito pela própria ajuda é a ação em massa propagar um prazo errado. Não verifiquei se o Decreta já agrupa.
4. **Não prometer o que o produto não mostra.** A distância entre o blog (sem intervenção humana) e a ajuda (dois cliques da pessoa) é o contrário do que queremos. Manter a confirmação humana e dizer o que a IA fez e o que não fez, como já acontece com a frase do teor.
5. **Regra de prazo visível.** O EasyJur diz considerar feriado local e suspensão, mas não mostra a regra na ajuda de agenda. A regra explicada e confirmada pela pessoa, que já é nosso ponto de partida, é o contraponto mais claro. Não afirmo que o EasyJur erra: não testei.
6. **Teste grátis sem formulário.** O caminho mais curto até a primeira publicação lida é o que falta ao EasyJur, pelo relato de 02/11/2026. Se o Decreta abrir a conta sem conversa comercial, isso vira argumento. Vale o Decreta registrar o próprio tempo de cadastro até o primeiro valor.
7. **Preço que cabe numa frase.** O EasyJur tem cinco produtos (OS, Work, Legal Ops, Talk e API), cinco medidores de consumo, taxa de adesão sem valor, excedente à parte e IVA. As queixas recorrentes são cancelamento, multa e cobrança. Preço único, com IA e captura incluídos e cancelamento claro, atende direto essas queixas.
8. **Software, BPO e IA em uma fatura são contratos distintos.** Os termos do Legal Ops limitam a responsabilidade ao valor do serviço, não reembolsam crédito e pedem 60 dias de aviso. Se o Decreta algum dia oferecer serviço humano, o termo deve ser dito de forma simples, sem uma página comercial dizendo equipe própria e outra dizendo correspondente.
9. **Conta digital, boleto e nota na mesma cobrança.** O EasyJur usa Asaas e publica tarifa unitária (boleto R$ 2,90, nota R$ 2,50). Serve de referência de preço se o Decreta entrar em financeiro. Não encontrei repasse a clientes em nenhuma das fontes lidas, o que pode ser espaço para o Decreta, junto com alvarás.
10. **Importação por OAB.** A importação do EasyJur é CSV de 100 linhas só no plano Premium, com IDs de planilha de apoio, sem menção a OAB. O Astrea traz o acervo por busca em lote pela OAB. Trazer o acervo no primeiro dia é um ponto em que o Decreta pode ficar à frente de ambos.
11. **Documentar as limitações por tribunal.** A ajuda do EasyJur diz com todas as letras que o TJAP não é contínuo e que segredo de justiça não entra no push. Isso é bom: o usuário sabe onde conferir. O Decreta deve ter uma página de cobertura por tribunal com o que funciona e o que não.

## Fontes

Todas consultadas em 02/11/2026. Datas entre parênteses são as que a própria página mostra. Páginas do fornecedor são autodeclaradas.

### Fornecedor [F]

- [F1] Planos e preços (OS, Work, Legal Ops, Talk, API, teste grátis): https://easyjur.com/planos-e-precos-easyjur/
- [F2] Planos do OS, recursos por plano e tarifas: https://easyjur.com/planos/
- [F3] Blog, guia da IA (09/02/2025, atualizado em 10/2026): https://easyjur.com/blog/guia-completo-para-usar-a-inteligencia-artificial-da-easyjur/
- [F4] Blog, automação jurídica (17/03/2026, atualizado em 10/2026): https://easyjur.com/blog/automacao-juridica/
- [F5] Página do EasyJur OS: https://easyjur.com/easyjur-os/
- [F6] Página do EasyJur Work: https://easyjur.com/easyjur-work/
- [F7] Work em ação: https://easyjur.com/easyjur-os-easyjur-work-em-acao/
- [F8] Legal Ops: https://easyjur.com/legal-ops/
- [F9] Termos de uso do Legal Operations: https://easyjur.com/termos-de-uso-legal-operations/
- [F10] Talk, CRM no WhatsApp: https://easyjur.com/easyjur-talk-crm-no-whatsapp/
- [F11] Blog, Talk e WhatsApp integrado: https://easyjur.com/blog/easyjur-talk-whatsapp-integrado/
- [F12] Página inicial: https://easyjur.com/
- [F13] API e integrações: https://easyjur.com/easyjur-os-api-e-integracoes/
- [F14] Migração assistida: https://easyjur.com/easyjur-os-migracao/
- [F15] Suporte e treinamento: https://easyjur.com/easyjur-os-suporte-e-treinamento/
- [F16] Fluxos de trabalho: https://easyjur.com/easyjur-os-fluxos-de-trabalho/
- [F17] OS para administradores jurídicos: https://easyjur.com/easyjur-os-para-administradores-juridicos/
- [F18] Política de privacidade e LGPD: https://easyjur.com/politica-de-privacidade-e-lgpd/
- [F19] Blog, conta digital (31/03/2026, atualizado em 15/10/2026): https://easyjur.com/blog/conta-digital-advogados/
- [F20] Blog, teste grátis: https://easyjur.com/blog/teste-gratis-easyjur-software-juridico/
- [F21] Blog, principais recursos (30/01/2025): https://easyjur.com/blog/principais-recursos-do-easyjur-que-todo-advogado-deveria-conhecer/
- [F22] Blog, experiência do usuário e app (28/01/2025, atualizado em 30/03/2026): https://easyjur.com/blog/experiencia-do-usuario-no-easyjur-um-guia-detalhado/
- [F23] Blog, implantação (09/02/2025): https://easyjur.com/blog/como-implementar-o-easyjur-no-seu-escritorio-de-advocacia/
- [F24] Blog, por que migrar (07/01/2025): https://easyjur.com/blog/por-que-os-advogados-estao-migrando-para-o-easyjur
- [F25] Blog, integração com IA (09/02/2025): https://easyjur.com/blog/integracao-da-easyjur-com-ia-o-que-isso-significa-para-o-seu-escritorio/
- [F26] Blog, prazo em dias úteis ou corridos (29/04/2025): https://easyjur.com/blog/prazo-processual-dias-uteis-ou-corridos/
- [F27] Lançamento oficial: https://easyjur.com/lancamento-oficial-easyjur/
- [F28] Webinar, escritório agentivo: https://easyjur.com/webinar-escritorio-agentivo/
- [F29] Portal de jurisprudências: https://easyjur.com/juris/home/
- [F30] Legal Academy: https://legalacademy.easyjur.com
- [F31] Vídeos de demonstração: https://easyjur.com/veja-nossos-videos-de-demonstracao/
- [F32] Blog, aplicativo para advogados (04/08/2022): https://easyjur.com/blog/aplicativo-para-advogados/
- [F33] Roadmap (a página não trouxe lista de itens): https://easyjur.com/roadmap/
- [F34] Termos citados na busca como página de termos (a mesma do Legal Ops): https://easyjur.com/?p=20627

### Central de ajuda [D]

- [D1] Página inicial: https://doc.easyjur.com
- [D2] Análise de publicações com IA: https://doc.easyjur.com/docs/analise-de-publicacoes-com-ia/
- [D3] Push e captura de andamentos: https://doc.easyjur.com/docs/como-ativar-o-push-e-capturar-andamentos-processuais/
- [D4] Erro no push e credenciais: https://doc.easyjur.com/docs/erro-no-push-ou-no-cadastro-do-sistema-do-tribunal-o-que-fazer/
- [D5] Similaridade de publicações: https://doc.easyjur.com/docs/similaridade-de-publicacoes/
- [D6] Quem leu uma publicação: https://doc.easyjur.com/docs/como-identificar-quem-leu-uma-publicacao-ou-intimacao/
- [D7] Cadastrar agendamentos: https://doc.easyjur.com/docs/cadastrar-agendamentos-easyjur/
- [D8] Juris.ai, visão geral: https://doc.easyjur.com/docs/juris-ai-ferramenta-de-ia-advogados/
- [D9] Juris.ai, redação de peças: https://doc.easyjur.com/docs/jurisai-redacao-pecas-juridicas/
- [D10] Juris.ai, conselheiro jurídico: https://doc.easyjur.com/docs/jurisai-conselheiro-juridico/
- [D11] SmartDocs: https://doc.easyjur.com/docs/smart-docs-gerador-inteligente-de-documentos/
- [D12] Novos negócios (LCRM): https://doc.easyjur.com/docs/novos-negocios/
- [D13] Processos distribuídos: https://doc.easyjur.com/docs/processos-distribuidos/
- [D14] Nova dashboard: https://doc.easyjur.com/docs/a-nova-dashboard-easyjur-uma-evolucao-para-a-gestao-juridica/
- [D15] Leitura de andamentos em massa: https://doc.easyjur.com/docs/como-realizar-leitura-de-andamentos-em-massa/
- [D16] Login do TJAP Tucujuris: https://doc.easyjur.com/docs/cadastro-login-tjap-tucujuris-intimacoes/
- [D17] Automação de procurações: https://doc.easyjur.com/docs/automacao-modelos-de-procuracoes/
- [D18] Push para STF e STJ: https://doc.easyjur.com/docs/push-processos-stf-stj/
- [D19] Débitos e compras: https://doc.easyjur.com/docs/debits-e-compras/
- [D20] Cadastro de pessoas: https://doc.easyjur.com/docs/cadastro-de-pessoas/
- [D21] Termos monitorados (diários oficiais): https://doc.easyjur.com/docs/ativar-o-monitoramento-de-publicacoes-nos-diarios-oficiais/
- [D22] Login de intimações eletrônicas: https://doc.easyjur.com/docs/ativar-o-monitoramento-de-intimacoes-eletronicas/
- [D23] Filtros de intimações: https://doc.easyjur.com/docs/filtros-intimacoes-easyjur/
- [D24] Importação de processos externos: https://doc.easyjur.com/docs/importacao-processos-externos-easyjur/
- [D25] Receber andamentos por e-mail: https://doc.easyjur.com/docs/receber-andamentos-via-e-mail/
- [D26] Requisição de suprimentos: https://doc.easyjur.com/docs/requisicao-de-suprimentos/
- [D27] Vídeo, lançamento de workflows: https://doc.easyjur.com/docs/video-lancamento-de-workflows/

### Usuários [U]

- [U1] B2B Stack, avaliações do EasyJur (páginas 1 e 2): https://www.b2bstack.com.br/product/easyjur/avaliacoes e https://www.b2bstack.com.br/product/easyjur/avaliacoes?page=2
- [U2] Reclame Aqui, lista de reclamações (a página não abriu, erro 403; dados por resultado de busca): https://www.reclameaqui.com.br/empresa/easyjur/lista-reclamacoes/
- [U3] Reclame Aqui, falhas diárias (17/09/2026): https://www.reclameaqui.com.br/easyjur/meu-software-de-gestao-de-prazos-processuais-easyjur-apresenta-falhas-diarias-e-nao-tenho-retorno_dBVUG6AiYXB5N-4U/
- [U4] Reclame Aqui, multa abusiva: https://www.reclameaqui.com.br/easyjur/multa-abusiva-falam-mal-do-astrea-mas-entregam-1-3-do-que-o-astrea-ent__COeTLc6H6aojNCZ/
- [U5] Reclame Aqui, manutenções e instabilidade: https://www.reclameaqui.com.br/easyjur/manutencoes-instabilidade-irresponsabilidade-e-marketing-sem-fins_lkAGEXn9jrDb20HH/
- [U6] Reclame Aqui, comentários apagados no Instagram: https://www.reclameaqui.com.br/easyjur/empresa-apaga-comentarios-de-clientes-em-seu-instagram-que-possam-informar_qyPlc_UIgzsBMTmW/
- [U7] Reclame Aqui, transparência: https://www.reclameaqui.com.br/easyjur/transparencia-e-respeito-nao-e-o-forte-da-empresa_1rzcmSVWDlOMQPFm/

### Terceiros [T]

- [T1] Migalhas, parceria OAB/RJ, CAARJ e EasyJur (16/11/2020): https://www.migalhas.com.br/quentes/336408/oab-rj--caarj-e-easyjur-se-unem-para-otimizar-dia-a-dia-de-advogados
- [T2] TechLeap, aporte de R$ 1,4 milhão (2024), com número de clientes e advogados: https://finder.techleap.nl/news/feed/easyjur-raises-r-1-4m-for-growth
- [T3] Capterra Brasil, softwares para advogados: https://www.capterra.com.br/blog/2206/softwares-advogados
- [T4] Repositório de terceiros com servidor MCP (não oficial): https://glama.ai/mcp/servers/mcp-dir/easyjur-mcp/tree
- [T5] Startupi, aporte de 2024 (tamanho da equipe; resultado de busca, página não aberta): https://startupi.com.br/?p=249801
