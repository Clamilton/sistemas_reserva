import { useRef, useState } from "react";
import Decimal from "decimal.js";
import { AlertTriangle, Check, Plus, Trash2, Upload } from "lucide-react";
import {
  VARIACAO_PADRAO,
  calcular,
  diferenciarCreditos,
  fmtBr,
  parseDecimalBR,
  type CalculoResultado,
} from "../lib/sped/calculo";
import { info0000, info0140, lerSped, type Info0000, type Info0140, type SpedLeitura } from "../lib/sped/parser";
import { buildSped } from "../lib/sped/gerador";
import { baixarSpedUnico, baixarSpedsEmZip, normalizarRecibo } from "../lib/sped/io";
import { onlyDigits } from "../lib/matchEmpresa";
import { useToastStore } from "../store/useToastStore";

const CONTAS_ANALITICAS = [
  "ADICAO DE CREDITOS REFERENTE A EXCLUSAO DO ICMS DA BASE DE CALCULO DO PIS E DA COFINS",
  "ADICAO DE CREDITOS TRIBUTARIOS EMPRESA NAO CUMULATIVA",
  "LEI 192 DE 11 DE MARÇO 2022",
  "CREDITO DE PA ANTERIORES NAO APROPRIADOS ACORDAO 9303009893",
  "RECUPERACAO DE CREDITOS TRIBUTARIOS",
  "PIS COFINS TRIBUTAÇÃO INDEVIDA",
  "HABILITAÇÃO DE CRÉDITOS CÓDIGO 99",
  "CREDITO PRESUMIDO DE ESTOQUE",
];

interface LogEntry {
  id: string;
  ts: string;
  msg: string;
  tag: "ok" | "err" | "";
}

interface ArquivoAnexado {
  file: File;
  leitura: SpedLeitura;
  info: Info0000;
  infoEst: Info0140 | null;
  recibo: string;
}

