/**
 * Porta fiel de calc_tributaria/sped_retificador.py (seção "Cálculos" e
 * "Diferenciação entre múltiplos meses/SPEDs"). Usa decimal.js com os
 * mesmos arredondamentos (ROUND_HALF_UP / ROUND_CEIL) do Decimal do Python
 * — nunca usar `number` puro aqui, a precisão de ponto flutuante do JS
 * produziria divergências de centavos que o algoritmo original evita de
 * propósito.
 */
import Decimal from "decimal.js";

export const ALIQ_PIS = new Decimal("1.65");
export const ALIQ_COFINS = new Decimal("7.60");
export const TOTAL_ALIQ = ALIQ_PIS.plus(ALIQ_COFINS); // 9.25

export const VARIACAO_PADRAO = new Decimal("12.30");
export const TETO_TRIMESTRE_PADRAO = new Decimal("1500000.00");

const RHU = Decimal.ROUND_HALF_UP;

function q2(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, RHU);
}

export interface CalculoResultado {
  base: Decimal;
  valorPis: Decimal;
  valorCofins: Decimal;
}

/** Distribui o crédito total entre base/PIS/COFINS. COFINS é o resíduo
 * (credito_total - valor_pis), não base*aliq arredondado independente,
 * pra bater exatamente com o crédito digitado. */
export function calcular(creditoTotal: Decimal): CalculoResultado {
  const base = q2(creditoTotal.div(TOTAL_ALIQ).times(100));
  const valorPis = q2(base.times(ALIQ_PIS).div(100));
  const valorCofins = q2(creditoTotal.minus(valorPis));
  return { base, valorPis, valorCofins };
}

/** Distribui total_grupo em 2 ou 3 meses alternando padrão baixo/alto.
 * O último mês sempre absorve o resíduo do arredondamento. */
function diferenciarGrupo(
  totalGrupo: Decimal,
  variacaoPct: Decimal,
  inverter: boolean,
  qtdMeses: number,
): Decimal[] {
  const baseMedia = q2(totalGrupo.div(qtdMeses));
  const valorVariacao = q2(baseMedia.times(variacaoPct).div(100));

  if (qtdMeses === 3) {
    const m1 = baseMedia;
    const m2 = inverter ? baseMedia.plus(valorVariacao) : baseMedia.minus(valorVariacao);
    const m3 = totalGrupo.minus(m1.plus(m2));
    return [m1, m2, m3];
  }

  const m1 = inverter ? baseMedia.plus(valorVariacao) : baseMedia.minus(valorVariacao);
  const m2 = totalGrupo.minus(m1);
  return [m1, m2];
}

export interface DiferenciarOk {
  ok: true;
  valores: Decimal[];
  grupos: number[];
  totaisGrupos: Decimal[];
}

export interface DiferenciarEstouro {
  ok: false;
  estouros: { grupo: number; total: Decimal }[];
  qtdMesesSugerido: number;
}

export type DiferenciarResultado = DiferenciarOk | DiferenciarEstouro;

/**
 * Agrupa qtdMesesTotal em blocos de até 3 (só o último grupo pode ter
 * tamanho 1 ou 2), distribui valorTotal proporcionalmente entre grupos (o
 * último grupo absorve o resíduo do arredondamento), bloqueia se
 * tetoTrimestre for informado e algum grupo estourar, e diferencia cada
 * grupo de 2-3 meses alternando o padrão baixo/alto a cada grupo. Um grupo
 * de 1 mês (resto não-múltiplo-de-3) não diferencia e não consome uma
 * alternância.
 */
