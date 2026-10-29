-- Banco e papéis do Decreta no Postgres 16 da máquina (localhost:5432).
-- Roda uma vez, como superusuário, com as duas senhas na linha de comando:
--
--   sudo -u postgres psql -v senha_dono="$(openssl rand -hex 24)" -v senha_app="$(openssl rand -hex 24)" -f deploy/postgres.sql
--
-- (guarde as senhas: vão no .env, em DATABASE_OWNER_URL e DATABASE_URL.)
--
-- Papéis:
--   decreta_owner  dono do schema; roda as migrations e o backup. Nunca usado pela API.
--   app_user       grupo sem login, sujeito a RLS. As políticas das tabelas valem para ele.
--   decreta_app    login da API, membro de app_user.
--
-- `app_user` é um nome do servidor inteiro e outro sistema da máquina pode usar
-- o mesmo nome. Por isso o CONNECT no banco do Decreta é tirado de PUBLIC e
-- dado só aos dois papéis daqui: quem é de outro sistema não entra no banco.
\set ON_ERROR_STOP on

CREATE ROLE decreta_owner LOGIN PASSWORD :'senha_dono';
SELECT 'CREATE ROLE app_user NOLOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') \gexec
CREATE ROLE decreta_app LOGIN PASSWORD :'senha_app' IN ROLE app_user;
-- Sem isto o pool da API pode tomar conexões que os outros sistemas da máquina usam (max_connections 100).
ALTER ROLE decreta_app CONNECTION LIMIT 15;

-- Ordem alfabética do português (Ângela antes de Bruno), pelo ICU.
CREATE DATABASE decreta OWNER decreta_owner ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'pt-BR' LOCALE 'C.UTF-8' TEMPLATE template0;
REVOKE CONNECT, TEMPORARY ON DATABASE decreta FROM PUBLIC;
GRANT CONNECT ON DATABASE decreta TO decreta_owner, decreta_app;

-- Banco vazio onde o backup de domingo é restaurado e conferido (BACKUP_VERIFY_URL).
CREATE DATABASE decreta_restauracao OWNER decreta_owner ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'pt-BR' LOCALE 'C.UTF-8' TEMPLATE template0;
REVOKE CONNECT, TEMPORARY ON DATABASE decreta_restauracao FROM PUBLIC;
GRANT CONNECT ON DATABASE decreta_restauracao TO decreta_owner;

\c decreta
-- O schema public é do dono do banco (Postgres 15+). Ninguém mais cria objetos nele.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
\c decreta_restauracao
REVOKE ALL ON SCHEMA public FROM PUBLIC;
