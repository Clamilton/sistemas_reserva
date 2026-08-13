/**
 * Porta de sped_retificador.py (seções "Gerador de registros SPED" e
 * "Montagem do novo SPED"). Mantém a mesma ordem de operações e os mesmos
 * índices de campo do original — qualquer mudança aqui precisa ser
 * validada linha a linha contra o Python.
 */
import Decimal from "decimal.js";
import { ALIQ_COFINS, ALIQ_PIS, fmtAliq, fmtSped, type CalculoResultado } from "./calculo";
import {
  acharM100,
  acharM105_13_53,
  achar1100_201,
  campos,
  contaExiste,
  f010Existe,
  fimGrupoM100,
  info0140,
  parseSped,
  participanteExiste,
  posInserirBlock1,
  reg,
} from "./parser";

// ─── Geradores de linha ─────────────────────────────────────────────────────

/** 0150 - Cadastro do participante (próprio CNPJ no caso de retificação). */
export function linha0150(codPart: string, nome: string, cnpj: string, codMun: string): string {
  return `|0150|${codPart}|${nome}|1058|${cnpj}|||${codMun}||||||\n`;
}

export function linha0500(dtAlt: string, codCta: string, nomeCta: string): string {
  return `|0500|${dtAlt}|01|A|5|${codCta}|${nomeCta}|||\n`;
}

/** F100 — 19 campos. */
export function linhaF100(
  dtOper: string,
  base: Decimal,
  vlPis: Decimal,
  vlCofins: Decimal,
  codPart: string,
  codCta: string,
  desc: string,
): string {
  const b = fmtSped(base);
  const ap = fmtAliq(ALIQ_PIS);
  const ac = fmtAliq(ALIQ_COFINS);
  const vp = fmtSped(vlPis);
  const vc = fmtSped(vlCofins);
  return `|F100|0|${codPart}||${dtOper}|${b}|53|${b}|${ap}|${vp}|53|${b}|${ac}|${vc}|13|0|${codCta}||${desc}|\n`;
}

// M100 / M105 (PIS)

/** M100 tipo 101 — Aquisição de Bens para Revenda (mesmo código do crédito
 * normal do contribuinte; o crédito extemporâneo entra no mesmo grupo). */
export function linhaM100_101(base: Decimal, vlPis: Decimal): string {
  const b = fmtSped(base);
  const vp = fmtSped(vlPis);
  return `|M100|101|0|${b}|${fmtAliq(ALIQ_PIS)}|||${vp}|0|0|0|${vp}|1|0|${vp}|\n`;
}

/** M105 do M100|101 — detalhamento com natureza 13 (outras operações com
 * direito a crédito) e CST 53, todo o valor da base alocado. */
export function linhaM105_101(base: Decimal): string {
  const b = fmtSped(base);
  return `|M105|13|53|${b}|0|${b}|${b}|||RECUPERACAO DE CREDITOS TRIBUTARIOS|\n`;
}

// M500 / M505 (COFINS)

export function linhaM500_101(base: Decimal, vlCofins: Decimal): string {
  const b = fmtSped(base);
  const vc = fmtSped(vlCofins);
  return `|M500|101|0|${b}|${fmtAliq(ALIQ_COFINS)}|||${vc}|0|0|0|${vc}|1|0|${vc}|\n`;
}

export function linhaM505_101(base: Decimal): string {
  const b = fmtSped(base);
  return `|M505|13|53|${b}|0|${b}|${b}|||RECUPERACAO DE CREDITOS TRIBUTARIOS|\n`;
}

// 1100 / 1500 (Controle de Créditos Fiscais)

/** 1100 PIS - Controle de Créditos Fiscais (cod 201). 18 campos.
 * ORIG_CRED='01' (crédito apurado no próprio período). PER_APU_CRED é
 * MMAAAA, sem barra — o validador da Receita rejeita "MM/AAAA". */
