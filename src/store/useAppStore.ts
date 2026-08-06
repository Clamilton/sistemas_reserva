import { create } from "zustand";
import type {
  AppNotification,
  Column,
  DemandType,
  Empresa,
  Operador,
  PerdcompLinha,
  Prioridade,
  Task,
} from "../types";
import * as api from "../lib/api";
import { useToastStore } from "./useToastStore";
import { getLastSeenAt, setLastSeenAt } from "../lib/lastSeen";

interface NewTaskInput {
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
  rawText: string;
  createdAt?: string;
}

interface AppState {
  columns: Column[];
  operadores: Operador[];
  empresas: Empresa[];
  tasks: Task[];
  notifications: AppNotification[];
  loaded: boolean;
  novosIds: Set<string>;

  hydrate: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  verificarNovasDemandas: () => void;
  marcarTaskVista: (taskId: string) => void;
  refreshNotifications: () => Promise<void>;
  refreshEmpresas: () => Promise<void>;
  refreshOperadores: () => Promise<void>;

  createOperador: (
    username: string,
    password: string,
    nome: string,
    isGestor: boolean,
  ) => Promise<boolean>;
  updateOperadorGestor: (id: string, isGestor: boolean) => Promise<boolean>;

  addEmpresa: (cnpj: string, nome: string) => Promise<void>;
  removeEmpresa: (id: string) => Promise<void>;
  importEmpresas: (
    lines: { cnpj: string; nome: string }[],
  ) => Promise<{ added: number; updated: number }>;

