# Decreta

Prazos, publicações e processos do escritório, com a IA lendo os autos.
A IA sugere; uma pessoa confirma. Feito para o celular primeiro, com tudo também
no computador.

- **Publicações**: o DJEN é buscado pelas OABs da equipe às 06:40, 12:40 e 18:40
  (dias úteis). A IA lê o teor e sugere o prazo; o motor de prazos conta os dias
  (úteis, corridos, feriados forenses do tribunal, suspensões do escritório) e a
  pessoa confirma ou ajusta.
- **Prazos**: briefing de cada prazo (o que o juízo decidiu, o que fazer, a favor e
  contra), histórico e o responsável. O resumo da manhã sai pelo WhatsApp.
- **Processos**: movimentações do DataJud e do DJEN, resumo dos autos, documentos,
  partes, audiências, alvarás e o chat do processo.
- **Peças**: a IA escreve no timbre do escritório (ou a pessoa escreve à mão) e o
  DOCX sai pronto, com os trechos a completar marcados.
- **Clientes, agenda, novos negócios, alvarás, documentos, equipe** com convite e
  verificação em duas etapas.

Dados de cliente são sigilosos (LGPD): o código, a demonstração e os testes usam
só dados inventados.

## Pastas

| Pasta | O que tem |
|---|---|
| `apps/api` | API (Bun + Hono): rotas, sessão (Better Auth), rotinas do Inngest e as telas compiladas |
| `apps/web` | Telas (React 19, Vite, TanStack Router e Query, Tailwind 4) |
| `packages/core` | Motor de prazos, número CNJ, texto das peças |
| `packages/db` | Esquema (Drizzle), migrations e RLS por escritório |
| `packages/ia` | Cliente do gateway de IA e os pedidos (sugestão de prazo, briefing, peça, chat) |
| `packages/tribunais` | DJEN e DataJud |
| `packages/documentos` | Arquivos (disco ou R2), leitura de PDF e DOCX, DOCX no timbre |
| `deploy` | Servidor: systemd, Caddy, Postgres, backup e `decreta.sh` ([INSTALL.md](deploy/INSTALL.md)) |

## Rodar na máquina

Precisa de Bun 1.4.4 e Docker.

```sh
cp .env.example .env              # e troque o BETTER_AUTH_SECRET
docker compose up -d              # Postgres na 5433 e o Inngest de desenvolvimento na 8288
bun install
bun run db:migrate
bun run demonstracao              # escritório de demonstração com dados inventados
bun run dev                       # API na 8787
bun run web                       # telas em http://localhost:5173
```

A demonstração cria quatro pessoas (beatriz@, rafael@, tiago@ e camila@demo.decreta.app)
e um escritório com uns 130 clientes e 150 processos inventados, de oito áreas, com
andamentos, documentos, prazos, audiências e alvarás. A senha sai na tela, ou passe
`--senha`. `--renovar` refaz os dados com as datas de hoje sem mexer nas contas (no
servidor, o `decreta-demonstracao.timer` faz isso toda madrugada) e `--recriar` apaga
tudo, contas inclusive. A busca no DJEN e no DataJud nunca roda para a demonstração:
as OABs e os números de processo dela são inventados e poderiam ser de alguém.

## Testes

```sh
bun run typecheck
bun test                          # precisa do TEST_OWNER_URL do .env (Postgres do compose)
bun run web:build && bun run web:e2e
```

Os testes de tela usam uma API de mentira (`apps/web/e2e/apoio.ts`) que responde com
as amostras de `apps/web/e2e/amostras`. Mudou uma resposta da API? Gere de novo:

```sh
TEST_OWNER_URL=postgres://dc_owner:dc_owner@localhost:5433/postgres bun apps/api/test/amostras.ts
```

O CI (`.github/workflows/ci.yml`) roda tudo isso a cada push.

## Servidor

O Decreta roda na máquina do escritório, ao lado dos outros sistemas: API em
`127.0.0.1:8791` (systemd, usuário `appsvc`, em `/opt/decreta`), Caddy na 443 com
o certificado automático, Postgres e Inngest da própria máquina, IA pelo
openrouter-gateway (projeto `decreta`, com ZDR e teto diário). O passo a passo está em
[deploy/INSTALL.md](deploy/INSTALL.md); o deploy é o workflow **Deploy**, disparado à mão.
