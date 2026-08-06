import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";

export const columnsRouter = Router();

columnsRouter.use(requireAuth);

columnsRouter.get("/", async (_req, res) => {
  const columns = await prisma.column.findMany({ orderBy: { order: "asc" } });
  res.json(columns);
});
