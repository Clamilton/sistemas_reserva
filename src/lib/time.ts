import { useEffect, useState } from "react";
import type { StatusHistoryEntry } from "../types";

export function useTicker(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/**
 * Soma só os períodos em que a tarefa esteve numa coluna "active" — tempo
 * parado em "Em Pausa" (kind "paused") não conta como tempo decorrido.
 */
export function computeElapsedMs(statusHistory: StatusHistoryEntry[], now: number): number {
  let total = 0;
  for (const entry of statusHistory) {
    if (entry.columnKind !== "active") continue;
    const end = entry.exitedAt ? new Date(entry.exitedAt).getTime() : now;
    total += end - new Date(entry.enteredAt).getTime();
  }
  return total;
}

/** Formata uma Date para o valor esperado por <input type="datetime-local">, em horário local. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
