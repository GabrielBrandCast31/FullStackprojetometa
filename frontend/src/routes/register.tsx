import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authRegister } from "@/lib/api/client";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [adminPassword, setAdminPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (step === 1) {
      if (!adminPassword.trim()) { setError("Informe a senha de administrador"); return; }
      setStep(2); return;
    }
    setSubmitting(true);
    try {
      await authRegister(name.trim(), email.trim(), password, adminPassword);
      setSuccess("Cadastro feito! Redirecionando pro login...");
      setTimeout(() => nav({ to: "/login" }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no cadastro");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">B</div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Cadastro de funcionário</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              {step === 1 ? "Passo 1 — Senha de administrador" : "Passo 2 — Seus dados"}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {step === 1 ? (
            <div>
              <label htmlFor="admin" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Senha de administrador
              </label>
              <input
                id="admin" type="password" autoFocus required
                value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome</label>
                <input
                  id="name" type="text" autoFocus required
                  value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
                <input
                  id="email" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label htmlFor="pw" className="mb-1.5 block text-xs font-medium text-muted-foreground">Senha</label>
                <input
                  id="pw" type="password" autoComplete="new-password" required minLength={6}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </>
          )}

          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {success && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{success}</p>}

          <button
            type="submit" disabled={submitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {step === 1 ? "Continuar" : submitting ? "Enviando..." : "Cadastrar"}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
