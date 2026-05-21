import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { postJSON, saveToken } from "../lib/api.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMsg("Entrando...");
    setMsgType("");
    try {
      const data = await postJSON("/api/auth/login", { email: email.trim(), password });
      saveToken(data.token);
      nav("/", { replace: true });
    } catch (err) {
      setMsg(err.message);
      setMsgType("error");
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-body">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="logo">◆</span>
          <h1>Dashboard Meta Ads</h1>
        </div>
        <p className="auth-sub">Entre com sua conta de funcionário</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="login-email">E-mail</label>
            <input
              type="email" id="login-email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Senha</label>
            <input
              type="password" id="login-password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary auth-btn" disabled={submitting}>
            Entrar
          </button>
        </form>

        <p className={"auth-msg" + (msgType ? " " + msgType : "")}>{msg}</p>

        <p className="auth-foot">
          Acesso de administrador? <Link to="/register">Cadastrar funcionário</Link>
        </p>
      </div>
    </div>
  );
}
