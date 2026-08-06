import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";

export const auditLogsRouter = Router();

auditLogsRouter.use(requireAuth);

auditLogsRouter.get("/", async (req, res) => {
  if (!req.user!.isGestor) {
    res.status(403).json({ error: "Somente o gestor pode ver o log de auditoria." });
    return;
  }

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

  const where: Prisma.AuditLogWhereInput = {};
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }
  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { actorNome: { contains: search, mode: "insensitive" } },
    ];
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  res.json(logs);
});
