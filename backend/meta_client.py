"""Cliente da Graph API do Meta (Marketing API).

Faz as chamadas para buscar campanhas e suas metricas (insights).
O access token nunca e armazenado - ele chega por requisicao e e usado na hora.
"""

import asyncio

# pyrefly: ignore [missing-import]
import httpx

GRAPH = "https://graph.facebook.com"


class MetaAPIError(Exception):
    """Erro retornado pela Graph API do Meta (token invalido, permissao, etc.)."""


def cents(v) -> float:
    """Converte um valor monetario do Meta (string em centavos) para reais."""
    try:
        return round(float(v) / 100, 2)
    except (TypeError, ValueError):
        return 0.0


async def _request(
    client: httpx.AsyncClient, url: str, params: dict | None = None, retries: int = 2
) -> dict:
    """Faz um GET e trata o envelope de erro padrao do Meta.

    Erros 5xx (instabilidade do Meta) sao tentados novamente algumas vezes.
    """
    resp = await client.get(url, params=params)
    try:
        data = resp.json()
    except ValueError:
        if resp.status_code >= 500 and retries > 0:
            await asyncio.sleep(0.6)
            return await _request(client, url, params, retries - 1)
        raise MetaAPIError(f"Resposta invalida da API do Meta (HTTP {resp.status_code}).")

    if "error" in data:
        err = data["error"]
        msg = err.get("error_user_msg") or err.get("message") or "Erro desconhecido."
        raise MetaAPIError(msg)
    return data


async def _paged(client: httpx.AsyncClient, url: str, params: dict) -> list[dict]:
    """Percorre todas as paginas de um endpoint de lista."""
    items: list[dict] = []
    data = await _request(client, url, params)
    items.extend(data.get("data", []))

    next_url = data.get("paging", {}).get("next")
    guard = 0
    while next_url and guard < 50:
        data = await _request(client, next_url)
        items.extend(data.get("data", []))
        next_url = data.get("paging", {}).get("next")
        guard += 1
    return items


ACCOUNT_FIELDS = (
    "account_id,name,currency,account_status,amount_spent,spend_cap,balance"
)


async def fetch_account(client, version, account_id, token) -> dict:
    """Dados da conta de anuncios (nome, moeda, status, saldo/limite de gastos)."""
    url = f"{GRAPH}/{version}/act_{account_id}"
    params = {"fields": ACCOUNT_FIELDS, "access_token": token}
    return await _request(client, url, params)


async def fetch_ad_accounts(client, version, token) -> list[dict]:
    """Lista as contas de anuncio diretamente associadas ao token (fallback).

    Costuma trazer apenas contas pessoais; o caminho principal e via Business.
    """
    url = f"{GRAPH}/{version}/me/adaccounts"
    params = {"fields": ACCOUNT_FIELDS, "limit": 200, "access_token": token}
    return await _paged(client, url, params)


async def fetch_businesses(client, version, token) -> list[dict]:
    """Lista os Business Managers que o token pode acessar."""
    url = f"{GRAPH}/{version}/me/businesses"
    params = {"fields": "id,name", "limit": 100, "access_token": token}
    return await _paged(client, url, params)


async def fetch_business_accounts(client, version, business_id, token) -> list[dict]:
    """Contas de anuncio de um Business: proprias + de clientes da agencia.

    Cada conta corresponde a um "cliente". Alguns campos de saldo podem ser
    negados em contas de cliente; nesse caso refaz a chamada so com o basico.
    """
    accounts: dict[str, dict] = {}
    for edge in ("owned_ad_accounts", "client_ad_accounts"):
        url = f"{GRAPH}/{version}/{business_id}/{edge}"
        for fields in (ACCOUNT_FIELDS, "account_id,name,account_status,currency"):
            try:
                params = {"fields": fields, "limit": 100, "access_token": token}
                for acc in await _paged(client, url, params):
                    if acc.get("account_id"):
                        accounts[acc["account_id"]] = acc
                break
            except MetaAPIError:
                continue
    return list(accounts.values())


async def fetch_campaigns(client, version, account_id, token) -> list[dict]:
    """Lista todas as campanhas da conta com status e orcamento."""
    url = f"{GRAPH}/{version}/act_{account_id}/campaigns"
    params = {
        "fields": (
            "id,name,status,effective_status,objective,"
            "daily_budget,lifetime_budget,start_time,stop_time"
        ),
        "limit": 200,
        "access_token": token,
    }
    return await _paged(client, url, params)


