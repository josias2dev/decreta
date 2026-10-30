# Instalar o Decreta no servidor

O Decreta roda na máquina que já tem o AgenteHost e os outros sistemas
(Ubuntu 24.04, 2 vCPU, 1,9 GB de RAM). Ele usa o que já existe lá e não instala
um segundo de nada:

| Peça | Onde |
|---|---|
| API e telas | `decreta-api.service`, usuário `appsvc`, `/opt/decreta`, escutando só em `127.0.0.1:8791`, com `MemoryMax=400M` |
| HTTPS | o Caddy da máquina, na 443, com certificado automático do Let's Encrypt |
| Banco | o Postgres 16 da máquina, banco `decreta` com papéis próprios |
| Rotinas (DJEN, DataJud, resumo da manhã) | o Inngest da máquina (`127.0.0.1:8288`), como mais um app |
| IA | o openrouter-gateway (`127.0.0.1:8799`), projeto `decreta` |
| WhatsApp | o wameow (`127.0.0.1:8080`) |
| Arquivos e backup | Cloudflare R2 (o disco da máquina está quase cheio) |

Sem túnel da Cloudflare: o acesso entra direto pelas portas 80 e 443, como o
AgenteHost hoje.

## 1. Domínio

O domínio é `decreta.site`. Na Hostinger, no DNS dele, o registro **A** de `@`
aponta para `201.23.84.78` (TTL 300); o `www` já é um CNAME para o domínio e o
Caddy redireciona para ele. Para um subdomínio (por exemplo `app.`), o nome do registro é o
subdomínio. Se já existir um registro AAAA para o mesmo nome apontando para outro
lugar, ele sai, senão parte das pessoas cai no endereço errado.

O certificado só sai depois que o domínio aponta para a máquina; dá para fazer
este passo primeiro e seguir com os outros enquanto o DNS espalha.

## 2. Pasta e chave de deploy

```sh
sudo install -d -o appsvc -g appsvc -m 750 /opt/decreta
```

O deploy é o workflow **Deploy** do GitHub (Actions → Deploy → Run workflow): ele
compila as telas, manda os arquivos por rsync e roda `deploy/decreta.sh ativar`.
Para ele entrar na máquina:

```sh
ssh-keygen -t ed25519 -N "" -C decreta-deploy -f decreta-deploy   # no seu computador
ssh-keyscan 201.23.84.78                                          # vira DEPLOY_KNOWN_HOSTS
```

A chave pública (`decreta-deploy.pub`) vai em `~ubuntu/.ssh/authorized_keys` no
servidor. No GitHub, em Settings → Secrets and variables → Actions, os segredos
`DEPLOY_HOST` (`201.23.84.78`), `DEPLOY_USER` (`ubuntu`), `DEPLOY_SSH_KEY` (o
conteúdo de `decreta-deploy`) e `DEPLOY_KNOWN_HOSTS`. Crie também o ambiente
`producao` (Settings → Environments), que o workflow usa.

Rode o **Deploy** uma vez agora. Ele termina com "falta /opt/decreta/.env": é o
esperado, os arquivos já chegaram.

## 3. O `.env`

```sh
cd /opt/decreta
sudo install -m 600 -o appsvc -g appsvc deploy/env.producao.example .env
sudo -u appsvc nano .env
```

As senhas do banco ficam para o passo 4, que as grava sozinho. O resto (cada
linha do modelo explica a sua):

- **Domínio**: `BETTER_AUTH_URL` e `WEB_ORIGIN` com `https://` e o domínio do passo 1.
- **Segredo da sessão**: `BETTER_AUTH_SECRET` com `openssl rand -hex 32`.
- **Inngest**: `INNGEST_EVENT_KEY` e `INNGEST_SIGNING_KEY` são as mesmas do AgenteHost.
  Elas estão no arquivo que aparece em `EnvironmentFile=` de `systemctl cat plataforma-api`.
  Copie de um arquivo para o outro sem imprimir na tela.
- **IA**: no openrouter-gateway, o projeto `decreta` com ZDR em todos os perfis,
  teto diário e os aliases `juridico`, `autos`, `documentos`, `pdf` e `vision`.
  A chave `gw_` do projeto vai em `LLM_API_KEY`. Sem ela o Decreta funciona e as
  telas avisam que a IA está desligada.
