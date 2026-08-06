"""
Automatizador de Retificação SPED EFD-Contribuições
Aproveitamento de créditos PIS/COFINS (crédito extemporâneo)
"""
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import os
import sys
from decimal import Decimal, ROUND_HALF_UP, ROUND_CEILING, InvalidOperation


def _resource_path(relative: str) -> str:
    """Resolve caminho de recurso (ex.: ícone) tanto rodando como script
    quanto empacotado pelo PyInstaller (--onefile extrai pra pasta temp,
    exposta em sys._MEIPASS em tempo de execução)."""
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)


# ─── Constantes fiscais ───────────────────────────────────────────────────────

ALIQ_PIS    = Decimal('1.65')
ALIQ_COFINS = Decimal('7.60')
TOTAL_ALIQ  = ALIQ_PIS + ALIQ_COFINS          # 9.25

# Percentuais do crédito total
PCT_PIS    = ALIQ_PIS    / TOTAL_ALIQ          # ≈ 17.8378%
PCT_COFINS = ALIQ_COFINS / TOTAL_ALIQ          # ≈ 82.1622%

DOIS = Decimal('0.01')
QUATRO = Decimal('0.0001')

# Diferenciação de crédito entre múltiplos meses/SPEDs
VARIACAO_PADRAO       = Decimal('12.30')
TETO_TRIMESTRE_PADRAO = Decimal('1500000.00')


# ─── Cálculos ─────────────────────────────────────────────────────────────────

def calcular(credito_total: Decimal) -> dict:
    base      = (credito_total / TOTAL_ALIQ * 100).quantize(DOIS, ROUND_HALF_UP)
    valor_pis = (base * ALIQ_PIS / 100).quantize(DOIS, ROUND_HALF_UP)
    # COFINS como resíduo (não base*aliq arredondado independente) para que
    # valor_pis + valor_cofins bata exatamente com o crédito total digitado,
    # em vez de divergir 1 centavo por arredondamento duplo (base já
    # arredondada, depois pis e cofins arredondados de novo a partir dela).
    valor_cofins = (credito_total - valor_pis).quantize(DOIS, ROUND_HALF_UP)
    return {"base": base, "valor_pis": valor_pis, "valor_cofins": valor_cofins}


# ─── Diferenciação entre múltiplos meses/SPEDs ───────────────────────────────
# Porta a lógica de _Calculo_Diferenciacao.py (Streamlit, calcular_distribui-
# cao_completa / calcular_multiplos_meses), trocando float/round por Decimal.

def _diferenciar_grupo(total_grupo: Decimal, variacao_pct: Decimal,
                        inverter: bool, qtd_meses: int) -> list[Decimal]:
    """Distribui total_grupo em 2 ou 3 meses alternando padrão baixo/alto.
    O último mês sempre absorve o resíduo do arredondamento."""
    divisor = Decimal(qtd_meses)
    base_media = (total_grupo / divisor).quantize(DOIS, ROUND_HALF_UP)
    valor_variacao = (base_media * variacao_pct / 100).quantize(DOIS, ROUND_HALF_UP)

    if qtd_meses == 3:
        m1 = base_media
        m2 = (base_media + valor_variacao) if inverter else (base_media - valor_variacao)
        m3 = total_grupo - (m1 + m2)
        return [m1, m2, m3]
    else:
        m1 = (base_media + valor_variacao) if inverter else (base_media - valor_variacao)
        m2 = total_grupo - m1
        return [m1, m2]


def diferenciar_creditos(valor_total: Decimal, variacao_pct: Decimal,
                          qtd_meses_total: int,
                          teto_trimestre: Decimal | None = None,
                          inverter_inicial: bool = False) -> dict:
    """Agrupa qtd_meses_total em blocos de até 3 (só o último grupo pode ter
    tamanho 1 ou 2), distribui valor_total proporcionalmente entre grupos
    (o último grupo absorve o resíduo do arredondamento), bloqueia se
    teto_trimestre for informado e algum grupo estourar, e diferencia cada
    grupo de 2-3 meses alternando o padrão baixo/alto a cada grupo. Um grupo
    de 1 mês (resto não-múltiplo-de-3) não diferencia e não consome uma
    alternância — replica a referência, onde esse caso pula direto pro
    próximo grupo antes de inverter o padrão.

    Retorna {'ok': False, 'estouros': [(nº_grupo, total)], 'qtd_meses_sugerido': int}
    ou {'ok': True, 'valores': list[Decimal], 'grupos': [...], 'totais_grupos': [...]}.
    """
    grupos = []
    restante = qtd_meses_total
    while restante > 0:
        tamanho = 3 if restante >= 3 else restante
        grupos.append(tamanho)
        restante -= tamanho

    # Sem o que segue, todo grupo completo de 3 meses recebia exatamente
    # valor_total*3/n e saía com o MESMO total — só o mês dentro do grupo
    # variava. Diferenciamos os trimestres cheios entre si; o grupo residual
    # (sobra de 1 ou 2 meses não-múltiplo-de-3, quando existe) fica de FORA
    # dessa diferenciação e mantém sua fatia proporcional simples — do
    # contrário o excedente somado aos trimestres cheios "vazaria" pra esse
    # grupo pequeno no final, podendo deixá-lo negativo.
    n = Decimal(qtd_meses_total)
    tem_residual_pequeno = grupos[-1] < 3
    qtd_trimestres_cheios = len(grupos) - 1 if tem_residual_pequeno else len(grupos)

    if tem_residual_pequeno:
        tamanho_residual = grupos[-1]
        valor_residual = (valor_total * Decimal(tamanho_residual) / n).quantize(DOIS, ROUND_HALF_UP)
        valor_trimestres = valor_total - valor_residual
    else:
        valor_residual = None
        valor_trimestres = valor_total

    totais_trimestres = []
    if qtd_trimestres_cheios > 0:
        acumulado = Decimal('0')
        parte_base = (valor_trimestres / Decimal(qtd_trimestres_cheios)).quantize(DOIS, ROUND_HALF_UP)
        # fator_k tem sinal fixo (não alterna) e cada trimestre usa
        # razao**i, estritamente decrescente em módulo: os totais ficam
        # monótonos entre si (sempre > ou sempre < parte_base) e o último
        # (que absorve o resíduo do arredondamento) fica sempre do lado
        # oposto — geometricamente impossível dois totais colidirem. Uma
        # progressão que alterna sinal (ex.: +K, -K, +K...) pode cancelar as
        # somas parciais e produzir um resíduo idêntico a um grupo anterior;
        # sinal fixo + módulo estritamente decrescente elimina esse caso.
        # amplitude != 1 evita outro caso degenerado: com só 2 trimestres,
        # delta = parte_base*K faz o mês "alto" de um coincidir com o "baixo"
        # do outro (identidade algébrica quando o deslocamento entre
        # trimestres iguala a variação usada dentro do trimestre).
        # abs(fator_k) é limitado a 8% independente da Variação % pedida
        # pelo usuário (que pode chegar a quase 100% e é aplicada à parte de
        # dentro do trimestre) — sem o limite, muitos trimestres cheios em
        # sequência (créditos de vários anos) poderiam esgotar o último
        # trimestre da diferenciação e ele ficar negativo. O produto
        # fator_k*amplitude (~9,2% no pior caso, com a Variação % padrão de
        # 12,30%) é o quanto o maior trimestre pode ficar ACIMA da média
        # proporcional pura — mantido bem abaixo da folga típica de um Teto
        # por Trimestre configurado com margem razoável sobre essa média
        # (ex.: o teto padrão da aplicação, R$ 1.500.000, costuma sobrar
        # ~15-20% sobre a média em créditos usuais). Um valor maior (ex.: os
        # 20% testados antes) estourava tetos configurados com folga normal
        # mesmo quando a divisão proporcional pura caberia tranquila.
        sinal_grupos = Decimal('-1') if inverter_inicial else Decimal('1')
        fator_k = min(abs(variacao_pct) / 100, Decimal('0.08')) * (
            Decimal('-1') if variacao_pct < 0 else Decimal('1')) * sinal_grupos
        amplitude = Decimal('1.15')
        razao = Decimal('0.6')
        for i in range(qtd_trimestres_cheios):
            if i < qtd_trimestres_cheios - 1:
                # -0.01*i garante passo mínimo de 1 centavo entre trimestres
                # consecutivos mesmo quando i cresce muito (créditos de vários
                # anos): sozinho, razao**i decai geometricamente e, a partir
                # de um certo i, a diferença entre dois trimestres fica menor
                # que a resolução de centavos e o arredondamento colide os
                # dois totais. O termo linear domina nesse regime e mantém a
                # sequência estritamente decrescente (a prova de que nenhum
                # total colide depende só disso, não da forma exata do decaimento).
                delta = (parte_base * fator_k * amplitude * (razao ** i)
                         - Decimal('0.01') * i).quantize(DOIS, ROUND_HALF_UP)
                parte = parte_base + delta
                totais_trimestres.append(parte)
                acumulado += parte
            else:
                totais_trimestres.append((valor_trimestres - acumulado).quantize(DOIS, ROUND_HALF_UP))

        if qtd_trimestres_cheios == 1 and tem_residual_pequeno:
            # Com 1 só trimestre não há contra quem se diferenciar (o laço
            # acima nunca roda o ramo "if", então ele fica com a fatia
            # proporcional pura). O resíduo também é proporcional puro. Os
            # dois, divididos pelo próprio tamanho, dão exatamente o mesmo
            # valor_total/n — colidindo o valor interno de ambos (ex.: 4 ou 5
            # meses no total). Transfere uma fração do menor pro outro.
            menor = min(totais_trimestres[0], valor_residual)
            delta_k1 = (menor * fator_k).quantize(DOIS, ROUND_HALF_UP)
            totais_trimestres[0] += delta_k1
            valor_residual -= delta_k1

    totais_grupos = totais_trimestres + ([valor_residual] if tem_residual_pequeno else [])

    if teto_trimestre is not None:
        estouros = [(i + 1, t) for i, t in enumerate(totais_grupos) if t > teto_trimestre]
        if estouros:
            # A diferenciação entre trimestres infla o maior grupo até ~20%
            # acima da fatia proporcional pura — uma conta direta
            # (valor_total/teto) ignora essa inflação e podia sugerir um nº
            # de meses que, na prática, ainda estourava. Simula de verdade,
            # aumentando de 3 em 3 meses, até achar um total que realmente
            # não estoura.
            candidato = int(
                (valor_total / teto_trimestre).to_integral_value(rounding=ROUND_CEILING)) * 3
            limite = candidato + 300  # salvaguarda contra loop sem fim
            while candidato <= limite:
                sim = diferenciar_creditos(valor_total, variacao_pct, candidato,
                                            None, inverter_inicial)
                if all(t <= teto_trimestre for t in sim['totais_grupos']):
                    break
                candidato += 3
            return {
                'ok': False,
                'estouros': estouros,
                'qtd_meses_sugerido': candidato,
            }

    valores_mensais = []
    inverter = inverter_inicial
    for tamanho, total_grupo in zip(grupos, totais_grupos):
        if tamanho == 1:
            valores_mensais.append(total_grupo)
            continue
        valores_mensais.extend(_diferenciar_grupo(total_grupo, variacao_pct, inverter, tamanho))
        inverter = not inverter

    return {'ok': True, 'valores': valores_mensais, 'grupos': grupos, 'totais_grupos': totais_grupos}


