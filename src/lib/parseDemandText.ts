import { extractReceitaCodes, resolveTaxCode } from "./taxCodes";

const KNOWN_TAX_CODES = [
  "IRPJ",
  "CSLL",
  "PIS",
  "COFINS",
  "IPI",
  "ICMS",
  "ISS",
  "INSS",
  "IOF",
  "CIDE",
  "ITR",
  "CPRB",
  "PASEP",
  "IRRF",
  "CSRF",
  "COSIRF",
  "II",
];

const GUIA_LABELS = ["guia", "darf", "c(?:ó|o)digo da receita", "c(?:ó|o)digo receita", "tributo"];

export interface ParsedDemand {
  guiaImposto: string;
  siglasImpostos: string[];
}

function extractByLabel(text: string, labels: string[]): string {
  const labelPattern = labels.join("|");
  const regex = new RegExp(`(?:${labelPattern})\\s*[:\\-]\\s*(.+)`, "i");
  const match = text.match(regex);
  if (!match) return "";
  return match[1].split(/\r?\n/)[0].trim();
}

function extractAcronyms(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const code of KNOWN_TAX_CODES) {
    const regex = new RegExp(`\\b${code}\\b`);
    if (regex.test(upper)) found.add(code);
  }
  return Array.from(found);
}

/**
 * Extrai guia (Código da Receita) e siglas do texto colado. A empresa NÃO é
 * adivinhada aqui — ela só deve vir de um match real contra o cadastro
 * (ver lib/matchEmpresa.ts), pra evitar pegar nomes de pessoas/menções do
 * texto como se fossem empresa.
 */
export function parseDemandText(text: string): ParsedDemand {
  if (!text.trim()) {
    return { guiaImposto: "", siglasImpostos: [] };
  }

  // "Guia" = Código da Receita (ex: 2089-01), como aparece no DARF/PER/DCOMP.
  const receitaCodes = extractReceitaCodes(text);
  const siglasFromCodes = receitaCodes
    .map(resolveTaxCode)
    .filter((s): s is string => Boolean(s));

  // Siglas também podem aparecer soltas no texto (ex: "PIS/COFINS"), mesmo sem código formal.
  const siglasFromText = extractAcronyms(text);

  const siglasImpostos = Array.from(new Set([...siglasFromCodes, ...siglasFromText]));

  const guiaImposto =
    receitaCodes.length > 0 ? receitaCodes.join(", ") : extractByLabel(text, GUIA_LABELS);

  return { guiaImposto, siglasImpostos };
}