- **DataJud**: `DATAJUD_API_KEY` é a chave pública da wiki do DataJud.
- **WhatsApp**: `WAMEOW_TOKEN` do número que manda o resumo da manhã.
- **R2**: dois buckets, `decreta-arquivos` e `decreta-backups`, cada um com a sua
  chave de API (a do backup só escreve no bucket dela). Sem R2, `ARQUIVOS=disco`
  guarda os documentos em `/opt/decreta/data/arquivos`, mas o disco tem pouco espaço.
- **Backup**: `BACKUP_KEY` com `openssl rand -base64 32`. Guarde uma cópia fora
  do servidor (no cofre de senhas do escritório): sem ela nenhum backup abre.
- **E-mail**: `RESEND_API_KEY` para os convites e o "esqueci a senha" saírem por
  e-mail. Sem ela, a tela da Equipe mostra o link do convite para copiar.

## 4. Banco

```sh
cd /opt/decreta
SENHA_DONO=$(openssl rand -hex 24); SENHA_APP=$(openssl rand -hex 24)
sudo cat deploy/postgres.sql | sudo -u postgres psql -q -v senha_dono="$SENHA_DONO" -v senha_app="$SENHA_APP" -f -
sudo sed -i "s/SENHA_DONO/$SENHA_DONO/g; s/SENHA_APP/$SENHA_APP/g" .env
unset SENHA_DONO SENHA_APP
```

Cria `decreta_owner` (dono, migrations e backup), `decreta_app` (a API, sujeita
ao RLS), o banco `decreta` com a ordem alfabética do português e o
`decreta_restauracao` (onde o backup de domingo é conferido), e grava as senhas no
`.env` sem mostrar. Só esses dois papéis conectam no banco do Decreta.

## 5. Serviços e Caddy

```sh
cd /opt/decreta
sudo deploy/decreta.sh preparar
```

Instala `decreta-api.service`, `decreta-backup.service`, `decreta-backup.timer` e
a renovação da demonstração (desligada até o passo opcional abaixo) e grava o bloco do Caddy em `/etc/caddy/decreta.caddy`. O Caddyfile principal não
é tocado. Combinado com quem cuida dele, falta uma linha no fim de
`/etc/caddy/Caddyfile`:

```
import /etc/caddy/decreta.caddy
```

e então `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

## 6. No ar

```sh
sudo deploy/decreta.sh ativar
```

Instala as dependências, roda as migrations, sobe a API, espera o `/health` e
registra as rotinas no Inngest. Daí em diante, cada deploy é só o workflow
**Deploy**.

## 7. O escritório

```sh
cd /opt/decreta
sudo -u appsvc bun --env-file=.env apps/api/src/scripts/criar-escritorio.ts \
  --nome "Nome do Escritório" --slug nome-do-escritorio \
  --email socia@escritorio.adv.br --pessoa "Nome da Sócia" --oab 12345/SC
```

Sai uma senha provisória. A pessoa entra, troca a senha em Minha conta e liga a
verificação em duas etapas. O resto da equipe entra por convite, pela tela da
Equipe; a OAB de cada advogado vai na Equipe também, porque é por ela que o DJEN
é buscado.

### Demonstração (opcional)

```sh
sudo sed -i 's|^DEMONSTRACAO_SENHA=.*|DEMONSTRACAO_SENHA=a senha da demonstração|' /opt/decreta/.env
sudo deploy/decreta.sh demonstracao
```

Cria o escritório "Souza & Freitas Advocacia", com dados inventados, para mostrar
o Decreta: entra-se como teste@decreta.site (a sócia) ou rafael@, tiago@ e
camila@demo.decreta.app. Liga também o `decreta-demonstracao.timer`, que toda
madrugada às 04:15 refaz os dados com as datas do dia, sem tirar ninguém do
sistema, e volta a senha para `DEMONSTRACAO_SENHA`. Como a conta é de todos, ela
não troca senha nem e-mail e não liga a verificação em duas etapas. A busca no DJEN
e no DataJud não roda para esse escritório. Os documentos dele ocupam uns 3 MB.

## Conferir

```sh
sudo deploy/decreta.sh estado     # serviço, /health, próximo backup e o log
sudo deploy/decreta.sh backup     # um backup agora
sudo deploy/decreta.sh logs       # o log ao vivo
```

Na tela: entrar, abrir Configurações → Avisos e captura → "Mandar teste" para o
WhatsApp, e Publicações → buscar agora.

## Recomendado na máquina

O `/var/log` está com 2 GB. Limitar o journald a 200 MB vale para todos os
sistemas da máquina, então é uma decisão de quem cuida dela:

```ini
# /etc/systemd/journald.conf.d/limite.conf
[Journal]
SystemMaxUse=200M
```

e `sudo systemctl restart systemd-journald`.
