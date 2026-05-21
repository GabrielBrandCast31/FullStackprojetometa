-- ============================================================================
-- SEED do Dashboard Meta Ads — Postgres
-- ============================================================================
-- Cria a tabela `users` e o usuario administrador inicial.
-- Todo o script eh IDEMPOTENTE: pode rodar varias vezes sem quebrar nada
-- (CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING).
--
-- COMO RODAR NA VPS:
--   1) Suba os containers:           docker compose up -d
--   2) (opcional) Edite os 3 valores do INSERT abaixo (nome/email/senha).
--   3) Execute a seed dentro do container postgres:
--
--        docker compose exec -T postgres \
--          psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /seed/seed.sql
--
--      Ou entre no container e rode interativamente:
--
--        docker compose exec postgres bash
--        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /seed/seed.sql
--
--   4) Confirme:  SELECT id, name, email, created_at FROM users;
-- ============================================================================

-- pgcrypto: usado para gerar o hash bcrypt do password do admin direto em SQL.
-- O hash gerado por `crypt(senha, gen_salt('bf', 12))` eh compativel com o
-- modulo `bcrypt` do Python, que o backend (auth.py) usa para validar o login.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- tabela users ----------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Login eh case-insensitive: index em lower(email) acelera a busca.
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- ---------- admin inicial ---------------------------------------------------
-- !!! TROQUE OS 3 VALORES ANTES DE RODAR EM PRODUCAO !!!
-- Senha padrao apenas para bootstrap — mude o quanto antes via novo cadastro
-- pela tela /register (precisa de ADMIN_PASSWORD).
INSERT INTO users (name, email, password_hash)
VALUES (
    'Administrador',
    'admin@brandcast.com.br',
    crypt('TROQUE_ESTA_SENHA', gen_salt('bf', 12))
)
ON CONFLICT (email) DO NOTHING;

-- ---------- conferencia -----------------------------------------------------
SELECT id, name, email, created_at FROM users ORDER BY id;
