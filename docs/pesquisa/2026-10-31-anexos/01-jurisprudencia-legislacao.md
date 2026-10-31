# Fontes públicas de jurisprudência, precedentes e legislação: o que dá para usar no Decreta

**Data da pesquisa:** 31/10/2026  ·  **Escopo:** fontes públicas (STF, STJ, TST/TRTs, TRF4, TJSC e outros TJs, CNJ, legislação federal/estadual/municipal, datasets, agregadores, aspectos legais) e desenho de "jurisprudência verificada".

**Legenda de verificação usada em todo o documento**

- **[V]** verificado por mim na fonte primária em 31/10/2026 (GET simples à página/endpoint oficial, leitura do JSON/CSV/HTML retornado ou do texto legal oficial).
- **[T]** segundo terceiros (README de projeto open source, notícia, blog, artigo). Não confirmei diretamente.
- **[NV]** não consegui verificar (bloqueio, falha de conexão, ou o orçamento de buscas web da sessão acabou; ver "Limitações desta pesquisa" no fim).

Regras seguidas: só GET a páginas e endpoints públicos, sem login, sem criar conta, sem resolver captcha e sem contornar WAF. Quando aparecia desafio anti-robô, parei e anotei.

---

## 1. Resumo executivo

1. **A melhor base pública e legalmente limpa para começar é o Portal de Dados Abertos do STJ** [V]: CKAN com API, licença **CC BY**, três famílias de dados úteis: (a) **íntegras** de decisões terminativas e acórdãos (ZIP de textos + JSON de metadados), atualizadas diariamente (cerca de 2,6 mil documentos por dia de publicação; observei atraso de ~2 semanas entre a publicação no DJe e a carga); (b) **espelhos de acórdãos** por órgão julgador (JSON mensal com ementa, relator, tese, tema, referências legislativas); (c) **precedentes qualificados** (Temas.csv/Processos.csv, atualizados em 25/10/2026). Há ainda uma carga histórica 2008–2020 sendo publicada em outubro de 2026.
2. **O Banco Nacional de Precedentes do CNJ (Pangea/BNP) é a fonte única mais valiosa para "precedente qualificado verificado"** [V parcial]: a Res. CNJ 444/2022 o institui "para consulta e divulgação por órgãos e pelo público em geral". O front oficial `pangeabnp.pdpj.jus.br` expõe um JSON público sem autenticação (`GET /api/v1/parametros` verificado; a busca é `POST /api/v1/precedentes`, não documentada) cobrindo **93 órgãos**, incluindo **TJSC, TRT12 e TRF4**, e as espécies RG, SV, súmulas, repetitivos, IRR, IRDR, IAC, OJ. Atualização: duas vezes por mês [V, manual oficial]. A API "oficial" de integração exige credenciais do SSO da PDPJ, emitidas pelo CNJ a tribunais [V].
3. **Legislação federal tem caminho excelente e documentado**: API de Dados Abertos do Senado (metadados, publicação no DOU, alterações) + **normas.leg.br** (texto compilado em JSON-LD com **identificadores por dispositivo**, por exemplo `...;13105!art927_par5`, licença declarada **CC BY 4.0**) [V]. Isso permite **checar automaticamente se "art. X, § Y, da Lei Z" existe e qual é o texto**. Ressalva: o portal marca o texto como sem valor legal oficial (o oficial é o DOU) [V].
4. **Vários portais de busca estão bloqueados para automação** e devem ser tratados como inviáveis: **TJSC** (captcha de imagem "Verificação de segurança do portal institucional") [V], **TJSP e-SAJ** (reCAPTCHA v3) [V], **STJ SCON em scon.stj.jus.br** (desafio Cloudflare) [V], **LexML SRU** (página "Verificação de segurança — Senado Federal" com prova de trabalho em JavaScript) [V], **STF** (busca de jurisprudência atrás de desafio AWS WAF) [T, duas fontes independentes], **Jurisprudência Nacional da JT/Falcão** (403 do CloudFront para requisição automatizada) [V] e **TST** (robots.txt `Disallow: /`) [V].
5. **Lacuna principal para o piloto em SC**: não há fonte automatizável e legítima para o **inteiro teor do TJSC e do TRT12**. Para eles, o que existe é a camada de **precedentes qualificados via BNP** (IRDR, IAC, súmulas, OJs). Para o TRF4, o formulário eproc de jurisprudência responde sem captcha [V], mas é HTML via POST e há relato de bloqueio geográfico fora do Brasil [T].
6. **STF**: não achei API nem dump de íntegras. O que é aproveitável: a **planilha estruturada do Informativo STF** (XLSX, 11.637 linhas, até a edição 1234, com tese, resumo, legislação e tema de RG) [V] e a lista de **todos os temas de repercussão geral** [V]; RG/SV/súmulas também chegam pelo BNP.
7. **Atenção de compliance fora do escopo, mas grave**: os **termos de uso da API pública do DataJud** (que o Decreta já usa) dizem que ela é fornecida "exclusivamente para fins legais, não comerciais e autorizados" (cl. 3.3) e vedam "explorar comercialmente a API ou qualquer informação derivada dela" (cl. 3.8) [V]. Isso precisa de avaliação jurídica.
8. **Juridicamente, coletar decisões é defensável**: decisões judiciais e atos oficiais **não são objeto de proteção autoral** (Lei 9.610/98, art. 8º, IV) [V]; a LAI exige que sítios públicos permitam "acesso automatizado por sistemas externos em formatos abertos" (Lei 12.527/2011, art. 8º, § 3º, III) [V]; o CPC manda os tribunais darem publicidade aos precedentes na internet (art. 927, § 5º) [V]. Os limites são: **bases de dados de agregadores privados são protegidas** (LDA art. 7º, XIII, e art. 87) [V]; **captcha/WAF** sinalizam vedação técnica; **LGPD** (art. 7º, §§ 3º e 4º) [V] e termos específicos (DataJud).
9. **Alucinação é risco real e já punido no Brasil**: TJSC (6ª Câmara Civil) multou em 10% do valor da causa um recurso com jurisprudência e doutrina inexistentes geradas com ChatGPT (fev/2025) [V]; a 6ª Turma do TST multou empresa e advogado por precedentes falsos (mar/2026) [V]. Estudos de Stanford mostram LLMs gerais alucinando de 58% a 88% em perguntas verificáveis sobre casos [V, resumo] e ferramentas jurídicas comerciais com RAG ainda alucinando de 17% a 33% [V, resumo].
10. **Desenho recomendado**: o modelo **nunca escreve número, relator ou ementa**. Ele só cita por `doc_id` de documentos recuperados do **Acervo Verificado** (Postgres); o servidor renderiza a citação a partir do banco, confere trechos literais e roda um segundo passo de "a fonte sustenta a afirmação?". Tudo que não estiver no acervo aparece como **"não verificada"**. Ordem de implantação: (1) legislação federal + precedentes qualificados (BNP, STJ Temas, STF RG/Informativo); (2) STJ espelhos + íntegras; (3) TRF4 sob demanda e alternativas para TJSC/TRT12 (pedido formal, convênio ou corpus de terceiros só como apoio). MVP estimado em **5 a 7 semanas de 1 dev**.

---

## 2. Tabela de fontes

Viabilidade: **Alta** = API ou dump oficial, sem bloqueio; **Média** = funciona, mas não documentado, frágil ou com restrição; **Baixa** = bloqueio técnico, termos restritivos ou cobertura pobre; **Inviável** = captcha (regra do projeto).

