# Decreta: o que construir a seguir

**Pesquisa e plano de execução — 31/10/2026**

Este plano junta seis pesquisas feitas em 31/10/2026, com centenas de páginas lidas: fontes de jurisprudência e legislação, APIs operacionais, concorrência no Brasil, movimentos dos concorrentes com IA, fronteira internacional da IA jurídica e dores e regulação da advocacia. Os relatórios completos estão em [`2026-10-31-anexos/`](2026-10-31-anexos/), com a URL de cada afirmação e uma marca dizendo se ela foi conferida na fonte, se vem de terceiros ou se não foi confirmada.

Conferi pessoalmente as duas afirmações que mudam a ordem do plano:
- o texto da Portaria CNJ 374/2026 no site de atos do CNJ;
- o endpoint de caderno diário do DJEN, chamado em 31/10/2026.

Os números de esforço são em semanas de uma pessoa desenvolvendo, que já conhece a base.

---

## 1. O que a pesquisa mudou

1. **Existe um jeito melhor de capturar publicações, e ele está no ar.** A API do DJEN tem um endpoint público de caderno diário: `GET /api/v1/caderno/{tribunal}/{data}/D`. Ele devolve um ZIP com todas as comunicações do dia de um tribunal, no mesmo formato da consulta por OAB. Só o TJSC teve 27.041 comunicações em 30/10/2026 (22 MB). Cruzar o caderno no nosso servidor resolve duas coisas: o teto de 10 mil resultados e o limite de 20 requisições por IP. Além dele, há outros dois endpoints públicos:
   - `/comunicacao/tribunal` diz quando cada tribunal enviou o último caderno;
   - `/comunicacao/{hash}/certidao` devolve a **certidão de publicação em PDF**, que serve de prova do prazo.

   Fonte: [anexo 02, §3.1](2026-10-31-anexos/02-apis-operacionais.md).
