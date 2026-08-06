import { useState } from "react";
import { Building2, LayoutGrid, ListFilter, Search, ShieldCheck, Users, X, BarChart3 } from "lucide-react";
import { PRIORITY_LABEL } from "../lib/priority";
import type { DemandType, Prioridade } from "../types";

export type ViewKind = "kanban" | "relatorios" | "auditoria";

const PRIO_OPTIONS: Prioridade[] = ["alta", "media", "baixa"];
const TIPO_OPTIONS: DemandType[] = ["compensacao", "retificacao"];
const TIPO_LABEL: Record<DemandType, string> = {
  compensacao: "Compensação",
  retificacao: "Retificação",
};

interface Props {
  view: ViewKind;
  onSetView: (v: ViewKind) => void;
  onEmpresas: () => void;
  onUsuarios: () => void;
  isGestor: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  filterResp: string;
  onFilterRespChange: (v: string) => void;
  filterPrio: string;
  onFilterPrioChange: (v: string) => void;
  filterTipo: string;
  onFilterTipoChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  respOptions: string[];
}

export function NavFilterBar({
  view,
  onSetView,
  onEmpresas,
  onUsuarios,
  isGestor,
  search,
  onSearchChange,
  filterResp,
  onFilterRespChange,
  filterPrio,
  onFilterPrioChange,
  filterTipo,
  onFilterTipoChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  respOptions,
}: Props) {
  const [rowMode, setRowMode] = useState<"nav" | "filter">("nav");

  const navItem = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-3 py-2.5 text-sm cursor-pointer font-body ${
      active ? "bg-accent font-bold" : "opacity-70 hover:opacity-100"
    }`;

  const barButtonStyle = {
    background: "var(--color-accent-2-600)",
    color: "var(--color-header-text)",
    border: "1px solid var(--color-accent-2-400)",
  };

  return (
    <div
      className="relative h-[52px] flex-none overflow-hidden"
      style={{
        background: "var(--color-accent-2-800)",
        borderBottom: "1px solid var(--color-accent-2-600)",
        color: "var(--color-header-text)",
      }}
    >
      <div
        className={`absolute inset-0 flex items-center gap-1.5 px-4 transition-all duration-200 ${
          rowMode === "nav"
            ? "translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-4 opacity-0"
        }`}
      >
        <div onClick={() => onSetView("kanban")} className={navItem(view === "kanban")}>
          <LayoutGrid size={16} strokeWidth={2.75} />
          Kanban
        </div>
        <div onClick={() => onSetView("relatorios")} className={navItem(view === "relatorios")}>
          <BarChart3 size={16} strokeWidth={2.75} />
          Relatórios
        </div>
        <div onClick={onEmpresas} className={navItem(false)}>
          <Building2 size={16} strokeWidth={2.75} />
          Empresas
        </div>
        <div onClick={onUsuarios} className={navItem(false)}>
          <Users size={16} strokeWidth={2.75} />
          Usuários
        </div>
        {isGestor && (
          <div onClick={() => onSetView("auditoria")} className={navItem(view === "auditoria")}>
            <ShieldCheck size={16} strokeWidth={2.75} />
            Auditoria
          </div>
        )}
        <div className="flex-1" />
        <button onClick={() => setRowMode("filter")} className="btn flex-none" style={barButtonStyle}>
          <ListFilter size={15} strokeWidth={2.75} />
          Filtros
        </button>
      </div>

      <div
        className={`absolute inset-0 flex items-center gap-2 overflow-x-auto px-4 transition-all duration-200 ${
          rowMode === "filter"
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-4 opacity-0"
        }`}
      >
        <div className="relative min-w-[140px] max-w-[220px] flex-1">
          <Search
            size={15}
            strokeWidth={2.75}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50"
          />
          <input
            className="input pl-9"
            placeholder="Buscar por empresa..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <select
          className="input w-[150px] flex-none"
          value={filterResp}
          onChange={(e) => onFilterRespChange(e.target.value)}
        >
          <option value="">Responsável</option>
          {respOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <select
          className="input w-[130px] flex-none"
          value={filterPrio}
          onChange={(e) => onFilterPrioChange(e.target.value)}
        >
          <option value="">Prioridade</option>
          {PRIO_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select
          className="input w-[150px] flex-none"
          value={filterTipo}
          onChange={(e) => onFilterTipoChange(e.target.value)}
        >
          <option value="">Tipo</option>
          {TIPO_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>
        <label className="flex flex-none items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={!dateFrom && !dateTo}
            onChange={(e) => {
              if (e.target.checked) {
                onDateFromChange("");
                onDateToChange("");
              }
            }}
            className="rounded border-[color:var(--color-divider)]"
          />
          Todos
        </label>
        <div className="flex flex-none items-center gap-1.5">
          <input
            type="date"
            aria-label="Data de criação — de"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="input w-[140px] flex-none"
          />
          <span className="flex-none text-xs opacity-50">até</span>
          <input
            type="date"
            aria-label="Data de criação — até"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => onDateToChange(e.target.value)}
            className="input w-[140px] flex-none"
          />
        </div>
        <div className="flex-1" />
        <button onClick={() => setRowMode("nav")} className="btn flex-none" style={barButtonStyle}>
          <X size={15} strokeWidth={2.75} />
          Menu
        </button>
      </div>
    </div>
  );
}