| # | Fonte | URL / endpoint | Cobre | Formato | Auth | Limites | Licença / termos | Atualização | Captcha/WAF | Viab. | Esforço | Verif. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | STJ Dados Abertos: íntegras 2021+ | `dadosabertos.web.stj.jus.br/dataset/integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica` (CKAN `/api/3/action/package_show`) | Íntegras de decisões terminativas e acórdãos publicados no DJe (sem segredo de justiça) | ZIP (textos) + JSON (metadados) + CSV (dicionário) | Nenhuma | Não declarados | CC BY | Diária (arquivo AAAAMMDD); atraso observado ~2 semanas | Não | **Alta** | 5–8 dias | V |
| 2 | STJ Dados Abertos: íntegras 2008–2020 | `.../dataset/integras-de-decisoes-terminativas-e-acordaos-2008-2020` | Idem, histórico | ZIP + JSON | Nenhuma | — | CC BY | Carga em andamento (out/2026, já em 2019) | Não | Alta | +2 dias | V |
| 3 | STJ Dados Abertos: espelhos de acórdãos (10 órgãos) | `.../dataset/espelhos-de-acordaos-<orgao>` | Ementa, relator, órgão, decisão, tese, tema, referências legislativas, acórdãos similares | JSON mensal (1º arquivo ZIP com histórico) + CSV dicionário | Nenhuma | — | CC BY | Mensal (arquivo 20260930 publicado em 29/10/2026) | Não | **Alta** | 3–4 dias | V |
| 4 | STJ Dados Abertos: precedentes qualificados | `.../dataset/precedentes-qualificados` (Temas.csv, Processos.csv) | Temas repetitivos, controvérsias, IAC, PUIL, SIRDR, relevância; questão, tese, situação | CSV | Nenhuma | — | CC BY | Arquivo substituído no mesmo URL (última: 25/10/2026) | Não | **Alta** | 1–2 dias | V |
| 5 | CNJ Pangea/BNP (front público) | `pangeabnp.pdpj.jus.br/api/v1/parametros` (GET), `/api/v1/precedentes` (POST) | Precedentes qualificados de 93 órgãos (STF, STJ, TST, TNU, TRFs, TJs, TRTs): questão, tese, situação, suspensões, processos-paradigma | JSON | Nenhuma | Não declarados | Res. CNJ 444/2022 (consulta pelo público); API não documentada | 2x/mês | Não | **Média-alta** | 3–5 dias | V (GET) / T (POST) |
| 6 | CNJ BNP (API de integração) | `bnp-sempj.cloud.pje.jus.br` (Swagger), SSO PDPJ | Mesmo conteúdo, interface oficial para tribunais | JSON | OAuth2 client credentials emitidas pelo CNJ | — | Institucional | — | — | Baixa (acesso restrito) | — | V (doc) |
| 7 | STF Informativo (planilha) | `stf.jus.br/arquivo/cms/informativoSTF/anexo/Informativo_Dados/Dados_InformativosSTF.xlsx` | 11.637 julgados noticiados: classe/número, relator, tese, resumo, legislação, tema RG | XLSX (9,4 MB) | Nenhuma | — | Reprodução permitida com citação da fonte e sem alteração (página do Informativo) | Por edição (última: 1234/2026) | Não | **Alta** | 1–2 dias | V |
| 8 | STF temas de RG | `portal.stf.jus.br/jurisprudenciaRepercussao/todostemas.asp` | Lista de temas de repercussão geral | HTML | Nenhuma | — | Não declarada | Contínua | Não (respondeu 200) | Média | 1–2 dias | V |
| 9 | STF busca de jurisprudência | `jurisprudencia.stf.jus.br` (SPA) → `POST /api/search/search` | Acórdãos e decisões, ementa, link para inteiro teor (PDF) | JSON (Elasticsearch) | Cookie de desafio AWS WAF | — | Não declarada | Contínua | **Sim (WAF)** | **Baixa** | — | T |
| 10 | STF Corte Aberta | `transparencia.stf.jus.br` | Painéis estatísticos, CSV/XLSX de listas de decisões (não íntegras) | CSV/XLSX via painel | Nenhuma | — | — | — | 403 para cliente automatizado | Baixa | — | V (403) / T |
| 11 | STJ SCON (busca) | `scon.stj.jus.br/SCON` | Acórdãos, súmulas, JT em Teses, Pesquisa Pronta | HTML | — | — | — | — | **Sim (Cloudflare challenge)** | **Inviável** | — | V |
| 12 | STJ SCON (host alternativo) | `processo.stj.jus.br/SCON` | Mesma base | HTML (POST) | — | — | — | — | Carrega script do Google reCAPTCHA | Baixa | — | V (200 + script) / T (POST) |
| 13 | TST jurisprudência | `jurisprudencia.tst.jus.br`; backend `jurisprudencia-backend2.tst.jus.br` | Acórdãos, súmulas, OJs | SPA/JSON | — | — | robots.txt `Disallow: /` | — | — | **Baixa** | — | V (robots, 503) / T |
| 14 | JT "Falcão" (Jurisprudência Nacional) | `jurisprudencia.jt.jus.br/jurisprudencia-nacional/` | TST + 24 TRTs (inclui TRT12), integra BNP | JSON (backend no-auth) | sessionId aleatório | 200 resultados por consulta anônima; bloqueios de horas | — | Contínua | 403 do CloudFront para automação / IPs de datacenter | **Baixa** | — | V (403) / T |
| 15 | TRF4 jurisprudência (eproc) | `jurisprudencia.trf4.jus.br/eproc2trf4/externo_controlador.php?acao=jurisprudencia@jurisprudencia/pesquisar` | TRF4, TRU4, Turmas Recursais RS/SC/PR | HTML (POST) | Nenhuma | — | — | Contínua | Não detectado | Média | 3–5 dias | V (200) / T (POST, geobloqueio) |
| 16 | TJSC jurisprudência | `busca.tjsc.jus.br/jurisprudencia/` | Acórdãos TJSC | HTML | — | — | — | — | **Sim (captcha de imagem)** | **Inviável** | — | V |
| 17 | TJSP e-SAJ (cjsg) | `esaj.tjsp.jus.br/cjsg/consultaCompleta.do` | 2º grau TJSP | HTML | — | — | — | — | **Sim (reCAPTCHA v3)** | **Inviável** | — | V |
| 18 | TJMG API | `jurisprudencia-api.tjmg.jus.br` (OpenAPI em `/v3/api-docs`) | Acórdãos com ementa; inteiro teor parcial | JSON | OpenAPI declara OAuth2; consulta respondeu sem token | totalRecords satura em 1.000 | — | Contínua | Não | Média (fora de SC) | — | V (OpenAPI) / T |
| 19 | TJRS | `www.tjrs.jus.br/buscas/jurisprudencia/ajax.php` (POST) | Acórdãos e monocráticas com íntegra | JSON (Solr) | Nenhuma | — | — | Contínua | Não detectado | Média (fora de SC) | — | V (página) / T |
| 20 | TJPR | `portal.tjpr.jus.br/jurisprudencia/` | Acórdãos TJPR | HTML | — | — | — | — | Não detectado na página inicial | Desconhecida | — | V (200) |
| 21 | Senado: legislação federal | `legis.senado.leg.br/dadosabertos/legislacao/...` (OpenAPI `/dadosabertos/v3/api-docs`) | Metadados de todas as normas federais, publicação no DOU, alterações ("vides") | JSON/XML | Nenhuma | >10 req/s → 429 [T] | Dados abertos | Contínua | Não | **Alta** | 2–3 dias | V |
| 22 | normas.leg.br | `normas.leg.br/api/public/normas?urn=...&tipo_documento=maior-detalhe` (OpenAPI `/v3/api-docs`) | Texto compilado por dispositivo (artigo, parágrafo, inciso) | JSON-LD (schema.org Legislation) + HTML do binário | Nenhuma | — | CC BY 4.0 (declarada no JSON); texto "sem valor legal oficial" | Contínua | Não | **Alta** | 3–4 dias | V |
| 23 | LexML resolvedor URN | `www.lexml.gov.br/urn/urn:lex:...` | Página da norma por URN (federal, estadual, municipal) | HTML | Nenhuma | robots: Crawl-delay 5 | — | — | Não (no /urn) | Média | 1 dia | V |
| 24 | LexML SRU (busca) | `www.lexml.gov.br/busca/SRU` | Busca federada de normas, jurisprudência, doutrina | XML (SRU) | — | robots: `Disallow: /busca/` | — | — | **Sim (verificação de segurança)** | **Inviável** | — | V |
| 25 | Planalto | `www.planalto.gov.br/ccivil_03/...` | Texto compilado oficial do Executivo | HTML | — | — | — | — | Tempo esgotado sem resposta | Baixa | — | V (timeout) / T |
| 26 | Câmara: API v2 | `dadosabertos.camara.leg.br/api/v2/...` | Proposições (projetos), não normas vigentes | JSON | Nenhuma | — | Dados abertos | Contínua | Não | Alta (pouco útil aqui) | — | V |
| 27 | DOU dados abertos | `www.in.gov.br/acesso-a-informacao/dados-abertos/base-de-dados` | Atos do DOU 2002→ | XML mensal em ZIP | Nenhuma | — | CC BY-ND 3.0 [T] | Mensal (1ª terça) [T] | — | Média | 2–3 dias | NV (conexão encerrada) / T |
| 28 | INLABS (Imprensa Nacional) | `inlabs.in.gov.br` + scripts em `github.com/Imprensa-Nacional/inlabs` | DOU do dia (PDF e XML), últimos 4 meses | XML/PDF | Cadastro gratuito + login | — | Livre e gratuito desde 01/01/2020 | Diária | Não [T] | Média-alta | 2 dias | V (README, página) |
| 29 | DOM/SC (CIGA) | `dados.ciga.sc.gov.br` (CKAN, pacotes `domsc-publicacoes-de-MM-AAAA`) | Diário Oficial dos Municípios de SC | ZIP (3 lotes/dia) | Nenhuma | — | Licença não declarada (campo nulo) | 3x/dia (lote de 31/10/2026 já publicado) | Não | Média-alta (para atos municipais) | 3–4 dias | V |
| 30 | Querido Diário (OKBR) | `api.queridodiario.ok.org.br` | Diários municipais raspados | JSON | Nenhuma [T] | — | Código MIT; dados sem licença declarada | — | — | Média | 2 dias | NV (falha TLS daqui) / V (GitHub) |
| 31 | ALESC (leis de SC) | `leis.alesc.sc.gov.br/legislativo` | Legislação estadual de SC | HTML (app Next.js) | Nenhuma | — | — | — | Não detectado | Baixa-média | 3–5 dias | V (200) |
| 32 | DataJud (CNJ) | `api-publica.datajud.cnj.jus.br/api_publica_<tribunal>/_search` | Só metadados processuais (sem ementa) | JSON | Chave pública | — | **Fins não comerciais; vedada exploração comercial** | — | Não | Baixa para este uso | — | V (termos) |
| 33 | RepoJus (Hugging Face) | `huggingface.co/datasets/andrebadini/repojus` | 9,85 mi decisões de 48 órgãos + 159.557 normas | Parquet | Nenhuma | — | CC BY 4.0 | Snapshot v3 de 30/10/2026 | — | Média (apoio, não fonte de verdade) | 2–3 dias | V (cartão) |
| 34 | Jurisprudências.ai (agregador) | `jurisprudencias.ai` | 54 tribunais (inclui TJSC, TRF4; **não inclui TRT12**) | JSON (API no plano pago) | Token | 500 buscas/dia no plano pago | Termos em `/terms` (não lidos) | — | — | Média (comparação) | 1–2 dias | V (página) |

