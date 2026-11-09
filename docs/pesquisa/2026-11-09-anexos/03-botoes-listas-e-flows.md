# Anexo 03: botões, listas e Flows da API oficial

Pesquisa de 09/11/2026, feita para o [plano do agente no WhatsApp](../2026-11-09-agente-no-whatsapp.md), seção 4.10. Fontes acessadas em 09/11/2026, listadas no fim.

**Marcas:**
- **[F]** fato conferido na documentação da Meta;
- **[F2]** documentação de fornecedor (BSP), não conferida na Meta;
- **[I]** inferência.

---

## A. O que a API oficial oferece

### A1. Mensagens interativas (dentro da janela de 24 h)

| Tipo | Limites | Volta no webhook |
|---|---|---|
| **Botões de resposta** **[F]** | Até 3 botões, título de até 20 caracteres e único; id de até 256. Corpo de até 1.024 (obrigatório). Rodapé de até 60. Cabeçalho opcional: texto, imagem, vídeo ou **documento** | `interactive.button_reply` com o id e o título |
| **Lista** **[F]** | Até 10 linhas no total, em até 10 seções. Título da seção e da linha: 24 caracteres; descrição da linha: 72; id da linha: 200. Botão que abre a lista: 20. Cabeçalho só de texto (60). Corpo de até 4.096. Rodapé de até 60 | `interactive.list_reply` com o id, o título e a descrição |
| **Botão de link (CTA URL)** **[F]** | Um botão que abre um endereço. Cabeçalho de texto, imagem, vídeo ou documento **[F2]** | Nada: o toque não volta ao Decreta |
| **Flow** **[F]** | Um botão que abre um formulário de várias telas dentro do WhatsApp (ver A3) | A resposta do Flow, com o `flow_token` |
| **Pedido de localização** **[F]** | Um botão "Enviar localização" | Uma mensagem de localização comum |
| **Carrossel** **[F]** | De 2 a 10 cartões. Cada cartão tem imagem ou vídeo (obrigatório), texto de até 160 caracteres e um botão de link ou botões de resposta. Corpo de até 1.024 | Não documentado |
| **Contato (vCard)**, **localização**, **reação** **[F]** | A reação do Decreta só vale para mensagem que a pessoa mandou, e não pode ser resposta citada | — |

**Resposta citada [F].** Qualquer mensagem que sai pode citar uma anterior, com `"context": { "message_id": "<wamid>" }`. A citação aparece como um balão em cima da resposta. Não vale para reação, e o balão some se a mensagem citada tiver sido apagada ou tiver mais de cerca de 30 dias.

**Onde aparecem [F2].** Botões e listas aparecem no celular e no WhatsApp Web. O **Flow não abre no WhatsApp Web** nem em aparelho vinculado: só no Android 6 ou mais e no iOS 12 ou mais **[F]**.

### A2. Modelos (fora da janela)

- **Botões [F2]:**
  - até 10 botões no total por modelo;
  - os de resposta rápida ficam juntos, e os outros (link, Flow) também;
  - o texto do botão é fixo e aprovado com o modelo, mas o **payload da resposta rápida é escolhido a cada envio**;
  - o botão de link aceita uma variável só no fim do endereço (`https://decreta.site/prazos/{{1}}`).
- **Botão de Flow [F]:** o modelo pode abrir um Flow. O modelo precisa estar aprovado, e o Flow, publicado.
- **Toque em resposta rápida [I]:** abre a janela de 24 h, como uma mensagem da pessoa. O toque num botão de link não abre.

### A3. Flows

- **O que é [F]:** um formulário de telas dentro do WhatsApp, definido em JSON (o Flow JSON). Pode ter um endpoint do Decreta que recebe cada tela e devolve a seguinte.
- **Componentes [F]** (até 50 por tela):
  - texto: título, subtítulo, corpo e legenda;
  - entrada: campo de texto, área de texto (600 caracteres por padrão);
  - escolha: lista suspensa (até 200 opções), botões de opção e caixas de seleção (até 20), chips;
  - data: `DatePicker` e `CalendarPicker`, com `min-date`, `max-date` e **`unavailable-dates`** (dias que não podem ser escolhidos), no formato `AAAA-MM-DD`;
  - consentimento (`OptIn`), rodapé com o botão principal, link e imagem;
  - condicionais (`If`, `Switch`).
- **Endpoint [F]:**
  - cada pedido vem cifrado: a chave AES vem cifrada com a chave pública RSA do Decreta (RSA-OAEP com SHA-256), e o conteúdo, em AES-GCM;
  - a resposta é cifrada com o vetor invertido;
  - as ações são `INIT`, `data_exchange`, `BACK` e `ping`, que é o teste de saúde e precisa responder `active`;
  - pedido que não decifra responde 421;
  - a assinatura `X-Hub-Signature-256` é conferida com o segredo do app.
- **`flow_token` [F]:** é gerado pelo Decreta e acompanha todas as telas e o fim. Funciona como a sessão e não pode ser adivinhável.
- **Fim [F]:**
  - o endpoint responde com a tela `SUCCESS`, e o que vai em `params` chega ao webhook de mensagens;
  - a Meta recomenda mandar em seguida um resumo no chat;
  - o formato exato da mensagem de resposta no webhook não foi conferido.
