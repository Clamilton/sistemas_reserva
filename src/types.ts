export type DemandType = "compensacao" | "retificacao";

export type Prioridade = "baixa" | "media" | "alta";

export type ColumnKind = "queue" | "active" | "paused" | "done";

export interface Column {
  id: string;
  title: string;
  kind: ColumnKind;
}

export interface Operador {
  id: string;
  nome: string;
  isGestor: boolean;
}

export interface Empresa {
  id: string;
  cnpj: string;
  nome: string;
}

export interface StatusHistoryEntry {
  columnId: string;
  columnTitle: string;
  columnKind: ColumnKind;
  motivo: string | null;
  enteredAt: string;
  exitedAt: string | null;
  changedByNome: string;
}

export interface PerdcompLinha {
  pa: string;
  imposto: string;
  valor: string;
}

export interface Task {
  id: string;
  empresa: string;
  cnpj: string;
  empresaId: string | null;
  guiaImposto: string;
  siglasImpostos: string[];
  tipo: DemandType;
  retificacaoDetalhes: string | null;
  origemSolicitacao: string;
  prioridade: Prioridade;
  operadorId: string;
  operadorNome: string;
  columnId: string;
  order: number;
  createdAt: string;
  createdByNome: string;
  startedAt: string | null;
  finishedAt: string | null;
  statusHistory: StatusHistoryEntry[];
  rawText: string;
  finalMessage: string | null;
  finalizedByNome: string | null;
  /** Débitos extraídos dos PDFs de PER/DCOMP anexados ao finalizar esta
   * demanda — todos os PDFs já somados numa lista só (1 demanda = 1
   * compensação, mesmo que tenha vários PDFs). */
  perdcompDados: PerdcompLinha[] | null;
}

export type NotificationType = "created" | "moved" | "finalized" | "paused" | "delegated";

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface CurrentUser {
  id: string;
  username: string;
  nome: string;
  isGestor: boolean;
}

export interface AuditLog {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorNome: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
}
