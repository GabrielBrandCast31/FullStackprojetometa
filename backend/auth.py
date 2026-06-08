"""Autenticacao do Dashboard: cadastro de funcionarios, login e JWT.

Os usuarios ficam no Postgres (servico `postgres` do compose). A pagina de
cadastro e protegida por uma senha de administrador (ADMIN_PASSWORD no .env)
que so o dono do app conhece -- sem ela ninguem consegue criar novos acessos.

Conexao: lida do env DATABASE_URL (ex.: postgresql://user:pass@host:5432/db).
"""

import os
import time

import bcrypt
import jwt
import psycopg

JWT_ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 60 * 60 * 12  # token expira em 12 horas


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "")
    if not url:
        raise AuthError("DATABASE_URL nao definida no .env do servidor.")
    return url


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "")


def _admin_password() -> str:
    return os.getenv("ADMIN_PASSWORD", "")


class AuthError(Exception):
    """Erro de autenticacao com mensagem segura para mostrar ao usuario."""


def _connect() -> psycopg.Connection:
    """Abre uma nova conexao com o Postgres.

    Connection-per-call eh simples e suficiente pro volume desse app
    (poucos logins por dia). Trocar por pool se a carga subir.
    """
    return psycopg.connect(_database_url(), autocommit=True)


def init_db() -> None:
    """Garante que a tabela users existe. Idempotente.

    Em producao a seed.sql ja cria o schema; isso aqui eh um fallback pra
    dev local sem rodar o seed.
    """
    try:
        url = _database_url()
    except AuthError:
        # Sem DATABASE_URL nao tenta nada — vai falhar mais tarde com mensagem clara.
        return
    try:
        with psycopg.connect(url, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id            BIGSERIAL PRIMARY KEY,
                    name          TEXT NOT NULL,
                    email         TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    meta_token    TEXT,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            # Migracao idempotente para instancias antigas que ja tinham a tabela
            # sem a coluna meta_token.
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS meta_token TEXT")
            cur.execute(
                "CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))"
            )
    except psycopg.OperationalError:
        # Banco indisponivel no boot — toleramos: o erro vai aparecer no /login.
        pass


def get_meta_token(user_id: int | str) -> str:
    """Devolve o access token do Meta armazenado pra esse usuario, ou ""."""
    with _connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT meta_token FROM users WHERE id = %s", (int(user_id),))
        row = cur.fetchone()
    return (row[0] if row and row[0] else "") or ""


def set_meta_token(user_id: int | str, token: str) -> None:
    """Salva (ou substitui) o access token do Meta pra esse usuario."""
    with _connect() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET meta_token = %s WHERE id = %s",
                    (token or None, int(user_id)))


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def register_user(name: str, email: str, password: str, admin_password: str) -> dict:
    """Cadastra um funcionario. Exige a senha de administrador correta."""
    if not _admin_password():
        raise AuthError("Cadastro indisponivel: defina ADMIN_PASSWORD no .env do servidor.")
    if admin_password != _admin_password():
        raise AuthError("Senha de administrador incorreta.")

    name = (name or "").strip()
    email = (email or "").strip().lower()
    if not name or not email or not password:
        raise AuthError("Preencha nome, e-mail e senha.")
    if "@" not in email or "." not in email:
        raise AuthError("Informe um e-mail valido.")
    if len(password) < 6:
        raise AuthError("A senha deve ter ao menos 6 caracteres.")

    with _connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE lower(email) = %s", (email,))
        if cur.fetchone():
            raise AuthError("Ja existe um funcionario com esse e-mail.")
        cur.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
            (name, email, _hash_password(password)),
        )
    return {"name": name, "email": email}


def login(email: str, password: str) -> str:
    """Valida e-mail/senha e devolve um JWT assinado."""
    if not _jwt_secret():
        raise AuthError("Login indisponivel: defina JWT_SECRET no .env do servidor.")

    email = (email or "").strip().lower()
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, email, password_hash FROM users WHERE lower(email) = %s",
            (email,),
        )
        row = cur.fetchone()
    if not row or not _check_password(password or "", row[3]):
        raise AuthError("E-mail ou senha incorretos.")

    uid, uname, uemail, _hash = row
    now = int(time.time())
    payload = {
        "sub": str(uid),
        "name": uname,
        "email": uemail,
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Decodifica o JWT. Devolve o payload, ou None se for invalido/expirado."""
    secret = _jwt_secret()
    if not secret or not token:
        return None
    try:
        return jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
