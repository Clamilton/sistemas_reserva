/**
 * Porta de pages/_Processador_PERDCOMP.py (github.com/Clamilton/compensacao)
 * — extrai CNPJ/nome/débitos compensados do texto de um PDF de PER/DCOMP.
 * Mantém os mesmos regex e a mesma lógica de normalização do Python pro
 * restante do mapeamento de impostos; qualquer imposto "CP ..." (Patronal,
 * Segurados, Terceiros) foi unificado em "INSS" — ver nota em
 * padronizarNomeImposto.
 */
import Decimal from "decimal.js";
import { onlyDigits } from "../matchEmpresa";

const DE_PARA_IMPOSTOS: Record<string, string> = {
  "0561": "IRRF",
  "0588": "IRRF",
  "1138": "INSS", // CP Patronal
  "1099": "INSS", // CP Segurados
  "2089": "IRPJ",
  "2372": "CSLL",
  "8109": "PIS",
  "2172": "COFINS",
  "6912": "PIS",
  "5952": "CSRF",
  "5960": "CSRF",
  "5979": "CSRF",
  "5987": "CSRF",
  "6190": "COSIRF",
  "6256": "COSIRF",
  "3373": "IRPJ",
  "6012": "CSLL",
};

const MESES: Record<string, string> = {
  JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
  JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
};

/** Parseia um valor monetário do PDF, tratando tanto "1.500,00" (BR) quanto
 * "1,500.00" (US) — mesma heurística do Python (posição relativa da última
 * vírgula/ponto decide qual é o separador decimal). */
