# Plano de ação: experiência, redesign e landing

Plano de 02/11/2026, feito depois de ler os documentos 01 a 16 desta pasta, o [plano de execução de 31/10](../pesquisa/2026-10-31-plano-de-execucao.md), o código e o site no ar. Nenhum código foi alterado.

**Como ler**

- **Origem:** cada item separa o que vem dos documentos do que é proposta minha. Os números entre colchetes são os documentos desta pasta, como [06] para o Astrea. "Plano" é o plano de execução de 31/10.
- **Esforço:** dias ou semanas de uma pessoa que conhece a base, a mesma unidade do plano de 31/10. O ritmo real tem sido mais rápido: as Fases 0, 3, 4 e 5 do plano de 31/10 já estavam na revisão de 01/11. Revisão jurídica, pesquisa e decisões de preço não encurtam.
- **Limites:** as telas foram medidas na prévia de 31/10, com dados de demonstração. O que os concorrentes fazem vem de testes com dados fictícios ou, nos documentos 11, 13, 14, 15 e 16, de material público. Não prometo ganho de conversão em percentual, porque hoje não há medição (item 0.6).

## Resumo

**A tese:** a IA que lê publicação e sugere prazo já virou padrão de mercado. O Decreta se diferencia se **provar cada data e cada fato na própria tela**, numa interface compacta e rápida para quem passa o dia nela.

**A ordem:**

| Onda | Tema | Esforço | Por que nessa posição |
|---|---|---|---|
| 0 | Tornar verdadeiro o que já se promete | 3 sem | O cadastro está aberto, e o calendário, os termos e o encerramento de conta têm lacunas |
| 1 | Redesign compacto | 3,5 sem | É o seu pedido, não depende do servidor, e tudo que vem depois mostra estas telas |
| 2 | Landing, demonstração e primeiro minuto | 4 sem | Depende das ondas 0 e 1, e a janela de 15/01/2027 está perto |
| 3 | Cobrar a assinatura | 3 sem | Sem isso não dá para vender sem intervenção manual |
| 4 | A assinatura de uso | 4 sem | É o que torna o Decreta diferente no dia a dia, e precisa do redesign pronto |
| 5 | Peça que prova o que diz | 3 sem | Ataca a maior falha vista nos testes, mas depende do resultado do item 0.1 |
| 6 | Honorários e alvará | 3 a 4 sem | Maior lacuna funcional e última fase do plano de 31/10 ainda não iniciada |

Na mesma unidade, são cerca de 24 semanas. As ondas 0 a 2 somam cerca de 10 semanas, o que termina perto de 15/01/2027, data em que acaba o beta grátis do Jux, do Astrea (Plano, §5). Se o tempo apertar, o que sai primeiro é o item 1.5, porque as telas de detalhe podem vir depois.

A **pesquisa com escritórios** [05] corre em paralelo e não usa desenvolvimento. Ela pode mudar a ordem das ondas 4, 5 e 6 e decide o preço.

## O que a revisão encontrou

