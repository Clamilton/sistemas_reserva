import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { backdropVariants, dialogTransition, dialogVariants } from "../lib/motionVariants";

interface Props {
  empresaNome: string;
  onConfirm: (motivo: string) => Promise<void>;
  onCancel: () => void;
}

export function PauseReasonModal({ empresaNome, onConfirm, onCancel }: Props) {
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!motivo.trim()) return;
    setSubmitting(true);
    await onConfirm(motivo.trim());
    setSubmitting(false);
  }

  return (
    <motion.div
      className="dialog-backdrop"
      onClick={onCancel}
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
          <h3 className="dialog-title">Motivo da pausa</h3>
          <button onClick={onCancel} className="opacity-60 hover:opacity-100">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <p className="text-sm opacity-75">
            Por que a demanda <span className="font-semibold opacity-100">"{empresaNome}"</span> está
            sendo pausada? O gestor vai receber essa informação.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ex: Aguardando retorno do cliente sobre documentação"
            className="input resize-none"
          />
        </div>

        <div className="dialog-actions">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!motivo.trim() || submitting}
            className="btn btn-primary"
          >
            {submitting ? "Pausando..." : "Confirmar pausa"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
