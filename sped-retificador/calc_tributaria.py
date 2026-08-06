import streamlit as st
import pandas as pd

# Configuração da Página
st.set_page_config(page_title="Calc Tributária", layout="centered")

# --- Inicialização da Memória (Session State) ---
if 'fator_inversao' not in st.session_state:
    st.session_state.fator_inversao = 1

if 'valor_digitado' not in st.session_state:
    st.session_state.valor_digitado = "0,00"

# --- Funções Auxiliares ---
def formatar_brl(valor):
    """Transforma float 1500.50 em string '1.500,50'"""
    return f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def converter_input_br(valor_texto):
    """Limpa string '1.500,50' para float 1500.50.

    Trata ponto como separador de milhar só quando há vírgula decimal
    (formato BR) ou múltiplos pontos/mais de 2 casas finais; um ponto único
    seguido de 1-2 dígitos (ex: '1234.56', comum ao colar de planilha em
    locale en-US) é tratado como decimal, não removido — senão o valor fica
    inflado 10x/100x silenciosamente.
    """
    if not valor_texto: return 0.0
    valor_texto = valor_texto.strip()
    try:
        if valor_texto.count(",") > 1:
            return 0.0
        if "," in valor_texto:
            parte_inteira, parte_decimal = valor_texto.split(",")
            if "." in parte_decimal:
                return 0.0  # ponto depois da vírgula: erro de digitação
            limpo = parte_inteira.replace(".", "") + "." + parte_decimal
        elif "." in valor_texto:
            partes = valor_texto.split(".")
            if len(partes) > 2 or len(partes[-1]) > 2:
                limpo = valor_texto.replace(".", "")
            else:
                limpo = valor_texto
        else:
            limpo = valor_texto
        return float(limpo)
    except ValueError:
        return 0.0

# --- CALLBACK: Auto-formatação ---
def atualizar_input():
    texto_atual = st.session_state.valor_digitado
    valor_float = converter_input_br(texto_atual)
    st.session_state.valor_digitado = formatar_brl(valor_float)

def calcular_distribuicao_completa(valor_total, variacao_pct, inverter_logica, qtd_meses):
    taxa_pis = 1.65
    taxa_cofins = 7.60
    taxa_total = taxa_pis + taxa_cofins
    fator_pis = taxa_pis / taxa_total

    # Define divisor base (2 ou 3)
    divisor = 3 if qtd_meses == "3 Meses (Trimestre)" else 2

    # 1. Base (Média)
    base_media = round(valor_total / divisor, 2)
    valor_variacao = round(base_media * (variacao_pct / 100), 2)

    dados_finais = []
    totais_mensais = []
    meses_label = []

    # --- LÓGICA PARA 3 MESES ---
    if divisor == 3:
        total_m1 = base_media # Mês 1: Média Pura

        if not inverter_logica:
            total_m2 = round(base_media - valor_variacao, 2)
            tipo_distribuicao = "📉 Padrão: Mês 2 Baixo / Mês 3 Alto"
        else:
            total_m2 = round(base_media + valor_variacao, 2)
            tipo_distribuicao = "📈 Invertido: Mês 2 Alto / Mês 3 Baixo"

        total_m3 = round(valor_total - (total_m1 + total_m2), 2)

        totais_mensais = [total_m1, total_m2, total_m3]
        meses_label = ["Mês 1 (Média)", "Mês 2 (Variação)", "Mês 3 (Ajuste Final)"]

    # --- LÓGICA PARA 2 MESES ---
    else:
        if not inverter_logica:
            total_m1 = round(base_media - valor_variacao, 2)
            tipo_distribuicao = "📉 Padrão: Mês 1 Baixo / Mês 2 Alto"
        else:
            total_m1 = round(base_media + valor_variacao, 2)
            tipo_distribuicao = "📈 Invertido: Mês 1 Alto / Mês 2 Baixo"

        total_m2 = round(valor_total - total_m1, 2)

        totais_mensais = [total_m1, total_m2]
        meses_label = ["Mês 1 (Variação)", "Mês 2 (Ajuste Final)"]

    # Gera saída final (PIS/COFINS)
    for i, total_mes in enumerate(totais_mensais):
        v_pis = round(total_mes * fator_pis, 2)
        v_cofins = round(total_mes - v_pis, 2)

        dados_finais.append({
            "Mês": meses_label[i],
            "Valor PIS (1,65%)": formatar_brl(v_pis),
            "Valor COFINS (7,60%)": formatar_brl(v_cofins),
            "Total do Mês": formatar_brl(total_mes),
            "_total_raw": total_mes,
            "_pis_raw": v_pis,
            "_cofins_raw": v_cofins
        })

    return dados_finais, tipo_distribuicao, base_media

# --- Interface ---
st.title("📊 Distribuidor de Crédito")
st.markdown("Cálculo com alternância de padrão para evitar malha fina.")

with st.container(border=True):
    col1, col2 = st.columns(2)
    with col1:
        st.text_input(
            "Valor Total do Crédito (R$)",
            key="valor_digitado",
            on_change=atualizar_input,
            help="Digite o valor e aperte Enter. Ex: 1000 vira 1.000,00"
        )
        valor_input = converter_input_br(st.session_state.valor_digitado)

    with col2:
        pct_input = st.number_input(
            "Variação (%)", value=12.3, min_value=-100.0, max_value=100.0,
            step=0.1, format="%.2f",
            help="Limitado a ±100% para nenhum mês ficar com total negativo.")

    periodo_opcao = st.radio(
        "Período de Compensação:",
        ["3 Meses (Trimestre)", "2 Meses (Bimestre)"],
        horizontal=True
    )

# Botão de Ação
if st.button("Calcular Distribuição (Alternar Padrão)", type="primary"):

    if valor_input <= 0:
        st.warning("Por favor, digite um valor maior que zero.")
    else:
        st.session_state.fator_inversao *= -1
        usar_inversao = (st.session_state.fator_inversao == -1)

        dados, status_msg, base_media = calcular_distribuicao_completa(valor_input, pct_input, usar_inversao, periodo_opcao)

        df_visual = pd.DataFrame(dados)[["Mês", "Valor PIS (1,65%)", "Valor COFINS (7,60%)", "Total do Mês"]]

        # Guarda o resultado em session_state para sobreviver a reruns
        # disparados por OUTROS widgets (ex: mudar Variação % ou o período),
        # que senão fariam a tabela desaparecer sem o usuário clicar de novo
        # (e clicar de novo alternaria fator_inversao outra vez).
        st.session_state.resultado = {
            "dados": dados,
            "status_msg": status_msg,
            "base_media": base_media,
            "df_visual": df_visual,
            "usar_inversao": usar_inversao,
            "valor_input": valor_input,
        }

if "resultado" in st.session_state:
    r = st.session_state.resultado

    if r["usar_inversao"]:
        st.info(r["status_msg"], icon="🔄")
    else:
        st.success(r["status_msg"], icon="✅")

    # Base de cálculo visível
    st.metric(label="Base de Cálculo (Média por Mês)", value=f"R$ {formatar_brl(r['base_media'])}")

    st.subheader("Resultado (Copie e Cole)")
    st.dataframe(r["df_visual"], use_container_width=True, hide_index=True)

    # Prova Real
    total_geral = sum([d['_total_raw'] for d in r["dados"]])
    dif = total_geral - r["valor_input"]

    st.markdown("---")
    if abs(dif) < 0.01:
        st.caption(f"Validação Matemática: R$ {formatar_brl(total_geral)} (Perfeito)")
    else:
        st.error(f"Erro de arredondamento: {dif}")
