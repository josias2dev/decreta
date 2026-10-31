# Fronteira da IA jurídica (2025–2026) e o que dá para trazer para o Decreta

**Data da pesquisa:** 31/10/2026
**Frente:** recursos de IA jurídica mais avançados do mundo que podem ser adaptados a escritórios brasileiros pequenos e médios (celular primeiro, IA via Claude, princípio "a IA sugere; uma pessoa confirma").
**Método:** cerca de 60 buscas e leituras de páginas públicas (sites de produto, notas de versão, comunicados, blogs de produto, imprensa especializada, estudos acadêmicos, decisões noticiadas). Nenhuma conta foi criada e nenhum formulário foi preenchido. Os textos foram resumidos, sem cópia.

**Legenda de confiabilidade (usada ao lado de cada afirmação):**
- **[F]** afirmação do próprio fornecedor (site, comunicado, central de ajuda). Não foi verificada por terceiros.
- **[P]** imprensa especializada, analista ou agregador. Reporta, mas não testou.
- **[I]** evidência independente: estudo revisado por pares, tribunal, regulador, banco de dados mantido por pesquisador sem relação comercial com o produto.

---

## 1. Resumo executivo

1. **2026 é o ano do agente com plano e revisão humana.** Todos os líderes passaram de "chat que responde" para "agente que planeja, executa, confere o próprio trabalho e entrega para aprovação": Harvey Agents, Legora Agent/aOS, CoCounsel Legal de nova geração, Lexis+ com Protégé (Legal Intelligence Engine) e Clio Work em modo agêntico. Os melhores mostram o plano antes de executar e deixam a pessoa editar ([F] [Harvey, jul/2026](https://www.harvey.ai/blog/the-brief-july-2026); [P] [LawNext, ago/2026](https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html)).
2. **A pilha do Decreta está alinhada com a do mercado.** A nova geração do CoCounsel, da Thomson Reuters, foi construída sobre o Claude Agent SDK, da Anthropic. A LexisNexis embutiu habilidades jurídicas da Anthropic no Protégé. A Anthropic lançou 12 plugins jurídicos e mais de 20 conectores (MCP) para Claude ([F] [TR, 20/08/2026](https://www.thomsonreuters.com/en/press-releases/2026/august/thomson-reuters-launches-next-generation-of-cocounsel-legal-the-ai-ecosystem-built-for-legal-professionals); [P] [LawNext, 12/05/2026](https://lawnext.com/2026/05/anthropic-goes-all-in-on-legal-releasing-more-than-20-connectors-and-12-practice-area-plugins-for-claude.html)).
3. **A verificação virou produto.** A Thomson Reuters lançou o Deep Research Verify, que confere se a fonte citada sustenta a afirmação. A LexisNexis leva o Shepard's para dentro da redação. O Clearbrief gera relatório de conferência de citações. A Harvey anunciou que vai conferir rascunhos inteiros: existência do caso, exatidão da citação literal e adequação do precedente.
4. **As alucinações continuam reais e caras.** Ferramentas jurídicas com busca ainda erraram de 17% a 33% das consultas no estudo de Stanford, publicado em 2025 ([I] [Magesh et al., JELS 2025](https://onlinelibrary.wiley.com/doi/full/10.1111/jels.12413)). O melhor agente no benchmark de tarefas longas da Harvey (LAB) acerta 17,8% das tarefas por inteiro ([P] [Mercor/LAB](https://www.mercor.com/apex/partner-benchmarks/harvey-lab-leaderboard/)). O banco de casos de Damien Charlotin lista 2.246 decisões sobre conteúdo alucinado em processos, 41 delas no Brasil ([I] [Charlotin](https://www.damiencharlotin.com/hallucinations/)). No STF, o ministro Zanin oficiou a OAB por jurisprudência inexistente (Rcl 78890). Em 1º/10/2026, o ministro Moraes multou em R$ 5 mil um advogado que escondeu um comando para IA na petição. O comando foi detectado pelo "Maria Shield", módulo de segurança do STF ([P] [Poder360](https://www.poder360.com.br/poder-justica/moraes-multa-advogado-por-comando-de-ia-em-peticao/)).
5. **A melhor fonte de inspiração para escritório pequeno brasileiro não é o BigLaw.** São os produtos americanos para advocacia de autor (EvenUp, Eve, Supio) e de gestão de escritório (Clio, MyCase, Smokeball). Eles automatizam a operação: auditoria noturna da carteira, agentes que falam com cliente e terceiros, fila de próximas ações, automação graduada por risco, atendimento inicial 24 h. O EveOS formaliza o princípio do Decreta: dado de baixo risco entra sozinho, o de risco médio vira sugestão e o de alto risco exige confirmação ([F] [Eve](https://www.eve.legal/blogs/eve-is-now-eveos)).
6. **O MCP virou o padrão de integração.** A MyCase lançou um conector MCP para Claude, somente leitura, que respeita as permissões do usuário e exige plano Claude Team ou Enterprise ([F] [MyCase](https://www.mycase.com/integrations/mycase-mcp/)). Trellis e CoCounsel também expõem MCP.
7. **A segurança de referência ficou clara.** Os fornecedores exigem retenção zero (ZDR) nos provedores de modelo, proíbem treino com dados do cliente, isolam os dados por cliente, aplicam muros éticos herdados ("na dúvida, bloqueia"), mantêm registro de auditoria e só buscam documentos que o usuário pode ver ([F] [Harvey Security](https://www.harvey.ai/security); [F] [Harvey + Intapp](https://www.harvey.ai/blog/harvey-intapp-ethical-walls)).
8. **O dinheiro está concentrado.** A Harvey captou US$ 550 milhões com avaliação de cerca de US$ 15,5 bilhões e comprou a Guardrails AI (confiabilidade de agentes) em setembro de 2026. A Legora captou US$ 600 milhões com avaliação de US$ 5,5 bilhões. A Clio fechou a compra da vLex por US$ 1 bilhão. No Brasil, a Enter virou unicórnio com uma Série B de US$ 100 milhões ([P] [Artificial Lawyer](https://artificiallawyer.com/2026/09/09/harvey-raises-550m-at-15-5bn-val-buys-guardrails-ai); [P] [Crunchbase](https://news.crunchbase.com/venture/legal-tech-startuo-funding-down-ai-acquisitions-2026/); [P] [Bloomberg Línea](https://www.bloomberglinea.com.br/startups/enter-startup-brasileira-de-ia-juridica-atinge-us-12-bilhao-em-aporte/)).

**As dez ideias mais fortes para o Decreta (detalhes na seção 5):**
1. Verificador de citações antes de exportar a peça, com relatório de conferência.
2. Cada afirmação do resumo ou da peça ligada ao documento e à página dos autos.
3. Automação graduada por risco.
4. Auditoria noturna da carteira.
5. Atualização ao cliente em linguagem simples pelo WhatsApp, com aprovação.
6. Pré-rascunho automático quando chega a intimação.
7. Análise da peça da parte contrária.
8. Radar de precedentes qualificados (temas do STF e do STJ, IRDR) cruzado com a carteira.
9. Conector MCP do Decreta, somente leitura.
10. Programa próprio de avaliação (conjunto-ouro de prazos e resumos).

---

## 2. Cinco movimentos que definem a fronteira em 2026

| Movimento | O que mudou | Exemplos |
|---|---|---|
| **1. Do chat ao agente com plano** | O agente monta um plano, a pessoa aprova ou edita, ele executa várias etapas, confere o resultado e refaz o que não atendeu. Entrega arquivos Word, Excel e PowerPoint | Harvey Agents com aprovação do plano e tarefas em paralelo ([F] [Harvey](https://www.harvey.ai/blog/the-brief-july-2026)); Legora Agent "planeja, executa, revisa, entrega" ([F] [Legora](https://legora.com/product/agent)); Lexis "harness" com plano editável e autoconferência ([P] [LawNext](https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html)); Clio Work Agentic Mode, ligado por padrão, com "Classic Mode" para controle passo a passo ([P] [LawNext](https://lawnext.com/2026/04/clio-adds-agentic-ai-capabilities-to-clio-work-also-launches-vincent-mobile-app.html)) |
| **2. "Habilidades" do escritório** | O escritório escreve, em linguagem natural, como faz cada tarefa, e o agente segue esse jeito | Legora Skills, 7/10/2026 ([P] [Artificial Lawyer](https://www.artificiallawyer.com/category/legal-agents/)); Clio "skills infrastructure"; Lexis com centenas de skills, inclusive as da Anthropic; plugins da Anthropic que começam com uma entrevista para aprender playbook, escalonamento e estilo da casa ([P] [LawNext](https://lawnext.com/2026/05/anthropic-goes-all-in-on-legal-releasing-more-than-20-connectors-and-12-practice-area-plugins-for-claude.html)) |
| **3. A verificação como recurso** | Confere se a fonte citada sustenta a afirmação, não só se ela existe. Mantém registro da pesquisa e relatório de conferência | TR Deep Research Verify ([F] [TR, jun/2026](https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-june-2026-releases/)); Lexis Shepard's Verify; Clearbrief; roteiro da Harvey ([F] [Harvey, 22/09/2026](https://www.harvey.ai/blog/what-the-harvey-agent-changes-about-legal-research)) |
| **4. Laboratórios de IA entram direto + MCP** | Anthropic, OpenAI e Google lançam ofertas jurídicas. O MCP vira o padrão para ligar o modelo aos sistemas do escritório | Plugins e conectores da Anthropic; OpenAI "Astra for Law" ([P] [Bloomberg Law](https://news.bgov.com/business-and-practice/wake-up-call-openai-pushes-gpt-6-astra-deeper-into-big-law)); Google "Gemini Enterprise for Legal" ([F] [Google Cloud](https://www.googlecloudpresscorner.com/2026-08-25-Google-Cloud-Launches-Gemini-Enterprise-for-Legal)); MyCase MCP; Trellis no Claude e no ChatGPT |
| **5. Escritórios nativos em IA e preço fixo** | Empresas que são o próprio escritório, com responsabilidade profissional, preço fechado e IA no núcleo | Crosby ([P] [Global Legal Post](https://www.globallegalpost.com/news/cooley-backed-contract-review-start-up-crosby-raises-60m-in-fresh-funding-1011864931)); Garfield.Law, autorizado pela SRA ([I] [SRA](https://www.sra.org.uk/sra/news/press/garfield-ai-authorised?org=u139)); Lawhive; escritórios da turma de inverno 2026 da Y Combinator ([P] [Artificial Lawyer](https://www.artificiallawyer.com/2026/02/04/y-combinator-picks-3-newmods-general-legal-arcline-legalos/)) |

---

## 3. Como ler o panorama

- Cada empresa aparece com **recursos concretos**, o **problema que resolvem** e o **tipo de evidência**.
- Não encontrei nenhuma avaliação independente de 2026 sobre a exatidão dos produtos de "deep research" jurídica. Quase todos os números de desempenho são do fornecedor.
- Quando as fontes divergem, isso está registrado.

---

## 4. Panorama por empresa

### 4.1 Plataformas para escritórios grandes

#### Harvey (EUA)
| Recurso | Problema que resolve | Fonte |
|---|---|---|
| **Agentes**: a pessoa revisa e aprova o plano antes, roda várias tarefas ao mesmo tempo e é avisada quando terminam | Trabalho de várias etapas sem microgerenciar | [F] [The Brief jul/2026](https://www.harvey.ai/blog/the-brief-july-2026) |
| **Vault**: até 100 mil arquivos por projeto; **tabelas de revisão** com até 10 mil arquivos | Análise de grandes volumes (due diligence, revisão de documentos) | [F] [Ajuda Harvey](https://help.harvey.ai/articles/uploading-files-to-harvey) |
| **"Arquivo como contexto de coluna"**: anexa um modelo ou norma a uma coluna da tabela e cada linha é conferida contra ele | Conferência padronizada em escala | [F] [The Brief jul/2026](https://www.harvey.ai/blog/the-brief-july-2026) |
| **Ações agênticas na tabela**: o usuário altera a tabela em linguagem natural (disponível desde set/2026) | Menos cliques | [F] [Harvey](https://www.harvey.ai/blog/review-table-agent-actions) |
| **Workflow Builder**: cria agentes de fluxo em linguagem natural, que usam tabelas e bases de conhecimento (abr/2026) | Padronizar o "jeito da casa" | [F] [Notas de versão](https://help.harvey.ai/release-notes/category/workflows) |
| **Agente de pesquisa** sobre um acervo de mais de 8 milhões de decisões dos EUA, com grafo de "cita / é citado por" e citações no texto | Pesquisa que segue a cadeia de precedentes | [F] [Harvey, 22/09/2026](https://www.harvey.ai/blog/what-the-harvey-agent-changes-about-legal-research) |
| **Roteiro de verificação**: conferir se o argumento continua viável mesmo com precedente reformado, e conferir rascunhos inteiros (o caso existe? a citação literal está exata? o sinal "see"/"but see" e o resumo entre parênteses batem com a decisão?) | Citação falsa ou desvirtuada | [F] mesma fonte; ainda é **anúncio**, não lançamento |
| **Ask LexisNexis dentro da Harvey**, com o citador Shepard's (aliança de jun/2025) | Usar acervo e citador tradicionais | [P] [LawNext](https://www.lawnext.com/2025/06/legal-ai-platform-harvey-to-get-lexisnexis-content-and-tech-in-new-partnership-between-the-companies.html) |
| **Transcrição de áudio** com identificação de quem fala; **foto de anotações à mão** no iOS; ditado nos complementos do Word e do Outlook | Captura de informação fora do computador | [F] [The Brief jul/2026](https://www.harvey.ai/blog/the-brief-july-2026) |
| **Intake, Connector Library** (MCP próprio) e **orquestração de trabalho** entre agentes e pessoas | Integração e distribuição de tarefas | [F] idem |
| **Muros éticos via Intapp**: a política é sincronizada e, quando não dá para confirmar o acesso, a Harvey bloqueia; há registro de tentativas | Conflito de interesses e sigilo | [F] [Harvey + Intapp](https://www.harvey.ai/blog/harvey-intapp-ethical-walls) |
| **Segurança**: exige ZDR dos provedores de modelo, proíbe treino, separa dados por cliente, oferece regiões (UE, Suíça, Austrália, EUA), SOC 2 Tipo II, ISO 27001 e 42001, SSO e registro de auditoria | Confiança de grandes escritórios | [F] [Harvey Security](https://www.harvey.ai/security) |
| **LAB**, benchmark aberto de agentes: mais de 1.200 tarefas, mais de 75 mil critérios de rubrica, nota "tudo ou nada" | Medir agentes em tarefas longas | [F] [Harvey](https://harvey.ai/blog/introducing-harveys-legal-agent-benchmark); [P] maior nota no placar: 17,8% ([Mercor](https://www.mercor.com/apex/partner-benchmarks/harvey-lab-leaderboard/)) |
| **Compra da Guardrails AI** (infraestrutura de confiabilidade e simulação de agentes) | Confiabilidade dos agentes | [F] [Harvey](https://www.harvey.ai/blog/guardrails-ai-joins-harvey); [P] [Artificial Lawyer](https://artificiallawyer.com/2026/09/09/harvey-raises-550m-at-15-5bn-val-buys-guardrails-ai) |

Observação: um agregador menciona um anúncio "Introducing Harvey II" em 18/08/2026. Não consegui confirmar.

#### Legora (Suécia/EUA)
| Recurso | Problema | Fonte |
|---|---|---|
| **Legora aOS** e **Agent** (7/5/2026): planeja, usa todas as ferramentas da Legora (busca, redação, redline, revisão), confere se atingiu o objetivo e entrega Word, Excel e PowerPoint para aprovação | Trabalho completo, não só respostas | [F] [Legora](https://legora.com/newsroom/legora-introduces-the-legora-aos-the-agentic-operating-system-for-legal-work); [F] [Agent](https://legora.com/product/agent) |
| **Agente proativo**: acompanha e-mail, documentos e projetos e age quando algo precisa de atenção | Nada fica esquecido | [F] [Agent](https://legora.com/product/agent) |
| **Skills**: instruções reutilizáveis com o padrão da equipe (out/2026) | Consistência | [F] idem; [P] [Artificial Lawyer](https://www.artificiallawyer.com/category/legal-agents/) |
| **Tabular Review** e **Monitors** (varredura regulatória) | Revisão em massa; acompanhamento de mudanças | [P] [listagem de produto](https://apis.io/providers/legora/) |
| **Portal**: espaço com a marca do escritório para trabalhar com o cliente sem que o cliente compre licença; permissões por caso e por documento | Fim do vaivém por e-mail | [P] [Legal IT Insider](https://legaltechnology.com/2025/11/07/legora-announces-new-collaboration-feature-legora-portal/) |
| **Parceria com a PointOne**: registra automaticamente o tempo gasto na Legora (29/10/2026) | Captura de tempo e medição do valor da IA | [F] [Legora](https://legora.com/newsroom/legora-introduces-the-legora-aos-the-agentic-operating-system-for-legal-work) |

Negócio: Série D de US$ 600 milhões em 2026, avaliação de US$ 5,5 bilhões, pelo menos cinco aquisições no ano ([P] [Crunchbase](https://news.crunchbase.com/venture/legal-tech-startuo-funding-down-ai-acquisitions-2026/)).

#### Hebbia
- **Matrix**: agentes em paralelo sobre grandes conjuntos de documentos, com resultado em grade tipo planilha e citações em cada célula. Em mar/2026, o escritório Seyfarth anunciou que está criando agentes próprios na plataforma ([F] [Seyfarth](https://www.seyfarth.com/news-insights/seyfarth-leads-next-phase-of-deal-execution-and-diligence-through-ai-partnership-with-hebbia.html)). O foco é mais financeiro do que jurídico ([P] [Wikipedia](https://en.wikipedia.org/wiki/Hebbia)).

### 4.2 Editoras e pesquisa jurídica

#### Thomson Reuters – CoCounsel Legal
| Recurso | Problema | Fonte |
|---|---|---|
| **Deep Research** sobre Westlaw e Practical Law, com fluxos guiados (ago/2025) | Pesquisa de várias etapas fundamentada | [P] [LawNext](https://www.lawnext.com/2025/08/thomson-reuters-launches-cocounsel-legal-with-agentic-ai-and-deep-research-capabilities-along-with-a-new-and-final-version-of-westlaw.html) |
| **Nova geração, disponível desde 20/08/2026, construída sobre o Claude Agent SDK** | Execução de tarefas de várias etapas | [F] [TR](https://www.thomsonreuters.com/en/press-releases/2026/august/thomson-reuters-launches-next-generation-of-cocounsel-legal-the-ai-ecosystem-built-for-legal-professionals) |
| **Westlaw Brief Builder**: da pesquisa à minuta do memorial, validando as fontes com o citador KeyCite ao longo do caminho | Minuta fundamentada | [F] idem |
| **Workspaces por caso**, com documentos, precedentes e conhecimento da casa | Contexto que persiste | [F] idem |
| **Drafting Agent no Word**, que segue os playbooks do escritório | Redação de contratos | [F] idem |
| **Tabular Analysis**: até 10 mil documentos e 100 perguntas, com tabela filtrável | Revisão em massa | [F] idem |
| **Deep Research Verify**: confere se a fonte citada sustenta cada afirmação e aponta atribuições erradas | Citação desvirtuada | [F] [TR, jun/2026](https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-june-2026-releases/) |
| **Registro da pesquisa**: perguntas exploradas, fontes consultadas, como chegou à conclusão | Rastreabilidade | [F] [TR blog](https://legal.thomsonreuters.com/blog/what-deep-research-made-possible-in-legal-work-and-what-comes-next/) |
| **MCP do CoCounsel**, para usar dentro do Claude | Uso a partir do assistente que o advogado já tem | [F] [TR](https://www.thomsonreuters.com/en/press-releases/2026/august/thomson-reuters-launches-next-generation-of-cocounsel-legal-the-ai-ecosystem-built-for-legal-professionals) |

#### LexisNexis – Lexis+ com Protégé
| Recurso | Problema | Fonte |
|---|---|---|
| Fev/2026: Lexis+ AI passa a se chamar **Lexis+ com Protégé**. Mais de 300 fluxos prontos, construtor de fluxos sem código, citações conferidas com Shepard's, modelos da Anthropic, Google e OpenAI | Fluxos padronizados | [P] [LawNext](https://www.lawnext.com/2026/02/lexisnexis-launches-lexis-with-protege-replacing-lexis-ai-with-an-end-to-end-workflow-platform.html) |
| Ago/2026: **Legal Intelligence Engine**, um orquestrador que escolhe modelo, agente, habilidade e fonte por tarefa. O usuário revisa o plano; o sistema confere a própria saída e refaz | Qualidade em tarefas abertas | [P] [LawNext](https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html) |
| **Shepard's Verify na redação**: a citação existe, ainda vale e é relevante para a tarefa? | Citação falsa ou superada | [P] idem. A disponibilidade é descrita de forma contraditória ([P] [LexisNexis](https://www.lexisnexis.com/community/infopro/b/researchtip/posts/authority-matters-cite-checking-verification-in-the-ai-era)) |
| **Análise da peça adversária**: avalia a força dos argumentos e valida as citações antes de redigir a resposta | Contra-argumentação | [P] [LawNext](https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html) |
| Mostra a **fonte de cada trecho redigido**; tem memória na sessão e, no futuro, memória de preferências | Rastreabilidade | [P] idem |
| Liga-se ao **sistema de documentos do escritório**, ao Lex Machina e ao Law360 | Contexto do próprio escritório | [P] idem |
| Modelo próprio: ainda em avaliação. Um ajuste fino anterior e um treino por reforço com a Anthropic "não mudaram o resultado" diante do custo | Lição: priorizar orquestração e dados, não modelo próprio | [P] idem |

#### Clio (com vLex/Vincent) e Docket Alarm
| Recurso | Problema | Fonte |
|---|---|---|
| Compra da vLex por US$ 1 bilhão concluída; avaliação de US$ 5 bilhões | Juntar gestão do escritório e pesquisa | [P] [ABA Journal](https://www.abajournal.com/news/article/clio-completes-1b-acquisition-of-vlex-and-announces-5b-company-valuation) |
| **Manage AI** (antigo Clio Duo): sugere lançamentos de tempo a partir de tarefas concluídas, **extrai prazos de documentos do tribunal e cria eventos e tarefas na agenda**, resume casos e documentos. "Nada é finalizado sem o seu consentimento" | Gestão do escritório | [F] [Ajuda Clio](https://help.clio.com/hc/articles/29765932267675); [F] [Clio](https://www.clio.com/blog/manage-ai/) |
| **Clio Work agêntico** (abr/2026): um pedido em linguagem natural vira tarefa de várias etapas. Modo agêntico por padrão e modo clássico para controle passo a passo | Delegação com controle | [P] [LawNext](https://lawnext.com/2026/04/clio-adds-agentic-ai-capabilities-to-clio-work-also-launches-vincent-mobile-app.html) |
| **App Vincent** (iOS e Android): foto de documento físico, ditado por voz, continuidade entre celular e computador, contexto completo do caso | Celular primeiro | [F] [Clio](https://www.clio.com/about/press/clio-vincent-mobile-app-legal-ai-lawyers/) |
| **Docket Alarm**: mais de 1 bilhão de processos e documentos; **Batch AI Analyzer** para analisar muitos processos de uma vez | Monitoramento e análise em lote | [F] [vLex](https://vlex.com/blog/Batch-AI-Analyzer) |

#### Paxton
- **AI Citator** (jul/2024): diz se a decisão continua válida. O fornecedor afirma 94% de acerto num recorte do conjunto CaseHold, de Stanford. Tem também um "indicador de confiança". O foco é o escritório pequeno, com contratação sem vendedor ([F]/[P] [Artificial Lawyer](https://www.artificiallawyer.com/2024/07/08/paxton-ai-launches-citator-publishes-accuracy-scores/); [F] [Paxton](https://www.paxton.ai/small-law-firms)). Não há validação independente.

### 4.3 Software de gestão de escritório com IA

#### MyCase / 8am (conferência Kaleidoscope, 22 a 24/09/2026)
| Recurso | Problema | Fonte |
|---|---|---|
| **MyCase MCP**: conector oficial para Claude, **somente leitura**, com 73 ações (casos, clientes, documentos, cobrança, intake). Herda as permissões do usuário e **exige Claude Team ou Enterprise**. Em teste com mais de 60 escritórios, a maioria com até 5 advogados | Usar o Claude com os dados do escritório | [F] [MyCase](https://www.mycase.com/integrations/mycase-mcp/); [P] [LawNext](https://lawnext.com/2026/09/at-its-user-conference-in-las-vegas-8am-announces-mcp-integration-and-new-ai-tools-for-mycase-plus-new-law-firm-funding-program-through-lawpay.html) |
| **IQ Firm Agent**: perguntas sobre todos os dados do escritório (rentabilidade, realização, **resumo da manhã**), com link para a fonte. Protótipo; disponibilidade geral prevista para dezembro | Visão do escritório inteiro | [P] idem |
| **IQ Draft**: cria modelo do zero ou a partir de um documento existente, **faz perguntas de esclarecimento antes** e preenche com dados do caso num editor web | Modelos de peças | [P] idem |
| **Smart Spend**: sugere a qual caso pertence cada despesa | Custos por caso | [P] idem |

#### Smokeball
- **AutoTime**: registra automaticamente o tempo gasto em atividades do caso (documentos, e-mails, tarefas, assistente Archie). O administrador liga por usuário. O fornecedor diz que quem usa cobra de 10% a 30% mais horas. Descrições de tempo geradas por IA estão "em breve" no Reino Unido ([F] [Suporte Smokeball](https://support.smokeball.com/hc/articles/5860711656599); [F] [Smokeball UK](https://www.smokeball.co.uk/features/smokeballai)).

#### Filevine
- **AI Fields** extrai dados dos documentos para campos estruturados do caso. **DemandsAI** usa esses campos para gerar cartas de cobrança ([F] [Suporte Filevine](https://support.filevine.com/hc/en-us/articles/51146162307611)).
- **Depositions by Filevine** e **Depo CoPilot**: análise em tempo real do depoimento, apontando contradições ([F] [webinar Filevine](https://www.filevine.com/webinars/live-demo-what-ai-powered-depositions-actually-look-like/)).
- Receita recorrente estimada em US$ 250 milhões ([P] [Sacra](https://sacra.com/c/filevine)).

### 4.4 Advocacia de autor (lesão corporal, ações coletivas): a vertical mais parecida com escritório pequeno brasileiro

#### EvenUp
| Recurso | Problema | Fonte |
|---|---|---|
| **Claims Intelligence Platform**, treinada em centenas de milhares de casos de lesão | Avaliar e precificar o caso | [P] [LawNext](https://lawnext.com/2025/10/evenup-ai-platform-for-personal-injury-lawyers-raises-150m-at-2b-valuation.html) |
| **AI Drafts**: cartas de cobrança, petições iniciais, resumos médicos, planilhas de negociação, respostas a interrogatórios | Redação repetitiva | [P] [Legal IT Insider](https://legaltechnology.com/evenup-launches-ai-drafts-suite-smart-workflow-and-per-case-pricing-model/) |
| **Communication Agents** (jan/2026): voz e texto para abrir sinistro, confirmar cobertura, saber como vai o tratamento do cliente, pedir prontuários e confirmar saldos com clínicas. Rodam em paralelo em vários casos | Ligações e telefonemas repetitivos | [P] [LawNext](https://www.lawnext.com/2026/01/evenup-launches-ai-communication-agents-to-handle-routine-tasks-in-pi-cases-also-enhances-its-ai-drafting.html); [F] economia de mais de 9 h por caso |
| Redação com **escolha dos arquivos pelo advogado**, tarja manual de dados, **referências a anexos que se atualizam** e "Mirror Mode" | Confiança na minuta | [P] idem |
| **Preço por caso**, não por usuário | Modelo de cobrança | [P] [Legal IT Insider](https://legaltechnology.com/evenup-launches-ai-drafts-suite-smart-workflow-and-per-case-pricing-model/) |

#### Eve (EveOS, 11/06/2026): o caso mais próximo do princípio do Decreta
| Recurso | Problema | Fonte |
|---|---|---|
| **Atlas**, camada de dados que lê prontuários, contas, transcrições de ligações e peças. **Níveis de risco**: dado de baixo risco (data de consulta) entra sozinho, o de risco médio vira sugestão, o de alto risco (prazo prescricional) exige confirmação. O escritório define as regras | Automação segura | [F] [Eve](https://www.eve.legal/blogs/eve-is-now-eveos) |
| **Jenny**, atendente de intake: 24 h, 28 idiomas, qualifica o caso e **envia o contrato para assinatura antes de a ligação terminar** | Não perder cliente | [F] idem |
| **Comms Agent**: abre sinistro, cobra prontuários, liga para até 40 clientes ao mesmo tempo para saber do tratamento, avisa o cliente em períodos sem andamento | Comunicação | [F] idem |
| **Agentes de caso**: redigem quando as condições são atendidas (por exemplo, começam a resposta antes do prazo). "O advogado aprova antes de qualquer coisa sair" | Antecipar prazos | [F] idem |
| **Pesquisa**: cada citação ligada ao trecho da fonte, com alerta para decisões reformadas | Rastreabilidade | [F] idem |
| **Auditor**: revisa toda a carteira toda noite e aponta o que muda o valor do caso (lesão cerebral, indicação de cirurgia, lacunas no tratamento, documento faltando) | Valor escondido e riscos | [F] idem |
| **Próximas ações recomendadas**: fila diária por prioridade, que **agrupa tarefas parecidas** (por exemplo, sete pedidos ao mesmo hospital) | Produtividade da equipe | [F] idem |
| **Analyst**: perguntas em linguagem natural sobre ritmo de receita, previsão de acordos, desempenho e distribuição da carteira, com painéis salvos | Gestão | [F] idem |

Negócio: Série B de US$ 103 milhões com avaliação de US$ 1 bilhão em set/2025 ([P] [Legal.io](https://www.legal.io/articles/5738408/AI-Startup-Eve-Reaches-1B-Valuation-With-New-Funding-Round)).

#### Supio
- **Supio Agent**: agente de tarefas longas, do intake ao fim do caso; intake integrado; "Case Communications"; pedido de prontuário médico de dentro da plataforma (via YoCierge); integração com o Westlaw Advantage; preparo de caso com sincronização, livro-caixa e montagem de anexos ([F] [Supio](https://supio.com/press)).
- Série B de US$ 60 milhões em abr/2025, com a Thomson Reuters Ventures ([F] [Supio](https://www.supio.com/press/supio-announces-60m-series-b-to-accelerate-adoption-of-legal-ai-in-plaintiff-law)).

#### Darrow
- Detecta possíveis violações em dados públicos (reclamações de consumidores, documentos regulatórios, relatórios à SEC) com detecção de anomalias. Estima gravidade, número de afetados, dano e viabilidade. **Especialistas humanos revisam cada caso**. O portal PlaintiffLink liga autores a casos ([F] [FAQ Darrow](https://www.darrow.ai/faq); [P] [Calcalist](https://www.calcalistech.com/ctechnews/article/rkeopxvkt)).

### 4.5 Contratos

| Empresa | Recursos concretos | Fonte |
|---|---|---|
| **Spellbook** | Complemento do Word; agente Associate para vários documentos; editor com **edições como controle de alterações** (mar/2026); complemento do Google Docs, 12 playbooks iniciais, construtor de fluxos em linguagem natural e celular (mai/2026). Set/2026: gestão autônoma de contratos (recebe por e-mail, Slack e Salesforce, faz a primeira revisão e acompanha os assinados), **"Comprehensive Review"** (playbook, risco e revisão de texto em um clique), escolha de regras específicas do playbook, **registro de auditoria**, agente de pesquisa com citações | [F] [Spellbook set/2026](https://spellbook.com/blog/spellbooks-september-product-spotlight) |
| Spellbook: **Compare to Market** | Diz se cada cláusula está acima, na média ou abaixo do mercado, por tipo de documento e jurisdição. Os dados vêm de um modelo "dar para receber": quem compartilha estatísticas anônimas ganha acesso | [F] [Spellbook](https://spellbook.com/blog/introducing-compare-to-market); [F] [Ajuda](https://help.spellbook.legal/en/articles/12398925-how-to-use-compare-to-market) |
| **Luminance** | **Negociação autônoma** contra o playbook, liberada também para não advogados em beta (mar/2026), com histórico e raciocínio visíveis. Recomenda-se definir o que o agente pode aceitar e o que deve escalar | [P] [IT Brief](https://itbrief.co.uk/story/luminance-opens-ai-contract-tool-with-clearer-reasoning) |
| **Definely** | Complemento do Word para definições, referências cruzadas e revisão de texto. Série B de US$ 30 milhões em jun/2025, com participação da Clio | [P] [Legal IT Insider](https://legaltechnology.com/definely-raises-30m-we-speak-to-co-founder-ceo-nnamdi-emelifeonwu/) |
| **Ironclad** | Jurist (nov/2024), assistente de contratos. Um blog concorrente diz que ele virou "Contract Review Agent" em 8/10/2026, mas não confirmei | [P] [SiliconANGLE](https://siliconangle.com/2024/11/14/ironclad-launches-jurist-ai-powered-legal-assistant-contract-work/); [P] [gc.ai](https://gc.ai/blog/ironclad-legal-ai-review) |
| **Robin AI** (alerta) | Não conseguiu captar US$ 50 milhões (out/2025). A área de serviços foi vendida à Scissero (dez/2025) e engenheiros foram contratados pela Microsoft (jan/2026). Ferramenta isolada de revisão de contratos virou commodity | [P] [Legal.io](https://www.legal.io/articles/5768749/Scissero-Acquires-Robin-AI-s-Managed-Legal-Services-Amid-Reported-Insolvency-Pressures); [P] [Bloomberg Gov](https://news.bgov.com/private-equity/microsoft-brings-former-robin-ai-legal-tech-employees-into-fold) |

### 4.6 Contencioso, produção de provas e peças

| Empresa | Recursos concretos | Fonte |
|---|---|---|
| **DISCO** | IA de "raciocínio profundo" em escala (fev/2026); plataforma com tudo incluso (produção de provas, Cecilia AI, depoimentos e linhas do tempo, 25/02/2026); **Advanced Research**, investigação agêntica de fatos (13/08/2026); Cecilia responde perguntas com citações aos documentos | [F] [Business Wire](https://www.businesswire.com/news/home/20260209806640/en/DISCO-First-to-Bring-Scaled-Agentic-AI-to-Legal-Tech); [F] [DISCO](https://csdisco.com/offerings/ediscovery/features-ai) |
| **Everlaw** | **Sugestões de classificação** com precisão e revocação publicadas: 0,67 e 0,89 em 4 bases (7.737 documentos), contra revocação de 0,25 a 0,8 na primeira revisão humana. "Deep Dive" responde sobre o acervo todo. Ações em lote pagas por créditos | [F] [Everlaw](https://www.everlaw.com/blog/ai-and-automation/genai-document-review-surpasses-human-performance-on-real-world-litigation) |
| **Clearbrief** | No Word: cada frase dos fatos ligada ao documento, página e linha da prova; conferência de citações contra bases jurídicas; **relatório de conferência para download**; **semáforo** (verde: sustentado; amarelo: não verificado; vermelho: sem suporte); PDF de anexos e índice de autoridades | [P] [Fast.io](https://fast.io/resources/clearbrief-litigation-brief-review/); [F] [Clearbrief](https://clearbrief.com/) |

### 4.7 Análise de juízes e dados de tribunais

| Empresa | Recursos concretos | Fonte |
|---|---|---|
| **Trellis** | Dados de tribunais estaduais de primeira instância (afirma ter mais de 2,5 bilhões de registros); perfil do juiz (como decidiu pedidos parecidos, duração dos casos); conector para Claude (mai/2026), plugin para ChatGPT e chat próprio (ago/2026) | [P] [LawNext](https://www.lawnext.com/2026/08/having-already-launched-a-claude-connector-trellis-extends-ai-access-to-its-court-data-with-chatgpt-plugin-and-its-own-chat-tool.html) |
| **Pre/Dicta** | Prevê resultados de pedidos usando **dados biográficos e financeiros do juiz**. Afirma cerca de 85% de acerto e 81% para juízes novos; 10 tipos de pedido. **Sem validação independente** | [P] [LawNext](https://www.lawnext.com/2025/08/legal-analytics-platform-pre-dicta-expands-its-judicial-modeling-adding-appellate-forecasting-enhanced-biographical-analysis-and-comparative-predictions.html); [P] [Axios](https://www.axios.com/2023/09/12/ai-judges-trials-predictions) |
| **Lex Machina** | Protégé dentro do Lex Machina: perguntas em linguagem natural sobre estatísticas de litígio | [F] [LexisNexis](https://www.lexisnexis.com/community/amp-pressroom/lexisnexis-expands-its-protege-ai-assistant-to-lex-machina-for-effortless-litigation-analytics) |
| **Docket Alarm** | Alertas e análise em lote (ver 4.2) | [F] [vLex](https://vlex.com/docket-alarm) |

Alerta regulatório: na França, o art. 33 da Lei 2019-222 proíbe, com pena criminal, usar dados de identidade de magistrados para avaliar, comparar ou prever suas decisões ([P] [ABA Journal](https://www.abajournal.com/news/article/france-bans-and-creates-criminal-penalty-for-judicial-analytics)).

### 4.8 Escritórios nativos em IA e quem os viabiliza

| Empresa | O que faz | Fonte |
|---|---|---|
| **Crosby** (EUA) | É um escritório registrado, com seguro de responsabilidade. Revisa contratos comerciais em menos de uma hora, com preço fixo por documento. Série B de US$ 60 milhões com avaliação de US$ 400 milhões (mar/2026) | [P] [Global Legal Post](https://www.globallegalpost.com/news/cooley-backed-contract-review-start-up-crosby-raises-60m-in-fresh-funding-1011864931) |
| **Garfield.Law** (Inglaterra) | Primeiro escritório baseado em IA autorizado pela SRA (mai/2025), para cobrança de dívidas de até £ 10 mil. **O sistema não propõe jurisprudência**, que a SRA classificou como área de alto risco, e **o cliente aprova cada passo** | [I] [SRA](https://www.sra.org.uk/sra/news/press/garfield-ai-authorised?org=u139); [P] [IBA](https://www.ibanet.org/UK-SRA-takes-unprecedented-approach-in-authorising-AI-enabled-law-firms) |
| **Lawhive** (Reino Unido/EUA) | Comprou o escritório Woodstock Legal (set/2025); assistente "Lawrence"; Série B de US$ 60 milhões (fev/2026) | [P] [Legal Cheek](https://www.legalcheek.com/2025/09/google-backed-ai-platform-buys-law-firm-in-uk-legal-industry-first/) |
| **August** | Os agentes de IA de uma empresa pedem ajuda a advogados de dentro do próprio fluxo. O escritório define o que o agente pode responder sozinho e quais materiais ele pode usar; há controle de acesso e registro de cada pedido. Permite pacotes de serviço com escopo e preço fechados | [P] [Artificial Lawyer, 29/09/2026](https://www.artificiallawyer.com/2026/09/29/with-august-a-companys-agents-ask-lawyers-for-help/) |
| **Y Combinator** | Turma de inverno 2026: General Legal (contratos), Arcline/Moritz e LegalOS (imigração). Turma de verão 2026: Erinys (rede de escritórios de autor) | [P] [Artificial Lawyer](https://www.artificiallawyer.com/2026/02/04/y-combinator-picks-3-newmods-general-legal-arcline-legalos/); [P] [Artificial Lawyer](https://artificiallawyer.com/2026/08/10/4-legal-techs-join-y-combinator-summer-26) |

### 4.9 Laboratórios de IA

| Empresa | Recursos jurídicos | Fonte |
|---|---|---|
| **Anthropic** | Plugin jurídico para o Cowork (30/01 a 02/02/2026): revisão de contrato contra playbook com marcação **verde, amarela ou vermelha** e triagem de NDAs. Em 12/05/2026: **12 plugins** (9 áreas de prática, mais estudantes, clínicas e um hub de habilidades da comunidade), cada um começando por **uma entrevista que aprende o playbook, o escalonamento, a tolerância a risco e o estilo da casa**. Mais de 20 conectores (iManage, NetDocuments, DocuSign, Ironclad, Relativity, Everlaw, Box, Datasite, Trellis, Midpage, CoCounsel, Harvey…). Claude for Word em beta (abr/2026). "Cookbooks" de Managed Agents | [P] [LawNext, fev/2026](https://www.lawnext.com/2026/02/anthropics-legal-plugin-for-claude-cowork-may-be-the-opening-salvo-in-a-competition-between-foundation-models-and-legal-tech-incumbents.html); [P] [LawNext, mai/2026](https://lawnext.com/2026/05/anthropic-goes-all-in-on-legal-releasing-more-than-20-connectors-and-12-practice-area-plugins-for-claude.html) |
| **OpenAI** | "Astra for Law" (set/2026): versão do GPT-6 Astra com índice próprio de busca jurídica e instruções de análise jurídica, num programa de acesso para os 200 maiores escritórios dos EUA. Fonte única | [P] [Bloomberg Law](https://news.bgov.com/business-and-practice/wake-up-call-openai-pushes-gpt-6-astra-deeper-into-big-law) |
| **Google** | "Gemini Enterprise for Legal" (25/08/2026, em prévia): respostas com fontes rastreáveis; **preserva as permissões dos sistemas de origem** (inclusive por documento); não treina com dados do cliente; conectores (CourtListener, iManage, NetDocuments, Everlaw, Harvey, LexisNexis…) | [F] [Google Cloud](https://www.googlecloudpresscorner.com/2026-08-25-Google-Cloud-Launches-Gemini-Enterprise-for-Legal); [P] [Artificial Lawyer](https://www.artificiallawyer.com/2026/08/25/google-launches-gemini-enterprise-for-legal/) |

### 4.10 Outras startups de 2025–2026 em destaque

- **DeepJudge** (Suíça): busca no acervo do escritório que respeita as permissões de cada sistema de origem e os muros éticos. Lançou o SuperSearch (mar/2026) e captou US$ 41,2 milhões na Série A (nov/2025) ([P] [Bloomberg Law](https://news.bloomberglaw.com/legal-ops-and-tech/deepjudge-raises-41-million-to-bolster-legal-research-platform)).
- **Theo AI**: prevê resultado e faixa de recuperação de litígios, primeiro para financiadores de processos ([P] [Legal IT Insider](https://legaltechnology.com/litigation-outcome-prediction-startup-theo-ai-raises-4-2m-seed-funding/)).
- **Wolters Kluwer** comprou a Libra (área de trabalho com IA, US$ 105 milhões) e a Brightflag (US$ 500 milhões) ([P] [Crunchbase](https://news.crunchbase.com/venture/legal-tech-startuo-funding-down-ai-acquisitions-2026/)).
- **Enter** (Brasil): contencioso de grandes empresas com IA e revisão humana. Série B de cerca de US$ 100 milhões liderada pela Founders Fund, avaliação de US$ 1,2 bilhão (mai/2026), primeiro unicórnio de IA da América Latina ([P] [Bloomberg Línea](https://www.bloomberglinea.com.br/startups/enter-startup-brasileira-de-ia-juridica-atinge-us-12-bilhao-em-aporte/)). É o principal sinal de que investidores globais apostam em IA jurídica brasileira.

---

## 5. Ideias de recurso transferíveis para o Decreta (35, em ordem de prioridade)

**Critério de prioridade:** valor para escritório pequeno ou médio brasileiro, aderência a "a IA sugere; uma pessoa confirma", aproveitamento do que o Decreta já faz (DJEN, DataJud, motor de prazos, resumo da manhã, peças em DOCX, chat do processo, conferência de documentos) e esforço.

### Tabela-resumo

| # | Ideia | Estende o que já existe? | Dificuldade | Risco | Faixa |
|---|---|---|---|---|---|
| 1 | Verificador de citações antes de exportar | Peças DOCX | Média (existência) / alta (sustentação) | Médio | A |
| 2 | Cada afirmação ligada ao documento e à página dos autos | Resumo dos autos, chat | Média | Baixo | A |
| 3 | Automação graduada por risco | Princípio do produto | Baixa | Médio | A |
| 4 | Registro de auditoria da IA | Todos | Baixa | Baixo | A |
| 5 | Defesa contra comando escondido em documentos | Leitura de autos e fotos | Média | Baixo | A |
| 6 | Programa próprio de avaliação | Motor de prazos, resumos | Média | Baixo | A |
| 7 | Auditoria noturna da carteira | Resumo da manhã | Média | Médio | A |
| 8 | Fila do dia com próximas ações agrupadas | Agenda | Baixa/média | Baixo | A |
| 9 | Atualização ao cliente em linguagem simples (WhatsApp) | WhatsApp | Baixa/média | Médio/alto | A |
| 10 | Pré-rascunho automático ao chegar a intimação | DJEN, peças | Média/alta | Médio | A |
| 11 | Transcrição de áudios e reuniões para o processo | Chat do processo | Baixa | Médio | A |
| 12 | Dados dos documentos para campos (qualificação etc.) | Conferência de documentos | Baixa/média | Médio | A |
| 13 | Análise da peça da parte contrária | Leitura de peças | Média | Baixo | A |
| 14 | Revisão em tabela (documentos ou carteira) | Pasta do cliente | Média | Médio | B |
| 15 | Banco de peças do escritório | Peças DOCX | Média | Médio | B |
| 16 | Radar de precedentes qualificados × carteira | DataJud, DJEN | Média/alta | Médio | B |
| 17 | Plano visível e registro da pesquisa | Assistente com ferramentas | Baixa/média | Baixo | B |
| 18 | "Habilidades" do escritório com entrevista inicial | Peças, triagem | Média | Baixo/médio | B |
| 19 | Conector MCP do Decreta (somente leitura) | Assistente | Média | Médio | B |
| 20 | Modelo a partir de peça existente, com perguntas | Peças DOCX | Baixa/média | Baixo | B |
| 21 | Linha do tempo médica, previdenciária e trabalhista | Leitura de documentos | Média | Médio | B |
| 22 | Atendimento inicial no WhatsApp até contrato e procuração | Triagem de novos negócios | Média | Alto | B |
| 23 | Conflito de interesses e permissões por processo aplicados à IA | Triagem | Média | Baixo | B |
| 24 | Monitor de processos novos contra clientes (nome/CNPJ) | DJEN | Baixa/média | Médio | B |
| 25 | Cobrança automática de documentos pendentes do cliente | Conferência de documentos | Baixa/média | Médio | B |
| 26 | Analista do escritório (carteira, êxito, alvarás) | Alvarás, assistente | Média | Baixo/médio | B |
| 27 | Esforço por processo e valor gerado pela IA | — | Baixa/média | Baixo | B |
| 28 | Pesquisa profunda em fontes oficiais brasileiras | Assistente | Alta | Alto | C |
| 29 | Playbook de contratos com semáforo e controle de alterações | Peças DOCX | Média | Médio | C |
| 30 | Audiência: roteiro antes, transcrição e contradições depois | Agenda, autos | Média/alta | Médio | C |
| 31 | Estatísticas da vara (tempo e resultado), sem perfil pessoal de juiz | DataJud | Média | Médio/alto | C |
| 32 | Faixa de valor de acordo ou condenação | — | Alta | Alto | C |
| 33 | Portal do cliente com a marca do escritório | — | Média | Baixo/médio | C |
| 34 | Serviços empacotados a preço fixo | Triagem, peças | Média | Médio/alto | C |
| 35 | Comparação com o mercado "dar para receber" | — | Alta | Alto | C |

**Faixa A:** confiabilidade e operação diária, com retorno rápido. **Faixa B:** diferenciação com esforço médio. **Faixa C:** apostas, ou alto risco ético ou de dados.

---

### Faixa A — Confiabilidade e base

**1. Verificador de citações antes de exportar a peça ("relatório de conferência")**
- **Descrição:** antes de gerar o DOCX, o Decreta extrai cada citação (número de processo, súmula, tema, artigo de lei, trecho entre aspas) e marca cada uma como "conferida", "não encontrada: confira" ou "diverge da fonte". O relatório fica guardado com a versão da peça.
- **Quem já faz:** TR Deep Research Verify ([F](https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-june-2026-releases/)); Lexis Shepard's Verify ([P](https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html)); relatório de conferência do Clearbrief ([P](https://fast.io/resources/clearbrief-litigation-brief-review/)); roteiro da Harvey ([F](https://www.harvey.ai/blog/what-the-harvey-agent-changes-about-legal-research)).
- **Por que é forte:** ataca o risco nº 1 da IA jurídica, que tem casos brasileiros concretos (seção 6.2). Protege o advogado e a marca do Decreta.
- **Adaptação ao Brasil:**
  - Conferir o formato e os dígitos verificadores da numeração única do CNJ.
  - Conferir se o processo existe pelo DataJud.
  - Conferir súmulas (vigente ou cancelada) e temas de repercussão geral e repetitivos nos sites oficiais do STF e do STJ e no Pangea/BNP do CNJ ([CNJ](https://www.cnj.jus.br/banco-de-precedentes-amplia-acesso-a-decisoes-que-orientam-julgamentos-no-pais/)).
  - Conferir lei e artigo (inclusive revogação) no Planalto ou no LexML.
  - Comparar o trecho entre aspas com a ementa ou o inteiro teor encontrado.
  - Nunca escrever "falsa" automaticamente: escrever "não verificada".
- **Dificuldade:** média para existência e formato; alta para saber se a fonte sustenta a afirmação.
- **Risco:** médio. Decisões de tribunais estaduais mal indexadas geram falsos alertas, e o relatório pode dar falsa segurança. Mitigação: estado "não verificável" e aviso de que a responsabilidade continua sendo do advogado.

**2. Cada afirmação ligada ao documento e à página dos autos**
- **Descrição:** no resumo dos autos, no chat do processo e nas peças, cada frase sobre fatos vem com a referência ("Id. 12345, p. 3" ou "evento 27, doc. 2"), que abre o trecho. Opcionalmente, um semáforo de sustentação (verde, amarelo, vermelho).
- **Quem já faz:** Clearbrief (documento, página e linha, com semáforo) ([P](https://fast.io/resources/clearbrief-litigation-brief-review/)); Eve (citação ligada ao trecho) ([F](https://www.eve.legal/blogs/eve-is-now-eveos)); Hebbia Matrix; Lexis (fonte de cada trecho) ([P](https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html)).
- **Por que é forte:** a conferência humana leva segundos em vez de minutos. É o que torna "a pessoa confirma" viável na prática.
- **Adaptação:** usar o padrão de referência do PJe ("Id.") e do eproc ("evento"); guardar, para cada trecho, o documento e a página de origem. Funciona bem no celular (toque abre o trecho).
- **Dificuldade:** média. **Risco:** baixo; documentos escaneados com reconhecimento de texto ruim. Mitigação: mostrar a imagem da página.

**3. Automação graduada por risco**
- **Descrição:** cada tipo de dado ou ação tem um nível. Baixo: entra sozinho (andamento de juntada). Médio: vira sugestão (data de audiência lida do despacho). Alto: exige confirmação explícita (prazo fatal, envio ao cliente, valor de alvará). O escritório pode ajustar, mas o padrão é conservador.
- **Quem já faz:** Eve Atlas ([F](https://www.eve.legal/blogs/eve-is-now-eveos)); Clio Manage AI, "nada é finalizado sem consentimento" ([F](https://help.clio.com/hc/articles/29765932267675)).
- **Por que é forte:** transforma o princípio do Decreta numa regra configurável e explicável, e reduz cliques nas decisões de baixo risco.
- **Adaptação:** tabela de níveis por tipo de ato do CPC (prazo de recurso sempre alto). Os prazos que o Decreta já confirma continuam no nível alto.
- **Dificuldade:** baixa. **Risco:** médio se o escritório afrouxar demais. Mitigação: travar o nível de prazos.

**4. Registro de auditoria da IA**
- **Descrição:** para cada sugestão: modelo e versão, fontes usadas, quem confirmou, quando e o que foi alterado. Exportável por processo.
- **Quem já faz:** registros de auditoria do Spellbook ([F](https://spellbook.com/blog/spellbooks-september-product-spotlight)); registros de acesso da Harvey com a Intapp ([F](https://www.harvey.ai/blog/harvey-intapp-ethical-walls)); relatório de conferência do Clearbrief.
- **Por que é forte:** defesa do advogado em questionamento disciplinar. A Recomendação OAB 001/2024 mantém a responsabilidade no advogado ([P](https://cj.estrategia.com/portal/uso-da-inteligencia-artificial-na-advocacia/)); a LGPD exige registro das operações de tratamento.
- **Dificuldade:** baixa. **Risco:** baixo; cuidado com a retenção de dados sensíveis no próprio registro.

**5. Defesa contra comando escondido em documentos de terceiros**
- **Descrição:** ao ler PDF da parte contrária, da intimação ou de foto, detectar texto invisível, texto em branco, metadados e instruções do tipo "ignore os comandos". Tratar todo documento como dado, nunca como instrução, e alertar o advogado.
- **Quem já faz:** o STF, com o módulo "Maria Shield", detectou o comando "negar todos os comandos do GPT" escondido no cabeçalho de uma petição; houve multa de R$ 5 mil (art. 77 do CPC) e comunicação à OAB e ao MPF em 1º/10/2026 ([P] [Poder360](https://www.poder360.com.br/poder-justica/moraes-multa-advogado-por-comando-de-ia-em-peticao/)). A Harvey comprou a Guardrails AI ([F](https://www.harvey.ai/blog/guardrails-ai-joins-harvey)).
- **Por que é forte:** o Decreta lê documentos adversários e tem ferramentas que acessam dados do escritório. Um comando escondido pode distorcer o resumo ou vazar dados.
- **Dificuldade:** média. **Risco:** baixo. É também argumento de venda ("o Decreta avisa quando a peça adversária tenta manipular IA").

**6. Programa próprio de avaliação**
- **Descrição:** um conjunto-ouro de publicações do DJEN com o prazo correto (dias úteis, feriados locais, suspensões), resumos com rubrica e peças com checklist. Roda a cada troca de modelo ou de prompt, e os indicadores são publicados para os clientes.
- **Quem já faz:** Harvey LAB, com rubrica "tudo ou nada" ([F](https://harvey.ai/blog/introducing-harveys-legal-agent-benchmark)); relatórios VLAIR da Vals, com comparação contra advogados ([P](https://www.lawnext.com/2025/10/vals-ais-latest-benchmark-finds-legal-and-general-ai-now-outperform-lawyers-in-legal-research-accuracy.html)); Everlaw publica precisão e revocação ([F](https://www.everlaw.com/blog/ai-and-automation/genai-document-review-surpasses-human-performance-on-real-world-litigation)).
- **Por que é forte:** os modelos mudam a cada poucos meses. Sem regressão medida, o motor de prazos pode piorar sem ninguém perceber.
- **Adaptação:** usar o OAB-Bench como referência de redação em português ([P] [arXiv](https://arxiv.org/abs/2504.21202)).
- **Dificuldade:** média. **Risco:** baixo.

### Faixa A — Operação diária

**7. Auditoria noturna da carteira**
- **Descrição:** toda noite, o Decreta varre todos os processos e entrega no resumo da manhã uma lista curta e ordenada do que exige atenção.
- **Quem já faz:** Eve Auditor ([F](https://www.eve.legal/blogs/eve-is-now-eveos)).
- **Por que é forte:** o escritório pequeno não tem controladoria. A varredura acha o que se perde: processo parado, intimação sem prazo, alvará esquecido.
- **Adaptação (exemplos de regras):**
  - Processo parado há muito tempo, com risco de extinção (art. 485, II e III, do CPC) ou de prescrição intercorrente (art. 921 do CPC).
  - Intimação sem prazo cadastrado; prazo sem responsável.
  - Alvará expedido e não levantado.
  - Processo suspenso por tema já julgado.
  - Perícia marcada sem quesitos; audiência sem preparo.
  - Documento faltando na pasta do cliente.
- **Dificuldade:** média. **Risco:** médio, por excesso de alertas. Mitigação: limitar a 5–10 itens e deixar a pessoa marcar "ignorar".

**8. Fila do dia com próximas ações agrupadas**
- **Descrição:** fila por pessoa, ordenada por prazo e risco, que agrupa tarefas parecidas (todos os protocolos no PJe do TRT-2, todas as ligações para clientes).
- **Quem já faz:** "Recommended Next Actions" da Eve ([F](https://www.eve.legal/blogs/eve-is-now-eveos)).
- **Por que é forte:** transforma alertas em trabalho executável e combina com o uso no celular.
- **Dificuldade:** baixa/média. **Risco:** baixo.

**9. Atualização ao cliente em linguagem simples (WhatsApp), com aprovação**
- **Descrição:** quando há andamento relevante, o Decreta escreve um rascunho em português simples ("o processo foi para o juiz decidir; isso costuma levar semanas"). O advogado aprova sozinho ou em lote. Andamentos de baixo risco podem ser automáticos, conforme a ideia 3.
- **Quem já faz:** EvenUp Communication Agents ([P](https://www.lawnext.com/2026/01/evenup-launches-ai-communication-agents-to-handle-routine-tasks-in-pi-cases-also-enhances-its-ai-drafting.html)); Eve Comms Agent ([F](https://www.eve.legal/blogs/eve-is-now-eveos)).
- **Por que é forte:** "como está meu processo?" é a pergunta que mais consome tempo de escritório pequeno no Brasil, e o Decreta já está no WhatsApp.
- **Adaptação:** modelos de mensagem aprovados pela Meta para mensagens iniciadas pela empresa; **nunca enviar detalhes de processo em segredo de justiça** (art. 189 do CPC); conferir o destinatário; não prometer resultado (Código de Ética da OAB).
- **Dificuldade:** baixa/média. **Risco:** médio/alto (destinatário errado, vazamento). Mitigação: aprovação obrigatória no começo e confirmação de identidade.

**10. Pré-rascunho automático ao chegar a intimação**
- **Descrição:** quando a publicação do DJEN pede uma peça (contestação, réplica, contrarrazões, embargos de declaração, manifestação sobre laudo), o Decreta já prepara um rascunho com o contexto dos autos e a melhor peça da casa (ideia 15). O rascunho fica marcado como rascunho. **Nunca protocola.**
- **Quem já faz:** agentes de caso da Eve ([F](https://www.eve.legal/blogs/eve-is-now-eveos)); agente proativo da Legora ([F](https://legora.com/product/agent)).
- **Por que é forte:** junta as duas maiores dores (prazo e redação) e aproveita o que o Decreta já tem.
- **Adaptação:** tabela "ato → peça" pelo CPC; rascunho só nos tipos de processo em que o escritório ativar.
- **Dificuldade:** média/alta. **Risco:** médio (custo de tokens, excesso de confiança). Mitigação: ativar por tipo de caso e passar pelo verificador da ideia 1.

**11. Transcrição de áudios e reuniões para o processo**
- **Descrição:** o áudio do WhatsApp do cliente ou a gravação da reunião vira transcrição com identificação de quem fala, um resumo e fatos extraídos (sempre como sugestão), anexados ao processo.
- **Quem já faz:** transcrição com falantes na Harvey ([F](https://www.harvey.ai/blog/the-brief-july-2026)); ditado no app Vincent, da Clio ([F](https://www.clio.com/about/press/clio-vincent-mobile-app-legal-ai-lawyers/)).
- **Por que é forte:** no Brasil o cliente manda áudio; hoje essa informação se perde no celular do advogado.
- **Dificuldade:** baixa. **Risco:** médio (dados sensíveis, consentimento). Mitigação: aviso ao cliente e política de retenção.

**12. Dados dos documentos para campos estruturados**
- **Descrição:** RG, CPF, CNH, comprovante de residência, carteira de trabalho, extrato do INSS (CNIS) e contratos viram campos da ficha do cliente, após confirmação. Esses campos preenchem a qualificação das partes nas peças (art. 319, II, do CPC).
- **Quem já faz:** Filevine AI Fields com DemandsAI ([F](https://support.filevine.com/hc/en-us/articles/51146162307611)); assistente de documentos 8am IQ ([P](https://www.businesswire.com/news/home/20251217255538/en/8am-Closes-Out-2025-With-a-Consolidated-Brand-Enhanced-Professional-Solutions-and-Strong-Business-Momentum)).
- **Por que é forte:** é a extensão natural da conferência de documentos que o Decreta já faz e elimina digitação.
- **Dificuldade:** baixa/média. **Risco:** médio (erro em dado pessoal). Mitigação: nível alto na ideia 3 para CPF e nome.

**13. Análise da peça da parte contrária**
- **Descrição:** lista os argumentos, aponta o que cada um contesta nos fatos e nas provas dos autos, passa as citações dela pelo verificador da ideia 1 e sugere tópicos para réplica ou contrarrazões.
- **Quem já faz:** Lexis Protégé, que avalia a força da peça adversária e valida as citações dela ([P](https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html)).
- **Por que é forte:** vantagem processual direta. Uma citação falsa da parte contrária pode até sustentar pedido de litigância de má-fé (art. 80 do CPC).
- **Dificuldade:** média. **Risco:** baixo (uso interno).

### Faixa B — Diferenciação

**14. Revisão em tabela (documentos ou carteira)**
- **Descrição:** linhas = documentos ou processos; colunas = perguntas; cada célula com a resposta e a fonte. Opção de anexar um padrão a uma coluna para conferir todas as linhas contra ele.
- **Quem já faz:** tabelas de revisão da Harvey ([F](https://help.harvey.ai/articles/uploading-files-to-harvey)); Tabular Analysis do CoCounsel, com 10 mil documentos e 100 perguntas ([F](https://www.thomsonreuters.com/en/press-releases/2026/august/thomson-reuters-launches-next-generation-of-cocounsel-legal-the-ai-ecosystem-built-for-legal-professionals)); Legora; Hebbia.
- **Adaptação:** auditar a carteira ao assumir clientes de outro escritório; relatório de contencioso de massa para cliente empresarial; due diligence imobiliária (matrículas, certidões).
- **Dificuldade:** média. **Risco:** médio (custo, erro em escala). Mitigação: conferência por amostragem.

**15. Banco de peças do escritório**
- **Descrição:** busca por significado nas peças antigas do escritório ("nossa melhor réplica em negativação indevida no TJSP") e "redigir a partir desta peça", respeitando permissões.
- **Quem já faz:** DeepJudge, com permissões dos sistemas de origem ([P](https://news.bloomberglaw.com/legal-ops-and-tech/deepjudge-raises-41-million-to-bolster-legal-research-platform)); Workspaces do CoCounsel; Lexis com o sistema de documentos do escritório.
- **Por que é forte:** o conhecimento do escritório pequeno está espalhado em pastas, e a peça vencedora é o melhor ponto de partida.
- **Dificuldade:** média. **Risco:** médio (tese superada; mistura de dados de clientes). Mitigação: anonimizar e cruzar com a ideia 16.

**16. Radar de precedentes qualificados cruzado com a carteira**
- **Descrição:** acompanha temas de repercussão geral, repetitivos, IRDR, IAC e súmulas. Quando um tema é afetado ou julgado, lista os processos da carteira impactados (suspensão, art. 1.037, II, do CPC; aplicação da tese, art. 1.040) e os clientes que podem se beneficiar.
- **Quem já faz:** citadores KeyCite e Shepard's, que avisam quando a decisão perde validade; Monitors da Legora e varredura de mudanças da Harvey; Eve aponta decisões reformadas.
- **Adaptação:** fonte Pangea/BNP e páginas do STF, do STJ e do TST. Ligação com assunto e classe do DataJud e leitura da inicial pela IA.
- **Dificuldade:** média/alta. **Risco:** médio (encaixe errado). Mitigação: sempre como sugestão.

**17. Plano visível e registro da pesquisa**
- **Descrição:** em tarefas longas, o assistente mostra o plano, aceita edição, executa, avisa quando termina e guarda o registro (perguntas, fontes, conclusões).
- **Quem já faz:** Harvey ([F](https://www.harvey.ai/blog/the-brief-july-2026)); Lexis ([P](https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html)); registro da pesquisa da TR ([F](https://legal.thomsonreuters.com/blog/what-deep-research-made-possible-in-legal-work-and-what-comes-next/)); modo clássico da Clio.
- **Dificuldade:** baixa/média. **Risco:** baixo.

**18. "Habilidades" do escritório, com entrevista inicial**
- **Descrição:** o escritório escreve como faz cada tarefa ("checklist de inicial de BPC-LOAS", "como montamos acordo trabalhista"). Uma entrevista inicial aprende o estilo da casa, o que escalar e a tolerância a risco, e o agente segue isso.
- **Quem já faz:** Legora Skills ([F](https://legora.com/product/agent)); plugins da Anthropic com entrevista ([P](https://lawnext.com/2026/05/anthropic-goes-all-in-on-legal-releasing-more-than-20-connectors-and-12-practice-area-plugins-for-claude.html)); construtores de fluxo da Lexis e da Harvey.
- **Por que é forte:** personaliza sem programar e cria dependência saudável do produto.
- **Dificuldade:** média. **Risco:** baixo/médio.

**19. Conector MCP do Decreta (somente leitura no início)**
- **Descrição:** o advogado usa o Claude (no computador ou no celular) com os dados do escritório: prazos, processos e documentos. O conector herda as permissões e registra o uso. Ações de escrita só depois, sempre com confirmação.
- **Quem já faz:** MyCase MCP, com 73 ações somente leitura e exigência de Claude Team ou Enterprise ([F](https://www.mycase.com/integrations/mycase-mcp/)); Trellis; CoCounsel; conectores da Anthropic.
- **Adaptação:** exigir plano comercial do Claude (dados de clientes), respeitar a LGPD e registrar a auditoria.
- **Dificuldade:** média. **Risco:** médio (exposição de dados; comando escondido vindo de documentos). Mitigação: ideia 5 e somente leitura.

**20. Modelo a partir de peça existente, com perguntas de esclarecimento**
- **Descrição:** "transforme esta peça em modelo". O Decreta identifica os campos variáveis, faz perguntas antes de redigir e preenche com os dados do processo, no timbre do escritório.
- **Quem já faz:** 8am IQ Draft ([P](https://lawnext.com/2026/09/at-its-user-conference-in-las-vegas-8am-announces-mcp-integration-and-new-ai-tools-for-mycase-plus-new-law-firm-funding-program-through-lawpay.html)); biblioteca de cláusulas do CoCounsel.
- **Dificuldade:** baixa/média. **Risco:** baixo.

**21. Linha do tempo médica, previdenciária e trabalhista**
- **Descrição:** a partir de laudos, atestados, CAT, PPP, LTCAT e CNIS, monta uma linha do tempo com lacunas apontadas (contribuição faltando, período sem tratamento, laudo contraditório).
- **Quem já faz:** cronologias médicas da Supio e da EvenUp ([F](https://supio.com/press)); Eve Auditor, que aponta lacunas no tratamento ([F](https://www.eve.legal/blogs/eve-is-now-eveos)).
- **Adaptação:** previdenciário (BPC, auxílio por incapacidade, aposentadoria especial), acidente de trabalho e doença ocupacional, negativa de plano de saúde. São áreas de massa de escritórios pequenos.
- **Dificuldade:** média. **Risco:** médio (dado sensível de saúde pela LGPD; não pode virar "diagnóstico"). Mitigação: linguagem descritiva e fontes ligadas.

**22. Atendimento inicial no WhatsApp até contrato e procuração**
- **Descrição:** atendimento inicial 24 h com informações sobre o escritório, triagem, checagem de conflito de interesses (ideia 23) e coleta de documentos. Depois da **aprovação do advogado**, envio de contrato de honorários e procuração para assinatura eletrônica.
- **Quem já faz:** Eve Jenny ([F](https://www.eve.legal/blogs/eve-is-now-eveos)); Supio Intake ([F](https://supio.com/press)).
- **Adaptação:** o Provimento OAB 205/2021 admite chatbot para dúvidas iniciais, mas proíbe captação ativa e mensagens não solicitadas ([P](https://jus.com.br/artigos/92409/advogados-nas-midias-digitais)). Só responder a quem procurou o escritório. Sem promessa de resultado.
- **Dificuldade:** média. **Risco:** alto (ético). Mitigação: roteiro fixo e contrato só após aprovação.

**23. Conflito de interesses e permissões por processo aplicados à IA**
- **Descrição:** a IA só lê o que o usuário pode ver, e na dúvida bloqueia. Processos em segredo de justiça são marcados. A triagem confere se a parte contrária já é ou foi cliente.
- **Quem já faz:** Harvey com a Intapp ([F](https://www.harvey.ai/blog/harvey-intapp-ethical-walls)); DeepJudge; Google Gemini for Legal, que preserva permissões ([F](https://www.googlecloudpresscorner.com/2026-08-25-Google-Cloud-Launches-Gemini-Enterprise-for-Legal)).
- **Dificuldade:** média. **Risco:** baixo.

**24. Monitor de processos novos contra clientes (nome ou CNPJ)**
- **Descrição:** além da busca pela OAB, procurar publicações com o nome ou o CNPJ dos clientes para avisar "seu cliente foi citado num processo novo" antes de o cliente receber a citação.
- **Quem já faz:** alertas do Docket Alarm e da Trellis; Monitors da Legora; Darrow (dados públicos).
- **Adaptação:** o portal do DJEN permite busca por nome de parte ([P] [manual do TJRR](https://tjrr.jus.br/images/sti/docspdf/Manual_para_DJEN_e_DJE.pdf)). Falta confirmar se a API permite o mesmo.
- **Dificuldade:** baixa/média. **Risco:** médio (homônimos). Mitigação: confirmação pela pessoa.

**25. Cobrança automática de documentos pendentes do cliente**
- **Descrição:** a partir da conferência da pasta, o Decreta manda lembretes pelo WhatsApp listando o que falta, com prazo, e registra o que chegou.
- **Quem já faz:** EvenUp e Eve (cobrança de prontuários); Supio (pedido de prontuário integrado).
- **Dificuldade:** baixa/média. **Risco:** médio (incomodar o cliente; LGPD). Mitigação: limite de frequência e consentimento.

**26. Analista do escritório**
- **Descrição:** perguntas como "quanto devo receber de êxito em 90 dias, considerando alvarás e RPVs?" ou "quais processos dão prejuízo?", com painéis salvos.
- **Quem já faz:** Eve Analyst ([F](https://www.eve.legal/blogs/eve-is-now-eveos)); 8am IQ Firm Agent ([P](https://lawnext.com/2026/09/at-its-user-conference-in-las-vegas-8am-announces-mcp-integration-and-new-ai-tools-for-mycase-plus-new-law-firm-funding-program-through-lawpay.html)).
- **Dificuldade:** média. **Risco:** baixo/médio.

**27. Esforço por processo e valor gerado pela IA**
- **Descrição:** registro passivo do tempo gasto por processo no Decreta, para medir rentabilidade (honorário fixo ou de êxito, não hora) e mostrar as horas poupadas pela IA.
- **Quem já faz:** Smokeball AutoTime ([F](https://support.smokeball.com/hc/articles/5860711656599)); sugestões de tempo da Clio; Legora com a PointOne.
- **Dificuldade:** baixa/média. **Risco:** baixo; ser transparente sobre o monitoramento da equipe.

### Faixa C — Apostas ou maior risco

**28. Pesquisa profunda em fontes oficiais brasileiras**
- **Descrição:** relatório de pesquisa com plano, registro e citações conferidas, **restrito ao que foi efetivamente encontrado**, nunca à memória do modelo.
- **Quem já faz:** TR Deep Research, agente da Harvey, Lexis, pesquisa da Eve, OpenAI Astra for Law.
- **Adaptação:** as fontes brasileiras são fragmentadas (sites de cada tribunal, LexML, Planalto). O estudo "Place Matters" mostra que fora dos EUA a IA erra mais ([P] [AI Law Librarians](https://www.ailawlibrarians.com/2026/02/19/what-the-science-says-about-hallucinations-in-legal-research/)). Fazer só depois da ideia 1.
- **Dificuldade:** alta. **Risco:** alto.

**29. Playbook de contratos com semáforo e controle de alterações**
- **Descrição:** revisão de contrato contra o playbook do escritório (verde, amarelo, vermelho), com edições como controle de alterações no DOCX.
- **Quem já faz:** plugin jurídico da Anthropic; Spellbook ([F](https://spellbook.com/blog/spellbooks-september-product-spotlight)); Luminance.
- **Adaptação:** locação, prestação de serviços, contrato social, acordo de tratamento de dados (LGPD).
- **Dificuldade:** média. **Risco:** médio. Concorre com o próprio Claude.

**30. Audiência: roteiro antes, transcrição e contradições depois**
- **Descrição:** antes, roteiro de perguntas a partir dos autos. Depois, transcrição da gravação da audiência e lista de contradições entre os depoimentos e a inicial ou a contestação.
- **Quem já faz:** Filevine Depo CoPilot ([F](https://www.filevine.com/webinars/live-demo-what-ai-powered-depositions-actually-look-like/)).
- **Dificuldade:** média (depois) / alta (ao vivo). **Risco:** médio.

**31. Estatísticas da vara, sem perfil pessoal de juiz**
- **Descrição:** tempo médio até a sentença e taxa de procedência por assunto no órgão julgador, com dados do DataJud e do próprio escritório.
- **Quem já faz:** Trellis, Lex Machina, Docket Alarm. Pre/Dicta usa biografia do juiz, o que **não** é recomendado.
- **Adaptação:** medir o órgão julgador, não a pessoa. A proibição francesa serve de alerta.
- **Dificuldade:** média. **Risco:** médio/alto (reputação, qualidade dos dados).

**32. Faixa de valor de acordo ou condenação**
- **Descrição:** faixa estimada a partir de casos parecidos (dano moral do consumidor, verbas trabalhistas).
- **Quem já faz:** EvenUp Claims Intelligence; Theo AI.
- **Dificuldade:** alta (dados). **Risco:** alto (expectativa do cliente; vedação de prometer resultado).

**33. Portal do cliente com a marca do escritório**
- **Descrição:** área onde o cliente vê andamento, documentos e envia arquivos, sem licença própria.
- **Quem já faz:** Legora Portal ([P](https://legaltechnology.com/2025/11/07/legora-announces-new-collaboration-feature-legora-portal/)).
- **Adaptação:** o cliente brasileiro prefere WhatsApp; o portal serve para documentos.
- **Dificuldade:** média. **Risco:** baixo/médio.

**34. Serviços empacotados a preço fixo**
- **Descrição:** o escritório monta "produtos" (revisão de contrato de aluguel em 24 h; cobrança no Juizado Especial) com fluxo, checklist e preço.
- **Quem já faz:** Crosby, Garfield.Law, Lawhive, pacotes da August.
- **Adaptação:** respeitar a tabela de honorários da OAB e a vedação à mercantilização.
- **Dificuldade:** média. **Risco:** médio/alto.

**35. Comparação com o mercado "dar para receber"**
- **Descrição:** estatísticas anônimas e agregadas da base de usuários do Decreta (tempo por vara, valores de acordo, cláusulas usuais), só para quem participa.
- **Quem já faz:** Spellbook Compare to Market ([F](https://help.spellbook.legal/en/articles/12398925-how-to-use-compare-to-market)).
- **Dificuldade:** alta. **Risco:** alto (sigilo profissional, anonimização pela LGPD).

---

## 6. Confiabilidade e verificação

### 6.1 O que dizem os estudos

| Estudo | Achado principal | Tipo |
|---|---|---|
| **Magesh, Surani, Dahl, Suzgun, Manning e Ho, "Hallucination-Free?"**, *Journal of Empirical Legal Studies* 22:216 (2025) | Lexis+ AI e Ask Practical Law AI alucinaram em mais de 17% das consultas; Westlaw AI-Assisted Research em cerca de 33%. A busca reduz, mas não elimina o erro. "Alucinação" inclui a citação real que não sustenta o que foi dito | [I] [Wiley](https://onlinelibrary.wiley.com/doi/full/10.1111/jels.12413); [I] [Stanford HAI](https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries) |
| **Dahl et al., "Large Legal Fictions"** (2024) | Modelos gerais alucinaram de 58% a 88% em perguntas jurídicas verificáveis; a confiança expressa não indicava acerto | [I] resumido em [AI Law Librarians](https://www.ailawlibrarians.com/2026/02/19/what-the-science-says-about-hallucinations-in-legal-research/) |
| **Schwarcz et al., "AI-Powered Lawyering"** (2025, experimento com 127 estudantes) | A ferramenta com busca (Vincent AI) aumentou a produtividade sem aumentar alucinações; o modelo de raciocínio sem busca melhorou a análise, mas introduziu alucinações | [I] idem |
| **Vals VLAIR – Pesquisa jurídica** (out/2025) | Ferramentas jurídicas e o ChatGPT ficaram perto de 80% de acerto, acima da média dos advogados. As ferramentas especializadas foram melhores em fontes de autoridade. Thomson Reuters, LexisNexis e vLex não participaram | [P]/[I] [LawNext](https://www.lawnext.com/2025/10/vals-ais-latest-benchmark-finds-legal-and-general-ai-now-outperform-lawyers-in-legal-research-accuracy.html); [Vals](https://vals.ai/industry-reports/vlair-10-14-25) |
| **Premissa falsa e informação faltando** (Munir et al.; Guo e Rodrigues, 2025) | A maioria das ferramentas aceita a premissa falsa da pergunta e inventa quando falta informação | [I] [AI Law Librarians](https://www.ailawlibrarians.com/2026/02/19/what-the-science-says-about-hallucinations-in-legal-research/) |
| **"Place Matters"** (Curran et al., 2025) | O mesmo caso teve 45% de alucinação em Los Angeles, 55% em Londres e 61% em Sydney; numa lei local australiana, 100% | [I] idem. **Lição para o Brasil: fora dos EUA o risco é maior** |
| **Harvey LAB** (mai/2026) | Tarefas longas de agente, com rubrica "tudo ou nada": a maior nota no placar é 17,8% | [F]/[P] [Mercor](https://www.mercor.com/apex/partner-benchmarks/harvey-lab-leaderboard/) |

**Conclusão:** nenhum fornecedor sério promete "zero alucinação" (Stanford criticou esse marketing). O caminho dos líderes é restringir a resposta às fontes encontradas, verificar depois, ligar cada afirmação ao trecho e manter a revisão humana. Não encontrei avaliação independente de 2026 sobre os produtos de "deep research".

### 6.2 Sanções por citação falsa

**Visão global:** o banco de Damien Charlotin lista **2.246 casos**: EUA 1.517, Canadá 240, Austrália 112, Reino Unido 89, Israel 58, **Brasil 41** ([I] [Charlotin, consultado em 31/10/2026](https://www.damiencharlotin.com/hallucinations/)). Nos EUA, houve pelo menos US$ 145 mil em sanções no 1º trimestre de 2026 ([P] [ComplexDiscovery](https://complexdiscovery.com/the-ai-sanction-wave-145k-in-q1-penalties-signals-courts-have-lost-patience-with-genai-filing-failures)). O Sexto Circuito puniu advogados em mar/2026, mas o valor varia entre as fontes ([P] [Mondaq](https://webiis10.mondaq.com/unitedstates/new-technology/1764522/6th-circuit-court-of-appeals-issues-six-figure-sanctions-for-three-ai-hallucinated-appeals)).

**Brasil:**
- **STF, Rcl 78890 (min. Zanin, 2025):** decisões inexistentes, conteúdo errado atribuído à Súmula Vinculante 6 e marca d'água do aplicativo "MobiOffice". Resultado: litigância de má-fé (art. 80, V, do CPC) e ofício ao Conselho Federal da OAB ([P] [LexLegal](https://lexlegal.com.br/?p=22020)).
- **STF, min. Moraes (1º/10/2026):** comando para IA escondido na petição, detectado pelo "Maria Shield". Multa de R$ 5 mil (art. 77 do CPC) e comunicação à OAB e ao MPF ([P] [Poder360](https://www.poder360.com.br/poder-justica/moraes-multa-advogado-por-comando-de-ia-em-peticao/)).
- **TSE:** multa de cinco salários mínimos por julgados inexistentes e envio à OAB-BA ([P] [Migalhas](https://www.migalhas.com.br/quentes/443562/tse-multa-advogado-por-usar-julgados-inexistentes-criados-com-ia)).
- **TJPR (9ª Câmara Cível):** multa ao advogado por uso de IA "sem zelo e cautela" ([P] [Lex](https://www.lex.com.br/tjpr-multa-advogado-por-litigancia-de-ma-fe-pelo-uso-de-ia-sem-zelo-e-cautela/)).
- **TRT-2 (6ª Turma):** empresa condenada; o escritório culpou estagiários ([P] [Migalhas](https://www.migalhas.com.br/quentes/449977/advogado-de-parte-condenada-por-ma-fe-culpa-estagiarios-por-uso-de-ia)).
- **STJ (min. Schietti):** habeas corpus com trechos de julgados inexistentes e comunicação à OAB ([P] [Sedep](https://www.sedep.com.br/?p=164772)).
- **Divergência:** quem paga a multa? Parte da jurisprudência diz que a multa por má-fé recai sobre a parte e que o advogado responde na OAB; outros tribunais multam o advogado direto ([P] [Migalhas](https://www.migalhas.com.br/depeso/461358/o-advogado-pode-ser-multado-por-um-erro-da-inteligencia-artificial)).

### 6.3 Como os líderes verificam

| Mecanismo | Quem | O que se sabe |
|---|---|---|
| Citador integrado ("a decisão ainda vale?") | KeyCite (TR), Shepard's (Lexis), Paxton | Base própria de tratamento das decisões ([F]) |
| A fonte sustenta a afirmação? | TR Deep Research Verify; Lexis Shepard's Verify; Clearbrief; roteiro da Harvey | Compara afirmação e trecho; aponta atribuição errada. O método interno não é público ([F]) |
| Registro da pesquisa | TR Deep Research | Perguntas, fontes e caminho até a conclusão ([F]) |
| Ligação ao trecho exato | Eve, Clearbrief, Hebbia, CoCounsel | Documento, página e linha ([F]/[P]) |
| Plano aprovado antes de executar | Harvey, Lexis, Clio (modo clássico) | ([F]/[P]) |
| Limitar o escopo do sistema | Garfield.Law, por exigência da SRA | O sistema não propõe jurisprudência ([I]) |
| Especialista humano antes de sair | Darrow, Crosby (responde profissionalmente), Enter | ([F]/[P]) |

### 6.4 Avaliação de qualidade

- **LegalBench:** 162 tarefas de raciocínio jurídico, construídas de forma colaborativa ([I] [arXiv](https://arxiv.org/abs/2308.11462)). A Vals mantém placares públicos de LegalBench e de pesquisa jurídica ([P] [BenchLM](https://www.benchlm.ai/benchmarks/valsLegalBench)).
- **Vals VLAIR:** fev/2025 (7 tarefas, com grupo de advogados) e out/2025 (pesquisa) ([I] [Berkeley/PDF](https://www.law.berkeley.edu/wp-content/uploads/archive/2025/12/VALs-AI-Legal-AI-report-February-2025-.pdf)). Há críticas ao desenho ([P] [Substack](https://bockster.substack.com/p/reviewing-the-review-a-critical-look)).
- **Harvey BigLaw Bench (versão global, fev/2026) e LAB:** benchmarks do fornecedor, o LAB aberto ([F] [Harvey](https://harvey.ai/blog/introducing-harveys-legal-agent-benchmark)).
- **Everlaw:** publica precisão e revocação por base de dados ([F]).
- **Brasil:** OAB-Bench, com 105 questões de 2ª fase da OAB e avaliação de redação jurídica ([I] [arXiv 2504.21202](https://arxiv.org/abs/2504.21202)).
- **Recomendação para o Decreta:** ideia 6 (conjunto-ouro próprio e regressão a cada modelo). Medir separadamente: acerto do prazo (dia exato), cobertura de publicações, resumo com rubrica e taxa de citações não verificadas.

### 6.5 Segurança de dados

| Prática | Quem | Fonte |
|---|---|---|
| ZDR exigido dos provedores de modelo, proibição de treino, dados separados por cliente, regiões, SOC 2 e ISO 27001/42001, SSO, registro de auditoria | Harvey | [F] [Harvey Security](https://www.harvey.ai/security) |
| Muros éticos herdados de outro sistema; na dúvida, bloqueia; registro das tentativas | Harvey com Intapp | [F] [Harvey](https://www.harvey.ai/blog/harvey-intapp-ethical-walls) |
| Busca que respeita as permissões dos sistemas de origem | DeepJudge, Google Gemini for Legal | [P]/[F] |
| Conector herda permissões, é somente leitura e exige plano comercial do Claude | MyCase MCP | [F] [MyCase](https://www.mycase.com/integrations/mycase-mcp/) |
| API da Anthropic: entradas e saídas apagadas em até 30 dias por padrão. Exceções: acordo de ZDR, aplicação da política de uso e requisitos legais. Há modelos sujeitos a "retenção e revisão limitadas" ("Covered Models") | Anthropic | [F] [Privacy Center, 01/07/2026](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) |
| Detecção de comando escondido em peças | STF (Maria Shield); Harvey com Guardrails AI | [P]/[F] |

**Pontos de atenção para o Decreta:**
1. Confirmar se os modelos usados estão na lista de "Covered Models" e se é possível um acordo de ZDR.
2. Todo gateway entre o Decreta e a Anthropic é mais um suboperador (LGPD) e tem sua própria política de retenção.
3. Transferência internacional de dados (LGPD) e dados de saúde (dado sensível) exigem base legal e cláusulas contratuais.
4. Separar os dados por escritório e aplicar permissões por processo também dentro das ferramentas do assistente.

### 6.6 Marco regulatório brasileiro

- **OAB, Recomendação 001/2024 (11/11/2024):** supervisão humana, sigilo, transparência; não delegar atividade privativa à IA ([P] [Estratégia](https://cj.estrategia.com/portal/uso-da-inteligencia-artificial-na-advocacia/)). Em mai/2026, o Tribunal de Ética da OAB-SP recomendou revisão integral do conteúdo gerado ([F] [OAB-SP](https://www.oabsp.org.br/jornaldaadvocacia/26-05-14-1720-ted-da-oab-sao-paulo-define-diretrizes-eticas-para-o-uso-de-inteligencia-artificial-na-advocacia)).
- **CNJ, Resolução 615/2025 (11/03/2025):** governança da IA no Judiciário, com supervisão humana proporcional ao risco ([I] [CNJ](https://atos.cnj.jus.br/files/original1555302025031467d4517244566.pdf)).
- **PL 2338/2023:** aprovado no Senado em 10/12/2024; em meados de 2026 seguia em comissão especial na Câmara ([P] [Teletime](https://teletime.com.br/28/05/2026/motta-votacao-pl-da-ia-junho/)).
- **Provimento OAB 205/2021:** chatbot permitido para informações iniciais; captação de clientela vedada ([P] [Jus](https://jus.com.br/artigos/92409/advogados-nas-midias-digitais)).

### 6.7 Checklist de confiabilidade para o Decreta

1. Nenhuma citação jurídica sai sem passar pelo verificador; o que não for verificável aparece como tal.
2. Toda afirmação sobre os autos vem com documento e página.
3. Ação de alto risco (prazo, envio ao cliente, valores) sempre exige confirmação humana.
4. Respostas de pesquisa só com fontes efetivamente encontradas; nada citado "de memória".
5. Detectar premissa falsa: o assistente deve discordar quando o fato perguntado não está nos autos.
6. Todo documento de terceiro é tratado como dado; comando escondido gera alerta.
7. Registro de auditoria de cada sugestão e de cada confirmação.
8. Conjunto-ouro e regressão antes de trocar modelo ou prompt.
9. Permissões e segredo de justiça aplicados também ao assistente.
10. Retenção zero ou mínima nos provedores, com contratos e suboperadores mapeados.

---

## 7. O que não copiar

- **Marketing de "zero alucinação":** foi criticado pelos pesquisadores de Stanford ([I]).
- **Envio ou negociação autônoma sem aprovação** (negociação autônoma da Luminance, ligações automáticas): no Brasil, só depois de muita maturidade e em tarefas de baixo risco.
- **Previsão a partir do perfil pessoal do juiz** (Pre/Dicta): risco reputacional e regulatório (precedente francês).
- **Disparos ativos para conseguir clientes** (estilo Darrow aplicado a desconhecidos): esbarra na vedação de captação da OAB. O que vale é aplicar a lógica à carteira atual.
- **Protocolo automático:** nenhum líder protocola sozinho.
- **Treinar modelo próprio cedo:** a Lexis relatou ganho pequeno diante do custo ([P]), e a Harvey passou a distribuir as tarefas entre vários provedores ([P] [Sacra](https://sacra.com/c/harvey/)). Investir em orquestração, dados, verificação e avaliação.

---

## 8. Lacunas desta pesquisa

- "Harvey II" (18/08/2026) não foi confirmado.
- As notas de versão da Legora de jun/2026 estão atrás de login.
- O PDF do DISCO Advanced Research não pôde ser lido.
- A disponibilidade do Shepard's Verify é descrita de forma contraditória.
- A mudança de nome do Jurist, da Ironclad, vem só de um blog concorrente.
- Os detalhes dos "Covered Models" da Anthropic não foram encontrados.
- Não confirmei se a API do DJEN busca por nome de parte.
- Não existe avaliação independente de 2026 sobre ferramentas de "deep research" jurídica.
- Quase todas as métricas de desempenho são do fornecedor.

---

## 9. Fontes

**Fornecedores e produtos**
- Harvey: https://www.harvey.ai/blog/the-brief-july-2026 · https://www.harvey.ai/blog/what-the-harvey-agent-changes-about-legal-research · https://www.harvey.ai/security · https://www.harvey.ai/blog/harvey-intapp-ethical-walls · https://harvey.ai/blog/introducing-harveys-legal-agent-benchmark · https://www.harvey.ai/blog/guardrails-ai-joins-harvey · https://help.harvey.ai/articles/uploading-files-to-harvey · https://help.harvey.ai/release-notes/category/workflows · https://www.harvey.ai/blog/review-table-agent-actions
- Legora: https://legora.com/newsroom/legora-introduces-the-legora-aos-the-agentic-operating-system-for-legal-work · https://legora.com/product/agent
- Thomson Reuters: https://www.thomsonreuters.com/en/press-releases/2026/august/thomson-reuters-launches-next-generation-of-cocounsel-legal-the-ai-ecosystem-built-for-legal-professionals · https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-june-2026-releases/ · https://legal.thomsonreuters.com/blog/what-deep-research-made-possible-in-legal-work-and-what-comes-next/
- LexisNexis: https://www.lexisnexis.com/community/infopro/b/researchtip/posts/authority-matters-cite-checking-verification-in-the-ai-era · https://www.lexisnexis.com/community/amp-pressroom/lexisnexis-expands-its-protege-ai-assistant-to-lex-machina-for-effortless-litigation-analytics
- Clio/vLex: https://help.clio.com/hc/articles/29765932267675 · https://www.clio.com/blog/manage-ai/ · https://www.clio.com/about/press/clio-vincent-mobile-app-legal-ai-lawyers/ · https://vlex.com/blog/Batch-AI-Analyzer · https://vlex.com/docket-alarm
- MyCase/8am: https://www.mycase.com/integrations/mycase-mcp/
- Smokeball: https://support.smokeball.com/hc/articles/5860711656599 · https://www.smokeball.co.uk/features/smokeballai
- Filevine: https://support.filevine.com/hc/en-us/articles/51146162307611 · https://www.filevine.com/webinars/live-demo-what-ai-powered-depositions-actually-look-like/
- Eve: https://www.eve.legal/blogs/eve-is-now-eveos
- Supio: https://supio.com/press · https://www.supio.com/press/supio-announces-60m-series-b-to-accelerate-adoption-of-legal-ai-in-plaintiff-law
- Darrow: https://www.darrow.ai/faq
- Spellbook: https://spellbook.com/blog/spellbooks-september-product-spotlight · https://spellbook.com/blog/introducing-compare-to-market · https://help.spellbook.legal/en/articles/12398925-how-to-use-compare-to-market
- Everlaw: https://www.everlaw.com/blog/ai-and-automation/genai-document-review-surpasses-human-performance-on-real-world-litigation
- DISCO: https://www.businesswire.com/news/home/20260209806640/en/DISCO-First-to-Bring-Scaled-Agentic-AI-to-Legal-Tech · https://csdisco.com/offerings/ediscovery/features-ai
- Clearbrief: https://clearbrief.com/
- Paxton: https://www.paxton.ai/small-law-firms
- Seyfarth/Hebbia: https://www.seyfarth.com/news-insights/seyfarth-leads-next-phase-of-deal-execution-and-diligence-through-ai-partnership-with-hebbia.html
- Google: https://www.googlecloudpresscorner.com/2026-08-25-Google-Cloud-Launches-Gemini-Enterprise-for-Legal
- Anthropic (privacidade): https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data

**Imprensa e analistas**
- LawNext: https://lawnext.com/2026/08/lexisnexis-unveils-legal-intelligence-engine-rebuilding-protege-around-dynamic-agentic-orchestration.html · https://www.lawnext.com/2026/02/lexisnexis-launches-lexis-with-protege-replacing-lexis-ai-with-an-end-to-end-workflow-platform.html · https://lawnext.com/2026/04/clio-adds-agentic-ai-capabilities-to-clio-work-also-launches-vincent-mobile-app.html · https://lawnext.com/2026/09/at-its-user-conference-in-las-vegas-8am-announces-mcp-integration-and-new-ai-tools-for-mycase-plus-new-law-firm-funding-program-through-lawpay.html · https://www.lawnext.com/2026/01/evenup-launches-ai-communication-agents-to-handle-routine-tasks-in-pi-cases-also-enhances-its-ai-drafting.html · https://lawnext.com/2025/10/evenup-ai-platform-for-personal-injury-lawyers-raises-150m-at-2b-valuation.html · https://lawnext.com/2026/05/anthropic-goes-all-in-on-legal-releasing-more-than-20-connectors-and-12-practice-area-plugins-for-claude.html · https://www.lawnext.com/2026/02/anthropics-legal-plugin-for-claude-cowork-may-be-the-opening-salvo-in-a-competition-between-foundation-models-and-legal-tech-incumbents.html · https://www.lawnext.com/2026/08/having-already-launched-a-claude-connector-trellis-extends-ai-access-to-its-court-data-with-chatgpt-plugin-and-its-own-chat-tool.html · https://www.lawnext.com/2025/08/legal-analytics-platform-pre-dicta-expands-its-judicial-modeling-adding-appellate-forecasting-enhanced-biographical-analysis-and-comparative-predictions.html · https://www.lawnext.com/2025/08/thomson-reuters-launches-cocounsel-legal-with-agentic-ai-and-deep-research-capabilities-along-with-a-new-and-final-version-of-westlaw.html · https://www.lawnext.com/2025/06/legal-ai-platform-harvey-to-get-lexisnexis-content-and-tech-in-new-partnership-between-the-companies.html · https://www.lawnext.com/2025/10/vals-ais-latest-benchmark-finds-legal-and-general-ai-now-outperform-lawyers-in-legal-research-accuracy.html
- Artificial Lawyer: https://artificiallawyer.com/2026/09/09/harvey-raises-550m-at-15-5bn-val-buys-guardrails-ai · https://www.artificiallawyer.com/2026/09/29/with-august-a-companys-agents-ask-lawyers-for-help/ · https://www.artificiallawyer.com/2026/02/04/y-combinator-picks-3-newmods-general-legal-arcline-legalos/ · https://artificiallawyer.com/2026/08/10/4-legal-techs-join-y-combinator-summer-26 · https://www.artificiallawyer.com/2024/07/08/paxton-ai-launches-citator-publishes-accuracy-scores/ · https://www.artificiallawyer.com/2026/08/25/google-launches-gemini-enterprise-for-legal/ · https://www.artificiallawyer.com/category/legal-agents/
- Crunchbase: https://news.crunchbase.com/venture/legal-tech-startuo-funding-down-ai-acquisitions-2026/
- Bloomberg Law: https://news.bgov.com/business-and-practice/wake-up-call-openai-pushes-gpt-6-astra-deeper-into-big-law · https://news.bloomberglaw.com/legal-ops-and-tech/deepjudge-raises-41-million-to-bolster-legal-research-platform · https://news.bgov.com/private-equity/microsoft-brings-former-robin-ai-legal-tech-employees-into-fold
- ABA Journal: https://www.abajournal.com/news/article/clio-completes-1b-acquisition-of-vlex-and-announces-5b-company-valuation · https://www.abajournal.com/news/article/france-bans-and-creates-criminal-penalty-for-judicial-analytics
- Legal IT Insider: https://legaltechnology.com/evenup-launches-ai-drafts-suite-smart-workflow-and-per-case-pricing-model/ · https://legaltechnology.com/2025/11/07/legora-announces-new-collaboration-feature-legora-portal/ · https://legaltechnology.com/definely-raises-30m-we-speak-to-co-founder-ceo-nnamdi-emelifeonwu/ · https://legaltechnology.com/litigation-outcome-prediction-startup-theo-ai-raises-4-2m-seed-funding/
- Outras: https://www.globallegalpost.com/news/cooley-backed-contract-review-start-up-crosby-raises-60m-in-fresh-funding-1011864931 · https://www.legalcheek.com/2025/09/google-backed-ai-platform-buys-law-firm-in-uk-legal-industry-first/ · https://www.legal.io/articles/5738408/AI-Startup-Eve-Reaches-1B-Valuation-With-New-Funding-Round · https://www.legal.io/articles/5768749/Scissero-Acquires-Robin-AI-s-Managed-Legal-Services-Amid-Reported-Insolvency-Pressures · https://itbrief.co.uk/story/luminance-opens-ai-contract-tool-with-clearer-reasoning · https://siliconangle.com/2024/11/14/ironclad-launches-jurist-ai-powered-legal-assistant-contract-work/ · https://gc.ai/blog/ironclad-legal-ai-review · https://sacra.com/c/filevine · https://sacra.com/c/harvey/ · https://www.axios.com/2023/09/12/ai-judges-trials-predictions · https://www.calcalistech.com/ctechnews/article/rkeopxvkt · https://fast.io/resources/clearbrief-litigation-brief-review/ · https://www.mercor.com/apex/partner-benchmarks/harvey-lab-leaderboard/ · https://complexdiscovery.com/the-ai-sanction-wave-145k-in-q1-penalties-signals-courts-have-lost-patience-with-genai-filing-failures · https://webiis10.mondaq.com/unitedstates/new-technology/1764522/6th-circuit-court-of-appeals-issues-six-figure-sanctions-for-three-ai-hallucinated-appeals · https://www.ibanet.org/UK-SRA-takes-unprecedented-approach-in-authorising-AI-enabled-law-firms · https://en.wikipedia.org/wiki/Hebbia · https://apis.io/providers/legora/ · https://www.businesswire.com/news/home/20251217255538/en/8am-Closes-Out-2025-With-a-Consolidated-Brand-Enhanced-Professional-Solutions-and-Strong-Business-Momentum · https://bockster.substack.com/p/reviewing-the-review-a-critical-look · https://www.benchlm.ai/benchmarks/valsLegalBench

**Estudos e avaliações**
- https://onlinelibrary.wiley.com/doi/full/10.1111/jels.12413 · https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries · https://www.ailawlibrarians.com/2026/02/19/what-the-science-says-about-hallucinations-in-legal-research/ · https://vals.ai/industry-reports/vlair-10-14-25 · https://www.law.berkeley.edu/wp-content/uploads/archive/2025/12/VALs-AI-Legal-AI-report-February-2025-.pdf · https://arxiv.org/abs/2308.11462 · https://arxiv.org/abs/2504.21202 · https://www.damiencharlotin.com/hallucinations/

**Brasil (decisões, regulação, mercado)**
- https://www.poder360.com.br/poder-justica/moraes-multa-advogado-por-comando-de-ia-em-peticao/ · https://lexlegal.com.br/?p=22020 · https://www.migalhas.com.br/quentes/443562/tse-multa-advogado-por-usar-julgados-inexistentes-criados-com-ia · https://www.migalhas.com.br/quentes/449977/advogado-de-parte-condenada-por-ma-fe-culpa-estagiarios-por-uso-de-ia · https://www.migalhas.com.br/depeso/461358/o-advogado-pode-ser-multado-por-um-erro-da-inteligencia-artificial · https://www.lex.com.br/tjpr-multa-advogado-por-litigancia-de-ma-fe-pelo-uso-de-ia-sem-zelo-e-cautela/ · https://www.sedep.com.br/?p=164772 · https://cj.estrategia.com/portal/uso-da-inteligencia-artificial-na-advocacia/ · https://www.oabsp.org.br/jornaldaadvocacia/26-05-14-1720-ted-da-oab-sao-paulo-define-diretrizes-eticas-para-o-uso-de-inteligencia-artificial-na-advocacia · https://atos.cnj.jus.br/files/original1555302025031467d4517244566.pdf · https://teletime.com.br/28/05/2026/motta-votacao-pl-da-ia-junho/ · https://jus.com.br/artigos/92409/advogados-nas-midias-digitais · https://www.cnj.jus.br/banco-de-precedentes-amplia-acesso-a-decisoes-que-orientam-julgamentos-no-pais/ · https://tjrr.jus.br/images/sti/docspdf/Manual_para_DJEN_e_DJE.pdf · https://www.bloomberglinea.com.br/startups/enter-startup-brasileira-de-ia-juridica-atinge-us-12-bilhao-em-aporte/ · https://www.sra.org.uk/sra/news/press/garfield-ai-authorised?org=u139