1. **A landing vende o que virou padrão e esconde o que não é.** Ela mostra DJEN, sugestão de prazo, briefing e peça. Não fala de "Verificar peça" com selo de citação, jurisprudência com fonte, dupla intimação, radar de precedentes, cálculos, leitura da peça contrária, mensagem ao cliente com aprovação nem do termo de IA. A certidão do DJEN aparece só numa resposta das dúvidas.
2. **O calendário de prazos só está completo para TJSC e TRT12.** Em `packages/core/src/calendario.ts`, os outros tribunais usam só os feriados nacionais e o recesso, inclusive o TRF4, oferecido no `/comecar`. Um dia sem expediente contado como útil antecipa a data. É o lado seguro, mas a conta fica errada, e a landing promete "os feriados forenses do tribunal" com o cadastro aberto para o país. O escritório pode cadastrar as próprias suspensões, desde que saiba que precisa.
3. **O cadastro não tem aceite de termos.** Não há página de termos nem de privacidade, só `/seguranca`. O escritório guarda dado sigiloso de terceiros, então isso é requisito [04].
4. **Não dá para encerrar a conta nem exportar tudo no app.** A única exportação encontrada é a de prazos. A queixa de cancelamento é recorrente no mercado [13, 15, 16], e o Decreta repetiria o problema.
5. **Nada mede a conversão.** Só há Sentry para erros, sem funil de visita, cadastro e ativação.
6. **O primeiro valor pode demorar.** Não encontrei busca imediata ao cadastrar a OAB. O `/comecar` diz que a busca é "todo dia útil": quem se cadastra na sexta à noite pode só ver publicações na segunda.
7. **Não há registro de o Decreta ter passado pelo teste que aplicamos aos concorrentes.** Pela leitura do código, a peça deveria se sair bem: o prompt manda não inventar e marcar [COMPLETAR]. Isso ainda precisa ser provado com a mesma petição.
8. **O preço "Sob consulta" contradiz o discurso.** É o que fazem Legal One e CPJ-3C, e os documentos recomendam o contrário [14, 15, 16].

## A tese de experiência

Cinco princípios, com o que cada um muda em relação ao mercado.

| Princípio | O que significa na tela | Como o mercado está hoje |
|---|---|---|
| **Prova na hora** | Toda data abre a própria conta, e todo fato abre o trecho de onde veio | Astrea, Projuris e ADVBOX aceitam data em feriado sem aviso. No EasyJur, a regra é só alegada [15] |
| **Fila, não menu** | O trabalho do dia é uma fila que se resolve pelo teclado, item a item | O CPJ-3C pede cerca de 14 horas de trilha por pessoa [11]. O ADVBOX prende a tarefa num catálogo de 149 tipos [10] |
| **Compacto e calmo** | Mais linhas na tela, poucos tamanhos de letra, cor só com significado | Sistemas amplos, com muitos módulos e pacotes [06, 08, 15] |
| **Honesto sobre o limite** | Dizer o que não faz, qual calendário usou e quando leu o DJEN pela última vez | EasyJur e Legal One têm páginas que se contradizem [15, 16] |
| **Entrar e sair sem falar com ninguém** | Demonstração sem cadastro, preço público, encerramento em dois cliques | O EasyJur passa por formulário, o Legal One não tem teste, e ADVBOX e Jurídico AI não mostraram botão de encerrar |

**O que continua valendo do plano de 31/10:** nenhum "aceitar tudo", confirmação consciente, nada de "zero alucinação" e nada de robô com senha de tribunal.

## Onda 0: tornar verdadeiro o que já se promete

**Por que primeiro:** o cadastro já está aberto, e os itens de maior peso aqui são data errada e risco legal. Nenhuma frase nova da landing se sustenta sem esta onda.