def parse_decimal(s: str) -> Decimal:
    """Converte texto digitado pelo usuário em Decimal.

    Aceita o formato BR completo (1.234,56), só vírgula (1234,56) e também
    ponto como decimal isolado (1234.56 ou 1234.5, comum ao colar de
    planilhas/relatórios em locale en-US) — nesse último caso o ponto NÃO
    pode ser tratado como separador de milhar, senão o valor fica inflado
    10x/100x silenciosamente.
    """
    s = s.strip().replace(' ', '')
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif '.' in s:
        partes = s.split('.')
        if len(partes) > 2 or len(partes[-1]) > 2:
            # múltiplos pontos, ou >2 casas após o único ponto: milhar
            s = s.replace('.', '')
        # ponto único com 1-2 casas: já é separador decimal, mantém como está
    return Decimal(s)


def fmt_br(v: Decimal) -> str:
    """Formata Decimal para exibição BR: 1.234,56"""
    s = f"{v:,.2f}"
    return s.replace(',', 'X').replace('.', ',').replace('X', '.')


def fmt_sped(v: Decimal, dec: int = 2) -> str:
    """Formata Decimal para o TXT do SPED: VÍRGULA como separador decimal."""
    return f"{v:.{dec}f}".replace('.', ',')


def fmt_sped4(v: Decimal) -> str:
    return fmt_sped(v, 4)


def fmt_aliq(v: Decimal) -> str:
    """Alíquota com zeros à direita removidos (ex: 1,65 e 7,6)."""
    s = fmt_sped(v, 4)
    if ',' in s:
        i, f = s.split(',', 1)
        f = f.rstrip('0') or '0'
        return f'{i},{f}'
    return s


# ─── Parser SPED ──────────────────────────────────────────────────────────────

def ler_sped(path: str) -> tuple[list[str], str, str, bytes]:
    """Retorna (linhas_texto, encoding, terminador, assinatura_binaria).

    Arquivos transmitidos à Receita Federal contêm uma assinatura digital
    binária após o último registro |9999|. Separamos o bloco binário e o
    devolvemos intacto para ser reescrito no final sem modificação.
    """
    with open(path, 'rb') as f:
        raw_bytes = f.read()

    # Localiza fim do bloco de texto: última ocorrência de |9999|
    # O registro 9999 termina com \r\n ou \n
    for term in (b'\r\n', b'\n'):
        marker = b'|9999|'
        pos = raw_bytes.rfind(marker)
        if pos != -1:
            end = raw_bytes.find(term, pos)
            if end != -1:
                text_bytes = raw_bytes[: end + len(term)]
                sig_bytes  = raw_bytes[end + len(term):]
                nl = '\r\n' if term == b'\r\n' else '\n'
                break
    else:
        # Sem 9999 ou sem terminador — trata tudo como texto
        text_bytes = raw_bytes
        sig_bytes  = b''
        nl = '\r\n'

    # Detecta encoding do bloco de texto. latin-1 nunca lança
    # UnicodeDecodeError (mapeia todo byte 0-255), então precisa vir por
    # último — senão cp1252 nunca seria tentado (mojibake em 0x80-0x9F:
    # aspas curvas, travessão, etc. de arquivos gerados no Windows).
    for enc in ('utf-8-sig', 'utf-8', 'cp1252', 'latin-1'):
        try:
            text = text_bytes.decode(enc)
            lines = text.splitlines(keepends=True)
            return lines, enc, nl, sig_bytes
        except (UnicodeDecodeError, ValueError):
            continue

    raise ValueError("Não foi possível decodificar o arquivo SPED.")


def campos(linha: str) -> list[str]:
    return linha.rstrip('\n\r').split('|')


def reg(linha: str) -> str:
    f = campos(linha)
    return f[1] if len(f) > 1 else ''


def info_0000(lines: list[str]) -> dict:
    # Layout 006: |0000|COD_VER|COD_FIN|IND_SIT_ESP|NUM_REC_ANTE|DT_INI|DT_FIN|NOME|CNPJ|...|
    #  índices:      1      2       3        4            5          6      7     8    9
    for line in lines:
        f = campos(line)
        if len(f) > 1 and f[1] == '0000':
            return {
                'cod_ver':      f[2]  if len(f) > 2  else '',
                'cod_fin':      f[3]  if len(f) > 3  else '',
                'ind_sit_esp':  f[4]  if len(f) > 4  else '',
                'num_rec_ante': f[5]  if len(f) > 5  else '',
                'dt_ini':       f[6]  if len(f) > 6  else '',
                'dt_fin':       f[7]  if len(f) > 7  else '',
                'nome':         f[8]  if len(f) > 8  else '',
                'cnpj':         f[9]  if len(f) > 9  else '',
                'uf':           f[10] if len(f) > 10 else '',
                'cod_mun':      f[11] if len(f) > 11 else '',
                'ind_nat_pj':   f[13] if len(f) > 13 else '',
                'ind_ativ':     f[14] if len(f) > 14 else '',
            }
    return {}


def dt_ini_sped(lines: list[str]) -> str:
    info = info_0000(lines)
    return info.get('dt_ini', '')


def conta_existe(lines: list[str], cod_cta: str) -> bool:
    for line in lines:
        f = campos(line)
        if len(f) > 1 and f[1] == '0500' and len(f) > 6 and f[6] == cod_cta:
            return True
    return False


def participante_existe(lines: list[str], cod_part: str) -> bool:
    for line in lines:
        f = campos(line)
        if len(f) > 2 and f[1] == '0150' and f[2] == cod_part:
            return True
    return False


def f010_existe(lines: list[str], cnpj: str) -> bool:
    """Checa se já existe |F010|CNPJ| no arquivo."""
    prefixo = f'|F010|{cnpj}|'
    return any(l.startswith(prefixo) for l in lines)


def parse_sped(s: str) -> Decimal:
    """Converte campo monetário SPED (vírgula) em Decimal. O leiaute oficial
    nunca usa separador de milhar nesses campos, mas removê-lo aqui protege
    contra arquivos de emissores não conformes que o incluem por engano."""
    s = (s or '').strip()
    if not s:
        return Decimal('0')
    return Decimal(s.replace('.', '').replace(',', '.'))


def achar_m100(lines: list[str], reg_pai: str, cod_cred: str,
                aliq_esperada: Decimal | None = None) -> int | None:
    """Acha índice de |M100|cod_cred| ou |M500|cod_cred| cuja ALIQ_PIS/
    ALIQ_COFINS (campo 5) bata com aliq_esperada. Se a empresa tiver 2
    registros M100 (ou M500) com o mesmo cod_cred (ex.: dois "101", um a
    1,65%/7,60% e outro em alíquota diferenciada/reduzida), sem o filtro por
    alíquota o M105/M505 poderia ser anexado no registro errado. Se
    aliq_esperada for None, ignora o filtro (compatibilidade). None se não
    existe correspondência."""
    prefixo = f'|{reg_pai}|{cod_cred}|'
    for i, line in enumerate(lines):
        if not line.startswith(prefixo):
            continue
        if aliq_esperada is None:
            return i
        f = campos(line)
        if len(f) > 5:
            try:
                if parse_sped(f[5]) == aliq_esperada:
                    return i
            except InvalidOperation:
                continue
    return None


def achar_m105_13_53(lines: list[str], idx_pai: int, reg_filho: str) -> int | None:
    """Procura M105|13|53 (ou M505|13|53) filho do M100 em idx_pai.
    Limite: até próximo M100/M500 ou registro fora do bloco M1xx/M5xx."""
    n = len(lines)
    for j in range(idx_pai + 1, n):
        if lines[j].startswith(f'|{reg_filho}|13|53|'):
            return j
        r_j = reg(lines[j])
        if r_j in ('M100', 'M500'):
            break
        if r_j and not (r_j.startswith('M1') or r_j.startswith('M5')):
            break
    return None


def achar_1100_201(lines: list[str], reg_pai: str) -> int | None:
    """Acha índice de |1100|...|201| ou |1500|...|201| (COD_CRED no campo 5)."""
    for i, line in enumerate(lines):
        f = campos(line)
        if len(f) > 5 and f[1] == reg_pai and f[5] == '201':
            return i
    return None


def pos_inserir_block1(lines: list[str], target_code: str) -> int | None:
    """Retorna idx antes do qual inserir nova linha de bloco 1 (mantém ordem
    numérica). target_code = '1100' ou '1500'."""
    for i, line in enumerate(lines):
        f = campos(line)
        if len(f) > 1 and len(f[1]) == 4 and f[1][0] == '1' and f[1] > target_code:
            return i
    return None


def fim_grupo_m100(lines: list[str], idx_pai: int, reg_filho: str) -> int:
    """Retorna idx da última linha pertencente ao grupo do M100/M500
    (último M105/M505 ou o próprio M100 se não houver filhos)."""
    n = len(lines)
    ultima = idx_pai
    for j in range(idx_pai + 1, n):
        r_j = reg(lines[j])
        if r_j == reg_filho:
            ultima = j
        elif r_j in ('M100', 'M500'):
            break
        elif r_j and not (r_j.startswith('M1') or r_j.startswith('M5')):
            break
    return ultima


def info_0140(lines: list[str]) -> dict:
    """Retorna dados do estabelecimento (registro 0140)."""
    for line in lines:
        f = campos(line)
        if len(f) > 1 and f[1] == '0140':
            return {
                'cod_est': f[2] if len(f) > 2 else '',
                'nome':    f[3] if len(f) > 3 else '',
                'cnpj':    f[4] if len(f) > 4 else '',
                'uf':      f[5] if len(f) > 5 else '',
                'cod_mun': f[7] if len(f) > 7 else '',
            }
    return {}


# ─── Gerador de registros SPED ────────────────────────────────────────────────

def linha_0150(cod_part: str, nome: str, cnpj: str, cod_mun: str) -> str:
    """0150 - Cadastro do participante (próprio CNPJ no caso de retificação)."""
    return f'|0150|{cod_part}|{nome}|1058|{cnpj}|||{cod_mun}||||||\n'


def linha_0500(dt_alt: str, cod_cta: str, nome_cta: str) -> str:
    return f'|0500|{dt_alt}|01|A|5|{cod_cta}|{nome_cta}|||\n'


def linha_f100(dt_oper: str, base: Decimal, vl_pis: Decimal, vl_cofins: Decimal,
               cod_part: str, cod_cta: str, desc: str) -> str:
    """F100 — 19 campos."""
    b  = fmt_sped(base)
    ap = fmt_aliq(ALIQ_PIS)
    ac = fmt_aliq(ALIQ_COFINS)
    vp = fmt_sped(vl_pis)
    vc = fmt_sped(vl_cofins)
    return (
        f'|F100|0|{cod_part}||{dt_oper}|{b}'
        f'|53|{b}|{ap}|{vp}'
        f'|53|{b}|{ac}|{vc}'
        f'|13|0|{cod_cta}||{desc}|\n'
    )


# ─── M100 / M105 (PIS) ────────────────────────────────────────────────────────

def linha_m100_101() -> str:
    """M100 tipo 101 — placeholder zerado (regime regular sem crédito no período)."""
    return f'|M100|101|0|0|{fmt_aliq(ALIQ_PIS)}|||0|0|0|0|0|0|0|0|\n'


def linha_m105_101(base: Decimal) -> str:
    """M105 do M100|101 — base total declarada, mas VL_BC_PIS=0 (nada alocado)."""
    b = fmt_sped(base)
    return f'|M105|13|53|{b}|0|{b}|0|||RECUPERACAO DE CREDITOS TRIBUTARIOS|\n'


def linha_m100_201(base: Decimal, vl_pis: Decimal) -> str:
    """M100 tipo 201 — crédito vinculado a receita não tributada."""
    b  = fmt_sped(base)
    vp = fmt_sped(vl_pis)
    return (
        f'|M100|201|0|{b}|{fmt_aliq(ALIQ_PIS)}|||'
        f'{vp}|0|0|0|{vp}|1|0|{vp}|\n'
    )


