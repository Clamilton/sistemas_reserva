import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { initials } from "../lib/initials";
import type { ColumnKind } from "../types";

const KIND_BAR: Record<ColumnKind, string> = {
  queue: "bg-neutral-500",
  active: "bg-accent-2-500",
  paused: "bg-accent-500",
  done: "bg-accent-2-700",
};

export function Relatorios() {
  const tasks = useAppStore((s) => s.tasks);
  const columns = useAppStore((s) => s.columns);
  const operadores = useAppStore((s) => s.operadores);

  const stats = useMemo(() => {
    const total = tasks.length;
    const concluidas = tasks.filter((t) => {
      const col = columns.find((c) => c.id === t.columnId);
      return col?.kind === "done";
    });
    const tempos = concluidas
      .filter((t) => t.finishedAt)
      .map((t) => (new Date(t.finishedAt!).getTime() - new Date(t.createdAt).getTime()) / 86_400_000);
    const mediaDias = tempos.length
      ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10
      : 0;
    const altas = tasks.filter((t) => t.prioridade === "alta").length;

    return [
      { label: "Total de demandas", value: total },
      { label: "Concluídas", value: concluidas.length },
      { label: "Tempo médio (dias)", value: mediaDias },
      { label: "Prioridade alta", value: altas },
    ];
  }, [tasks, columns]);

  const statusBars = useMemo(() => {
    const counts = columns.map((col) => tasks.filter((t) => t.columnId === col.id).length);
    const max = Math.max(1, ...counts);
    return columns.map((col, i) => ({
      key: col.id,
      label: col.title,
      count: counts[i],
      pct: (counts[i] / max) * 100,
      barClass: KIND_BAR[col.kind],
    }));
  }, [columns, tasks]);

  const respBars = useMemo(() => {
    const counts = operadores.map((op) => tasks.filter((t) => t.operadorId === op.id).length);
    const max = Math.max(1, ...counts);
    return operadores.map((op, i) => ({
      key: op.id,
      name: op.nome,
      count: counts[i],
      pct: (counts[i] / max) * 100,
    }));
  }, [operadores, tasks]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <h3 className="mb-4 font-heading text-xl">Relatórios</h3>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card elev-sm">
            <div className="card-kicker">{stat.label}</div>
            <div className="font-heading text-[30px]">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="card elev-sm">
          <div className="card-title mb-2">Demandas por status</div>
          {statusBars.map((bar) => (
            <div key={bar.key} className="mb-3">
              <div className="mb-1 flex justify-between text-xs">
                <span>{bar.label}</span>
                <span className="opacity-60">{bar.count}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={`h-full rounded-full ${bar.barClass}`}
                  style={{ width: `${bar.pct}%` }}
                />
              </div>
            </div>
          ))}
          {statusBars.length === 0 && <p className="text-sm opacity-50">Sem colunas cadastradas</p>}
        </div>

        <div className="card elev-sm">
          <div className="card-title mb-2">Por responsável</div>
          {respBars.map((bar) => (
            <div key={bar.key} className="mb-3 flex items-center gap-2.5">
              <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-2-200 text-[11px] font-bold text-accent-2-800">
                {initials(bar.name)}
              </div>
              <div className="flex-1">
                <div className="mb-0.5 text-[13px]">{bar.name}</div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${bar.pct}%` }} />
                </div>
              </div>
              <div className="flex-none text-[13px] opacity-60">{bar.count}</div>
            </div>
          ))}
          {respBars.length === 0 && <p className="text-sm opacity-50">Sem operadores cadastrados</p>}
        </div>
      </div>
    </div>
  );
}
