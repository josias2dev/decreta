# APIs e integrações operacionais para o Decreta

Pesquisa feita em 31/10/2026. Piloto: Santa Catarina (TJSC e TRF4 no eproc, TRT12 no PJe).

**Legenda de verificação** (aparece em cada afirmação relevante):
- **[V]**: verificado na fonte primária nesta pesquisa (página oficial, especificação OpenAPI, texto normativo ou chamada GET à própria API).
- **[T]**: segundo terceiros (imprensa, blog jurídico, fornecedor concorrente). Precisa de confirmação.
- **[N]**: não consegui confirmar.

**Limites da pesquisa.** A cota de buscas na web acabou no meio do trabalho. Depois disso, só consultei fontes primárias por URL direta. Os pontos que ficaram sem confirmação estão marcados com [N]. Não criei contas, não digitei credenciais e não resolvi captcha. Fiz apenas GETs simples a APIs públicas, com moderação. Durante a pesquisa, o portal do TJSC passou a bloquear meu acesso, com a classificação "acesso não autorizado" e um Support ID terminado em `_BOT`. O episódio é um achado em si e está descrito no grupo 4.

---

## 1. Resumo executivo

1. **O caderno diário do DJEN é a integração de maior retorno.** Há um endpoint público que não aparece no uso atual do Decreta: `GET /api/v1/caderno/{sigla}/{data}/{meio}`. Ele devolve um ZIP com **todas** as comunicações do dia de um tribunal, em JSON e com o mesmo esquema da consulta por OAB. Nos testes, o TJSC teve 27.041 comunicações em 30/10/2026 (22 MB) e o TRT12 teve 9.008 em 29/10 (6 MB) [V]. Ingerir o caderno e cruzar localmente com OAB, nome ou CPF de cliente e número de processo acaba com o teto de 10.000 resultados e com o limite de 20 requisições por janela por IP [V]. O cruzamento também capta comunicações dirigidas a **clientes** em processos onde o advogado ainda não está cadastrado. Outro endpoint pouco usado é `GET /comunicacao/{hash}/certidao`, que devolve a **certidão de publicação em PDF** [V] e serve como prova de prazo.
2. **Há um risco jurídico no DataJud.** A Portaria CNJ 374, de 14/08/2026, publicada no DJe de 19/08/2026, reescreveu a Portaria 160/2020. Pelo novo art. 4º, §§ 2º e 3º, os dados são fornecidos "exclusivamente para fins legais, não comerciais e autorizados", e fica "vedada a modificação, distribuição, venda ou qualquer tipo de exploração comercial dos dados disponibilizados". O § 5º passa a **exigir citação do CNJ/DataJud como fonte** em aplicativos [V]. O Decreta é um SaaS pago e consome o DataJud. Isso pede parecer jurídico e, no mínimo, a citação da fonte na interface.
3. **O DataJud está atrasado e tem ruído.** Medi o `@timestamp` máximo em cada índice em 31/10/2026. O TJSC estava em 16/10, com cerca de 15 dias de atraso. O TRT12 estava em 06/10, cerca de 25 dias. O TRF4 estava em 26/10, cerca de 5 dias [V]. Apareceram datas de movimento absurdas (anos 2999 e 3020) e consultas que levaram de 7 a 31 segundos [V]. A Portaria 374/2026 obriga os tribunais a enviar dados **diariamente**, com prazo de 180 dias que vence por volta de fevereiro de 2027. Ela também acrescenta à API os polos ativo e passivo quando forem pessoa jurídica e a prioridade processual. Nada disso aparece ainda na API [V]. Conclusão: o DataJud serve para complementar a capa e o histórico. Não serve como gatilho de prazo.
4. **Nenhum canal oficial oferece "autos e peticionamento" para software de escritório.** O Jus.br tem APIs só para tribunais. O advogado usa o portal pela web, com login gov.br [V]. O MNI (SOAP) existe, mas é liberado a **entidades** autorizadas por ofício à Presidência de cada tribunal, com lista de IPs permitidos e sem acesso de pessoa física. O exemplo verificado é o TRF1 [V]. A API do datalake do CNJ (Portaria 316/2024, alterada pela Portaria 442/2026) exige convênio e capacidade para 200 mil usuários únicos por mês, e o custo de nuvem é cobrado do interessado [V]. A mesma Portaria 316/2024, no art. 9º, autoriza bloquear "rotinas automatizadas que simulem o comportamento humano" e a "consulta sistemática a processos sem relação direta com o usuário" [V]. Isso torna arriscado qualquer "construir" baseado em robô.
5. **O Domicílio Judicial Eletrônico tem API, mas só para CNPJ.** O acesso usa OAuth `client_credentials`, um header `On-behalf-Of` com o CPF do operador e um `tenantId`. As consultas aceitam janelas de no máximo 7 dias [V]. Há uma armadilha: abrir o inteiro teor pela API **registra ciência** e começa a contar o prazo [V]. O advogado pessoa física só tem a opção "Meus Representados", e só pela web [V].
6. **O motor de cálculo pode ser montado com APIs públicas gratuitas.** O SGS do Banco Central tem IPCA (433), INPC (188), IPCA-E (10764), SELIC (11 e 4390), TR (226 e 7811), CDI (12), IGP-M (189), salário mínimo (1619) e os **fatores da Taxa Legal da Lei 14.905/2024** (29541, 29542 e 29543). Todas as séries responderam [V]. Para séries diárias, a consulta aceita no máximo 10 anos por chamada [V]. O SIDRA do IBGE é a fonte primária do IPCA e do INPC [V]. O regime jurídico também foi conferido: a EC 136/2025 trata dos requisitórios da Fazenda federal (IPCA + 2% a.a., limitado à SELIC) e a Lei 14.905/2024 trata da regra civil supletiva (IPCA + Taxa Legal) [V].
7. **Para revisional bancária, o Bacen publica taxas médias por instituição e modalidade.** A API Olinda `taxaJuros` traz, por exemplo, a taxa de setembro de 2026 por banco [V]. Isso permite gerar automaticamente o quadro "taxa contratada × média de mercado".
8. **WhatsApp ficou mais caro em outubro de 2026.** Desde 01/10/2026, mensagens de serviço passaram a ser cobradas a partir da 1.001ª por mês em cada número [V]. A tabela para o Brasil, em vigor desde 01/10/2026, é: marketing R$ 0,3217 (US$ 0,0625); utilidade, autenticação e serviço R$ 0,035 (US$ 0,0068) [V]. O faturamento em BRL começou em 01/07/2026 e será obrigatório até 30/06/2027 [V]. A cláusula 4.7 dos termos da Meta (atualizados em 23/09/2026) proíbe IA como "funcionalidade principal", mas não proíbe IA incidental ou auxiliar [V]. O resumo da manhã do Decreta se enquadra no uso permitido.
9. **Cobrança recorrente de honorários é viável com Pix Automático.** Asaas e Efí têm API própria para isso [V]. A Stripe **não** oferece Pix Automático a empresas domiciliadas no Brasil [V]. No Asaas, Pix e boleto custam R$ 1,59 por recebimento e a NFS-e custa R$ 0,49 por nota [V]. Pela LC 214/2025, art. 127, sociedades de advogados que cumpram os requisitos têm **redução de 30%** nas alíquotas de IBS e CBS [V].
10. **Comprar ou construir.** A Judit publica tabela de preços. O piso é R$ 1.000 por mês, e há preços unitários para consulta por CNJ (R$ 0,25), monitoramento (R$ 1,50 por processo por mês), autos (R$ 3,50) e novas ações por CPF/CNPJ/OAB (R$ 15 por entidade + R$ 0,25 por processo) [V]. Escavador, Judit e Intima.ai acessam autos guardando as **credenciais do advogado**. A Intima.ai chega a guardar o segredo de 2FA e também faz protocolo (peticionamento) por API [V]. A Codilo estava com o site "pausado" em 31/10/2026 [V]. A Digesto agora é "Jusbrasil Soluções" [V].

---

## 2. Tabela-mestra de APIs

Esforço: **P** = até 1 semana; **M** = 1 a 3 semanas; **G** = mais de 1 mês ou depende de convênio.
Viabilidade: chance real de entrar em produção no Decreta, somando fatores técnicos, jurídicos e comerciais.