---

## 3. Detalhe por fonte

### 3.1 STF

**O que existe e funciona**

- **Planilha do Informativo STF** [V]. A página do Informativo aponta para `https://www.stf.jus.br/arquivo/cms/informativoSTF/anexo/Informativo_Dados/Dados_InformativosSTF.xlsx`, descrita como planilha estruturada de todas as edições. Baixei por GET simples (200, 9,4 MB). A planilha tem 11.637 linhas e as colunas: Informativo, Classe Processo, Número Processo, Incidente Julgamento, UF, Observação, Data Julgamento, Relator, Redator Acórdão, Órgão Julgador, Tipo Julgamento, Situação Julgamento, Título, Tese Julgado, Resumo, Notícia, Ramo Direito, Matéria, Repercussão Geral, Tema RG, Legislação, ODS ONU 2030, Covid-19, Notícia completa. A última edição citada na página é a 1234/2026. A página informa que a reprodução é permitida com citação da fonte e sem alteração do conteúdo (resumo da página via WebFetch).
  - Uso no Decreta: base curada dos julgados mais relevantes do STF, com tese e tema RG, ótima para "precedentes do STF sobre X". Viabilidade alta, esforço 1–2 dias.
- **Lista de todos os temas de repercussão geral** em `https://portal.stf.jus.br/jurisprudenciaRepercussao/todostemas.asp` [V, respondeu 200 a GET simples]. A página de RG (`portal.stf.jus.br/repercussaogeral/`) também lista teses (`/repercussaogeral/teses.asp`) e temas de IAC [V, via WebFetch]. Não há CSV/XLSX oficial de temas na página [V].
- **robots.txt** de `portal.stf.jus.br`: só `Disallow: /processos` para todos os agentes [V].

**O que não funciona para automação**

