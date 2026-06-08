import { useEffect, useMemo, useState } from "react";
import { fetchAuth, getToken, API_BASE } from "../lib/api.js";

const OBJECTIVE_OPTIONS = [
  ["OUTCOME_TRAFFIC", "Tráfego"],
  ["OUTCOME_ENGAGEMENT", "Engajamento"],
  ["OUTCOME_LEADS", "Cadastros"],
  ["OUTCOME_AWARENESS", "Reconhecimento"],
  ["OUTCOME_SALES", "Vendas"],
  ["OUTCOME_APP_PROMOTION", "Promoção de app"],
];
const SPECIAL_CATEGORIES = [
  ["", "Nenhuma"],
  ["CREDIT", "Crédito"],
  ["EMPLOYMENT", "Emprego"],
  ["HOUSING", "Habitação"],
  ["ISSUES_ELECTIONS_POLITICS", "Política"],
];
const OPTIMIZATION_GOALS = [
  ["LINK_CLICKS", "Cliques no link"],
  ["LANDING_PAGE_VIEWS", "Visualizações da LP"],
  ["OFFSITE_CONVERSIONS", "Conversões (pixel)"],
  ["LEAD_GENERATION", "Cadastros"],
  ["REACH", "Alcance"],
  ["IMPRESSIONS", "Impressões"],
  ["POST_ENGAGEMENT", "Engajamento"],
  ["THRUPLAY", "ThruPlay (vídeo)"],
];
const BILLING_EVENTS = [
  ["IMPRESSIONS", "Impressões"],
  ["LINK_CLICKS", "Cliques no link"],
  ["THRUPLAY", "ThruPlay"],
];
const CTAS = [
  ["", "Nenhum"],
  ["SHOP_NOW", "Comprar agora"],
  ["LEARN_MORE", "Saiba mais"],
  ["SIGN_UP", "Cadastre-se"],
  ["DOWNLOAD", "Baixar"],
  ["BOOK_NOW", "Reservar"],
  ["CONTACT_US", "Fale conosco"],
  ["GET_QUOTE", "Solicitar orçamento"],
  ["SEND_MESSAGE", "Enviar mensagem"],
  ["WHATSAPP_MESSAGE", "Mensagem no WhatsApp"],
];

// Flag de prévia: o formulario continua visivel para showcase, mas todos os
// campos e o submit ficam desabilitados — ninguem consegue subir campanha.
// Inverta para `false` quando o fluxo estiver liberado pra producao.
const PREVIEW_MODE = true;

// input datetime-local devolve "YYYY-MM-DDTHH:MM" -> adiciona ":00" e mantem local.
function isoLocalToISO(dt) {
  if (!dt) return "";
  return dt.length === 16 ? dt + ":00" : dt;
}

