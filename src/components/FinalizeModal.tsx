import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useToastStore } from "../store/useToastStore";
import { buildFinalMessage } from "../lib/finalMessage";
import { computeElapsedMs, formatDuration, useTicker } from "../lib/time";
import { copyToClipboard } from "../lib/clipboard";
import { backdropVariants, dialogTransition, dialogVariants } from "../lib/motionVariants";

interface Props {
  taskId: string;
  previousColumnId: string;
  onClose: () => void;
}

export function FinalizeModal({ taskId, previousColumnId, onClose }: Props) {
  const task = useAppStore((s) => s.tasks.find((t) => t.id === taskId));
  const tasks = useAppStore((s) => s.tasks);
  const moveTask = useAppStore((s) => s.moveTask);
  const finalizeTask = useAppStore((s) => s.finalizeTask);
  const pushToast = useToastStore((s) => s.push);

  const [message, setMessage] = useState(() => (task ? buildFinalMessage(task) : ""));
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const now = useTicker(1000);

  if (!task) return null;

  const totalMs = task.startedAt ? computeElapsedMs(task.statusHistory, now) : null;

  async function handleCopy() {
    const ok = await copyToClipboard(message);
    if (ok) {
      setCopied(true);
      pushToast("Mensagem copiada para a área de transferência");
      setTimeout(() => setCopied(false), 2000);
    } else {
      pushToast("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    await finalizeTask(taskId, message);
    setSubmitting(false);
    onClose();
  }

  async function handleCancel() {
    const destIndex = tasks.filter(
      (t) => t.columnId === previousColumnId && t.id !== taskId,
    ).length;
    await moveTask(taskId, previousColumnId, destIndex);
    onClose();
  }

  return (
    <motion.div
      className="dialog-backdrop"
      onClick={handleCancel}
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <motion.div
        className="dialog max-w-md"
        onClick={(e) => e.stopPropagation()}
        variants={dialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={dialogTransition}
      >
        <div className="dialog-header">
          <h3 className="dialog-title">Finalizar demanda</h3>
          <button onClick={handleCancel} className="opacity-60 hover:opacity-100">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="opacity-60">Empresa</dt>
            <dd className="text-right font-medium">{task.empresa || "—"}</dd>
            <dt className="opacity-60">Tipo</dt>
            <dd className="text-right">
              {task.tipo === "compensacao" ? "Compensação" : "Retificação"}
            </dd>
            <dt className="opacity-60">Operador</dt>
            <dd className="text-right">{task.operadorNome}</dd>
            {totalMs !== null && (
              <>
                <dt className="opacity-60">Tempo total</dt>
                <dd className="text-right">{formatDuration(totalMs)}</dd>
              </>
            )}
          </dl>

          <div className="field">
            <label>Mensagem para o Bitrix</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="input resize-none"
            />
          </div>

          <button onClick={handleCopy} className="btn btn-secondary w-full">
            {copied ? <Check size={15} className="text-accent-2-700" /> : <Copy size={15} />}
            {copied ? "Copiado!" : "Copiar mensagem"}
          </button>
        </div>

        <div className="dialog-actions">
          <button onClick={handleCancel} className="btn btn-secondary">
            Cancelar (voltar tarefa)
          </button>
          <button onClick={handleConfirm} disabled={submitting} className="btn btn-primary">
            {submitting ? "Finalizando..." : "Confirmar finalização"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
