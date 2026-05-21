"""API FastAPI do Dashboard Meta Ads.

Endpoints:
  POST /api/dashboard  -> busca campanhas + insights no Meta e devolve dados tratados
  POST /api/analyze    -> responde perguntas de analise (Claude API, com fallback local)
  GET  /api/health     -> status do servico

Tambem serve o build do frontend React (frontend/dist) na raiz, com fallback
para o index.html nas rotas do React Router (/, /login, /register).
"""

import asyncio
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ai_analysis
import analysis
import auth
import meta_client

load_dotenv()
auth.init_db()

API_VERSION = os.getenv("META_API_VERSION", "v23.0")
# Build do React (Vite) -> servido como estatico na raiz. Rode `npm run build`
# em frontend/ antes de iniciar o servidor em producao.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = FastAPI(title="Dashboard Meta Ads", version="1.0.0")

# Libera o frontend (servido em outra origem/porta) para chamar a API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



class DashboardRequest(BaseModel):
    access_token: str
    account_id: str
    date_preset: str = "last_30d"


class OverviewRequest(BaseModel):
    access_token: str
    date_preset: str = "last_30d"
    # Opcional: limita a busca a estas contas. Vazio = todas as contas do token.
    account_ids: list[str] = []


class AnalyzeRequest(BaseModel):
    question: str
    campaigns: list[dict]
    currency: str = "BRL"


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    admin_password: str


class LoginRequest(BaseModel):
    email: str
    password: str


# Validacao de JWT nas rotas protegidas.
_bearer = HTTPBearer(auto_error=False)


