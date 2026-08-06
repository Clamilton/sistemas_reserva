/**
 * Porta de sped_retificador.py (seção "Parser SPED"). Lê o arquivo como
 * bytes (File API), separa o bloco de texto da assinatura digital binária
 * que a Receita anexa após o |9999|, e detecta o encoding na mesma ordem
 * do original (utf-8-sig, utf-8, cp1252, latin-1).
 *
 * Nota: o decoder "windows-1252" do navegador (padrão WHATWG) nunca falha,
 * diferente do cp1252 do Python que rejeita 5 bytes de controle
 * (0x81/0x8D/0x8F/0x90/0x9D). Nesses bytes raríssimos o navegador aceita
 * como windows-1252 onde o Python cairia pro latin-1 — divergência
 * irrelevante na prática (não ocorrem em arquivos SPED reais).
 */
import Decimal from "decimal.js";

export interface SpedLeitura {
  lines: string[];
  encoding: string;
  nl: string;
  sig: Uint8Array;
}

function stripBom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3);
  }
  return bytes;
}

function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(stripBom(bytes)), encoding: "utf-8-sig" };
  } catch {
    // segue
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    // segue
  }
  try {
    return { text: new TextDecoder("windows-1252", { fatal: true }).decode(bytes), encoding: "cp1252" };
  } catch {
    // segue
  }
  // latin-1 nunca lança (mapeia todo byte 0-255)
  return { text: new TextDecoder("iso-8859-1").decode(bytes), encoding: "latin-1" };
}

/**
 * Retorna (linhas_texto, encoding, terminador, assinatura_binária).
 * Localiza o fim do bloco de texto pela última ocorrência de |9999| — tudo
 * depois disso (assinatura digital) é preservado intacto e reescrito ao
 * final sem modificação.
 */
export async function lerSped(file: File): Promise<SpedLeitura> {
  const buf = new Uint8Array(await file.arrayBuffer());
  // Decodificação lossless byte<->char (1:1), só pra localizar o marcador
  // e o terminador de linha por posição de byte, sem lidar com bytes crus.
  const latin1Full = new TextDecoder("iso-8859-1").decode(buf);

  const marker = "|9999|";
  const pos = latin1Full.lastIndexOf(marker);

  let end = -1;
  let nl = "\r\n";
  if (pos !== -1) {
    const crlf = latin1Full.indexOf("\r\n", pos);
    if (crlf !== -1) {
      end = crlf + 2;
      nl = "\r\n";
    } else {
      const lf = latin1Full.indexOf("\n", pos);
      if (lf !== -1) {
        end = lf + 1;
        nl = "\n";
      }
    }
  }

  const textBytes = end !== -1 ? buf.subarray(0, end) : buf;
  const sig = end !== -1 ? buf.subarray(end) : new Uint8Array(0);

  const { text, encoding } = decodeText(textBytes);
  // Equivalente a str.splitlines(keepends=True) pro universo real de SPEDs
  // (só \r\n ou \n — o próprio detector de terminador acima não cobre \r
  // isolado, então não precisamos cobrir aqui).
  const lines = text.length ? text.split(/(?<=\n)/) : [];

  return { lines, encoding, nl, sig };
}

export function campos(linha: string): string[] {
  return linha.replace(/[\r\n]+$/, "").split("|");
}

export function reg(linha: string): string {
  const f = campos(linha);
  return f.length > 1 ? f[1] : "";
}

function campo(f: string[], i: number): string {
  return f.length > i ? f[i] : "";
}

export interface Info0000 {
  codVer: string;
  codFin: string;
  indSitEsp: string;
  numRecAnte: string;
  dtIni: string;
  dtFin: string;
  nome: string;
  cnpj: string;
  uf: string;
  codMun: string;
  indNatPj: string;
  indAtiv: string;
}

/** Layout 006: |0000|COD_VER|COD_FIN|IND_SIT_ESP|NUM_REC_ANTE|DT_INI|DT_FIN|NOME|CNPJ|... */
export function info0000(lines: string[]): Info0000 | null {
  for (const line of lines) {
    const f = campos(line);
    if (f.length > 1 && f[1] === "0000") {
      return {
        codVer: campo(f, 2),
        codFin: campo(f, 3),
        indSitEsp: campo(f, 4),
        numRecAnte: campo(f, 5),
        dtIni: campo(f, 6),
        dtFin: campo(f, 7),
        nome: campo(f, 8),
        cnpj: campo(f, 9),
        uf: campo(f, 10),
        codMun: campo(f, 11),
        indNatPj: campo(f, 13),
        indAtiv: campo(f, 14),
      };
    }
  }
  return null;
}

