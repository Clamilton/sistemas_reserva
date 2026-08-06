import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Check, Plus, Trash2, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import { parseDemandText } from "../lib/parseDemandText";
import { findEmpresaMatches, type EmpresaMatch } from "../lib/matchEmpresa";
import { useDebouncedValue } from "../lib/useDebounce";
import { PRIORITY_LABEL } from "../lib/priority";
import { EmpresaCombobox } from "./EmpresaCombobox";
import { generateId } from "../lib/id";
import { toDatetimeLocalValue } from "../lib/time";
import { backdropVariants, dialogTransition, dialogVariants } from "../lib/motionVariants";
import type { DemandType, Prioridade } from "../types";

const ORIGEM_PADRAO = "Grupo de Comunicação e Atendimento";

const PRIORITY_OPTIONS: Prioridade[] = ["baixa", "media", "alta"];

const PRIORITY_BUTTON_STYLES: Record<Prioridade, string> = {
  alta: "border-accent-500 bg-accent-100 text-accent-800",
  media: "border-[#e0b02f] bg-[#f0c34d1a] text-[#8c6a12]",
  baixa: "border-neutral-400 bg-neutral-100 opacity-80",
};

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const TRIMESTRES = ["1º Trimestre", "2º Trimestre", "3º Trimestre", "4º Trimestre"];

const currentYear = new Date().getFullYear();
const ANOS = Array.from({ length: 8 }, (_, i) => currentYear + 1 - i);

type PeriodoTipo = "mes" | "trimestre";

interface Periodo {
  id: string;
  tipo: PeriodoTipo;
  valor: number;
  ano: number;
}

function formatPeriodo(p: Periodo): string {
  const label = p.tipo === "mes" ? MESES[p.valor - 1] : TRIMESTRES[p.valor - 1];
  return `${label}/${p.ano}`;
}

interface Props {
  onClose: () => void;
}

