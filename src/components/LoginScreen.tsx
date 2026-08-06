import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    await login(username.trim(), password);
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-bg)] px-4 font-body text-[color:var(--color-text)]">
      <form onSubmit={handleSubmit} className="card elev-lg w-full max-w-sm p-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent">
          <LayoutGrid size={20} style={{ stroke: "var(--color-bg)" }} strokeWidth={2.75} />
        </div>
        <h1 className="font-heading text-lg">Controle de Demandas</h1>
        <p className="mt-1 text-sm opacity-60">Entre com seu usuário para continuar.</p>

        <div className="mt-5 flex flex-col gap-3">
          <div className="field">
            <label>Usuário</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className="input"
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={submitting} className="btn btn-primary mt-5 w-full">
          {submitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
