import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";
import { pushNotification, notifyGestores } from "./notifications";
import { canMoveTask } from "../lib/permissions";
import { logAudit } from "../lib/audit";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

const taskInclude = {
  statusHistory: {
    orderBy: { enteredAt: "asc" as const },
    include: { changedBy: { select: { id: true, nome: true } } },
  },
  createdBy: { select: { id: true, nome: true } },
  operador: { select: { id: true, nome: true } },
  finalizedBy: { select: { id: true, nome: true } },
};

const PRIORITY_RANK: Record<string, number> = { baixa: 1, media: 2, alta: 3 };

interface BlockingCandidate {
  id: string;
  empresaNome: string;
  prioridade: string;
  createdAt: Date;
}

/**
 * Regra: pra iniciar uma tarefa, não pode haver outra tarefa não iniciada de
 * prioridade estritamente maior. Além disso, dentro do mesmo nível (exceto
 * "baixa"), a mais antiga tem que ser iniciada primeiro (FIFO por nível).
 */
function findBlockingTask(
  candidates: BlockingCandidate[],
  thisPrioridade: string,
  thisCreatedAt: Date,
): BlockingCandidate | null {
  const thisRank = PRIORITY_RANK[thisPrioridade];

  const blockers = candidates.filter((c) => {
    const rank = PRIORITY_RANK[c.prioridade];
    if (rank > thisRank) return true;
    if (rank === thisRank && thisPrioridade !== "baixa" && c.createdAt < thisCreatedAt) return true;
    return false;
  });

  if (blockers.length === 0) return null;

  blockers.sort((a, b) => {
    const rankDiff = PRIORITY_RANK[b.prioridade] - PRIORITY_RANK[a.prioridade];
    if (rankDiff !== 0) return rankDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return blockers[0];
}

tasksRouter.get("/", async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: req.user!.isGestor ? undefined : { operadorId: req.user!.id },
    include: taskInclude,
    orderBy: { order: "asc" },
  });
  res.json(tasks);
});

const createTaskSchema = z.object({
  empresaNome: z.string().min(1),
  cnpj: z.string().default(""),
  empresaId: z.string().nullable().optional(),
  guiaImposto: z.string().default(""),
  siglasImpostos: z.array(z.string()).default([]),
  tipo: z.enum(["compensacao", "retificacao"]),
  retificacaoDetalhes: z.string().trim().nullable().optional(),
  prioridade: z.enum(["baixa", "media", "alta"]).default("media"),
  operadorId: z.string().min(1),
  rawText: z.string().default(""),
  createdAt: z.string().datetime().optional(),
  origemSolicitacao: z.string().trim().min(1).default("Grupo de Comunicação e Atendimento"),
});

tasksRouter.post("/", async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const queueColumn = await prisma.column.findFirst({ where: { kind: "queue" } });
  if (!queueColumn) {
    res.status(500).json({ error: "Nenhuma coluna de fila configurada" });
    return;
  }

  const count = await prisma.task.count({ where: { columnId: queueColumn.id } });
  const createdAt = parsed.data.createdAt ? new Date(parsed.data.createdAt) : new Date();

  const task = await prisma.task.create({
    data: {
      empresaNome: parsed.data.empresaNome,
      cnpj: parsed.data.cnpj,
      empresaId: parsed.data.empresaId ?? null,
      guiaImposto: parsed.data.guiaImposto,
      siglasImpostos: parsed.data.siglasImpostos,
      tipo: parsed.data.tipo,
      retificacaoDetalhes: parsed.data.retificacaoDetalhes || null,
      prioridade: parsed.data.prioridade,
      rawText: parsed.data.rawText,
      origemSolicitacao: parsed.data.origemSolicitacao,
      columnId: queueColumn.id,
      order: count,
      createdAt,
      createdById: req.user!.id,
      operadorId: parsed.data.operadorId,
      statusHistory: {
        create: {
          columnId: queueColumn.id,
          columnTitle: queueColumn.title,
          columnKind: queueColumn.kind,
          changedById: req.user!.id,
          enteredAt: createdAt,
        },
      },
    },
    include: taskInclude,
  });

  await pushNotification("created", `Nova demanda criada: ${task.empresaNome || "(sem empresa)"}`);
  await logAudit({
    actorId: req.user!.id,
    actorNome: req.user!.nome,
    action: "task.created",
    entityType: "Task",
    entityId: task.id,
    description: `Demanda criada para "${task.empresaNome || "(sem empresa)"}" (${task.tipo}), atribuída a ${task.operador.nome}.`,
  });
  res.status(201).json(task);
});

const moveTaskSchema = z.object({
  destColumnId: z.string().min(1),
  destIndex: z.number().int().min(0),
  motivo: z.string().trim().min(1).optional(),
});

