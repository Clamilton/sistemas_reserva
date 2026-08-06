/**
 * Mapeamento do "raiz" (4 primeiros dígitos) do Código da Receita para a
 * sigla do imposto, replicado de DE_PARA_IMPOSTOS em
 * https://github.com/Clamilton/compensacao (pages/_Processador_PERDCOMP.py).
 *
 * No dicionário original em Python a chave "5952" aparece duas vezes
 * ("PIS/COFINS/CSLL" e depois "CSRF"); como chave duplicada em dict literal,
 * a segunda ocorrência vence — mantido igual aqui.
 */
export const TAX_CODE_MAP: Record<string, string> = {
  "0561": "IRRF",
  "0588": "IRRF",
  "1138": "CP PATRONAL",
  "1099": "CP SEGURADOS",
  "1082": "CP TERCEIROS",
  "2089": "IRPJ",
  "2372": "CSLL",
  "8109": "PIS",
  "2172": "COFINS",
  "6912": "PIS",
  "5952": "CSRF",
  "5960": "CSRF",
  "1170": "CP TERCEIROS",
  "5979": "CSRF",
  "5987": "CSRF",
  "6190": "COSIRF",
  "6256": "COSIRF",
  "3373": "IRPJ",
  "6012": "CSLL",
};

export function resolveTaxCode(code: string): string | null {
  const root = code.replace(/\D/g, "").slice(0, 4);
  return TAX_CODE_MAP[root] ?? null;
}

/** Extrai códigos no formato "XXXX-YY" (Código da Receita como aparece no DARF/PER/DCOMP). */
export function extractReceitaCodes(text: string): string[] {
  const matches = text.match(/\b\d{4}-\d{2}\b/g) ?? [];
  return Array.from(new Set(matches));
}
