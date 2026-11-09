# Anexo 01: API oficial do WhatsApp, mercado e ética

Pesquisa de 09/11/2026, feita para o [plano do agente no WhatsApp](../2026-11-09-agente-no-whatsapp.md). Fontes acessadas em 09/11/2026, listadas no fim. Ela atualiza o que o [anexo 02 de 31/10](../2026-10-31-anexos/02-apis-operacionais.md) já dizia sobre o WhatsApp.

**Marcas:**
- **[F]** fato conferido na fonte primária;
- **[F2]** imprensa, fornecedor ou relato de usuário, não conferido na origem;
- **[I]** inferência.

---

## A. Regras da plataforma

### A1. Política de IA

- **Cláusula 4.7 dos Termos da WhatsApp Business Platform** (modificação de 23/09/2026) **[F]**:
  - proíbe "fornecedores e desenvolvedores de tecnologias de inteligência artificial" de usar a plataforma **quando a IA for a funcionalidade principal, em vez de incidental ou auxiliar**;
  - quem enquadra a empresa é a Meta, "a seu exclusivo critério";
  - os dados da plataforma não podem treinar modelo; o ajuste fino para uso exclusivo da empresa é permitido.
- **Página de preços para AI Providers** (15/10/2026) **[F]**:
  - a definição inclui "general-purpose artificial intelligence assistants";
  - desde 15/01/2026, eles só operam onde a Meta é obrigada por lei a permitir;
  - **no Brasil, desde 11/03/2026, podem operar, mas pagam por mensagem de serviço**. A categoria aparece no webhook como `general_purpose_ai`;
  - a página diz que isso não muda a cobrança das outras empresas.
- **A documentação de preços admite IA de terceiros** **[F]**. Ela define mensagem de serviço como mensagem fora de modelo, "powered by a 3rd-party AI solution or people".
- **CADE** **[F2]**:
  - medida preventiva contra a regra em janeiro de 2026, mantida pelo Tribunal em 04/03/2026;
  - em 23/04/2026, o Tribunal confirmou o descumprimento e manteve a multa diária de R$ 250 mil;
  - o andamento depois de abril não foi conferido.
- **[I] Enquadramento do Decreta:** um assistente restrito aos dados do escritório é IA auxiliar a um sistema de gestão. O risco aparece se ele virar um "pergunte qualquer coisa".

### A2. Preços no Brasil

Tabela oficial em reais, em vigor desde 01/10/2026 **[F]**:

| Categoria | Preço por mensagem |
|---|---|
| Marketing | R$ 0,3217 |
| Utilidade | R$ 0,0350 |
| Autenticação | R$ 0,0350 |
| Serviço | R$ 0,0350 |

- **Desde 01/10/2026, tudo é cobrado** **[F]**:
  - **Serviço:** era grátis desde 11/2024 e agora é cobrado a partir da 1.001ª mensagem do mês. A cota de 1.000 é **por número**, não acumula e não tem faixas.
  - **Utilidade dentro da janela:** era grátis de 07/2025 a 09/2026 e também passou a ser cobrada.
- **Faixas de volume** só em utilidade e autenticação: tarifa cheia até 250 mil mensagens por mês, com desconto de 5% a 25% acima disso **[F]**.
- **Faturamento em reais** pela Facebook Brasil desde 01/07/2026; obrigatório até 30/06/2027 **[F]**.
- **A Meta só muda preços** em 1º de janeiro, abril, julho e outubro **[F]**.

### A3. Funcionamento

- **Janela de 24 h** **[F]**:
  - abre quando o usuário manda mensagem e reinicia a cada nova mensagem dele;
  - fora dela, só modelo aprovado;
  - opt-in do destinatário é obrigatório.
- **Modelos de mensagem** **[F]**:
  - utilidade precisa ser não promocional e específica para o usuário, pedida por ele ou essencial;
  - desde 04/2025, um modelo enviado como utilidade que a Meta considere marketing é aprovado como marketing;
  - há recategorização automática recorrente, com aviso de 1 dia;
  - dá para pedir revisão em até 60 dias.
- **Limites de envio** **[F]**:
  - contam destinatários únicos fora da janela, em 24 h móveis, e valem para o portfólio inteiro;
  - o portfólio novo começa em 250;
  - sobe para 2.000 com a empresa verificada ou com 2.000 entregas de qualidade em 30 dias;
  - depois: 10 mil, 100 mil e ilimitado.
