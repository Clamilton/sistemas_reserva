import type { NextFunction, Request, Response } from "express";
import { verifySession } from "./jwt";
import { prisma } from "../db";

export interface AuthedUser {
  id: string;
  username: string;
  nome: string;
  isGestor: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export const SESSION_COOKIE = "session";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const payload = token ? verifySession(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  req.user = { id: user.id, username: user.username, nome: user.nome, isGestor: user.isGestor };
  next();
}
