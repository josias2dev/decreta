#!/usr/bin/env bash
# O Decreta no servidor. Roda como root (sudo), de dentro de /opt/decreta.
#
#   sudo deploy/decreta.sh preparar    uma vez: pastas, serviços, timer e o bloco do Caddy
#   sudo deploy/decreta.sh ativar      a cada deploy: dependências, migrations, reinício e o Inngest
#   sudo deploy/decreta.sh compilar    compila as telas aqui mesmo (se o CI não mandou apps/web/dist)
#   sudo deploy/decreta.sh estado      serviço, saúde, timer do backup e as últimas linhas do log
#   sudo deploy/decreta.sh logs        acompanha o log da API
#   sudo deploy/decreta.sh backup      faz um backup agora
#
# Nada aqui mexe no Caddyfile principal nem em outro sistema da máquina.
set -euo pipefail

APP=/opt/decreta
USUARIO=appsvc
PORTA=8791
BUN=/usr/local/bin/bun

cd "$APP"

falha() {
  echo "✗ $*" >&2
  exit 1
}
passo() { echo "→ $*"; }
como_app() { sudo -u "$USUARIO" -H env BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 "$@"; }

[ "$(id -u)" -eq 0 ] || falha "rode com sudo"
[ -f "$APP/.env" ] || falha "falta $APP/.env (copie deploy/env.producao.example e preencha)"

# O domínio sai do BETTER_AUTH_URL do .env.
dominio() {
  local url
  url=$(grep -E '^BETTER_AUTH_URL=' "$APP/.env" | tail -1 | cut -d= -f2-)
  url=${url#https://}
  url=${url#http://}
  echo "${url%%/*}"
}

esperar_saude() {
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  journalctl -u decreta-api -n 40 --no-pager >&2
  falha "a API não respondeu em /health"
}

preparar() {
  passo "permissões do .env e pasta de dados"
  chown "$USUARIO:$USUARIO" "$APP/.env"
  chmod 600 "$APP/.env"
  install -d -o "$USUARIO" -g "$USUARIO" -m 750 "$APP/data" "$APP/data/arquivos"

  passo "serviços do systemd"
  install -m 644 deploy/decreta-api.service deploy/decreta-backup.service deploy/decreta-backup.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable decreta-api.service decreta-backup.timer

  local d
  d=$(dominio)
  [ -n "$d" ] && [ "$d" != "decreta.exemplo.com.br" ] || falha "preencha BETTER_AUTH_URL no .env com o domínio de verdade"
  passo "bloco do Caddy para $d em /etc/caddy/decreta.caddy"
  sed "s/^DOMINIO {/$d {/" deploy/Caddyfile.decreta >/etc/caddy/decreta.caddy
  chmod 644 /etc/caddy/decreta.caddy

  if grep -qE '^\s*import\s+/etc/caddy/decreta\.caddy' /etc/caddy/Caddyfile; then
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    systemctl reload caddy
    echo "✓ Caddy recarregado com o Decreta"
  else
    cat <<EOF

Falta um passo à mão, combinado com quem cuida do Caddy da máquina:
  1. acrescente no fim de /etc/caddy/Caddyfile a linha
       import /etc/caddy/decreta.caddy
  2. sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy

O certificado sai sozinho (Let's Encrypt) quando o domínio $d já apontar para esta máquina.
EOF
  fi
}

compilar() {
  passo "dependências completas e build das telas"
  como_app "$BUN" install --frozen-lockfile
  # A máquina tem pouca memória: o build roda com prioridade baixa.
  como_app nice -n 10 "$BUN" run web:build
}

ativar() {
  [ -f apps/web/dist/index.html ] || falha "falta apps/web/dist (o CI manda; ou rode: sudo deploy/decreta.sh compilar)"
  chown -R "$USUARIO:$USUARIO" "$APP"
  chmod 600 "$APP/.env"

  passo "dependências de produção"
  como_app "$BUN" install --frozen-lockfile --production

  passo "migrations (como o dono do schema)"
  como_app "$BUN" --env-file="$APP/.env" packages/db/src/migrate.ts

  passo "reiniciando a API"
  systemctl restart decreta-api
  esperar_saude

  passo "registrando as funções no Inngest da máquina"
  # O SDK se registra no INNGEST_BASE_URL quando recebe um PUT. Sem cabeçalho
  # de proxy: a rota só aceita quem chama de dentro da máquina.
  curl -fsS -X PUT "http://127.0.0.1:$PORTA/api/inngest" -o /dev/null || falha "o registro no Inngest falhou (confira INNGEST_* no .env)"

  echo "✓ Decreta no ar: https://$(dominio)"
}

estado() {
  systemctl --no-pager --lines=0 status decreta-api || true
  echo
  curl -fsS "http://127.0.0.1:$PORTA/health" && echo || echo "✗ /health não respondeu"
  systemctl --no-pager list-timers decreta-backup.timer || true
  echo
  journalctl -u decreta-api -n 20 --no-pager
}

case "${1:-}" in
  preparar) preparar ;;
  compilar) compilar ;;
  ativar) ativar ;;
  estado) estado ;;
  logs) journalctl -u decreta-api -f ;;
  backup) systemctl start decreta-backup.service && journalctl -u decreta-backup -n 20 --no-pager ;;
  *)
    sed -n '2,11p' "$0"
    exit 1
    ;;
esac
