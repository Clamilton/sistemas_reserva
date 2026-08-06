import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import { backdropVariants, dialogTransition, dialogVariants } from "../lib/motionVariants";

interface Props {
  onClose: () => void;
}

export function UsersModal({ onClose }: Props) {
  const operadores = useAppStore((s) => s.operadores);
  const createOperador = useAppStore((s) => s.createOperador);
  const updateOperadorGestor = useAppStore((s) => s.updateOperadorGestor);
  const currentUser = useAuthStore((s) => s.user);

  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isGestor, setIsGestor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleCreate() {
    if (!nome.trim() || !username.trim() || password.length < 6) return;
    setSubmitting(true);
    const ok = await createOperador(username.trim(), password, nome.trim(), isGestor);
    setSubmitting(false);
    if (ok) {
      setNome("");
      setUsername("");
      setPassword("");
      setIsGestor(false);
    }
  }

  async function handleToggleGestor(id: string, next: boolean) {
    setPendingId(id);
    await updateOperadorGestor(id, next);
    setPendingId(null);
  }

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
        className="dialog max-w-md"
        onClick={(e) => e.stopPropagation()}
        variants={dialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={dialogTransition}
      >
        <div className="dialog-header">
          <h3 className="dialog-title">Usuários / operadores</h3>
          <button onClick={onClose} className="opacity-60 hover:opacity-100">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <div>
            <h4 className="card-kicker mb-2">Novo usuário</h4>
            <div className="flex flex-col gap-2">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome"
                className="input"
              />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuário de acesso (ex: ana)"
                className="input"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha (mínimo 6 caracteres)"
                className="input"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isGestor}
                  onChange={(e) => setIsGestor(e.target.checked)}
                  className="rounded border-[color:var(--color-divider)]"
                />
                É gestor (recebe os motivos de pausa das demandas)
              </label>
              <button
                onClick={handleCreate}
                disabled={submitting || !nome.trim() || !username.trim() || password.length < 6}
                className="btn btn-dark w-full"
              >
                Criar usuário
              </button>
            </div>
          </div>

          <div>
            <h4 className="card-kicker mb-2">Cadastrados ({operadores.length})</h4>
            <p className="mb-2 text-[11px] opacity-50">
              Clique em "Gestor" para dar ou tirar o poder de receber os motivos de pausa das
              demandas.
            </p>
            <div className="max-h-56 overflow-y-auto rounded-[16px] border border-[color:var(--color-divider)]">
              {operadores.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-3 py-2 text-sm last:border-b-0"
                >
                  <span>
                    {op.nome}
                    {op.id === currentUser?.id && <span className="opacity-50"> (você)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleGestor(op.id, !op.isGestor)}
                    disabled={pendingId === op.id}
                    className={`tag flex items-center gap-1 disabled:opacity-40 ${
                      op.isGestor ? "tag-accent" : "tag-neutral opacity-60 hover:opacity-100"
                    }`}
                  >
                    <ShieldCheck size={12} />
                    Gestor
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