tasksRouter.patch("/:id/move", async (req, res) => {
  const parsed = moveTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  const destColumn = await prisma.column.findUnique({ where: { id: parsed.data.destColumnId } });
  if (!task || !destColumn) {
    res.status(404).json({ error: "Tarefa ou coluna não encontrada" });
    return;
  }

  const sameColumn = task.columnId === destColumn.id;
  const srcColumn = sameColumn ? destColumn : await prisma.column.findUnique({ where: { id: task.columnId } });
  if (!srcColumn) {
    res.status(404).json({ error: "Coluna de origem não encontrada" });
    return;
  }

  if (
    !sameColumn &&
    !req.user!.isGestor &&
    !canMoveTask(req.user!.isGestor, srcColumn.kind, srcColumn.order, destColumn.kind, destColumn.order)
  ) {
    res.status(403).json({
      error:
        srcColumn.kind === "done"
          ? "Somente o gestor pode mover uma demanda já concluída."
          : "Você só pode mover a demanda para frente, ou entre Em Andamento e Em Pausa.",
    });
    return;
  }

  const isStarting = !sameColumn && !task.startedAt && destColumn.kind !== "queue";

  if (isStarting) {
    const others = await prisma.task.findMany({
      where: { startedAt: null, id: { not: task.id } },
      select: { id: true, empresaNome: true, prioridade: true, createdAt: true },
    });
    const blocker = findBlockingTask(others, task.prioridade, task.createdAt);
    if (blocker) {
      res.status(409).json({
        error: `Existe uma demanda de prioridade mais urgente aguardando: "${blocker.empresaNome}" — inicie ela primeiro.`,
        blockingTask: blocker,
      });
      return;
    }
  }

  if (!sameColumn && destColumn.kind === "paused" && !parsed.data.motivo) {
    res.status(400).json({ error: "Informe o motivo da pausa." });
    return;
  }

  const now = new Date();

  const siblings = await prisma.task.findMany({
    where: { columnId: destColumn.id, id: { not: task.id } },
    orderBy: { order: "asc" },
  });
  const destIndex = Math.min(parsed.data.destIndex, siblings.length);
  siblings.splice(destIndex, 0, task);

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      siblings.map((t, idx) => tx.task.update({ where: { id: t.id }, data: { order: idx } })),
    );

    if (!sameColumn) {
      const openEntry = await tx.statusHistoryEntry.findFirst({
        where: { taskId: task.id, exitedAt: null },
        orderBy: { enteredAt: "desc" },
      });
      if (openEntry) {
        await tx.statusHistoryEntry.update({ where: { id: openEntry.id }, data: { exitedAt: now } });
      }

      await tx.statusHistoryEntry.create({
        data: {
          taskId: task.id,
          columnId: destColumn.id,
          columnTitle: destColumn.title,
          columnKind: destColumn.kind,
          motivo: destColumn.kind === "paused" ? parsed.data.motivo : null,
          changedById: req.user!.id,
          enteredAt: now,
        },
      });

      await tx.task.update({
        where: { id: task.id },
        data: {
          columnId: destColumn.id,
          startedAt: destColumn.kind !== "queue" && !task.startedAt ? now : task.startedAt,
        },
      });
    }
  });

  if (!sameColumn) {
    await pushNotification("moved", `${task.empresaNome || "Demanda"} movida para ${destColumn.title}`);
    if (destColumn.kind === "paused") {
      await notifyGestores(
        "paused",
        `"${task.empresaNome || "Demanda"}" foi pausada: ${parsed.data.motivo}`,
      );
    }
    await logAudit({
      actorId: req.user!.id,
      actorNome: req.user!.nome,
      action: "task.moved",
      entityType: "Task",
      entityId: task.id,
      description: `Demanda "${task.empresaNome || "(sem empresa)"}" movida de "${srcColumn.title}" para "${destColumn.title}"${
        parsed.data.motivo ? ` — motivo: ${parsed.data.motivo}` : ""
      }.`,
    });
  }

  const updated = await prisma.task.findUnique({ where: { id: task.id }, include: taskInclude });
  res.json(updated);
});

const finalizeSchema = z.object({
  message: z.string().min(1),
});

tasksRouter.post("/:id/finalize", async (req, res) => {
  const parsed = finalizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Mensagem é obrigatória" });
    return;
  }

  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) {
    res.status(404).json({ error: "Tarefa não encontrada" });
    return;
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      finishedAt: task.finishedAt ?? new Date(),
      finalMessage: parsed.data.message,
      finalizedById: req.user!.id,
    },
    include: taskInclude,
  });

  await pushNotification("finalized", `${task.empresaNome || "Demanda"} finalizada`);
  await logAudit({
    actorId: req.user!.id,
    actorNome: req.user!.nome,
    action: "task.finalized",
    entityType: "Task",
    entityId: task.id,
    description: `Demanda "${task.empresaNome || "(sem empresa)"}" finalizada com mensagem: "${parsed.data.message}".`,
  });
  res.json(updated);
});

const prioritySchema = z.object({
  prioridade: z.enum(["baixa", "media", "alta"]),
});

tasksRouter.patch("/:id/priority", async (req, res) => {
  const parsed = prioritySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Prioridade inválida" });
    return;
  }

  const before = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!before) {
    res.status(404).json({ error: "Tarefa não encontrada" });
    return;
  }

  const updated = await prisma.task.update({
    where: { id: req.params.id },
    data: { prioridade: parsed.data.prioridade },
    include: taskInclude,
  });

  if (before.prioridade !== parsed.data.prioridade) {
    await logAudit({
      actorId: req.user!.id,
      actorNome: req.user!.nome,
      action: "task.priority_changed",
      entityType: "Task",
      entityId: updated.id,
      description: `Prioridade de "${updated.empresaNome || "(sem empresa)"}" alterada de ${before.prioridade} para ${parsed.data.prioridade}.`,
    });
  }

  res.json(updated);
});

tasksRouter.delete("/:id", async (req, res) => {
  if (!req.user!.isGestor) {
    res.status(403).json({ error: "Somente o gestor pode excluir demandas." });
    return;
  }

  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) {
    res.status(404).json({ error: "Tarefa não encontrada" });
    return;
  }

  await prisma.task.delete({ where: { id: task.id } });
  await logAudit({
    actorId: req.user!.id,
    actorNome: req.user!.nome,
    action: "task.deleted",
    entityType: "Task",
    entityId: task.id,
    description: `Demanda "${task.empresaNome || "(sem empresa)"}" excluída.`,
  });
  res.status(204).end();
});
