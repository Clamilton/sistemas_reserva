import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";
import { broadcastNotification, notifyUser } from "../socket";
import type { NotificationType } from "@prisma/client";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

export async function pushNotification(type: NotificationType, message: string) {
  const notification = await prisma.notification.create({ data: { type, message } });
  broadcastNotification(notification);

  const count = await prisma.notification.count();
  if (count > 200) {
    const oldest = await prisma.notification.findMany({
      orderBy: { createdAt: "asc" },
      take: count - 200,
      select: { id: true },
    });
    await prisma.notification.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } });
  }
  return notification;
}

/** Notifica só usuários específicos (ex: gestores) — não aparece pra mais ninguém. */
export async function pushNotificationToUsers(
  type: NotificationType,
  message: string,
  userIds: string[],
) {
  const notifications = await Promise.all(
    userIds.map((recipientUserId) =>
      prisma.notification.create({ data: { type, message, recipientUserId } }),
    ),
  );
  for (const notification of notifications) {
    if (notification.recipientUserId) {
      notifyUser(notification.recipientUserId, notification);
    }
  }
  return notifications;
}

export async function notifyGestores(type: NotificationType, message: string) {
  const gestores = await prisma.user.findMany({ where: { isGestor: true }, select: { id: true } });
  if (gestores.length === 0) return [];
  return pushNotificationToUsers(type, message, gestores.map((g) => g.id));
}

notificationsRouter.get("/", async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: {
      OR: [{ recipientUserId: null }, { recipientUserId: req.user!.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(notifications);
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  await prisma.notification
    .update({ where: { id: req.params.id }, data: { read: true } })
    .catch(() => null);
  res.status(204).end();
});

notificationsRouter.post("/mark-all-read", async (req, res) => {
  await prisma.notification.updateMany({
    where: {
      read: false,
      OR: [{ recipientUserId: null }, { recipientUserId: req.user!.id }],
    },
    data: { read: true },
  });
  res.status(204).end();
});
