/**
 * "2ª/3ª compensação" não deve depender de quantos PDFs você solta de uma
 * vez no upload — uma tarefa (demanda) inteira é UMA compensação, mesmo que
 * tenha vários PDFs anexados (os débitos deles se somam num bloco só). Só
 * vira "2ª/3ª" quando existe uma OUTRA demanda de Compensação da mesma
 * empresa, no mesmo mês (mês de criação da demanda), já finalizada. Este
 * módulo acha essas demandas anteriores e devolve os blocos delas prontos
 * pra combinar com o bloco da tarefa atual.
 *
 * Limite conhecido: só entram aqui demandas que já passaram por esse mesmo
 * fluxo (têm perdcompDados salvo) — compensações finalizadas manualmente,
 * sem anexar PDF, não são contabilizadas.
 */
import Decimal from "decimal.js";
import type { PerdcompLinha, Task } from "../../types";
import { onlyDigits } from "../matchEmpresa";
import type { CompensacaoBloco } from "./message";
import type { LinhaExtraida } from "./extractor";

function mesAno(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** Acha demandas de Compensação já finalizadas da mesma empresa (por CNPJ)
 * no mesmo mês de criação de `taskAtual`, ordenadas pela ordem em que foram
 * concluídas — uma entrada por demanda (não por PDF). */
export function acharCompensacoesAnteriores(tasks: Task[], taskAtual: Task): CompensacaoBloco[] {
  const cnpjAlvo = onlyDigits(taskAtual.cnpj);
  if (!cnpjAlvo) return [];
  const mesAlvo = mesAno(taskAtual.createdAt);

  return tasks
    .filter(
      (t): t is Task & { finishedAt: string; perdcompDados: PerdcompLinha[] } =>
        t.id !== taskAtual.id &&
        t.tipo === "compensacao" &&
        onlyDigits(t.cnpj) === cnpjAlvo &&
        mesAno(t.createdAt) === mesAlvo &&
        !!t.finishedAt &&
        !!t.perdcompDados &&
        t.perdcompDados.length > 0,
    )
    .sort((a, b) => new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime())
    .map(
      (t): CompensacaoBloco => ({
        linhas: t.perdcompDados.map((l): LinhaExtraida => ({ pa: l.pa, imposto: l.imposto, valor: new Decimal(l.valor) })),
        responsavel: t.operadorNome,
      }),
    );
}

/** Converte os débitos extraídos (Decimal) pro formato serializável salvo
 * em Task.perdcompDados (string) — todos os PDFs da tarefa já somados numa
 * lista só. */
export function serializarLinhas(linhas: LinhaExtraida[]): PerdcompLinha[] {
  return linhas.map((l) => ({ pa: l.pa, imposto: l.imposto, valor: l.valor.toFixed(2) }));
}
