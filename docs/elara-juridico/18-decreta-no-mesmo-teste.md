# O Decreta no mesmo teste

Registro de 02/11/2026 do item 0.1 do [plano de ação](./17-plano-de-acao.md). Os concorrentes foram testados com uma petição fictícia e com datas em feriado ([seção "O que os testes mostraram"](./07-comparacao-com-o-decreta.md#o-que-os-testes-mostraram)). Aqui o Decreta passa pelos mesmos dois testes.

**Em uma frase:** a contagem e o aviso de feriado foram testados e passam. **A peça gerada não foi medida**, porque o gateway de IA de verdade não responde desta máquina. O que dá para afirmar da peça é só o que o Decreta manda para o modelo, e isso está abaixo, sem resultado inventado.

## A peça a partir da petição fictícia

### O que não foi possível

O `.env` desta máquina aponta `LLM_BASE_URL` para `127.0.0.1:8798`. Quem responde ali não é um modelo de verdade: nos dois pedidos simples que fiz, a resposta foi "Conversa de teste", com 300 tokens de entrada, e o pedido de peça pela rota `/pecas` voltou vazio. O gateway de verdade (o `openrouter-gateway` do projeto, em `127.0.0.1:8799` no servidor, como diz `deploy/env.producao.example`) não existe nesta máquina. Não procurei outra chave nem outro caminho para o modelo.

Resultado: **não há contestação gerada, então as quatro colunas da tabela do documento 07 ficam sem medida de saída.** Rodar o teste continua simples, com o gateway de verdade no `.env`:

```
bun run peticao-ficticia
```

O script (`apps/api/test/peticao-ficticia.ts`) usa o mesmo caminho da tela: cria a cliente (pessoa jurídica) e o processo com a ré no polo passivo, envia o PDF fictício (`anexos/peticao-ficticia.pdf`), cria o prazo "Contestação" e chama a rota `/pecas` com a instrução do teste. Gera a contestação duas vezes (só com o documento e depois de ler a petição como peça da outra parte), grava os textos em `anexos/teste-da-peticao/` e imprime o que dá para conferir por código: ré pessoa jurídica, valores e datas da petição, marcas `[COMPLETAR]`, número de julgado e palavras que costumam acompanhar prova inventada. Se o modelo devolver menos de 1.500 caracteres (modelo falso ou erro), ele para e diz isso. Quem lê o conteúdo continua sendo uma pessoa.

A instrução foi a mesma dada aos concorrentes: *"Represente a ré, pessoa jurídica de direito privado. A tese é de mero aborrecimento, sem dano moral indenizável. Não invente fato nem prova."*

### O que foi verificado: a entrada

`bun run peticao-ficticia -- --so-o-pedido` troca o modelo por um de mentira e guarda o que o Decreta manda para a IA ([o pedido da contestação](./anexos/teste-da-peticao-so-o-pedido/a-pedido-enviado-a-ia.md) e [o da leitura da peça contrária](./anexos/teste-da-peticao-so-o-pedido/b-pedido-da-leitura-da-peca-contraria.json)).

| Ponto | O que o pedido tem | Isso garante a saída? |
|---|---|---|
| Usou o PDF | O PDF de 2 páginas foi lido sem IA e entra inteiro no pedido, com marca de página (`[fl. 1]`, `[fl. 2]`): R$ 800,00, as datas de 10/09, 20/09, 05/10 e 27/09, o pedido de R$ 1.000,00 e o artigo 14 do CDC | Não. Garante que o modelo recebe o texto, não que o use bem |
| Ré pessoa jurídica | `Nosso cliente: TESTE CLIENTE FICTICIO, no polo passivo (réu)`, a lista de partes com a ré marcada como "nosso cliente" e a instrução de quem pediu | Não. O tipo "pessoa jurídica" da cliente só chega ao modelo pela qualificação (o CNPJ do cadastro). Sem CNPJ cadastrado, ele sabe pela petição e pela instrução |
| Fato ou prova sem base | O sistema manda: "Use só os fatos do material enviado. Onde faltar um dado […], escreva [COMPLETAR: o que falta] em vez de inventar" e trata o texto dos autos como dado, não como ordem | Não. É só instrução. **Nada confere por código se a peça afirma um fato que não está nos autos** (itens 5.1 e 5.3 do plano) |
| Julgados na peça | "Não cite jurisprudência com número, relator ou data" e, se ajudar, `[JURISPRUDÊNCIA: tese a pesquisar]` | Não. O "Verificar peça" confere os selos das citações que aparecerem, mas a saída não foi lida |
| Peça da outra parte | Para uma ré, a petição inicial é a peça contrária. A leitura recebe o texto inteiro e devolve pontos a rebater, que entram no pedido da peça seguinte | Não medido |

Uma coisa a registrar: na primeira execução do script, a cliente ficou no polo "ativo" porque esqueci de informar `poloCliente`, e o pedido saiu com "Nosso cliente: TESTE CLIENTE FICTICIO, no polo ativo (autor)" ao lado de "TESTE CLIENTE FICTICIO (passivo, nosso cliente)". Foi erro do script, já corrigido: o formulário de novo processo mantém o polo e as partes juntos. Mas a API aceita os dois dados em desacordo, e o modelo recebe a contradição. Não mudei isso.

### Depois da Onda 5

A coluna "Fato ou prova sem base" deixou de depender só de instrução: a peça gerada passa pela conferência dos fatos (a IA liga cada afirmação a um trecho, e o código confere se o trecho existe e se datas e valores batem; o que não confere sai `[A COMPROVAR: ...]`), pela checagem "antes de protocolar" (frase quebrada, campo em branco, marca interna, força sem citação e parte diferente do cadastro) e, nos julgados, pelo acervo. A ré pessoa jurídica agora vem do cadastro, mesmo sem CNPJ na ficha.

**Continua sem medida com o modelo de verdade.** Os testes usam IA de mentira, e o que está acima é a régua, não o resultado. Para medir, com o gateway no `.env`: `bun run peticao-ficticia` (imprime a conferência de cada contestação) e `bun run avaliar` (o conjunto-ouro ganhou três casos de peça: este teste, a lacuna silenciosa da tempestividade e o julgado de memória).

### O que isso deixa em aberto

- A tabela do documento 07 recebe uma linha do Decreta com "saída não medida". Ela só vira prova de venda depois de rodar o script com o gateway de verdade e ler as peças.
- O plano diz que, se a peça falhar, a Onda 5 sobe. Hoje não dá para dizer que falha nem que passa. Pela leitura do pedido, o risco que sobra é o da coluna "Fato ou prova sem base": proteção só por instrução.
- Os casos de prazo e feriado da petição (abaixo) são determinísticos e já estão nos testes. Não entraram no conjunto-ouro da IA (`packages/ia/src/conjunto-ouro.ts`), que mede sugestões de modelo, e sim nos testes do motor.

## O prazo em feriado e a conta com 20/11

Estes dois casos passam, por testes.

**Data digitada em feriado.** No ajuste do prazo e na confirmação da publicação, quem marca "Sei a data final" e digita 15/11/2026 vê na hora, no calendário do processo (feriados locais e suspensões do escritório incluídos):

> 15/11/2026 é domingo e feriado (Proclamação da República). O próximo dia útil é 16/11/2026.

O aviso não bloqueia: a data digitada continua valendo e fica marcada como "digitada à mão", com a conta do Decreta ao lado. Testes: `packages/core/test/dia-sem-expediente.test.ts`, `apps/api/test/prazo-auditavel.test.ts` e `apps/web/e2e/calendario-do-tribunal.e2e.ts`. O mesmo vale para sábado, feriado em dia de semana, recesso, 7 a 20 de janeiro e expediente reduzido.

**Contagem com 20/11.** Publicada em 30/10/2026 no TJSC, 15 dias úteis:

> Começa em 03/11, primeiro dia útil depois da publicação. Fora da conta: fins de semana, 20/11 (Consciência Negra).

Vence em 24/11/2026, o mesmo caso do conjunto-ouro (`packages/ia/src/conjunto-ouro.ts`). Teste: `packages/core/test/calendarios-por-tribunal.test.ts`, que também mostra o que muda em outros tribunais (por exemplo, em agosto o 11/08 empurra o vencimento na Justiça Federal e não no TJSC).

**O limite.** Quando o tribunal do processo não tem calendário próprio no Decreta, a conta diz isso no painel "A conta" e na prévia dos diálogos. Com o item 0.3 ficaram com calendário próprio TJSC, TRT12, TRF1 a TRF6, TJSP, TJRJ e TJMG. TJPR e TJRS seguem com o aviso, porque o calendário deles sai por ato de cada ano e não consegui confirmar uma regra fixa na fonte oficial.
