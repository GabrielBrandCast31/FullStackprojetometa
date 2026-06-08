import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authLogin, setAuthToken } from "@/lib/api/client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { token } = await authLogin(email.trim(), password);
      setAuthToken(token);
      nav({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
            B
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Agência Brandcast</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              Dashboard Meta Ads
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Email
            </label>
            <input
              id="email" type="email" autoComplete="email" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Senha
            </label>
            <input
              id="password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit" disabled={submitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Entrando..." : "Entrar"}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Não tem conta?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Cadastre-se
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