def linha_m105_201(base: Decimal) -> str:
    """M105 do M100|201 — todo o valor da base alocado ao tipo 201."""
    b = fmt_sped(base)
    return f'|M105|13|53|{b}|0|{b}|{b}|||RECUPERACAO DE CREDITOS TRIBUTARIOS|\n'


# ─── M500 / M505 (COFINS) ────────────────────────────────────────────────────

def linha_m500_101() -> str:
    return f'|M500|101|0|0|{fmt_aliq(ALIQ_COFINS)}|||0|0|0|0|0|0|0|0|\n'


def linha_m505_101(base: Decimal) -> str:
    b = fmt_sped(base)
    return f'|M505|13|53|{b}|0|{b}|0|||RECUPERACAO DE CREDITOS TRIBUTARIOS|\n'


def linha_m500_201(base: Decimal, vl_cofins: Decimal) -> str:
    b  = fmt_sped(base)
    vc = fmt_sped(vl_cofins)
    return (
        f'|M500|201|0|{b}|{fmt_aliq(ALIQ_COFINS)}|||'
        f'{vc}|0|0|0|{vc}|1|0|{vc}|\n'
    )


def linha_m505_201(base: Decimal) -> str:
    b = fmt_sped(base)
    return f'|M505|13|53|{b}|0|{b}|{b}|||RECUPERACAO DE CREDITOS TRIBUTARIOS|\n'


# ─── 1100 / 1500 (Controle de Créditos Fiscais) ───────────────────────────────

def linha_1100_201(per: str, vl_cred: Decimal) -> str:
    """1100 PIS - Controle de Créditos Fiscais (cod 201). 18 campos.
    ORIG_CRED='01' (crédito apurado no próprio período de apuração) — código
    de 2 dígitos, conforme registros 1100 reais já existentes nos SPEDs do
    usuário (ex.: |1100|052025|01||101|...). PER_APU_CRED é MMAAAA, sem
    barra — o validador da Receita rejeita "MM/AAAA" (tamanho e conteúdo)."""
    v = fmt_sped(vl_cred)
    return (
        f'|1100|{per}|01||201|{v}|0|{v}|0|0|0|{v}|0|0|0|0|0|{v}|\n'
    )


def linha_1500_201(per: str, vl_cred: Decimal) -> str:
    """1500 COFINS - Controle de Créditos Fiscais (cod 201). 18 campos.
    ORIG_CRED='01' (ver linha_1100_201)."""
    v = fmt_sped(vl_cred)
    return (
        f'|1500|{per}|01||201|{v}|0|{v}|0|0|0|{v}|0|0|0|0|0|{v}|\n'
    )


# ─── Montagem do novo SPED ────────────────────────────────────────────────────

def _normaliza(line: str, nl: str) -> str:
    return line.rstrip('\r\n') + nl


def _pad_campos(f: list[str], idx_max: int) -> list[str]:
    """Garante que os índices 0..idx_max sejam válidos em f (o maior índice
    que o chamador vai LER/ESCREVER), preenchendo com '0' os campos ausentes.
    Necessário porque registros M100/M500/1100/1500 de SPEDs gerados sob
    versões de layout mais antigas (COD_VER anterior) podem ter menos campos
    opcionais no final do que a versão atual do leiaute.

    Reserva um elemento vazio logo APÓS idx_max (representa o '|' de
    fechamento da linha) para que, ao reatribuir f[idx_max], a linha
    reconstruída com '|'.join(f) continue terminando em '|' — sem essa
    reserva, sobrescrever o último elemento da lista apagaria o pipe final."""
    necessario = idx_max + 2
    if len(f) >= necessario:
        return f
    faltam = necessario - len(f)
    if f and f[-1] == '':
        return f[:-1] + ['0'] * faltam + ['']
    return f + ['0'] * faltam


def _somar_m100(line: str, vl_base: Decimal, vl_cred: Decimal, nl: str) -> str:
    """Soma valores em registro M100/M500 existente.
    Campos: 4=VL_BC_CRED, 8=VL_CRED, 12=VL_CRED_DISP, 15=SLD_CRED."""
    f = _pad_campos(campos(line), 15)
    f[4]  = fmt_sped(parse_sped(f[4])  + vl_base)
    f[8]  = fmt_sped(parse_sped(f[8])  + vl_cred)
    f[12] = fmt_sped(parse_sped(f[12]) + vl_cred)
    f[15] = fmt_sped(parse_sped(f[15]) + vl_cred)
    return _normaliza('|'.join(f), nl)


def _somar_1100(line: str, vl_cred_add: Decimal, nl: str) -> str:
    """Soma vl_cred_add em campos de 1100/1500: 6 VL_CRED_APU, 8 VL_TOT_CRED_APU,
    12 SD_CRED_DISP, 18 SLD_CRED_FIM."""
    f = _pad_campos(campos(line), 18)
    f[6]  = fmt_sped(parse_sped(f[6])  + vl_cred_add)
    f[8]  = fmt_sped(parse_sped(f[8])  + vl_cred_add)
    f[12] = fmt_sped(parse_sped(f[12]) + vl_cred_add)
    f[18] = fmt_sped(parse_sped(f[18]) + vl_cred_add)
    return _normaliza('|'.join(f), nl)


def _somar_m105(line: str, vl_tot_add: Decimal, vl_bc_add: Decimal, nl: str) -> str:
    """Soma em M105/M505: 4=VL_BC_TOT, 6=VL_BC_NC, 7=VL_BC.
    vl_tot_add soma em TOT/NC; vl_bc_add soma em VL_BC (porção do tipo)."""
    f = _pad_campos(campos(line), 7)
    f[4] = fmt_sped(parse_sped(f[4]) + vl_tot_add)
    f[6] = fmt_sped(parse_sped(f[6]) + vl_tot_add)
    f[7] = fmt_sped(parse_sped(f[7]) + vl_bc_add)
    return _normaliza('|'.join(f), nl)


def _recalc_blocos(out: list[str], nl: str) -> list[str]:
    """Recalcula contagens de fechamento de bloco (X990) e 9999, e
    insere entradas |9900| faltantes para tipos de registro novos.
    """
    # ── 1ª passada: tipos existentes em 9900 ─────────────────────────────────
    tipos_em_9900: set[str] = set()
    for line in out:
        f = campos(line)
        if len(f) > 2 and f[1] == '9900':
            tipos_em_9900.add(f[2])

    # ── Insere |9900|TIPO|QTD| antes do |9990| para tipos novos ──────────────
    contagem_pre: dict[str, int] = {}
    for line in out:
        r = reg(line)
        if r:
            contagem_pre[r] = contagem_pre.get(r, 0) + 1

    novos_tipos = sorted(set(contagem_pre) - tipos_em_9900)

    if novos_tipos:
        out2 = []
        for line in out:
            if reg(line) == '9990':
                for t in novos_tipos:
                    out2.append(_normaliza(f'|9900|{t}|{contagem_pre[t]}|', nl))
            out2.append(line)
        out = out2

    # ── 2ª passada: contagens finais ─────────────────────────────────────────
    contagem: dict[str, int] = {}
    bloco_qtd: dict[str, int] = {}
    for line in out:
        r = reg(line)
        if r:
            contagem[r] = contagem.get(r, 0) + 1
            bloco_qtd[r[0]] = bloco_qtd.get(r[0], 0) + 1

    result = []
    for line in out:
        f = campos(line)
        r = f[1] if len(f) > 1 else ''

        # X990 — fechamento de bloco
        if len(r) == 4 and r.endswith('990') and len(f) > 2:
            f[2] = str(bloco_qtd.get(r[0], int(f[2] or 0)))
            result.append(_normaliza('|'.join(f), nl))
            continue

        # 9900 — contagem por tipo de registro
        if r == '9900' and len(f) > 3:
            tipo = f[2]
            f[3] = str(contagem.get(tipo, int(f[3] or 0)))
            result.append(_normaliza('|'.join(f), nl))
            continue

        # 9999 — total do arquivo
        if r == '9999' and len(f) > 2:
            f[2] = str(len(out))
            result.append(_normaliza('|'.join(f), nl))
            continue

        result.append(line)

    return result


