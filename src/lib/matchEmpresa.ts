import type { Empresa } from "../types";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

const STOPWORDS = new Set([
  "LTDA",
  "ME",
  "EIRELI",
  "EPP",
  "SA",
  "S",
  "A",
  "DE",
  "DA",
  "DO",
  "DOS",
  "DAS",
  "E",
  "COMERCIO",
  "COMERCIAL",
  "INDUSTRIA",
  "INDUSTRIAL",
  "SERVICOS",
  "SERVICO",
  "LTD",
  "CIA",
  "COMPANHIA",
]);

function significantWords(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export interface EmpresaMatch {
  empresa: Empresa;
  score: number;
  matchedByCnpj: boolean;
}

const SCORE_THRESHOLD = 0.6;
const MAX_SUGGESTIONS = 3;

export function findEmpresaMatches(text: string, empresas: Empresa[]): EmpresaMatch[] {
  if (!text.trim() || empresas.length === 0) return [];

  const cnpjsInText = new Set(
    (text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? []).map(onlyDigits),
  );

  if (cnpjsInText.size > 0) {
    const cnpjMatches = empresas.filter((e) => cnpjsInText.has(onlyDigits(e.cnpj)));
    if (cnpjMatches.length > 0) {
      return cnpjMatches.map((empresa) => ({ empresa, score: 1, matchedByCnpj: true }));
    }
  }

  const normText = normalize(text);
  const scored = empresas
    .map((empresa) => {
      const words = significantWords(empresa.nome);
      if (words.length === 0) return { empresa, score: 0, matchedByCnpj: false };
      const hits = words.filter((w) => normText.includes(w)).length;
      return { empresa, score: hits / words.length, matchedByCnpj: false };
    })
    .filter((m) => m.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_SUGGESTIONS);
}