- **Requisitos [F]:** empresa verificada e qualidade alta do número. O Flow tem estados (rascunho, publicado, limitado, bloqueado, descontinuado).

---

## B. Onde cada recurso entra no Decreta

A régua é a do plano: só entra o que se acopla a um gesto que já existe ou dispensa gesto, e o que aumenta a precisão ou tira um toque.

### B1. Agora: o código já existe e o ganho é imediato

| # | Recurso | Onde | O ganho |
|---|---|---|---|
| 1 | **Resposta citada** | O "Confirmado" e o "Marcado como cumprido" citam a mensagem que tinha o botão | Com 5 prazos na tela, o "feito" aponta qual foi. Precisão sem uma palavra a mais |
| 2 | **Lista** no aviso das 15h | Uma mensagem com até 10 prazos (título: o ato; descrição: o processo). O toque abre o cartão do prazo com **Já protocolei** | Hoje saem até 5 mensagens e um "e mais". Fica uma, o que reduz o custo e o risco à qualidade do número. É o que o plano já dizia na 2.1 |
| 3 | **Rodapé** | "Souza & Freitas · 2 de 5" em toda mensagem com botão | Quem está em dois escritórios sabe de qual é (4.5), sem gastar o corpo |
| 4 | **Dois botões no modelo do resumo** | `resumo_do_dia` com **Ver o dia** e **Conferir agora** | A fila fora da janela em dois toques, e não três (o "pronto quando" da 2.2) |
| 5 | **Lista para escolher em vez de perguntar** | Dois processos da Marina: lista dos processos. Dois documentos possíveis: lista dos documentos | O toque volta com o **id**, e a IA não adivinha pelo nome. O documento escolhido sai pelo código, sem outra rodada de IA |
| 6 | **Botão de link** "Abrir no Decreta" | Nas respostas que mandam para a tela: segredo de justiça, Financeiro e a resposta fixa da trava | Endereço limpo e um toque, em vez do link cru no texto |

### B2. Com as novidades do dia (etapa B)

| # | Recurso | Onde | O ganho |
|---|---|---|---|
| 7 | **Documento no cabeçalho** | O aviso "rascunho da peça pronto" já leva o DOCX no cabeçalho, com os botões | A peça chega sem toque nenhum. Valem as guardas do segredo de justiça e do cliente sem IA |
| 8 | **Lista para passar o prazo** (2.7) | A equipe numa lista (até 10 pessoas) | Basta para o escritório pequeno; não precisa de Flow |

### B3. Flows: onde valem

| # | Flow | O que faz | Por que vale | Quando |
|---|---|---|---|---|
| 9 | **Outro prazo** | Uma tela com os dias, a contagem e um calendário com **os fins de semana e os feriados do processo bloqueados** (`unavailable-dates`). A tela seguinte traz a conta do motor (endpoint). "Confirmar" fecha o Flow e volta como proposta já conferida | É o caminho de maior risco da fila: hoje é lista e data digitada. O calendário não deixa escolher dia sem expediente, e o motor mostra a conta antes do toque | Depois do piloto, se a medida "% de Outro prazo" da 2.2 mostrar uso. O caminho de hoje fica, porque o Flow não abre no WhatsApp Web, onde a equipe passa o dia no escritório |
| 10 | **Como foi a audiência** | No dia seguinte à audiência: o resultado (opções), a próxima data e uma observação. Vira atendimento e tarefa | Formulário curto, sem ditado | Hipótese. Na mecânica, o ditado não virou hábito; só com sinal do piloto |

### B4. O que não vale

| Recurso | Por quê |
|---|---|
| Carrossel | Exige imagem ou vídeo em cada cartão; é recurso de vitrine |
| Pedido de localização, endereço, chamada de voz | Não há gesto do escritório para eles |
| Reação do Decreta | Só vale na mensagem da pessoa, e cada mensagem custa |
| Flow para o texto ao cliente | O `wa.me` já abre o texto editável no WhatsApp do advogado |
| Flow para as preferências | A tela já faz, e mudar preferência é raro |
| Contato (vCard) do perito ou do cliente | É um gesto real, mas manda telefone, e isso fura a máscara contra o WhatsApp tomado (4.6). Fica em espera, com teto e registro como os documentos |

### B5. O custo do primeiro Flow [I]

- Endpoint novo (`/api/whatsapp/flow`) com RSA e AES-GCM, o teste de saúde e a assinatura.
- Flow JSON versionado e publicado na Meta.
- Testes do endpoint com as chaves de teste.
- Cerca de 1,5 a 2 semanas, e só depois da empresa verificada.

---

## Fontes

- Botões de resposta: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages
- Listas: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages
- Tipos de mensagem e envio: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- Resposta citada: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/contextual-replies
- Carrossel: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-media-carousel-messages/
- Componentes de modelo: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components
- Flows (guias): https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides
- Componentes dos Flows: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components
- Endpoint dos Flows: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint
- Envio dos Flows: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/sendingaflow
- Botão de link e cabeçalhos (fornecedor): https://bird.com/docs/guides/whatsapp/message-types/interactive.md
- Botões em modelo (fornecedor): https://docs.360dialog.com/partner/messaging/template-messages/template-elements
- Botões e listas no WhatsApp Web (fornecedor): https://verloop.io/blog/whatsapp-interactive-messages
