/**
 * Camada de I/O específica do navegador: dispara o download de um arquivo
 * já pronto (bytes). A codificação e a montagem do zip agora rodam dentro
 * do Web Worker (ver spedWorker.ts) — aqui só sobra o que exige DOM
 * (`document`, criar/clicar num link), que o worker não tem acesso.
 */

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

export function baixarBytes(bytes: Uint8Array, filename: string, mimeType = "text/plain"): void {
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
}