| # | Item | Dos documentos | Proposta minha | Diferencial frente ao mercado | Esforço |
|---|---|---|---|---|---|
| 0.1 | Passar o Decreta pelo mesmo teste | O protocolo: mesma petição, prazo em 15/11, contagem com 20/11 [06, 08, 09, 10, 12] | Registrar o resultado ao lado dos concorrentes e levar os casos para o conjunto-ouro | Vira base das afirmações de venda. Se a peça falhar, a onda 5 sobe | 1 a 2 d |
| 0.2 | Avisar dia sem expediente ao digitar a data | Data em feriado aceita sem aviso [06, 08, 10] | Aviso no próprio campo, com o nome do feriado e a data útil seguinte, sem bloquear. Hoje a tela mostra só o dia da semana | Nenhum sistema usado avisou | 1 d |
| 0.3 | Calendário por tribunal, com o limite à mostra | Calendário sem 20/11 no Projuris [08]; tabela de feriados sem dono no Legal One [16] | De imediato, a conta avisa quando usou só o calendário nacional. Depois, carregar Justiça Federal, TJSP, TJRJ, TJMG, TJPR e TJRS | A conta diz qual calendário usou e até quando foi conferido | 6 a 8 d |
| 0.4 | Termos, privacidade e tratamento de dados | Requisito para vender [04] | Aceite gravado com a versão, e cláusula clara sobre IA | É obrigação, mas a política do EasyJur nem cita IA [15]. Exige revisão jurídica | 2 d |
| 0.5 | Encerrar a conta e exportar tudo no app | LGPD e queixas de cancelamento [04, 08, 13, 14, 15, 16] | Dois cliques e um arquivo com dados e documentos, sem passar pelo suporte | Exportar arquivos no ADVBOX pode levar 45 dias, como serviço à parte [10] | 3 a 4 d |
| 0.6 | Medir o funil | Métricas de ativação e conversão [04] | Ferramenta sem cookie. Eventos: visita, demonstração, cadastro, OAB, primeira publicação e primeiro prazo confirmado | Interno: sem isso, "alta conversão" é opinião | 1 a 2 d |

## Onda 1: redesign compacto

**Por que agora:** é o seu pedido, tem risco baixo porque não mexe no servidor, e a landing e a demonstração vão mostrar estas telas. Fazer depois obrigaria a refazer as duas.

### O que as medidas mostram

- **Excesso de tamanhos:** o CSS usa 22 tamanhos de fonte, de 6,4 a 28 px, com vários meios-pontos como 11,5, 12,5, 13,5 e 14,5. As telas têm mais 70 tamanhos soltos (`text-[13px]`) e 49 estilos inline. Não existe nenhum token de texto em `tokens.css`.
- **Pouca informação na tela:** em 1366×768, o Hoje mostra 5 linhas, cada uma com 97 px. O conteúdo só começa a 212 px do topo, depois de um cabeçalho de 81 px e dos números, com 82 px.
- **Publicações, a tela da sua foto:** cada item da lista tem 92 px, e só 7 cabem na tela. Prazos usa 79 px por linha.
- **O problema é o conjunto:** o título da tela tem só 19 px. O peso vem do corpo em 14 px com entrelinha de 20 a 22, títulos em negrito no mesmo tamanho e 16 px de respiro em cada bloco.

### De, para

Valores de partida para o computador, a validar na tela.

| Elemento | Hoje | Proposta |
|---|---|---|
| Tamanhos de fonte | 22 | 6, em tokens |
| Legenda e rótulo | 10,5 a 12 px | 11/14 |
| Metadado, CNJ e data | 12 a 13,5 px | 12/16 |
| Corpo e linhas de lista | 14/20 | 13/18 |
| Título de tela | 19 a 20 px | 15/20 |
| Número de destaque | 24/32 | 20/24 |
| Leitura longa (teor, briefing, peça) | 14/22 | **14/21, mantido** |
| Botão e campo | 32 px | 28 px |
| Filtro em chip | 28 px | 24 px |
| Linha de lista | 79 a 97 px | 44 a 56 px, em duas linhas |
| Cabeçalho da tela | 81 px | 48 a 52 px, com subtítulo na mesma linha |
| Números do dia | 82 px | 44 px, número e rótulo na mesma linha |
| Menu lateral | 232 px | 208 px, recolhível para 52 px |
| Respiro de painel | 16 px | 12 px |

**Resultado esperado em 1366×768:** cerca de 12 linhas no Hoje e 12 itens em Publicações, contra 5 e 7 de hoje.

**O que não encolhe:**

- **Texto longo:** teor, briefing e peça continuam em 14 px, porque são lidos com atenção. A interface em volta é que fica compacta.
- **Celular:** continuam os alvos de 44 px e os campos de 16 px, que evitam o zoom automático no iPhone. Só diminuem os respiros.

### A página de Alvarás

O problema é real, e o código mostra onde está. Alvarás e Novos negócios usam o mesmo quadro, mas parecem dois produtos.

