import type { ColumnKind } from "../types";

/**
 * Operador comum só pode mover pra frente no fluxo, ou trocar entre
 * Em Andamento <-> Em Pausa. Uma demanda já Concluída só o gestor mexe.
 * srcOrder/destOrder: posição da coluna na sequência do quadro.
 */
export function canMoveTask(
  isGestor: boolean,
  srcKind: ColumnKind,
  srcOrder: number,
  destKind: ColumnKind,
  destOrder: number,
): boolean {
  if (isGestor) return true;
  if (srcKind === "done") return false;

  const forward = destOrder > srcOrder;
  const pausedActiveSwap =
    (srcKind === "active" && destKind === "paused") || (srcKind === "paused" && destKind === "active");

  return forward || pausedActiveSwap;
}
