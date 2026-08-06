import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Trash2, X } from "lucide-react";
import { useToastStore } from "../store/useToastStore";
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import type { Prioridade, Task } from "../types";
import { computeElapsedMs, formatDateTime, formatDuration, useTicker } from "../lib/time";
import { copyToClipboard } from "../lib/clipboard";
import { PRIORITY_LABEL } from "../lib/priority";
import { backdropVariants, dialogTransition, dialogVariants } from "../lib/motionVariants";

interface Props {
  task: Task;
  onClose: () => void;
}

const PRIORITY_OPTIONS: Prioridade[] = ["baixa", "media", "alta"];

const PRIORITY_BUTTON_STYLES: Record<Prioridade, string> = {
  alta: "border-accent-500 bg-accent-100 text-accent-800",
  media: "border-[#e0b02f] bg-[#f0c34d1a] text-[#8c6a12]",
  baixa: "border-neutral-400 bg-neutral-100 opacity-80",
};

export function TaskDetailsModal({ task, onClose }: Props) {
  const pushToast = useToastStore((s) => s.push);
  const updateTaskPriority = useAppStore((s) => s.updateTaskPriority);
  const deleteTask = useAppStore((s) => s.deleteTask);
  const currentUser = useAuthStore((s) => s.user);
  const now = useTicker(1000);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleCopy() {
    if (!task.finalMessage) return;
    const ok = await copyToClipboard(task.finalMessage);
    pushToast(
      ok
        ? "Mensagem copiada para a área de transferência"
        : "Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.",
    );
  }

  async function handleDelete() {
    setDeleting(true);
    const ok = await deleteTask(task.id);
    setDeleting(false);
    if (ok) {
      pushToast(`Demanda "${task.empresa || "sem empresa"}" excluída`);
      onClose();
    }
  }

  const totalElapsedMs = task.startedAt ? computeElapsedMs(task.statusHistory, now) : null;

  return (
    <motion.div
      className="dialog-backdrop"
      onClick={onClose}
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <motion.div
        className="dialog max-w-lg"
        onClick={(e) => e.stopPropagation()}
        variants={dialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={dialogTransition}
      >
        <div className="dialog-header">
          <h3 className="dialog-title">{task.empresa || "(empresa não identificada)"}</h3>
          <button onClick={onClose} className="opacity-60 hover:opacity-100">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <div className="field">
            <label>Prioridade</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateTaskPriority(task.id, p)}
                  className={`flex-1 rounded-full border px-3 py-1.5 text-sm font-medium ${
                    task.prioridade === p
                      ? PRIORITY_BUTTON_STYLES[p]
                      : "border-[color:var(--color-divider)] opacity-70"
                  }`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="opacity-60">Tipo</dt>
            <dd className="text-right">
              {task.tipo === "compensacao" ? "Compensação" : "Retificação"}
            </dd>
            <dt className="opacity-60">Origem da solicitação</dt>
            <dd className="text-right">{task.origemSolicitacao || "—"}</dd>
            <dt className="opacity-60">Operador</dt>
            <dd className="text-right">{task.operadorNome}</dd>
            <dt className="opacity-60">CNPJ</dt>
            <dd className="text-right">{task.cnpj || "—"}</dd>
            <dt className="opacity-60">Código da Receita (Guia)</dt>
            <dd className="text-right">{task.guiaImposto || "—"}</dd>
            <dt className="opacity-60">Siglas</dt>
            <dd className="text-right">{task.siglasImpostos.join(", ") || "—"}</dd>
            <dt className="opacity-60">Criada por</dt>
            <dd className="text-right">{task.createdByNome}</dd>
            <dt className="opacity-60">Criada em</dt>
            <dd className="text-right">{formatDateTime(task.createdAt)}</dd>
            {task.startedAt && (
              <>
                <dt className="opacity-60">Iniciada em</dt>
                <dd className="text-right">{formatDateTime(task.startedAt)}</dd>
              </>
            )}
            {task.finishedAt && (
              <>
                <dt className="opacity-60">Finalizada em</dt>
                <dd className="text-right">{formatDateTime(task.finishedAt)}</dd>
                <dt className="opacity-60">Finalizada por</dt>
                <dd className="text-right">{task.finalizedByNome ?? "—"}</dd>
              </>
            )}
            {totalElapsedMs !== null && (
              <>
                <dt className="opacity-60">Tempo trabalhado</dt>
                <dd className="text-right">{formatDuration(totalElapsedMs)}</dd>
              </>
            )}
          </dl>

          <div>
            <h4 className="card-kicker mb-1">Histórico de status</h4>
            <ul className="flex flex-col gap-1">
              {task.statusHistory.map((entry, idx) => {
                const durationMs = entry.exitedAt
                  ? new Date(entry.exitedAt).getTime() - new Date(entry.enteredAt).getTime()
                  : null;
                return (
                  <li key={idx} className="rounded-[10px] bg-neutral-200 px-3 py-2 text-xs">
                    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5">
                      <span className="font-medium">{entry.columnTitle}</span>
                      <span className="text-right opacity-60">{formatDateTime(entry.enteredAt)}</span>
                      <span className="opacity-60">por {entry.changedByNome}</span>
                      <span className="text-right opacity-60">
                        {durationMs !== null ? formatDuration(durationMs) : "em andamento"}
                      </span>
                    </div>
                    {entry.motivo && (
                      <p className="mt-1">
                        <span className="font-medium">Motivo:</span> {entry.motivo}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {task.retificacaoDetalhes && (
            <div>
              <h4 className="card-kicker mb-1">Como será feita a retificação</h4>
              <p className="whitespace-pre-wrap rounded-[10px] bg-accent-100 p-2 text-xs text-accent-800">
                {task.retificacaoDetalhes}
              </p>
            </div>
          )}

          {task.rawText && (
            <div>
              <h4 className="card-kicker mb-1">Texto original</h4>
              <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-neutral-200 p-2 text-xs opacity-80">
                {task.rawText}
              </pre>
            </div>
          )}

          {task.finalMessage && (
            <div>
              <h4 className="card-kicker mb-1">Mensagem final (Bitrix)</h4>
              <div className="flex items-center gap-2 rounded-[10px] bg-accent-2-100 px-3 py-2 text-sm text-accent-2-800">
                <span className="flex-1">{task.finalMessage}</span>
                <button onClick={handleCopy} className="hover:opacity-70">
                  <Copy size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {currentUser?.isGestor && (
          <div className="dialog-actions justify-between">
            {confirmingDelete ? (
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm text-red-700">Excluir esta demanda permanentemente?</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="btn btn-secondary"
                    disabled={deleting}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="btn bg-red-600 text-white hover:bg-red-700"
                  >
                    {deleting ? "Excluindo..." : "Confirmar exclusão"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="btn btn-ghost text-red-700 hover:bg-red-50"
              >
                <Trash2 size={14} />
                Excluir demanda
              </button>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