export function dtIniSped(lines: string[]): string {
  return info0000(lines)?.dtIni ?? "";
}

export function contaExiste(lines: string[], codCta: string): boolean {
  for (const line of lines) {
    const f = campos(line);
    if (f.length > 6 && f[1] === "0500" && f[6] === codCta) return true;
  }
  return false;
}

export function participanteExiste(lines: string[], codPart: string): boolean {
  for (const line of lines) {
    const f = campos(line);
    if (f.length > 2 && f[1] === "0150" && f[2] === codPart) return true;
  }
  return false;
}

/** Checa se já existe |F010|CNPJ| no arquivo. */
export function f010Existe(lines: string[], cnpj: string): boolean {
  const prefixo = `|F010|${cnpj}|`;
  return lines.some((l) => l.startsWith(prefixo));
}

/** Converte campo monetário SPED (vírgula) em Decimal. O leiaute oficial
 * nunca usa separador de milhar nesses campos, mas removê-lo protege
 * contra arquivos de emissores não conformes que o incluem por engano. */
export function parseSped(s: string | undefined): Decimal {
  const t = (s ?? "").trim();
  if (!t) return new Decimal(0);
  return new Decimal(t.replace(/\./g, "").replace(",", "."));
}

/** Acha índice de |M100|cod_cred| ou |M500|cod_cred| cuja ALIQ_PIS/
 * ALIQ_COFINS (campo 5) bata com aliqEsperada. null se não existe. */
export function acharM100(
  lines: string[],
  regPai: string,
  codCred: string,
  aliqEsperada: Decimal | null = null,
): number | null {
  const prefixo = `|${regPai}|${codCred}|`;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(prefixo)) continue;
    if (aliqEsperada === null) return i;
    const f = campos(lines[i]);
    if (f.length > 5) {
      try {
        if (parseSped(f[5]).equals(aliqEsperada)) return i;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** Procura M105|13|53 (ou M505|13|53) filho do M100 em idxPai. Limite: até
 * próximo M100/M500 ou registro fora do bloco M1xx/M5xx. */
export function acharM105_13_53(lines: string[], idxPai: number, regFilho: string): number | null {
  for (let j = idxPai + 1; j < lines.length; j++) {
    if (lines[j].startsWith(`|${regFilho}|13|53|`)) return j;
    const rJ = reg(lines[j]);
    if (rJ === "M100" || rJ === "M500") break;
    if (rJ && !(rJ.startsWith("M1") || rJ.startsWith("M5"))) break;
  }
  return null;
}

/** Acha índice de |1100|...|201| ou |1500|...|201| (COD_CRED no campo 5). */
export function achar1100_201(lines: string[], regPai: string): number | null {
  for (let i = 0; i < lines.length; i++) {
    const f = campos(lines[i]);
    if (f.length > 5 && f[1] === regPai && f[5] === "201") return i;
  }
  return null;
}

/** Retorna idx antes do qual inserir nova linha de bloco 1 (mantém ordem
 * numérica). targetCode = '1100' ou '1500'. */
export function posInserirBlock1(lines: string[], targetCode: string): number | null {
  for (let i = 0; i < lines.length; i++) {
    const f = campos(lines[i]);
    if (f.length > 1 && f[1].length === 4 && f[1][0] === "1" && f[1] > targetCode) return i;
  }
  return null;
}

/** Retorna idx da última linha pertencente ao grupo do M100/M500 (último
 * M105/M505 ou o próprio M100 se não houver filhos). */
export function fimGrupoM100(lines: string[], idxPai: number, regFilho: string): number {
  let ultima = idxPai;
  for (let j = idxPai + 1; j < lines.length; j++) {
    const rJ = reg(lines[j]);
    if (rJ === regFilho) {
      ultima = j;
    } else if (rJ === "M100" || rJ === "M500") {
      break;
    } else if (rJ && !(rJ.startsWith("M1") || rJ.startsWith("M5"))) {
      break;
    }
  }
  return ultima;
}

export interface Info0140 {
  codEst: string;
  nome: string;
  cnpj: string;
  uf: string;
  codMun: string;
}

/** Retorna dados do estabelecimento (registro 0140). */
export function info0140(lines: string[]): Info0140 | null {
  for (const line of lines) {
    const f = campos(line);
    if (f.length > 1 && f[1] === "0140") {
      return {
        codEst: campo(f, 2),
        nome: campo(f, 3),
        cnpj: campo(f, 4),
        uf: campo(f, 5),
        codMun: campo(f, 7),
      };
    }
  }
  return null;
}