export default function NewCampaign({ clients, metaToken }) {
  // -- 1. Cliente / pagina
  const [accountId, setAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [pages, setPages] = useState(null); // null = nao carregado; [] = carregado e vazio
  const [pagesMsg, setPagesMsg] = useState("Carregando páginas...");

  // -- 2. Campanha
  const [campName, setCampName] = useState("");
  const [campObj, setCampObj] = useState("OUTCOME_TRAFFIC");
  const [campBudgetType, setCampBudgetType] = useState("none");
  const [campBudget, setCampBudget] = useState("");
  const [campSpecial, setCampSpecial] = useState("");

  // -- 3. Conjunto
  const [asName, setAsName] = useState("");
  const [asOpt, setAsOpt] = useState("LINK_CLICKS");
  const [asBilling, setAsBilling] = useState("IMPRESSIONS");
  const [asBudgetType, setAsBudgetType] = useState("daily");
  const [asBudget, setAsBudget] = useState("");
  const [asStart, setAsStart] = useState("");
  const [asEnd, setAsEnd] = useState("");
  const [asCountries, setAsCountries] = useState("BR");
  const [asAgeMin, setAsAgeMin] = useState(18);
  const [asAgeMax, setAsAgeMax] = useState(65);
  const [asGenders, setAsGenders] = useState("0");

  // -- 4. Anuncio
  const [adName, setAdName] = useState("");
  const [adCta, setAdCta] = useState("SHOP_NOW");
  const [adLink, setAdLink] = useState("");
  const [adHeadline, setAdHeadline] = useState("");
  const [adText, setAdText] = useState("");
  const [adDesc, setAdDesc] = useState("");
  const [adImage, setAdImage] = useState(null);
  const [adImageUrl, setAdImageUrl] = useState("");

  // -- Status / resultado
  const [status, setStatus] = useState({ msg: "", type: "" });
  const [result, setResult] = useState(null); // { ok: bool, body }
  const [submitting, setSubmitting] = useState(false);

  // ---- contas: ordenadas por nome (uma vez carregadas)
  const accountOptions = useMemo(() => (
    clients.slice().sort((a, b) => a.name.localeCompare(b.name))
  ), [clients]);

  // ---- preview de imagem (gera blob URL e libera quando troca/sai)
  useEffect(() => {
    if (!adImage) { setAdImageUrl(""); return; }
    const url = URL.createObjectURL(adImage);
    setAdImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [adImage]);

  // ---- ao abrir a aba, carrega paginas do FB (uma vez, com cache)
  useEffect(() => {
    let cancelled = false;
    const t = metaToken?.trim();
    if (!t) {
      setPages([]);
      setPagesMsg("Cole o token e carregue os clientes");
      return;
    }
    (async () => {
      try {
        const { resp, data } = await fetchAuth("/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: t }),
        });
        if (cancelled) return;
        if (!resp.ok) throw new Error(data.detail || "Falha ao listar páginas.");
        const list = data.pages || [];
        setPages(list);
        if (!list.length) {
          setPagesMsg("Nenhuma página encontrada (token precisa de pages_show_list)");
        }
      } catch (err) {
        if (!cancelled) { setPages([]); setPagesMsg(err.message); }
      }
    })();
    return () => { cancelled = true; };
  }, [metaToken]);

  // Toggle CBO: orcamento na campanha desabilita o do conjunto.
  const cboOn = campBudgetType !== "none";

  function buildConfig() {
    const campaign = { name: campName.trim(), objective: campObj };
    campaign.special_ad_categories = campSpecial ? [campSpecial] : [];

    const camVal = parseFloat(campBudget || "0");
    if (campBudgetType === "daily" && camVal > 0) campaign.daily_budget = Math.round(camVal * 100);
    if (campBudgetType === "lifetime" && camVal > 0) campaign.lifetime_budget = Math.round(camVal * 100);

    const countries = asCountries.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const targeting = {
      geo_locations: { countries: countries.length ? countries : ["BR"] },
      age_min: parseInt(asAgeMin, 10) || 18,
      age_max: parseInt(asAgeMax, 10) || 65,
    };
    if (asGenders === "1") targeting.genders = [1];
    if (asGenders === "2") targeting.genders = [2];

    const adset = {
      name: asName.trim(),
      optimization_goal: asOpt,
      billing_event: asBilling,
      targeting,
    };
    if (!campaign.daily_budget && !campaign.lifetime_budget) {
      const asVal = parseFloat(asBudget || "0");
      if (asBudgetType === "daily" && asVal > 0) adset.daily_budget = Math.round(asVal * 100);
      if (asBudgetType === "lifetime" && asVal > 0) adset.lifetime_budget = Math.round(asVal * 100);
    }
    if (asStart) adset.start_time = isoLocalToISO(asStart);
    if (asEnd) adset.end_time = isoLocalToISO(asEnd);

    const creative = {
      page_id: pageId,
      link: adLink.trim(),
      message: adText.trim(),
    };
    if (adHeadline.trim()) creative.headline = adHeadline.trim();
    if (adDesc.trim()) creative.description = adDesc.trim();
    if (adCta) creative.call_to_action = adCta;

    return { campaign, adset, creative, ad: { name: adName.trim() } };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const t = metaToken?.trim();
    if (!t) { setStatus({ msg: "Cole o access token e carregue os clientes antes.", type: "error" }); return; }
    if (!accountId) { setStatus({ msg: "Escolha a conta de anúncios.", type: "error" }); return; }
    if (!adImage) { setStatus({ msg: "Selecione a imagem do anúncio.", type: "error" }); return; }

    const config = buildConfig();
    if (!config.creative.page_id) { setStatus({ msg: "Escolha a página do Facebook.", type: "error" }); return; }
    if (!config.creative.link.startsWith("http")) {
      setStatus({ msg: "Link de destino precisa começar com http(s).", type: "error" });
      return;
    }

    setResult(null);
    setSubmitting(true);
    setStatus({ msg: "Enviando para o Meta... (pode levar 20-40s)", type: "" });

    try {
      const fd = new FormData();
      fd.append("access_token", t);
      fd.append("account_id", accountId);
      fd.append("config", JSON.stringify(config));
      fd.append("image", adImage);

      // FormData: o browser define Content-Type com boundary; nao mandar manual.
      const resp = await fetch(API_BASE + "/api/campaign/create", {
        method: "POST",
        headers: { Authorization: "Bearer " + getToken() },
        body: fd,
      });
      if (resp.status === 401) {
        localStorage.removeItem("auth_token");
        window.location.replace("/login");
        return;
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "Falha ao criar campanha.");

      setStatus({ msg: "", type: "" });
      setResult({ ok: true, body: data, accountId });
    } catch (err) {
      setStatus({ msg: "", type: "" });
      setResult({ ok: false, body: { detail: err.message } });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="view-new-campaign" className="view">
      <section className="panel">
        <h2>🚀 Subir nova campanha no Meta</h2>
        <p className="panel-hint">
          Cria <strong>Campanha + Conjunto + Anúncio</strong> direto pela Marketing API.
          Tudo é criado como <strong>PAUSADO</strong> — você revisa e ativa no
          Gerenciador antes de gastar.{" "}
          Requer token com <code>ads_management</code>.
        </p>

        {PREVIEW_MODE && (
          <div className="preview-banner">
            <strong>🚧 Prévia da funcionalidade</strong>
            <p>
              Esta tela mostra como será o fluxo de criação de campanhas direto pelo
              painel. Os campos estão desabilitados — em breve será possível enviar.
            </p>
          </div>
        )}

        <form
          className={"campaign-form" + (PREVIEW_MODE ? " is-preview" : "")}
          onSubmit={PREVIEW_MODE ? (e) => e.preventDefault() : handleSubmit}
          aria-disabled={PREVIEW_MODE}
        >
          {/* ---- 1. Cliente / Página ---- */}
          <fieldset className="form-section" disabled={PREVIEW_MODE}>
            <legend>1. Cliente</legend>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-account">Conta de anúncios</label>
                <select
                  id="nc-account" required
                  value={accountId} onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {accountOptions.map((c) => (
                    <option key={c.account_id} value={c.account_id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="nc-page">Página do Facebook</label>
                <select
                  id="nc-page" required
                  value={pageId} onChange={(e) => setPageId(e.target.value)}
                >
                  {pages === null && <option value="">Carregando páginas...</option>}
                  {pages && pages.length > 0 && (
                    <>
                      <option value="">Selecione...</option>
                      {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </>
                  )}
                  {pages && !pages.length && <option value="">{pagesMsg}</option>}
                </select>
              </div>
            </div>
          </fieldset>

          {/* ---- 2. Campanha ---- */}
          <fieldset className="form-section" disabled={PREVIEW_MODE}>
            <legend>2. Campanha</legend>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-camp-name">Nome da campanha</label>
                <input
                  type="text" id="nc-camp-name" required placeholder="ex: CLIENTE | Black Friday"
                  value={campName} onChange={(e) => setCampName(e.target.value)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-camp-obj">Objetivo</label>
                <select id="nc-camp-obj" required value={campObj} onChange={(e) => setCampObj(e.target.value)}>
                  {OBJECTIVE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field field-sm">
                <label htmlFor="nc-camp-budget-type">Tipo de orçamento (CBO)</label>
                <select
                  id="nc-camp-budget-type"
                  value={campBudgetType}
                  onChange={(e) => {
                    setCampBudgetType(e.target.value);
                    if (e.target.value === "none") setCampBudget("");
                  }}
                >
                  <option value="none">Sem CBO (orçamento no conjunto)</option>
                  <option value="daily">Diário (campanha)</option>
                  <option value="lifetime">Total (campanha)</option>
                </select>
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-camp-budget">Valor (R$)</label>
                <input
                  type="number" id="nc-camp-budget" min="1" step="0.01" placeholder="ex: 50"
                  disabled={!cboOn}
                  value={campBudget} onChange={(e) => setCampBudget(e.target.value)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-camp-special">Categoria especial</label>
                <select id="nc-camp-special" value={campSpecial} onChange={(e) => setCampSpecial(e.target.value)}>
                  {SPECIAL_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          {/* ---- 3. Conjunto ---- */}
          <fieldset className="form-section" disabled={PREVIEW_MODE}>
            <legend>3. Conjunto de anúncios</legend>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-as-name">Nome do conjunto</label>
                <input
                  type="text" id="nc-as-name" required placeholder="ex: BR | 25-45 | Interesses"
                  value={asName} onChange={(e) => setAsName(e.target.value)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-as-opt">Meta de otimização</label>
                <select id="nc-as-opt" required value={asOpt} onChange={(e) => setAsOpt(e.target.value)}>
                  {OPTIMIZATION_GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-as-billing">Evento de cobrança</label>
                <select id="nc-as-billing" required value={asBilling} onChange={(e) => setAsBilling(e.target.value)}>
                  {BILLING_EVENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field field-sm">
                <label htmlFor="nc-as-budget-type">Orçamento do conjunto</label>
                <select
                  id="nc-as-budget-type" value={asBudgetType}
                  onChange={(e) => setAsBudgetType(e.target.value)}
                  disabled={cboOn}
                >
                  <option value="daily">Diário</option>
                  <option value="lifetime">Total</option>
                </select>
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-as-budget">Valor (R$)</label>
                <input
                  type="number" id="nc-as-budget" min="1" step="0.01" placeholder="ex: 30"
                  value={asBudget} onChange={(e) => setAsBudget(e.target.value)}
                  disabled={cboOn}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-as-start">Início</label>
                <input
                  type="datetime-local" id="nc-as-start"
                  value={asStart} onChange={(e) => setAsStart(e.target.value)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-as-end">Término <small>(obrigatório se orçamento total)</small></label>
                <input
                  type="datetime-local" id="nc-as-end"
                  value={asEnd} onChange={(e) => setAsEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="field field-sm">
                <label htmlFor="nc-as-countries">Países (códigos ISO sep. por vírgula)</label>
                <input
                  type="text" id="nc-as-countries"
                  value={asCountries} onChange={(e) => setAsCountries(e.target.value)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-as-age-min">Idade mínima</label>
                <input
                  type="number" id="nc-as-age-min" min="13" max="65"
                  value={asAgeMin} onChange={(e) => setAsAgeMin(e.target.value)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-as-age-max">Idade máxima</label>
                <input
                  type="number" id="nc-as-age-max" min="13" max="65"
                  value={asAgeMax} onChange={(e) => setAsAgeMax(e.target.value)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-as-genders">Gênero</label>
                <select id="nc-as-genders" value={asGenders} onChange={(e) => setAsGenders(e.target.value)}>
                  <option value="0">Todos</option>
                  <option value="1">Homens</option>
                  <option value="2">Mulheres</option>
                </select>
              </div>
            </div>
          </fieldset>

          {/* ---- 4. Anúncio ---- */}
          <fieldset className="form-section" disabled={PREVIEW_MODE}>
            <legend>4. Anúncio</legend>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-ad-name">Nome do anúncio</label>
                <input
                  type="text" id="nc-ad-name" required placeholder="ex: Imagem 1 - copy A"
                  value={adName} onChange={(e) => setAdName(e.target.value)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="nc-ad-cta">Botão (call to action)</label>
                <select id="nc-ad-cta" value={adCta} onChange={(e) => setAdCta(e.target.value)}>
                  {CTAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-ad-link">Link de destino</label>
                <input
                  type="url" id="nc-ad-link" required placeholder="https://"
                  value={adLink} onChange={(e) => setAdLink(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="nc-ad-headline">Manchete <small>(até 40 caracteres)</small></label>
                <input
                  type="text" id="nc-ad-headline" maxLength={40} placeholder="Título principal"
                  value={adHeadline} onChange={(e) => setAdHeadline(e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-ad-text">Texto principal (mensagem do anúncio)</label>
                <textarea
                  id="nc-ad-text" rows={3} required placeholder="Copy do anúncio..."
                  value={adText} onChange={(e) => setAdText(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="nc-ad-desc">Descrição (link description)</label>
                <textarea
                  id="nc-ad-desc" rows={3} placeholder="Descrição complementar (opcional)"
                  value={adDesc} onChange={(e) => setAdDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-ad-image">Imagem do anúncio (1080×1080 recomendado)</label>
                <input
                  type="file" id="nc-ad-image" accept="image/*" required
                  onChange={(e) => setAdImage(e.target.files[0] || null)}
                />
                <div className={"image-preview" + (adImageUrl ? " has-image" : "")}>
                  {adImageUrl && <img src={adImageUrl} alt="preview" />}
                </div>
              </div>
            </div>
          </fieldset>

          <div className="form-actions">
            <span className={"status-msg" + (status.type ? " " + status.type : "")}>
              {PREVIEW_MODE ? "Envio desabilitado — funcionalidade em breve." : status.msg}
            </span>
            <button type="submit" className="btn-primary" disabled={PREVIEW_MODE || submitting}>
              {PREVIEW_MODE ? "Em breve" : "Criar campanha (pausada)"}
            </button>
          </div>
        </form>

        {result && (
          <div className={"answer " + (result.ok ? "nc-result-ok" : "nc-result-error")}>
            {result.ok ? (
              <>
                <h3>✅ Campanha criada (pausada) no Meta!</h3>
                <p>Revise antes de ativar:</p>
                <ul>
                  <li><strong>Campanha:</strong> {result.body.campaign_id}</li>
                  <li><strong>Conjunto:</strong> {result.body.adset_id}</li>
                  <li><strong>Criativo:</strong> {result.body.creative_id}</li>
                  <li><strong>Anúncio:</strong> {result.body.ad_id}</li>
                </ul>
                <p>
                  <a
                    href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${result.accountId}`}
                    target="_blank" rel="noopener noreferrer"
                  >
                    Abrir no Gerenciador de Anúncios →
                  </a>
                </p>
              </>
            ) : (
              <>
                <h3>❌ Erro</h3>
                <p><strong>{result.body.detail}</strong></p>
              </>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