| | Alvarás | Novos negócios |
|---|---|---|
| Cor | 5 tons só dela, fixos em `app.css` (linhas 1188 a 1192), incluindo roxo e azul-petróleo | Neutra |
| Colunas | Fundo tingido pela etapa | Cinza |
| Cartão | Cerca de 70 px, texto de 12 a 13 px | Cerca de 134 px, título de 15 px |
| Totais | Ícones coloridos (`dc-total`), diferentes dos números do Hoje | Sem totais |

**A correção:** o cartão de Alvarás vira o padrão, porque a densidade dele é a certa. A cor é que sai. As colunas ficam neutras, a etapa vira um ponto discreto, o valor fica em grafite e só "parado" leva âmbar. Os totais passam a usar os mesmos números do Hoje.

### Itens

| # | Item | Dos documentos | Proposta minha | Diferencial frente ao mercado | Esforço |
|---|---|---|---|---|---|
| 1.1 | Escala de tipo e espaço em tokens | Nada direto | 6 tamanhos, grade de 4 px e fim dos valores soltos | Base de todo o resto | 2 d |
| 1.2 | Componentes-base densos | Nada direto | Botão, chip, campo, tabela, painel, cabeçalho e menu recolhível | Compactos sem parecer planilha | 2 a 3 d |
| 1.3 | Linhas de lista em duas linhas | Tela Hoje como núcleo [07] | Título, depois partes · vara · CNJ numa linha só, em Hoje, Prazos, Publicações, Processos e Clientes | O dobro de itens à vista | 3 a 4 d |
| 1.4 | Um só quadro | Quadros em todos os concorrentes [06, 08, 10] | Unificar Alvarás e Novos negócios, como descrito acima | Interno: coerência | 1,5 d |
| 1.5 | Telas de detalhe | Nada direto | Prazo, Processo, Peça, Perguntar e Agenda, com o bloco "Prazo sugerido" da sua foto mais enxuto | Decisão de prazo em menos rolagem | 5 d |
| 1.6 | Cor só com significado e decisão de identidade | Nada direto | Vermelho e âmbar para urgência, verde para confirmado, um único acento para a IA | A marca da IA fica sempre visível, o que mostra o que precisa de revisão | 1 d |
| 1.7 | Preferência de densidade | Nada direto | Compacto como padrão e "Confortável" opcional, por pessoa | Quem prefere letra maior não fica de fora | 0,5 d |
| 1.8 | Conferência visual automática | Nada direto | Capturas em 1366 e 390 px sobre a API de mentira dos testes | Evita regressão em cada tela | 1 d |

**O ramo `claude/identidade-visual-ba4ae6`:** propõe papel quente, grafite e Geist Mono, e tira o azul. Recomendo aproveitar a Geist Mono para CNJ, datas e valores, e o papel quente, que afasta o visual do branco e azul comum. Recomendo manter um acento só para a IA, porque sem ele a marca "IA" perde destaque. Vale ver os dois lado a lado já na versão compacta.

## Onda 2: landing, demonstração e primeiro minuto

**Por que agora:** depende de a promessa ser verdadeira (onda 0) e de as telas estarem prontas (onda 1). A janela é o fim do beta grátis do Jux, em 15/01/2027, logo depois do recesso.