def build_sped(lines: list[str], recibo: str, dt_oper: str,
               vals: dict, cod_part: str, cod_cta: str,
               nome_cta: str, desc_oper: str,
               nl: str = '\r\n') -> list[str]:

    base      = vals['base']
    vl_pis    = vals['valor_pis']
    vl_cofins = vals['valor_cofins']

    info_est_pre   = info_0140(lines)
    if not info_est_pre:
        raise ValueError(
            'Registro 0140 (Cadastro do Estabelecimento) não encontrado no '
            'SPED carregado — não é possível gerar a retificadora sem o '
            'CNPJ/nome do estabelecimento.')
    cnpj_est_pre   = info_est_pre.get('cnpj', '')

    nova_0500      = not conta_existe(lines, cod_cta)
    novo_0150      = not participante_existe(lines, cod_part)
    novo_f010      = not f010_existe(lines, cnpj_est_pre)
    adicionou_f100 = False
    adicionou_m100 = False
    adicionou_m500 = False

    # Registros que marcam saída do grupo de F100 do estabelecimento (devemos
    # inserir antes deles). F111/F120/F129/F130/F139/F140/F150 NÃO entram aqui:
    # são registros-filho de um F100 já existente (vínculo posicional pai-filho),
    # não marcadores de fim do grupo — inseri-los ali quebraria essa vinculação.
    F_SAIR_GRUPO = {'F010','F200','F500','F510','F525','F550','F560','F600','F700','F800','F990'}
    dentro_f010_nosso = False

    # ── Planejamento M100/M500 ──────────────────────────────────────────────
    # Regras:
    #  - Se M100|TIPO existe → soma base (+vl_cred p/ 201) nele.
    #      - Se filho M105|13|53 existe → soma valores.
    #      - Se não existe → insere novo M105|13|53 ao fim do grupo do M100.
    #  - Se M100|TIPO não existe → insere bloco completo antes de M200/M600.

    substituir: dict[int, str] = {}                    # idx → linha somada
    inserir_apos: dict[int, list[str]] = {}            # idx → linhas após
    inserir_antes: dict[int, list[str]] = {}           # idx → linhas antes

    # (reg_pai, cod, vl_base_m100, vl_cred_m100, vl_base_m105, soma_vl_bc_m105)
    # Regra 101: NÃO soma base nem crédito em M100/M500. Só detalha em M105/M505
    #            (TOT/NC recebem base; VL_BC fica 0).
    # Regra 201: soma base e crédito em M100/M500. M105/M505 soma tudo (inclui VL_BC).
    Z = Decimal('0')
    plano = [
        ('M100', '101', Z,    Z,        base, False),
        ('M100', '201', base, vl_pis,   base, True),
        ('M500', '101', Z,    Z,        base, False),
        ('M500', '201', base, vl_cofins, base, True),
    ]

    # Flags pra inserção antes de M200/M600 (TIPO não existia)
    inserir_m100_101 = inserir_m100_201 = False
    inserir_m500_101 = inserir_m500_201 = False

    aliq_esperada_por_reg = {'M100': ALIQ_PIS, 'M500': ALIQ_COFINS}

    for reg_pai, cod, vl_b_m100, vl_c_m100, vl_b_m105, soma_bc in plano:
        reg_filho = 'M105' if reg_pai == 'M100' else 'M505'
        idx_pai = achar_m100(lines, reg_pai, cod, aliq_esperada_por_reg[reg_pai])

        if idx_pai is None:
            # Tipo ausente (101 ou 201) → insere bloco completo (M100/M500 +
            # M105/M505) antes de M200/M600. Sem isso, quando a empresa não
            # tinha NENHUM crédito não-cumulativo antes da retificação
            # (bloco M vazio: M001/M200/M600/M990), só o 201 era inserido —
            # o 101 (placeholder zerado, regime regular) ficava de fora,
            # mesmo com linha_m100_101/linha_m105_101 prontas pra isso.
            if   reg_pai == 'M100' and cod == '101': inserir_m100_101 = True
            elif reg_pai == 'M100' and cod == '201': inserir_m100_201 = True
            elif reg_pai == 'M500' and cod == '101': inserir_m500_101 = True
            elif reg_pai == 'M500' and cod == '201': inserir_m500_201 = True
            continue

        # M100|TIPO existe → só soma na linha se vl_b_m100 ou vl_c_m100 > 0
        if vl_b_m100 > 0 or vl_c_m100 > 0:
            substituir[idx_pai] = _somar_m100(lines[idx_pai], vl_b_m100, vl_c_m100, nl)

        # Procura filho M105|13|53|
        idx_filho = achar_m105_13_53(lines, idx_pai, reg_filho)
        bc_add = vl_b_m105 if soma_bc else Decimal('0')
        if idx_filho is not None:
            substituir[idx_filho] = _somar_m105(lines[idx_filho], vl_b_m105, bc_add, nl)
        else:
            # Inserir novo M105|13|53 após o último filho (ou após próprio M100)
            idx_apos = fim_grupo_m100(lines, idx_pai, reg_filho)
            if reg_pai == 'M100':
                nova = linha_m105_201(vl_b_m105) if soma_bc else linha_m105_101(vl_b_m105)
            else:
                nova = linha_m505_201(vl_b_m105) if soma_bc else linha_m505_101(vl_b_m105)
            inserir_apos.setdefault(idx_apos, []).append(_normaliza(nova, nl))

    # ── 1100 (PIS) e 1500 (COFINS) - Controle de Créditos Fiscais ────────────
    # PER_APU_CRED = MMAAAA extraído da DT_OPER (DDMMAAAA) — SEM barra:
    # registros 1100/1500 reais usam "052025", não "05/2025" (o validador da
    # Receita rejeita a barra por tamanho/conteúdo de campo inválido).
    per_apu = dt_oper[2:4] + dt_oper[4:] if len(dt_oper) == 8 else ''

    for reg_pai, vl_cred, fn_nova in [
        ('1100', vl_pis,    linha_1100_201),
        ('1500', vl_cofins, linha_1500_201),
    ]:
        idx = achar_1100_201(lines, reg_pai)
        if idx is not None:
            # Já existe 1100/1500 com COD_CRED=201 → soma
            substituir[idx] = _somar_1100(lines[idx], vl_cred, nl)
        else:
            pos = pos_inserir_block1(lines, reg_pai)
            if pos is not None:
                inserir_antes.setdefault(pos, []).append(
                    _normaliza(fn_nova(per_apu, vl_cred), nl))
    dt_alt = '01012020'   # data de inclusão da conta no plano (convenção SPED)

    info_est = info_0140(lines)
    cnpj_est = info_est.get('cnpj', '')
    nome_est = info_est.get('nome', '')
    mun_est  = info_est.get('cod_mun', '')

    out = []

    for idx, line in enumerate(lines):
        r = reg(line)
        # Inserções ANTES desta linha (ex: 1100/1500 antes de 1990)
        if idx in inserir_antes:
            out.extend(inserir_antes[idx])
        # Se essa linha está marcada pra substituir, troca pela versão somada
        if idx in substituir:
            out.append(substituir[idx])
            # Insere extras logo após (ex: novo M105|13|53)
            if idx in inserir_apos:
                out.extend(inserir_apos[idx])
            continue

        # ── 0000: marcar retificadora ────────────────────────────────────────
        if r == '0000':
            f = campos(line)
            if len(f) > 5:
                f[3] = '1'     # COD_FIN = retificadora
                f[5] = recibo  # NUM_REC_ANTE
            out.append(_normaliza('|'.join(f), nl))
            continue

        # ── inserir 0150 antes do primeiro registro > 0150 do bloco 0 ───────
        if novo_0150 and r in ('0190','0200','0205','0206','0208',
                               '0300','0400','0450','0500','0600','0900','0990'):
            out.append(_normaliza(
                linha_0150(cod_part, nome_est, cnpj_est, mun_est), nl))
            novo_0150 = False

        # ── inserir 0500 antes de 0990 ───────────────────────────────────────
        if r == '0990' and nova_0500:
            out.append(_normaliza(linha_0500(dt_alt, cod_cta, nome_cta), nl))
            nova_0500 = False

        # ── F001: se estava fechado (IND_MOV=1), abrir ───────────────────────
        if r == 'F001':
            f = campos(line)
            if len(f) > 2 and f[2] == '1':
                f[2] = '0'
            out.append(_normaliza('|'.join(f), nl))
            continue

        # ── 1001: idem F001 (bloco 1 vai receber 1100/1500) ──────────────────
        if r == '1001':
            f = campos(line)
            if len(f) > 2 and f[2] == '1':
                f[2] = '0'
            out.append(_normaliza('|'.join(f), nl))
            continue

        # ── M001: idem F001/1001 (bloco M vai receber M100/M105 e/ou M500/M505) ──
        if r == 'M001':
            f = campos(line)
            if len(f) > 2 and f[2] == '1':
                f[2] = '0'
            out.append(_normaliza('|'.join(f), nl))
            continue

        # ── Inserir F100 no lugar certo do bloco F ───────────────────────────
        # Casos: a) dentro do nosso F010 e chegou em F111/F120.../F150/F200/F990
        #        b) sem F010 e bloco F vai fechar (F990) → cria F010+F100
        if not adicionou_f100:
            if dentro_f010_nosso and r in F_SAIR_GRUPO:
                out.append(_normaliza(
                    linha_f100(dt_oper, base, vl_pis, vl_cofins,
                               cod_part, cod_cta, desc_oper), nl))
                adicionou_f100 = True
            elif (not dentro_f010_nosso) and r == 'F990':
                if novo_f010:
                    out.append(_normaliza(f'|F010|{cnpj_est}|', nl))
                out.append(_normaliza(
                    linha_f100(dt_oper, base, vl_pis, vl_cofins,
                               cod_part, cod_cta, desc_oper), nl))
                adicionou_f100 = True

        # Atualiza estado de "dentro do nosso F010" ANTES de processar próxima
        if r == 'F010':
            f = campos(line)
            dentro_f010_nosso = (len(f) > 2 and f[2] == cnpj_est)

        # ── M100/M105 antes M200. Insere só TIPOs sem par existente. Se o
        # bloco M estava vazio (empresa sem crédito não-cumulativo antes da
        # retificação: M001 IND_MOV=1, sem M200), insere antes de M990 ──────
        if (r == 'M200' or r == 'M990') and not adicionou_m100:
            if inserir_m100_101:
                out.append(_normaliza(linha_m100_101(), nl))
                out.append(_normaliza(linha_m105_101(base), nl))
            if inserir_m100_201:
                out.append(_normaliza(linha_m100_201(base, vl_pis), nl))
                out.append(_normaliza(linha_m105_201(base), nl))
            adicionou_m100 = True

        # ── M500/M505 antes M600. Mesma regra, com o mesmo fallback em M990 ──
        if (r == 'M600' or r == 'M990') and not adicionou_m500:
            if inserir_m500_101:
                out.append(_normaliza(linha_m500_101(), nl))
                out.append(_normaliza(linha_m505_101(base), nl))
            if inserir_m500_201:
                out.append(_normaliza(linha_m500_201(base, vl_cofins), nl))
                out.append(_normaliza(linha_m505_201(base), nl))
            adicionou_m500 = True

        out.append(_normaliza(line, nl))
        # Insere extras após linha não substituída (ex: M105 novo após M105 antigo)
        if idx in inserir_apos:
            out.extend(inserir_apos[idx])

    return _recalc_blocos(out, nl)


# ─── Paleta de cores ──────────────────────────────────────────────────────────

C = {
    'bg':        '#EEF2F7',
    'card':      '#FFFFFF',
    'header_dk': '#0D2137',
    'header_md': '#163353',
    'accent':    '#1558D6',
    'accent_h':  '#0E46B0',
    'success':   '#15803D',
    'danger':    '#DC2626',
    'text':      '#0F172A',
    'muted':     '#64748B',
    'border':    '#CBD5E1',
    'input_bg':  '#F8FAFC',
    'pis':       '#1D4ED8',
    'cofins':    '#6D28D9',
    'tag_ok':    '#DCFCE7',
    'tag_ok_fg': '#166534',
    'tag_er':    '#FEE2E2',
    'tag_er_fg': '#991B1B',
    'log_bg':    '#0D1117',
    'log_fg':    '#C9D1D9',
    'log_ts':    '#3FB950',
    'divider':   '#E2E8F0',
}

CONTAS_ANALITICAS = [
    'ADICAO DE CREDITOS REFERENTE A EXCLUSAO DO ICMS DA BASE DE CALCULO DO PIS E DA COFINS',
    'ADICAO DE CREDITOS TRIBUTARIOS EMPRESA NAO CUMULATIVA',
    'LEI 192 DE 11 DE MARÇO 2022',
    'CREDITO DE PA ANTERIORES NAO APROPRIADOS ACORDAO 9303009893',
    'RECUPERACAO DE CREDITOS TRIBUTARIOS',
    'PIS COFINS TRIBUTAÇÃO INDEVIDA',
    'HABILITAÇÃO DE CRÉDITOS CÓDIGO 99',
    'CREDITO PRESUMIDO DE ESTOQUE',
]


F = {
    'title':    ('Segoe UI', 15, 'bold'),
    'subtitle': ('Segoe UI', 9),
    'h2':       ('Segoe UI', 10, 'bold'),
    'h3':       ('Segoe UI', 9, 'bold'),
    'body':     ('Segoe UI', 9),
    'small':    ('Segoe UI', 8),
    'mono':     ('Consolas', 9),
    'big':      ('Segoe UI', 22, 'bold'),
    'med':      ('Segoe UI', 13, 'bold'),
    'label':    ('Segoe UI', 9),
    'btn':      ('Segoe UI', 10, 'bold'),
}


# ─── Widgets helpers ──────────────────────────────────────────────────────────

def card(parent, title: str = '', **kw) -> tk.Frame:
    """Cria um card branco com borda sutil e título opcional."""
    outer = tk.Frame(parent, bg=C['border'], bd=0)
    outer.pack(fill=tk.X, padx=12, pady=5)
    inner = tk.Frame(outer, bg=C['card'], bd=0)
    inner.pack(fill=tk.X, padx=1, pady=1)
    if title:
        hdr = tk.Frame(inner, bg=C['card'])
        hdr.pack(fill=tk.X, padx=14, pady=(10, 0))
        tk.Label(hdr, text=title, font=F['h2'],
                 bg=C['card'], fg=C['text']).pack(side=tk.LEFT)
    body = tk.Frame(inner, bg=C['card'])
    body.pack(fill=tk.X, padx=14, pady=(6, 12))
    return body


def divider(parent):
    tk.Frame(parent, bg=C['divider'], height=1).pack(fill=tk.X, padx=14, pady=4)


