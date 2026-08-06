import type { Task } from "../types";

export function buildFinalMessage(task: Task): string {
  const empresa = task.empresa.trim();

  if (task.tipo === "compensacao") {
    const siglas = task.siglasImpostos.length > 0 ? task.siglasImpostos.join("/") : task.guiaImposto;
    return `Empresa "${empresa}" - Compensada, ${siglas}`;
  }

  return `Empresa "${empresa}" retificada, relatório no Bitrix.`;
}