| # | Item | Dos documentos | Proposta minha | Diferencial frente ao mercado | Esforço |
|---|---|---|---|---|---|
| 2.1 | Demonstração pública, sem cadastro | Dados de exemplo [04]; teste curto ou inexistente [12, 15, 16] | Publicar a prévia que já existe (`web:previa`), com aviso de que as respostas da IA são simuladas | Legal One e CPJ-3C não têm teste aberto, e o EasyJur passa por formulário. Aqui, um clique | 2 a 3 d |
| 2.2 | Conta de prazo aberta, dentro do hero | Prazo como vitrine [13, 14]; calculadora só em planos altos no Astrea [06] | Data, dias e tribunal, com o calendário animado pulando feriados. Roda no navegador com `@decreta/core` | No Astrea, a calculadora é do Company para cima. O chat da Jurídico AI recusa contar. Aqui é grátis e sem login | 3 a 4 d |
| 2.3 | Nova estrutura da landing | Ver a tabela abaixo | Ordem, texto e cortes | Ver a tabela abaixo | 5 d |
| 2.4 | Página de cobertura com a última leitura | Abrangência com data [13]; limites por tribunal [15] | Por tribunal: última leitura do DJEN e calendário usado, com dados que já existem | O Promad lista sem data, a Advise não dá periodicidade e o EasyJur diz 99% sem lista | 2 d |
| 2.5 | Preço público, numa frase | [08, 14, 15, 16]; Plano, §5 | Um único plano, com IA incluída, limite visível e cancelamento no app. Depende da pesquisa e do custo de IA medido em `uso_ia` | Advise tem 3 preços para o mesmo plano, EasyJur tem 5 medidores, Legal One não publica | 1 d + decisão |
| 2.6 | Landing estática e rápida | Nada direto | HTML pré-gerado, título, descrição e imagem de compartilhamento, e código separado do app. Hoje são 331 KB de JS comprimido, junto com o app, e o `index.html` não tem descrição | Abre rápido no 4G e pode ser encontrada em busca | 2 d |
| 2.7 | Primeiro minuto: OAB e busca na hora | Acervo no primeiro dia [06, 14, 15]; primeira entrada sem bloqueio [08] | Ao informar a OAB, buscar os últimos dias no DJEN e mostrar ao vivo: "achei 12, 5 com prazo" | Validação de até 72 h no Promad e no EasyJur, e busca retroativa pelo suporte na Advise | 5 d |
| 2.8 | Prova real, só com pilotos | Casos autodeclarados [16] | Depoimento com nome e OAB, com número medido. Sem piloto, a seção não entra | Nada inventado | Sem dev |

### A landing, seção por seção

**Hoje:** 11 seções, 10.787 px no computador e 16.081 px no celular. Meta: cerca de 7.000 e 10.000 px.

A nova ordem segue as perguntas de quem avalia: o que é, funciona mesmo, como fica meu dia, a IA inventa, o que falta, é seguro, quanto custa e como começo.

| # | Seção | O que mostra | Por que existe | Por que nessa posição |
|---|---|---|---|---|
| 1 | **Hero com a conta aberta** | Título, a conta interativa (2.2) e "Ver um escritório de exemplo" antes de "Criar conta" | Mostra a diferença em vez de só afirmar. Hoje a imagem é estática | Quem chega decide em segundos e já toca no produto |
| 2 | **O teste do feriado** | "Abra o seu sistema e digite um prazo para o próximo feriado", ao lado do aviso do Decreta | Só o Decreta pode dizer isso, porque testamos. Cria a dúvida sobre o sistema atual | Depois do hero, transforma curiosidade em motivo |
| 3 | **Da publicação à peça** | Uma tela fixa que se transforma ao rolar: DJEN, sugestão, conta, confirmação, briefing e peça | Junta "Prazos" e "IA", hoje com cerca de 2.100 px e cards separados | Depois do motivo, responde "como fica meu dia" |
| 4 | **Fonte em cada citação** | Selos de verificada, com ressalva e não verificada, e fato com evento e página | É a lacuna que a Fase 1 fechou e a landing não conta. A punição por citação inventada é real (Plano, §1) | A pergunta seguinte à peça é "e se a IA inventar?" |
| 5 | **O dia no celular** | Resumo no WhatsApp e tela Hoje, numa altura só | Ninguém faz resumo para o advogado pelo WhatsApp (Plano, §2). Hoje ocupa 1.889 px no celular | Quem já entendeu o fluxo pensa na própria rotina |
| 6 | **O dinheiro do cliente** | Alvará do expedido ao repassado | Não encontramos módulo igual nos concorrentes [06, 08, 10] | Segunda dor depois do prazo (Plano, §1) |
| 7 | **O que vem, e o que ainda não vem** | Lista densa de recursos, incluindo o que hoje está escondido, e o que falta: financeiro, portal e aplicativo | Substitui os 8 cartões de "Recursos", cujo título "num lugar só" promete demais | Tira objeções antes do preço. Dizer o limite também gera confiança |
| 8 | **Sigilo e OAB** | IA sem treino, isolamento, termo de IA, cliente sem IA e quem responde pelo produto | Quem compra precisa disso, e o kit da OAB não tem igual nas fontes públicas (Plano 0.5) | Última trava antes de falar de dinheiro |
| 9 | **Preço** | Um número, o que inclui, e como cancelar | Substitui "Sob consulta" | Depois do valor e da confiança |
| 10 | **Dúvidas de quem troca de sistema** | Como trago meus processos? Como cancelo? Meu tribunal está coberto? E se a IA errar? Tem aplicativo? | As dúvidas atuais não respondem às maiores objeções dos documentos | Resolve o que sobrou, perto da decisão |
| 11 | **Chamada final** | Demonstração e criar conta | Fecha para quem leu tudo | Fim da página |

