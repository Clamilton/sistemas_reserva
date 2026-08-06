import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { getAuditLogs } from "../lib/api";
import { useToastStore } from "../store/useToastStore";
import { formatDateTime } from "../lib/time";
import type { AuditLog } from "../types";

const ACTION_LABEL: Record<string, string> = {
  "task.created": "Demanda criada",
  "task.moved": "Demanda movida",
  "task.finalized": "Demanda finalizada",
  "task.priority_changed": "Prioridade alterada",
  "task.deleted": "Demanda excluída",
  "empresa.created": "Empresa cadastrada",
  "empresa.updated": "Empresa atualizada",
  "empresa.deleted": "Empresa excluída",
  "empresa.imported": "Empresas importadas",
  "user.created": "Usuário criado",
  "user.gestor_changed": "Poder de gestor alterado",
  "auth.login": "Login",
};

const ACTION_TAG_CLASS: Record<string, string> = {
  "task.deleted": "tag-accent",
  "empresa.deleted": "tag-accent",
  "user.gestor_changed": "tag-accent",
};

export function Auditoria() {
  const pushToast = useToastStore((s) => s.push);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function load() {
    setLoading(true);
    try {
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined;
      const data = await getAuditLogs({ dateFrom: from, dateTo: to, search: search.trim() || undefined });
      setLogs(data);
    } catch {
      pushToast("Não foi possível carregar o log de auditoria.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmitFilters(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-heading text-xl">Auditoria</h3>
        <button onClick={load} className="btn btn-secondary" disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      <form onSubmit={handleSubmitFilters} className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <Search
            size={15}
            strokeWidth={2.75}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50"
          />
          <input
            className="input pl-9"
            placeholder="Buscar por descrição ou usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input
          type="date"
          aria-label="De"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => setDateFrom(e.target.value)}
          className="input w-[150px] flex-none"
        />
        <span className="flex-none text-xs opacity-50">até</span>
        <input
          type="date"
          aria-label="Até"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => setDateTo(e.target.value)}
          className="input w-[150px] flex-none"
        />
        <button type="submit" className="btn btn-primary flex-none">
          Filtrar
        </button>
      </form>

      <div className="card elev-sm p-0">
        {loading && logs.length === 0 && (
          <p className="px-4 py-8 text-center text-sm opacity-50">Carregando...</p>
        )}
        {!loading && logs.length === 0 && (
          <p className="px-4 py-8 text-center text-sm opacity-50">Nenhum registro encontrado.</p>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-3 border-b border-[color:var(--color-divider)] px-4 py-3 text-sm last:border-b-0"
          >
            <span className="w-[130px] flex-none pt-0.5 text-xs opacity-60">
              {formatDateTime(log.createdAt)}
            </span>
            <span
              className={`tag flex-none ${ACTION_TAG_CLASS[log.action] ?? "tag-neutral"}`}
              title={log.action}
            >
              {ACTION_LABEL[log.action] ?? log.action}
            </span>
            <span className="flex-1">
              {log.description}
              <span className="ml-1.5 opacity-50">— por {log.actorNome}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
