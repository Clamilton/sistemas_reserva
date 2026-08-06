import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";
import { logAudit } from "../lib/audit";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, nome: true, isGestor: true, createdAt: true },
    orderBy: { nome: "asc" },
  });
  res.json(users);
});

const createUserSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(6),
  nome: z.string().min(1).max(120),
  isGestor: z.boolean().default(false),
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const username = parsed.data.username.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: "Já existe um usuário com esse nome de acesso" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      nome: parsed.data.nome.trim(),
      isGestor: parsed.data.isGestor,
    },
    select: { id: true, username: true, nome: true, isGestor: true, createdAt: true },
  });

  await logAudit({
    actorId: req.user!.id,
    actorNome: req.user!.nome,
    action: "user.created",
    entityType: "User",
    entityId: user.id,
    description: `Usuário "${user.nome}" (${user.username}) criado${user.isGestor ? " como gestor" : ""}.`,
  });

  res.status(201).json(user);
});

const updateGestorSchema = z.object({
  isGestor: z.boolean(),
});

usersRouter.patch("/:id/gestor", async (req, res) => {
  const parsed = updateGestorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  if (!parsed.data.isGestor && target.isGestor) {
    const gestorCount = await prisma.user.count({ where: { isGestor: true } });
    if (gestorCount <= 1) {
      res.status(400).json({ error: "Precisa existir pelo menos um gestor" });
      return;
    }
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isGestor: parsed.data.isGestor },
    select: { id: true, username: true, nome: true, isGestor: true, createdAt: true },
  });

  await logAudit({
    actorId: req.user!.id,
    actorNome: req.user!.nome,
    action: "user.gestor_changed",
    entityType: "User",
    entityId: user.id,
    description: `Usuário "${user.nome}" ${parsed.data.isGestor ? "promovido a gestor" : "removido de gestor"}.`,
  });

  res.json(user);
});
