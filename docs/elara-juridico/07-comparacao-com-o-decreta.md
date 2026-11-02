# Comparação: Elara, Decreta e concorrentes

Situação em 02/11/2026. O lado do Decreta vem da leitura do código do repositório (esquema, rotas, telas e migrations), não de testes de uso. "Não encontrei" significa que a busca no código não achou o recurso.

## Conclusão

**O Decreta não é o Elara.** O Elara, como descrito no documento, é uma instalação por escritório, sem deploy, em Cloudflare Workers com Supabase. O Decreta é outro código, em Bun, Hono e Postgres em servidor próprio, com várias partes do roadmap do Elara já prontas.

Isso muda como usar o documento do Adriano:

- **Vale como está:** benchmark, preços, mercado potencial, funcionalidades de SaaS, métricas e o próximo passo, a pesquisa com escritórios.
- **Não se aplica:** o diagnóstico do código, a migração de Supabase e o cronograma de 3 a 4 devs, pensados para outro ponto de partida.
- **O que falta ao Decreta para ser vendido:** cobrança, planos e painel da plataforma. É aproximadamente a Fase 2 e a Fase 4 do roadmap do Elara.

## Módulos do Elara no Decreta

| Módulo do Elara | Decreta | Observação |
|---|---|---|
| Dashboard | Tem | Tela Hoje, centrada no que fazer no dia |
| Clientes | Tem | |
| Processos, movimentações, prazos e audiências | Tem | Com motor de prazos |
| Consulta DataJud | Tem | |
| Extrajudiciais | Parcial | Processo pode ser do tipo extrajudicial; não encontrei protocolo, etiqueta e situações próprias (exigência, deferido) |
| Novos negócios | Tem | Com conferência da pasta |
| Documentos | Tem | Com leitura por IA e link de envio pelo cliente |
| Assessoria (contrato contínuo) | Não encontrei | |
| Alvarás | Tem | 5 etapas; o Elara lista 7 (separa depositado, solicitado e emitido) |
| Financeiro (honorários, parcelas) | Não encontrei | É a Fase 2 do [plano de execução](../pesquisa/2026-10-31-plano-de-execucao.md) |
| Atendimento | Parcial | Registro por canal, transcrição e resumo; sem gravar no navegador e sem relatórios |
| Chat, resumos, jurisprudência e documentos | Tem | Inclui verificação de citações |
| Relatórios | Não encontrei | Só a exportação de prazos |
| Tarefas | Tem | |
| Usuários, permissões e configurações | Tem | Equipe com convite e verificação em duas etapas |
| Painel da Sócia | Não encontrei | |
| Contratos, Procurações, Cobranças e NF-e | Não encontrei | A conferência cobra procuração na pasta, mas não há módulo |

O Decreta também tem o que o Elara não lista: captura do DJEN, briefing de prazo, cálculos, radar de precedentes, leitura de peça contrária, mensagens ao cliente com aprovação, resumo da manhã no WhatsApp e conector MCP.

## Roadmap do Elara no Decreta

| Fase do Elara | Situação | Evidência ou lacuna |
|---|---|---|
| 0 · Descoberta e fundação | Quase toda feita | CI, deploy e migrations versionadas; falta decidir meio de pagamento e planos |
| 1 · Multi-tenancy | Feita | RLS por escritório, chaves só no servidor, fila no Inngest, convites e papéis |
| 2 · Monetização | **Não iniciada** | Sem planos, checkout, assinatura, régua de inadimplência ou NFS-e. Só há limites de IA por pessoa e por dia |
| 3 · Autocontratação e guia | Parcial | Há cadastro aberto e tela de começar. O cadastro já tem limite por IP e tetos para escritório em avaliação. Faltam página de preços, teste com prazo, tours, central de ajuda, importação de planilha, captcha e bloqueio de e-mail descartável |
| 4 · Painel da plataforma | **Não iniciada** | Liberar um escritório hoje é um `update` direto no banco |
| 5 · Escala e diferenciação | Parcial | Publicações prontas; portal do cliente, contratos, cobrança e API pública não encontrados |

Das funcionalidades novas recomendadas no documento, ainda não encontrei: exportação completa e encerramento de conta (exigência da LGPD), suporte no produto e página pública de status.

## Como cada concorrente foi visto