- **Qualidade** **[F]**: medida nos últimos 7 dias, com bloqueios, denúncias, silenciamentos e arquivamentos.
- **Interativas** **[F]**:
  - botões de resposta: até 3, com rótulo de até 20 caracteres;
  - listas: até 10 itens;
  - também existem botão com link, Flows e pedido de localização.
- **Mídia** **[F]**:
  - tamanhos: documento até 100 MB, áudio 16 MB, imagem 5 MB, vídeo 16 MB;
  - o link de download da mídia recebida vale 5 minutos;
  - o id da mídia recebida expira em 7 dias, e o da enviada, em 30.
- **Digitando e lido** **[F]**: o "digitando" some ao responder ou depois de 25 s. A confirmação de leitura pode ser enviada até 30 dias depois.
- **Nomes de usuário e BSUID** **[F]**:
  - desde 04/2026 existe um identificador do usuário por empresa, o BSUID;
  - se o usuário ativar nome de usuário, **o telefone deixa de vir no webhook**, a menos que já tenham conversado antes;
  - suportar o BSUID é obrigatório para integrações diretas.
- **Política de mensagens comerciais** (23/09/2026) **[F]**:
  - com automação, é obrigatório ter caminhos claros e diretos para falar com uma pessoa;
  - é proibido pedir número completo de conta financeira, de documento de identidade ou outro identificador sensível.
- **Privacidade da Cloud API** **[F]**: a Meta descriptografa as mensagens, guarda o conteúdo até 30 dias, gerencia as chaves e atua como operadora.

### A4. Cadastro

- **Sem BSP** **[F]**: a Cloud API pode ser usada direto, sem provedor intermediário.
- **Tech Provider** **[F]**, para os escritórios entrarem com número próprio:
  - exige app da Meta, empresa verificada e App Review com dois vídeos;
  - o escritório entra pelo Embedded Signup; as versões 2 e 3 foram descontinuadas em 15/10/2026, e é preciso usar a v4 ou a v5.
- **Coexistence** (mesmo número no app WhatsApp Business e na API) **[F]**:
  - vazão fixa de 20 mensagens por segundo;
  - sincroniza 6 meses de conversas individuais;
  - grupos não sincronizam, listas de transmissão ficam só leitura e mensagens temporárias são desligadas;
  - na v5 do Embedded Signup vem ligada por padrão.
- **Nome de exibição** **[F]**: é verificado automaticamente quando o número sobe de limite.
- **[I] Um número ou vários:** para a equipe, um número do Decreta basta. Para o cliente final, o certo é um número por escritório, com o nome dele.

### A5. Áudio

- **Áudio recebido** **[F]**: o webhook traz só o id da mídia e o campo `voice`. Não há transcrição nativa.
- **Áudio enviado** **[F]**:
  - formato .ogg com codec OPUS; até 512 KB aparece o botão de tocar;
  - desde 17/03/2026 existe o status "played".

---

## B. Mercado

### B1. Brasil

Informações das páginas dos próprios fornecedores, salvo indicação **[F2]**.

- **Astrea (Aurum):**
  - a IA traduz andamentos para o cliente e envia por e-mail ou WhatsApp Web, não pela API oficial;
  - o advogado pode revisar, e a função é ligada contato por contato;
  - está nos planos Smart, Company, VIP e VIP+.
- **EasyJur Talk + Work:**
  - API oficial;
  - atende e qualifica contato novo, agenda reunião, avisa andamentos e responde "e o meu processo?";
  - R$ 197 por mês por número, mais R$ 297 por usuário e R$ 880 de implantação.
- **Projuris ADV:** o app envia ao cliente resumos de intimações e andamentos.
- **ADVBOX:** sem assistente próprio no WhatsApp, só integrações de terceiros. No Reclame Aqui, há queixas de notificação que não chegou e de prazo e audiência perdidos.
- **Jus IA (Jusbrasil):** funciona na web; não foi confirmado canal oficial no WhatsApp.
- **Lexter.ai:** assistente de comunicação com clientes e vendas pelo WhatsApp (matéria de 2024).
- **Forlex (LIVIA Cidadão):** assistente jurídica gratuita para o público geral no WhatsApp, desde 05/2026.
- **Jurídico AI e Preâmbulo IA:** não foi encontrada função de WhatsApp.
- **Tribunais** **[F]**: o STF tem assistente no WhatsApp que avisa o advogado de cada movimentação, e o TJSP intima por WhatsApp no eproc (JEC e CEJUSC, só pessoa física).

