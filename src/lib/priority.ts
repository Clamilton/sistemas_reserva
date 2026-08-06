import type { Prioridade, Task } from "../types";

export const PRIORITY_RANK: Record<Prioridade, number> = { baixa: 1, media: 2, alta: 3 };

export const PRIORITY_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

/** Tarefa mais urgente ainda não iniciada, entre as prioridades Alta/Média (que têm ordem obrigatória). */
export function findMostUrgentPending(tasks: Task[]): Task | null {
  const candidates = tasks.filter((t) => !t.startedAt && t.prioridade !== "baixa");
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const rankDiff = PRIORITY_RANK[b.prioridade] - PRIORITY_RANK[a.prioridade];
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return candidates[0];
}
