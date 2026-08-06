import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { parse as parseCookies } from "cookie";
import { verifySession } from "./auth/jwt";
import { prisma } from "./db";
import { SESSION_COOKIE } from "./auth/middleware";
import type { Notification } from "@prisma/client";

let io: SocketIOServer | null = null;

function userRoom(userId: string) {
  return `user:${userId}`;
}

export function initSocket(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie;
      const parsed = raw ? parseCookies(raw) : {};
      const token = parsed[SESSION_COOKIE];
      const payload = token ? verifySession(token) : null;
      if (!payload) {
        next(new Error("Não autenticado"));
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        next(new Error("Não autenticado"));
        return;
      }

      socket.data.userId = user.id;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error("Falha na autenticação do socket"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.userId));
  });

  return io;
}

/** Notificação global — todo mundo conectado recebe. */
export function broadcastNotification(notification: Notification) {
  io?.emit("notification", notification);
}

/** Notificação direcionada — só o(s) destinatário(s) específico(s) recebem. */
export function notifyUser(userId: string, notification: Notification) {
  io?.to(userRoom(userId)).emit("notification", notification);
}