export function NewTaskModal({ onClose }: Props) {
  const operadores = useAppStore((s) => s.operadores);
  const empresasCadastradas = useAppStore((s) => s.empresas);
  const addTask = useAppStore((s) => s.addTask);
  const currentUser = useAuthStore((s) => s.user);

  const [tipo, setTipo] = useState<DemandType | null>(null);
  const [retificacaoDetalhes, setRetificacaoDetalhes] = useState("");
  const [rawText, setRawText] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [guiaImposto, setGuiaImposto] = useState("");
  const [siglasText, setSiglasText] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [operadorId, setOperadorId] = useState(currentUser?.id ?? operadores[0]?.id ?? "");
  const [matches, setMatches] = useState<EmpresaMatch[]>([]);
  const [empresaDoCadastro, setEmpresaDoCadastro] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [createdAt, setCreatedAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [origemOption, setOrigemOption] = useState<"grupo" | "outros">("grupo");
  const [origemCustom, setOrigemCustom] = useState("");

  const debouncedRawText = useDebouncedValue(rawText, 350);

  useEffect(() => {
    if (!debouncedRawText.trim()) {
      setMatches([]);
      return;
    }

    const parsed = parseDemandText(debouncedRawText);
    setGuiaImposto(parsed.guiaImposto);
    setSiglasText(parsed.siglasImpostos.join(", "));

    const found = findEmpresaMatches(debouncedRawText, empresasCadastradas);
    setMatches(found);

    if (found.length > 0) {
      setEmpresa(found[0].empresa.nome);
      setCnpj(found[0].empresa.cnpj);
      setEmpresaId(found[0].empresa.id);
      setEmpresaDoCadastro(true);
    } else {
      // Sem match no cadastro: não adivinha nome a partir do texto (poderia
      // pegar remetente, menção de pessoa, etc.) — fica em branco pra digitar.
      setEmpresa("");
      setCnpj("");
      setEmpresaId(null);
      setEmpresaDoCadastro(false);
    }
  }, [debouncedRawText, empresasCadastradas]);

  function handleSelectMatch(match: EmpresaMatch) {
    setEmpresa(match.empresa.nome);
    setCnpj(match.empresa.cnpj);
    setEmpresaId(match.empresa.id);
    setEmpresaDoCadastro(true);
  }

  function handleEmpresaChange(value: string) {
    setEmpresa(value);
    setEmpresaId(null);
    setEmpresaDoCadastro(false);
  }

  function handleSelectEmpresaCadastro(emp: { id: string; nome: string; cnpj: string }) {
    setEmpresa(emp.nome);
    setCnpj(emp.cnpj);
    setEmpresaId(emp.id);
    setEmpresaDoCadastro(true);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function addPeriodo(tipoPeriodo: PeriodoTipo) {
    setPeriodos((prev) => [
      ...prev,
      {
        id: generateId(),
        tipo: tipoPeriodo,
        valor: tipoPeriodo === "mes" ? new Date().getMonth() + 1 : 1,
        ano: currentYear,
      },
    ]);
    setAddMenuOpen(false);
  }

  function updatePeriodo(id: string, patch: Partial<Pick<Periodo, "valor" | "ano">>) {
    setPeriodos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePeriodo(id: string) {
    setPeriodos((prev) => prev.filter((p) => p.id !== id));
  }

  function handleTipoChange(novoTipo: DemandType) {
    if (novoTipo === tipo) return;
    setTipo(novoTipo);
    setRawText("");
    setMatches([]);
    setEmpresa("");
    setCnpj("");
    setEmpresaId(null);
    setEmpresaDoCadastro(false);
    setGuiaImposto("");
    setSiglasText("");
    setRetificacaoDetalhes("");
    setPeriodos([]);
    setAddMenuOpen(false);
  }

  async function handleSubmit() {
    if (!tipo || !empresa.trim() || !operadorId) return;
    const siglasImpostos = siglasText
      .split(/[,/]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const periodosTexto = periodos.map(formatPeriodo).join(", ");
    const detalhesFinal = [retificacaoDetalhes.trim(), periodosTexto ? `Período(s): ${periodosTexto}` : ""]
      .filter(Boolean)
      .join("\n\n");

    const origemSolicitacao = origemOption === "grupo" ? ORIGEM_PADRAO : origemCustom.trim();

    setSubmitting(true);
    await addTask({
      empresa: empresa.trim(),
      cnpj: cnpj.trim(),
      empresaId,
      guiaImposto: tipo === "retificacao" ? "" : guiaImposto.trim(),
      siglasImpostos: tipo === "retificacao" ? [] : siglasImpostos,
      tipo,
      retificacaoDetalhes: tipo === "retificacao" ? detalhesFinal || null : null,
      origemSolicitacao,
      prioridade,
      operadorId,
      rawText,
      createdAt: createdAt ? new Date(createdAt).toISOString() : undefined,
    });
    setSubmitting(false);
    onClose();
  }

  const origemValida = origemOption === "grupo" || origemCustom.trim().length > 0;
  const canSubmit =
    tipo !== null &&
    empresa.trim().length > 0 &&
    operadorId.length > 0 &&
    origemValida &&
    !submitting;
  const topMatch = matches[0];
  const alternativeMatches = matches.slice(1);

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
          <h3 className="dialog-title">Nova demanda</h3>
          <button onClick={onClose} className="opacity-60 hover:opacity-100">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <div>
            <label className="mb-1 block text-xs font-medium opacity-70">
              Essa demanda é de Compensação ou Retificação? *
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTipoChange("compensacao")}
                className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium ${
                  tipo === "compensacao"
                    ? "border-accent-2-500 bg-accent-2-100 text-accent-2-800"
                    : "border-[color:var(--color-divider)] opacity-70"
                }`}
              >
                Compensação
              </button>
              <button
                type="button"
                onClick={() => handleTipoChange("retificacao")}
                className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium ${
                  tipo === "retificacao"
                    ? "border-accent-500 bg-accent-100 text-accent-800"
                    : "border-[color:var(--color-divider)] opacity-70"
                }`}
              >
                Retificação
              </button>
            </div>
          </div>

          {tipo === "retificacao" && (
            <div className="field">
              <label>Como será feita a retificação?</label>
              <textarea
                value={retificacaoDetalhes}
                onChange={(e) => setRetificacaoDetalhes(e.target.value)}
                rows={4}
                placeholder="Detalhe livremente o que precisa ser retificado e como..."
                className="input resize-y"
              />
            </div>
          )}

          {tipo && (
            <>
              {tipo === "compensacao" && (
                <div className="field">
                  <label>Cole o texto recebido</label>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={5}
                    autoFocus
                    placeholder="Cole aqui o texto do grupo... a empresa, guia e siglas são identificadas automaticamente."
                    className="input resize-none"
                  />

                  {topMatch && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-full bg-accent-2-100 px-3 py-1.5 text-xs text-accent-2-800">
                      <Check size={13} />
                      {topMatch.matchedByCnpj
                        ? "Encontrada no cadastro pelo CNPJ:"
                        : "Parecida no cadastro (confira):"}
                      <span className="font-semibold">{topMatch.empresa.nome}</span>
                    </div>
                  )}

                  {alternativeMatches.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {alternativeMatches.map((m) => (
                        <button
                          key={m.empresa.id}
                          type="button"
                          onClick={() => handleSelectMatch(m)}
                          className="rounded-full border border-[color:var(--color-divider)] px-2.5 py-1 text-[11px] opacity-75 hover:opacity-100"
                        >
                          {m.empresa.nome}
                        </button>
                      ))}
                    </div>
                  )}

                  {debouncedRawText.trim() && matches.length === 0 && (
                    <p className="mt-1.5 text-[11px] opacity-50">
                      Nenhuma empresa do cadastro encontrada nesse texto — digite o nome manualmente
                      abaixo (ou cadastre em "Empresas").
                    </p>
                  )}
                </div>
              )}

              {tipo === "compensacao" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="field">
                      <label>Empresa *</label>
                      <input
                        value={empresa}
                        onChange={(e) => handleEmpresaChange(e.target.value)}
                        className={`input ${empresaDoCadastro ? "border-accent-2-400" : ""}`}
                      />
                    </div>
                    <div className="field">
                      <label>CNPJ</label>
                      <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="input" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="field">
                      <label>Código da Receita (Guia)</label>
                      <input
                        value={guiaImposto}
                        onChange={(e) => setGuiaImposto(e.target.value)}
                        placeholder="Ex: 2089-01, 2372-01"
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <label>Siglas</label>
                      <input
                        value={siglasText}
                        onChange={(e) => setSiglasText(e.target.value)}
                        placeholder="PIS, COFINS, IRPJ"
                        className="input"
                      />
                    </div>
                  </div>
                </>
              )}

              {tipo === "retificacao" && (
                <>
                  <div className="field">
                    <label>Empresa *</label>
                    <EmpresaCombobox
                      empresas={empresasCadastradas}
                      selectedId={empresaId}
                      onSelect={handleSelectEmpresaCadastro}
                    />
                  </div>

                  <div>
                    <div className="relative flex items-center justify-between" ref={addMenuRef}>
                      <label className="text-xs font-medium opacity-70">Período de referência</label>
                      <button
                        type="button"
                        onClick={() => setAddMenuOpen((v) => !v)}
                        className="btn btn-secondary py-1.5 text-xs"
                      >
                        <Plus size={13} />
                        Adicionar
                      </button>

                      {addMenuOpen && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-[14px] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] py-1 elev-lg">
                          <button
                            type="button"
                            onClick={() => addPeriodo("mes")}
                            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent-100"
                          >
                            Adicionar mês
                          </button>
                          <button
                            type="button"
                            onClick={() => addPeriodo("trimestre")}
                            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent-100"
                          >
                            Adicionar trimestre
                          </button>
                        </div>
                      )}
                    </div>

                    {periodos.length === 0 ? (
                      <p className="mt-1.5 text-[11px] opacity-50">
                        Nenhum período adicionado. Use "Adicionar" para incluir um mês ou trimestre.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-col gap-2">
                        {periodos.map((p) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <Calendar size={14} className="shrink-0 opacity-50" />
                            <select
                              value={p.valor}
                              onChange={(e) => updatePeriodo(p.id, { valor: Number(e.target.value) })}
                              className="input"
                            >
                              {(p.tipo === "mes" ? MESES : TRIMESTRES).map((label, i) => (
                                <option key={label} value={i + 1}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={p.ano}
                              onChange={(e) => updatePeriodo(p.id, { ano: Number(e.target.value) })}
                              className="input w-28 flex-none"
                            >
                              {ANOS.map((ano) => (
                                <option key={ano} value={ano}>
                                  {ano}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removePeriodo(p.id)}
                              className="flex-none rounded-full p-1.5 opacity-50 hover:bg-red-50 hover:text-red-700 hover:opacity-100"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium opacity-70">Urgência</label>
                <div className="flex gap-2">
                  {PRIORITY_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPrioridade(p)}
                      className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium ${
                        prioridade === p
                          ? PRIORITY_BUTTON_STYLES[p]
                          : "border-[color:var(--color-divider)] opacity-70"
                      }`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="field">
                  <label>Criado em</label>
                  <input
                    type="datetime-local"
                    value={createdAt}
                    onChange={(e) => setCreatedAt(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="field">
                  <label>Origem da solicitação</label>
                  <select
                    value={origemOption}
                    onChange={(e) => setOrigemOption(e.target.value as "grupo" | "outros")}
                    className="input"
                  >
                    <option value="grupo">{ORIGEM_PADRAO}</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
              </div>

              {origemOption === "outros" && (
                <div className="field">
                  <label>Descreva a origem</label>
                  <input
                    value={origemCustom}
                    onChange={(e) => setOrigemCustom(e.target.value)}
                    placeholder="Ex: E-mail direto do cliente, WhatsApp pessoal..."
                    className="input"
                  />
                </div>
              )}

              <div className="field">
                <label>Operador *</label>
                <select
                  value={operadorId}
                  onChange={(e) => setOperadorId(e.target.value)}
                  className="input"
                >
                  {operadores.length === 0 && <option value="">Nenhum operador</option>}
                  {operadores.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.nome}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] opacity-50">
                  Não achou quem procura? Cadastre em "Usuários".
                </p>
              </div>
            </>
          )}
        </div>

        <div className="dialog-actions">
          <button onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit} className="btn btn-primary">
            {submitting ? "Criando..." : "Criar demanda"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