**O que sai:**

- **Régua de fatos:** repete o hero.
- **"Como funciona":** entra na seção 3 e no primeiro minuto.
- **"Quem faz":** vira uma linha na seção 8, com nomes reais, até haver prova melhor.
- **Fundo em ASCII:** fica só no hero, porque é o elemento mais próprio da página.

**Cuidados:**

- **Sem nomes de concorrentes.** A seção 2 convida a repetir o teste e diz só que três sistemas testados aceitaram sem avisar. Vale revisão jurídica antes de publicar.
- **A data precisa ser calculada.** 15/11/2026 passa em duas semanas, então a seção mostra sempre o próximo feriado.
- **Ordem obrigatória.** As seções 1 e 2 só entram depois dos itens 0.2 e 0.3.

**Título sugerido para o hero**, a testar na pesquisa: *"Todo prazo com a conta à mostra."* Subtítulo: *"O Decreta lê o DJEN, conta os dias com o calendário do tribunal e mostra de onde saiu cada data. Uma pessoa confere e confirma."*

## Onda 3: cobrar a assinatura

**Por que agora:** hoje, liberar um escritório é um `update` direto no banco, e não há plano nem cobrança. Com a landing no ar, isso vira o gargalo.

| # | Item | Dos documentos | Proposta minha | Diferencial frente ao mercado | Esforço |
|---|---|---|---|---|---|
| 3.1 | Assinatura, teste e cancelamento | Fase 2 do roadmap [04] | Asaas, teste sem cartão, aviso antes do fim e só leitura ao acabar, sem apagar nada. Sem taxa de adesão | Cobrança e cancelamento são as queixas mais citadas [13, 15, 16] | 2 sem |
| 3.2 | Painel mínimo da plataforma | Fase 4 do roadmap [04] | Só o que falta para operar: escritórios, situação, ativar, estender teste, MRR, conversão e consumo de IA | Interno | 1 sem |

## Onda 4: a assinatura de uso

**Por que agora:** precisa do redesign e não bloqueia a venda. É o que faz alguém dizer que o Decreta é diferente depois de usar.