| Concorrente | Como foi visto | Documento |
|---|---|---|
| Astrea | Usado com dados fictícios | [06](06-astrea-por-dentro.md) |
| Projuris ADV | Usado com dados fictícios | [08](08-projuris-por-dentro.md) |
| Jus IA | Usado com dados fictícios, no plano gratuito | [09](09-jus-ia-por-dentro.md) |
| ADVBOX | Usado com dados fictícios; publicações e IA bloqueadas no teste | [10](10-advbox-por-dentro.md) |
| Jurídico AI | Usada com dados fictícios, na experimentação | [12](12-juridico-ai-por-dentro.md) |
| CPJ-3C | Só material de treinamento; 4 de 16 trilhas abriram | [11](11-cpj-3c-pelo-academy.md) |
| Promad | Só fontes públicas | [13](13-promad-por-fontes-publicas.md) |
| Advise | Só fontes públicas | [14](14-advise-por-fontes-publicas.md) |
| EasyJur | Só fontes públicas; a conta de teste não saiu sem falar com especialista | [15](15-easyjur-por-fontes-publicas.md) |
| Legal One | Só fontes públicas; sem teste e sem preço público | [16](16-legal-one-por-fontes-publicas.md) |

## O que os testes mostraram

**Prazo em feriado.** Nenhum sistema usado avisou. Astrea, Projuris e ADVBOX aceitam prazo digitado em feriado sem alerta.