def label_input(parent, text: str, var: tk.Variable,
                width: int = 28, trace=None) -> tk.Entry:
    row = tk.Frame(parent, bg=C['card'])
    row.pack(fill=tk.X, pady=3)
    tk.Label(row, text=text, font=F['label'], bg=C['card'],
             fg=C['muted'], width=32, anchor='w').pack(side=tk.LEFT)
    e = tk.Entry(row, textvariable=var, width=width,
                 font=F['body'], bg=C['input_bg'],
                 fg=C['text'], relief=tk.FLAT,
                 highlightthickness=1,
                 highlightbackground=C['border'],
                 highlightcolor=C['accent'],
                 insertbackground=C['accent'])
    e.pack(side=tk.LEFT, ipady=4, ipadx=4)
    if trace:
        var.trace_add('write', trace)
    return e


def badge(parent, text: str, ok: bool = True) -> tk.Label:
    bg = C['tag_ok'] if ok else C['tag_er']
    fg = C['tag_ok_fg'] if ok else C['tag_er_fg']
    lbl = tk.Label(parent, text=text, font=F['small'],
                   bg=bg, fg=fg, padx=6, pady=2, relief=tk.FLAT)
    lbl.pack(side=tk.LEFT, padx=(6, 0))
    return lbl


def btn_primary(parent, text: str, command, width: int = 28) -> tk.Button:
    b = tk.Button(parent, text=text, command=command,
                  font=F['btn'], bg=C['accent'], fg='#FFFFFF',
                  activebackground=C['accent_h'], activeforeground='#FFFFFF',
                  relief=tk.FLAT, bd=0, padx=20, pady=10,
                  cursor='hand2', width=width)
    b.bind('<Enter>', lambda _: b.config(bg=C['accent_h']))
    b.bind('<Leave>', lambda _: b.config(bg=C['accent']))
    return b


def resultado_card(parent, label: str, valor_var: tk.StringVar,
                   aliq: str, pct: str, cor: str) -> tk.Frame:
    frm = tk.Frame(parent, bg=C['card'])
    frm.pack(fill=tk.X, pady=4)

    top = tk.Frame(frm, bg=C['card'])
    top.pack(fill=tk.X)
    tk.Label(top, text=label, font=F['h3'], bg=C['card'],
             fg=C['muted']).pack(side=tk.LEFT)
    tk.Label(top, text=f"Alíquota {aliq}  •  {pct} do crédito",
             font=F['small'], bg=C['card'], fg=C['muted']).pack(side=tk.RIGHT)

    tk.Label(frm, textvariable=valor_var, font=F['med'],
             bg=C['card'], fg=cor, anchor='w').pack(fill=tk.X, pady=(2, 0))

    tk.Frame(frm, bg=cor, height=2).pack(fill=tk.X, pady=(3, 0))
    return frm


