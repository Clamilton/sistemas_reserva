import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Upload, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useToastStore } from "../store/useToastStore";
import { parseEmpresaList } from "../lib/parseEmpresaList";
import { backdropVariants, dialogTransition, dialogVariants } from "../lib/motionVariants";

interface Props {
  onClose: () => void;
}

export function EmpresasModal({ onClose }: Props) {
  const empresas = useAppStore((s) => s.empresas);
  const addEmpresa = useAppStore((s) => s.addEmpresa);
  const removeEmpresa = useAppStore((s) => s.removeEmpresa);
  const importEmpresas = useAppStore((s) => s.importEmpresas);
  const pushToast = useToastStore((s) => s.push);

  const [cnpj, setCnpj] = useState("");
  const [nome, setNome] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [filter, setFilter] = useState("");

  async function handleAdd() {
    const nomeTrim = nome.trim();
    await addEmpresa(cnpj, nome);
    setCnpj("");
    setNome("");
    pushToast(`${nomeTrim} cadastrada`);
  }

  async function handleImport() {
    const parsed = parseEmpresaList(bulkText);
    if (parsed.length === 0) {
      pushToast("Nenhuma linha reconhecida (CNPJ + nome). Confira o formato.");
      return;
    }
    const { added, updated } = await importEmpresas(parsed);
    pushToast(`${added} empresa(s) adicionada(s), ${updated} atualizada(s)`);
    setBulkText("");
  }

  const filtered = empresas.filter(
    (e) =>
      e.nome.toLowerCase().includes(filter.toLowerCase()) ||
      e.cnpj.toLowerCase().includes(filter.toLowerCase()),
  );

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
        className="dialog max-w-2xl"
        onClick={(e) => e.stopPropagation()}
        variants={dialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={dialogTransition}
      >
        <div className="dialog-header">
          <h3 className="dialog-title">Cadastro de empresas</h3>
          <button onClick={onClose} className="opacity-60 hover:opacity-100">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <div>
            <h4 className="card-kicker mb-2">Adicionar manualmente</h4>
            <div className="flex gap-2">
              <input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="CNPJ"
                className="input w-40"
              />
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome da empresa"
                className="input flex-1"
              />
              <button
                onClick={handleAdd}
                disabled={!cnpj.trim() || !nome.trim()}
                className="btn btn-dark flex-none"
              >
                Adicionar
              </button>
            </div>
          </div>

          <div>
            <h4 className="card-kicker mb-2">Importar lista (cole o conteúdo do .txt)</h4>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={5}
              placeholder={"12.345.678/0001-90  Empresa Fulano de Tal Ltda\n98.765.432/0001-10  Outra Empresa S.A."}
              className="input resize-none font-mono"
            />
            <button
              onClick={handleImport}
              disabled={!bulkText.trim()}
              className="tag tag-accent mt-2 flex items-center gap-1.5 disabled:opacity-40"
            >
              <Upload size={13} />
              Importar lista
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="card-kicker">Cadastradas ({empresas.length})</h4>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar..."
                className="input w-40 py-1 text-xs"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-[16px] border border-[color:var(--color-divider)]">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm opacity-50">Nenhuma empresa cadastrada</p>
              )}
              {filtered.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-3 py-2 text-sm last:border-b-0"
                >
                  <div>
                    <p className="font-medium">{e.nome}</p>
                    <p className="text-xs opacity-50">{e.cnpj}</p>
                  </div>
                  <button onClick={() => removeEmpresa(e.id)} className="opacity-50 hover:text-red-700 hover:opacity-100">
                    <Trash2 size={15} />
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