- **Projuris:** o modelo de fluxo conta em dias úteis, mas não conhece 20/11 e marcou 23/11 em vez de 24/11.
- **ADVBOX:** o workflow conta dias corridos, e os prazos de 5 e 13 dias caíram em sábado e em domingo com feriado. A contagem com feriados só aparece na IA paga, sem teste.
- **Jurídico AI:** o chat recusa contar, e não há prazo manual sem processo monitorado.
- **Jus IA:** indica o prazo em dias úteis, não calcula a data sem saber da citação e manda conferir.
- **Decreta:** mostra a conta, marca a data digitada e aponta quando ela difere da conta ([teste](../../apps/api/test/prazo-auditavel.test.ts)). Desde 02/11/2026 também avisa na hora que a data digitada cai em dia sem expediente, com o motivo e o próximo dia útil ([registro](./18-decreta-no-mesmo-teste.md#o-prazo-em-feriado-e-a-conta-com-2011)).

**Peça a partir da mesma petição fictícia.** A contestação pedida em cada sistema partiu do mesmo PDF. No ADVBOX não foi possível, porque os agentes estão bloqueados no teste.

| Sistema | Usou o PDF | Fato ou prova sem base | Ré pessoa jurídica | Julgados na peça |
|---|---|---|---|---|
| Astrea | Em parte | Sim: log de sistema e checkout não anexados; diz que o autor "jamais" reclamou | Errou | 1; existe, mal encaixado |
| Projuris ADV | Não | Sim: problema logístico regularizado, suporte prestado, alternativas oferecidas | Certo, porque informei na descrição | Nenhum |
| Jus IA | Sim | Não | Certo | 4; existem e dizem o que a peça afirma |
| Jurídico AI | Sim | Uma afirmação: a inicial "distorce a dinâmica da contratação" | Errou; corrigida pelo chat | 2 do STJ; existem, um com uso exagerado |
| Decreta | Entrada sim: o texto do PDF vai inteiro no pedido à IA. Saída não medida | Não medido. O pedido manda marcar `[COMPLETAR]` e não inventar, mas nada confere por código | Não medido. O pedido traz a ré no polo passivo e a instrução de quem pediu | Não medido. A peça é proibida de citar julgado com número |

**Citações.** Não achamos julgado inventado entre os que conseguimos conferir. Ficaram fora da conferência 10 julgados do TJSP na pesquisa da Jurídico AI, porque os links exigem login. O memorando do Jus IA cita um número que ele mesmo admite não ter localizado. O risco que apareceu nos testes é outro: fato sem base, encaixe fraco e notas internas no corpo da peça.

## Decreta e concorrentes

Sem marca, o item foi visto em tela ou em uso. **(d)** é o que o fornecedor declara, sem teste nosso. "Não encontrado" vale só para o que foi lido ou visto. EasyJur, Legal One, Promad e Advise são inteiros por fontes públicas, e o CPJ-3C é inteiro pelo material de treinamento.

### Sistemas de gestão

| Recurso | Decreta | Astrea | Projuris ADV | ADVBOX | EasyJur (d) | Legal One (d) |
|---|---|---|---|---|---|---|
| Publicações | DJEN | Sim | Sim; nenhuma publicação real no teste | Cadastro bloqueado no teste; DJEN ou completo (d) | Termos, login de tribunal e nome | Robôs; intimações eletrônicas à parte |
| IA sugere prazo | Sim | Company e VIP | Não visto | Add-on Justin-e (d) | Análise acionada pela pessoa; automática só no Work | Só no Premium |
| Conta de prazo auditável | Sim | Data manual, sem aviso de feriado; calculadora listada do Company para cima, não localizada | Sem aviso de feriado; fluxo sem 20/11; calculadora do anexo 03 não vista | Data manual; workflow em dias corridos | Alegada; a ajuda não traz regra | Tabela de CPC e CLT e feriados; tarefa predefinida não sugere dia útil |
| Peças com IA | Sim | Com cortesias; exige PDF; inventou prova | Sim; não usou o anexo | Add-on, bloqueado no teste (d) | SmartDocs | Não; CoCounsel à parte |
| Jurisprudência verificada | Sim | Jux (beta); os 2 julgados vistos existem | Nenhum julgado no teste | Não testada | Juris.ai e portal público | Não; Westlaw à parte |
| Panorama de julgados | **Não encontrei** | Jux | Jurimetria à parte; não abriu | Não verificado | Não encontrado | Não encontrado |
| Financeiro | **Não** | Sim, com boleto pelo Asaas | Sim, com repasse e conciliação; item à parte | Sim, do Banca Jurídica em diante; boleto depende do Asaas | Asaas, boleto, Pix e nota; na ajuda, só despesas | Fatura, nota, boleto e conciliação |
| Portal do cliente | **Não** | Sim | Sim; visão do cliente não vista | Não achado; termos citam atendimento virtual | Do Premium em diante | Conecta |
| WhatsApp ao cliente | Com aprovação | Pacote pago | Compartilhamento citado; não visto | Só parceiros; não ligados | Add-on Talk | Não encontrado |
| Kanban e workflow | **Parcial** | Sim | Kanban; workflow à parte | Sim; workflow do Banca Max em diante | Workflow por plano; kanban no CRM | Agenda em kanban; workflow no Premium |
| Indicadores | **Não** | Sim | Dashboards | Painel e relatórios; BI no Elite | 14 indicadores | Analytics à parte |
| Timesheet | **Não** | Sim | Sim, com cronômetro | Não encontrado | Cronômetro na agenda | Sim; o pacote muda conforme a página |
| Certificado para sigilosos | **Não** | Sim | Não verificado | A1 por usuário | Credenciais de tribunal | Credencial do advogado e A1 |
| Alvarás | Sim | Não encontrado | Não encontrado | Só categoria financeira | Não encontrado | Não encontrado |

### Outros sistemas

| Recurso | Decreta | CPJ-3C (material) | Promad (d) | Advise (d) | Jus IA | Jurídico AI |
|---|---|---|---|---|---|---|
| Publicações | DJEN | Robô, segunda fonte e intimação eletrônica | Diários, DJEN, painéis e Domicílio | Núcleo do produto, por palavra-chave | Monitora por OAB; não visto | Monitoramento por CNJ ou OAB; não visto |
| IA sugere prazo | Sim | Classificação que aprende e sugere tarefas; sem IA de prazo visível | Não encontrado | Não encontrado | Sugestões no Premium; não vistas | Tarefa automática (d); não vista |
| Conta de prazo auditável | Sim | Evento com contagem e recesso configurável; aula de contagem não abriu | Não calcula | Não calcula; agenda de prazos | Não calcula a data; manda conferir | Chat recusa contar; sem prazo manual |
| Peças com IA | Sim | Não encontrado | Não encontrado | IAdvise, com cota | Sim, sem fato inventado | Sim; leu o PDF, errou a ré |
| Jurisprudência verificada | Sim | Não encontrado | Não encontrado | IAdvise, com link | Validador de citações; os conferidos existem | Links ao inteiro teor; 2 do STJ conferidos |
| Panorama de julgados | **Não encontrei** | Não encontrado | Não encontrado | Não encontrado | Sem painel; recusou calcular sem amostra | Não encontrado |
| Financeiro | **Não** | Títulos, NFS-e, boleto e Pix, nas notas de versão | Contas, caixa, custas e faturamento por evento | Fluxo de caixa no Hub | Não encontrado | Não existe |
| Portal do cliente | **Não** | CPJ-Connect, só consulta | Perfil Cliente, só consulta | Citado no Prawo | Não encontrado | Não existe |
| WhatsApp ao cliente | Com aprovação | Não encontrado | Manual, pelo WhatsApp Web | Não encontrado | Não encontrado | Não existe |
| Kanban e workflow | **Parcial** | Fluxo por evento; kanban não encontrado | Não encontrado | Não encontrado | Não encontrado | Não existe |
| Indicadores | **Não** | Dashboard e cubos | Dashboard, só administrador | BI no Prawo | Não encontrado | Não encontrado |
| Timesheet | **Não** | Sim | Não encontrado | Páginas divergem | Não encontrado | Não encontrado |
| Certificado para sigilosos | **Não** | QR Code ou A1; cofre CPJ-Safe | QR Code ou A1 | Segredo de justiça no Prawo | Não encontrado | Não encontrado |
| Alvarás | Sim | Não encontrado | Não encontrado | Não encontrado | Não encontrado | Não existe |

Fontes: os documentos da tabela acima e, para o que eles não cobrem, o [anexo 03](../pesquisa/2026-10-31-anexos/03-concorrencia-brasil.md). Quando divergem, vale o documento.

**Leitura para o Decreta:**

- **À frente:** a conta de prazo conferida, a leitura de publicação por IA e os alvarás. Nenhum sistema usado avisou sobre feriado.
- **Atrás:** financeiro, portal do cliente, indicadores, timesheet e certificado para sigilosos.
- **Jus IA e Jurídico AI** não são gestão. Concorrem em pesquisa e redação, com entrada a partir de R$ 58,90 e R$ 55,92 por mês.

## Aplicativos de celular

Consulta de 01/11/2026 na App Store. As páginas da Google Play não abriram, então as notas de Android são do anexo 03, de 31/10/2026.

| Concorrente | iOS | Android | Observação |
|---|---|---|---|
| Astrea | 4,84 (2.898 avaliações) | 4,5 | O melhor do grupo. Crítica: não dá para lançar prazo pelo celular depois de uma audiência. Tem um segundo app para o cliente |
| Projuris ADV | 4,53 (77) | 4,8 | Captura de intimações por OAB e financeiro ficam só na web |
| Legal One | 2,78 (18) | 2,6 | Reclamações de sessão que cai e app só de consulta |
| ADVBOX | Só o Donna: 5,0 (6) | Só o Donna | Assistente de IA; o sistema roda no navegador |
| EasyJur | Não localizado | Não localizado | O blog afirma que há app nativo; não o achei nas lojas |
| CPJ-3C | Não localizado | Não localizado | |
| Promad | App Integra: 2,84 (43) | Não verificado | Ligação com a Promad não confirmada |
| Advise | 3,15 (33) | 3,8 | Monitoramento com notificações; relatos de lentidão |
| Jurídico AI | Não localizado | Não verificado | |
| Jus IA | 3,77 (26) | 3,9 | Elogio mais citado: transcrever áudio de WhatsApp. Crítica: "inventa jurisprudência" |

**Leitura para o Decreta:** o celular segue fraco no mercado, e só o Astrea é bem avaliado. Mas o Decreta tem manifesto instalável sem service worker nem notificações push. Quem o instala não recebe aviso de publicação no aparelho, que é o recurso que Astrea e Advise oferecem. Hoje o aviso vem pelo WhatsApp.

## Ordem sugerida

1. **Pesquisa com escritórios.** É o próximo passo do documento, e nenhum número de demanda dele foi medido. Dá para aproveitar e testar o preço.
2. **Decisões antes de cobrar:** preço e planos, meio de pagamento e o parecer sobre o uso do DataJud, já que vender a outros escritórios muda o peso dessa questão (seção 7 do plano de execução).
3. **Cobrança da assinatura e painel da plataforma**, para vender sem intervenção manual.
4. **LGPD e cadastro:** exportação completa, encerramento de conta, termos, captcha e bloqueio de e-mail descartável.
5. **Financeiro do escritório e do alvará ao honorário.** Fecha a maior lacuna frente aos concorrentes e aproveita o diferencial dos alvarás.
6. **Trazer o acervo e ensinar:** busca em lote pela OAB, importação de planilha e guia por módulo.
7. **Push no celular e indicadores**, conforme o que os pilotos pedirem.

Os testes nos concorrentes não mudam essa ordem. As ideias pontuais estão em "O que levar" de cada documento. As que mais se repetem são marcar toda lacuna da peça, ligar cada fato a um trecho do documento e avisar quando uma data digitada cai em feriado. Não conferi quais delas o Decreta já faz por inteiro.
