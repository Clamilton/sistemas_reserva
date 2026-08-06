import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { signSession } from "../auth/jwt";
import { requireAuth, SESSION_COOKIE } from "../auth/middleware";
import { logAudit } from "../lib/audit";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const isHttps = process.env.COOKIE_SECURE === "true";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isHttps,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    return;
  }

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user) {
    res.status(401).json({ error: "Usuário ou senha inválidos" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Usuário ou senha inválidos" });
    return;
  }

  const token = signSession(user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  await logAudit({
    actorId: user.id,
    actorNome: user.nome,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    description: `"${user.nome}" (${user.username}) entrou no sistema.`,
  });
  res.json({ id: user.id, username: user.username, nome: user.nome, isGestor: user.isGestor });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});
