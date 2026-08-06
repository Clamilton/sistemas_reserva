export interface ParsedEmpresaLine {
  cnpj: string;
  nome: string;
}

const CNPJ_REGEX = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;

/**
 * Espera uma linha por empresa, com o CNPJ seguido do nome.
 * Reconhece o formato "CNPJ| Nome:  Empresa Ltda" (lista de empresas real)
 * e também formatos mais simples como "CNPJ - Empresa Ltda" ou "CNPJ  Empresa Ltda".
 */
export function parseEmpresaList(raw: string): ParsedEmpresaLine[] {
  const lines = raw.split(/\r?\n/);
  const result: ParsedEmpresaLine[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(CNPJ_REGEX);
    if (!match || match.index === undefined) continue;

    const cnpj = match[0];
    let rest = line.slice(match.index + match[0].length);
    rest = rest.replace(/^[\s|]+/, "");
    rest = rest.replace(/^nome\s*:?\s*/i, "");
    rest = rest.replace(/^[\s\-:;|]+/, "");
    const nome = rest.trim();

    if (nome) result.push({ cnpj, nome });
  }

  return result;
}