| # | Item | Dos documentos | Proposta minha | Diferencial frente ao mercado | Esforço |
|---|---|---|---|---|---|
| 4.1 | **Data viva** | Regra à vista [11, 13, 15]; o painel "A conta" já existe | Toda data de prazo, em qualquer tela, abre a conta com um calendário pequeno, a regra e os dias fora | Ninguém nos documentos mostra a conta junto da data | 3 a 4 d |
| 4.2 | **Fila de publicações pelo teclado** | Estados claros da publicação [11] | J e K navegam, C confirma, A ajusta, N "não gera prazo". O próximo item abre sozinho, até zerar a caixa. Sem confirmar em lote | Sem nada equivalente nos documentos. Mantém a confirmação consciente | 3 a 4 d |
| 4.3 | Busca que também age | Atalho "+" do Astrea [06] | ⌘K cria prazo, abre processo e confirma a partir de qualquer tela. Hoje só busca | Rapidez sem aprender menus | 2 a 3 d |
| 4.4 | Estado vazio que ensina | Primeiro uso por módulo [04, 06]; custo de treinar [11] | Cada tela vazia explica e oferece a primeira ação, sem tour | Empata com o Astrea, que é bom nisso, e evita as 14 horas do CPJ-3C | 3 d |
| 4.5 | Movimento que explica e resposta imediata | Queixas de lentidão [14, 15] | Transição entre lista e detalhe, atualização antes da resposta do servidor, pré-carga ao passar o mouse, de 120 a 180 ms, e respeito a "reduzir movimento" | Não medi a velocidade dos concorrentes. A meta é mudar de tela em menos de 200 ms | 3 d |
| 4.6 | Prazo interno configurável | [11, 12, 15, 16] | Dias de antecedência, sempre em dia útil e antes do fatal, com a regra à vista. Não existe hoje | No Legal One é fixo em fatal menos 2 dias [16]. Empata com a Jurídico AI [12] | 2 d |
| 4.7 | Salvar incompleto, com marcador | A melhor ideia do Projuris [08]; processo sem número [10] | Marca também o que não é monitorado e oferece buscar o número | Vai além do ADVBOX, que aceita sem alertar | 1 a 2 d |

## Onda 5: peça que prova o que diz

**Por que aqui:** é a falha mais clara do mercado: nos testes, Astrea, Projuris e Jurídico AI afirmaram algo sem base. Se o item 0.1 mostrar que o Decreta falha também, esta onda sobe para logo depois da onda 2.

| # | Item | Dos documentos | Proposta minha | Diferencial frente ao mercado | Esforço |
|---|---|---|---|---|---|
| 5.1 | Cada fato aponta para o trecho | [06, 08, 12]; Plano 5.1 | Levar à peça a ligação que o briefing já tem. Fato sem fonte sai marcado "a comprovar" | A etapa "anti-alucinação" da Jurídico AI deixou passar uma afirmação sem base [12] | 5 d |
| 5.2 | Estratégia editável e ajuste com prévia | [06, 12] | A estratégia mostra a prova de cada tese. O ajuste mostra antes e depois | Copia o bom desenho e acrescenta a evidência | 4 a 5 d |
| 5.3 | Nenhuma lacuna silenciosa | Frases quebradas no Astrea e na Jurídico AI [06, 12]; vírgulas soltas no ADVBOX [10] | Checagem por código antes de entregar: colchete, campo vazio e frase quebrada | Determinístico, em vez de confiar no modelo | 1 a 2 d |
| 5.4 | Julgado do acervo dentro da peça | [09, 12]. Hoje a peça é proibida de citar e deixa [JURISPRUDÊNCIA] | Preencher só com o acervo, com selo, papel do julgado e quantos apontam para cada lado | O Jus IA mostrou 7 de 29 fontes sem dizer da linha contrária [09] | 4 d |

## Onda 6: honorários e alvará

**Por que por último:** é grande, e o mercado já tem financeiro. O diferencial é uma parte pequena dele: o alvará que vira honorário e prestação de contas.

| # | Item | Dos documentos | Proposta minha | Diferencial frente ao mercado | Esforço |
|---|---|---|---|---|---|
| 6.1 | Honorários, cobrança e do alvará ao honorário | Plano, Fase 2; [06, 08, 15] | Começar por honorário, fatura e fluxo. Honorário por êxito nasce sem valor [06], e o alvará sacado calcula a parte do cliente | Prestação de contas a partir do alvará, que não encontramos nos concorrentes. Projuris tem repasse, mas sem alvará [08] | 3 a 4 sem |

