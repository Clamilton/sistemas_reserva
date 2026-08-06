/**
 * Extração de texto de PDF no navegador via pdfjs-dist — equivalente ao
 * `pdfplumber` usado no Python original (_Processador_PERDCOMP.py), mas sem
 * subir o arquivo pro backend (mesmo padrão de privacidade do SPED
 * Retificador). Não é garantido produzir texto byte-idêntico ao pdfplumber
 * (motores de extração diferentes) — os regex de extração em extractor.ts
 * são tolerantes a variações de espaçamento por causa disso.
 *
 * pdfjs-dist é pesado (~1MB com o worker) e só é usado ao finalizar uma
 * demanda de Compensação — importado dinamicamente dentro de
 * `extractPdfPages` pra não inflar o bundle principal do Kanban (que carrega
 * `FinalizeModal` de cara, sem lazy loading).
 */

/** Shape mínimo de um item de `getTextContent()` que a gente usa — o pacote
 * não reexporta o tipo `TextItem` no entrypoint público, então tipamos
 * estruturalmente em vez de importar de um caminho interno. */
interface RawTextItem {
  str: string;
  transform: number[];
  width?: number;
}

function isTextItem(item: unknown): item is RawTextItem {
  return typeof (item as RawTextItem).str === "string" && Array.isArray((item as RawTextItem).transform);
}

/** Agrupa os itens de texto em linhas (mesma coordenada Y, tolerância de
 * 2pt) e ordena por X — reconstrói a ordem de leitura da página. Só insere
 * espaço entre itens quando há um vão real entre eles (evita quebrar uma
 * palavra que o PDF renderizou em múltiplos "spans" por causa de kerning). */
function textFromItems(items: unknown[]): string {
  const Y_TOL = 2;
  const lines: { y: number; parts: { x: number; width: number; str: string }[] }[] = [];

  for (const item of items) {
    if (!isTextItem(item) || !item.str) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const width = item.width ?? 0;

    let line = lines.find((l) => Math.abs(l.y - y) <= Y_TOL);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x, width, str: item.str });
  }

  lines.sort((a, b) => b.y - a.y);

  return lines
    .map((line) => {
      const parts = [...line.parts].sort((a, b) => a.x - b.x);
      let text = "";
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (i === 0) {
          text = p.str;
          continue;
        }
        const prev = parts[i - 1];
        const gap = p.x - (prev.x + prev.width);
        text += (gap > 1 ? " " : "") + p.str;
      }
      return text.trim();
    })
    .filter(Boolean)
    .join("\n");
}

let workerConfigured = false;

/** Retorna o texto de cada página do PDF, na ordem do documento. */
export async function extractPdfPages(file: File): Promise<string[]> {
  const [{ GlobalWorkerOptions, getDocument }, { default: pdfWorkerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  if (!workerConfigured) {
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerConfigured = true;
  }

  const buf = await file.arrayBuffer();
  const pdf = await getDocument({ data: buf }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(textFromItems(content.items));
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}
