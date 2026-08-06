import { io, type Socket } from "socket.io-client";

export interface SocketNotification {
  id: string;
  type: "created" | "moved" | "finalized" | "paused" | "delegated";
  message: string;
  createdAt: string;
  read: boolean;
}

let socket: Socket | null = null;

export function connectSocket(onNotification: (notification: SocketNotification) => void): void {
  if (socket) return;

  socket = io({ withCredentials: true });
  socket.on("notification", onNotification);
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