async def fetch_campaign_insights(client, version, account_id, token, date_preset) -> list[dict]:
    """Metricas agregadas por campanha no periodo escolhido.

    Uma unica chamada a nivel de conta com level=campaign traz os insights
    de todas as campanhas que tiveram entrega no periodo.
    """
    url = f"{GRAPH}/{version}/act_{account_id}/insights"
    params = {
        "level": "campaign",
        "fields": (
            "campaign_id,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,"
            "actions,action_values,purchase_roas,cost_per_action_type"
        ),
        "date_preset": date_preset,
        "limit": 200,
        "access_token": token,
    }
    return await _paged(client, url, params)


async def fetch_account_timeseries(
    client, version, account_id, token, date_preset
) -> list[dict]:
    """Serie diaria de gasto/receita/compras agregada na conta inteira.

    time_increment=1 -> 1 ponto por dia. Util para grafico de tendencia.
    """
    url = f"{GRAPH}/{version}/act_{account_id}/insights"
    params = {
        "level": "account",
        "fields": "spend,impressions,clicks,actions,action_values,purchase_roas",
        "date_preset": date_preset,
        "time_increment": 1,
        "limit": 500,
        "access_token": token,
    }
    return await _paged(client, url, params)


# =========================== Criacao de campanhas =========================
# As funcoes abaixo usam o token com permissao ads_management. O fluxo Meta
# exige 3 chamadas para subir um anuncio: campanha -> conjunto -> anuncio
# (mais o upload de imagem e a criacao do criativo).

async def _post(client: httpx.AsyncClient, url: str, data: dict) -> dict:
    """POST padrao para a Graph API com tratamento do envelope de erro."""
    resp = await client.post(url, data=data)
    try:
        body = resp.json()
    except ValueError:
        raise MetaAPIError(f"Resposta invalida do Meta (HTTP {resp.status_code}).")
    if "error" in body:
        err = body["error"]
        msg = err.get("error_user_msg") or err.get("message") or "Erro desconhecido."
        raise MetaAPIError(msg)
    return body


async def fetch_pages(client, version, token) -> list[dict]:
    """Paginas do Facebook que o usuario pode publicar (necessario para criar anuncios)."""
    url = f"{GRAPH}/{version}/me/accounts"
    params = {"fields": "id,name,category,access_token", "limit": 100, "access_token": token}
    return await _paged(client, url, params)


async def create_campaign(client, version, account_id, token, payload: dict) -> dict:
    """Cria uma campanha. Campos esperados em payload:
       name, objective, status, daily_budget OR lifetime_budget (em centavos),
       special_ad_categories (lista, normalmente []).
    """
    url = f"{GRAPH}/{version}/act_{account_id}/campaigns"
    data = dict(payload)
    data["access_token"] = token
    return await _post(client, url, data)


async def create_adset(client, version, account_id, token, payload: dict) -> dict:
    """Cria um conjunto de anuncios. Campos esperados:
       name, campaign_id, daily_budget OR lifetime_budget, billing_event,
       optimization_goal, bid_strategy, targeting (JSON), start_time,
       end_time (opcional), status.
    """
    url = f"{GRAPH}/{version}/act_{account_id}/adsets"
    data = dict(payload)
    data["access_token"] = token
    return await _post(client, url, data)


async def upload_ad_image(
    client, version, account_id, token, filename: str, file_bytes: bytes, content_type: str
) -> dict:
    """Faz upload de uma imagem para a conta e devolve o image_hash."""
    url = f"{GRAPH}/{version}/act_{account_id}/adimages"
    files = {"filename": (filename, file_bytes, content_type)}
    data = {"access_token": token}
    resp = await client.post(url, data=data, files=files)
    try:
        body = resp.json()
    except ValueError:
        raise MetaAPIError(f"Resposta invalida do Meta (HTTP {resp.status_code}).")
    if "error" in body:
        err = body["error"]
        msg = err.get("error_user_msg") or err.get("message") or "Erro no upload."
        raise MetaAPIError(msg)
    images = body.get("images", {})
    if not images:
        raise MetaAPIError("Meta nao devolveu hash da imagem.")
    # Endpoint devolve {images: {<filename>: {hash: ...}}}
    first = next(iter(images.values()))
    return {"hash": first.get("hash"), "url": first.get("url")}


async def create_ad_creative(client, version, account_id, token, payload: dict) -> dict:
    """Cria o criativo (associa pagina + imagem + copy + link + CTA)."""
    url = f"{GRAPH}/{version}/act_{account_id}/adcreatives"
    data = dict(payload)
    data["access_token"] = token
    return await _post(client, url, data)


async def create_ad(client, version, account_id, token, payload: dict) -> dict:
    """Cria o anuncio em si (vincula conjunto + criativo)."""
    url = f"{GRAPH}/{version}/act_{account_id}/ads"
    data = dict(payload)
    data["access_token"] = token
    return await _post(client, url, data)
