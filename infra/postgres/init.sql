-- Roda uma vez, na criação do volume. `app_user` também é criado pela
-- migration 0000 (idempotente); aqui ele precisa existir antes para o usuário
-- de conexão da API herdar dele.
CREATE ROLE app_user NOLOGIN;
CREATE ROLE dc_app LOGIN PASSWORD 'dc_app' IN ROLE app_user;