| # | API / fonte | Endpoint (base) | O que entrega | Autenticação | Custo | Limites | Captcha | Viab. | Esforço | Verif. |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | DataJud API Pública | `POST https://api-publica.datajud.cnj.jus.br/api_publica_{trib}/_search` | Capa + movimentos TPU. Sem partes e sem documentos. | `Authorization: APIKey <chave pública da wiki>` | Grátis | `size` de 10 a 10.000, `search_after`. Lenta (7–31 s nos testes). Defasagem de 5 a 25 dias. | Não | Técnica alta; **jurídica média/baixa** (uso "não comercial") | Já integrado | [V] |
| 2 | DJEN, consulta | `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao` | Comunicações (intimação, citação, edital, pauta, lista de distribuição, ata), com advogados e OAB | Nenhuma | Grátis | 20 req por janela por IP (`x-ratelimit-*`). Em caso de 429, esperar 1 min. Máx. 10.000 resultados em buscas por OAB ou texto. Página de 5 ou 100 itens. | Não | Alta | Já integrado | [V] |
| 3 | **DJEN, cadernos** | `GET /api/v1/caderno/{sigla}/{aaaa-mm-dd}/{D\|E}` | URL S3 temporária (5 min) para ZIP com JSONs de **todas** as comunicações do dia. Traz SHA-256, versão e status. | Nenhuma | Grátis | 1 chamada por tribunal por dia. Disponível a partir das 03:00. | Não | **Alta** | P | [V] |
| 4 | DJEN, certidão | `GET /api/v1/comunicacao/{hash}/certidao` | PDF da certidão de publicação | Nenhuma | Grátis | Mesma janela de rate limit | Não | Alta | P | [V] |
| 5 | DJEN, tribunais | `GET /api/v1/comunicacao/tribunal` | Data do último envio de cada tribunal | Nenhuma | Grátis | — | Não | Alta (*health-check*) | P | [V] |
| 6 | Domicílio Judicial Eletrônico | Swagger em `gateway.*.pje.jus.br/domicilio-eletronico*` (link de produção aparece após login) | Comunicações destinadas a um **CNPJ**, inteiro teor e logs | SSO PDPJ (`client_credentials`) + `On-behalf-Of: <CPF>` + `tenantId` (via `GET /api/v1/eu`) | Grátis | Janela de no máx. 7 dias ou nº do processo. Abrir o inteiro teor **registra ciência**. | Não | Média (só para clientes PJ) | M | [V] |
| 7 | PDPJ, API do Datalake | Por convênio (Portaria 316/2024) | Dados públicos consolidados (partes, advogados, decisões, movimentos) | Instrumento com o CNJ e pedido via GeCli | Custo de nuvem cobrado do interessado | Exige 200 mil usuários por mês, uptime > 95% e habilitação fiscal | — | Baixa (curto prazo) | G | [V] |
| 8 | Jus.br / Portal de Serviços | `portalexterno-tribunais.*.pdpj.jus.br` | Petição inicial e intercorrente (APIs **para tribunais**) | SSO PDPJ (serviço de tribunal) | — | — | — | Baixa | — | [V] |
| 9 | MNI (SOAP 2.2.2/2.2.3) | `…/intercomunicacao?wsdl` (por tribunal) | Consultar processo e documentos, entregar manifestação, avisos pendentes, teor de comunicação | Liberação por IP + credencial do sistema (varia) | Grátis | Ofício à Presidência. Só entidades. Pessoa física não. | Não | Baixa/média | G | [V] no TRF1; [N] no TJSC/TRF4/TRT12 |
| 10 | GeCli (catálogo de APIs do CNJ) | `https://gestao-clientes.pdpj.jus.br` | Pedido de credenciais (Domicílio, "Consulta de Processos Públicos no Datalake") | gov.br | — | Análise pelo CNJ | — | Média | P (pedido) | [V] |
| 11 | BCB SGS | `GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados?formato=json` | Índices e taxas (IPCA, INPC, IPCA-E, SELIC, TR, CDI, IGP-M, SM, Taxa Legal) | Nenhuma | Grátis | Séries diárias: janela de no máx. 10 anos | Não | **Alta** | P | [V] |
| 12 | IBGE SIDRA | `GET https://apisidra.ibge.gov.br/values/t/{tabela}/...` | IPCA (t1737) e INPC (t1736) na fonte primária | Nenhuma | Grátis | — | Não | Alta | P | [V] |
| 13 | BCB Olinda, taxas de juros | `https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/` | Taxa média mensal e diária por instituição e modalidade | Nenhuma | Grátis | OData | Não | **Alta** | P | [V] |
| 14 | Ipeadata | `http://www.ipeadata.gov.br/api/odata4/` | Séries históricas (SM etc.) | Nenhuma | Grátis | — | Não | Média | P | [V] |
| 15 | Manual de Cálculos CJF | PDF/planilhas no CJF | Regras e tabelas da Justiça Federal (Res. 963/2025 e 990/2026) | — | Grátis | Sem API | — | Média (regras viram código) | G | [T] |
| 16 | PJe-Calc Cidadão | Instalador desktop (Windows) nos TRTs | Cálculo trabalhista oficial, arquivo `.PJC` | — | Grátis | Offline, sem API | — | Baixa para integrar | — | [V] parcial |
| 17 | API de assinatura gov.br | ITI / manual servicos.gov.br | Assinatura avançada gov.br | Credencial pedida por **gestor público** | — | Só órgãos públicos, domínio oficial | — | **Nula** para privados | — | [V] |
| 18 | `@signpdf/signpdf` (Node) | npm | Assinatura PAdES com A1 (.pfx) no servidor | — | Grátis (MIT) | — | — | Alta | M | [V] |
| 19 | Lacuna Web PKI | npm `web-pki` 2.19.0 + extensão | A3/A1 no **navegador** (token) | Licença por domínio | Pago (≈ R$ 2,5 mil/mês em proposta pública antiga) | — | — | Média | M | [V] parcial / [T] preço |
| 20 | ZapSign API | `docs.zapsign.com.br` | Assinatura eletrônica, webhooks, sandbox | Token | Plano Equipe a partir de R$ 69,90/mês (20 docs) | Franquia mensal | — | **Alta** | P | [V] |
| 21 | Clicksign API | `clicksign.com` | Assinatura eletrônica, WhatsApp | Token | Automação a partir de R$ 135/mês; excedente de R$ 4,50 a 6,90 por doc | Franquia | — | Alta | P | [V] |
| 22 | DocuSign API | `docusign.com` | Assinatura eletrônica | OAuth | Starter R$ 213,33/mês (R$ 2.560/ano, 40 envelopes) | — | — | Média | P | [V] |
| 23 | D4Sign API | `docapi.d4sign.com.br` | Assinatura eletrônica | Token | Não público | — | — | Média | P | [N] |
| 24 | Serpro Consulta CPF v3 / Datavalid | Loja Serpro | Situação do CPF (v3 exige data de nascimento) e biometria | OAuth (contrato) | Pós-pago por faixa, sem tabela pública | — | — | Média | P | [T]/[N] |
| 25 | ONR / SAEC | `registradores.onr.org.br` | Matrícula online, certidão digital, e-Protocolo | Login | Emolumentos (visualização = 1/3 da certidão) [T] | Sem API pública para terceiros | Bloqueia robô (403) | Baixa | — | [V] parcial |
| 26 | CRC Nacional | `registrocivil.org.br` | Certidões de registro civil | Login | Emolumentos | Sem API pública | **reCAPTCHA** | Baixa | — | [V] |
| 27 | CENPROT (consulta gratuita) | `pesquisaprotesto.com.br` | Existência de protesto por CPF/CNPJ | — | Grátis | Sem API pública | **reCAPTCHA** | Baixa (direto); média via intermediário | P (intermediário) | [V] |
| 28 | CENSEC / e-Notariado / CNIB | `censec.org.br`, `e-notariado.org.br` | Atos notariais, testamentos, indisponibilidade | Login/certificado | Emolumentos | Sem API pública | e-Notariado bloqueia robô (403) | Baixa | — | [N] |
| 29 | CNDT (TST) | `cndt-certidao.tst.jus.br/gerarCertidao` | Certidão negativa de débitos trabalhistas | — | Grátis | — | **Captcha de imagem e áudio** | Inviável direto | — | [V] |
| 30 | CND Receita/PGFN | `servicos.receitafederal.gov.br/servico/certidoes/` | CND federal | — | Grátis | — | **hCaptcha** | Inviável direto | — | [V] |
| 31 | Certidões TRF4 | `www2.trf4.jus.br/trf4/processos/certidao/` | Certidão de distribuição | — | Grátis | — | **reCAPTCHA** | Inviável direto | — | [V] |
| 32 | Certidões TJSC / TRT12 | portais dos tribunais | Certidões de distribuição | — | Grátis | WAF anti-robô | TJSC bloqueia como `_BOT`; TRT12 devolve 202 vazio | Inviável direto | — | [V] bloqueio / [N] captcha |
| 33 | Infosimples (agregador) | `infosimples.com` | Centenas de consultas e certidões por API | Token | R$ 0,20/consulta no início, com faixas; franquia mínima de R$ 100/mês | Limites por consulta | Resolvido pelo fornecedor | Média | P | [V] |
| 34 | Portal da Transparência | `https://api.portaldatransparencia.gov.br/api-de-dados/...` | CEIS, CNEP, CEPIM, CEAF, PEP, servidores, contratos, pessoa física e jurídica | Header com chave obtida via gov.br (prata/ouro) | Grátis | 400 req/min (700 entre 0h e 6h); 180 req/min em rotas restritas [T] | Não (API) | **Alta** | P | [V] endpoints / [T] limites |
| 35 | CNA / OAB | `cna.oab.org.br` | Dados de advogados | — | — | Sem API. O provimento da OAB veda repasse a terceiros [T]. | — | **Evitar** | — | [T] |
| 36 | ANS dados abertos | `https://dadosabertos.ans.gov.br/FTP/PDA/` | Reajustes, NIP, penalidades, IGR, operadoras | Nenhuma | Grátis | Arquivos | Não | Média (nicho saúde) | P | [V] |
| 37 | consumidor.gov.br | `consumidor.gov.br/pages/dadosabertos/externo/` | Reclamações por empresa | Nenhuma | Grátis | Arquivos | Não | Média (nicho consumidor) | P | [V] página |
| 38 | INPI RPI | `https://revistas.inpi.gov.br/rpi/` | Revista semanal em XML/TXT (marcas, patentes) | Nenhuma | Grátis | Semanal | Não | Média (nicho PI) | P | [V] |
| 39 | WhatsApp Cloud API | `graph.facebook.com` | Mensagens (templates e serviço) | Token Meta | BR: marketing R$ 0,3217; utilidade, autenticação e serviço R$ 0,035; 1.000 msgs de serviço grátis por mês por número | Regras de template; IA incidental permitida | — | Já integrado | — | [V] |
| 40 | Asaas API | `docs.asaas.com` | Pix, Pix Automático, boleto, cartão, NFS-e, régua de cobrança | API key | Pix/boleto R$ 1,59 por recebimento; NF R$ 0,49; WhatsApp R$ 0,55 por notificação | — | — | **Alta** | M | [V] |
| 41 | Efí (Gerencianet) API Pix | `dev.efipay.com.br` | Pix, Pix Automático, boleto | mTLS + OAuth | Não verificado | — | — | Alta | M | [V] API / [N] preço |
| 42 | Stripe Brasil | `docs.stripe.com/payments/pix` | Pix avulso | — | — | **Sem Pix Automático no Brasil** | — | Baixa para recorrência | — | [V] |
| 43 | NFS-e Nacional | Sefin `https://sefin.nfse.gov.br/SefinNacional/docs/index`; ADN, DANFSe, parâmetros | Emissão e consulta de NFS-e no padrão nacional | Certificado ICP-Brasil [N] | Grátis | Depende da adesão do município | — | Média (melhor via PSP) | M/G | [V] URLs |
| 44 | Google Calendar / Microsoft Graph | APIs oficiais | Agenda (prazos e audiências) | OAuth | Grátis com cotas | Cotas | — | Alta | M | [N] (não reverificado) |
| 45 | Transcrição (OpenAI) | `api.openai.com` | Áudio para texto em PT-BR | API key | gpt-transcribe US$ 0,0045/min; gpt-4o-mini-transcribe US$ 0,003/min | — | — | Alta | P | [V] |
| 46 | Judit | `requests/tracking/lawsuits.production.judit.io` | Consulta em tempo real, datalake, monitoramento, autos, DJEN, novas ações | `api-key` | Piso de R$ 1 mil/mês; tabela pública | — | — | Alta (comprar) | P/M | [V] |
| 47 | Escavador API v2 | `api.escavador.com/v2` | Busca por nome/CPF/CNPJ/OAB, monitoramento, autos com certificado do advogado | Token | Tabela atrás de login | MFA do tribunal | — | Média | P/M | [V] recursos / [N] preço |
| 48 | Intima.ai API v3 | Postman público | Intimações, consulta, cópia de autos, **protocolo** e habilitação (PJe, Projudi, e-SAJ, eproc) | Token + "autenticador" (usuário/senha ou A1 **+ segredo 2FA**) | Tabela por ação em unidades não explicadas | — | — | Média, com risco | M | [V] recursos |
| 49 | Jusbrasil Soluções (ex-Digesto) | — | Dados processuais corporativos | — | Não público | — | — | [N] | — | [V] marca / [N] resto |
| 50 | Codilo | — | — | — | — | Site "pausado" em 31/10/2026 | — | **Evitar** | — | [V] |
| 51 | Predictus / Kurier | — | Due diligence; publicações e andamentos | — | Não público | — | — | [N] | — | [N] |

