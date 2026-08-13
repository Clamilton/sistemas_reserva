/**
 * Wrapper React pro Web Worker do SPED (spedWorker.ts): cria uma instância
 * ao montar (encerrada no unmount) e transforma o protocolo baseado em
 * mensagens numa API de Promise — cada requisição carrega um `reqId` (ou
 * `id`, no caso de "ler") usado só pra casar a resposta certa com quem
 * pediu.
 */
import { useEffect, useRef } from "react";
import type { Info0000, Info0140 } from "./parser";
import type { GerarMultiItem, GerarParams, SpedWorkerRequest, SpedWorkerResponse } from "./spedWorkerProtocol";

export interface LerResultado {
  info: Info0000;
  infoEst: Info0140 | null;
  totalLinhas: number;
  qtd0140: number;
}

export interface GerarResultado {
  bytes: Uint8Array;
  filename: string;
  totalLinhas: number;
}

export interface GerarMultiResultado {
  bytes: Uint8Array;
  filename: string;
  sucesso: number;
  falhas: number;
}

export type GerarMultiProgresso =
  | { index: number; total: number; ok: true; filename: string; totalLinhas: number }
  | { index: number; total: number; ok: false; nomeOriginal: string; error: string };

interface Pendente {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
  onProgresso?: (p: GerarMultiProgresso) => void;
}

let proximoReqId = 0;

export function useSpedWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendentesRef = useRef(new Map<string, Pendente>());

  useEffect(() => {
    const worker = new Worker(new URL("./spedWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<SpedWorkerResponse>) => {
      const msg = ev.data;

      if (msg.kind === "gerarMultiProgresso") {
        const pend = pendentesRef.current.get(msg.reqId);
        pend?.onProgresso?.(
          msg.ok
            ? { index: msg.index, total: msg.total, ok: true, filename: msg.filename, totalLinhas: msg.totalLinhas }
            : { index: msg.index, total: msg.total, ok: false, nomeOriginal: msg.nomeOriginal, error: msg.error },
        );
        return;
      }

      const chave = msg.kind === "lido" ? msg.id : msg.reqId;
      const pend = pendentesRef.current.get(chave);
      if (!pend) return;
      pendentesRef.current.delete(chave);

      if (!msg.ok) {
        pend.reject(new Error(msg.error));
        return;
      }
      if (msg.kind === "lido") {
        pend.resolve({ info: msg.info, infoEst: msg.infoEst, totalLinhas: msg.totalLinhas, qtd0140: msg.qtd0140 } as never);
      } else {
        pend.resolve(msg as never);
      }
    };
    worker.onerror = (ev) => {
      console.error("Erro no worker do SPED:", ev.message);
    };

    workerRef.current = worker;
    const pendentes = pendentesRef.current;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendentes.clear();
    };
  }, []);

  function enviar<T>(req: SpedWorkerRequest, chave: string, onProgresso?: (p: GerarMultiProgresso) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker do SPED ainda não está pronto — tente de novo em instantes."));
        return;
      }
      pendentesRef.current.set(chave, { resolve: resolve as (v: never) => void, reject, onProgresso });
      workerRef.current.postMessage(req);
    });
  }

  function ler(id: string, file: File): Promise<LerResultado> {
    return enviar<LerResultado>({ kind: "ler", id, file }, id);
  }

  function remover(id: string): void {
    workerRef.current?.postMessage({ kind: "remover", id } satisfies SpedWorkerRequest);
    pendentesRef.current.delete(id);
  }

  function gerarUnico(id: string, params: GerarParams, filename: string): Promise<GerarResultado> {
    const reqId = `g${proximoReqId++}`;
    return enviar<GerarResultado>({ kind: "gerarUnico", reqId, id, params, filename }, reqId);
  }

  function gerarMulti(
    itens: GerarMultiItem[],
    zipFilename: string,
    onProgresso?: (p: GerarMultiProgresso) => void,
  ): Promise<GerarMultiResultado> {
    const reqId = `g${proximoReqId++}`;
    return enviar<GerarMultiResultado>({ kind: "gerarMulti", reqId, itens, zipFilename }, reqId, onProgresso);
  }

  return { ler, remover, gerarUnico, gerarMulti };
}