function ddmmaaaaParaIso(d: string): string {
  if (d.length !== 8) return "";
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

function isoParaDdmmaaaa(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}${m}${y}`;
}

function formatarPeriodo(dtIni: string, dtFin: string): string {
  if (!dtIni) return "—";
  const f = (d: string) => (d.length === 8 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : "—");
  return `${f(dtIni)} → ${f(dtFin)}`;
}

function chaveRecibo(cnpj: string, dtIni: string): string {
  return `${cnpj}|${dtIni}`;
}

/** Linha do arquivo de recibos por competência (exportação do e-CAC/PVA):
 * ativo(true/false) \t cnpj \t dtIni(ISO) \t dtFin(ISO) \t dtTransmissao(ISO) \t tipo \t recibo[-dígito]
 * O recibo sai com traço + dígito verificador (ex: "ABC...9-0") — o SPED não
 * aceita traço no campo NUM_REC_ANTE, então normalizarRecibo() já remove. */
function parseLinhaRecibos(linha: string): { cnpj: string; dtIni: string; recibo: string } | null {
  const cols = linha.split("\t");
  if (cols.length < 7) return null;
  if (cols[0]?.trim().toLowerCase() === "false") return null;

  const cnpj = onlyDigits(cols[1] ?? "");
  const dtIni = isoParaDdmmaaaa((cols[2] ?? "").split("T")[0]);
  const recibo = normalizarRecibo(cols[6] ?? "");
  if (!cnpj || !dtIni || !recibo) return null;

  return { cnpj, dtIni, recibo };
}

export function SpedRetificador() {
  const pushToast = useToastStore((s) => s.push);
  const [modoMulti, setModoMulti] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  // Modo simples
  const [arquivo, setArquivo] = useState<{ file: File; leitura: SpedLeitura; info: Info0000; infoEst: Info0140 | null } | null>(null);
  const [recibo, setRecibo] = useState("");
  const [dtOper, setDtOper] = useState("");

  // Modo múltiplos SPEDs
  const [arquivos, setArquivos] = useState<ArquivoAnexado[]>([]);
  const [variacaoPct, setVariacaoPct] = useState(VARIACAO_PADRAO.toString());
  const [tetoTrimestre, setTetoTrimestre] = useState("");
  const [inverterInicial, setInverterInicial] = useState(false);
  const [recibosImportados, setRecibosImportados] = useState<Map<string, string>>(new Map());

  // Compartilhado
  const [credito, setCredito] = useState("");
  const [codCta, setCodCta] = useState("001");
  const [nomeCta, setNomeCta] = useState("LANCAMENTO DE CREDITO EXTEMPORANEO ACORDAO 9303009893");
  const [codPart, setCodPart] = useState("001");
  const [descOper, setDescOper] = useState("");
  const [gerando, setGerando] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const recibosInputRef = useRef<HTMLInputElement>(null);

  function addLog(msg: string, tag: LogEntry["tag"] = "") {
    setLog((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, ts: new Date().toLocaleTimeString("pt-BR"), msg, tag },
    ].slice(-200));
  }

  let creditoDecimal: Decimal | null = null;
  try {
    const d = parseDecimalBR(credito);
    if (d.gt(0)) creditoDecimal = d;
  } catch {
    creditoDecimal = null;
  }
  const previewSingle: CalculoResultado | null = creditoDecimal ? calcular(creditoDecimal) : null;

  // ── Modo simples: carregar arquivo ──────────────────────────────────────
  async function handleSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const leitura = await lerSped(file);
      const info = info0000(leitura.lines);
      if (!info) {
        pushToast("Registro 0000 não encontrado — não parece um SPED EFD-Contribuições válido.");
        return;
      }
      const infoEst = info0140(leitura.lines);
      setArquivo({ file, leitura, info, infoEst });

      if (info.dtIni && !dtOper) setDtOper(info.dtIni);
      if (info.numRecAnte && !recibo) setRecibo(info.numRecAnte);

      const n0140 = leitura.lines.filter((l) => l.startsWith("|0140|")).length;
      addLog(`Arquivo carregado: ${file.name} (${leitura.lines.length.toLocaleString("pt-BR")} linhas)`, "ok");
      if (n0140 > 1) {
        addLog(
          `AVISO: arquivo tem ${n0140} estabelecimentos (registros 0140). Sempre é usado o CNPJ do PRIMEIRO — confira se é o correto.`,
          "err",
        );
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Erro ao ler o arquivo SPED.");
    }
  }

  // ── Modo múltiplos: anexar arquivos ─────────────────────────────────────
  async function handleAnexarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const jaAnexados = new Set(arquivos.map((a) => a.file.name));
    const novos: ArquivoAnexado[] = [];

    for (const file of files) {
      if (jaAnexados.has(file.name)) continue;
      let leitura: SpedLeitura;
      try {
        leitura = await lerSped(file);
      } catch (err) {
        pushToast(`${file.name}: ${err instanceof Error ? err.message : "erro ao ler"}`);
        continue;
      }

      const info = info0000(leitura.lines);
      const infoEst = info0140(leitura.lines);
      const dtIni = info?.dtIni ?? "";

      if (dtIni.length !== 8 || !/^\d+$/.test(dtIni)) {
        pushToast(`${file.name}: registro 0000 sem DT_INI válida — não dá pra saber a competência.`);
        continue;
      }

      const cnpjAtual = infoEst?.cnpj ?? "";
      const referencia = arquivos[0] ?? novos[0];
      if (referencia) {
        const cnpjRef = referencia.infoEst?.cnpj ?? "";
        if (cnpjAtual !== cnpjRef) {
          pushToast(
            `${file.name}: CNPJ (${cnpjAtual || "vazio"}) diverge dos demais arquivos anexados (${cnpjRef}).`,
          );
          continue;
        }
      }

      if ([...arquivos, ...novos].some((a) => a.info.dtIni === dtIni)) {
        pushToast(
          `${file.name}: já existe um arquivo anexado com a mesma competência (${dtIni.slice(0, 2)}/${dtIni.slice(2, 4)}/${dtIni.slice(4)}).`,
        );
        continue;
      }

      const reciboImportado = recibosImportados.get(chaveRecibo(onlyDigits(infoEst?.cnpj ?? ""), dtIni));
      novos.push({ file, leitura, info: info!, infoEst, recibo: info?.numRecAnte || reciboImportado || "" });
    }

    if (novos.length > 0) {
      const combinados = [...arquivos, ...novos].sort((a, b) => a.info.dtIni.localeCompare(b.info.dtIni));
      setArquivos(combinados);
      addLog(`${novos.length} arquivo(s) anexado(s).`, "ok");
    }
  }

  // ── Modo múltiplos: importar arquivo de recibos por competência ──────────
  async function handleImportarRecibos(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const texto = await file.text();
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);

    const mapa = new Map<string, string>();
    let ignoradas = 0;
    for (const linha of linhas) {
      const parsed = parseLinhaRecibos(linha);
      if (!parsed) {
        ignoradas++;
        continue;
      }
      mapa.set(chaveRecibo(parsed.cnpj, parsed.dtIni), parsed.recibo);
    }

    if (mapa.size === 0) {
      pushToast("Nenhum recibo válido encontrado nesse arquivo.");
      return;
    }

    setRecibosImportados((prev) => new Map([...prev, ...mapa]));

    const arquivosAtualizados = arquivos.map((a) => {
      const recibo = mapa.get(chaveRecibo(onlyDigits(a.infoEst?.cnpj ?? ""), a.info.dtIni));
      return recibo && recibo !== a.recibo ? { ...a, recibo } : a;
    });
    const aplicados = arquivosAtualizados.filter((a, i) => a.recibo !== arquivos[i].recibo).length;
    setArquivos(arquivosAtualizados);

    addLog(
      `Recibos importados: ${mapa.size} lido(s)` +
        (aplicados > 0 ? `, ${aplicados} aplicado(s) aos arquivos já anexados` : "") +
        (ignoradas > 0 ? `, ${ignoradas} linha(s) ignorada(s)` : "") +
        ". Novos arquivos anexados depois também usam esse mapeamento automaticamente.",
      "ok",
    );
  }

  function removerArquivo(fileName: string) {
    setArquivos((prev) => prev.filter((a) => a.file.name !== fileName));
  }

  function atualizarReciboArquivo(fileName: string, valor: string) {
    setArquivos((prev) => prev.map((a) => (a.file.name === fileName ? { ...a, recibo: valor } : a)));
  }

  // ── Preview multi ───────────────────────────────────────────────────────
  let previewMulti: { item: ArquivoAnexado; valorMes: Decimal; calc: CalculoResultado }[] | null = null;
  let estouroMsg: string | null = null;
  let reconciliacao: { texto: string; ok: boolean } | null = null;

  if (arquivos.length > 0 && creditoDecimal) {
    let variacao: Decimal | null = null;
    try {
      const v = parseDecimalBR(variacaoPct);
      if (v.gt(-100) && v.lt(100)) variacao = v;
    } catch {
      variacao = null;
    }
    let teto: Decimal | null = null;
    try {
      teto = tetoTrimestre.trim() ? parseDecimalBR(tetoTrimestre) : null;
    } catch {
      teto = null;
    }

    if (variacao) {
      const resultado = diferenciarCreditos(creditoDecimal, variacao, arquivos.length, teto, inverterInicial);
      if (!resultado.ok) {
        estouroMsg = `Teto estourado (${resultado.estouros
          .map((e) => `grupo ${e.grupo}: R$ ${fmtBr(e.total)}`)
          .join(", ")}). Aumente para ao menos ${resultado.qtdMesesSugerido} meses/SPEDs.`;
      } else {
        previewMulti = arquivos.map((item, i) => ({
          item,
          valorMes: resultado.valores[i],
          calc: calcular(resultado.valores[i]),
        }));
        const soma = resultado.valores.reduce((a, b) => a.plus(b), new Decimal(0));
        const dif = soma.minus(creditoDecimal);
        reconciliacao = dif.abs().lt("0.01")
          ? { texto: `Soma dos meses: R$ ${fmtBr(soma)} (bate com o crédito total)`, ok: true }
          : { texto: `Soma dos meses: R$ ${fmtBr(soma)} — diferença de R$ ${fmtBr(dif)}`, ok: false };
      }
    }
  }

  // ── Geração ──────────────────────────────────────────────────────────────
  async function handleGerarSingle() {
    if (!arquivo) {
      pushToast("Carregue um arquivo SPED primeiro.");
      return;
    }
    if (!creditoDecimal) {
      pushToast("Informe um Crédito Total válido. Exemplo: 89.198,19");
      return;
    }
    const reciboNorm = normalizarRecibo(recibo);
    if (!reciboNorm) {
      pushToast("Informe um Nº de Recibo válido (letras e números).");
      return;
    }
    const dtRaw = dtOper.length === 8 ? dtOper : "";
    if (dtRaw.length !== 8) {
      pushToast("Data da operação inválida.");
      return;
    }
    if (!nomeCta.trim()) {
      pushToast("Informe o Nome da Conta Analítica.");
      return;
    }

    setGerando(true);
    try {
      const vals = calcular(creditoDecimal);
      addLog("─".repeat(40));
      addLog(`Crédito Total : R$ ${fmtBr(creditoDecimal)}`);
      addLog(`Base de Cálc. : R$ ${fmtBr(vals.base)}`, "ok");
      addLog(`Valor PIS     : R$ ${fmtBr(vals.valorPis)}`);
      addLog(`Valor COFINS  : R$ ${fmtBr(vals.valorCofins)}`);

      const novas = buildSped({
        lines: arquivo.leitura.lines,
        recibo: reciboNorm,
        dtOper: dtRaw,
        vals,
        codPart: codPart.trim() || "001",
        codCta: codCta.trim() || "001",
        nomeCta: nomeCta.trim(),
        descOper: descOper.trim(),
        nl: arquivo.leitura.nl,
      });

      const baseNome = arquivo.file.name.replace(/\.[^.]+$/, "");
      baixarSpedUnico(novas, arquivo.leitura.encoding, arquivo.leitura.sig, `${baseNome}_retificadora.txt`);
      addLog(`Arquivo gerado: ${baseNome}_retificadora.txt (${novas.length.toLocaleString("pt-BR")} linhas)`, "ok");
      pushToast("SPED Retificadora gerada.");
    } catch (err) {
      addLog(`ERRO: ${err instanceof Error ? err.message : String(err)}`, "err");
      pushToast(err instanceof Error ? err.message : "Erro ao gerar a retificadora.");
    } finally {
      setGerando(false);
    }
  }

  async function handleGerarMulti() {
    if (arquivos.length < 2) {
      pushToast("Anexe pelo menos 2 arquivos SPED para diferenciar o crédito entre meses.");
      return;
    }
    if (!creditoDecimal) {
      pushToast("Informe um Crédito Total válido. Exemplo: 89.198,19");
      return;
    }
    let variacao: Decimal;
    try {
      variacao = parseDecimalBR(variacaoPct);
      if (!(variacao.gt(-100) && variacao.lt(100))) throw new Error();
    } catch {
      pushToast("Informe uma Variação % entre -100 e 100 (exclusivo).");
      return;
    }
    let teto: Decimal | null = null;
    try {
      teto = tetoTrimestre.trim() ? parseDecimalBR(tetoTrimestre) : null;
      if (teto && teto.lte(0)) throw new Error();
    } catch {
      pushToast("Teto por Trimestre inválido. Deixe vazio para não checar.");
      return;
    }
    if (!nomeCta.trim()) {
      pushToast("Informe o Nome da Conta Analítica.");
      return;
    }

    const recibos = new Map<string, string>();
    for (const item of arquivos) {
      const r = normalizarRecibo(item.recibo);
      if (!r) {
        pushToast(`Informe um Nº de Recibo válido (letras e números) para ${item.file.name}.`);
        return;
      }
      recibos.set(item.file.name, r);
    }

    const resultado = diferenciarCreditos(creditoDecimal, variacao, arquivos.length, teto, inverterInicial);
    if (!resultado.ok) {
      pushToast(
        `Teto por trimestre estourado. Aumente para pelo menos ${resultado.qtdMesesSugerido} meses/SPEDs.`,
      );
      return;
    }
    if (!resultado.valores.every((v) => v.gt(0))) {
      pushToast("A variação % informada faz um dos meses ficar com valor zero ou negativo. Reduza a Variação %.");
      return;
    }

    setGerando(true);
    addLog("═".repeat(40));
    addLog(`Diferenciação de crédito — ${arquivos.length} arquivo(s)`);
    addLog(`Crédito Total : R$ ${fmtBr(creditoDecimal)}   |   Variação: ${fmtBr(variacao)}%`);

    const zipEntradas: { filename: string; linhas: string[]; encoding: string; sig: Uint8Array }[] = [];
    let falhas = 0;

    for (let i = 0; i < arquivos.length; i++) {
      const item = arquivos[i];
      const valorMes = resultado.valores[i];
      try {
        const vals = calcular(valorMes);
        const dtIni = item.info.dtIni;
        const novas = buildSped({
          lines: item.leitura.lines,
          recibo: recibos.get(item.file.name)!,
          dtOper: dtIni,
          vals,
          codPart: codPart.trim() || "001",
          codCta: codCta.trim() || "001",
          nomeCta: nomeCta.trim(),
          descOper: descOper.trim(),
          nl: item.leitura.nl,
        });
        const baseNome = item.file.name.replace(/\.[^.]+$/, "");
        const competencia = `${dtIni.slice(2, 4)}-${dtIni.slice(4)}`;
        const filename = `${baseNome}_${competencia}_retificadora.txt`;
        zipEntradas.push({ filename, linhas: novas, encoding: item.leitura.encoding, sig: item.leitura.sig });
        addLog(`✔ ${item.file.name} → R$ ${fmtBr(valorMes)} → ${filename}`, "ok");
      } catch (err) {
        falhas++;
        addLog(`✘ ${item.file.name}: ERRO — ${err instanceof Error ? err.message : String(err)}`, "err");
      }
    }

    const soma = resultado.valores.reduce((a, b) => a.plus(b), new Decimal(0));
    addLog(
      `Soma dos meses: R$ ${fmtBr(soma)} (crédito total: R$ ${fmtBr(creditoDecimal)})`,
      soma.minus(creditoDecimal).abs().lt("0.01") ? "ok" : "err",
    );

    if (zipEntradas.length > 0) {
      baixarSpedsEmZip(zipEntradas, "sped_retificadoras.zip");
    }

    setGerando(false);
    if (falhas > 0) {
      pushToast(`${zipEntradas.length} de ${arquivos.length} retificadoras geradas — ${falhas} falharam.`);
    } else {
      pushToast(`${zipEntradas.length} SPED Retificadoras geradas em sped_retificadoras.zip`);
    }
  }

  const tipoBadge = (info: Info0000) => {
    const isRet = info.codFin === "1";
    return (
      <span className={`tag ${isRet ? "tag-accent" : "tag-accent-2"}`}>{isRet ? "Retificadora" : "Original"}</span>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl">SPED Retificador</h3>
          <p className="text-xs opacity-60">
            Gera SPED EFD-Contribuições retificadora com crédito PIS/COFINS extemporâneo. Todo o
            processamento acontece no seu navegador — o arquivo não é enviado ao servidor.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModoMulti(false)}
            className={`btn ${!modoMulti ? "btn-primary" : "btn-secondary"}`}
          >
            1 arquivo
          </button>
          <button
            onClick={() => setModoMulti(true)}
            className={`btn ${modoMulti ? "btn-primary" : "btn-secondary"}`}
          >
            Múltiplos SPEDs
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {/* ── Arquivo(s) ── */}
          <div className="card elev-sm">
            <div className="card-title">Arquivo{modoMulti ? "s" : ""}</div>

            {!modoMulti ? (
              <>
                <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={handleSelectFile} />
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary w-full">
                  <Upload size={14} />
                  {arquivo ? "Trocar arquivo" : "Selecionar SPED EFD-Contribuições"}
                </button>

                {arquivo && (
                  <div className="mt-3 space-y-1 rounded-[10px] bg-neutral-200 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{arquivo.info.nome || "Desconhecido"}</span>
                      {tipoBadge(arquivo.info)}
                    </div>
                    <p className="opacity-70">
                      CNPJ: {arquivo.info.cnpj} &nbsp; UF: {arquivo.info.uf} &nbsp; Layout: {arquivo.info.codVer}
                    </p>
                    <p className="opacity-70">Período: {formatarPeriodo(arquivo.info.dtIni, arquivo.info.dtFin)}</p>
                    <p className="opacity-50">{arquivo.file.name} — {arquivo.leitura.lines.length.toLocaleString("pt-BR")} linhas</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <input
                  ref={filesInputRef}
                  type="file"
                  accept=".txt"
                  multiple
                  className="hidden"
                  onChange={handleAnexarArquivos}
                />
                <input
                  ref={recibosInputRef}
                  type="file"
                  accept=".txt,.csv,.tsv"
                  className="hidden"
                  onChange={handleImportarRecibos}
                />
                <div className="flex gap-2">
                  <button onClick={() => filesInputRef.current?.click()} className="btn btn-secondary flex-1">
                    <Plus size={14} />
                    Anexar SPEDs
                  </button>
                  <button
                    onClick={() => recibosInputRef.current?.click()}
                    className="btn btn-secondary flex-1"
                    title="Arquivo com o recibo de cada competência (CNPJ, período, recibo) — preenche o campo de recibo automaticamente"
                  >
                    <Upload size={14} />
                    Importar recibos
                  </button>
                </div>

                {arquivos.length === 0 ? (
                  <p className="mt-2 text-xs opacity-50">
                    Anexe pelo menos 2 SPEDs de competências diferentes, do mesmo CNPJ.
                  </p>
                ) : (
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                    {arquivos.map((a) => (
                      <div key={a.file.name} className="rounded-[10px] bg-neutral-200 p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{a.file.name}</span>
                          <button onClick={() => removerArquivo(a.file.name)} className="flex-none opacity-50 hover:text-red-700 hover:opacity-100">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <p className="mt-0.5 opacity-60">{formatarPeriodo(a.info.dtIni, a.info.dtFin)}</p>
                        <input
                          value={a.recibo}
                          onChange={(e) => atualizarReciboArquivo(a.file.name, e.target.value)}
                          placeholder="Nº Recibo Escrituração Anterior"
                          className="input mt-1.5 py-1 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Parâmetros ── */}
          <div className="card elev-sm">
            <div className="card-title">Parâmetros</div>
            <div className="field">
              <label>Crédito Total (R$)</label>
              <input
                value={credito}
                onChange={(e) => setCredito(e.target.value)}
                placeholder="Ex: 89.198,19"
                className="input"
              />
            </div>

            {!modoMulti ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="field">
                  <label>Nº Recibo Escrituração Anterior</label>
                  <input value={recibo} onChange={(e) => setRecibo(e.target.value)} className="input" />
                </div>
                <div className="field">
                  <label>Data da Operação</label>
                  <input
                    type="date"
                    value={ddmmaaaaParaIso(dtOper)}
                    onChange={(e) => setDtOper(isoParaDdmmaaaa(e.target.value))}
                    className="input"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field">
                    <label>Variação % (diferenciação)</label>
                    <input value={variacaoPct} onChange={(e) => setVariacaoPct(e.target.value)} className="input" />
                  </div>
                  <div className="field">
                    <label>Teto por Trimestre (R$) — opcional</label>
                    <input
                      value={tetoTrimestre}
                      onChange={(e) => setTetoTrimestre(e.target.value)}
                      placeholder="Ex: 1.500.000,00"
                      className="input"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={inverterInicial}
                    onChange={(e) => setInverterInicial(e.target.checked)}
                    className="rounded border-[color:var(--color-divider)]"
                  />
                  Inverter padrão inicial (baixo/alto)
                </label>
              </>
            )}
          </div>

          {/* ── Configurações avançadas ── */}
          <div className="card elev-sm">
            <div className="card-title">Configurações avançadas</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label>Código Conta Analítica</label>
                <input value={codCta} onChange={(e) => setCodCta(e.target.value)} className="input" />
              </div>
              <div className="field">
                <label>Código Participante</label>
                <input value={codPart} onChange={(e) => setCodPart(e.target.value)} className="input" />
              </div>
            </div>
            <div className="field">
              <label>Nome Conta Analítica</label>
              <input
                list="contas-analiticas"
                value={nomeCta}
                onChange={(e) => setNomeCta(e.target.value)}
                className="input"
              />
              <datalist id="contas-analiticas">
                {CONTAS_ANALITICAS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label>Descrição do Documento/Operação (opcional)</label>
              <input value={descOper} onChange={(e) => setDescOper(e.target.value)} className="input" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* ── Resultado ── */}
          <div className="card elev-sm">
            <div className="card-title">Resultado</div>

            {!modoMulti ? (
              previewSingle ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <dt className="opacity-60">Base de Cálculo</dt>
                  <dd className="text-right font-medium">R$ {fmtBr(previewSingle.base)}</dd>
                  <dt className="opacity-60">Valor PIS (1,65%)</dt>
                  <dd className="text-right">R$ {fmtBr(previewSingle.valorPis)}</dd>
                  <dt className="opacity-60">Valor COFINS (7,60%)</dt>
                  <dd className="text-right">R$ {fmtBr(previewSingle.valorCofins)}</dd>
                </dl>
              ) : (
                <p className="text-sm opacity-50">Informe o crédito total para ver a prévia.</p>
              )
            ) : estouroMsg ? (
              <div className="flex items-center gap-2 rounded-[10px] bg-accent-100 px-3 py-2 text-sm text-accent-800">
                <AlertTriangle size={15} className="shrink-0" />
                {estouroMsg}
              </div>
            ) : previewMulti ? (
              <>
                <div className="max-h-64 overflow-y-auto rounded-[10px] border border-[color:var(--color-divider)]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--color-divider)] text-left opacity-60">
                        <th className="px-2 py-1.5 font-medium">Arquivo</th>
                        <th className="px-2 py-1.5 font-medium">Período</th>
                        <th className="px-2 py-1.5 text-right font-medium">Valor do Mês</th>
                        <th className="px-2 py-1.5 text-right font-medium">PIS</th>
                        <th className="px-2 py-1.5 text-right font-medium">COFINS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewMulti.map((p) => (
                        <tr key={p.item.file.name} className="border-b border-[color:var(--color-divider)] last:border-b-0">
                          <td className="truncate px-2 py-1.5">{p.item.file.name}</td>
                          <td className="px-2 py-1.5">{formatarPeriodo(p.item.info.dtIni, p.item.info.dtFin)}</td>
                          <td className="px-2 py-1.5 text-right">{fmtBr(p.valorMes)}</td>
                          <td className="px-2 py-1.5 text-right">{fmtBr(p.calc.valorPis)}</td>
                          <td className="px-2 py-1.5 text-right">{fmtBr(p.calc.valorCofins)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {reconciliacao && (
                  <p className={`mt-2 text-xs ${reconciliacao.ok ? "text-accent-2-700" : "text-red-700"}`}>
                    {reconciliacao.texto}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm opacity-50">Anexe os arquivos e informe o crédito total para ver a prévia.</p>
            )}
          </div>

          <button
            onClick={modoMulti ? handleGerarMulti : handleGerarSingle}
            disabled={gerando}
            className="btn btn-primary w-full"
          >
            <Check size={15} />
            {gerando
              ? "Gerando..."
              : modoMulti && arquivos.length > 1
                ? `Gerar ${arquivos.length} SPED Retificadoras`
                : "Gerar SPED Retificadora"}
          </button>

          {/* ── Log ── */}
          {log.length > 0 && (
            <div className="card elev-sm p-0">
              <div className="card-title px-3 pt-3">Log</div>
              <div className="max-h-56 overflow-y-auto px-3 pb-3 font-mono text-[11px]">
                {log.map((l) => (
                  <p
                    key={l.id}
                    className={l.tag === "err" ? "text-red-700" : l.tag === "ok" ? "text-accent-2-700" : "opacity-70"}
                  >
                    <span className="opacity-50">[{l.ts}]</span> {l.msg}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