# ─── Interface gráfica ────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("SPED EFD-Contribuições — Retificadora")
        try:
            self.iconbitmap(_resource_path('icone.ico'))
        except tk.TclError:
            pass  # ambiente sem suporte a .ico — segue sem ícone de janela
        self.configure(bg=C['bg'])
        self.resizable(True, True)
        self.minsize(860, 720)
        self.geometry('920x820')

        self.sped_lines:    list[str] = []
        self.sped_path:     str = ''
        self.sped_encoding: str = 'latin-1'
        self.sped_nl:       str = '\r\n'
        self.sped_sig:      bytes = b''

        # Variáveis de exibição dos resultados (lado direito)
        self.v_base      = tk.StringVar(value='—')
        self.v_val_pis   = tk.StringVar(value='—')
        self.v_val_cof   = tk.StringVar(value='—')
        self.v_status    = tk.StringVar(value='Nenhum arquivo carregado')

        # ── Modo múltiplos SPEDs (diferenciação de crédito entre meses) ──────
        self.arquivos: list[dict] = []
        self.v_modo_multi       = tk.BooleanVar(value=False)
        self.v_variacao_pct     = tk.StringVar(value=fmt_br(VARIACAO_PADRAO))
        self.v_teto_trimestre   = tk.StringVar(value=fmt_br(TETO_TRIMESTRE_PADRAO))
        self.v_inverter_inicial = tk.BooleanVar(value=False)
        self.v_qtd_arquivos     = tk.StringVar(value='Nenhum arquivo anexado')

        self._build_ui()

    # ─────────────────────────────────────────────────────────────────────────

    def _build_ui(self):
        self._build_header()

        # ── Status bar fixa no fundo ─────────────────────────────────────────
        self._build_statusbar()

        # ── Action bar fixa logo acima da status ─────────────────────────────
        action = tk.Frame(self, bg=C['card'], height=70,
                          highlightthickness=1, highlightbackground=C['border'])
        action.pack(side=tk.BOTTOM, fill=tk.X)
        action.pack_propagate(False)
        self.btn_gerar = btn_primary(action, '  Gerar SPED Retificadora  ',
                                     self._on_gerar_click, width=32)
        self.btn_gerar.pack(side=tk.RIGHT, padx=14, pady=14)

        # ── Área rolável (preenche o meio) ───────────────────────────────────
        canvas = tk.Canvas(self, bg=C['bg'], bd=0, highlightthickness=0)
        sb = tk.Scrollbar(self, orient='vertical', command=canvas.yview)
        canvas.configure(yscrollcommand=sb.set)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.scroll_frame = tk.Frame(canvas, bg=C['bg'])
        win_id = canvas.create_window((0, 0), window=self.scroll_frame,
                                      anchor='nw')

        def _resize(e):
            canvas.itemconfig(win_id, width=e.width)
        def _scroll(e):
            canvas.configure(scrollregion=canvas.bbox('all'))

        canvas.bind('<Configure>', _resize)
        self.scroll_frame.bind('<Configure>', _scroll)
        canvas.bind_all('<MouseWheel>',
                        lambda e: canvas.yview_scroll(-1 * (e.delta // 120), 'units'))

        root = self.scroll_frame

        # ── Linha 1: Arquivo ─────────────────────────────────────────────────
        self._build_card_arquivo(root)

        # ── Linha 2: duas colunas ─────────────────────────────────────────────
        cols = tk.Frame(root, bg=C['bg'])
        cols.pack(fill=tk.X, padx=12, pady=5)
        cols.columnconfigure(0, weight=3)
        cols.columnconfigure(1, weight=2)

        left  = tk.Frame(cols, bg=C['bg'])
        right = tk.Frame(cols, bg=C['bg'])
        left.grid(row=0, column=0, sticky='nsew', padx=(0, 5))
        right.grid(row=0, column=1, sticky='nsew')

        self._build_card_params(left)
        self._build_card_resultado(right)

        # ── Log ───────────────────────────────────────────────────────────────
        self._build_card_log(root)

    # ─────────────────────────────────────────────────────────────────────────

    def _build_header(self):
        hdr = tk.Frame(self, bg=C['header_dk'], height=68)
        hdr.pack(fill=tk.X)
        hdr.pack_propagate(False)

        left = tk.Frame(hdr, bg=C['header_dk'])
        left.pack(side=tk.LEFT, padx=18, pady=10)

        tk.Label(left, text='SPED EFD-Contribuições', font=F['title'],
                 bg=C['header_dk'], fg='#FFFFFF').pack(anchor='w')
        tk.Label(left,
                 text='Reserva Fiscal  •  Retificadora PIS / COFINS  •  por Clailton Junior',
                 font=F['subtitle'], bg=C['header_dk'], fg='#94A3B8').pack(anchor='w')

        badge_frm = tk.Frame(hdr, bg=C['header_dk'])
        badge_frm.pack(side=tk.RIGHT, padx=18)
        tk.Label(badge_frm, text='v 1.0', font=F['small'],
                 bg=C['header_md'], fg='#94A3B8',
                 padx=8, pady=4).pack()

    def _build_statusbar(self):
        bar = tk.Frame(self, bg=C['header_md'], height=26)
        bar.pack(fill=tk.X, side=tk.BOTTOM)
        bar.pack_propagate(False)
        self._dot = tk.Label(bar, text='●', font=F['small'],
                             bg=C['header_md'], fg='#94A3B8')
        self._dot.pack(side=tk.LEFT, padx=(10, 2))
        tk.Label(bar, textvariable=self.v_status, font=F['small'],
                 bg=C['header_md'], fg='#94A3B8').pack(side=tk.LEFT)
        # Crédito autoria
        tk.Label(bar,
                 text='Reserva Fiscal  •  por Clailton Junior',
                 font=F['small'], bg=C['header_md'], fg='#94A3B8'
                 ).pack(side=tk.RIGHT, padx=10)

    # ─────────────────────────────────────────────────────────────────────────

    def _build_card_arquivo(self, root):
        body = card(root, '📂  Arquivo SPED (TXT)')

        row_modo = tk.Frame(body, bg=C['card'])
        row_modo.pack(fill=tk.X, pady=(0, 6))
        ttk.Checkbutton(row_modo,
                        text='Diferenciar entre múltiplos SPEDs (anexar vários arquivos)',
                        variable=self.v_modo_multi,
                        command=self._on_toggle_modo_multi).pack(side=tk.LEFT)

        # ── Modo simples: 1 arquivo (comportamento original, intocado) ───────
        self.frame_arquivo_single = tk.Frame(body, bg=C['card'])
        self.frame_arquivo_single.pack(fill=tk.X)

        row_file = tk.Frame(self.frame_arquivo_single, bg=C['card'])
        row_file.pack(fill=tk.X)

        self.v_arq = tk.StringVar()
        e = tk.Entry(row_file, textvariable=self.v_arq, font=F['mono'],
                     bg=C['input_bg'], fg=C['text'], relief=tk.FLAT,
                     highlightthickness=1,
                     highlightbackground=C['border'],
                     highlightcolor=C['accent'])
        e.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=5, ipadx=4)

        tk.Button(row_file, text='Selecionar…', command=self._sel_arq,
                  font=F['body'], bg=C['input_bg'], fg=C['accent'],
                  relief=tk.FLAT, highlightthickness=1,
                  highlightbackground=C['border'],
                  cursor='hand2', padx=10, pady=5).pack(side=tk.LEFT, padx=(6, 0))

        tk.Button(row_file, text='Carregar ▶', command=self._carregar,
                  font=F['h3'], bg=C['accent'], fg='#FFF',
                  activebackground=C['accent_h'], activeforeground='#FFF',
                  relief=tk.FLAT, bd=0, cursor='hand2',
                  padx=12, pady=5).pack(side=tk.LEFT, padx=(6, 0))

        divider(self.frame_arquivo_single)

        # Painel de informações
        info_frm = tk.Frame(self.frame_arquivo_single, bg='#F0F6FF',
                            highlightthickness=1,
                            highlightbackground='#BFDBFE')
        info_frm.pack(fill=tk.X, pady=(2, 0))

        self.lbl_empresa  = tk.Label(info_frm, text='Nenhum arquivo carregado.',
                                     font=F['h3'], bg='#F0F6FF', fg=C['muted'],
                                     anchor='w', padx=10, pady=4)
        self.lbl_empresa.pack(fill=tk.X)

        details = tk.Frame(info_frm, bg='#F0F6FF')
        details.pack(fill=tk.X, padx=10, pady=(0, 6))

        self.lbl_cnpj    = tk.Label(details, text='', font=F['body'],
                                    bg='#F0F6FF', fg=C['muted'], anchor='w')
        self.lbl_cnpj.pack(side=tk.LEFT)
        self.lbl_periodo = tk.Label(details, text='', font=F['body'],
                                    bg='#F0F6FF', fg=C['muted'], anchor='w')
        self.lbl_periodo.pack(side=tk.LEFT, padx=(20, 0))
        self.lbl_tipo_badge = tk.Label(details, text='', font=F['small'],
                                       bg='#F0F6FF', fg=C['muted'])
        self.lbl_tipo_badge.pack(side=tk.LEFT, padx=(12, 0))

        # ── Modo múltiplos SPEDs (não packed por padrão) ──────────────────────
        self.frame_arquivo_multi = tk.Frame(body, bg=C['card'])

        row_sel_multi = tk.Frame(self.frame_arquivo_multi, bg=C['card'])
        row_sel_multi.pack(fill=tk.X)
        tk.Button(row_sel_multi, text='Selecionar arquivos…', command=self._sel_arqs,
                  font=F['body'], bg=C['input_bg'], fg=C['accent'],
                  relief=tk.FLAT, highlightthickness=1,
                  highlightbackground=C['border'],
                  cursor='hand2', padx=10, pady=5).pack(side=tk.LEFT)
        tk.Label(row_sel_multi, textvariable=self.v_qtd_arquivos, font=F['body'],
                 bg=C['card'], fg=C['muted']).pack(side=tk.LEFT, padx=(12, 0))

        divider(self.frame_arquivo_multi)

        self.frame_lista_arquivos = tk.Frame(self.frame_arquivo_multi, bg=C['card'])
        self.frame_lista_arquivos.pack(fill=tk.X, pady=(2, 0))

    def _build_card_params(self, parent):
        outer = tk.Frame(parent, bg=C['border'], bd=0)
        outer.pack(fill=tk.X)
        inner = tk.Frame(outer, bg=C['card'], bd=0)
        inner.pack(fill=tk.X, padx=1, pady=1)

        hdr = tk.Frame(inner, bg=C['card'])
        hdr.pack(fill=tk.X, padx=14, pady=(10, 0))
        tk.Label(hdr, text='⚙  Parâmetros', font=F['h2'],
                 bg=C['card'], fg=C['text']).pack(side=tk.LEFT)

        body = tk.Frame(inner, bg=C['card'])
        body.pack(fill=tk.X, padx=14, pady=(6, 12))

        self.v_credito   = tk.StringVar()
        self.v_recibo    = tk.StringVar()
        self.v_dt_oper   = tk.StringVar()

        # Campo crédito com destaque
        frm_cred = tk.Frame(body, bg=C['card'])
        frm_cred.pack(fill=tk.X, pady=3)
        tk.Label(frm_cred, text='Crédito Total (R$)', font=F['h3'],
                 bg=C['card'], fg=C['text']).pack(anchor='w')
        e_cred = tk.Entry(frm_cred, textvariable=self.v_credito,
                          font=('Segoe UI', 14, 'bold'),
                          bg='#EFF6FF', fg=C['accent'],
                          relief=tk.FLAT, highlightthickness=2,
                          highlightbackground=C['accent'],
                          highlightcolor=C['accent'],
                          insertbackground=C['accent'])
        e_cred.pack(fill=tk.X, ipady=7, ipadx=6, pady=(3, 0))
        self.v_credito.trace_add('write', self._atualizar_preview)

        divider(inner)

        # Demais campos — modo simples (1 arquivo): Recibo/Data manuais
        self.frame_params_single = tk.Frame(body, bg=C['card'])
        self.frame_params_single.pack(fill=tk.X)
        label_input(self.frame_params_single, 'Nº Recibo Escrituração Anterior', self.v_recibo, 30)
        label_input(self.frame_params_single, 'Data da Operação (DD/MM/AAAA)',   self.v_dt_oper, 14)

        # Demais campos — modo múltiplos SPEDs: Variação/Teto (Recibo passa a
        # ser por arquivo, na lista do card Arquivo; Data da Operação é
        # derivada automaticamente do DT_INI de cada arquivo)
        self.frame_params_multi = tk.Frame(body, bg=C['card'])
        label_input(self.frame_params_multi, 'Variação % (diferenciação)', self.v_variacao_pct, 10)
        label_input(self.frame_params_multi, 'Teto por Trimestre (R$) — opcional', self.v_teto_trimestre, 16)
        ttk.Checkbutton(self.frame_params_multi, text='Inverter padrão inicial (baixo/alto)',
                        variable=self.v_inverter_inicial,
                        command=self._atualizar_preview_multi).pack(anchor='w', pady=(2, 0))
        self.v_variacao_pct.trace_add('write', self._atualizar_preview_multi)
        self.v_teto_trimestre.trace_add('write', self._atualizar_preview_multi)

        # Seção avançada
        tk.Frame(body, bg=C['divider'], height=1).pack(fill=tk.X, pady=(8, 0))
        tk.Label(body, text='CONFIGURAÇÕES AVANÇADAS', font=F['small'],
                 bg=C['card'], fg=C['muted']).pack(anchor='w', pady=(4, 0))

        self.v_cod_cta   = tk.StringVar(value='001')
        self.v_nome_cta  = tk.StringVar(
            value='LANCAMENTO DE CREDITO EXTEMPORANEO ACORDAO 9303009893')
        self.v_cod_part  = tk.StringVar(value='001')
        self.v_desc_oper = tk.StringVar()

        label_input(body, 'Código Conta Analítica',           self.v_cod_cta,  8)

        # Combobox: Nome Conta Analítica (lista pré-definida, editável)
        row_nc = tk.Frame(body, bg=C['card'])
        row_nc.pack(fill=tk.X, pady=3)
        tk.Label(row_nc, text='Nome Conta Analítica', font=F['label'],
                 bg=C['card'], fg=C['muted'], width=32, anchor='w').pack(side=tk.LEFT)
        cb = ttk.Combobox(row_nc, textvariable=self.v_nome_cta,
                          values=CONTAS_ANALITICAS, width=60, font=F['body'])
        cb.pack(side=tk.LEFT, ipady=2)


        label_input(body, 'Código Participante',              self.v_cod_part, 8)
        label_input(body, 'Descrição do Documento/Operação (opcional)', self.v_desc_oper, 34)

    def _build_card_resultado(self, parent):
        outer = tk.Frame(parent, bg=C['border'], bd=0)
        outer.pack(fill=tk.BOTH, expand=True)
        inner = tk.Frame(outer, bg=C['card'], bd=0)
        inner.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)

        hdr = tk.Frame(inner, bg=C['card'])
        hdr.pack(fill=tk.X, padx=14, pady=(10, 0))
        tk.Label(hdr, text='📊  Resultado', font=F['h2'],
                 bg=C['card'], fg=C['text']).pack(side=tk.LEFT)

        body = tk.Frame(inner, bg=C['card'])
        body.pack(fill=tk.BOTH, expand=True, padx=14, pady=(6, 12))

        # ── Modo simples: 1 arquivo (comportamento original, intocado) ───────
        self.frame_resultado_single = tk.Frame(body, bg=C['card'])
        self.frame_resultado_single.pack(fill=tk.BOTH, expand=True)

        # Base de cálculo (destaque)
        tk.Label(self.frame_resultado_single, text='Base de Cálculo', font=F['h3'],
                 bg=C['card'], fg=C['muted']).pack(anchor='w')
        tk.Label(self.frame_resultado_single, textvariable=self.v_base,
                 font=F['big'], bg=C['card'], fg=C['text'],
                 anchor='w').pack(fill=tk.X)
        tk.Frame(self.frame_resultado_single, bg=C['border'], height=1).pack(fill=tk.X, pady=(2, 10))

        # PIS
        resultado_card(self.frame_resultado_single,
                       label='PIS / Pasep',
                       valor_var=self.v_val_pis,
                       aliq='1,65%',
                       pct='17,8378%',
                       cor=C['pis'])

        tk.Frame(self.frame_resultado_single, bg=C['divider'], height=1).pack(fill=tk.X, pady=6)

        # COFINS
        resultado_card(self.frame_resultado_single,
                       label='COFINS',
                       valor_var=self.v_val_cof,
                       aliq='7,60%',
                       pct='82,1622%',
                       cor=C['cofins'])

        tk.Frame(self.frame_resultado_single, bg=C['divider'], height=1).pack(fill=tk.X, pady=(10, 4))

        # Registros que serão gerados
        tk.Label(self.frame_resultado_single, text='REGISTROS GERADOS', font=F['small'],
                 bg=C['card'], fg=C['muted']).pack(anchor='w', pady=(2, 4))
        for reg_txt, descr in [
            ('0000', 'Marcado como Retificadora'),
            ('0500', 'Conta analítica de crédito'),
            ('F100', 'Lançamento de crédito (entrada)'),
            ('M100 + M105', 'Crédito PIS — base e detalhamento'),
            ('M500 + M505', 'Crédito COFINS — base e detalhamento'),
        ]:
            row = tk.Frame(self.frame_resultado_single, bg=C['card'])
            row.pack(fill=tk.X, pady=1)
            tk.Label(row, text=reg_txt, font=F['mono'],
                     bg='#F0F4FF', fg=C['accent'],
                     padx=6, pady=2, width=12, anchor='w').pack(side=tk.LEFT)
            tk.Label(row, text=descr, font=F['small'],
                     bg=C['card'], fg=C['muted'], anchor='w').pack(
                         side=tk.LEFT, padx=6)

        # ── Modo múltiplos SPEDs (não packed por padrão) ──────────────────────
        self.frame_resultado_multi = tk.Frame(body, bg=C['card'])

        tk.Label(self.frame_resultado_multi, text='DIFERENCIAÇÃO POR MÊS/SPED', font=F['small'],
                 bg=C['card'], fg=C['muted']).pack(anchor='w', pady=(0, 4))

        cols = ('arquivo', 'periodo', 'mes', 'base', 'pis', 'cofins')
        self.tv_preview = ttk.Treeview(self.frame_resultado_multi, columns=cols,
                                       show='headings', height=8)
        titulos = {'arquivo': 'Arquivo', 'periodo': 'Período', 'mes': 'Valor do Mês',
                   'base': 'Base', 'pis': 'PIS', 'cofins': 'COFINS'}
        for c in cols:
            self.tv_preview.heading(c, text=titulos[c])
            self.tv_preview.column(c, width=90, anchor='center')
        self.tv_preview.column('arquivo', width=140, anchor='w')
        self.tv_preview.pack(fill=tk.BOTH, expand=True)

        self.lbl_reconciliacao = tk.Label(self.frame_resultado_multi, text='',
                                          font=F['small'], bg=C['card'], fg=C['muted'],
                                          anchor='w', justify=tk.LEFT, wraplength=280)
        self.lbl_reconciliacao.pack(fill=tk.X, pady=(6, 0))

    def _build_card_log(self, root):
        outer = tk.Frame(root, bg=C['border'], bd=0)
        outer.pack(fill=tk.X, padx=12, pady=5)
        inner = tk.Frame(outer, bg=C['card'], bd=0)
        inner.pack(fill=tk.X, padx=1, pady=1)

        hdr = tk.Frame(inner, bg=C['card'])
        hdr.pack(fill=tk.X, padx=14, pady=(8, 0))
        tk.Label(hdr, text='🖥  Log de operações', font=F['h2'],
                 bg=C['card'], fg=C['text']).pack(side=tk.LEFT)
        tk.Button(hdr, text='Limpar', font=F['small'],
                  bg=C['card'], fg=C['muted'],
                  relief=tk.FLAT, bd=0, cursor='hand2',
                  command=self._limpar_log).pack(side=tk.RIGHT)

        log_outer = tk.Frame(inner, bg=C['log_bg'])
        log_outer.pack(fill=tk.X, padx=14, pady=(4, 12))

        self.txt_log = scrolledtext.ScrolledText(
            log_outer, height=6, state=tk.DISABLED,
            bg=C['log_bg'], fg=C['log_fg'],
            font=F['mono'], relief=tk.FLAT,
            insertbackground=C['log_fg'],
            selectbackground=C['accent'])
        self.txt_log.tag_configure('ts',  foreground=C['log_ts'])
        self.txt_log.tag_configure('err', foreground='#FF7B72')
        self.txt_log.tag_configure('ok',  foreground='#7EE787')
        self.txt_log.pack(fill=tk.X, padx=1, pady=1)

    # ─────────────────────────────────────────────────────────────────────────

    def _on_toggle_modo_multi(self):
        multi = self.v_modo_multi.get()
        if multi:
            self.frame_arquivo_single.pack_forget()
            self.frame_arquivo_multi.pack(fill=tk.X)
            self.frame_params_single.pack_forget()
            self.frame_params_multi.pack(fill=tk.X)
            self.frame_resultado_single.pack_forget()
            self.frame_resultado_multi.pack(fill=tk.BOTH, expand=True)
        else:
            self.frame_arquivo_multi.pack_forget()
            self.frame_arquivo_single.pack(fill=tk.X)
            self.frame_params_multi.pack_forget()
            self.frame_params_single.pack(fill=tk.X)
            self.frame_resultado_multi.pack_forget()
            self.frame_resultado_single.pack(fill=tk.BOTH, expand=True)
        self._atualizar_texto_botao_gerar()
        if multi:
            self._atualizar_preview_multi()

    def _atualizar_texto_botao_gerar(self):
        n = len(self.arquivos)
        if self.v_modo_multi.get() and n > 1:
            self.btn_gerar.config(text=f'  Gerar {n} SPED Retificadoras  ')
        else:
            self.btn_gerar.config(text='  Gerar SPED Retificadora  ')

    def _on_gerar_click(self):
        if self.v_modo_multi.get():
            self._gerar_multi()
        else:
            self._gerar()

    def _sel_arq(self):
        p = filedialog.askopenfilename(
            title='Selecionar SPED EFD-Contribuições',
            filetypes=[('Arquivo TXT', '*.txt'), ('Todos', '*.*')])
        if p:
            self.v_arq.set(p)

    def _carregar(self):
        path = self.v_arq.get().strip()
        if not path or not os.path.exists(path):
            messagebox.showerror('Erro', 'Arquivo não encontrado.')
            return
        try:
            self.sped_lines, self.sped_encoding, self.sped_nl, self.sped_sig = ler_sped(path)
            self.sped_path = path
        except Exception as e:
            messagebox.showerror('Erro ao ler', str(e))
            return

        info = info_0000(self.sped_lines)
        tipo = 'Retificadora' if info.get('cod_fin') == '1' else 'Original'
        is_ret = info.get('cod_fin') == '1'

        # Pré-preencher campos
        if info.get('dt_ini') and not self.v_dt_oper.get():
            d = info['dt_ini']
            self.v_dt_oper.set(f"{d[:2]}/{d[2:4]}/{d[4:]}")
        if info.get('num_rec_ante') and not self.v_recibo.get():
            self.v_recibo.set(info['num_rec_ante'])

        # Atualizar painel de info
        empresa = info.get('nome', 'Desconhecido')
        cnpj    = info.get('cnpj', '')
        uf      = info.get('uf', '')
        dt_i    = info.get('dt_ini', '')
        dt_f    = info.get('dt_fin', '')
        layout  = info.get('cod_ver', '')

        self.lbl_empresa.config(text=empresa, fg=C['text'])
        self.lbl_cnpj.config(
            text=f"CNPJ: {cnpj}   UF: {uf}   Layout: {layout}")
        self.lbl_periodo.config(text=f"Período: {dt_i[:2]}/{dt_i[2:4]}/{dt_i[4:]} → "
                                     f"{dt_f[:2]}/{dt_f[2:4]}/{dt_f[4:]}")
        self.lbl_tipo_badge.config(
            text=f' {tipo} ',
            bg=C['tag_er'] if is_ret else C['tag_ok'],
            fg=C['tag_er_fg'] if is_ret else C['tag_ok_fg'])

        n = len(self.sped_lines)
        self._set_status(f'Carregado: {os.path.basename(path)}  ({n:,} linhas)', ok=True)
        self._log(f'Arquivo carregado: {path}', tag='ok')
        self._log(f'Empresa: {empresa}  |  CNPJ: {cnpj}  |  Período: {dt_i}–{dt_f}')

        n_0140 = sum(1 for l in self.sped_lines if l.startswith('|0140|'))
        if n_0140 > 1:
            self._log(
                f'AVISO: arquivo tem {n_0140} estabelecimentos (registros 0140). '
                f'Esta ferramenta sempre usa o CNPJ do PRIMEIRO 0140 do arquivo '
                f'para gerar 0150/F010 — confira se é o estabelecimento correto '
                f'antes de gerar a retificadora.', tag='err')

    # ── Modo múltiplos SPEDs ──────────────────────────────────────────────────

    def _sel_arqs(self):
        paths = filedialog.askopenfilenames(
            title='Selecionar arquivos SPED EFD-Contribuições',
            filetypes=[('Arquivo TXT', '*.txt'), ('Todos', '*.*')])
        if paths:
            self._anexar_arquivos(paths)

    def _anexar_arquivos(self, paths):
        ja_anexados = {a['path'] for a in self.arquivos}
        for path in paths:
            if path in ja_anexados:
                continue
            try:
                lines, encoding, nl, sig = ler_sped(path)
            except Exception as e:
                messagebox.showerror('Erro ao ler', f'{os.path.basename(path)}: {e}')
                continue

            info = info_0000(lines)
            info_est = info_0140(lines)
            dt_ini = info.get('dt_ini', '')
            nome_arq = os.path.basename(path)

            if len(dt_ini) != 8 or not dt_ini.isdigit():
                messagebox.showerror(
                    'Erro',
                    f'{nome_arq}: registro 0000 sem DT_INI válida — não é '
                    f'possível determinar a competência deste arquivo.')
                continue

            cnpj_atual = info_est.get('cnpj', '')
            if self.arquivos:
                cnpj_ref = self.arquivos[0]['info_est'].get('cnpj', '')
                if cnpj_atual != cnpj_ref:
                    messagebox.showerror(
                        'Erro',
                        f'{nome_arq}: CNPJ do estabelecimento ({cnpj_atual or "vazio"}) '
                        f'diverge dos demais arquivos já anexados ({cnpj_ref}). '
                        f'Não é possível diferenciar crédito entre empresas diferentes.')
                    continue

            if any(a['info'].get('dt_ini') == dt_ini for a in self.arquivos):
                messagebox.showerror(
                    'Erro',
                    f'{nome_arq}: já existe um arquivo anexado com a mesma '
                    f'competência ({dt_ini[:2]}/{dt_ini[2:4]}/{dt_ini[4:]}).')
                continue

            self.arquivos.append({
                'path': path, 'lines': lines, 'encoding': encoding, 'nl': nl, 'sig': sig,
                'info': info, 'info_est': info_est,
                'recibo_var': tk.StringVar(value=info.get('num_rec_ante', '')),
            })

        self.arquivos.sort(key=lambda a: a['info']['dt_ini'])
        self._rebuild_lista_arquivos()
        self._atualizar_preview_multi()

    def _remover_arquivo(self, item):
        self.arquivos[:] = [a for a in self.arquivos if a is not item]
        self._rebuild_lista_arquivos()
        self._atualizar_preview_multi()

    def _rebuild_lista_arquivos(self):
        for w in self.frame_lista_arquivos.winfo_children():
            w.destroy()

        if not self.arquivos:
            tk.Label(self.frame_lista_arquivos, text='Nenhum arquivo anexado.',
                     font=F['body'], bg=C['card'], fg=C['muted']).pack(anchor='w')
        else:
            for item in self.arquivos:
                d = item['info']
                dt_i, dt_f = d.get('dt_ini', ''), d.get('dt_fin', '')
                periodo = (f"{dt_i[:2]}/{dt_i[2:4]}/{dt_i[4:]} → "
                          f"{dt_f[:2]}/{dt_f[2:4]}/{dt_f[4:]}") if dt_i and dt_f else '—'

                row = tk.Frame(self.frame_lista_arquivos, bg=C['input_bg'],
                               highlightthickness=1, highlightbackground=C['border'])
                row.pack(fill=tk.X, pady=2)

                tk.Label(row, text=os.path.basename(item['path']), font=F['body'],
                         bg=C['input_bg'], fg=C['text'], anchor='w', width=26
                         ).pack(side=tk.LEFT, padx=(6, 0), pady=4)
                tk.Label(row, text=periodo, font=F['small'],
                         bg=C['input_bg'], fg=C['muted']).pack(side=tk.LEFT, padx=(6, 0))
                tk.Label(row, text='Nº Recibo:', font=F['small'],
                         bg=C['input_bg'], fg=C['muted']).pack(side=tk.LEFT, padx=(12, 2))
                tk.Entry(row, textvariable=item['recibo_var'], width=18,
                         font=F['body'], bg=C['card'], fg=C['text'], relief=tk.FLAT,
                         highlightthickness=1, highlightbackground=C['border']
                         ).pack(side=tk.LEFT, ipady=2)
                tk.Button(row, text='✕', font=F['small'], bg=C['input_bg'], fg=C['danger'],
                          relief=tk.FLAT, bd=0, cursor='hand2',
                          command=lambda item=item: self._remover_arquivo(item)
                          ).pack(side=tk.RIGHT, padx=6)

        n = len(self.arquivos)
        self.v_qtd_arquivos.set(f'{n} arquivo(s) anexado(s)' if n else 'Nenhum arquivo anexado')
        self._atualizar_texto_botao_gerar()

    def _atualizar_preview(self, *_):
        try:
            credito = parse_decimal(self.v_credito.get())
            if credito <= 0:
                raise ValueError
            v = calcular(credito)
            self.v_base.set(f"R$ {fmt_br(v['base'])}")
            self.v_val_pis.set(f"R$ {fmt_br(v['valor_pis'])}")
            self.v_val_cof.set(f"R$ {fmt_br(v['valor_cofins'])}")
        except (InvalidOperation, ValueError):
            self.v_base.set('—')
            self.v_val_pis.set('—')
            self.v_val_cof.set('—')
        if self.v_modo_multi.get():
            self._atualizar_preview_multi()

    def _ler_teto(self) -> Decimal | None:
        """Le o campo Teto por Trimestre. Vazio => sem checagem de teto."""
        txt = self.v_teto_trimestre.get().strip()
        if not txt:
            return None
        return parse_decimal(txt)

    def _atualizar_preview_multi(self, *_):
        for row in self.tv_preview.get_children():
            self.tv_preview.delete(row)
        self.lbl_reconciliacao.config(text='', fg=C['muted'])

        if not self.arquivos:
            return
        try:
            credito = parse_decimal(self.v_credito.get())
            if credito <= 0:
                return
            variacao = parse_decimal(self.v_variacao_pct.get())
            if not (Decimal('-100') < variacao < Decimal('100')):
                return
            teto = self._ler_teto()
        except (InvalidOperation, ValueError):
            return

        resultado = diferenciar_creditos(
            credito, variacao, len(self.arquivos), teto, self.v_inverter_inicial.get())

        if not resultado['ok']:
            estouros_txt = ', '.join(f'grupo {n}: R$ {fmt_br(t)}' for n, t in resultado['estouros'])
            self.lbl_reconciliacao.config(
                text=f'Teto estourado ({estouros_txt}). '
                     f'Aumente para ao menos {resultado["qtd_meses_sugerido"]} meses/SPEDs.',
                fg=C['danger'])
            return

        for item, valor_mes in zip(self.arquivos, resultado['valores']):
            d = item['info']
            dt_i, dt_f = d.get('dt_ini', ''), d.get('dt_fin', '')
            periodo = f"{dt_i[:2]}/{dt_i[2:4]}/{dt_i[4:]}–{dt_f[:2]}/{dt_f[2:4]}/{dt_f[4:]}" if dt_i else '—'
            v = calcular(valor_mes)
            self.tv_preview.insert('', tk.END, values=(
                os.path.basename(item['path']), periodo, fmt_br(valor_mes),
                fmt_br(v['base']), fmt_br(v['valor_pis']), fmt_br(v['valor_cofins'])))

        soma = sum(resultado['valores'])
        dif = soma - credito
        if abs(dif) < Decimal('0.01'):
            self.lbl_reconciliacao.config(
                text=f'Soma dos meses: R$ {fmt_br(soma)} (bate com o crédito total)', fg=C['success'])
        else:
            self.lbl_reconciliacao.config(
                text=f'Soma dos meses: R$ {fmt_br(soma)} — diferença de R$ {fmt_br(dif)}',
                fg=C['danger'])

    @staticmethod
    def _normalizar_recibo(texto: str) -> str | None:
        """Remove hífen/espaço/ponto (formato colado do e-CAC) e valida que
        só restam letras e números. O recibo de transmissão do SPED é
        alfanumérico (não só dígitos) — .isdigit() rejeitava recibos reais.
        Retorna None se vazio ou inválido."""
        recibo = texto.strip().replace('-', '').replace(' ', '').replace('.', '')
        return recibo if recibo.isalnum() else None

    @staticmethod
    def _escrever_sped(dest: str, linhas: list[str], encoding: str, sig: bytes) -> None:
        """Grava texto + assinatura binária original intacta. SPED não aceita
        BOM: se o encoding detectado for utf-8-sig, grava como utf-8 puro."""
        write_enc = 'utf-8' if encoding == 'utf-8-sig' else encoding
        text_out = ''.join(linhas).encode(write_enc)
        if text_out.startswith(b'\xef\xbb\xbf'):
            text_out = text_out[3:]
        with open(dest, 'wb') as f:
            f.write(text_out)
            if sig:
                f.write(sig)

    def _gerar(self):
        if not self.sped_lines:
            messagebox.showerror('Erro', 'Carregue um arquivo SPED primeiro.')
            return

        try:
            credito = parse_decimal(self.v_credito.get())
            assert credito > 0
        except Exception:
            messagebox.showerror('Erro', 'Informe um Crédito Total válido.\nExemplo: 89.198,19')
            return

        recibo = self._normalizar_recibo(self.v_recibo.get())
        if recibo is None:
            messagebox.showerror('Erro', 'Informe um Nº de Recibo válido (letras e números).')
            return

        dt_raw = self.v_dt_oper.get().strip().replace('/', '')
        if len(dt_raw) != 8 or not dt_raw.isdigit():
            messagebox.showerror('Erro', 'Data inválida. Use o formato DD/MM/AAAA.')
            return

        nome_cta = self.v_nome_cta.get().strip()
        if not nome_cta:
            messagebox.showerror('Erro', 'Informe o Nome da Conta Analítica.')
            return

        desc_oper = self.v_desc_oper.get().strip()  # opcional — pode ficar em branco

        vals = calcular(credito)
        self._log('─' * 52)
        self._log(f"Crédito Total : R$ {fmt_br(credito)}")
        self._log(f"Base de Cálc. : R$ {fmt_br(vals['base'])}", tag='ok')
        self._log(f"Valor PIS     : R$ {fmt_br(vals['valor_pis'])}")
        self._log(f"Valor COFINS  : R$ {fmt_br(vals['valor_cofins'])}")

        base_nome = os.path.splitext(os.path.basename(self.sped_path))[0]
        dest = filedialog.asksaveasfilename(
            title='Salvar SPED Retificadora',
            defaultextension='.txt',
            initialfile=f'{base_nome}_retificadora.txt',
            filetypes=[('Arquivo TXT', '*.txt')])
        if not dest:
            return

        try:
            novas = build_sped(
                lines     = self.sped_lines,
                recibo    = recibo,
                dt_oper   = dt_raw,
                vals      = vals,
                cod_part  = self.v_cod_part.get().strip()  or '001',
                cod_cta   = self.v_cod_cta.get().strip()   or '001',
                nome_cta  = nome_cta,
                desc_oper = desc_oper,
                nl        = self.sped_nl,
            )
            self._escrever_sped(dest, novas, self.sped_encoding, self.sped_sig)
        except Exception as e:
            self._log(f'ERRO: {e}', tag='err')
            messagebox.showerror('Erro ao gerar', str(e))
            return

        tem_sig = f'  +assinatura {len(self.sped_sig):,} bytes' if self.sped_sig else ''
        self._log(f'Arquivo gerado: {dest}  ({len(novas):,} linhas)'
                  f'  [{self.sped_encoding} / {"CRLF" if self.sped_nl == chr(13)+chr(10) else "LF"}]{tem_sig}',
                  tag='ok')
        self._set_status(f'Gerado com sucesso → {os.path.basename(dest)}', ok=True)

        messagebox.showinfo(
            'Concluído ✔',
            f"SPED Retificadora gerado com sucesso!\n\n"
            f"{dest}\n\n"
            f"Registros inseridos / modificados:\n"
            f"  0000  →  Tipo de Escrituração = Retificadora\n"
            f"  0500  →  Conta analítica de crédito\n"
            f"  F100  →  Lançamento de crédito extemporâneo\n"
            f"  M100 + M105  →  Crédito PIS\n"
            f"  M500 + M505  →  Crédito COFINS")

    def _gerar_multi(self):
        if len(self.arquivos) < 2:
            messagebox.showerror(
                'Erro', 'Anexe pelo menos 2 arquivos SPED para diferenciar o '
                'crédito entre meses (com 1 arquivo, desmarque a opção de '
                'múltiplos SPEDs e use o modo simples).')
            return

        try:
            credito = parse_decimal(self.v_credito.get())
            assert credito > 0
        except Exception:
            messagebox.showerror('Erro', 'Informe um Crédito Total válido.\nExemplo: 89.198,19')
            return

        try:
            variacao = parse_decimal(self.v_variacao_pct.get())
            assert Decimal('-100') < variacao < Decimal('100')
        except Exception:
            messagebox.showerror('Erro', 'Informe uma Variação % entre -100 e 100 (exclusivo).')
            return

        try:
            teto = self._ler_teto()
            assert teto is None or teto > 0
        except Exception:
            messagebox.showerror('Erro', 'Teto por Trimestre inválido. Deixe vazio para não checar.')
            return

        nome_cta = self.v_nome_cta.get().strip()
        if not nome_cta:
            messagebox.showerror('Erro', 'Informe o Nome da Conta Analítica.')
            return

        desc_oper = self.v_desc_oper.get().strip()  # opcional — pode ficar em branco

        recibos = {}
        for item in self.arquivos:
            recibo = self._normalizar_recibo(item['recibo_var'].get())
            if recibo is None:
                messagebox.showerror(
                    'Erro',
                    f"Informe um Nº de Recibo válido (letras e números) para "
                    f"{os.path.basename(item['path'])}.")
                return
            recibos[id(item)] = recibo

        resultado = diferenciar_creditos(
            credito, variacao, len(self.arquivos), teto, self.v_inverter_inicial.get())

        if not resultado['ok']:
            estouros_txt = '\n'.join(
                f'  - Grupo {n}: R$ {fmt_br(t)}' for n, t in resultado['estouros'])
            messagebox.showerror(
                '🚫 Teto por trimestre estourado',
                f'Um ou mais grupos de meses ultrapassam o teto informado '
                f'(R$ {fmt_br(teto)}):\n\n{estouros_txt}\n\n'
                f'Aumente para pelo menos {resultado["qtd_meses_sugerido"]} '
                f'meses/SPEDs para respeitar esse teto.')
            return

        valores = resultado['valores']
        if not all(v > 0 for v in valores):
            messagebox.showerror(
                'Erro',
                'A variação % informada faz um dos meses ficar com valor '
                'zero ou negativo. Reduza a Variação % e tente novamente.')
            return

        pasta = filedialog.askdirectory(title='Selecionar pasta para salvar as retificadoras')
        if not pasta:
            return

        self._log('═' * 52)
        self._log(f"Diferenciação de crédito — {len(self.arquivos)} arquivo(s)")
        self._log(f"Crédito Total : R$ {fmt_br(credito)}   |   Variação: {fmt_br(variacao)}%")

        sucesso, falhas = [], []
        for item, valor_mes in zip(self.arquivos, valores):
            nome_arq = os.path.basename(item['path'])
            try:
                vals = calcular(valor_mes)
                dt_ini = item['info']['dt_ini']
                recibo = recibos[id(item)]

                novas = build_sped(
                    lines     = item['lines'],
                    recibo    = recibo,
                    dt_oper   = dt_ini,
                    vals      = vals,
                    cod_part  = self.v_cod_part.get().strip() or '001',
                    cod_cta   = self.v_cod_cta.get().strip()  or '001',
                    nome_cta  = nome_cta,
                    desc_oper = desc_oper,
                    nl        = item['nl'],
                )
                base_nome = os.path.splitext(nome_arq)[0]
                competencia = f"{dt_ini[2:4]}-{dt_ini[4:]}"
                dest = os.path.join(pasta, f'{base_nome}_{competencia}_retificadora.txt')
                self._escrever_sped(dest, novas, item['encoding'], item['sig'])

                self._log(
                    f"  ✔ {nome_arq} → R$ {fmt_br(valor_mes)}  →  "
                    f"{os.path.basename(dest)}", tag='ok')
                sucesso.append(dest)
            except Exception as e:
                self._log(f"  ✘ {nome_arq}: ERRO — {e}", tag='err')
                falhas.append(nome_arq)

        soma = sum(valores)
        self._log(f"Soma dos meses: R$ {fmt_br(soma)}  (crédito total: R$ {fmt_br(credito)})",
                  tag='ok' if abs(soma - credito) < Decimal('0.01') else 'err')

        if falhas:
            self._set_status(f'{len(sucesso)} de {len(self.arquivos)} gerados — '
                             f'{len(falhas)} falharam', ok=False)
            messagebox.showwarning(
                'Concluído com falhas',
                f"{len(sucesso)} de {len(self.arquivos)} retificadoras geradas em:\n{pasta}\n\n"
                f"Falharam:\n" + '\n'.join(f'  - {n}' for n in falhas))
        else:
            self._set_status(f'{len(sucesso)} retificadoras geradas em {pasta}', ok=True)
            messagebox.showinfo(
                'Concluído ✔',
                f"{len(sucesso)} SPED Retificadoras geradas com sucesso em:\n\n{pasta}")

    # ─────────────────────────────────────────────────────────────────────────

    def _set_status(self, msg: str, ok: bool = True):
        self.v_status.set(msg)
        self._dot.config(fg=C['success'] if ok else C['danger'])

    def _log(self, msg: str, tag: str = ''):
        import datetime
        ts = datetime.datetime.now().strftime('%H:%M:%S')
        self.txt_log.config(state=tk.NORMAL)
        self.txt_log.insert(tk.END, f'[{ts}] ', 'ts')
        self.txt_log.insert(tk.END, f'{msg}\n', tag or '')
        self.txt_log.see(tk.END)
        self.txt_log.config(state=tk.DISABLED)

    def _limpar_log(self):
        self.txt_log.config(state=tk.NORMAL)
        self.txt_log.delete('1.0', tk.END)
        self.txt_log.config(state=tk.DISABLED)


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    app = App()
    app.mainloop()