### B2. Uso de IA pelos advogados

- **"Impacto da IA Generativa no Direito", edição 2026** **[F]** (OAB SP, PR, BA, GO, PE e ES, com Jusbrasil, Trybe e ITS Rio; mais de 1.800 respostas):
  - **Frequência:** o uso ao menos semanal foi de 55% em 2025 para 77% em 2026; os que não usam caíram de 28% para 11%.
  - **Ferramentas:** ChatGPT 58%, Gemini 34%, Jus IA 22%.
  - **Usos:** peças em primeiro lugar, pesquisa 59%, pareceres 58%, contratos 56%. "Comunicação e atendimento ao cliente" aparece como caso de uso.
  - **Confiança:** 74% só confiam com supervisão humana.
  - **Perfil:** 51% atuam de forma autônoma.
- **AASP, 07/2026** **[F2]**: 75,4% consideram as respostas confiáveis desde que revisadas.
- **Clio Legal Trends 2025** **[F2]**: 79% usam IA; só 40% usam IA específica para o Direito.
- **Thomson Reuters 2025** **[F2]**: revisão de documentos 77%, pesquisa 74%, resumo 74%; só 41% dos escritórios têm política de uso.
- **ABA TechReport 2024** **[F]**: 30% usam IA; a precisão preocupa 74,7%.
- **[I]** Os produtos de fora vivem no Word, no Outlook e no gestor de documentos. Mensageria como canal principal parece particularidade brasileira.

### B3. Dores do dia a dia

- **Perda de prazo** **[F2]**: está entre as condutas que mais acionam o seguro de responsabilidade civil do advogado, e há relatos no Reclame Aqui de publicação não recebida e prazo perdido.
- **Velocidade de resposta ao cliente** **[F2]**: é o 2º fator na escolha do escritório, segundo a Clio.
- **Golpe do falso advogado** **[F2]**:
  - mais de 2.100 denúncias à OAB até 05/2025;
  - a OAB/RS entrou com ação civil pública contra o WhatsApp em 01/2026;
  - o golpe usa dados reais de processos.
- **Fins de semana e trabalho no fórum:** não foram achados dados sólidos.

---

## C. Ética e lei

- **Recomendação CFOAB 001/2024** (11/11/2024) **[F]**:
  - 2.2: o fornecedor não pode usar os dados para treinamento;
  - 3.1: nenhuma atividade privativa é delegada à IA;
  - 4.1.1: o uso de IA é formalizado ao cliente antes de começar;
  - 4.3: "A comunicação com o cliente não pode ser feita apenas a partir de conteúdo gerado por sistemas de IA generativa", e o cliente tem direito a interagir com um ser humano;
  - 4.3.1: consentimento por assinatura;
  - é recomendação, e as sanções dependem de lei.
- **Provimento 205/2021, verbete "Chatbot"** **[F]**:
  - o chatbot é permitido para facilitar a comunicação ou melhorar o serviço, sem afastar a pessoalidade nem o poder decisório do profissional;
  - os exemplos são responder as primeiras dúvidas e coletar dados e documentos;
  - o art. 3º veda captação e mercantilização.
- **OAB em 2026** **[F]**: Plano Nacional de IA (10/06/2026) e um provimento sobre IA em preparação.
- **Sigilo profissional** **[F]**: Estatuto da Advocacia, art. 7º, II, e art. 34, VII; Código de Ética, arts. 35 a 38.
- **LGPD** (na lei **[F]**; a aplicação é **[I]**):
  - bases legais: art. 7º, VI, e art. 11, II, "d", para dado sensível;
  - dado de acesso público continua protegido (art. 7º, §§ 3º e 4º);
  - a Meta é operadora na Cloud API.
- **Resolução CNJ 615/2025** **[F2]**: rege a IA do Judiciário, sem efeito direto no agente.

---

## Lacunas

