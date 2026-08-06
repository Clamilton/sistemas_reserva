import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Upload, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useToastStore } from "../store/useToastStore";
import { buildFinalMessage } from "../lib/finalMessage";
import { computeElapsedMs, formatDuration, useTicker } from "../lib/time";
import { copyToClipboard } from "../lib/clipboard";
import { onlyDigits } from "../lib/matchEmpresa";
import { extractPdfPages } from "../lib/perdcomp/pdfText";
import { extrairDadosPdf, type LinhaExtraida } from "../lib/perdcomp/extractor";
import { buildCompensacaoMessage, type CompensacaoBloco } from "../lib/perdcomp/message";
import { acharCompensacoesAnteriores, serializarLinhas } from "../lib/perdcomp/historico";
import { backdropVariants, dialogTransition, dialogVariants } from "../lib/motionVariants";

interface PdfStatus {
  id: string;
  nome: string;
  ok: boolean;
  detalhe?: string;
}

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
  const [processingPdfs, setProcessingPdfs] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<PdfStatus[]>([]);
  const [perdcompMessage, setPerdcompMessage] = useState("");
  const [copiedPerdcomp, setCopiedPerdcomp] = useState(false);
  const [novaCompensacao, setNovaCompensacao] = useState<LinhaExtraida[]>([]);
  const now = useTicker(1000);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  if (!task) return null;

  const totalMs = task.startedAt ? computeElapsedMs(task.statusHistory, now) : null;

  async function handleSelectPdfs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !task) return;

    setProcessingPdfs(true);
    const cnpjAlvo = onlyDigits(task.cnpj);
    // Débitos de TODOS os PDFs soltos agora se juntam numa única
    // compensação — a demanda inteira é 1 compensação, não 1 por PDF.
    const linhasNovas: LinhaExtraida[] = [];
    const status: PdfStatus[] = [];

    for (const file of files) {
      try {
        const paginas = await extractPdfPages(file);
        const resultado = extrairDadosPdf(paginas, cnpjAlvo);
        if (resultado.ok) {
          linhasNovas.push(...resultado.linhas);
          status.push({ id: `${file.name}-${status.length}`, nome: file.name, ok: true });
        } else {
          status.push({ id: `${file.name}-${status.length}`, nome: file.name, ok: false, detalhe: resultado.erro });
        }
      } catch (err) {
        status.push({
          id: `${file.name}-${status.length}`,
          nome: file.name,
          ok: false,
          detalhe: err instanceof Error ? err.message : "Erro ao processar o PDF",
        });
      }
    }

    setPdfStatus(status);
    setProcessingPdfs(false);

    if (linhasNovas.length === 0) {
      pushToast("Nenhum PDF válido — confira os erros na lista.");
      return;
    }

    setNovaCompensacao(linhasNovas);

    // "2ª/3ª compensação" só entra em jogo se existir OUTRA demanda dessa
    // empresa já finalizada no mesmo mês — não por causa de vários PDFs
    // soltos aqui na mesma demanda.
    const anteriores = acharCompensacoesAnteriores(tasks, task);
    const combinadas: CompensacaoBloco[] = [
      ...anteriores,
      { linhas: linhasNovas, responsavel: task.operadorNome },
    ];

    setPerdcompMessage(
      buildCompensacaoMessage({
        empresa: task.empresa,
        cnpj: task.cnpj,
        compensacoes: combinadas,
      }),
    );

    pushToast(
      anteriores.length > 0
        ? `Texto gerado com os PDFs anexados + ${anteriores.length} compensação(ões) anterior(es) da mesma empresa neste mês.`
        : `Texto gerado a partir de ${files.length} PDF(s).`,
    );
  }

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

  async function handleCopyPerdcomp() {
    const ok = await copyToClipboard(perdcompMessage);
    if (ok) {
      setCopiedPerdcomp(true);
      pushToast("Mensagem do PER/DCOMP copiada para a área de transferência");
      setTimeout(() => setCopiedPerdcomp(false), 2000);
    } else {
      pushToast("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    await finalizeTask(
      taskId,
      message,
      novaCompensacao.length > 0 ? serializarLinhas(novaCompensacao) : undefined,
    );
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

          {task.tipo === "compensacao" && (
            <div className="field">
              <label>Gerar texto a partir dos PDFs do PER/DCOMP</label>
              {!task.cnpj ? (
                <p className="text-xs text-red-700">
                  Essa demanda não tem CNPJ cadastrado — complete o cadastro da empresa antes de gerar o
                  texto pelos PDFs.
                </p>
              ) : (
                <>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf"
                    multiple
                    className="hidden"
                    onChange={handleSelectPdfs}
                  />
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={processingPdfs}
                    className="btn btn-secondary w-full"
                  >
                    <Upload size={14} />
                    {processingPdfs ? "Processando..." : "Selecionar PDFs do PER/DCOMP"}
                  </button>
                  {pdfStatus.length > 0 && (
                    <div className="mt-2 space-y-1 rounded-[10px] bg-neutral-200 p-2 text-xs">
                      {pdfStatus.map((s) => (
                        <p key={s.id} className={s.ok ? "text-accent-2-700" : "text-red-700"}>
                          {s.ok ? "✔" : "✘"} {s.nome}
                          {s.detalhe ? ` — ${s.detalhe}` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                  {perdcompMessage && (
                    <>
                      <textarea
                        value={perdcompMessage}
                        onChange={(e) => setPerdcompMessage(e.target.value)}
                        rows={6}
                        className="input mt-2 resize-none font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleCopyPerdcomp}
                        className="btn btn-secondary mt-2 w-full"
                      >
                        {copiedPerdcomp ? (
                          <Check size={15} className="text-accent-2-700" />
                        ) : (
                          <Copy size={15} />
                        )}
                        {copiedPerdcomp ? "Copiado!" : "Copiar mensagem do PER/DCOMP"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div className="field">
            <label>Mensagem de conclusão (Bitrix)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="input resize-none"
            />
          </div>

          <button onClick={handleCopy} className="btn btn-secondary w-full">
            {copied ? <Check size={15} className="text-accent-2-700" /> : <Copy size={15} />}
            {copied ? "Copiado!" : "Copiar mensagem de conclusão"}
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
