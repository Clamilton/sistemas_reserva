import type {
  AppNotification,
  AuditLog,
  Column,
  CurrentUser,
  DemandType,
  Empresa,
  Operador,
  PerdcompLinha,
  Prioridade,
  StatusHistoryEntry,
  Task,
} from "../types";

export interface BlockingTaskInfo {
  id: string;
  empresaNome: string;
  prioridade: Prioridade;
  createdAt: string;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let body: unknown;
    try {
      body = await res.json();
      const parsed = body as { error?: string } | undefined;
      if (parsed?.error) message = parsed.error;
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// --- auth ---

export function login(username: string, password: string): Promise<CurrentUser> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function logout(): Promise<void> {
  return request("/auth/logout", { method: "POST" });
}

export function me(): Promise<CurrentUser> {
  return request("/auth/me");
}

// --- users (operadores) ---

interface ServerUser {
  id: string;
  username: string;
  nome: string;
  isGestor: boolean;
}

export async function getUsers(): Promise<Operador[]> {
  const users = await request<ServerUser[]>("/users");
  return users.map((u) => ({ id: u.id, nome: u.nome, isGestor: u.isGestor }));
}

export function createUser(
  username: string,
  password: string,
  nome: string,
  isGestor: boolean,
): Promise<ServerUser> {
  return request("/users", {
    method: "POST",
    body: JSON.stringify({ username, password, nome, isGestor }),
  });
}

export function updateUserGestor(id: string, isGestor: boolean): Promise<ServerUser> {
  return request(`/users/${id}/gestor`, {
    method: "PATCH",
    body: JSON.stringify({ isGestor }),
  });
}

// --- columns ---

export function getColumns(): Promise<Column[]> {
  return request("/columns");
}

// --- empresas ---

export function getEmpresas(): Promise<Empresa[]> {
  return request("/empresas");
}

export function addEmpresa(cnpj: string, nome: string): Promise<Empresa> {
  return request("/empresas", { method: "POST", body: JSON.stringify({ cnpj, nome }) });
}

export function removeEmpresa(id: string): Promise<void> {
  return request(`/empresas/${id}`, { method: "DELETE" });
}

export function importEmpresas(
  lines: { cnpj: string; nome: string }[],
): Promise<{ added: number; updated: number }> {
  return request("/empresas/import", { method: "POST", body: JSON.stringify({ lines }) });
}

// --- tasks ---

interface ServerStatusHistoryEntry {
  columnId: string;
  columnTitle: string;
  columnKind: StatusHistoryEntry["columnKind"];
  motivo: string | null;
  enteredAt: string;
  exitedAt: string | null;
  changedBy: { id: string; nome: string };
}

interface ServerTask {
  id: string;
  empresaNome: string;
  cnpj: string;
  empresaId: string | null;
  guiaImposto: string;
  siglasImpostos: string[];
  tipo: DemandType;
  retificacaoDetalhes: string | null;
  origemSolicitacao: string;
  prioridade: Prioridade;
  rawText: string;
  columnId: string;
  order: number;
  createdAt: string;
  createdBy: { id: string; nome: string };
  operadorId: string;
  operador: { id: string; nome: string };
  startedAt: string | null;
  finishedAt: string | null;
  finalMessage: string | null;
  finalizedBy: { id: string; nome: string } | null;
  perdcompDados: PerdcompLinha[] | null;
  statusHistory: ServerStatusHistoryEntry[];
}

function mapStatusHistory(entry: ServerStatusHistoryEntry): StatusHistoryEntry {
  return {
    columnId: entry.columnId,
    columnTitle: entry.columnTitle,
    columnKind: entry.columnKind,
    motivo: entry.motivo,
    enteredAt: entry.enteredAt,
    exitedAt: entry.exitedAt,
    changedByNome: entry.changedBy.nome,
  };
}

function mapTask(t: ServerTask): Task {
  return {
    id: t.id,
    empresa: t.empresaNome,
    cnpj: t.cnpj,
    empresaId: t.empresaId,
    guiaImposto: t.guiaImposto,
    siglasImpostos: t.siglasImpostos,
    tipo: t.tipo,
    retificacaoDetalhes: t.retificacaoDetalhes,
    origemSolicitacao: t.origemSolicitacao,
    prioridade: t.prioridade,
    operadorId: t.operadorId,
    operadorNome: t.operador.nome,
    columnId: t.columnId,
    order: t.order,
    createdAt: t.createdAt,
    createdByNome: t.createdBy.nome,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    statusHistory: t.statusHistory.map(mapStatusHistory),
    rawText: t.rawText,
    finalMessage: t.finalMessage,
    finalizedByNome: t.finalizedBy?.nome ?? null,
    perdcompDados: t.perdcompDados,
  };
}

export async function getTasks(): Promise<Task[]> {
  const tasks = await request<ServerTask[]>("/tasks");
  return tasks.map(mapTask);
}

export interface NewTaskInput {
  empresaNome: string;
  cnpj: string;
  empresaId: string | null;
  guiaImposto: string;
  siglasImpostos: string[];
  tipo: DemandType;
  retificacaoDetalhes: string | null;
  origemSolicitacao: string;
  prioridade: Prioridade;
  operadorId: string;
  rawText: string;
  createdAt?: string;
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const task = await request<ServerTask>("/tasks", { method: "POST", body: JSON.stringify(input) });
  return mapTask(task);
}

export async function moveTask(
  taskId: string,
  destColumnId: string,
  destIndex: number,
  motivo?: string,
): Promise<Task> {
  const task = await request<ServerTask>(`/tasks/${taskId}/move`, {
    method: "PATCH",
    body: JSON.stringify({ destColumnId, destIndex, motivo }),
  });
  return mapTask(task);
}

export async function updateTaskPriority(taskId: string, prioridade: Prioridade): Promise<Task> {
  const task = await request<ServerTask>(`/tasks/${taskId}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ prioridade }),
  });
  return mapTask(task);
}

export async function delegateTask(taskId: string, operadorId: string): Promise<Task> {
  const task = await request<ServerTask>(`/tasks/${taskId}/operador`, {
    method: "PATCH",
    body: JSON.stringify({ operadorId }),
  });
  return mapTask(task);
}

export async function finalizeTask(
  taskId: string,
  message: string,
  perdcompDados?: PerdcompLinha[],
): Promise<Task> {
  const task = await request<ServerTask>(`/tasks/${taskId}/finalize`, {
    method: "POST",
    body: JSON.stringify({ message, perdcompDados }),
  });
  return mapTask(task);
}

export function deleteTask(taskId: string): Promise<void> {
  return request(`/tasks/${taskId}`, { method: "DELETE" });
}

// --- audit logs ---

export interface AuditLogFilters {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export function getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  const qs = params.toString();
  return request(`/audit-logs${qs ? `?${qs}` : ""}`);
}

// --- notifications ---

export function getNotifications(): Promise<AppNotification[]> {
  return request("/notifications");
}

export function markNotificationRead(id: string): Promise<void> {
  return request(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead(): Promise<void> {
  return request("/notifications/mark-all-read", { method: "POST" });
}