export function diferenciarCreditos(
  valorTotal: Decimal,
  variacaoPct: Decimal,
  qtdMesesTotal: number,
  tetoTrimestre: Decimal | null = null,
  inverterInicial = false,
): DiferenciarResultado {
  const grupos: number[] = [];
  let restante = qtdMesesTotal;
  while (restante > 0) {
    const tamanho = restante >= 3 ? 3 : restante;
    grupos.push(tamanho);
    restante -= tamanho;
  }

  const n = new Decimal(qtdMesesTotal);
  const temResidualPequeno = grupos[grupos.length - 1] < 3;
  const qtdTrimestresCheios = temResidualPequeno ? grupos.length - 1 : grupos.length;

  let valorResidual: Decimal | null = null;
  let valorTrimestres: Decimal;
  if (temResidualPequeno) {
    const tamanhoResidual = grupos[grupos.length - 1];
    valorResidual = q2(valorTotal.times(tamanhoResidual).div(n));
    valorTrimestres = valorTotal.minus(valorResidual);
  } else {
    valorTrimestres = valorTotal;
  }

  // Diferencia os trimestres cheios entre si (senão todo trimestre completo
  // recebia exatamente valorTotal*3/n e saía com o MESMO total). O grupo
  // residual (sobra de 1-2 meses não-múltiplo-de-3) fica FORA dessa
  // diferenciação e mantém sua fatia proporcional simples.
  const totaisTrimestres: Decimal[] = [];
  if (qtdTrimestresCheios > 0) {
    let acumulado = new Decimal(0);
    const parteBase = q2(valorTrimestres.div(qtdTrimestresCheios));

    // fator_k tem sinal fixo (não alterna) e cada trimestre usa razao**i,
    // estritamente decrescente em módulo: os totais ficam monótonos entre
    // si e o último (que absorve o resíduo) fica sempre do lado oposto —
    // geometricamente impossível dois totais colidirem. abs(fatorK) é
    // limitado a 8% independente da Variação % pedida (que pode chegar a
    // quase 100% e é aplicada dentro do trimestre) — sem o limite, muitos
    // trimestres cheios em sequência poderiam esgotar o último trimestre e
    // ele ficar negativo.
    const sinalGrupos = inverterInicial ? new Decimal(-1) : new Decimal(1);
    const fatorK = Decimal.min(variacaoPct.abs().div(100), new Decimal("0.08"))
      .times(variacaoPct.lt(0) ? -1 : 1)
      .times(sinalGrupos);
    const amplitude = new Decimal("1.15");
    const razao = new Decimal("0.6");

    for (let i = 0; i < qtdTrimestresCheios; i++) {
      if (i < qtdTrimestresCheios - 1) {
        // -0.01*i garante passo mínimo de 1 centavo entre trimestres
        // consecutivos mesmo quando razao**i já decaiu abaixo da resolução
        // de centavos (créditos de vários anos, muitos trimestres).
        const delta = q2(
          parteBase
            .times(fatorK)
            .times(amplitude)
            .times(razao.pow(i))
            .minus(new Decimal("0.01").times(i)),
        );
        const parte = parteBase.plus(delta);
        totaisTrimestres.push(parte);
        acumulado = acumulado.plus(parte);
      } else {
        totaisTrimestres.push(q2(valorTrimestres.minus(acumulado)));
      }
    }

    if (qtdTrimestresCheios === 1 && temResidualPequeno && valorResidual) {
      // Com 1 só trimestre não há contra quem se diferenciar — ele e o
      // resíduo, cada um dividido por seu próprio tamanho, dariam o mesmo
      // valorTotal/n, colidindo o valor mensal interno de ambos. Transfere
      // uma fração do menor pro outro.
      const menor = Decimal.min(totaisTrimestres[0], valorResidual);
      const deltaK1 = q2(menor.times(fatorK));
      totaisTrimestres[0] = totaisTrimestres[0].plus(deltaK1);
      valorResidual = valorResidual.minus(deltaK1);
    }
  }

  const totaisGrupos =
    temResidualPequeno && valorResidual ? [...totaisTrimestres, valorResidual] : totaisTrimestres;

  if (tetoTrimestre !== null) {
    const estouros = totaisGrupos
      .map((total, i) => ({ grupo: i + 1, total }))
      .filter((e) => e.total.gt(tetoTrimestre));

    if (estouros.length > 0) {
      // A diferenciação infla o maior grupo até ~20% acima da fatia
      // proporcional pura — uma conta direta (valorTotal/teto) ignora essa
      // inflação e podia sugerir um nº de meses que ainda estourava.
      // Simula de verdade, aumentando de 3 em 3, até achar um total que
      // realmente não estoura.
      let candidato = valorTotal.div(tetoTrimestre).ceil().toNumber() * 3;
      const limite = candidato + 300; // salvaguarda contra loop sem fim
      while (candidato <= limite) {
        const sim = diferenciarCreditos(valorTotal, variacaoPct, candidato, null, inverterInicial);
        if (sim.ok && sim.totaisGrupos.every((t) => t.lte(tetoTrimestre))) {
          break;
        }
        candidato += 3;
      }
      return { ok: false, estouros, qtdMesesSugerido: candidato };
    }
  }

  const valoresMensais: Decimal[] = [];
  let inverter = inverterInicial;
  for (let idx = 0; idx < grupos.length; idx++) {
    const tamanho = grupos[idx];
    const totalGrupo = totaisGrupos[idx];
    if (tamanho === 1) {
      valoresMensais.push(totalGrupo);
      continue;
    }
    valoresMensais.push(...diferenciarGrupo(totalGrupo, variacaoPct, inverter, tamanho));
    inverter = !inverter;
  }

  return { ok: true, valores: valoresMensais, grupos, totaisGrupos };
}

// ─── Parsing / formatação ───────────────────────────────────────────────────

/** Converte texto digitado (formato BR "1.234,56", só vírgula, ou ponto
 * decimal isolado "1234.56" de planilhas en-US) em Decimal. */
export function parseDecimalBR(texto: string): Decimal {
  let s = texto.trim().replace(/\s+/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const partes = s.split(".");
    if (partes.length > 2 || partes[partes.length - 1].length > 2) {
      s = s.replace(/\./g, "");
    }
  }
  return new Decimal(s);
}

/** Formata Decimal para exibição BR: 1.234,56 */
export function fmtBr(v: Decimal): string {
  const fixed = v.toFixed(2);
  const negative = fixed.startsWith("-");
  const [intPart, decPart] = (negative ? fixed.slice(1) : fixed).split(".");
  const comMilhar = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${comMilhar},${decPart}`;
}

/** Formata Decimal para o TXT do SPED: vírgula como separador decimal. */
export function fmtSped(v: Decimal, dec = 2): string {
  return v.toFixed(dec).replace(".", ",");
}

export function fmtSped4(v: Decimal): string {
  return fmtSped(v, 4);
}

/** Alíquota com zeros à direita removidos (ex: 1,65 e 7,6). */
export function fmtAliq(v: Decimal): string {
  const s = fmtSped(v, 4);
  if (s.includes(",")) {
    const [i, f] = s.split(",");
    const fTrimmed = f.replace(/0+$/, "") || "0";
    return `${i},${fTrimmed}`;
  }
  return s;
}