## Depois, conforme os pilotos pedirem

| Item | Origem | Diferencial | Esforço |
|---|---|---|---|
| Etapas contadas a partir do prazo, com o mesmo motor | Workflow [06, 08, 10, 16] | Astrea caiu em feriado, ADVBOX conta corridos, Projuris ignora 20/11 | 1,5 sem |
| Avisos no celular | [07] | A landing diz "celular primeiro", e hoje não há aviso no aparelho | 1 sem |
| Página do caso por link, sem login | [11]; Plano 3.4 | Permissão mínima por padrão, sem os riscos do CPJ-Connect [11] | 1 sem |
| Painel do sócio | [01, 06, 10] | Sem pontos por tarefa, focado em risco e dinheiro | 1 sem |
| Quem viu e dupla conferência | [11, 13, 16] | Proteção barata contra prazo perdido | 3 a 4 d |
| Distribuição de publicações por critério | [11, 16] | Hoje isso aparece em produtos para equipes maiores | 3 a 4 d |
| Importar planilha | [08, 11, 15] | Avisar duplicidade, ao contrário do Projuris [08] | 1 sem |
| Panorama de julgados, com amostra à vista | [06, 09] | Recusar número sem amostra, como o Jus IA fez bem | 1 sem |
| Agrupar publicações repetidas | [11, 15] | Sem propagar prazo em massa | 3 d |

## O que fica de fora

| Não fazer agora | Por quê |
|---|---|
| Robô com senha ou certificado de tribunal | Plano, §6. Regra da Portaria CNJ 316/2024 e risco para o advogado |
| IA por módulo, por créditos ou por execução | Origem das queixas (Plano, §6) e da confusão no EasyJur [15] |
| Preço por módulo | Parece barato, mas o Projuris vai de R$ 292,90 a R$ 648,40 ligando tudo [08] |
| Catálogo fechado de tarefas e pontos | Barreira vista no ADVBOX [10] |
| Timesheet | Público de autônomos e de êxito. Só se o piloto pedir |
| Terceirizar trabalho jurídico | Outro negócio, com outro contrato [15] |
| Captura antecipada de ações | Serve à defesa de empresas e bancos [14] |
| Promessa de "zero alucinação" | Plano, §6 e §2. O selo diz onde foi encontrada e quando |
| Aplicativo nativo agora | O aviso no celular resolve a maior parte, por menos |

## Como saber que deu certo

| Métrica | Meta | Origem |
|---|---|---|
| Linhas à vista em 1366×768 | Hoje de 5 para cerca de 12 | Proposta |
| Tamanhos de fonte no CSS | De 22 para 6 | Proposta |
| Conta nova até a primeira publicação na tela | Menos de 2 minutos | Proposta |
| Ativação em 7 dias | 40% | [04] |
| Teste que vira assinatura | 15% | [04] |
| Cancelamento mensal | Menos de 3% | [04] |
| Prazos com o calendário do tribunal, não só o nacional | Medir e subir | Proposta |
| Fato da peça sem fonte e sem marca | 0 | Proposta |

## Decisões que dependem de você

1. **Preço público:** sair de "Sob consulta". Recomendo sair, com o valor definido pela pesquisa e pelo custo de IA.
2. **Identidade:** papel quente e grafite, com acento só na IA, como recomendo, ou seguir com o azul atual.
3. **O teste do feriado na landing:** é a seção mais forte e também a mais sensível. Recomendo usar, sem nomes e com revisão jurídica.
4. **Demonstração aberta:** publicar com IA simulada e aviso claro. Recomendo publicar.
5. **Quem assina o produto:** nomes e OAB na seção de sigilo, porque hoje a landing diz "sócios advogados" sem nome nem prova.
