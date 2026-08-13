/**
 * Web Worker do SPED Retificador — roda numa thread separada da que desenha
 * a tela, pra processar arquivos grandes (na casa de dezenas de milhares de
 * linhas) sem travar a aba. O arquivo continua nunca saindo do navegador
 * (mesma decisão de privacidade de sempre) — só muda de thread.
 *
 * Mantém um cache em memória (por `id`, escolhido pela thread principal —
 * na prática o nome do arquivo) das leituras já feitas, pra não precisar
 * mandar o array de linhas de volta pra thread principal só pra recebê-lo
 * de volta na hora de gerar.
 */
import { zipSync } from "fflate";
import Decimal from "decimal.js";
import { lerSped, info0000, info0140, type SpedLeitura } from "./parser";
import { buildSped } from "./gerador";
import { calcular } from "./calculo";
import { montarArquivoSped } from "./encode";
import type { GerarParams, SpedWorkerRequest, SpedWorkerResponse } from "./spedWorkerProtocol";

const cache = new Map<string, SpedLeitura>();

function gerarBytes(leitura: SpedLeitura, params: GerarParams): { bytes: Uint8Array; totalLinhas: number } {
  const vals = calcular(new Decimal(params.creditoStr));
  const novas = buildSped({
    lines: leitura.lines,
    recibo: params.recibo,
    dtOper: params.dtOper,
    vals,
    codPart: params.codPart,
    codCta: params.codCta,
    nomeCta: params.nomeCta,
    descOper: params.descOper,
    nl: leitura.nl,
  });
  const bytes = montarArquivoSped(novas, leitura.encoding, leitura.sig);
  return { bytes, totalLinhas: novas.length };
}

function post(msg: SpedWorkerResponse, transfer?: Transferable[]): void {
  if (transfer) postMessage(msg, transfer);
  else postMessage(msg);
}

function mensagemErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

onmessage = async (ev: MessageEvent<SpedWorkerRequest>) => {
  const msg = ev.data;

  switch (msg.kind) {
    case "ler": {
      try {
        const leitura = await lerSped(msg.file);
        const info = info0000(leitura.lines);
        if (!info) {
          post({ kind: "lido", id: msg.id, ok: false, error: "Registro 0000 não encontrado — não parece um SPED EFD-Contribuições válido." });
          break;
        }
        const infoEst = info0140(leitura.lines);
        const qtd0140 = leitura.lines.filter((l) => l.startsWith("|0140|")).length;
        cache.set(msg.id, leitura);
        post({ kind: "lido", id: msg.id, ok: true, info, infoEst, totalLinhas: leitura.lines.length, qtd0140 });
      } catch (err) {
        post({ kind: "lido", id: msg.id, ok: false, error: mensagemErro(err) });
      }
      break;
    }

    case "remover": {
      cache.delete(msg.id);
      break;
    }

    case "gerarUnico": {
      const leitura = cache.get(msg.id);
      if (!leitura) {
        post({ kind: "gerarUnico", reqId: msg.reqId, ok: false, error: "Arquivo não encontrado no worker — anexe de novo." });
        break;
      }
      try {
        const { bytes, totalLinhas } = gerarBytes(leitura, msg.params);
        post({ kind: "gerarUnico", reqId: msg.reqId, ok: true, bytes, filename: msg.filename, totalLinhas }, [bytes.buffer]);
      } catch (err) {
        post({ kind: "gerarUnico", reqId: msg.reqId, ok: false, error: mensagemErro(err) });
      }
      break;
    }

    case "gerarMulti": {
      const entradas: Record<string, Uint8Array> = {};
      let sucesso = 0;
      let falhas = 0;

      for (let i = 0; i < msg.itens.length; i++) {
        const item = msg.itens[i];
        const leitura = cache.get(item.id);
        if (!leitura) {
          falhas++;
          post({
            kind: "gerarMultiProgresso",
            reqId: msg.reqId,
            index: i,
            total: msg.itens.length,
            ok: false,
            nomeOriginal: item.id,
            error: "Arquivo não encontrado no worker.",
          });
          continue;
        }
        try {
          const { bytes, totalLinhas } = gerarBytes(leitura, item.params);
          entradas[item.filename] = bytes;
          sucesso++;
          post({
            kind: "gerarMultiProgresso",
            reqId: msg.reqId,
            index: i,
            total: msg.itens.length,
            ok: true,
            filename: item.filename,
            totalLinhas,
          });
        } catch (err) {
          falhas++;
          post({
            kind: "gerarMultiProgresso",
            reqId: msg.reqId,
            index: i,
            total: msg.itens.length,
            ok: false,
            nomeOriginal: item.id,
            error: mensagemErro(err),
          });
        }
      }

      if (sucesso === 0) {
        post({ kind: "gerarMulti", reqId: msg.reqId, ok: false, error: "Nenhuma retificadora gerada." });
        break;
      }

      const zipped = zipSync(entradas);
      post(
        { kind: "gerarMulti", reqId: msg.reqId, ok: true, bytes: zipped, filename: msg.zipFilename, sucesso, falhas },
        [zipped.buffer],
      );
      break;
    }
  }
};