export function limparValor(valorStr: string | null | undefined): Decimal {
  if (!valorStr) return new Decimal(0);
  let limpo = String(valorStr).replace(/[^\d,.]/g, "");

  if (limpo.includes(",") && limpo.includes(".")) {
    if (limpo.indexOf(",") > limpo.indexOf(".")) {
      limpo = limpo.replace(/\./g, "").replace(",", ".");
    } else {
      limpo = limpo.replace(/,/g, "");
    }
  } else if (limpo.includes(",")) {
    limpo = limpo.replace(",", ".");
  }

  try {
    const d = new Decimal(limpo || "0");
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/** "Dia 25 de set de 2023" -> "25/09/2023". */
export function converterPaDiario(paBruto: string): string {
  const m = paBruto.match(/(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})/i);
  if (!m) return paBruto;
  const dia = m[1].padStart(2, "0");
  const mesTxt = m[2].toUpperCase().slice(0, 3);
  const ano = m[3];
  const mes = MESES[mesTxt];
  return mes ? `${dia}/${mes}/${ano}` : paBruto;
}

export function padronizarNomeImposto(codigo: string, descricao: string): string {
  const d = descricao.toUpperCase();

  // Qualquer "CP ..." (CP Patronal, CP Segurados, CP Terceiros — Salário-
  // Educação, INCRA, SENAC, SESC, SEBRAE etc., cada uma com um código de
  // receita diferente) vira "INSS" na mensagem. Mais confiável detectar
  // pelo texto do "Grupo de Tributo" do que listar código por código: o
  // código 1082, por exemplo, o dicionário original do Python mapeava pra
  // "CP Terceiros", mas na verdade é "CP Segurados" (conferido contra um
  // PER/DCOMP real) — o texto do PDF é mais confiável que esse código
  // específico, e de qualquer forma os dois caem em INSS agora.
  if (/\bCP\b/.test(d)) return "INSS";

  if (codigo && codigo.length >= 4) {
    const raiz = codigo.slice(0, 4);
    if (raiz in DE_PARA_IMPOSTOS) return DE_PARA_IMPOSTOS[raiz];
  }
  if (d.includes("IRRF")) return "IRRF";
  if (d.includes("PIS")) return "PIS";
  if (d.includes("COFINS")) return "COFINS";
  return descricao.trim().replace(/"/g, "");
}

export function extrairCabecalho(textoP1: string): { cnpj: string | null; nome: string } {
  const cnpjMatch = textoP1.match(/CNPJ\s*[:.]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
  const nomeMatch = textoP1.match(/Nome Empresarial(?:[^0-9A-Za-z]*)([^"\n]+)/i);
  return {
    cnpj: cnpjMatch ? cnpjMatch[1] : null,
    nome: nomeMatch ? nomeMatch[1].trim() : "Desconhecida",
  };
}

/** Busca `chave` num bloco de texto e retorna o que vem logo depois (até a
 * próxima aspa/quebra de linha), pulando o "lixo" não-alfanumérico entre os
 * dois (dois-pontos, espaços). `tipo='vl'` restringe o valor a dígitos/vírgula/
 * ponto — usado pros campos monetários. */
function getCampo(bloco: string, chave: string, tipo: "tx" | "vl" = "tx"): string | null {
  const valorPattern = tipo === "vl" ? "([\\d.,]+)" : '([^"\\n]+)';
  const re = new RegExp(`${chave}(?:[^0-9A-Za-z]*)${valorPattern}`, "is");
  const m = bloco.match(re);
  return m ? m[1].trim() : null;
}

export interface LinhaExtraida {
  pa: string;
  imposto: string;
  valor: Decimal;
}

export type ExtracaoResultado =
  | { ok: true; nomeEmpresa: string; linhas: LinhaExtraida[] }
  | { ok: false; erro: string };

/**
 * Extrai os débitos compensados de um PDF de PER/DCOMP já convertido em
 * texto por página (ver pdfText.ts). `cnpjAlvo` deve vir só com dígitos
 * (mesmo formato de `onlyDigits`) — a validação falha se o CNPJ do
 * cabeçalho do PDF não bater com esse valor.
 */
export function extrairDadosPdf(paginas: string[], cnpjAlvo: string): ExtracaoResultado {
  if (paginas.length === 0) return { ok: false, erro: "PDF vazio" };

  const p1 = paginas[0] || "";
  const { cnpj: cnpjPdf, nome: nomeEmpresa } = extrairCabecalho(p1);

  if (!cnpjPdf) return { ok: false, erro: "CNPJ não encontrado no PDF" };
  if (onlyDigits(cnpjPdf) !== cnpjAlvo) {
    return { ok: false, erro: `CNPJ divergente: ${cnpjPdf}` };
  }

  const texto = paginas.filter(Boolean).join("\n");

  const blocosRaw = texto.split(/\d{3}\.\s*Débito/);
  const blocos = blocosRaw.length > 1 ? blocosRaw.slice(1) : [texto];

  const linhas: LinhaExtraida[] = [];

  for (const bloco of blocos) {
    const matchCod = bloco.match(/Código da Receita\/Denominação(?:[^0-9]*)(\d{4}-\d{2})/is);
    const cod = matchCod ? matchCod[1] : (bloco.match(/(\d{4}-\d{2})/)?.[1] ?? "N/D");

    const totalTxt = getCampo(bloco, "Total", "vl");
    if (cod === "N/D" && !totalTxt) continue;

    let tot = limparValor(totalTxt);
    if (tot.isZero()) {
      tot = limparValor(getCampo(bloco, "Principal", "vl"))
        .plus(limparValor(getCampo(bloco, "Multa", "vl")))
        .plus(limparValor(getCampo(bloco, "Juros", "vl")));
    }

    const descBruta = getCampo(bloco, "Grupo de Tributo") ?? "";
    const imposto = padronizarNomeImposto(cod, descBruta);

    const periodicidade = (getCampo(bloco, "Periodicidade") ?? "").toUpperCase();
    const paBruto = getCampo(bloco, "Período de Apuração") ?? "";

    let pa: string;
    if (periodicidade.includes("ANUAL")) {
      pa = paBruto.match(/\d{4}/)?.[0] ?? paBruto;
    } else if (periodicidade.includes("DIÁRIO") || periodicidade.includes("DIARIO")) {
      pa = converterPaDiario(paBruto);
    } else {
      pa = paBruto;
    }

    linhas.push({ pa, imposto, valor: tot });
  }

  if (linhas.length === 0) return { ok: false, erro: "Nenhum débito encontrado no PDF" };

  return { ok: true, nomeEmpresa, linhas };
}