export function linha1100_201(per: string, vlCred: Decimal): string {
  const v = fmtSped(vlCred);
  return `|1100|${per}|01||201|${v}|0|${v}|0|0|0|${v}|0|0|0|0|0|${v}|\n`;
}

/** 1500 COFINS - Controle de Créditos Fiscais (cod 201). 18 campos. */
export function linha1500_201(per: string, vlCred: Decimal): string {
  const v = fmtSped(vlCred);
  return `|1500|${per}|01||201|${v}|0|${v}|0|0|0|${v}|0|0|0|0|0|${v}|\n`;
}

// ─── Montagem do novo SPED ──────────────────────────────────────────────────

function normaliza(line: string, nl: string): string {
  return line.replace(/[\r\n]+$/, "") + nl;
}

/** Garante que os índices 0..idxMax sejam válidos em f, preenchendo com
 * '0' os campos ausentes (SPEDs de layouts antigos podem ter menos campos
 * opcionais no final). Reserva um elemento vazio logo após idxMax
 * (representa o '|' de fechamento) pra que a linha reconstruída continue
 * terminando em '|'. */
function padCampos(f: string[], idxMax: number): string[] {
  const necessario = idxMax + 2;
  if (f.length >= necessario) return f;
  const faltam = necessario - f.length;
  const zeros = Array<string>(faltam).fill("0");
  if (f.length > 0 && f[f.length - 1] === "") {
    return [...f.slice(0, -1), ...zeros, ""];
  }
  return [...f, ...zeros];
}

/** Soma valores em registro M100/M500 existente.
 * Campos: 4=VL_BC_CRED, 8=VL_CRED, 12=VL_CRED_DISP, 15=SLD_CRED. */
function somarM100(line: string, vlBase: Decimal, vlCred: Decimal, nl: string): string {
  const f = padCampos(campos(line), 15);
  f[4] = fmtSped(parseSped(f[4]).plus(vlBase));
  f[8] = fmtSped(parseSped(f[8]).plus(vlCred));
  f[12] = fmtSped(parseSped(f[12]).plus(vlCred));
  f[15] = fmtSped(parseSped(f[15]).plus(vlCred));
  return normaliza(f.join("|"), nl);
}

/** Soma vlCredAdd em campos de 1100/1500: 6 VL_CRED_APU, 8 VL_TOT_CRED_APU,
 * 12 SD_CRED_DISP, 18 SLD_CRED_FIM. */
function somar1100(line: string, vlCredAdd: Decimal, nl: string): string {
  const f = padCampos(campos(line), 18);
  f[6] = fmtSped(parseSped(f[6]).plus(vlCredAdd));
  f[8] = fmtSped(parseSped(f[8]).plus(vlCredAdd));
  f[12] = fmtSped(parseSped(f[12]).plus(vlCredAdd));
  f[18] = fmtSped(parseSped(f[18]).plus(vlCredAdd));
  return normaliza(f.join("|"), nl);
}

/** Soma em M105/M505: 4=VL_BC_TOT, 6=VL_BC_NC, 7=VL_BC. vlTotAdd soma em
 * TOT/NC; vlBcAdd soma em VL_BC (porção do tipo). */
function somarM105(line: string, vlTotAdd: Decimal, vlBcAdd: Decimal, nl: string): string {
  const f = padCampos(campos(line), 7);
  f[4] = fmtSped(parseSped(f[4]).plus(vlTotAdd));
  f[6] = fmtSped(parseSped(f[6]).plus(vlTotAdd));
  f[7] = fmtSped(parseSped(f[7]).plus(vlBcAdd));
  return normaliza(f.join("|"), nl);
}

/** Recalcula contagens de fechamento de bloco (X990) e 9999, e insere
 * entradas |9900| faltantes para tipos de registro novos. */
