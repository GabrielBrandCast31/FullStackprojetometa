import { useState } from "react";
import { Link } from "react-router-dom";
import { postJSON } from "../lib/api.js";

// Fluxo em 2 etapas: 1) senha de adm; 2) dados do funcionario.
export default function Register() {
  const [step, setStep] = useState(1);
  const [adminPassword, setAdminPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleGate(e) {
    e.preventDefault();
    if (!adminPassword) {
      setMsg("Digite a senha de administrador.");
      setMsgType("error");
      return;
    }
    setStep(2);
    setMsg("");
    setMsgType("");
  }

  async function handleRegister(e) {
    e.preventDefault();
    setSubmitting(true);
    setMsg("Cadastrando funcionário...");
    setMsgType("");
    try {
      const data = await postJSON("/api/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
        admin_password: adminPassword,
      });
      setMsg(
        `Funcionário ${data.user.name} cadastrado. Ele já pode entrar pela página de login.`,
      );
      setMsgType("success");
      setName(""); setEmail(""); setPassword("");
    } catch (err) {
      setMsg(err.message);
      setMsgType("error");
      // Senha de administrador errada -> volta para a etapa 1.
      if (/administrador/i.test(err.message)) {
        setStep(1);
        setAdminPassword("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-body">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="logo">◆</span>
          <h1>Cadastro de funcionários</h1>
        </div>
        <p className="auth-sub">Área restrita ao administrador</p>

        {step === 1 && (
          <form className="auth-form" onSubmit={handleGate}>
            <p className="auth-hint">
              Esta página cria novos acessos ao dashboard. Informe a senha de
              administrador para continuar.
            </p>
            <div className="field">
              <label htmlFor="admin-pass">Senha de administrador</label>
              <input
                type="password" id="admin-pass" autoComplete="off" required
                value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary auth-btn">Continuar</button>
          </form>
        )}

        {step === 2 && (
          <form className="auth-form" onSubmit={handleRegister}>
            <p className="auth-hint">
              Preencha os dados do funcionário. Ele entrará no dashboard com este
              e-mail e senha.
            </p>
            <div className="field">
              <label htmlFor="reg-name">Nome do funcionário</label>
              <input
                type="text" id="reg-name" autoComplete="off" required
                value={name} onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="reg-email">E-mail</label>
              <input
                type="email" id="reg-email" autoComplete="off" required
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="reg-password">
                Senha de acesso <small>(mín. 6 caracteres)</small>
              </label>
              <input
                type="password" id="reg-password" autoComplete="new-password"
                minLength={6} required
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary auth-btn" disabled={submitting}>
              Cadastrar funcionário
            </button>
          </form>
        )}

        <p className={"auth-msg" + (msgType ? " " + msgType : "")}>{msg}</p>

        <p className="auth-foot">
          <Link to="/login">Voltar para o login</Link>
        </p>
      </div>
    </div>
  );
}