  addTask: (input: NewTaskInput) => Promise<void>;
  moveTask: (
    taskId: string,
    destColumnId: string,
    destIndex: number,
    motivo?: string,
  ) => Promise<boolean>;
  updateTaskPriority: (taskId: string, prioridade: Prioridade) => Promise<void>;
  delegateTask: (taskId: string, operadorId: string) => Promise<boolean>;
  finalizeTask: (taskId: string, message: string, perdcompDados?: PerdcompLinha[]) => Promise<void>;
  deleteTask: (taskId: string) => Promise<boolean>;

  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

function reportError(err: unknown) {
  const message = err instanceof api.ApiError ? err.message : "Falha de conexão com o servidor";
  useToastStore.getState().push(message);
}

export const useAppStore = create<AppState>()((set, get) => ({
  columns: [],
  operadores: [],
  empresas: [],
  tasks: [],
  notifications: [],
  loaded: false,
  novosIds: new Set(),

  hydrate: async () => {
    try {
      const [columns, operadores, empresas, tasks, notifications] = await Promise.all([
        api.getColumns(),
        api.getUsers(),
        api.getEmpresas(),
        api.getTasks(),
        api.getNotifications(),
      ]);
      set({ columns, operadores, empresas, tasks, notifications, loaded: true });
      get().verificarNovasDemandas();
    } catch (err) {
      reportError(err);
    }
  },

  refreshTasks: async () => {
    try {
      const prevIds = new Set(get().tasks.map((t) => t.id));
      const tasks = await api.getTasks();
      const chegaramAgora = tasks.filter((t) => !prevIds.has(t.id)).map((t) => t.id);
      set((s) => {
        if (chegaramAgora.length === 0) return { tasks };
        const next = new Set(s.novosIds);
        chegaramAgora.forEach((id) => next.add(id));
        return { tasks, novosIds: next };
      });
    } catch (err) {
      reportError(err);
    }
  },

  /** Compara as tasks carregadas com a última vez que a aba esteve em foco
   * — qualquer demanda criada nesse intervalo entra em novosIds (pisca no
   * card até o usuário abrir a demanda). */
  verificarNovasDemandas: () => {
    const lastSeenAt = getLastSeenAt();
    const recentes = get().tasks.filter((t) => new Date(t.createdAt).getTime() > lastSeenAt);
    if (recentes.length > 0) {
      set((s) => {
        const next = new Set(s.novosIds);
        recentes.forEach((t) => next.add(t.id));
        return { novosIds: next };
      });
    }
    setLastSeenAt(Date.now());
  },

  marcarTaskVista: (taskId) => {
    set((s) => {
      if (!s.novosIds.has(taskId)) return s;
      const next = new Set(s.novosIds);
      next.delete(taskId);
      return { novosIds: next };
    });
  },

  refreshNotifications: async () => {
    try {
      set({ notifications: await api.getNotifications() });
    } catch (err) {
      reportError(err);
    }
  },

  refreshEmpresas: async () => {
    try {
      set({ empresas: await api.getEmpresas() });
    } catch (err) {
      reportError(err);
    }
  },

  refreshOperadores: async () => {
    try {
      set({ operadores: await api.getUsers() });
    } catch (err) {
      reportError(err);
    }
  },

  createOperador: async (username, password, nome, isGestor) => {
    try {
      await api.createUser(username, password, nome, isGestor);
      await get().refreshOperadores();
      useToastStore.getState().push(`${nome} cadastrado(a)`);
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  },

  updateOperadorGestor: async (id, isGestor) => {
    try {
      await api.updateUserGestor(id, isGestor);
      await get().refreshOperadores();
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  },

  addEmpresa: async (cnpj, nome) => {
    try {
      await api.addEmpresa(cnpj, nome);
      await get().refreshEmpresas();
    } catch (err) {
      reportError(err);
    }
  },

  removeEmpresa: async (id) => {
    try {
      await api.removeEmpresa(id);
      await get().refreshEmpresas();
    } catch (err) {
      reportError(err);
    }
  },

  importEmpresas: async (lines) => {
    try {
      const result = await api.importEmpresas(lines);
      await get().refreshEmpresas();
      return result;
    } catch (err) {
      reportError(err);
      return { added: 0, updated: 0 };
    }
  },

  addTask: async (input) => {
    try {
      await api.createTask({
        empresaNome: input.empresa,
        cnpj: input.cnpj,
        empresaId: input.empresaId,
        guiaImposto: input.guiaImposto,
        siglasImpostos: input.siglasImpostos,
        tipo: input.tipo,
        retificacaoDetalhes: input.retificacaoDetalhes,
        origemSolicitacao: input.origemSolicitacao,
        prioridade: input.prioridade,
        operadorId: input.operadorId,
        rawText: input.rawText,
        createdAt: input.createdAt,
      });
      await Promise.all([get().refreshTasks(), get().refreshNotifications()]);
    } catch (err) {
      reportError(err);
    }
  },

  moveTask: async (taskId, destColumnId, destIndex, motivo) => {
    try {
      await api.moveTask(taskId, destColumnId, destIndex, motivo);
      await Promise.all([get().refreshTasks(), get().refreshNotifications()]);
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  },

  updateTaskPriority: async (taskId, prioridade) => {
    try {
      await api.updateTaskPriority(taskId, prioridade);
      await get().refreshTasks();
    } catch (err) {
      reportError(err);
    }
  },

  delegateTask: async (taskId, operadorId) => {
    try {
      await api.delegateTask(taskId, operadorId);
      await Promise.all([get().refreshTasks(), get().refreshNotifications()]);
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  },

  finalizeTask: async (taskId, message, perdcompDados) => {
    try {
      await api.finalizeTask(taskId, message, perdcompDados);
      await Promise.all([get().refreshTasks(), get().refreshNotifications()]);
    } catch (err) {
      reportError(err);
    }
  },

  deleteTask: async (taskId) => {
    try {
      await api.deleteTask(taskId);
      await get().refreshTasks();
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  },

  markNotificationRead: async (id) => {
    try {
      await api.markNotificationRead(id);
      await get().refreshNotifications();
    } catch (err) {
      reportError(err);
    }
  },

  markAllNotificationsRead: async () => {
    try {
      await api.markAllNotificationsRead();
      await get().refreshNotifications();
    } catch (err) {
      reportError(err);
    }
  },
}));