function recalcBlocos(outIn: string[], nl: string): string[] {
  const tiposEm9900 = new Set<string>();
  for (const line of outIn) {
    const f = campos(line);
    if (f.length > 2 && f[1] === "9900") tiposEm9900.add(f[2]);
  }

  const contagemPre: Record<string, number> = {};
  for (const line of outIn) {
    const r = reg(line);
    if (r) contagemPre[r] = (contagemPre[r] ?? 0) + 1;
  }

  const novosTipos = Object.keys(contagemPre)
    .filter((t) => !tiposEm9900.has(t))
    .sort();

  let out = outIn;
  if (novosTipos.length > 0) {
    const out2: string[] = [];
    for (const line of outIn) {
      if (reg(line) === "9990") {
        for (const t of novosTipos) {
          out2.push(normaliza(`|9900|${t}|${contagemPre[t]}|`, nl));
        }
      }
      out2.push(line);
    }
    out = out2;
  }

  const contagem: Record<string, number> = {};
  const blocoQtd: Record<string, number> = {};
  for (const line of out) {
    const r = reg(line);
    if (r) {
      contagem[r] = (contagem[r] ?? 0) + 1;
      blocoQtd[r[0]] = (blocoQtd[r[0]] ?? 0) + 1;
    }
  }

  const result: string[] = [];
  for (const line of out) {
    const f = campos(line);
    const r = f.length > 1 ? f[1] : "";

    if (r.length === 4 && r.endsWith("990") && f.length > 2) {
      f[2] = String(blocoQtd[r[0]] ?? Number(f[2] || 0));
      result.push(normaliza(f.join("|"), nl));
      continue;
    }

    if (r === "9900" && f.length > 3) {
      const tipo = f[2];
      f[3] = String(contagem[tipo] ?? Number(f[3] || 0));
      result.push(normaliza(f.join("|"), nl));
      continue;
    }

    if (r === "9999" && f.length > 2) {
      f[2] = String(out.length);
      result.push(normaliza(f.join("|"), nl));
      continue;
    }

    result.push(line);
  }

  return result;
}

// F100 é o primeiro filho de F010 no leiaute oficial (F010 > F100 > F111 >
// F120 > F129 > F130 > F139 > F150 > F200 > ... > F990) — o conjunto
// original só cobria F200 em diante como "saída do grupo", então um
// arquivo com F111/F120/F129/F130/F139/F150 antes do F200/F990 fazia o
// F100 ser inserido depois desses registros, quebrando a ordem (rejeitado
// pelo validador da Receita). Mesmo bug existia no Python original.
const F_SAIR_GRUPO = new Set([
  "F010",
  "F111",
  "F120",
  "F129",
  "F130",
  "F139",
  "F150",
  "F200",
  "F205",
  "F210",
  "F211",
  "F500",
  "F509",
  "F510",
  "F519",
  "F525",
  "F550",
  "F559",
  "F560",
  "F569",
  "F600",
  "F700",
  "F800",
  "F990",
]);

export interface BuildSpedParams {
  lines: string[];
  recibo: string;
  dtOper: string;
  vals: CalculoResultado;
  codPart: string;
  codCta: string;
  nomeCta: string;
  descOper: string;
  nl?: string;
}

