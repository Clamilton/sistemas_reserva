import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { createServer } from "http";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { empresasRouter } from "./routes/empresas";
import { tasksRouter } from "./routes/tasks";
import { notificationsRouter } from "./routes/notifications";
import { columnsRouter } from "./routes/columns";
import { auditLogsRouter } from "./routes/auditLogs";
import { initSocket } from "./socket";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/empresas", empresasRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/columns", columnsRouter);
app.use("/api/audit-logs", auditLogsRouter);

const staticDir = path.join(__dirname, "../public");
app.use(express.static(staticDir));
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(staticDir, "index.html"));
});

const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