- **Tarifa `general_purpose_ai` no Brasil:** o valor exato não foi lido; a imprensa fala em cerca de US$ 0,06 por mensagem.
- **CADE:** o andamento depois de 04/2026 não foi conferido.
- **Produtos de fora:** não há dados de uso de CoCounsel, Lexis+ AI Protégé, Spellbook, EvenUp e Legora.
- **Turivius, Digesto e Codex:** não foi pesquisado se fazem algo pelo WhatsApp.

---

## Fontes

- Termos da WhatsApp Business Platform, cláusula 4.7: https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform
- Preços para AI Providers: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers
- Preços e mudanças de 01/10/2026: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Envio e janela de 24 h: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- Limites de envio: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- Categorias de modelos: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization
- Mídia: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media
- Áudio: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages e https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/audio
- Digitando: https://developers.facebook.com/documentation/business-messaging/whatsapp/typing-indicators
- Confirmação de leitura: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/mark-message-as-read
- Listas: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages
- Botões de resposta: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages
- Coexistence: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Tech Provider: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers
- Nomes de exibição: https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names
- BSUID: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids
- Privacidade da Cloud API: https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security
- Política de mensagens comerciais: https://whatsappbusiness.com/policy/
- TechCrunch, 18/10/2025: https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/
- CADE: https://www.cnnbrasil.com.br/economia/negocios/cade-mantem-medida-preventiva-que-obriga-meta-a-permitir-chatbots-de-ia-no-whatsapp/ e https://lefosse.com/newsletter/cade-confirma-descumprimento-de-medida-preventiva-no-caso-whatsapp-business-e-mantem-multa-diaria-de-r-250-mil/
- Astrea: https://www.aurum.com.br/blog/nova-ia-astrea
- EasyJur Talk: https://easyjur.com/easyjur-talk-a-camada-de-conversa-do-easyjur-os-no-whatsapp/
- Projuris ADV: https://www.projuris.com.br/blog/app-para-advogados-projuris-adv/
- ADVBOX no Reclame Aqui: https://www.reclameaqui.com.br/adv-box/falha-na-notificacao-de-processos-e-descaso-do-suporte-da-advbox-geram-prejuizo-e-exigencia-de-cancelamento-e-devolucao-de-valores_QY1KT461uv-yn5tx/
- Forlex LIVIA: https://www.baguete.com.br/noticias/forlex-libera-assistente-gratuita-no-whatsapp
- Lexter: https://startups.com.br/negocios/rodada-de-investimento/lexter-ai-levanta-r-16m-para-impulsionar-ia-na-analise-juridica/
- STF no WhatsApp: https://www.oab.org.br/noticia/59886/assistente-virtual-via-whatsapp-amplia-acesso-de-advogados-ao-supremo
- Pesquisa OAB/Jusbrasil 2026: https://medias.revistaoeste.com/wp-content/uploads/2026/03/Relatorio_Impacto-da-IA-Generativa-no-Direito_-Edicao-2026.pdf
- Clio Legal Trends 2025: https://www.clio.com/resources/legal-trends/2025-report/
- Thomson Reuters (LawNext, 04/2025): https://www.lawnext.com/2025/04/thomson-reuters-survey-over-95-of-legal-professionals-expect-gen-ai-to-become-central-to-workflow-within-five-years
- ABA TechReport 2024: https://www.americanbar.org/groups/law_practice/resources/tech-report/2024/2024-artificial-intelligence-techreport/
- Recomendação CFOAB 001/2024: https://www.oab.org.br/noticia/62704/oab-aprova-recomendacoes-para-uso-de-ia-na-pratica-juridica
- Provimento 205/2021: https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021
- Plano Nacional de IA da OAB: https://www.oab.org.br/noticia/64268/conselho-federal-da-oab-anuncia-plano-nacional-para-integrar-inteligencia-artificial-a-advocacia
- Golpe do falso advogado: https://www.correiobraziliense.com.br/direito-e-justica/2025/05/7158575-golpe-do-falso-advogado-usa-dados-de-processos-para-enganar-vitimas.html e https://www2.oabrs.org.br/noticia/combate-ao-golpe-do-falso-advogado-oab-rs-ingressa-com-acao-civil-publica-contra-a-administradora-do-whatsapp/65858