export function buildSped(params: BuildSpedParams): string[] {
  const { lines, recibo, dtOper, vals, codPart, codCta, nomeCta, descOper } = params;
  const nl = params.nl ?? "\r\n";

  const { base, valorPis: vlPis, valorCofins: vlCofins } = vals;

  const infoEstPre = info0140(lines);
  if (!infoEstPre) {
    throw new Error(
      "Registro 0140 (Cadastro do Estabelecimento) não encontrado no SPED carregado — " +
        "não é possível gerar a retificadora sem o CNPJ/nome do estabelecimento.",
    );
  }
  const cnpjEstPre = infoEstPre.cnpj;

  let nova0500 = !contaExiste(lines, codCta);
  let novo0150 = !participanteExiste(lines, codPart);
  const novoF010 = !f010Existe(lines, cnpjEstPre);
  let adicionouF100 = false;
  let adicionouM100 = false;
  let adicionouM500 = false;
  let dentroF010Nosso = false;

  const substituir = new Map<number, string>();
  const inserirApos = new Map<number, string[]>();
  const inserirAntes = new Map<number, string[]>();

  // O crédito extemporâneo entra no MESMO grupo do crédito normal do
  // contribuinte (COD_CRED 101 — Aquisição de Bens para Revenda), como
  // mais um detalhamento M105/M505 de natureza 13 (outras operações com
  // direito a crédito) e CST 53. Confirmado direto no validador da
  // Receita: tentativas anteriores de isolar isso num COD_CRED 201
  // separado, ou de nunca tocar num M100|101 real, foram rejeitadas
  // ("não deverá existir") — o correto é somar no 101 existente (base e
  // crédito no próprio M100/M500, e o valor no M105/M505). Se não existir
  // nenhum M100|101/M500|101 com a alíquota padrão, cria o par completo.
  // Ver [[16 - SPED Retificador]] no repositório de docs.
  const plano: [string, Decimal][] = [
    ["M100", vlPis],
    ["M500", vlCofins],
  ];

  let inserirM100 = false;
  let inserirM500 = false;

  const aliqEsperadaPorReg: Record<string, Decimal> = { M100: ALIQ_PIS, M500: ALIQ_COFINS };

  for (const [regPai, vlCred] of plano) {
    const regFilho = regPai === "M100" ? "M105" : "M505";
    const idxPai = acharM100(lines, regPai, "101", aliqEsperadaPorReg[regPai]);

    if (idxPai === null) {
      if (regPai === "M100") inserirM100 = true;
      else inserirM500 = true;
      continue;
    }

    substituir.set(idxPai, somarM100(lines[idxPai], base, vlCred, nl));

    const idxFilho = acharM105_13_53(lines, idxPai, regFilho);
    if (idxFilho !== null) {
      substituir.set(idxFilho, somarM105(lines[idxFilho], base, base, nl));
    } else {
      const idxApos = fimGrupoM100(lines, idxPai, regFilho);
      const nova = regPai === "M100" ? linhaM105_101(base) : linhaM505_101(base);
      const arr = inserirApos.get(idxApos) ?? [];
      arr.push(normaliza(nova, nl));
      inserirApos.set(idxApos, arr);
    }
  }

  // PER_APU_CRED = MMAAAA extraído da DT_OPER (DDMMAAAA) — sem barra.
  const perApu = dtOper.length === 8 ? dtOper.slice(2, 4) + dtOper.slice(4) : "";

  const blocosControle: [string, Decimal, (per: string, v: Decimal) => string][] = [
    ["1100", vlPis, linha1100_201],
    ["1500", vlCofins, linha1500_201],
  ];
  for (const [regPai, vlCred, fnNova] of blocosControle) {
    const idx = achar1100_201(lines, regPai);
    if (idx !== null) {
      substituir.set(idx, somar1100(lines[idx], vlCred, nl));
    } else {
      const pos = posInserirBlock1(lines, regPai);
      if (pos !== null) {
        const arr = inserirAntes.get(pos) ?? [];
        arr.push(normaliza(fnNova(perApu, vlCred), nl));
        inserirAntes.set(pos, arr);
      }
    }
  }

  const dtAlt = "01012020"; // data de inclusão da conta no plano (convenção SPED)

  const infoEst = info0140(lines);
  const cnpjEst = infoEst?.cnpj ?? "";
  const nomeEst = infoEst?.nome ?? "";
  const munEst = infoEst?.codMun ?? "";

  const camposBloco0150 = new Set([
    "0190",
    "0200",
    "0205",
    "0206",
    "0208",
    "0300",
    "0400",
    "0450",
    "0500",
    "0600",
    "0900",
    "0990",
  ]);

  // 0500 precisa vir antes de 0600/0900/0990 — inserir só "antes de 0990"
  // é um bug: se o arquivo já tem um 0900 preenchido, ele fica entre o
  // 0500 e o 0990, e inserir ali quebra a hierarquia do bloco 0 (o 0500
  // novo cairia depois do 0900, quando a ordem correta é 0500 < 0600 < 0900).
  const camposBloco0500 = new Set(["0600", "0900", "0990"]);

  const out: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const r = reg(line);

    if (inserirAntes.has(idx)) out.push(...inserirAntes.get(idx)!);

    if (substituir.has(idx)) {
      out.push(substituir.get(idx)!);
      if (inserirApos.has(idx)) out.push(...inserirApos.get(idx)!);
      continue;
    }

    // ── 0000: marcar retificadora ──────────────────────────────────────
    if (r === "0000") {
      const f = campos(line);
      if (f.length > 5) {
        f[3] = "1"; // COD_FIN = retificadora
        f[5] = recibo; // NUM_REC_ANTE
      }
      out.push(normaliza(f.join("|"), nl));
      continue;
    }

    // ── inserir 0150 antes do primeiro registro > 0150 do bloco 0 ───────
    if (novo0150 && camposBloco0150.has(r)) {
      out.push(normaliza(linha0150(codPart, nomeEst, cnpjEst, munEst), nl));
      novo0150 = false;
    }

    // ── inserir 0500 antes de 0600/0900/0990 (o que vier primeiro) ──────
    if (nova0500 && camposBloco0500.has(r)) {
      out.push(normaliza(linha0500(dtAlt, codCta, nomeCta), nl));
      nova0500 = false;
    }

    // ── F001/1001/M001: se estava fechado (IND_MOV=1), abrir ────────────
    if (r === "F001" || r === "1001" || r === "M001") {
      const f = campos(line);
      if (f.length > 2 && f[2] === "1") f[2] = "0";
      out.push(normaliza(f.join("|"), nl));
      continue;
    }

    // ── Inserir F100 no lugar certo do bloco F ───────────────────────────
    if (!adicionouF100) {
      if (dentroF010Nosso && F_SAIR_GRUPO.has(r)) {
        out.push(normaliza(linhaF100(dtOper, base, vlPis, vlCofins, codPart, codCta, descOper), nl));
        adicionouF100 = true;
      } else if (!dentroF010Nosso && r === "F990") {
        if (novoF010) out.push(normaliza(`|F010|${cnpjEst}|`, nl));
        out.push(normaliza(linhaF100(dtOper, base, vlPis, vlCofins, codPart, codCta, descOper), nl));
        adicionouF100 = true;
      }
    }

    // Atualiza estado de "dentro do nosso F010" ANTES de processar próxima
    if (r === "F010") {
      const f = campos(line);
      dentroF010Nosso = f.length > 2 && f[2] === cnpjEst;
    }

    // ── M100/M105 antes de M110 (se existir) ou M200 (ou M990 se bloco M
    // vazio) — sem checar M110, um arquivo com registros de ajuste M110/
    // M115 antes de M200 faria o M100 novo entrar depois deles, fora de
    // ordem (mesma classe do bug de F100/F111-150 corrigido acima).
    if ((r === "M110" || r === "M200" || r === "M990") && !adicionouM100) {
      if (inserirM100) {
        out.push(normaliza(linhaM100_101(base, vlPis), nl));
        out.push(normaliza(linhaM105_101(base), nl));
      }
      adicionouM100 = true;
    }

    // ── M500/M505 antes de M510 (se existir) ou M600 (mesmo fallback em
    // M990) — mesmo motivo do M110 acima.
    if ((r === "M510" || r === "M600" || r === "M990") && !adicionouM500) {
      if (inserirM500) {
        out.push(normaliza(linhaM500_101(base, vlCofins), nl));
        out.push(normaliza(linhaM505_101(base), nl));
      }
      adicionouM500 = true;
    }

    out.push(normaliza(line, nl));
    if (inserirApos.has(idx)) out.push(...inserirApos.get(idx)!);
  }

  return recalcBlocos(out, nl);
}
