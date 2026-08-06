/**
 * Camada de I/O específica do navegador: escreve o texto do SPED de volta
 * pro encoding original (bytes), dispara downloads e empacota múltiplas
 * retificadoras num .zip (modo multi-SPED, já que o navegador não deixa
 * escolher/escrever numa pasta como o app desktop).
 */
import { zipSync } from "fflate";

// Tabela windows-1252 pro intervalo 0x80-0x9F (WHATWG index-windows-1252).
// Bytes sem mapeamento definido (0x81/0x8D/0x8F/0x90/0x9D) usam o próprio
// valor do byte como "codepoint" — mesma convenção de fallback do decoder.
const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};
const CP1252_HIGH_REVERSE = new Map<number, number>(
  Object.entries(CP1252_HIGH).map(([byte, cp]) => [cp, Number(byte)]),
);

function encodeLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
}

function encodeWindows1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) {
      out[i] = cp & 0xff;
    } else {
      out[i] = CP1252_HIGH_REVERSE.get(cp) ?? (cp & 0xff);
    }
  }
  return out;
}

/** Codifica o texto de volta pro encoding detectado na leitura. SPED não
 * aceita BOM: se o encoding detectado foi utf-8-sig, grava como utf-8 puro. */
export function encodeSpedText(text: string, encoding: string): Uint8Array {
  if (encoding === "utf-8-sig" || encoding === "utf-8") {
    return new TextEncoder().encode(text);
  }
  if (encoding === "cp1252") {
    return encodeWindows1252(text);
  }
  return encodeLatin1(text);
}

/** Monta os bytes finais do arquivo: texto codificado + assinatura binária
 * original intacta (se houver), preservando a assinatura digital da Receita. */
export function montarArquivoSped(linhas: string[], encoding: string, sig: Uint8Array): Uint8Array {
  const textBytes = encodeSpedText(linhas.join(""), encoding);
  if (sig.length === 0) return textBytes;
  const out = new Uint8Array(textBytes.length + sig.length);
  out.set(textBytes, 0);
  out.set(sig, textBytes.length);
  return out;
}

/** Remove hífen/espaço/ponto (formato colado do e-CAC) e valida que só
 * restam letras e números. Retorna null se vazio ou inválido. */
export function normalizarRecibo(texto: string): string | null {
  const recibo = texto.trim().replace(/[-.\s]/g, "");
  return recibo && /^[a-zA-Z0-9]+$/.test(recibo) ? recibo : null;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function baixarSpedUnico(linhas: string[], encoding: string, sig: Uint8Array, filename: string): void {
  const bytes = montarArquivoSped(linhas, encoding, sig);
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: "text/plain" }), filename);
}

export interface ArquivoParaZip {
  filename: string;
  linhas: string[];
  encoding: string;
  sig: Uint8Array;
}

/** Empacota várias retificadoras num único .zip (modo multi-SPED). */
export function baixarSpedsEmZip(arquivos: ArquivoParaZip[], zipFilename: string): void {
  const entradas: Record<string, Uint8Array> = {};
  for (const arq of arquivos) {
    entradas[arq.filename] = montarArquivoSped(arq.linhas, arq.encoding, arq.sig);
  }
  const zipped = zipSync(entradas);
  downloadBlob(new Blob([new Uint8Array(zipped)], { type: "application/zip" }), zipFilename);
}
