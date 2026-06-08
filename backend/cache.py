"""Cache em memoria simples (TTL=30 min) pras chamadas a Marketing API.

Single-instance: dicionario global protegido por lock. Pra producao multi-instancia,
trocar por Redis.
"""

import threading
import time
from typing import Any

DEFAULT_TTL = 30 * 60  # 30 minutos

_store: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def get(key: str) -> Any | None:
    """Devolve o valor cacheado se ainda for valido; senao, None.

    Entradas expiradas sao removidas durante a busca (cleanup lazy).
    """
    with _lock:
        entry = _store.get(key)
        if not entry:
            return None
        timestamp, value = entry
        if time.time() - timestamp > DEFAULT_TTL:
            _store.pop(key, None)
            return None
        return value


def set(key: str, value: Any) -> None:  # noqa: A001 — shadow builtin OK
    """Grava o valor no cache com timestamp atual."""
    with _lock:
        _store[key] = (time.time(), value)


def invalidate(prefix: str = "") -> int:
    """Remove entradas cujo key comeca com `prefix`. Vazio = limpa tudo."""
    with _lock:
        if not prefix:
            n = len(_store)
            _store.clear()
            return n
        keys = [k for k in _store if k.startswith(prefix)]
        for k in keys:
            _store.pop(k, None)
        return len(keys)


def stats() -> dict:
    """Snapshot do cache (qtd de entradas, mais antiga). Usado pra debug."""
    with _lock:
        now = time.time()
        if not _store:
            return {"entries": 0}
        ages = [now - ts for ts, _ in _store.values()]
        return {
            "entries": len(_store),
            "oldest_seconds": int(max(ages)),
            "newest_seconds": int(min(ages)),
        }