- **Busca de jurisprudência** (`jurisprudencia.stf.jus.br`). A SPA carrega (200) [V], mas a API por trás (`POST /api/search/search`, corpo Elasticsearch) está atrás de **desafio AWS WAF** em JavaScript [T]: relato em issue do projeto mcp-brasil, testado em 01/08/2026, com HTTP 202 e cabeçalho `x-amzn-waf-action: challenge` (https://github.com/Mcp-Brasil/mcp-brasil/issues/26); e ficha do repositório `edilsonfs/apis-publicas-tribunais-orgaos` (verificada pelos autores em 12/10/2026), que diz que só funciona com navegador real com janela (headless recebe 403) e cookie de ~4 dias. Não testei o POST (regra de só GET). **Conclusão: inviável para produção**; contornar WAF não é aceitável.
- **Corte Aberta** (`transparencia.stf.jus.br`): respondeu **403** à minha requisição simples [V]. O programa foi lançado em 11/05/2022, com painéis e download em CSV, dados desde 2000 [V, notícia do STF: https://noticias.stf.jus.br/postsnoticias/stf-lanca-programa-corte-aberta-com-ampla-base-de-dados-e-maior-transparencia-aos-cidadaos/]. É estatística e lista de decisões, **não íntegras**. A Base dos Dados tem um espelho "Corte Aberta" com 1 tabela, atualizado pela última vez em 14/02/2024 [V, `backend.basedosdados.org/search/?q=stf`], ou seja, desatualizado.
- **Não encontrei API pública nem download em lote de íntegras do STF** [V negativo: portal de RG, Informativo, notícia do Corte Aberta, buscas].

**Súmulas e Súmulas Vinculantes**: o BNP lista para o STF as espécies SV, SUM, RG e controle concentrado (ADI, ADC, ADO, ADPF) [V, `/api/v1/parametros`, `gruposEspecies` id 1]. É o caminho recomendado. O corpus é pequeno (súmulas e SVs somam algumas centenas), então uma curadoria manual inicial também é viável.

**Viabilidade geral STF**: alta para Informativo, RG e súmulas (via BNP/planilha); baixa para inteiro teor.

### 3.2 STJ

**Portal de Dados Abertos** (`https://dadosabertos.web.stj.jus.br/`), CKAN com API [V]. `package_list` retornou 22 conjuntos, entre eles 10 de espelhos, 2 de íntegras, precedentes qualificados, pautas futuras, atas de distribuição e acervo em tramitação.

- **Íntegras 2021+** (`integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica`) [V]:
  - Licença `cc-by` ("Creative Commons Atribuição"), `isopen: true`; 2.648 recursos; metadados modificados em 28/10/2026.
  - Descrição oficial: monocráticas indicadas pelos gabinetes como terminativas e acórdãos, no processo principal ou em petições (AgInt, AgRg, EDcl, EREsp, PET etc.); ZIP com textos + JSON de metadados + CSV dicionário; atualização diária com o arquivo do dia anterior (AAAAMMDD); datas em milissegundos desde 1970; **sem processos em segredo de justiça**.
  - Metadados por documento: `SeqDocumento`, `dataPublicacao`, `tipoDocumento` (DECISÃO/ACÓRDÃO), `numeroRegistro`, `processo` (ex.: "HC 1125968"), `dataRecebimento`, `dataDistribuição`, `NM_MINISTRO`, `recurso` (ex.: AgRg), `teor`, `descricaoMonocratica`, `assuntos` (códigos).
  - Volume: o arquivo de 13/10/2026 tem 2.644 documentos (1.746 decisões e 898 acórdãos).
  - Atraso: o arquivo de 13/10/2026 foi carregado em 24/10 e recarregado em 28/10/2026 (timestamps do CKAN). Na prática, **~2 semanas de defasagem**.
  - Tamanho declarado no CKAN: ~13 GB (2021+).
  - Observação: o JSON de metadados não traz a ementa; ela está no texto do ZIP.
- **Íntegras 2008–2020** [V]: 4.228 recursos, ~10 GB já carregados, carga em andamento (recursos criados entre 17 e 21/10/2026, já em 2019).
- **Espelhos de acórdãos** (Corte Especial, 3 Seções, 6 Turmas) [V]:
  - Descrição oficial: acórdãos cuja ementa traz novidade de tese ou representatividade recebem tratamento documentário da Secretaria de Jurisprudência; primeiro arquivo ZIP com o histórico, depois JSONs mensais; o mesmo acórdão pode aparecer em dois arquivos (deduplicar pelo `id`).
  - Campos do dicionário: `id`, `numeroProcesso`, `numeroRegistro`, `siglaClasse`, `descricaoClasse`, `nomeOrgaoJulgador`, `ministroRelator`, `ementa`, `tipoDeDecisao`, `dataDecisao`, `decisao`, `jurisprudenciaCitada`, `notas`, `informacoesComplementares`, `termosAuxiliares`, `teseJuridica`, `tema`, `referenciasLegislativas`, `acordaosSimilares`, `dataPublicacao`.
  - Exemplo real (Corte Especial, arquivo 20260930, 228 registros): `id 1467416`, "QO na CauInomCrim 111", relator João Otávio de Noronha, `dataDecisao 20260819`, `dataPublicacao "DJEN DATA:01/09/2026"`.
  - Atualização mensal: o arquivo 20260930 foi publicado em 29/10/2026. Tamanho: Terceira Turma ~122 MB no total.
  - **É a melhor fonte para "ementa verificada do STJ"**: o `id` é o identificador da base de jurisprudência do próprio STJ.
- **Precedentes qualificados** [V]: `Temas.csv` (2,6 MB) e `Processos.csv` (1,1 MB), substituídos no mesmo URL (última atualização em 25/10/2026). Colunas de Temas: `sequencialPrecedente`, `tipoPrecedente`, `numeroPrecedente`, `dataPrimeiraAfetacao`, `dataJulgamento`, `dataPublicacaoAcordao`, `situacao`, `informacoesComplementares`, `questaoSubmetidaAJulgamento`, `teseFirmada`, `anotacoesNUGEPNAC`, `delimitacaoJulgado`, `entendimentoAnterior`, `referenciaLegislativa`, `referenciaSumular`, `sumulaOriginada`, `audienciaPublica`, `dataAudienciaPublica`, `orgaoJulgador`, `Assuntos`, `numeroRepercussaoGeralSTF`, `descricaoRepercussaoGeral`. Contagem aproximada por tipo: Tema 1.505, Controvérsia 837, PUIL 27, IAC 23, SIRDR 11. O primeiro registro já mostra o novo tipo de relevância da questão federal (situação "Relevância reconhecida").

**SCON (busca do site)**

- `scon.stj.jus.br`: **403 com `Cf-Mitigated: challenge`** (Cloudflare) [V]. Inviável.
- `processo.stj.jus.br/SCON/`: responde 200 [V]. Projetos de terceiros fazem POST ali sem o Turnstile [T, https://github.com/ivancaron/jurismcp]. Mas a página de súmulas nesse host carrega o script do Google reCAPTCHA [V]. Risco alto de passar a exigir captcha; não recomendo como dependência.
- **Súmulas do STJ**: PDFs oficiais (vigentes, canceladas, todas) ficam no SCON [T, resultado de busca]. Melhor caminho: BNP (o grupo de espécies do STJ inclui SUM, RR, IAC, CT, SIRDR) [V, `/api/v1/parametros`].
- **Jurisprudência em Teses** e **Pesquisa Pronta**: produtos editoriais do STJ publicados no site (quinzenal, segundo o manual interno) [T]. Não estão no portal de dados abertos [V, lista de pacotes]. Para o MVP, não recomendo coletar (só pelo SCON, que tem bloqueio).

**Viabilidade geral STJ**: **alta**. É a fonte-âncora do MVP.

### 3.3 TST e TRTs (TRT12)

- **TST, dados abertos**: a página oficial lista contratos, remuneração, PDTIC e API SIGEST, e indica o DataJud para processos. **Nenhum conjunto de jurisprudência, súmulas, OJs ou IRR** [V, https://www.tst.jus.br/web/acesso-a-informacao/dados-abertos]. Não declara licença.
- **jurisprudencia.tst.jus.br**: robots.txt `User-agent: * / Disallow: /` [V]. `www.tst.jus.br/sumulas` redireciona para essa SPA [V]. O backend `jurisprudencia-backend2.tst.jus.br` respondeu 503 ao GET na raiz [V]; terceiros relatam busca funcional em 07/07/2026 com 3,75 mi acórdãos [T, https://pypi.org/project/br-eli-mcp/]. Como o robots.txt proíbe tudo, considero **baixa** a viabilidade de automação.
- **Falcão / Jurisprudência Nacional da JT** (`https://jurisprudencia.jt.jus.br/jurisprudencia-nacional/home`): reúne decisões de 1º e 2º graus dos 24 TRTs e do TST, integra dados do BNP desde fev/2025, busca básica sem login e recursos avançados com gov.br ouro [V, notícia do TRT2 de 21/02/2025: https://ww2.trt2.jus.br/noticias/noticias/noticia/sistema-falcao-reune-jurisprudencia-do-tst-e-dos-24-trts-do-pais-conheca]. Minha requisição simples recebeu **403 do CloudFront** [V]. Terceiros relatam: API JSON `no-auth` exige `sessionId`, UA de navegador, 403 para IPs de datacenter, limite anônimo de 200 resultados e bloqueios de horas após ~25 chamadas [T, ficha `falcao.md` do repositório edilsonfs]. **Baixa** para servidor em nuvem.
- **TRT12**:
  - Mantém, pela Coordenadoria de Apoio e Gestão de Inteligência, uma **planilha (Google Sheets) com IRDRs e IACs de todos os TRTs** (temas, questões, acórdãos paradigma, legislação) [V, https://portal.trt12.jus.br/node/16665; publicada em 19/02/2024, sem periodicidade declarada].
  - Publica Informativo de Precedentes mensal em PDF (ex.: julho/2026) e notícias de revisão de súmulas e teses pelo Pleno [T, resultados de busca no portal TRT12].
  - No BNP, o TRT12 está no grupo de espécies 9: SV, IRDR, OJ, IAC, NT, SUM [V].
- **Súmulas e OJs do TST**: o BNP associa ao TST apenas RR, IRR, IRDR e IAC (sem SUM/OJ) [V]. Como o corpus é pequeno (centenas de súmulas e OJs), sugiro **curadoria manual inicial** a partir do material oficial do TST (livro/PDF), com revisão periódica. Ver risco de robots no TST.

**Viabilidade geral trabalhista**: alta para precedentes qualificados do TRT12 e IRR do TST (via BNP); baixa para inteiro teor.

### 3.4 TRF4

- Formulário eproc de jurisprudência: `https://jurisprudencia.trf4.jus.br/eproc2trf4/externo_controlador.php?acao=jurisprudencia@jurisprudencia/pesquisar` respondeu 200, sem captcha na página [V]. robots.txt inexistente (404) [V].
- A busca é POST de formulário HTML [T, jurismcp]. Cobre TRF4, TRU4 e Turmas Recursais de RS, SC e PR [T].
- Um projeto relata que os hosts do TRF4 (e TRF5) **não aceitam conexões de fora do Brasil** [T, br-eli-mcp]. Se o backend do Decreta roda fora do país, a coleta precisa sair de uma região brasileira.
- No BNP, o TRF4 (sigla `TRF04`) está no grupo 7: IAC, NT, IRDR, SUM [V].
- **Viabilidade média**: usar **sob demanda** (verificar uma citação específica ou buscar poucos resultados), com cache e baixa frequência. Esforço 3–5 dias; frágil a mudanças de HTML.

### 3.5 TJSC e outros TJs

- **TJSC** (`https://busca.tjsc.jus.br/jurisprudencia/`): minha primeira requisição GET simples recebeu uma página **"Verificação de segurança do portal institucional"** com **captcha de imagem**, informando bloqueio temporário por "muitas tentativas consecutivas" e pedindo para digitar o código [V]. Outras pesquisas paralelas podem ter usado o mesmo IP, mas o fato relevante não muda: **há captcha, então é inviável para automação**. Um mapeamento independente de APIs públicas também excluiu o TJSC por captcha/WAF [T, README de edilsonfs].
  - O que sobra para o TJSC: **precedentes qualificados via BNP** (grupo 8: IRDR, OJ, IAC, NT, SUM) [V].
  - O RepoJus tem 30.419 decisões do TJSC, só de 2026 [V, cartão do dataset]. Útil como apoio, não como fonte de verdade.
  - Caminho institucional: pedido via LAI ao TJSC por um conjunto de dados de acórdãos, ou convênio. A LAI exige acesso automatizado em formato aberto (art. 8º, § 3º, III) [V]. **Não verifiquei se o TJSC tem portal de dados abertos de jurisprudência** [NV].
- **TJSP** (`esaj.tjsp.jus.br/cjsg`): a página carrega reCAPTCHA v3 (`grecaptcha.execute(..., {action: 'consulta'})`) e um `captchaControleAcesso.do` [V]. **Inviável.**
- **TJMG**: API JSON pública com OpenAPI em `https://jurisprudencia-api.tjmg.jus.br/v3/api-docs` (200; `POST /jurisprudencias/filter`; o esquema declara OAuth2) [V]. Terceiros dizem que responde sem token, que `totalRecords` satura em 1.000 e que o endpoint de inteiro teor falhou [T]. A pesquisa clássica (`www5.tjmg.jus.br`) tem captcha [V].
- **TJRS**: página de busca 200 sem captcha detectado [V]. Terceiros descrevem `POST /buscas/jurisprudencia/ajax.php` retornando JSON do Solr com íntegra em base64 [T].
- **TJPR**: página 200, sem captcha detectado na página inicial [V]. Não investiguei API [NV].
- Fora do piloto, outros TJs com JSON aberto (TJBA, TJCE, TJDFT, TJES, TJPA, TJPE, TJRO) aparecem no mapeamento de edilsonfs [T].

### 3.6 CNJ: Banco Nacional de Precedentes (BNP / Pangea)

- **Base normativa** [V]:
  - **Res. CNJ 444/2022** (https://atos.cnj.jus.br/atos/detalhar/4415) institui o BNP "para consulta e divulgação por órgãos e pelo público em geral de precedentes judiciais", com ênfase no art. 927 do CPC. É alimentado pelos tribunais e pela TNU (art. 3º).
  - **Portaria CNJ 116/2022** (https://atos.cnj.jus.br/atos/detalhar/4475) padroniza os dados. O "amplo acesso por integração tecnológica" previsto é para tribunais e TNU (art. 1º, § 2º).
  - O CPC exige registro eletrônico dos IRDRs no CNJ e bancos de dados dos tribunais (art. 979, caput e § 1º) [V, normas.leg.br].
- **Front público** (`https://pangeabnp.pdpj.jus.br/`), desenvolvido pelo TRT4 para o CNJ (Angular + Flask + OpenSearch; jobs extraem do webservice do BNP) [V, https://docs.pdpj.jus.br/servicos-negociais/pangeabnp/].
  - `GET /api/v1/parametros` respondeu 200, JSON, sem autenticação [V]: 21 espécies (SUM, OJ, IAC, IRDR, PN, IRR, SV, SIRDR, RR, RG, controle concentrado, PUIL, CT, NT…), 93 órgãos com `grupoEspecies`, `producao: true`, `versao: 1.0.2`. TREs, TSE e TJMs vêm marcados como `semPrecedentes`.
  - `GET /api/v1/precedentes` → **405** (o endpoint existe; aceita só POST) [V].
  - Segundo terceiros [T, ficha `pangea_bnp.md`, verificada em 12/10/2026]: corpo `{"filtro": {buscaGeral, todasPalavras, ..., orgaos[], tipos[], pagina, tamanhoPagina (10/20/50/100), ordenacao, cancelados}}`; resposta com `id` (ex.: "stj-rr-65"), `orgao`, `tipo`, `nr`, `situacao`, `questao`, `tese` (HTML), `historico`, `suspensoes`, `processosParadigma` (com número CNJ e link) e `ultimaAtualizacao`; link canônico `/pesquisa?orgao=<órgão>&tipo=<espécie>&nr=<número>`. Corpo incompleto devolve 500. **Não traz ementas nem íntegras**, só teses e status.
  - O manual oficial descreve campos (questão, tese, situação, decisões, processos, suspensão), **atualização duas vezes por mês** e uso público, mas **não menciona API** [V, https://docs.pdpj.jus.br/servicos-negociais/BNP-Pangea/BNP%20-%20Manual%20de%20Utiliza%C3%A7%C3%A3o/].
- **API oficial de integração** (`https://bnp-sempj.cloud.pje.jus.br/swagger-ui/index.html`): exige token do SSO da PDPJ (client credentials) solicitado ao CNJ, voltada aos tribunais [V, doc PDPJ]. Há lista de e-mail para mudanças de API. Para o Decreta, vale **pedir formalmente acesso ou um dump** ao CNJ, citando a Res. 444/2022.
- **Viabilidade**: média-alta. Público e oficial, mas a busca não é documentada e pode mudar sem aviso. Mitigação: sincronizar quinzenalmente para o banco local e monitorar quebra com um teste canário.

### 3.7 Legislação

- **API de Dados Abertos do Senado** [V]:
  - OpenAPI em `https://legis.senado.leg.br/dadosabertos/v3/api-docs` (200, JSON).
  - `GET /dadosabertos/legislacao/urn.json?urn=urn:lex:br:federal:lei:2015-03-16;13105` devolveu o CPC com `normaNome`, `apelido`, `urlDocumento` (normas.leg.br), publicação no DOU de 17/03/2015 (p. 1, col. 2) e **54 "vides"** (normas posteriores que alteram, como as Leis 14.833/2024, 14.879/2024, 14.939/2024, 14.976/2024, 15.109/2025 e 15.252/2025, e acórdãos de ADI).
  - Terceiros: `lista.json` filtra por data de assinatura dia a dia e mais de 10 req/s recebem 429 [T].
  - **Uso**: metadados, vigência e alterações; mapear "Lei 13.105/2015" → URN.
- **normas.leg.br** [V]:
  - OpenAPI em `https://normas.leg.br/v3/api-docs` (200).
  - `GET /api/public/normas?urn=...&tipo_documento=maior-detalhe` devolveu 4,2 MB de JSON-LD (`@type: Legislation`) para o CPC, com `hasPart` **por dispositivo**: `...;13105!art1003_cpt`, `!art1003_par1` … `!art1035_par3_inc1`. Há a versão original (`@2015-03-16`) e a vigente.
  - Testei a extração por dispositivo: art. 927, § 5º e art. 979 do CPC; art. 8º, § 3º, III da LAI; art. 7º, §§ 3º e 4º da LGPD.
  - O JSON declara `license: https://creativecommons.org/licenses/by/4.0/` e `legislationLegalValue: UnofficialLegalValue`. Ou seja, o texto compilado **não tem valor legal oficial**; o oficial é o DOU.
  - Normas antigas (ex.: Lei 9.610/98) vêm sem articulação; o texto integral sai do binário em `/api/public/binario/{id}/texto` (HTML). Testei e funcionou [V]. O `contentUrl` informado no JSON (`/api/binario/...`) responde 404, segundo terceiros [T].
  - **É a peça central para "checar se o artigo citado existe e o que diz".**
  - Ponto de atenção: o texto compilado pode ficar atrás de alterações recentes. Encontrei uma tese do STJ (Temas.csv) que menciona "art. 1.035-A, § 7º, do CPC", mas não há dispositivo `art1035-A` no JSON do normas.leg.br [V]. Pode ser lacuna de consolidação ou erro na fonte; não investiguei. Por isso a verificação deve exibir a data do texto e o link do DOU.
- **LexML** [V]:
  - O **SRU** (`/busca/SRU`) devolve HTML "Verificação de segurança — Senado Federal" com prova de trabalho em JS. O robots.txt tem `Disallow: /busca/`, `Allow: /urn`, `Allow: /sru` e `Crawl-delay: 5`; `/sru` em minúsculas devolveu 404. Um projeto relata o bloqueio desde 29/09/2026 [T, jurismcp].
  - O **resolvedor de URN** funciona: `https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:2015-03-16;13105` → 200, página da norma.
  - Uso: links canônicos e normas estaduais/municipais por URN (não testei URN estadual) [NV].
- **Planalto**: GET ao texto do CPC esgotou 40 s sem bytes [V]. Terceiros relatam o mesmo com o REFLEGIS [T, br-eli-mcp]. **Baixa**. Use normas.leg.br e o DOU.
- **Câmara**: `dadosabertos.camara.leg.br/api/v2/proposicoes` → 200, JSON [V]. Útil só para projetos de lei.
- **DOU**:
  - Base de dados abertos mensal (XML em ZIP, 2002→): **não consegui acessar daqui** (conexão encerrada) [NV]. Terceiros: liberação na 1ª terça-feira do mês, CC BY-ND 3.0, robots `Disallow: /` [T].
  - **INLABS** [V, README oficial em https://github.com/Imprensa-Nacional/inlabs, push em 30/09/2026]: PDF e XML das edições completas, livre e gratuito desde 01/01/2020, disponível para os **últimos 4 meses**; antes disso, usar a página de dados abertos. Exige cadastro e login (o time do Decreta faria o cadastro). Há scripts oficiais em Bash e Python para automação.
- **Diários municipais de SC: DOM/SC via CIGA** [V]:
  - CKAN `https://dados.ciga.sc.gov.br`, 431 pacotes `domsc-publicacoes-de-MM-AAAA`, ZIPs em 3 lotes diários (00–12h, 12–16h, 16–24h).
  - O pacote 10/2026 foi atualizado em 31/10/2026 às 15:11. O campo de licença é nulo.
  - É **melhor que o Querido Diário para SC**, porque é a fonte oficial consolidada dos municípios catarinenses associados.
- **Querido Diário** (OKBR): código MIT, API em `api.queridodiario.ok.org.br` [V, GitHub https://github.com/okfn-brasil/querido-diario-api]. A conexão TLS falhou daqui [NV]. Cobertura: ~350 cidades em 2024 [T].
- **ALESC** (`https://leis.alesc.sc.gov.br/legislativo`): aplicação Next.js, 200, sem captcha detectado, **sem API documentada** [V]. Viabilidade baixa a média (raspagem de app SPA). Sugestão: sob demanda, ou LexML URN.

### 3.8 Conjuntos de dados prontos e modelos

| Recurso | O que é | Licença | Situação | Uso sugerido | Verif. |
|---|---|---|---|---|---|
| **RepoJus** (`andrebadini/repojus`) | 9.846.812 decisões de 48 órgãos (STF 1.107.133; STJ 1.090.374; TST 855.701; TRF4 223.743; TJSC 30.419, só 2026) + 159.557 normas com texto vigente; Parquet particionado | CC BY 4.0 | Snapshot v3 de 30/10/2026; o cartão diz que o texto normalizado não substitui a publicação oficial; pedidos de remoção pelas Discussões | **Bootstrap de busca** e recall; **nunca** fonte de verdade: sempre reconferir na `url` oficial | V |
| celsowm/jurisprudencias_br_full | 781 mil linhas com inteiro teor | CC BY 4.0 | Atualizado em 20/09/2026 | Apoio | V (metadados HF) |
| celsowm/jurisprudencias_stj | 634 mil linhas raspadas do SCON; teses geradas por LLM | Não declarada | Set/2025 | Evitar (teses sintéticas) | V (HF) / T |
| eduagarcia/LegalPT_dedup | Corpus jurídico PT (TJSP, BRCAD-5, STF 2010–2018, STJ) | Não declarada | Mai/2024 | Pré-treino/avaliação | V (HF) / T |
| LeNER-Br (`peluz/lener_br`) | NER jurídico, 66 documentos | Desconhecida | Jan/2024 | Treinar extrator de entidades (leis, casos) | V (HF) / T |
| **JUÁ** (benchmark) | Recuperação jurídica BR: JUÁ-Juris, JurisTCU, NormasTCU, Ulysses-RFCorpus, BR-TaxQA; leaderboard `huggingface.co/spaces/ufca-llms/jua-leaderboard` | Datasets: não declarada | arXiv 2604.06098 (abr/2026) | Avaliar o nosso retriever | V (arXiv) |
| **jua-4B-legal-only / jua-4B-mixed** | Qwen3-Embedding-4B ajustado para direito BR | **MIT** | Mai/2026 | Candidato a embedding self-hosted | V (HF) |
| MTEB-BR | Benchmark de embeddings em PT-BR (22 tarefas, 93 modelos) | — | arXiv 2607.04581 (jul/2026) | Escolha de embedding geral | V (arXiv) |

Achados de avaliação (JUÁ, arXiv 2605.04005 e 2604.06098) [V]:

- **BM25 continua competitivo** em coleções com vocabulário institucional (JurisTCU 0,362 vs. Qwen 8B 0,332 de NDCG@10).
- **Embeddings ajustados ganham** em jurisprudência (JUÁ-Juris: BM25 0,103, OpenAI text-embedding-3-small 0,103, Qwen3-Embedding-4B ajustado 0,290).
- Média em 4 conjuntos jurídicos: BM25 0,350; OpenAI 3-small 0,329; Qwen3-4B base 0,397; Qwen3-8B base 0,407; **jua-4B 0,434**.
- **Implicação**: busca **híbrida** (léxica + vetorial).

### 3.9 Agregadores pagos (só para comparar com construir)

- **Jurisprudências.ai** [V, página inicial]:
  - 54 tribunais e bases, incluindo STF, STJ, TST, TRF1–6, 24 TJs (com TJSC) e CARF. **Não inclui TRT11, TRT12, TRT15 nem TRT21.**
  - Grátis: 2 a 3 buscas por dia (a página se contradiz). Mensal R$ 59,90; anual R$ 599. API no plano pago com 500 buscas de texto e 10.000 expansões por dia.
  - Diz indexar mais de 26 milhões de decisões, com link para a fonte oficial. Termos não lidos.
  - Bom como **fallback de busca** e **comparação**, mas o licenciamento para uso dentro de um SaaS precisa ser lido e negociado.
- **Escavador**: o índice da documentação v1 lista busca, processos, diários oficiais, monitoramentos, pessoas e instituições, **sem endpoint de jurisprudência ou legislação**; custo por requisição informado no cabeçalho `Creditos-Utilizados` (centavos) [V, via WebFetch de `api.escavador.com/v1/docs/`]. Não consegui ler a v2 [NV].
- **Jusbrasil**: sem tabela pública de API. Planos corporativos por usuário aparecem em contratações públicas (ex.: R$ 9.336 com 30% de desconto para R$ 6.535,20 num TRE) [T]. Há relatos de API para clientes corporativos [T]. **Não raspar**: a base do Jusbrasil é protegida como base de dados (LDA art. 7º, XIII, e art. 87).
- **Turivius, JUIT (Rimor), Digesto**: não encontrei documentação pública de API para desenvolvedores nem preço [T/NV]. Digesto não foi pesquisado a fundo porque o orçamento de buscas acabou.
- **Conclusão**: para "citação verificada" o diferencial é **ter o texto oficial e o identificador oficial localmente**. Agregadores ajudam na descoberta, mas não resolvem a verificação nem a licença de uso. **Construir sobre STJ, BNP e normas.leg.br é viável e mais barato.**

---

## 4. Aspectos legais da coleta

| Tema | O que diz a fonte | Implicação para o Decreta | Verif. |
|---|---|---|---|
| Direito autoral | Lei 9.610/98, art. 8º, IV: não são objeto de proteção "os textos de tratados ou convenções, leis, decretos, regulamentos, decisões judiciais e demais atos oficiais" | Texto de decisões e leis pode ser armazenado e exibido | V (normas.leg.br, binário da LDA) |
| Bases de dados | LDA art. 7º, XIII (coletâneas e bases de dados com criação intelectual) e § 2º (a proteção não abarca os dados em si); art. 87 (direito do titular da base sobre a forma de expressão da estrutura) | Não copiar bases de agregadores privados (Jusbrasil, Escavador etc.); a "seleção e organização" deles é protegida | V |
| Transparência ativa | LAI, art. 8º, § 3º, III: sítios devem "possibilitar o acesso automatizado por sistemas externos em formatos abertos, estruturados e legíveis por máquina" | Base para pedir dados ao TJSC/TRT12 via LAI e para usar dados abertos | V |
| Publicidade de precedentes | CPC art. 927, § 5º (publicidade dos precedentes na internet, organizados por questão jurídica); art. 979 (registro no CNJ e bancos de dados) | Legitima o uso do BNP e de portais de precedentes | V |
| BNP | Res. CNJ 444/2022: consulta "pelo público em geral" | Uso do front público é coerente com a finalidade; pedir acesso formal à API | V |
| DataJud | Termos v1.2: fins "legais, não comerciais e autorizados" (3.3); vedado "explorar comercialmente a API ou qualquer informação derivada dela" (3.8) | **Risco para o uso atual do Decreta**; avaliar com jurídico ou pedir autorização ao CNJ | V (https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/) |
| LGPD | Art. 7º, § 3º: tratamento de dados de acesso público deve considerar finalidade, boa-fé e interesse público; § 4º: dispensa de consentimento para dados tornados manifestamente públicos pelo titular, resguardados direitos e princípios | Decisões têm nomes de partes: minimizar (não indexar nomes para busca de pessoas), respeitar segredo de justiça, ter canal de remoção | V |
| Licenças CC BY | STJ (CC BY), normas.leg.br (CC BY 4.0), RepoJus (CC BY 4.0) | **Exibir atribuição** ("Fonte: STJ – Portal de Dados Abertos") | V |
| robots.txt | TST `Disallow: /`; LexML `Disallow: /busca/`; STF só `/processos` | Respeitar; o TST fica fora da automação | V |
| Captcha/WAF | TJSC, TJSP, SCON (scon), LexML SRU, STF (busca), Falcão | **Não automatizar**; regra do projeto e sinal claro de vedação técnica | V/T |
| Res. CNJ 615/2025 | Diretrizes de IA **no Poder Judiciário** (situação: "Alterado") | Não se aplica a escritórios, mas indica o padrão de governança esperado | V (https://atos.cnj.jus.br/atos/detalhar/6001) |
| OAB | Recomendação 001/2024 do Conselho Federal (11/11/2024) sobre IA generativa; dever de veracidade (CPC art. 77) na pesquisa de jurisprudência | Reforça a verificação humana e a transparência com o cliente | T |
| Decisões judiciais sobre raspagem no Brasil | Não consegui levantar com segurança (orçamento de buscas esgotado) | Pedir parecer jurídico antes de qualquer raspagem fora de dados abertos | NV |

---

## 5. Desenho proposto: "Jurisprudência verificada" no Decreta

### 5.1 Princípios

1. **O modelo não escreve números, nomes de relator, datas nem ementas.** Ele aponta para `doc_id`s de documentos que o servidor recuperou. O texto da citação é **renderizado pelo servidor** a partir do banco. Isso elimina por construção a classe "número inventado".
2. **Existência não basta.** O estudo de Stanford separa resposta incorreta de resposta com citação que não sustenta a afirmação (tipologia citada no resumo; leitura completa não verificada) e mede 17–33% de alucinação mesmo em ferramentas com RAG. Por isso há uma segunda checagem: **a fonte sustenta a frase?**
3. **Fora do acervo = "não verificada"**, nunca "inexistente". A cobertura é parcial (TJSC e TRT12 sem inteiro teor).
4. **Proveniência visível**: cada citação mostra fonte, data de captura, licença e link oficial.

### 5.2 Fontes por fase (piloto SC)

**Fase 1, "o que o advogado mais cita" (2–3 semanas)**

- Legislação federal: Senado (metadados, alterações) + normas.leg.br (dispositivos), sob demanda com cache por URN. Pré-carregar CF, CPC, CC, CLT, CDC, CTN, Lei 8.213, LINDB, CP e CPP.
- Precedentes qualificados: BNP (STF RG/SV/SUM/controle concentrado; STJ RR/SUM/IAC; TST IRR; **TJSC** IRDR/IAC/SUM; **TRT12** SUM/OJ/IRDR/IAC; **TRF4** IRDR/IAC/SUM), sincronizado quinzenalmente.
- STJ `Temas.csv`/`Processos.csv` (semanal) e STF Informativo XLSX + lista de temas de RG (semanal).
- Súmulas e OJs do TST: curadoria manual inicial (corpus pequeno).

**Fase 2, ementas e íntegras do STJ (3–4 semanas)**

- Espelhos (10 órgãos; carga histórica + mensal) e íntegras 2021+ (diário; ZIP+JSON); depois 2008–2020.

**Fase 3, lacunas regionais (contínuo)**

- TRF4: consulta eproc **sob demanda** (verificar uma citação; poucos resultados), saída por IP no Brasil, ≤1 req/s, cache.
- TJSC e TRT12: **pedido via LAI** e/ou contato com os núcleos de precedentes por um conjunto de acórdãos em formato aberto. Enquanto isso, RepoJus (TJSC 2026) só como **pista de busca** (o selo exige confirmação na URL oficial; se a URL oficial estiver atrás de captcha, a citação fica como "encontrada em base secundária, confira").
- Atos municipais de SC: DOM/SC (CIGA), se houver demanda.

### 5.3 Modelo de dados (Postgres)

```sql
-- Fonte e proveniência
create table fonte (
  id text primary key,            -- 'stj_dados_abertos', 'cnj_bnp', 'normas_leg', 'stf_informativo'...
  nome text not null, licenca text, url_termos text
);

create table documento (
  id text primary key,            -- 'stj-esp-1467416', 'bnp-stj-rr-1475', 'stf-inf-1234-adi-3159'
  fonte_id text references fonte(id),
  tipo text not null,             -- acordao | decisao | sumula | sv | tema_rg | tema_rr | irdr | iac | oj | dispositivo
  tribunal text not null,         -- STF, STJ, TST, TJSC, TRT12, TRF4...
  classe text, numero text,       -- 'REsp', '1234567'
  uf text, numero_cnj text,       -- NNNNNNN-DD.AAAA.J.TR.OOOO quando houver
  orgao_julgador text, relator text,
  data_julgamento date, data_publicacao date,
  ementa text, tese text, situacao text,   -- situacao: 'vigente', 'cancelada', 'julgado', 'suspenso'...
  texto text,                     -- íntegra (quando houver)
  url_oficial text not null,
  hash_conteudo text not null,    -- sha256 do texto normalizado
  capturado_em timestamptz not null,
  atualizado_na_fonte_em timestamptz,
  tsv tsvector,                   -- FTS 'portuguese' + unaccent
  unique (tribunal, tipo, classe, numero, uf)
);

create table documento_trecho (     -- chunks para RAG
  documento_id text references documento(id),
  ordem int, texto text, embedding vector(1024),  -- dimensão conforme o modelo escolhido
  primary key (documento_id, ordem)
);

create table dispositivo_legal (
  urn text primary key,           -- 'urn:lex:br:federal:lei:2015-03-16;13105!art927_par5'
  norma_urn text not null, rotulo text,  -- 'art. 927, § 5º'
  texto_vigente text, texto_original text,
  fonte_texto text default 'normas.leg.br', valor_legal_oficial boolean default false,
  url_dou text, capturado_em timestamptz
);
```

### 5.4 Ingestão (Inngest)

| Função | Agenda | O que faz |
|---|---|---|
| `stj.integras.diario` | Diária 06:00 | Lê `package_show` (CKAN), baixa os novos `metadadosAAAAMMDD.json` e `textosAAAAMMDD.zip`, faz upsert por `SeqDocumento`, extrai a ementa do texto, gera trechos |
| `stj.espelhos.mensal` | Diária (só processa recurso novo) | 10 conjuntos; deduplica por `id` |
| `stj.precedentes.semanal` | Semanal | Re-baixa `Temas.csv`/`Processos.csv`; compara hash; marca mudança de situação |
| `bnp.sync` | 1º e 16 de cada mês | POST paginado por órgão e espécie (sem buscaGeral, ordenado), upsert por `id`; **canário**: se o esquema mudar ou vier 4xx/5xx, alerta e mantém a última versão |
| `stf.informativo` | Semanal | Baixa o XLSX e faz upsert por (informativo, classe, número) |
| `stf.temas_rg` | Semanal | Lê `todostemas.asp` e normaliza |
| `normas.resolver` | Sob demanda + cache 30 dias | URN → JSON-LD → `dispositivo_legal`; invalida quando o Senado mostrar "vide" novo |
| `senado.novas_normas` | Diária | `lista.json?data=AAAAMMDD` para detectar normas novas |

Boas práticas: User-Agent identificável com contato (ex.: `DecretaBot/1.0 (+contato@...)`), ≤1 req/s por host, respeito a robots e parada imediata diante de captcha ou 403 de WAF (registrar e alertar, nunca contornar).

### 5.5 Recuperação

1. **Extrator de citações** (regex + normalização) aplicado à pergunta e à resposta:
   - STJ/STF: `(REsp|AREsp|AgInt no AREsp|AgRg no REsp|EREsp|HC|RHC|RE|ARE|ADI|ADPF|MS|RMS|CC)\s*(n[º°o.]\s*)?([\d.]+)(\s*/\s*([A-Z]{2}))?`
   - Temas: `Tema\s+(Repetitivo\s+)?(n[º°o.]\s*)?([\d.]+)\s*(do|/)\s*(STJ|STF)` e `Tema\s+([\d.]+)\s+da\s+Repercussão Geral`
   - Súmulas: `Súmula(\s+Vinculante)?\s+(n[º°o.]\s*)?(\d+)\s*(do|/)\s*(STF|STJ|TST|TJSC|TRT12|TRF4)`, `OJ\s+(n[º°o.]\s*)?(\d+)\s+da\s+SBDI-?[12]`
   - Número CNJ: `\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}`
   - Dispositivo: `art(igo)?\.?\s*([\d.]+)(º|o)?(-[A-Z])?(,\s*§\s*(\d+|único)º?)?(,\s*inc(iso)?\.?\s*([IVXLC]+))?` + "da Lei nº X/AAAA | do CPC | da CF..." → URN (`!art927_par5`, `!art8_par3_inc3`; incisos em arábico, como verificado).
2. **Busca híbrida**: Postgres FTS (`portuguese` + `unaccent`) e pgvector, fundidos por RRF. Filtros por tribunal, tipo e situação (excluir súmulas canceladas por padrão). Embedding: começar com o que já for usado via gateway; avaliar `jua-4B` (MIT) self-hosted mais tarde no JUÁ/MTEB-BR. No começo, **FTS sozinho já entrega muito** (BM25 competitivo no JUÁ).
3. **Prioridade de autoridade** no ranking: SV > RG/controle concentrado > RR/IRR > súmula > IRDR/IAC do TJSC/TRT12/TRF4 > espelho STJ > íntegra.

### 5.6 Geração e verificação da citação

**Contrato com o modelo** (Claude via OpenRouter):

- Recebe só os trechos recuperados, cada um com `doc_id`.
- Responde em JSON estruturado: `[{ "afirmacao": "...", "citacoes": [{"doc_id": "...", "trecho_literal": "..."}] }]`. Instrução explícita: **não escrever número de processo, súmula, tema, relator ou data fora de `doc_id`**.
- O servidor monta o texto final e troca `doc_id` pela citação canônica do banco: "STJ, 3ª Turma, REsp 1.234.567/SC, rel. Min. Fulano, j. 01/02/2026, DJEN 05/02/2026".

**Verificador pós-geração** (determinístico primeiro, LLM depois):

1. **Resolução**: cada `doc_id` existe no acervo? Senão → descarta a citação e registra.
2. **Varredura de vazamento**: o extrator de citações roda no texto gerado; qualquer número de processo, súmula, tema ou artigo **não originado de `doc_id`** é marcado (ou removido) como "não verificado".
3. **Trecho literal**: `trecho_literal` precisa ser substring do texto da fonte, após normalização (caixa, espaços, aspas, hifenização). Se falhar, rebaixa para paráfrase e mostra o trecho real ao lado.
4. **Atualidade**: a súmula ou tema está cancelado, revisado ou superado? O dispositivo foi revogado? Usar `situacao` do BNP/STJ e os "vides" do Senado.
5. **Sustentação** (contra a "citação que não sustenta"): segundo passo de LLM com prompt de entailment ("o trecho X sustenta a afirmação Y? sim, parcial ou não, com justificativa curta"). Se "não", remove a citação; se "parcial", mostra aviso.
6. **Selo na UI**:
   - **Verificada**: existe, metadados do banco, trecho confere, fonte oficial, data de captura.
   - **Encontrada, com ressalva**: cancelada, superada, trecho não literal ou só em base secundária.
   - **Não verificada**: fora do acervo; "confira na fonte antes de usar".
7. **Registro de auditoria**: guardar `doc_id`, hash do conteúdo e versão da fonte usados em cada resposta, para provar o que o sistema mostrou ao advogado.

**Modo "Verificar peça"** (alto valor e baixo custo): o advogado cola a minuta (ou o DOCX gerado) e o sistema extrai todas as citações, resolve no acervo e marca cada uma. Para dispositivos, usa normas.leg.br; para precedentes, BNP/STJ/STF. Isso ataca diretamente o risco de multa por litigância de má-fé.

### 5.7 Métricas

- Conjunto de teste com ~300 perguntas reais de escritório em SC, com gabarito de citações.
- Metas: **0 citações renderizadas fora do acervo**; taxa de "sustentação = não" abaixo de 2% em amostra revisada por advogado; recall@10 da busca medido no JUÁ e no conjunto próprio.
- Monitorar a cobertura: % de citações das peças dos clientes que resolvem no acervo, por tribunal. Isso mostra onde a lacuna (TJSC/TRT12) dói.

### 5.8 Esforço estimado (1 dev, já conhecendo a stack)

| Bloco | Dias |
|---|---|
| Esquema + extrator de citações + mapeamento para URN | 4–6 |
| Legislação (Senado + normas.leg.br + cache + verificador de dispositivo) | 4–6 |
| BNP sync + canário | 3–5 |
| STJ Temas + STF Informativo + temas RG + súmulas/OJs do TST (curadoria) | 3–5 |
| STJ espelhos | 3–4 |
| STJ íntegras (2021+) com chunking e índice | 5–8 |
| Busca híbrida (FTS + pgvector + RRF) | 4–6 |
| Contrato de geração, verificador, selos de UI, "Verificar peça" | 6–10 |
| Avaliação e ajustes | 3–5 |
| **Total** | **~35–55 dias úteis (5 a 7 semanas de 1 dev para fases 1 e 2, sem TRF4)** |

---

## 6. Riscos

1. **Bloqueios e mudanças técnicas**: WAF/captcha podem aparecer em fontes hoje abertas (LexML passou a bloquear em set/2026 [T]). O BNP usa endpoint não documentado. Mitigação: canários, cache local, pedido formal ao CNJ.
2. **Cobertura regional**: sem inteiro teor automatizável do **TJSC** e do **TRT12**, que são justamente os tribunais do piloto. O produto precisa comunicar isso ("acervo verificado cobre: …").
3. **Defasagem**: íntegras do STJ com ~2 semanas de atraso; espelhos ~1 mês; BNP quinzenal; normas.leg.br pode atrasar a consolidação (indício: "art. 1.035-A" citado pelo STJ sem dispositivo correspondente no JSON). Mostrar "atualizado em" e link para a fonte.
4. **Termos do DataJud** (não comercial, sem exploração comercial de derivados): risco jurídico já existente no produto. Avaliar com jurídico e/ou buscar autorização do CNJ.
5. **LGPD**: decisões trazem nomes de partes. Não oferecer busca por nome de pessoa no acervo de jurisprudência; respeitar segredo (o STJ já exclui); política de retenção; canal de remoção.
6. **Direito sobre bases de terceiros**: não raspar agregadores (LDA art. 87). Usar RepoJus e outros CC BY só com atribuição e sempre revalidando na fonte oficial.
7. **Alucinação residual por citação que não sustenta a frase**: a citação existe, mas não diz o que a frase afirma. O passo de sustentação reduz, não elimina. Manter o aviso de revisão humana obrigatória.
8. **Responsabilidade profissional**: tribunais já multam (TJSC 10% do valor da causa, fev/2025; TST 6ª Turma, mar/2026). O selo "verificada" não pode virar promessa de "sem erro". Usar linguagem cuidadosa: "encontrada na fonte oficial em DD/MM".
9. **Geobloqueio**: TRF4 (e talvez outros) só aceitam IP brasileiro [T]. A coleta precisa rodar em região do Brasil.
10. **Texto sem valor oficial**: normas.leg.br e dados abertos do DOU não substituem a publicação certificada. Mostrar o link do DOU quando relevante.

---

## 7. Fontes consultadas

**Fontes primárias (oficiais)**

- STJ, Portal de Dados Abertos (CKAN): https://dadosabertos.web.stj.jus.br/ ; API `https://dadosabertos.web.stj.jus.br/api/3/action/package_list` e `package_show?id=` dos conjuntos `integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica`, `integras-de-decisoes-terminativas-e-acordaos-2008-2020`, `espelhos-de-acordaos-quinta-turma`, `espelhos-de-acordaos-terceira-turma`, `espelhos-de-acordaos-corte-especial`, `precedentes-qualificados`
- STJ, dicionário do espelho do acórdão: https://dadosabertos.web.stj.jus.br/dataset/b79a7764-5c86-4530-9b6b-18cf60e2f38f/resource/d1d7050a-bfc7-4be0-ae7e-b421ac3d4f20/download/dicionario-espelhodoacordao.csv
- STJ, SCON: https://scon.stj.jus.br/SCON/ (403 Cloudflare) e https://processo.stj.jus.br/SCON/ , https://processo.stj.jus.br/SCON/sumstj/
- STF, Informativo: https://portal.stf.jus.br/textos/verTexto.asp?servico=informativoSTF ; planilha https://www.stf.jus.br/arquivo/cms/informativoSTF/anexo/Informativo_Dados/Dados_InformativosSTF.xlsx
- STF, Repercussão Geral: https://portal.stf.jus.br/repercussaogeral/ ; https://portal.stf.jus.br/jurisprudenciaRepercussao/todostemas.asp ; robots https://portal.stf.jus.br/robots.txt
- STF, jurisprudência: https://jurisprudencia.stf.jus.br/pages/search ; Corte Aberta https://transparencia.stf.jus.br/ ; notícia de lançamento https://noticias.stf.jus.br/postsnoticias/stf-lanca-programa-corte-aberta-com-ampla-base-de-dados-e-maior-transparencia-aos-cidadaos/
- CNJ, Pangea/BNP: https://pangeabnp.pdpj.jus.br/ ; https://pangeabnp.pdpj.jus.br/api/v1/parametros ; documentação https://docs.pdpj.jus.br/servicos-negociais/pangeabnp/ ; manual https://docs.pdpj.jus.br/servicos-negociais/BNP-Pangea/BNP%20-%20Manual%20de%20Utiliza%C3%A7%C3%A3o/
- CNJ, Res. 444/2022: https://atos.cnj.jus.br/atos/detalhar/4415 ; Portaria 116/2022: https://atos.cnj.jus.br/atos/detalhar/4475 ; Res. 615/2025: https://atos.cnj.jus.br/atos/detalhar/6001
- CNJ, termo de uso da API pública do DataJud: https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/
- TST, dados abertos: https://www.tst.jus.br/web/acesso-a-informacao/dados-abertos ; robots https://jurisprudencia.tst.jus.br/robots.txt
- JT/Falcão: https://jurisprudencia.jt.jus.br/jurisprudencia-nacional/ ; notícia TRT2: https://ww2.trt2.jus.br/noticias/noticias/noticia/sistema-falcao-reune-jurisprudencia-do-tst-e-dos-24-trts-do-pais-conheca
- TRT12, tabela de precedentes dos TRTs: https://portal.trt12.jus.br/node/16665
- TRF4, jurisprudência eproc: https://jurisprudencia.trf4.jus.br/eproc2trf4/externo_controlador.php?acao=jurisprudencia@jurisprudencia/pesquisar
- TJSC, jurisprudência: https://busca.tjsc.jus.br/jurisprudencia/ ; notícia da multa: https://www.tjsc.jus.br/web/imprensa/-/tjsc-multa-autor-de-recurso-por-jurisprudencia-falsa-gerada-por-ia
- TST, notícia da multa: https://www.tst.jus.br/-/empresa-e-advogado-sao-multados-por-uso-de-ia-com-decisoes-falsas
- TJSP e-SAJ: https://esaj.tjsp.jus.br/cjsg/consultaCompleta.do ; TJMG API: https://jurisprudencia-api.tjmg.jus.br/v3/api-docs ; TJRS: https://www.tjrs.jus.br/buscas/jurisprudencia/ ; TJPR: https://portal.tjpr.jus.br/jurisprudencia/
- Senado, API de legislação: https://legis.senado.leg.br/dadosabertos/v3/api-docs ; exemplo https://legis.senado.leg.br/dadosabertos/legislacao/urn.json?urn=urn:lex:br:federal:lei:2015-03-16;13105 ; catálogo LexML https://www12.senado.leg.br/dados-abertos/legislativo/legislacao/acervo-do-portal-lexml
- normas.leg.br: https://normas.leg.br/v3/api-docs ; exemplo https://normas.leg.br/api/public/normas?urn=urn:lex:br:federal:lei:2015-03-16;13105&tipo_documento=maior-detalhe (também LAI `lei:2011-11-18;12527`, LDA `lei:1998-02-19;9610`, LGPD `lei:2018-08-14;13709`)
- LexML: https://www.lexml.gov.br/robots.txt ; SRU https://www.lexml.gov.br/busca/SRU ; URN https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:2015-03-16;13105
- Câmara: https://dadosabertos.camara.leg.br/api/v2/proposicoes
- Imprensa Nacional: https://inlabs.in.gov.br/ ; https://github.com/Imprensa-Nacional/inlabs ; https://www.in.gov.br/acesso-a-informacao/dados-abertos/base-de-dados (não acessível daqui)
- CIGA/SC, DOM/SC: https://dados.ciga.sc.gov.br/ (API `package_search?q=domsc`)
- ALESC: https://leis.alesc.sc.gov.br/legislativo
- Querido Diário: https://github.com/okfn-brasil/querido-diario-api

**Dados, modelos e artigos**

- RepoJus: https://huggingface.co/datasets/andrebadini/repojus
- Hugging Face (metadados via API): celsowm/jurisprudencias_br_full, celsowm/jurisprudencias_stj, eduagarcia/LegalPT_dedup, peluz/lener_br, ufca-llms/jua, ufca-llms/jua-4B-legal-only, ufca-llms/jua-4B-mixed
- JUÁ: https://arxiv.org/abs/2604.06098 ; https://arxiv.org/html/2604.06098v1 ; Domain-Adaptive Dense Retrieval: https://arxiv.org/html/2605.04005
- MTEB-BR: https://arxiv.org/abs/2607.04581
- Magesh et al., "Hallucination-Free?" (JELS 2025, 22:216–242): https://arxiv.org/abs/2405.20362
- Dahl et al., "Large Legal Fictions" (J. Legal Analysis 16(1):64–93, 2024): https://arxiv.org/abs/2401.01301
- Base dos Dados (busca): https://backend.basedosdados.org/search/?q=stf

**Terceiros (mapas e projetos de código, usados como pista e marcados [T])**

- https://github.com/edilsonfs/apis-publicas-tribunais-orgaos (fichas `stf.md`, `falcao.md`, `pangea_bnp.md`, `normas_leg.md`, `senado.md`, `inlabs.md`, `dou.md`, `datajud.md`, `tjmg.md`, `tjrs.md`; "verificado em out/2026")
- https://github.com/ivancaron/jurismcp
- https://github.com/Mcp-Brasil/mcp-brasil/issues/26
- https://pypi.org/project/br-eli-mcp/
- https://jurisprudencias.ai/
- https://api.escavador.com/v1/docs/
- Resultados de busca sobre Recomendação OAB 001/2024, Jusbrasil corporativo, Vals AI (out/2025), contagem de súmulas do STJ e Querido Diário

---

## 8. Limitações desta pesquisa

- **O orçamento de buscas web da sessão (compartilhado entre agentes) acabou** durante a seção de agregadores. Não pesquisei a fundo: Digesto, preços de API de Turivius/JUIT, decisões judiciais brasileiras específicas sobre raspagem, a página de dados abertos do TJSC (se existir) e o texto integral da Recomendação OAB 001/2024.
- Não fiz POST (regra de só GET). Por isso o comportamento das buscas do BNP, do STF, do TRF4 e do TJRS está marcado [T].
- Não consegui acessar daqui: DOU dados abertos (conexão encerrada), Planalto (timeout), Querido Diário (falha de TLS), Corte Aberta (403).
- O captcha do TJSC apareceu na primeira requisição. Pode ter sido acionado por outras pesquisas paralelas no mesmo IP, mas, havendo captcha, a fonte é inviável para automação de qualquer forma.
- Os números de alucinação de Stanford vêm dos resumos oficiais no arXiv. Não li os PDFs completos (servidores de Stanford recusaram conexão).