def require_auth(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Dependencia que exige um JWT valido. Devolve o payload do token."""
    payload = auth.verify_token(creds.credentials) if creds else None
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Sessão inválida ou expirada. Faça login novamente.",
        )
    return payload


def _to_int(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


async def _load_client(
    http: httpx.AsyncClient, acc: dict, token: str, date_preset: str, sem: asyncio.Semaphore
) -> dict:
    """Monta o objeto de um cliente (conta de anuncios) com campanhas e metricas.

    Um erro em uma conta (permissao, etc.) nao derruba as demais: fica em "error".
    O semaforo limita quantas contas sao consultadas ao mesmo tempo.
    """
    account_id = str(acc.get("account_id") or acc.get("id", "")).replace("act_", "")
    error = None
    campaigns: list[dict] = []
    try:
        async with sem:
            raw_campaigns, raw_insights = await asyncio.gather(
                meta_client.fetch_campaigns(http, API_VERSION, account_id, token),
                meta_client.fetch_campaign_insights(
                    http, API_VERSION, account_id, token, date_preset
                ),
            )
        campaigns = analysis.build_campaigns(raw_campaigns, raw_insights)
    except meta_client.MetaAPIError as e:
        error = str(e)
    except httpx.HTTPError:
        error = "Falha de conexão com a conta."

    return {
        "account_id": account_id,
        "name": acc.get("name") or account_id,
        "currency": acc.get("currency") or "BRL",
        "account_status": _to_int(acc.get("account_status")),
        "amount_spent": meta_client.cents(acc.get("amount_spent")),
        "spend_cap": meta_client.cents(acc.get("spend_cap")),
        "balance": meta_client.cents(acc.get("balance")),
        "campaigns": campaigns,
        "summary": analysis.build_summary(campaigns),
        "error": error,
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "ai_enabled": ai_analysis.is_available(), "meta_api": API_VERSION}


@app.post("/api/auth/register")
async def auth_register(req: RegisterRequest):
    """Cadastra um funcionario. Protegido pela senha de administrador."""
    try:
        user = auth.register_user(req.name, req.email, req.password, req.admin_password)
    except auth.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "user": user}


@app.post("/api/auth/login")
async def auth_login(req: LoginRequest):
    """Valida e-mail/senha e devolve o JWT de acesso."""
    try:
        token = auth.login(req.email, req.password)
    except auth.AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return {"token": token}


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(require_auth)):
    """Confirma se o JWT enviado ainda e valido (usado para proteger o app)."""
    return {"name": user.get("name"), "email": user.get("email")}


@app.post("/api/dashboard")
async def get_dashboard(req: DashboardRequest, user: dict = Depends(require_auth)):
    """Busca campanhas e metricas no Meta e devolve tudo pronto para o dashboard."""
    token = req.access_token.strip()
    account_id = req.account_id.strip().replace("act_", "")
    if not token or not account_id:
        raise HTTPException(status_code=400, detail="Informe o access token e o ID da conta.")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            account = await meta_client.fetch_account(client, API_VERSION, account_id, token)
            raw_campaigns = await meta_client.fetch_campaigns(
                client, API_VERSION, account_id, token
            )
            raw_insights = await meta_client.fetch_campaign_insights(
                client, API_VERSION, account_id, token, req.date_preset
            )
    except meta_client.MetaAPIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Falha de conexão com a API do Meta.")

    campaigns = analysis.build_campaigns(raw_campaigns, raw_insights)

    return {
        "account": {
            "id": account_id,
            "name": account.get("name", ""),
            "currency": account.get("currency", "BRL"),
        },
        "campaigns": campaigns,
        "summary": analysis.build_summary(campaigns),
        "insights": analysis.auto_insights(campaigns),
    }


@app.post("/api/overview")
async def get_overview(req: OverviewRequest, user: dict = Depends(require_auth)):
    """Busca todas as contas (clientes) do token e devolve campanhas + metricas.

    Cada conta de anuncios e tratada como um cliente. Quando account_ids vem
    vazio, lista todas as contas que o token consegue acessar.
    """
    token = req.access_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Informe o access token.")

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            ids = [a.strip().replace("act_", "") for a in req.account_ids if a.strip()]
            if ids:
                accounts = list(await asyncio.gather(
                    *[meta_client.fetch_account(client, API_VERSION, i, token) for i in ids]
                ))
            else:
                # Caminho principal: contas dos Business Managers do token
                # (contas proprias + de clientes da agencia). Sem Business,
                # cai no me/adaccounts.
                businesses = await meta_client.fetch_businesses(client, API_VERSION, token)
                if businesses:
                    groups = await asyncio.gather(*[
                        meta_client.fetch_business_accounts(
                            client, API_VERSION, b["id"], token
                        )
                        for b in businesses
                    ])
                    by_id: dict[str, dict] = {}
                    for group in groups:
                        for acc in group:
                            by_id[acc["account_id"]] = acc
                    accounts = list(by_id.values())
                else:
                    accounts = await meta_client.fetch_ad_accounts(client, API_VERSION, token)

            sem = asyncio.Semaphore(8)
            clients = await asyncio.gather(
                *[_load_client(client, acc, token, req.date_preset, sem) for acc in accounts]
            )
    except meta_client.MetaAPIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Falha de conexão com a API do Meta.")

    if not clients:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma conta de anúncios encontrada para este token.",
        )

    return {"date_preset": req.date_preset, "clients": list(clients)}


class TimeseriesRequest(BaseModel):
    access_token: str
    account_ids: list[str]
    date_preset: str = "last_30d"


@app.post("/api/timeseries")
async def get_timeseries(req: TimeseriesRequest, _: dict = Depends(require_auth)):
    """Serie diaria agregada das contas pedidas. Usada pelo grafico de tendencia.

    Faz uma chamada por conta (time_increment=1) e devolve os pontos brutos.
    O frontend faz a soma por dia para o grafico de linha.
    """
    token = req.access_token.strip()
    ids = [a.strip().replace("act_", "") for a in req.account_ids if a.strip()]
    if not token or not ids:
        raise HTTPException(status_code=400, detail="Token e contas sao obrigatorios.")

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            sem = asyncio.Semaphore(8)

            async def one(aid: str) -> dict:
                async with sem:
                    try:
                        rows = await meta_client.fetch_account_timeseries(
                            client, API_VERSION, aid, token, req.date_preset
                        )
                        return {"account_id": aid, "rows": rows}
                    except meta_client.MetaAPIError:
                        return {"account_id": aid, "rows": []}

            results = await asyncio.gather(*[one(i) for i in ids])
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Falha de conexao com o Meta.")

    return {"date_preset": req.date_preset, "accounts": results}


class PagesRequest(BaseModel):
    access_token: str


@app.post("/api/pages")
async def get_pages(req: PagesRequest, _: dict = Depends(require_auth)):
    """Lista paginas do Facebook do usuario (necessarias para criar anuncios)."""
    token = req.access_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token e obrigatorio.")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            pages = await meta_client.fetch_pages(client, API_VERSION, token)
    except meta_client.MetaAPIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Falha de conexao com o Meta.")
    # Devolve so o que o frontend precisa (nao expor o page access_token).
    return {"pages": [{"id": p["id"], "name": p.get("name", ""), "category": p.get("category", "")}
                      for p in pages]}


@app.post("/api/campaign/create")
async def create_campaign_full(
    access_token: str = Form(...),
    account_id: str = Form(...),
    config: str = Form(...),
    image: UploadFile = File(...),
    _: dict = Depends(require_auth),
):
    """Cria uma campanha completa: Campanha + Conjunto + Imagem + Criativo + Anuncio.

    `config` e um JSON com a configuracao. `image` e a imagem do anuncio (multipart).
    Tudo e criado com status PAUSED para evitar gastar dinheiro acidentalmente -
    o usuario ativa manualmente no Meta depois de revisar.
    """
    token = (access_token or "").strip()
    aid = (account_id or "").strip().replace("act_", "")
    if not token or not aid:
        raise HTTPException(status_code=400, detail="Token e conta sao obrigatorios.")

    try:
        cfg = json.loads(config)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Configuracao invalida.")

    campaign_in = cfg.get("campaign") or {}
    adset_in = cfg.get("adset") or {}
    ad_in = cfg.get("ad") or {}
    creative_in = cfg.get("creative") or {}

    # Validacoes minimas (o Meta tambem valida, mas falha mais cedo aqui).
    required = {
        "campaign.name": campaign_in.get("name"),
        "campaign.objective": campaign_in.get("objective"),
        "adset.name": adset_in.get("name"),
        "adset.optimization_goal": adset_in.get("optimization_goal"),
        "adset.billing_event": adset_in.get("billing_event"),
        "ad.name": ad_in.get("name"),
        "creative.page_id": creative_in.get("page_id"),
        "creative.message": creative_in.get("message"),
        "creative.link": creative_in.get("link"),
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        raise HTTPException(
            status_code=400, detail=f"Campos obrigatorios faltando: {', '.join(missing)}"
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Imagem do anuncio e obrigatoria.")

    try:
        async with httpx.AsyncClient(timeout=120) as http:
            # 1) Campanha
            camp_payload: dict = {
                "name": campaign_in["name"],
                "objective": campaign_in["objective"],
                "status": "PAUSED",
                "special_ad_categories": json.dumps(
                    campaign_in.get("special_ad_categories") or []
                ),
            }
            if campaign_in.get("daily_budget"):
                camp_payload["daily_budget"] = int(campaign_in["daily_budget"])
            elif campaign_in.get("lifetime_budget"):
                camp_payload["lifetime_budget"] = int(campaign_in["lifetime_budget"])

            campaign = await meta_client.create_campaign(
                http, API_VERSION, aid, token, camp_payload
            )

            # 2) Conjunto
            adset_payload: dict = {
                "name": adset_in["name"],
                "campaign_id": campaign["id"],
                "optimization_goal": adset_in["optimization_goal"],
                "billing_event": adset_in["billing_event"],
                "status": "PAUSED",
                "targeting": json.dumps(adset_in.get("targeting") or {
                    "geo_locations": {"countries": ["BR"]},
                    "age_min": 18,
                    "age_max": 65,
                }),
            }
            # Orcamento no nivel do conjunto so se a campanha nao tiver CBO.
            if not campaign_in.get("daily_budget") and not campaign_in.get("lifetime_budget"):
                if adset_in.get("daily_budget"):
                    adset_payload["daily_budget"] = int(adset_in["daily_budget"])
                elif adset_in.get("lifetime_budget"):
                    adset_payload["lifetime_budget"] = int(adset_in["lifetime_budget"])
            if adset_in.get("bid_amount"):
                adset_payload["bid_amount"] = int(adset_in["bid_amount"])
            if adset_in.get("start_time"):
                adset_payload["start_time"] = adset_in["start_time"]
            if adset_in.get("end_time"):
                adset_payload["end_time"] = adset_in["end_time"]
            # lifetime_budget exige end_time
            if "lifetime_budget" in adset_payload and not adset_payload.get("end_time"):
                raise HTTPException(
                    status_code=400,
                    detail="Orcamento total exige uma data de termino no conjunto.",
                )

            adset = await meta_client.create_adset(
                http, API_VERSION, aid, token, adset_payload
            )

            # 3) Upload da imagem
            img = await meta_client.upload_ad_image(
                http, API_VERSION, aid, token,
                image.filename or "ad.jpg", image_bytes,
                image.content_type or "image/jpeg",
            )

            # 4) Criativo
            link_data: dict = {
                "image_hash": img["hash"],
                "link": creative_in["link"],
                "message": creative_in["message"],
            }
            if creative_in.get("headline"):
                link_data["name"] = creative_in["headline"]
            if creative_in.get("description"):
                link_data["description"] = creative_in["description"]
            if creative_in.get("call_to_action"):
                link_data["call_to_action"] = {
                    "type": creative_in["call_to_action"],
                    "value": {"link": creative_in["link"]},
                }
            creative_payload = {
                "name": ad_in["name"] + " - criativo",
                "object_story_spec": json.dumps({
                    "page_id": creative_in["page_id"],
                    "link_data": link_data,
                }),
                "degrees_of_freedom_spec": json.dumps({
                    "creative_features_spec": {
                        "standard_enhancements": {"enroll_status": "OPT_OUT"}
                    }
                }),
            }
            creative = await meta_client.create_ad_creative(
                http, API_VERSION, aid, token, creative_payload
            )

            # 5) Anuncio
            ad = await meta_client.create_ad(
                http, API_VERSION, aid, token,
                {
                    "name": ad_in["name"],
                    "adset_id": adset["id"],
                    "creative": json.dumps({"creative_id": creative["id"]}),
                    "status": "PAUSED",
                },
            )

    except meta_client.MetaAPIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Falha de conexao com o Meta.")

    return {
        "ok": True,
        "campaign_id": campaign["id"],
        "adset_id": adset["id"],
        "creative_id": creative["id"],
        "ad_id": ad["id"],
        "image_hash": img["hash"],
    }


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, user: dict = Depends(require_auth)):
    """Responde uma pergunta de analise sobre as campanhas filtradas.

    Usa a Claude API quando ANTHROPIC_API_KEY esta configurada; caso contrario
    (ou se a chamada falhar) cai no motor de analise local.
    """
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Digite uma pergunta.")

    if ai_analysis.is_available():
        try:
            answer = await ai_analysis.analyze_with_ai(question, req.campaigns, req.currency)
            return {"answer": answer, "source": "ai"}
        except ai_analysis.APIError as e:
            # Falha na API da Anthropic -> usa o fallback local sem derrubar a requisicao.
            answer = analysis.analyze_question(question, req.campaigns)
            return {"answer": answer, "source": "local", "warning": f"IA indisponível: {e}"}

    return {"answer": analysis.analyze_question(question, req.campaigns), "source": "local"}


# --- Frontend (React SPA) ------------------------------------------------
# Os bundles do Vite ficam em dist/assets/*. Servimos esse diretorio como
# estatico e, para qualquer outra rota nao-/api/*, devolvemos o index.html
# para que o React Router resolva no cliente (/, /login, /register).
ASSETS_DIR = FRONTEND_DIR / "assets"
INDEX_HTML = FRONTEND_DIR / "index.html"

if ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    """Catchall para o SPA: tudo que nao for /api/* devolve o index.html.

    Arquivos com extensao (favicon.svg etc) sao servidos do diretorio raiz
    do build quando existem; senao caem no index.html.
    """
    # /api/foo inexistente deve devolver 404 JSON, nao a SPA.
    if full_path.startswith("api/") or full_path == "api":
        raise HTTPException(status_code=404, detail="Not Found")

    # Arquivo direto no root do dist (ex.: favicon, robots.txt) -> serve.
    if full_path:
        candidate = FRONTEND_DIR / full_path
        # Bloqueia escape de diretorio (../).
        try:
            candidate = candidate.resolve()
            candidate.relative_to(FRONTEND_DIR.resolve())
        except (ValueError, OSError):
            candidate = None
        if candidate and candidate.is_file():
            return FileResponse(candidate)
    if INDEX_HTML.is_file():
        return FileResponse(INDEX_HTML)
    raise HTTPException(status_code=404, detail="Frontend não foi buildado (rode npm run build).")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