---

## 3. Detalhe por grupo

### 3.1 Judiciário

#### DataJud (API Pública do CNJ)

- **Endpoint e acesso.** Há um índice Elasticsearch por tribunal, em `https://api-publica.datajud.cnj.jus.br/api_publica_{sigla}/_search`. TJSC, TRF4 e TRT12 estão listados. A autenticação usa o header `Authorization: APIKey <chave>`, e a chave vigente fica publicada na própria wiki. O CNJ pode trocá-la a qualquer momento [V: https://datajud-wiki.cnj.jus.br/api-publica/acesso/].
- **Campos (glossário).** `numeroProcesso`, `tribunal`, `grau`, `dataAjuizamento`, `nivelSigilo`, `formato`, `sistema`, `classe`, `assuntos[]`, `orgaoJulgador` (com município IBGE), `movimentos[]` (código TPU, nome, data e hora, `complementosTabelados[]`, órgão), além de `dataHoraUltimaAtualizacao` e `@timestamp` [V: https://datajud-wiki.cnj.jus.br/api-publica/glossario/]. **Não há partes, advogados nem documentos.** Conferi um documento recente do TRF4 e ele não tinha nenhum campo de partes [V, GET].
- **Paginação.** `size` vai de 10 a 10.000. Para volumes maiores, usa-se `search_after` com ordenação por `@timestamp` [V: https://datajud-wiki.cnj.jus.br/api-publica/exemplos/exemplo3].
- **Defasagem medida em 31/10/2026** (máximo de `@timestamp`) [V, GET]:
  - TJSC: 16/10/2026, cerca de 15 dias.
  - TRT12: 06/10/2026, cerca de 25 dias.
  - TRF4: 26/10/2026, cerca de 5 dias.
- **Qualidade dos dados.** Encontrei movimentos com datas em 2999 e 3020. Um processo do TJSC de 2024 aparecia com `sistema.nome = "Projudi"`, embora o TJSC use o eproc. Agregações levaram de 7 a 31 segundos [V, GET]. A própria wiki diz que a API está "em fase Beta" [V: https://datajud-wiki.cnj.jus.br/api-publica/consideracoes_finais/].
- **Novidades de 2026: Portaria CNJ 374, de 14/08/2026** (DJe/CNJ 196/2026) [V: https://atos.cnj.jus.br/atos/detalhar/6972]:
  - Os tribunais passam a enviar dados **diariamente**, com 180 dias para se adaptar, a contar da publicação.
  - A API deve trazer, no mínimo, os polos ativo e passivo **quando forem pessoa jurídica**, a prioridade processual, o sistema e a indicação de processo eletrônico.
  - Processos em segredo de justiça são excluídos ou anonimizados.
  - **Art. 4º:** uso "não comercial", vedação de "exploração comercial", **citação obrigatória do CNJ/DataJud** como fonte em aplicativos e ausência de garantia de atualidade dos dados.
  - Em 31/10/2026, os campos novos ainda não estavam na API [V].
- **Termo de Uso v1.2.** Tem as mesmas cláusulas de uso não comercial (3.3 e 3.8) [V: https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/].
- **Avaliação.** É técnica e gratuita, mas tem risco jurídico para um SaaS. Serve como complemento (classe, assuntos, órgão, histórico TPU). **Não serve como fonte de prazo.** Recomendo:
  1. exibir "Fonte: CNJ/DataJud" na interface;
  2. pedir parecer sobre o enquadramento do uso, que é feito pelo próprio escritório sobre processos em que atua (o que talvez não seja "exploração comercial" dos dados);
  3. reduzir a dependência, priorizando o DJEN.

#### DJEN (comunicaapi.pje.jus.br)

Especificação OpenAPI 3.0.1, versão 1.0.4, "última atualização em 04-03-2026" [V: https://comunicaapi.pje.jus.br/swagger/djen.yml].

- **Endpoints públicos (sem cadeado):**
  - `GET /api/v1/comunicacao`. Filtros: `numeroOab`, `ufOab`, `nomeAdvogado`, `nomeParte`, `numeroProcesso`, `dataDisponibilizacaoInicio/Fim`, `siglaTribunal`, `numeroComunicacao`, `pagina`, `itensPorPagina` (5 ou 100), `orgaoId`, `meio` (D = Diário, E = Edital). Teto de **10.000 resultados** em buscas por texto ou OAB, em intervalos de datas e em buscas por número de processo. A busca precisa ter ao menos um filtro forte.
  - `GET /api/v1/comunicacao/{hash}/certidao`. Retorna a **certidão da comunicação em PDF**. Testei e recebi 200, `application/pdf` [V, GET].
  - `GET /api/v1/comunicacao/tribunal`. Lista os tribunais com a **data do último envio** [V, GET].
  - `GET /api/v1/caderno/{sigla_tribunal}/{data}/{meio}`. Devolve metadados do caderno (status, versão, total, SHA-256) e uma **URL S3 válida por 5 minutos**. Os cadernos do dia ficam disponíveis "a partir das 03:00". Testes [V, GET]:
    - TJSC, 30/10/2026: 27.041 comunicações, 22,3 MB.
    - TRT12, 29/10/2026: 9.008 comunicações, 6,3 MB, 10 arquivos JSON com o mesmo esquema da consulta.
    - O JSON inclui `destinatarioadvogados[].advogado.numero_oab/uf_oab`, `destinatarios[].nome/polo`, `texto` (HTML), `link`, `hash` e `tipoComunicacao`.
- **Endpoints exclusivos de tribunais:** login, `POST /comunicacao` e cancelamento.
- **Rate limit.** O controle é por IP, com os headers `x-ratelimit-limit` e `x-ratelimit-remaining`. O teste mostrou limite de 20. Diante de um 429, a orientação é "aguardar 1 minuto" [V].
- **Tipos de comunicação.** Citação, Intimação, Edital, Pauta de julgamento, Lista de distribuição e Ata de sessão [V]. As **pautas de sessão** e as **listas de distribuição** também chegam pelo DJEN, sem integração extra.
- **`link` do inteiro teor.** No TJSC, o link aponta para `eproc2g.tjsc.jus.br/...acao=consulta_publica_documento...` [V]. Esse documento pode ser baixado sem login, **mas o WAF do TJSC bloqueou meu acesso automatizado** ("seus sistemas classificaram esse acesso como não autorizado", Support ID `..._BOT`) [V]. Seguir esses links a partir do servidor do Decreta vai ser bloqueado. O caminho seguro é abrir o link no navegador do usuário.
- **Viabilidade.** **Alta.** O caderno diário com cruzamento local resolve três problemas de uma vez:
  1. o teto de 10.000 resultados;
  2. o rate limit;
  3. a captura de comunicações a clientes, por nome de parte, mesmo antes de o advogado ser cadastrado no processo.
  - **Cuidado com a LGPD:** o caderno traz dados de terceiros. Convém processar em memória, guardar só o que casou e descartar o resto.

#### Domicílio Judicial Eletrônico (Res. CNJ 455/2022)

Fonte principal [V: https://docs.pdpj.jus.br/servicos-negociais/domicilio-judicial-eletronico/].

- **API para instituições.** Só **CNPJ** (empresas privadas e órgãos públicos) pode gerar credenciais. O caminho é "Gerenciar credenciais API" no Domicílio, que redireciona ao GeCli, onde se aceita o termo e se recebem client e secret.
- **Fluxo:**
  1. Token via SSO do CNJ (`grant_type=client_credentials`).
  2. Header obrigatório `On-behalf-Of: <CPF de 11 dígitos>`, usado para auditoria.
  3. `GET api/v1/eu` para obter o `tenantId`.
  4. `GET /comunicacoes`, com `dataInicio` e `dataFim` (**no máximo 7 dias**) ou `numeroProcesso`, além de `statusCiente` e outros filtros.
  5. Para o **inteiro teor**, chamar o endpoint de comunicação do processo. Ele marca a comunicação como **"ciente" quando o conteúdo é aberto**, e isso dispara prazo.
  6. `GET /processos/{n}/logs`.
  7. Há também consultas de pessoa física e jurídica na base da PDPJ.
- **Mudança de credenciais.** O novo modelo de autenticação era obrigatório até **31/03/2026**, sob pena de perda de acesso [V: https://portal.trt12.jus.br/noticias/cnj-alerta-para-atualizacao-no-domicilio-judicial-eletronico, notícia de 01/12/2025].
- **Pessoa física e advogado.** O cadastro é voluntário. O advogado vê as comunicações de clientes em "Meus Representados", **só pela web**, com login gov.br [V].
- **Viabilidade.** Média. Uma oferta possível para escritórios com clientes PJ (empresas rés, trabalhista patronal): o cliente gera a credencial e o Decreta lê **sem abrir** o inteiro teor, mostra os prazos e deixa a ciência como ato explícito do advogado. Exige termo com o cliente e guarda segura do secret.

#### PDPJ-Br, Jus.br, GeCli e datalake

- **Jus.br.** É o portal único, com login gov.br, para consultar processos, peticionar (inicial e intercorrente) e ver comunicações do DJEN e do Domicílio. As APIs documentadas são para os **tribunais** receberem petições por webhook e devolverem callback, e não para software de escritório [V: https://docs.pdpj.jus.br/servicos-negociais/portal-servicos/introducao, https://docs.pdpj.jus.br/servicos-negociais/portal-servicos/pet-intercorrente]. **Não há API de peticionamento para terceiros.**
- **GeCli.** Fica em `https://gestao-clientes.pdpj.jus.br`. É o portal de gestão de credenciais e catálogo de APIs do CNJ, com login gov.br para PF e PJ externas. O usuário pede acesso por API (exemplos do próprio catálogo: Domicílio e **"API de Consulta de Processos Públicos no Datalake"**), informa finalidade e ambiente, e o pedido fica "Em análise" pelo CNJ. A plataforma prevê tarifação [V: https://docs.pdpj.jus.br/servicos-negociais/GeCli].
- **Portaria CNJ 316/2024**, alterada pela **Portaria 442, de 18/09/2026** [V: https://atos.cnj.jus.br/atos/detalhar/5792]:
  - **Dados públicos:** número, classe, assuntos, nomes das partes e advogados, decisões, sentenças, votos, acórdãos e movimentação.
  - **Dados potencialmente sensíveis** (não fornecidos): petições e documentos.
  - **Quem pode pedir:** entidades que comprovem LGPD, segurança, auditoria, **uptime > 95%** e capacidade para **200 mil usuários únicos por mês**. Desde 09/2026, também habilitação jurídica e fiscal no estilo da Lei 14.133 e checagem de integridade (CEIS, CNEP, CNIA).
  - **Custo:** "bilhetagem direta" da nuvem ao interessado.
  - **Contrapartida:** oferecer o produto **gratuitamente** a magistrados e servidores, via PDPJ.
  - **Art. 8º:** o CNJ publicará uma **relação diária de processos modificados** no dia anterior. Seria ótimo para detectar mudanças, mas **não localizei a publicação** [N].
  - **Art. 9º:** tribunais e conselhos podem bloquear **comportamento inautêntico**, como rotinas que simulem humanos, operações simultâneas ou repetitivas, credenciais duplicadas, e **consumo abusivo**, como consulta sistemática sem relação com o usuário ou extração massiva de documentos.
  - **Viabilidade:** baixa no curto prazo, pelas exigências de escala. É o canal "oficial" de que agregadores dependem.

#### MNI (Modelo Nacional de Interoperabilidade)

- É um padrão SOAP do CNJ (versões 2.2.2 e 2.2.3). Operações: `consultarProcesso` (com `incluirDocumentos`), `entregarManifestacaoProcessual`, `consultarAvisosPendentes` e `consultarTeorComunicacao`.
- **Exemplo verificado, TRF1** [V: https://trf1.jus.br/trf1/conteudo/NUGTI/MNI_Orientações.pdf]:
  - Integração sujeita à aprovação da **Presidência** do tribunal, mediante ofício.
  - Liberação **por IP real** (sem faixas de rede).
  - **"não sendo permitido o acesso a pessoas físicas"**.
  - Endpoints públicos `…/pje/intercomunicacao?wsdl` e `/v223?wsdl`.
- **TJES.** Publica MNI do PJe 1º e 2º graus para "desenvolvedores, órgãos públicos, escritórios de advocacia", com requisitos que variam entre certificados, autenticação e IP (página atualizada em 31/03/2026) [V: https://www.tjes.jus.br/portal-transparencia/tecnologia-da-informacao-e-comunicacao/acesso-automatizado-por-sistemas-externos/].
- **eproc (TJSC e TRF4).** O eproc tem webservice no padrão MNI [T: material de curso do TJSC]. O TJSC divulgou em 2019 um ofício circular para integrar **procuradorias** ao eproc [T]. O TRF4 exige 2FA para usuários externos do eproc desde 22/04/2024 [T]. **Não encontrei procedimento público para escritórios** no TJSC, no TRF4 nem no TRT12 [N].
- **Viabilidade.** Baixa ou média. O caminho é institucional: ofício a cada tribunal, IP fixo e, provavelmente, credencial do advogado em cada chamada. Recomendo enviar um ofício-piloto ao TJSC, que tem DTI ativa em interoperabilidade, só depois de o produto ter base de clientes.

#### Íntegra dos autos, pautas, audiências, balcão virtual e custas

- **Autos.** Não há canal oficial aberto a software de escritório. As rotas são: (a) o próprio advogado na web; (b) MNI autorizado; (c) agregadores que guardam a credencial do advogado (veja o item 3.7); (d) links públicos de documentos que vêm no DJEN, que o servidor não consegue seguir no TJSC por causa do WAF [V].
- **Pautas de sessão.** Vêm no DJEN como tipo "Pauta de julgamento" e "Ata de sessão" [V].
- **Audiências.** Aparecem em intimações do DJEN e em movimentos TPU do DataJud (com atraso). Não verifiquei API específica de pauta de audiências [N].
- **Balcão virtual (Res. CNJ 372/2021).** É atendimento por videochamada com link por vara. Não encontrei API [N].
- **Custas e guias.** São emitidas dentro do eproc ou PJe, ou em sistemas de custas de cada tribunal. Não encontrei API pública [N].

### 3.2 Cálculos

- **BCB SGS** [V, GETs]. Base: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/mm/aaaa&dataFinal=...` ou `/dados/ultimos/N`.
  - **Códigos testados:** 433 (IPCA), 188 (INPC), 10764 (IPCA-E), 11 (SELIC diária), 4390 (SELIC acumulada no mês), 226 (TR diária) e 7811 (TR mensal), 12 (CDI), 189 (IGP-M), 1178 (SELIC anualizada) e 1619 (salário mínimo, R$ 1.621,00 em 2026).
  - **Taxa Legal (Lei 14.905/2024):** 29541 (fator SELIC), 29542 (fator IPCA) e 29543 (Taxa Legal). Em outubro de 2026, a Taxa Legal foi de 0,379020%. Os códigos foram sugeridos por um blog [T: gilbertomelo.com.br] e confirmados por chamada à API [V].
  - **Restrição:** séries diárias aceitam no máximo 10 anos por chamada. A API devolve o erro "O sistema aceita uma janela de consulta de, no máximo, 10 anos em séries de periodicidade diária" [V]. É preciso paginar por décadas.
- **IBGE SIDRA.** `https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/last%201` traz o IPCA e `t/1736/.../v/44` traz o INPC [V]. Use como verificação cruzada das séries do SGS.
- **Lei 14.905/2024** [V: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14905.htm]:
  - **Art. 389, p. único:** IPCA é o índice supletivo, aplicado na falta de convenção ou de lei específica.
  - **Art. 406:** taxa legal = SELIC − IPCA. Resultado negativo vale zero. A metodologia é do CMN e a divulgação, do BCB.
  - Publicada em 28/06/2024 (DOU de 01/07/2024), com a maior parte dos efeitos 60 dias depois.
  - Metodologia (Res. CMN 5.171/2024, com IPCA-15 do mês anterior) [T].
- **EC 113/2021, com a redação da EC 136/2025** (DOU de 10/09/2025) [V: https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc136.htm]:
  - Nos **requisitórios** contra a Fazenda federal: IPCA da expedição ao pagamento, mais juros simples de 2% a.a.
  - Se o resultado passar da SELIC do período, aplica-se a SELIC.
  - Matéria tributária segue o critério que a Fazenda usa para os próprios créditos.
  - Não há juros de mora no período constitucional de pagamento.
  - Há divergência sobre o período **anterior** à expedição. Um acórdão do TRF4 aplica SELIC − IPCA pelos arts. 406 e 389 do CC. O Provimento CNJ 207/2025 usa agosto de 2025 como corte [T].
- **Manual de Cálculos da Justiça Federal (CJF).** A edição foi aprovada pela Res. CJF 963/2025, e a Res. CJF 990/2026 incorporou os impactos da EC 136/2025, do Tema 1.207 do STJ e do novo art. 406 do CC (Nota Técnica 1/2026) [T: https://www.cjf.jus.br/cjf/corregedoria-da-justica-federal/corregedoria-geral-da-justica-federal/comissao_manual_de_calculos]. Não há API. As tabelas são publicadas pela Corregedoria do CJF.
- **TJSC.** O portal bloqueou meu acesso automatizado. Não confirmei o índice oficial da Corregedoria, nem se a tabela ainda é pelo INPC ou se passou ao IPCA com a Taxa Legal depois da Lei 14.905 [N]. A fonte a consultar é o Código de Normas da CGJ-SC (Provimento CGJ 22/2025) [T].
- **PJe-Calc (CSJT).**
  - A versão **Cidadão** é distribuída gratuitamente pelos TRTs. Roda **offline**, só no Windows, e o instalador do TRT12 vem do TRT8 [V: https://portal.trt12.jus.br/pjecalccidadao].
  - Versões citadas: 2.15.1 (TRT15) e 2.16.0 (TRT9). O TRT12 alertou para um erro da 2.15.1 em precatório/RPV [T].
  - O uso é **facultativo** para advogados (Ato CSJT.GP.SG 146/2020) [T].
  - Gera o arquivo `.PJC`, que é anexado ao PJe. O formato não tem documentação pública [N].
  - **Não dá para integrar.** O que o Decreta pode fazer: guardar o `.PJC` como anexo e extrair só o resumo do relatório PDF.
- **Previdenciário.** Não há API do INSS para teto e tabelas. Em 2026, o teto é R$ 8.475,55 (Portaria Interministerial MPS/MF 13/2026) e o salário mínimo é R$ 1.621,00 (Decreto 12.797/2025) [T]. O salário mínimo foi confirmado na SGS 1619 [V]. A tabela anual teria de ser mantida como parâmetro no próprio Decreta.

### 3.3 Assinatura e identidade

- **API de assinatura gov.br.** As credenciais são pedidas por um **gestor público**. A produção exige integração com o Login Único e **domínio oficial** (gov.br, jus.br e semelhantes), e a URL de retorno tem de estar no domínio do órgão [V: https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt-br/latest/iniciarintegracao.html]. **Não está disponível para o Decreta.** A alternativa é orientar o usuário a assinar o PDF em `assinador.iti.br`, fora do sistema.
- **ICP-Brasil no servidor (A1).** `@signpdf/signpdf` v4.0.0 (MIT) [V: npm; repositório https://github.com/vbuch/node-signpdf ativo em 10/2026]. Gera assinatura PKCS#7 embutida com .pfx. Para chegar a PAdES com política ICP-Brasil (carimbo de tempo, política AD-RB), é preciso complementar com `pkijs` [V: npm, BSD-3]. Esforço M.
- **ICP-Brasil no navegador (A3/token).** Pede um componente nativo. Opções:
  - **Lacuna Web PKI**, pago (npm `web-pki` 2.19.0) [V]. Uma proposta pública do TCE-RN cotou a suíte em ≈ R$ 2.516,23 por mês [T, valor antigo].
  - **PeculiarVentures Fortify**, código aberto, mas **arquivado** desde 2024 [V: GitHub]. Evitar.
  - **Assinador SERPRO** (desktop) [T]. A API local não foi confirmada [N].
- **Validação.** O ITI Validar (`validar.iti.gov.br`) não tem API REST pública. O código-fonte é cedido mediante pedido ao ITI [T].
- **Provedores comerciais:**
  - **ZapSign** (preços verificados em 07/09/2026 no próprio site). A API está só nos planos Equipe: R$ 69,90/mês (20 docs), R$ 119,90 (80) e R$ 259,90 (200). O Enterprise começa em R$ 500. A ZapSign é AC ICP-Brasil e tem MCP [V: https://www.zapsign.com.br/hubfs/llms.txt].
  - **Clicksign**: Start R$ 69/mês, Plus R$ 99 e Automação (com API) R$ 135. Excedentes de R$ 2,40 a 6,90 por documento, conforme plano e volume. Há autenticações extras, como documentoscopia a R$ 4,50 [V: https://www.clicksign.com/planos, 31/10/2026, com cupom promocional exibido].
  - **DocuSign** (planos Developer API): Starter R$ 213,33/mês (R$ 2.560/ano, 40 envelopes), Intermediate R$ 1.277,50 e Advanced R$ 2.043,33 [V: https://ecom.docusign.com/plans-and-pricing/developer].
  - **D4Sign**: comprada pela Zucchetti em 2024 [T]. Preço não público [N].
- **Serpro.** A Consulta CPF v3 entrou em produção em 2026 e **exige CPF + data de nascimento** (Portaria RFB 667/2026) [T: https://www.serpro.gov.br/menu/noticias/noticias-2026/nova-versao-da-consulta-cpf]. A cobrança é pós-paga por faixa, sem tabela pública [N]. Datavalid: [N].

### 3.4 Cartórios e certidões

| Serviço | Situação para automação | Fonte |
|---|---|---|
| ONR / SAEC (matrícula online, certidão digital, e-Protocolo) | Sem API pública para terceiros; existe API entre ONR e cartórios. O portal devolve 403 a robô. Visualização de matrícula = 1/3 dos emolumentos da certidão [T]. | [V] 403 em `registradores.onr.org.br`; [T] SEI/CNJ 2022 |
| CRC Nacional (registro civil) | reCAPTCHA na página | [V] `registrocivil.org.br` |
| CENPROT (consulta gratuita de protesto) | reCAPTCHA. API só por intermediários homologados (Infosimples, Direct Data) [T]. O Provimento CNJ 225/2026 alterou o Código Nacional de Normas sobre o CENPROT [T]. | [V] `pesquisaprotesto.com.br` |
| CENSEC | Sem captcha na home e sem API pública | [V] home / [N] API |
| e-Notariado | Devolve 403 a robô | [V] |
| CNIB | Não verificado | [N] |
| **CNDT (TST)** | **Captcha de imagem e de áudio** no formulário `gerarCertidao` | [V] https://cndt-certidao.tst.jus.br/gerarCertidao |
| **CND Receita/PGFN** | **hCaptcha** | [V] https://servicos.receitafederal.gov.br/servico/certidoes/ |
| **Certidão TRF4** | **reCAPTCHA** | [V] https://www2.trf4.jus.br/trf4/processos/certidao/ |
| Certidões TJSC | WAF bloqueia acesso automatizado (`..._BOT`) | [V] |
| Certidão trabalhista TRT12 | HTTP 202 sem corpo (desafio anti-bot) | [V] / [N] captcha |
| Infosimples (agregador) | Pré-pago. Começa em R$ 0,20 por consulta (faixas até R$ 0,09) e franquia mínima de R$ 100/mês. Alguns serviços têm adicional por consulta. Inclui CNDT e outros. | [V] https://infosimples.com/consultas/precos/ |

**Conclusão.** As certidões com captcha **não devem ser automatizadas diretamente**. Se o escritório quiser certidões em lote, compre de um intermediário. O risco jurídico e o de termos de uso ficam com o fornecedor, mas o Decreta precisa avaliar esse fornecedor. O melhor desenho é um fluxo assistido: o Decreta gera a lista e os links e o advogado emite no navegador.

### 3.5 Dados públicos

- **Portal da Transparência (CGU).** Especificação OpenAPI pública [V: https://api.portaldatransparencia.gov.br/v3/api-docs]. Endpoints úteis: `/api-de-dados/ceis`, `/cnep`, `/cepim`, `/ceaf`, `/peps`, `/pessoa-fisica`, `/pessoa-juridica`, `/servidores` (com remuneração), `/contratos/cpf-cnpj`, `/acordos-leniencia`. A chave é obtida com login gov.br prata ou ouro e chega por e-mail [T: https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email]. Limites: 400 req/min (700 entre 0h e 6h) e 180 req/min nas rotas restritas [T]. **Uso imediato:** checagem de CEIS, CNEP e PEP no cadastro de cliente (compliance e conflito) e pesquisa de servidor em causas contra o Estado.
- **QSA de CNPJ.** O Decreta já usa BrasilAPI e CNPJá. **Atenção:** o CNPJ alfanumérico (IN RFB 2.229/2024) é citado na documentação da Judit [V: https://docs.judit.io/llms.txt]. Pelo cronograma da RFB, entra em 07/2026 [N]. É preciso validar se os campos e o validador do Decreta aceitam letras.
- **CNA (OAB).** Não há API. O Provimento CFOAB 103/2004 veda o repasse a terceiros [T]. **Evitar** raspagem. O Decreta já recebe as OABs dos próprios usuários.
- **Bacen, taxas médias de juros** (API Olinda `taxaJuros` v2). Recursos `TaxasJurosMensalPorMes`, `TaxasJurosDiariaPorInicioPeriodo` e `ConsultaUnificada`, com taxa ao mês e ao ano por instituição (CNPJ8) e modalidade. Exemplo: setembro de 2026, financiamento imobiliário prefixado, Caixa a 0,87% a.m. [V, GET]. **É o insumo central da revisional bancária.**
- **ANS.** Há repositório PDA com reajustes, `demandas_dos_consumidores_nip`, `penalidades_aplicadas_a_operadoras`, IGR, operadoras ativas e canceladas e muito mais [V: https://dadosabertos.ans.gov.br/FTP/PDA/]. Útil para ações contra planos de saúde.
- **consumidor.gov.br.** Página de dados abertos ativa [V]. O formato dos arquivos não foi verificado [N].
- **INPI.** A RPI semanal sai em XML e TXT para uso por aplicativos, em seções desde a RPI 2404 [V: https://revistas.inpi.gov.br/rpi/]. Útil para monitorar marcas de clientes. O pePI (busca) não tem API [N].

### 3.6 Comunicação e cobrança

#### WhatsApp Business (Cloud API)

Fonte da tabela, em vigor desde 01/10/2026 [V: planilhas de tarifas oficiais em https://developers.facebook.com/docs/whatsapp/pricing/]:

| Brasil, por mensagem | USD | BRL |
|---|---|---|
| Marketing | 0,0625 | 0,3217 |
| Utilidade | 0,0068 | 0,035 |
| Autenticação | 0,0068 | 0,035 |
| Serviço (após a franquia) | 0,0068 | 0,035 |
| Meta Business Agent | US$ 2 por milhão de tokens | idem |

- **Gratuidades.**
  - **Janela de ponto de entrada gratuito** (cliques em anúncios e semelhantes): nenhuma categoria é cobrada.
  - **Serviço:** as **primeiras 1.000 mensagens por mês em cada número** são grátis, sem acumular. A cobrança começa na 1.001ª **a partir de 01/10/2026** [V].
  - Mensagens de utilidade dentro da janela de atendimento passaram a ter o tipo de preço "regular" no webhook a partir de 01/10/2026 [V].
- **Moeda.** Contas em BRL disponíveis desde 01/07/2026, com faturamento pelo Facebook Brasil. **Migração obrigatória até 30/06/2027**. Depois de 01/07/2027, a Meta para de entregar mensagens de contas que não estejam em BRL [V].
- **Política de IA.** A cláusula 4.7 dos "Meta Terms for WhatsApp Business Platform" (última atualização em 23/09/2026) proíbe que provedores de IA usem a plataforma quando a IA for a **funcionalidade principal**, "em vez de incidental ou auxiliar". Também proíbe usar dados da plataforma para treinar modelos, mas permite fine-tuning de uso exclusivo. A cláusula remete a uma lista de países com regras diferentes [V: https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform]. A imprensa noticiou que a vigência para contas existentes começou em 15/01/2026 e que **Brasil e Itália** tinham exceção por decisões de autoridades concorrenciais [T]. Para o Decreta, o resumo da manhã e um assistente sobre os processos do próprio escritório são uso **incidental ou auxiliar** e, portanto, permitido. Um "ChatGPT jurídico aberto" no WhatsApp seria um caso de risco.
- **Estimativa de custo.** Um resumo diário por advogado, enviado como template de utilidade, custa cerca de R$ 0,035 × 22 dias úteis ≈ **R$ 0,77 por advogado por mês**.

#### Pix Automático, Pix Cobrança e boleto

- **Pix Automático (Bacen).** A página do BCB não renderizou no meu cliente [N]. O lançamento foi em 16/06/2025 [N, conhecimento prévio].
- **Asaas:** API de Pix Automático documentada (autorização prévia do pagador, sem nova autorização a cada ciclo) [V: https://docs.asaas.com/docs/pix-automatico]. Preços padrão [V: https://www.asaas.com/precos-e-taxas]:
  - Pix e boleto: **R$ 1,59 por recebimento** (R$ 0,79 nos 3 primeiros meses).
  - NFS-e: **R$ 0,49 por nota**.
  - Notificação por WhatsApp: R$ 0,55.
  - Negativação no Serasa: R$ 9,90.
  - Sem mensalidade.
- **Efí:** endpoints de recorrência de Pix Automático. Exige Conta Digital Efí Empresas [V: https://dev.efipay.com.br/docs/api-pix/pix-automatico]. Preço [N].
- **Stripe:** "O Pix Automático não está disponível para empresas domiciliadas no Brasil". Contas brasileiras só recebem Pix avulso [V: https://docs.stripe.com/payments/pix]. **Evitar para recorrência.**
- **Inter:** [N].

#### NFS-e Nacional e reforma tributária

- **APIs do padrão nacional** [V: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao]:
  - Sefin Nacional: `https://sefin.nfse.gov.br/SefinNacional/docs/index`.
  - ADN Contribuintes: `https://adn.nfse.gov.br/contribuintes/docs/index.html`.
  - DANFSe e Parâmetros Municipais.
  - Há ambiente de produção restrita.
  - O portal cita regras de preenchimento de IBS e CBS e a Nota Técnica 009 [V].
  - Autenticação por certificado ICP-Brasil: [N].
  - Obrigatoriedade geral em 2026 pela LC 214/2025: [N] (não localizei o artigo no texto).
- **LC 214/2025, art. 127.** Reduz em **30%** as alíquotas de IBS e CBS para profissões intelectuais regulamentadas, **incluindo advogados**. Para sociedades, valem requisitos cumulativos: sócios habilitados, nenhuma PJ como sócia, a sociedade não é sócia de outra PJ, só atividades das habilitações e serviço prestado diretamente pelos sócios [V: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm]. Alíquotas de teste de 2026 e dispensa de recolhimento: [N] (não localizei o artigo no texto lido).
- **Recomendação.** Emitir NFS-e pelo PSP de cobrança (Asaas, R$ 0,49 por nota). Integrar direto na Sefin Nacional só se houver escala.

#### Agenda e transcrição

- **Google Calendar API e Microsoft Graph (calendário).** São gratuitas dentro das cotas, com OAuth por usuário [N, não reverificado nesta pesquisa]. Uso: empurrar prazos e audiências para a agenda do advogado.
- **Transcrição em PT-BR, OpenAI** [V: https://platform.openai.com/docs/pricing]:
  - `gpt-transcribe`: US$ 0,0045/min.
  - `gpt-4o-transcribe`: US$ 0,006/min.
  - `gpt-4o-mini-transcribe`: US$ 0,003/min.
  - Tempo real: US$ 0,017/min.
  - Uma hora de audiência sai por US$ 0,18 a 0,36.
  - Deepgram: [N].
  - **Atenção:** o Decreta usa OpenRouter. Antes de escolher o provedor, confira se o roteamento oferece endpoint de transcrição.

### 3.7 Agregadores pagos: comprar ou construir

| Fornecedor | O que entrega (verificado) | Preço | Observações |
|---|---|---|---|
| **Judit** | Três serviços: `requests` (tempo real no tribunal, webhook), `tracking` (monitoramento) e `lawsuits` (datalake síncrono). Busca por `cpf`, `cnpj`, `oab`, `name`, `lawsuit_cnj`. Anexos, contagens, BNMP, SEEU, DJEN e **cofre de credenciais** (`crawler.prod.judit.io`) [V: https://docs.judit.io/llms.txt] | Contrato anual pós-pago, **piso de R$ 1 mil/mês**. Na faixa de R$ 1 mil: consulta CNJ R$ 0,25; histórico (datalake) R$ 1,50 por mil processos; histórico on demand R$ 6,00 por mil; **monitoramento processual R$ 1,50 por processo por mês**; **autos R$ 3,50**; monitoramento DJEN R$ 1,35 por processo por mês; **novas ações R$ 15 por entidade + R$ 0,25 por processo**. Em faixas maiores, cai até ~70% [V: https://judit.io/precos] | O preço mais transparente do mercado. Bom para "novas ações contra o cliente" e tribunais fora do DJEN e DataJud. |
| **Escavador API v2** | Processos por envolvido (nome, CPF ou CNPJ, com OABs e participações societárias), monitoramento, atualização assíncrona no tribunal com retentativas, **autos via certificado digital do advogado** enviado à plataforma. O tribunal pode exigir MFA [V: https://api.escavador.com/v2/docs/] | Custo por requisição em centavos, no header `Creditos-Utilizados`. Tabela **atrás de login** [N] | Guarda o certificado do advogado em terceiro. |
| **Intima.ai API v3** | "Autenticadores" por tribunal (usuário/senha ou **certificado A1**, com **segredo de 2FA** quando o tribunal exige), intimações, consulta, andamentos, **cópia integral de autos**, **protocolo (peticionamento)** e habilitação. Atende PJe, Projudi, e-SAJ e eproc [V: Postman público e configuração em https://intima.ai/] | Tabela de "preços por ação" no site (ex.: protocolo 38, cópia 15, intimação 10), **sem unidade monetária explícita** [N] | Único que oferece peticionamento por API. O modelo é robótico, com a credencial e o 2FA do advogado. Ver risco na seção 4. |
| **Jusbrasil Soluções** | Absorveu a Digesto ("Digesto agora é Jusbrasil Soluções") [V: https://www.digesto.com.br/] | [N] | Página de soluções devolveu 403 a robô. |
| **Codilo** | — | — | Site "pausado" (página padrão da Umbler) em 31/10/2026 [V]. **Risco de descontinuidade.** |
| **Infosimples** | Consultas e certidões (CNDT, protestos etc.) | R$ 0,20 a 0,09 por consulta; franquia mínima de R$ 100/mês [V] | Bom para certidões com captcha. Exige due diligence do fornecedor. |
| Predictus, Kurier | — | [N] | Não confirmados. |

**Comprar ou construir, por capacidade:**

| Capacidade | Construir (fonte oficial) | Comprar | Recomendação |
|---|---|---|---|
| Publicações e intimações (TJSC, TRF4, TRT12) | DJEN, consulta e **caderno**: grátis, completo e oficial | Judit DJEN R$ 1,35 por processo por mês | **Construir** (caderno). |
| Movimentações | DataJud: grátis, mas com atraso de 5 a 25 dias e risco de uso comercial | Judit R$ 1,50 por processo por mês, em tempo real | Construir com DataJud + DJEN. **Comprar** só para clientes que pedirem andamento "D+0". |
| Novas ações contra o cliente (por CPF/CNPJ) | Sem fonte oficial aberta (o DataJud não tem partes; o datalake exige convênio) | Judit R$ 15 por entidade por mês + R$ 0,25 por processo | **Comprar** (premium por cliente monitorado). |
| Íntegra dos autos | Sem canal oficial aberto. MNI só com ofício. | Judit R$ 3,50 por processo; Escavador e Intima.ai com credencial | Avaliar a compra **sob demanda** e repassar o custo. |
| Peticionamento | Não há API para terceiros (Jus.br é só para tribunais) | Intima.ai (robótico) | **Não fazer agora.** Gerar o DOCX/PDF pronto e deixar o protocolo com o advogado. |
| Certidões | Captcha na maioria | Infosimples | Fluxo assistido. Comprar se houver demanda em lote. |

---

## 4. Riscos transversais

1. **Uso comercial do DataJud** (Portaria CNJ 374/2026, art. 4º) [V]. Ação: parecer jurídico, citação da fonte na interface e redução da dependência.
2. **Robôs e credenciais de advogado** (Portaria CNJ 316/2024, art. 9º, com redação da Portaria 442/2026) [V]. Tribunais e conselhos podem bloquear "rotinas automatizadas que simulem o comportamento humano", "operações simultâneas" e "consulta sistemática a processos sem relação direta com o usuário". Os agregadores que guardam credencial e 2FA do advogado (Intima.ai, Escavador e Judit com cofre) transferem esse risco **para a conta do próprio advogado**. Ação: se integrar, deixar claro em termo e oferecer só sob demanda.
3. **WAF do TJSC** [V]. O portal classificou meus GETs simples como `_BOT` e bloqueou o IP temporariamente, inclusive para links de documentos públicos vindos do DJEN. Ação: o servidor do Decreta **não deve** acessar `*.tjsc.jus.br`. Links de inteiro teor devem abrir no navegador do usuário.
4. **Domicílio: ciência automática** [V]. Abrir o inteiro teor pela API dispara a ciência. Ação: nunca abrir automaticamente.
5. **WhatsApp: custos e política** [V]. Desde 01/10/2026, a cobrança de serviço começa depois de 1.000 mensagens. A migração para BRL vai até 06/2027. O bot precisa continuar "incidental".
6. **CNPJ alfanumérico** [V citação / N data]. Revisar validações.
7. **Fornecedor descontinuado** (Codilo, site pausado) [V]. Preferir fornecedores com preço e documentação públicos.

---

## 5. Recomendações

### Integre já (alto retorno, baixo risco)

1. **Ingestão diária dos cadernos do DJEN** (TJSC, TRF4, TRT12 e, por conta dos recursos, STJ, TST e STF). Faça a chamada depois das 03:00, confira o SHA-256 e reprocesse quando `versao` subir (cancelamentos). Cruze localmente por OAB, por nome e documento dos clientes cadastrados e por número de processo. Use `/comunicacao/tribunal` como *health-check*: alerte quando um tribunal ficar sem enviar. Guarde a **certidão de publicação** (`/certidao`) junto da intimação, como prova de prazo. Esforço **P a M**.
2. **Módulo de atualização monetária** com SGS, SIDRA e Taxa Legal. Comece por:
   - (a) débito civil pela Lei 14.905 (IPCA + Taxa Legal, juro zero quando negativo);
   - (b) condenação da Fazenda (SELIC pela EC 113; requisitórios por IPCA + 2% a.a. limitado à SELIC, pela EC 136/2025);
   - (c) índices "livres" (INPC, IGP-M, IPCA-E) para cláusulas contratuais.
   - Gere a memória de cálculo em DOCX, que é ponto forte do Decreta. Esforço **M**.
3. **Quadro de taxa média do Bacen** (Olinda) para a petição revisional: taxa contratada × média do mês e da modalidade, no próprio banco e no mercado. Esforço **P**.
4. **Cobrança de honorários** via **Asaas** (Pix Automático, boleto e NFS-e na mesma API). Alternativa: Efí. Evite Stripe para recorrência. Esforço **M**.
5. **Assinatura eletrônica** de contratos de honorários e procurações via **ZapSign** (API no plano Equipe, a partir de R$ 69,90/mês) ou Clicksign. Esforço **P**.
6. **Compliance no cadastro de cliente** pelo Portal da Transparência (CEIS, CNEP, PEP). Esforço **P**.
7. **Ajuste do WhatsApp** à tabela de outubro de 2026: o resumo vai como template de utilidade (R$ 0,035) e as respostas ficam dentro da janela, que tem 1.000 mensagens de serviço grátis por mês. Prepare a migração para BRL. Esforço **P**.

### Avalie (bom potencial, mas depende de decisão ou de terceiros)

- **Judit** como camada paga e opcional: novas ações por CPF/CNPJ de clientes, andamento em tempo real e autos sob demanda. O piso de R$ 1 mil/mês só compensa com escala.
- **Domicílio Judicial Eletrônico** para clientes PJ: o cliente gera a credencial e o Decreta lê sem dar ciência.
- **Assinatura ICP-Brasil**: A1 no servidor com `@signpdf` + `pkijs`; A3 no navegador com Lacuna Web PKI (licença).
- **Transcrição** de atendimentos e audiências: US$ 0,003 a 0,006 por minuto.
- **Agenda** (Google e Microsoft) para prazos e audiências.
- **Nichos**: ANS (planos de saúde), consumidor.gov.br e INPI (RPI XML).
- **Ofício ao TJSC e ao TRF4 pedindo MNI** quando houver base de clientes. É longo prazo e institucional.
- **GeCli e datalake do CNJ**: acompanhar. Hoje os requisitos de escala (200 mil usuários por mês) são inviáveis.
- **Infosimples** para certidões em lote, se a demanda justificar.

### Evite

- **DataJud como fonte de prazo** ou como base de "produto de dados". Os motivos são o atraso e a vedação de uso comercial.
- **Raspagem** de eproc, PJe, portais de certidão e CNA/OAB, por causa do WAF, do captcha, da Portaria 316, art. 9º, e do provimento da OAB.
- **Resolver captcha** (CNDT, Receita, TRF4, CRC, CENPROT).
- **API de assinatura gov.br**: não está disponível para empresas privadas.
- **Stripe para Pix Automático**: indisponível para empresas no Brasil.
- **Integrar o PJe-Calc**: é desktop, Windows e offline, sem API. No máximo, anexe o `.PJC`.
- **Codilo**: site fora do ar.
- **Peticionamento robótico** (Intima.ai e similares) **como recurso nativo**, enquanto não houver avaliação jurídica do risco para a credencial do advogado.

---

## 6. Fontes

**Judiciário (CNJ e tribunais)**
- DataJud, wiki da API Pública: https://datajud-wiki.cnj.jus.br/api-publica/ · Acesso/APIKey: https://datajud-wiki.cnj.jus.br/api-publica/acesso/ · Endpoints: https://datajud-wiki.cnj.jus.br/api-publica/endpoints/ · Glossário: https://datajud-wiki.cnj.jus.br/api-publica/glossario/ · Paginação: https://datajud-wiki.cnj.jus.br/api-publica/exemplos/exemplo3 · Termo de uso: https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/ · Considerações finais: https://datajud-wiki.cnj.jus.br/api-publica/consideracoes_finais/
- API DataJud (GETs de teste): https://api-publica.datajud.cnj.jus.br/api_publica_tjsc/_search (e trf4, trt12)
- Portaria CNJ 374/2026: https://atos.cnj.jus.br/atos/detalhar/6972
- Portaria CNJ 316/2024 (texto compilado com a Portaria 442/2026): https://atos.cnj.jus.br/atos/detalhar/5792
- DJEN, OpenAPI: https://comunicaapi.pje.jus.br/swagger/djen.yml · Swagger UI: https://comunicaapi.pje.jus.br/swagger/index.html · GETs: `/api/v1/comunicacao`, `/api/v1/comunicacao/tribunal`, `/api/v1/caderno/TJSC/2026-10-30/D`, `/api/v1/caderno/TRT12/2026-10-29/D`, `/api/v1/comunicacao/{hash}/certidao`
- Domicílio Judicial Eletrônico (PDPJ): https://docs.pdpj.jus.br/servicos-negociais/domicilio-judicial-eletronico/
- Alerta de credenciais do Domicílio (TRT12, 01/12/2025): https://portal.trt12.jus.br/noticias/cnj-alerta-para-atualizacao-no-domicilio-judicial-eletronico
- GeCli: https://docs.pdpj.jus.br/servicos-negociais/GeCli · https://gestao-clientes.pdpj.jus.br
- Jus.br / Portal de Serviços: https://docs.pdpj.jus.br/portal-servicos · https://docs.pdpj.jus.br/servicos-negociais/portal-servicos/introducao · https://docs.pdpj.jus.br/servicos-negociais/portal-servicos/pet-inicial · https://docs.pdpj.jus.br/servicos-negociais/portal-servicos/pet-intercorrente
- MNI no TRF1: https://trf1.jus.br/trf1/conteudo/NUGTI/MNI_Orientações.pdf
- MNI e acesso automatizado no TJES: https://www.tjes.jus.br/portal-transparencia/tecnologia-da-informacao-e-comunicacao/acesso-automatizado-por-sistemas-externos/
- Integração para os tribunais (CNJ): https://www.cnj.jus.br/integracao-para-os-tribunais/ [T]
- PJe-Calc Cidadão no TRT12: https://portal.trt12.jus.br/pjecalccidadao · TRT15: https://trt15.jus.br/pje/pje-calc-cidadao-instalacao [T]

**Cálculos**
- BCB SGS (GETs): https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json (e 188, 10764, 11, 4390, 226, 7811, 12, 189, 1178, 1619, 29541, 29542, 29543)
- BCB Olinda, taxas de juros: https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/
- IBGE SIDRA: https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/last%201 · https://apisidra.ibge.gov.br/values/t/1736/n1/all/v/44/p/last%201
- Ipeadata: http://www.ipeadata.gov.br/api/odata4/Metadados('MTE12_SALMIN12')
- Lei 14.905/2024: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14905.htm
- EC 136/2025: https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc136.htm
- Comissão do Manual de Cálculos do CJF: https://www.cjf.jus.br/cjf/corregedoria-da-justica-federal/corregedoria-geral-da-justica-federal/comissao_manual_de_calculos [T]
- Taxa Legal, séries SGS (secundária): https://gilbertomelo.com.br/taxa-legal-e-divulgada-mensalmente-no-banco-central/ [T]

**Assinatura e identidade**
- Manual de integração da assinatura gov.br: https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt-br/latest/iniciarintegracao.html
- ITI, assinatura avançada: https://www.gov.br/iti/pt-br/assuntos/assinatura-eletronica-avancada [T]
- node-signpdf: https://github.com/vbuch/node-signpdf · npm `@signpdf/signpdf` · npm `web-pki` · npm `pkijs`
- Fortify (arquivado): https://github.com/PeculiarVentures/fortify
- ZapSign: https://www.zapsign.com.br/hubfs/llms.txt · Clicksign: https://www.clicksign.com/planos · DocuSign: https://ecom.docusign.com/plans-and-pricing/developer
- Serpro Consulta CPF v3: https://www.serpro.gov.br/menu/noticias/noticias-2026/nova-versao-da-consulta-cpf [T]

**Cartórios e certidões**
- CNDT: https://cndt-certidao.tst.jus.br/gerarCertidao · Receita: https://servicos.receitafederal.gov.br/servico/certidoes/ · TRF4: https://www2.trf4.jus.br/trf4/processos/certidao/index.php
- CRC: https://www.registrocivil.org.br/ · CENPROT (consulta): https://www.pesquisaprotesto.com.br/ · CENSEC: https://www.censec.org.br/ · ONR: https://registradores.onr.org.br/ · e-Notariado: https://www.e-notariado.org.br/
- Infosimples, preços: https://infosimples.com/consultas/precos/

**Dados públicos**
- Portal da Transparência, OpenAPI: https://api.portaldatransparencia.gov.br/v3/api-docs · cadastro de chave: https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email [T limites]
- ANS PDA: https://dadosabertos.ans.gov.br/FTP/PDA/ · consumidor.gov.br: https://www.consumidor.gov.br/pages/dadosabertos/externo/ · INPI RPI: https://revistas.inpi.gov.br/rpi/
- CNA: https://cna.oab.org.br/ [T sobre restrições]

**Comunicação e cobrança**
- WhatsApp, preços e planilhas de tarifas (BRL e USD, vigência 01/10/2026): https://developers.facebook.com/docs/whatsapp/pricing/
- Meta Terms for WhatsApp Business Platform (cláusula 4.7): https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform
- Cobertura da política de IA [T]: https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform · https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
- Asaas: https://www.asaas.com/precos-e-taxas · https://docs.asaas.com/docs/pix-automatico
- Efí: https://dev.efipay.com.br/docs/api-pix/pix-automatico
- Stripe Pix: https://docs.stripe.com/payments/pix
- NFS-e Nacional: https://www.gov.br/nfse/pt-br · https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
- LC 214/2025: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
- OpenAI, preços: https://platform.openai.com/docs/pricing

**Agregadores**
- Judit, preços: https://judit.io/precos · docs: https://docs.judit.io/llms.txt
- Escavador API v2: https://api.escavador.com/v2/docs/
- Intima.ai: https://intima.ai/ · Postman: https://documenter.getpostman.com/view/11707205/2sBYHVwzB2
- Digesto → Jusbrasil Soluções: https://www.digesto.com.br/
- Codilo (site pausado): https://www.codilo.com.br/
