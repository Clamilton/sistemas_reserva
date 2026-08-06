/** Marca a última vez que a aba do Kanban esteve visível/em foco, pra saber
 * quais demandas chegaram enquanto o usuário estava fora (e devem piscar
 * quando ele reabrir a aba). */
const KEY = "demandas:lastSeenAt";

export function getLastSeenAt(): number {
  const raw = localStorage.getItem(KEY);
  if (!raw) return Date.now();
  const n = Number(raw);
  return Number.isFinite(n) ? n : Date.now();
}

export function setLastSeenAt(ts: number): void {
  localStorage.setItem(KEY, String(ts));
}
