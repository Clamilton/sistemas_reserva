/**
 * Tipos das mensagens trocadas entre a thread principal e o Web Worker do
 * SPED (spedWorker.ts). Arquivo só com tipos — compilado tanto sob o
 * tsconfig do app (DOM) quanto sob o do worker (WebWorker), então não pode
 * referenciar nada específico de um dos dois ambientes.
 */
import type { Info0000, Info0140 } from "./parser";

/** Já validados/normalizados na thread principal antes de mandar pro worker
 * (ex: normalizarRecibo já aplicado) — o worker só usa o valor como está. */
export interface GerarParams {
  recibo: string;
  dtOper: string;
  /** Crédito do mês/arquivo (não a base já calculada) — o worker chama
   * calcular() internamente, pra nunca precisar mandar Decimal pela
   * postMessage (não é clonável de forma confiável). */
  creditoStr: string;
  codPart: string;
  codCta: string;
  nomeCta: string;
  descOper: string;
}

export interface GerarMultiItem {
  id: string;
  params: GerarParams;
  filename: string;
}

export type SpedWorkerRequest =
  | { kind: "ler"; id: string; file: File }
  | { kind: "remover"; id: string }
  | { kind: "gerarUnico"; reqId: string; id: string; params: GerarParams; filename: string }
  | { kind: "gerarMulti"; reqId: string; itens: GerarMultiItem[]; zipFilename: string };

export type SpedWorkerResponse =
  | {
      kind: "lido";
      id: string;
      ok: true;
      info: Info0000;
      infoEst: Info0140 | null;
      totalLinhas: number;
      qtd0140: number;
    }
  | { kind: "lido"; id: string; ok: false; error: string }
  | { kind: "gerarUnico"; reqId: string; ok: true; bytes: Uint8Array; filename: string; totalLinhas: number }
  | { kind: "gerarUnico"; reqId: string; ok: false; error: string }
  | {
      kind: "gerarMultiProgresso";
      reqId: string;
      index: number;
      total: number;
      ok: true;
      filename: string;
      totalLinhas: number;
    }
  | { kind: "gerarMultiProgresso"; reqId: string; index: number; total: number; ok: false; nomeOriginal: string; error: string }
  | { kind: "gerarMulti"; reqId: string; ok: true; bytes: Uint8Array; filename: string; sucesso: number; falhas: number }
  | { kind: "gerarMulti"; reqId: string; ok: false; error: string };