2. **O DataJud ficou juridicamente delicado.** A Portaria CNJ 374, de 14/08/2026, conferida na fonte, diz no novo art. 4º que os dados servem "exclusivamente para fins legais, não comerciais". Ela veda "qualquer tipo de exploração comercial" e torna **obrigatório citar o CNJ e o DataJud como fonte** em aplicativos. Medimos também o atraso dos dados: 15 dias no TJSC, 25 no TRT12 e 5 no TRF4. Fonte: [atos.cnj.jus.br/atos/detalhar/6972](https://atos.cnj.jus.br/atos/detalhar/6972).
3. **Jurisprudência com citação conferida virou item obrigatório**, e é a maior lacuna do Decreta. Jus IA, Astrea Jux, ChatADV, EasyJur, Jusfy, Jurídico AI e o CoCounsel em português já têm. Dá para construir com fontes abertas:
   - STJ Dados Abertos: íntegras diárias desde 2021, espelhos de acórdãos e temas repetitivos, sob CC BY;
   - Pangea/BNP do CNJ: precedentes qualificados de 93 órgãos, inclusive TJSC, TRT12 e TRF4;
   - normas.leg.br: lei federal por dispositivo, sob CC BY 4.0;
   - planilha do Informativo do STF.

   O limite é que TJSC e TRT12 bloqueiam robôs com captcha, então não há inteiro teor automatizável desses dois. Fonte: [anexo 01](2026-10-31-anexos/01-jurisprudencia-legislacao.md).
4. **A punição por citação inventada chegou a SC e endureceu.** O TJSC aplicou multa de 10% do valor da causa em fev/2025 e manteve outra multa por jurisprudência fictícia em set/2026. O TST multou parte e advogado em 1% cada. No STJ há vários casos em 2026, e um "recado oculto para a IA" na petição rendeu multa de 10% e ofício à Polícia Federal. As IAs dos tribunais (Maia, ApoIA) já detectam texto escondido. Fonte: [anexo 05, §2.2](2026-10-31-anexos/05-dores-regulacao-tendencias.md).
5. **A regra da OAB sobre IA exige papelada que ninguém automatiza.** A Recomendação CFOAB 001/2024 pede:
   - consentimento **escrito e assinado** do cliente antes de usar IA;
   - revisão integral de tudo antes de protocolar;
   - fornecedor que não treine com os dados;
   - política interna de IA no escritório.

   O TED da OAB-SP já usa a recomendação como parâmetro. Fonte: [anexo 05, §2.1](2026-10-31-anexos/05-dores-regulacao-tendencias.md).
6. **Onde o Decreta já está à frente.** Nas fontes públicas, nenhum concorrente tem resumo diário pelo WhatsApp para o advogado, briefing com o que joga a favor e contra, conferência da pasta do cliente nem módulo de alvarás. O "Perguntar" vem incluído no preço, enquanto a ADVBOX cobra R$ 200 por mês pelo equivalente. Celular primeiro também é posicionamento real: só o Astrea tem app bem avaliado (4,5); Legal One tem 2,6, Jusfy 3,4 e Jus IA 3,9 na Play. Fonte: [anexo 03, §6.4](2026-10-31-anexos/03-concorrencia-brasil.md).
7. **As dores do mercado no Reclame Aqui:**
   - **Captura que falha e prazo perdido.** Exemplos: homônimo que gerou 1.900 intimações erradas e senhas de tribunal vencidas.
   - **Cobrança e cancelamento.** Aurum tem 44 cobranças indevidas e 35 "não consigo cancelar"; o Jusbrasil, 6.314 cobranças indevidas.
   - **IA vendida como add-on opaco.** A Justin-e e a Donna, da ADVBOX, custam R$ 200 cada; o Jus IA bloqueia por limite de mensagens.

   Fonte: [anexo 03, §5](2026-10-31-anexos/03-concorrencia-brasil.md).
8. **Fora do Brasil, a fronteira é agente com plano e aprovação humana**, com cinco práticas que dão para trazer:
   - verificação de citação como produto (Deep Research Verify, Shepard's Verify);
   - cada afirmação ligada ao documento e à página;
   - automação graduada por risco: no EveOS, o dado de baixo risco entra sozinho, o de risco médio vira sugestão e o de alto risco exige confirmação, quase o princípio do Decreta;
   - auditoria noturna da carteira;
   - conector MCP.

   A nova geração do CoCounsel roda sobre o Claude Agent SDK. Fonte: [anexo 04](2026-10-31-anexos/04-fronteira-ia-juridica.md).
9. **O dinheiro do escritório mudou de trilho.**
   - O Pix Automático funciona desde 16/06/2025. Para ser recebedor, é preciso CNPJ ativo há 6 meses.
   - Asaas e Efí têm API para Pix Automático; a Stripe não oferece para empresas brasileiras.
   - A LC 214/2025 (art. 127) dá redução de 30% no IBS e na CBS para advogados.
   - Desde 01/10/2026, o WhatsApp oficial cobra R$ 0,035 por mensagem de utilidade.

   Fonte: [anexos 02 e 05](2026-10-31-anexos/).
10. **Quem é o cliente.** São 72% de advogados autônomos, e 64% ganham até 5 salários mínimos com a advocacia. Em SC, 62% trabalham só no interior. A dor mais citada é dinheiro (remuneração e honorários), não tecnologia. O previdenciário explodiu: 1,82 milhão de processos novos no 1º semestre de 2026. Fonte: [anexo 05, §1 e §5](2026-10-31-anexos/05-dores-regulacao-tendencias.md).

---

## 2. O que os concorrentes estão fazendo com IA

Resumo do [anexo 06](2026-10-31-anexos/06-movimentos-ia-concorrentes.md), com a linha do tempo de 2025–2026 e as fontes.

**O que já virou comum (não diferencia mais):**
- **A IA lê a publicação e sugere o prazo.** No 2º trimestre de 2026 isso virou padrão:
  - Legal One, em maio, só nos planos Premium e Exclusive;
  - nova Justin-e da ADVBOX, em maio, com indicador de confiança e aprendizado com os descartes;
  - alertas proativos do Jus IA, em abril.

  O diferencial agora é **provar que acerta**: feriados da comarca, suspensões e registro de quem confirmou.
- **Chat jurídico e peça avulsa.**
  - O Jus IA vem em todos os planos do Jusbrasil desde abril de 2026, e o Jusbrasil diz ter 300 mil advogados por mês.
  - A LIVIA, da Forlex, chega gratuita por meio da OAB.
  - O Jux, do Astrea, é grátis até 15/01/2027.
  - A Anthropic abriu o código do "Claude for Legal".

  Peça só tem valor amarrada ao prazo, ao briefing e ao timbre.
- **"Feito com Claude".** A Donna, da ADVBOX, usa Claude pela API, e o novo CoCounsel Legal, que chega ao Brasil em novembro, foi reconstruído sobre o Claude Agent SDK.
- **"Agentes" como embalagem:** EasyJur Work, cobrado por tarefa (de R$ 720 a R$ 8.880 por mês), e os 19 agentes de petição da ADVBOX/LawX, de outubro de 2026.

**Para onde foi o dinheiro:**
- **Jusbrasil comprou a MinutaIA** (27/08/2026, confirmado) e já tinha absorvido a Digesto. Juntas, as duas se aproximam de R$ 1 bilhão de receita anual. Licenciar jurisprudência do Jusbrasil passou a ser depender de um concorrente direto, mais um motivo para a fase 1 usar só fontes públicas.
- **Jusfy:** Série A de US$ 15 milhões com a Thomson Reuters Ventures. Fatura mais de R$ 50 milhões e tem mais de 50 mil assinantes. Dos que vendem para escritório pequeno, é o concorrente mais parecido com o Decreta, agora capitalizado. Ganha clientes por convênios com OAB e CAA (30% de desconto; OAB-MG e OAB-RJ).
- **Enter**, unicórnio (US$ 100 milhões, avaliação de US$ 1,2 bilhão), e Harvey e Legora jogam nas pontas: contencioso de massa de empresas e grandes bancas. Não é o público do Decreta.

**A OAB entrou em campo:**
- A OAB-SP move ação civil pública contra a Enter desde 07/10/2026; a tutela de urgência foi negada em 21/10.
- O Conselho Federal publicou a Resolução 16/26, com regras para acordos de conduta (TACs) com empresas de IA jurídica.
- A OAB-RJ venceu a ação contra o Resolve Juizado, que vendia petições por IA a leigos.
- O recado, em resumo: IA vale quando há advogado responsável identificado, revisão humana registrada e nada de "peça pronta" com supervisão de fachada. É o desenho do Decreta. Falta torná-lo **visível e auditável** (fases 0.3 e 0.5).

**O espaço que continua aberto:**
- Briefing proativo pelo WhatsApp **para o advogado**: ninguém faz.
- Celular primeiro, com o prazo confirmado pelo celular.
- Prazo à prova de auditoria.
- Preço claro com IA incluída.
- Escritório falando com o **próprio** cliente, com revisão. O leigo já tem tradução barata de movimentação (EscavAI, "Entender" do Jusbrasil, LIVIA Cidadão).
- Previdenciário e trabalhista com conferência da pasta.

---

## 3. Princípios que guiam a ordem

- **Fonte oficial e pública primeiro.** O Decreta não usa robô que imita gente, não resolve captcha e não guarda senha nem 2FA de tribunal. A Portaria CNJ 316/2024, art. 9º, autoriza bloquear "rotinas automatizadas", e o WAF do TJSC já bloqueia.
- **Não perder prazo vem antes de tudo.** É a dor nº 1 do mercado e o núcleo do produto.
- **A IA sugere, uma pessoa confirma, e o nível de confirmação depende do risco.** Prazo, envio ao cliente e valores sempre pedem confirmação.
- **Toda citação e toda afirmação têm de onde saíram.** Nada citado "de memória".
- **Construir sobre o que já existe** (motor de prazos, WhatsApp, peças, conferência da pasta, alvarás), em vez de abrir frentes soltas.

---

## 4. O plano

| Fase | Tema | Esforço (1 dev) | Semanas, em sequência |
|---|---|---|---|
| 0 | Blindagem: captura, prazo auditável, DataJud, OAB | 3–4 semanas | 1 a 4 |
| 1 | Jurisprudência verificada | 5–7 semanas | 5 a 11 |
| 2 | Honorários e cobrança | 3–4 semanas | 12 a 15 |
| 3 | Cliente no WhatsApp | 3–4 semanas | 16 a 19 |
| 4 | Cálculos | 3–4 semanas | 20 a 23 |
| 5 | IA de nova geração | cerca de 1 semana por item | intercalada |
| 6 | Monitoramento pago e nichos | sob demanda | depois da fase 3 |

Com uma pessoa só, as fases andam em sequência: cerca de 5 a 6 meses para as fases 0 a 4. Os itens da fase 5 entram entre as fases, um por vez, quando o que eles usam fica pronto. O 5.4, por exemplo, só depois da 1.1. Cada um soma o próprio esforço ao calendário. A ordem 2 → 3 → 4 pode mudar conforme o que os escritórios do piloto pedirem. A 0 e a 1 não mudam.

### Fase 0 — Blindagem (semanas 1 a 4)

O objetivo é deixar o Decreta à prova de prazo perdido, de multa e de questionamento sobre os dados que usa.

**0.1 Citar o DataJud e medir a idade dos dados** — *1 a 2 dias*
- Na tela do processo, mostrar "Fonte: CNJ/DataJud", que o § 5º do art. 4º da Portaria 374/2026 torna obrigatório, e "dados do tribunal atualizados até DD/MM", lido do maior `@timestamp` do índice.
- Pedir um parecer sobre o "não comercial" (veja a seção 7). Tese a testar: o escritório consulta os próprios processos, e o Decreta não revende nem redistribui os dados.
- Nunca usar o DataJud como gatilho de prazo. Hoje ele já não é; o objetivo é manter assim.
- *Pronto quando* a fonte e a data aparecerem em todo andamento vindo do DataJud.

**0.2 Captura pelo caderno diário do DJEN** — *1,5 a 2 semanas* — [anexo 02, §3.1 e §5](2026-10-31-anexos/02-apis-operacionais.md)
- Nova rotina no Inngest, depois das 03:00:
  - para cada tribunal com processo do escritório (TJSC, TRF4 e TRT12, além de STJ, TST e STF para os recursos), baixar o caderno;
  - conferir o SHA-256 e cruzar no servidor por OAB da equipe e por número de processo da carteira;
  - reprocessar quando a `versao` subir, porque o tribunal pode cancelar comunicações.
- A busca por OAB em `packages/tribunais/src/djen.ts` fica como reforço das 12:40 e das 18:40, para publicações do mesmo dia.
- Guardar a **certidão de publicação em PDF** (`/comunicacao/{hash}/certidao`) junto da publicação, como prova do prazo.
- Montar um **painel "saúde da captura"**:
  - quando foi a última captura de cada tribunal (`/comunicacao/tribunal`);
  - falhas;
  - publicações sem processo vinculado;
  - aviso no WhatsApp da equipe quando um tribunal não enviar no dia.
- Para a LGPD, processar o caderno em memória, guardar só o que casou e descartar o resto.
- Fica para depois o cruzamento por **nome ou CPF de cliente**, que pega a intimação de um cliente antes de o advogado estar cadastrado no processo. Ele vale muito, mas exige tratar homônimos, e por isso só como sugestão a confirmar.
- *Pronto quando* um dia inteiro de TJSC for capturado sem nenhuma chamada por OAB, com a certidão anexada e o painel mostrando o envio de cada tribunal.

**0.3 Prazo à prova de auditoria** — *1 semana* — [anexo 05, §3](2026-10-31-anexos/05-dores-regulacao-tendencias.md), [anexo 03, §6.3](2026-10-31-anexos/03-concorrencia-brasil.md)
- Em cada prazo, mostrar a conta inteira: disponibilização → publicação → início → fim, com a regra aplicada (CPC, CLT ou JEC), os feriados e as suspensões considerados, quem confirmou e quando. O motor em `packages/core/src/prazos.ts` já calcula tudo isso; falta expor.
- **Dupla intimação (Tema 1.180 do STJ, ainda sem tese).** Quando houver dois marcos, mostrar os dois e contar pelo mais cedo, dizendo qual regra está valendo.
- **Calendário por comarca.** Cada diretor de foro de SC edita uma portaria (a de Barra Velha tem a Festa do Divino). Começar pelas comarcas dos clientes do piloto e deixar o escritório cadastrar as demais.
- Gerar, na peça, o **tópico de tempestividade** pronto, com base na certidão do DJEN.
- **Segunda conferência antes de pedir a confirmação.** Uma regra determinística confere a sugestão da IA: o tipo de prazo combina com o tipo de ato? A quantidade de dias bate com a regra? A tela mostra a confiança, e o Decreta deixa de sugerir o que a equipe sempre descarta (Justin-e e Astrea já fazem algo parecido).
- **Confirmação consciente.** Para confirmar, a pessoa vê a decisão e a regra; não existe "aceitar tudo". É o que a OAB-SP chama de supervisão real, e o oposto da supervisão "de fachada" criticada na ação contra a Enter.
- Isso vira argumento de venda contra a Justin-e, da ADVBOX, que considera só os feriados nacionais.

**0.4 Higiene de documento** — *2 a 3 dias* — [anexo 05, §2.2](2026-10-31-anexos/05-dores-regulacao-tendencias.md)
- Um teste automatizado garante que o DOCX gerado (`packages/documentos/src/docx.ts`) não tem texto oculto: fonte branca, fonte minúscula, campos escondidos ou instruções nos metadados.
- Documentos recebidos (PDF e DOCX da parte contrária) são varridos atrás de comandos escondidos para IA, e qualquer achado gera alerta. Esses documentos são sempre tratados como dado, nunca como instrução ao modelo.

**0.5 Kit de conformidade OAB** — *1 semana* — [anexo 05, §2.1 e §4.2](2026-10-31-anexos/05-dores-regulacao-tendencias.md)
- **Termo de uso de IA para o cliente**, gerado no timbre e com os cinco pontos do item 4.2.1 da recomendação: propósito, benefícios e limites, riscos, medidas de segurança e revisão humana. A assinatura fica registrada e o documento vai para a pasta do cliente. A conferência da pasta passa a cobrar esse termo.
- **"Cliente sem IA":** a marcação desliga as ações de IA em todos os casos daquele cliente (item 4.3.2).
- **Registro de revisão por peça:** versão gerada, versão final, quem revisou e quando (item 3.7). A tabela `auditoria` já existe.
- **Modelo de política interna de IA** do escritório (item 3.6).
- **Página pública de segurança:** retenção zero, dados que não treinam modelo e lista de suboperadores (gateway e provedores de modelo).
- Nenhum concorrente oferece esse kit, e ele vende para quem tem medo de usar IA.

**0.6 Limites de IA à vista** — *1 a 2 dias*
- Os limites de mensagens por pessoa e o teto diário já existem. Falta mostrar quanto resta e avisar antes de bloquear. Essa é exatamente a reclamação contra o Jus IA.

### Fase 1 — Jurisprudência verificada (semanas 5 a 11)

O objetivo é fechar a maior lacuna de venda e eliminar o risco de multa por citação falsa. O desenho completo, com esquema de banco, rotinas e regex de citações, está no [anexo 01, §5](2026-10-31-anexos/01-jurisprudencia-legislacao.md).

**Regra de ouro:** o modelo não escreve número de processo, súmula, tema, relator nem data. Ele aponta o identificador de um documento que o servidor recuperou, e o servidor monta a citação a partir do banco. Isso elimina por construção a citação inventada.

**1.1 Acervo inicial** — *2 a 3 semanas*
- **Legislação federal** pela API do Senado (metadados e alterações) e pelo normas.leg.br (texto por dispositivo, como `!art927_par5`). Pré-carregar CF, CPC, CC, CLT, CDC, CTN, Lei 8.213, LINDB, CP e CPP.
- **Precedentes qualificados** do Pangea/BNP, sincronizados duas vezes por mês:
  - repercussão geral, súmulas vinculantes e súmulas do STF;
  - repetitivos e IAC do STJ;
  - IRR do TST;
  - IRDR, IAC e súmulas de **TJSC, TRT12 e TRF4**.
- **Temas do STJ** (`Temas.csv`), toda semana.
- **Informativo do STF** (XLSX com 11.637 julgados) e lista de temas de repercussão geral.
- **Súmulas e OJs do TST**, com curadoria manual (o conjunto é pequeno).

**1.2 "Verificar peça"** — *1 semana*
- Extrai todas as citações da minuta, gerada pela IA ou colada pelo advogado.
- Resolve cada uma no acervo e devolve um selo: **verificada** (com link oficial e data de captura), **com ressalva** (cancelada, superada ou trecho não literal) ou **não verificada** ("confira antes de usar").
- Entra como etapa antes de baixar o DOCX, na tela da peça (`apps/web/src/paginas/peca.tsx`). É a entrega de maior valor com o menor custo.

**1.3 Modo "Jurisprudência" do Perguntar com fonte** — *1,5 semana*
- O modo existe em `packages/ia/src/assistente.ts`, mas hoje só pede à IA que não invente.
- Passa a ter uma ferramenta que busca no acervo. A busca começa por texto: o Postgres 16 do servidor não tem pgvector, e o índice `to_tsvector('portuguese')` já é usado em `modelos`.
- A resposta sai em JSON com o identificador e o trecho literal.
- Antes de mostrar, roda o verificador:
  - o documento existe?
  - o trecho é literal?
  - a súmula está vigente?
  - o trecho **sustenta** a afirmação? Aqui entra um segundo passo de IA.

**1.4 Ementas e íntegras do STJ** — *1,5 a 2 semanas*
- Espelhos de acórdãos (mensal) e íntegras desde 2021 (diário, com cerca de 2 semanas de atraso).
- Busca por texto primeiro. Vetores só se a medição mostrar ganho, e isso exige instalar o pgvector no servidor.

**1.5 Lacunas regionais** — *contínuo*
- **TJSC e TRT12:** pedido pela Lei de Acesso à Informação (art. 8º, § 3º, III) por acórdãos em formato aberto, ou contato com os núcleos de precedentes. Até lá, o produto diz claramente o que o acervo cobre.
- **TRF4:** consulta sob demanda, para verificar uma citação específica. O formulário não tem captcha; usar no máximo 1 requisição por segundo, saindo de IP no Brasil.

*Pronto quando* nenhuma citação aparecer sem selo, numa peça ou no Perguntar, e o conjunto de teste (fase 5.8) mostrar zero citações fora do acervo.

### Fase 2 — Honorários e cobrança (semanas 12 a 15)

O objetivo é atacar a dor nº 1 do advogado (dinheiro) e a 2ª lacuna de venda. O Decreta parte de uma vantagem: o módulo de alvarás, que ninguém tem.

**2.1 Honorários por caso** — *1 semana*
- Contrato por cliente ou processo: valor fixo, mensal (partido), percentual de êxito ou híbrido.
- A tabela OAB/SC 2026 (Res. 03/2026) aparece como referência de piso.

**2.2 Cobrança pelo Asaas** — *1,5 semana* — [anexo 02, §3.6](2026-10-31-anexos/02-apis-operacionais.md)
- Pix, boleto e **Pix Automático** para mensalidades. O Pix Automático exige CNPJ ativo há 6 meses; o advogado pessoa física fica com Pix avulso e boleto.
- **NFS-e** emitida pelo próprio Asaas (R$ 0,49 por nota), já no padrão nacional.
- Webhook para dar baixa sozinho. Régua de lembretes pelo WhatsApp, com texto aprovado pelo escritório.
- Custo: R$ 1,59 por recebimento, sem mensalidade. A alternativa é a Efí. Não usar Stripe, que não tem Pix Automático no Brasil.

**2.3 Do alvará ao honorário** — *1 semana*
- Quando um alvará vira "sacado", o Decreta calcula o honorário de êxito do contrato e o valor do cliente.
- Gera a **prestação de contas** no timbre e marca o repasse.
- É o dinheiro do cliente, o ponto mais sensível da relação. Ninguém no mercado faz isso.

**2.4 Inadimplência no Perguntar** — *2 a 3 dias*
- Atalhos prontos como "quem está devendo", "alvarás parados" e "honorários a receber no mês". É o que a ADVBOX vende como Donna por R$ 200 por mês.

**2.5 Assinatura eletrônica** — *3 a 5 dias*
- Contrato de honorários, procuração e termo de uso de IA (fase 0.5), pela API da ZapSign (a partir de R$ 69,90 por mês) ou da Clicksign.
- A API de assinatura do gov.br **não** atende empresas privadas.

### Fase 3 — Cliente no WhatsApp (semanas 16 a 19)

O objetivo é fechar a 3ª lacuna (comunicação com o cliente) no canal onde o Decreta já está.

**3.0 Decisão do canal** — *antes de começar*
- O resumo da manhã sai pelo wameow, um serviço local em `127.0.0.1:8080`. Pelo nome, deve ser uma ponte baseada no WhatsApp Web; isso precisa ser confirmado.
- Para a equipe, isso funciona. Para **cliente**, o volume e o risco de banimento do número pedem a **API oficial (WhatsApp Cloud)**: R$ 0,035 por mensagem de utilidade, com conta em BRL obrigatória até 30/06/2027.
- Os termos da Meta (cláusula 4.7, 23/09/2026) permitem IA "incidental ou auxiliar", que é o caso aqui, e proíbem a IA como funcionalidade principal.

**3.1 "O que isso significa para você"** — *1,5 semana*
- Quando chega uma decisão, o Decreta escreve, a partir do briefing que já gera, uma mensagem curta em linguagem simples para o cliente.
- **O advogado aprova** (ou edita) e ela sai no WhatsApp com a identidade do escritório.
- Nunca dá parecer automático. Se houver resposta automática, ela se identifica como máquina (item 2.4 da Recomendação OAB).

**3.2 Canal verificado contra o golpe do falso advogado** — *2 a 3 dias*
- Rodapé padrão: "este escritório nunca pede Pix para liberar valores", com o número oficial.
- O CNJ tornou o MFA obrigatório no PJe em 11/2025 por causa desse golpe, e os clientes de escritórios pequenos são as vítimas típicas.

**3.3 Cobrar documentos que faltam** — *1 semana*
- A conferência da pasta já sabe o que falta. O Decreta passa a mandar ao cliente a lista com um link de envio e lê a foto com a leitura que já existe.
- Isso também atende o Tema 1.198 do STJ: o juiz pode exigir procuração atualizada e documentos para afastar a suspeita de litigância abusiva.

**3.4 Página do caso por link** — *opcional, 1 semana*
- Situação do caso, próximos passos e documentos, sem login (link mágico com validade).
- Só se os escritórios do piloto pedirem.

### Fase 4 — Cálculos (semanas 20 a 23)

Todas as fontes desta fase são APIs públicas e gratuitas: [anexo 02, §3.2](2026-10-31-anexos/02-apis-operacionais.md).

**4.1 Atualização monetária** — *2 semanas*
- Índices pela API SGS do Banco Central: IPCA (433), INPC (188), IPCA-E (10764), SELIC (11 e 4390), TR (226) e **Taxa Legal da Lei 14.905** (29541 a 29543). O IPCA é conferido no SIDRA, do IBGE.
- Três regimes:
  - débito civil: IPCA mais Taxa Legal, com juro zero quando ela for negativa;
  - Fazenda Pública: SELIC pela EC 113 e requisitórios por IPCA mais 2% ao ano, limitados à SELIC, pela EC 136/2025;
  - índice contratual livre.
- A **memória de cálculo** sai em DOCX no timbre e entra direto no "cumprimento de sentença" do catálogo de peças.
- Cuidado: as séries diárias aceitam no máximo 10 anos por chamada.

**4.2 Revisional bancária** — *3 a 5 dias*
- Quadro com a taxa do contrato e a taxa média do Banco Central para o mesmo banco, modalidade e mês, pela API Olinda (`taxaJuros`).
- Vira anexo e tópico da inicial.

**4.3 Previdenciário** — *1 semana*
- Parâmetros anuais mantidos no Decreta (teto, salário mínimo), porque o INSS não tem API.
- Linha do tempo de laudos, CNIS e indeferimentos a partir dos documentos lidos.
- É a área que mais cresce (1,82 milhão de processos novos no 1º semestre de 2026) e a que mais tem dado de saúde, que é sensível pela LGPD.

**4.4 PJe-Calc** — *1 a 2 dias*
- O PJe-Calc é um programa de Windows, offline e sem API. Anexar o `.PJC` ao processo e extrair o resumo do relatório em PDF.

### Fase 5 — IA de nova geração (intercalada com as outras fases)

A ordem segue o anexo 04 e o que o Decreta já tem.

| # | Recurso | O que é | Esforço |
|---|---|---|---|
| 5.1 | **Afirmação ligada à fonte** | Resumo, briefing e chat apontam documento e página ("evento 87, fl. 3") | 1 semana |
| 5.2 | **Auditoria noturna da carteira** | Processos parados, prazo sem dono, publicação sem processo, alvará parado e documento faltando entram no resumo da manhã | 1 semana |
| 5.3 | **Rascunho pronto quando chega a intimação** | O prazo confirmado já vem com a peça sugerida em rascunho (`pecaParaPrazo` já existe). Nada é enviado | 1 semana |
| 5.4 | **Radar de precedentes × carteira** | Quando o BNP publica tese ou suspensão (por exemplo, um IRDR do TJSC), avisa quais processos do escritório são afetados, cruzando assunto TPU e tema. Depende da fase 1.1 | 1,5 semana |
| 5.5 | **Leitura da peça contrária** | Contestação ou recurso da outra parte → pontos a rebater, ligados ao prazo | 1 semana |
| 5.6 | **Áudio vira texto** | Áudios de WhatsApp e gravações de atendimento → transcrição → `resumirAtendimento`, que hoje recebe o texto colado. Custo de US$ 0,003 a 0,006 por minuto. Antes, confirmar se o gateway tem rota de transcrição | 1 semana |
| 5.7 | **Jeito do escritório** | O escritório descreve como faz cada peça (estilo, teses, o que evitar) e o gerador segue. Banco de peças próprias | 1,5 semana |
| 5.8 | **Conjunto-ouro de avaliação** | Casos reais anonimizados com a resposta certa: prazo (dia exato), resumo (rubrica) e citações. Roda a cada troca de modelo ou prompt | 1 semana |
| 5.9 | **Níveis de automação** | Formalizar o que entra sozinho, o que vira sugestão e o que exige confirmação, como no EveOS | 3 dias |
| 5.10 | **Conector MCP somente leitura** | Para quem usa Claude no plano Team ou Enterprise, consultar o Decreta de dentro do Claude, com as mesmas permissões (MyCase, EasyJur e CoCounsel já expõem MCP) | 1,5 semana |

### Fase 6 — Monitoramento pago e nichos (sob demanda)

| Recurso | Como | Custo | Quando |
|---|---|---|---|
| Novas ações contra o cliente (por CPF ou CNPJ) | Judit (não há fonte oficial aberta com partes) | R$ 15 por entidade por mês + R$ 0,25 por processo; piso de R$ 1 mil por mês | Quando houver clientes empresa pedindo |
| Íntegra dos autos sob demanda | Judit | R$ 3,50 por processo | Repassar como premium |
| Citações a clientes empresa | Domicílio Judicial Eletrônico, com credencial gerada pelo cliente. **Nunca** abrir o inteiro teor sozinho, porque isso registra ciência e começa o prazo | grátis | Escritórios com clientes PJ |
| Checagem de cliente | Portal da Transparência (CEIS, CNEP, PEP) | grátis | No cadastro |
| Nichos | ANS (planos de saúde), consumidor.gov.br, revista do INPI | grátis | Conforme a área do escritório |

---

## 5. Posicionamento e preço

Isto não é código, mas decide a venda ([anexo 03, §6.5 e §7](2026-10-31-anexos/03-concorrencia-brasil.md); [anexo 06, §5 e §8](2026-10-31-anexos/06-movimentos-ia-concorrentes.md)):
- **Plano simples, com IA incluída e limite visível.** O mercado vende IA como add-on (R$ 200 por módulo na ADVBOX), por créditos (EasyJur, Astrea) ou por mensagens (Jus IA).
- **Cancelamento e redução de plano no próprio app**, sem taxa de ativação nem treinamento obrigatório. É a maior fonte de reclamação contra Aurum, ADVBOX, EasyJur e Jusbrasil.
- **Página pública de status** e **suporte humano pelo WhatsApp**.
- **Preço de referência para o autônomo:** de R$ 77 a R$ 120 por mês (Jusfy, Projuris Start, Previdenciarista, Jus IA). O concorrente mais parecido em público e preço é a **Jusfy** (R$ 77 a R$ 227, com cálculos e cobrança), que recebeu investimento da Thomson Reuters.
- **Canal de aquisição: convênio com a OAB/SC e a CAASC.** É como a Jusfy chega a mais de 400 mil advogados, e como a Forlex distribui a LIVIA. Custa menos que anúncio e respeita o Provimento 205.
- **Janela de 15/01/2027.** É quando acaba o beta grátis do Jux, a IA do Astrea, maior sistema de escritórios pequenos. Quem for cobrado ou limitado vai procurar alternativa.
- **Discurso:** "não perde prazo, não inventa jurisprudência, cabe no bolso e funciona no celular". Nunca "substitui o advogado" nem "peça pronta": a Resolução 16/26 do Conselho Federal veda, e é o centro da ação contra a Enter.

---

## 6. O que não fazer

| Não fazer | Por quê |
|---|---|
| Robô no eproc ou no PJe, guardar senha ou 2FA do advogado, peticionar automaticamente | Portaria CNJ 316/2024, art. 9º (bloqueio de "rotinas automatizadas"); o WAF do TJSC já bloqueia; o risco cai na conta do advogado. Nenhum líder mundial protocola sozinho |
| Resolver captcha (certidões, TJSC, TJSP) | Inviável e arriscado. Para certidões, fazer um fluxo assistido: o Decreta lista e linka, e o advogado emite no navegador |
| Usar o DataJud como gatilho de prazo ou como "produto de dados" | Atraso de 5 a 25 dias e a Portaria 374/2026 |
| Monitorar processos de terceiros para oferecer serviço | Captação vedada (Prov. 205/2021, art. 2º; CED, art. 7º). É também o padrão do golpe do falso advogado. Monitorar só a carteira e os clientes com contrato |
| Perfil ou previsão por juiz | Risco reputacional e regulatório (precedente francês). Estatística da vara, sem pessoa, fica para muito depois |
| Gerar peças em massa por paráfrase | A Rec. CNJ 159/2024 e o Tema 1.198, com as ferramentas Atalaia e Berna, sinalizam litigância abusiva. A peça varia pelos fatos do caso |
| Marketing de "zero alucinação" | Criticado pelos pesquisadores de Stanford. O selo diz "encontrada na fonte oficial em DD/MM", não "sem erro" |
| Treinar modelo próprio | Ganho pequeno diante do custo. Investir em dados, verificação e avaliação |
| Raspar agregadores (Jusbrasil, Escavador) | A Lei 9.610, art. 87, protege bases de dados |
| Vender ao leigo ou gerar peça sem advogado | A OAB-RJ venceu o Resolve Juizado; a Resolução 16/26 trata das empresas de IA jurídica |
| Cobrar IA por add-on, por créditos que expiram ou como "grátis por tempo limitado" | São a origem das reclamações de cobrança contra ADVBOX, MinutaIA e Jus IA |

---

## 7. Decisões que dependem de você

1. **Parecer sobre o DataJud** (Portaria 374/2026, art. 4º). Hoje o Decreta roda na máquina do escritório, para os processos dele, e é aí que a tese de uso não comercial é mais forte. Se o Decreta for vendido a outros escritórios, a pergunta muda de peso. Dá para pedir autorização ao CNJ.
2. **WhatsApp:** manter o wameow só para a equipe e abrir a API oficial para clientes (recomendado), ou migrar tudo.
3. **Retenção de dados nos provedores de IA:** confirmar que o gateway e a Anthropic estão em retenção zero para os modelos usados (a Anthropic tem "Covered Models" com retenção limitada) e mapear os suboperadores. A LGPD trata o envio de dados ao exterior como transferência internacional. Isso alimenta a página de segurança da fase 0.5.
4. **Cobrança pelo Asaas ou pela Efí.** Recomendo o Asaas: preço publicado, NFS-e e Pix Automático na mesma API.
5. **Escopo de tribunais:** só SC no piloto, ou já preparar STJ, STF e TST para os recursos? O caderno do DJEN torna isso barato.

---

## 8. Como saber que deu certo

| Métrica | Meta |
|---|---|
| Publicações capturadas pelo caderno, comparadas à busca por OAB | 100% (nenhuma a menos) |
| Prazos confirmados com a conta auditável e a certidão anexada | 100% |
| Citações mostradas sem selo | 0 |
| Citações "não verificadas" nas peças do piloto | Medir e reduzir mês a mês |
| Prazo sugerido pela IA igual ao confirmado (conjunto-ouro) | ≥ 95% no tipo e na quantidade de dias |
| Honorários cobrados pelo Decreta / honorários a receber | Medir a partir da fase 2 |
| Mensagens ao cliente aprovadas sem edição | Medir: mostra a qualidade do texto |

---

## 9. Anexos

| Anexo | Tema |
|---|---|
| [01-jurisprudencia-legislacao.md](2026-10-31-anexos/01-jurisprudencia-legislacao.md) | 34 fontes de jurisprudência, precedentes e legislação; desenho técnico da verificação |
| [02-apis-operacionais.md](2026-10-31-anexos/02-apis-operacionais.md) | 51 APIs: DJEN, DataJud, Domicílio, cálculos, assinatura, cartórios, cobrança, WhatsApp, agregadores |
| [03-concorrencia-brasil.md](2026-10-31-anexos/03-concorrencia-brasil.md) | Matriz de recursos, fichas, preços e reclamações de mais de 25 concorrentes |
| [04-fronteira-ia-juridica.md](2026-10-31-anexos/04-fronteira-ia-juridica.md) | Harvey, Legora, CoCounsel, Clio, Eve, EvenUp e outros: 35 ideias transferíveis; estudos sobre alucinação |
| [05-dores-regulacao-tendencias.md](2026-10-31-anexos/05-dores-regulacao-tendencias.md) | Perfil da advocacia, Recomendação OAB 001/2024, sanções, Res. CNJ 455/569/615, reforma tributária, Justiça em Números 2026 |
| [06-movimentos-ia-concorrentes.md](2026-10-31-anexos/06-movimentos-ia-concorrentes.md) | Lançamentos de IA, aquisições e investimentos no mercado brasileiro em 2025–2026 |
