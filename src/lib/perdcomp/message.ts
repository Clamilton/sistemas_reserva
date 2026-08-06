/**
 * Monta o texto de conclusão de uma demanda de Compensação a partir dos
 * débitos extraídos dos PDFs de PER/DCOMP (ver extractor.ts). Cada TAREFA
 * (demanda) vira uma "compensação" — se ela teve mais de 1 PDF anexado, os
 * débitos de todos eles se juntam num único bloco (não um bloco por PDF).
 * Compensações anteriores vêm de demandas anteriores da mesma empresa no
 * mesmo mês (ver historico.ts). Todo bloco fecha com "RESPONSÁVEL" (o
 * operador da demanda de onde aquele bloco veio, em maiúsculo). Se só
 * existe 1 compensação no total, fecha com "TOTAL GERAL"; se existem 2+
 * (2+ tarefas), cada bloco fecha com "TOTAL" e no fim entra uma linha
 * única de "TOTAL GERAL" somando todos os blocos.
 */
import Decimal from "decimal.js";
import { fmtBr } from "../sped/calculo";
import type { LinhaExtraida } from "./extractor";

function somarPorImposto(linhas: LinhaExtraida[]): { imposto: string; valor: Decimal }[] {
  const ordem: string[] = [];
  const somas = new Map<string, Decimal>();
  for (const l of linhas) {
    if (!somas.has(l.imposto)) {
      ordem.push(l.imposto);
      somas.set(l.imposto, new Decimal(0));
    }
    somas.set(l.imposto, somas.get(l.imposto)!.plus(l.valor));
  }
  return ordem.map((imposto) => ({ imposto, valor: somas.get(imposto)! }));
}

function somaTotal(itens: { valor: Decimal }[]): Decimal {
  return itens.reduce((acc, i) => acc.plus(i.valor), new Decimal(0));
}

export interface CompensacaoBloco {
  linhas: LinhaExtraida[];
  /** Operador da demanda de onde esse bloco veio — vira "RESPONSÁVEL". */
  responsavel: string;
}

export interface BuildCompensacaoMessageParams {
  empresa: string;
  cnpj: string;
  /** Uma entrada por tarefa (demanda) — anteriores primeiro, a atual por último. */
  compensacoes: CompensacaoBloco[];
}

export function buildCompensacaoMessage(params: BuildCompensacaoMessageParams): string {
  const { empresa, cnpj, compensacoes } = params;

  const blocos = compensacoes
    .map((c) => ({ pa: c.linhas[0]?.pa ?? "", itens: somarPorImposto(c.linhas), responsavel: c.responsavel }))
    .filter((b) => b.itens.length > 0);

  if (blocos.length === 0) return "";

  const secoes: string[][] = [];

  if (blocos.length === 1) {
    const bloco = blocos[0];
    secoes.push([`${empresa} - ${cnpj}`, `VALORES COMPENSADOS – ${bloco.pa}`]);
    secoes.push([
      ...bloco.itens.map((item) => `${item.imposto}: R$ ${fmtBr(item.valor)}`),
      `TOTAL GERAL: R$ ${fmtBr(somaTotal(bloco.itens))}`,
    ]);
    secoes.push([`RESPONSÁVEL: ${bloco.responsavel.toUpperCase()}`]);
  } else {
    blocos.forEach((bloco, idx) => {
      const sufixo = idx > 0 ? ` (${idx + 1}ª COMPENSAÇÃO)` : "";
      const headerLine = `VALORES COMPENSADOS – ${bloco.pa}${sufixo}`;
      secoes.push(idx === 0 ? [`${empresa} - ${cnpj}`, headerLine] : [headerLine]);
      secoes.push([
        ...bloco.itens.map((item) => `${item.imposto}: R$ ${fmtBr(item.valor)}`),
        `TOTAL: R$ ${fmtBr(somaTotal(bloco.itens))}`,
      ]);
      secoes.push([`RESPONSÁVEL: ${bloco.responsavel.toUpperCase()}`]);
    });
    const totalGeral = somaTotal(blocos.flatMap((b) => b.itens));
    secoes.push([`TOTAL GERAL: R$ ${fmtBr(totalGeral)}`]);
  }

  return secoes.map((s) => s.join("\n")).join("\n\n");
}
