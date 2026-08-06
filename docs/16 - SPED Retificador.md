---
tags: [sistema-demandas, sped, técnico]
---

# SPED Retificador

← [[00 - Índice]] · Ver também [[11 - Segurança]] · [[12 - Histórico de Decisões]]

## O que é

Uma ferramenta desktop em Python (`sped-retificador/sped_retificador.py` + `calc_tributaria.py`, nesse mesmo repositório) automatizava a criação de uma **retificadora de SPED EFD-Contribuições**: dado um SPED original e um valor de crédito de PIS/COFINS a lançar, ela recalculava a base/PIS/COFINS, inseria os registros necessários (`0150`, `0500`, `F100`, `M100`/`M105`, `M500`/`M505`, `1100`, `1500`) na posição certa do arquivo, e regravava um novo `.txt` pronto pra transmitir.

Foi pedido portar essa lógica pro TypeScript do site, como mais uma opção dentro da página já existente — sem precisar mais abrir o programa desktop separado.

## Decisão de arquitetura: tudo no navegador, nada no servidor

O SPED contém dados fiscais sensíveis (CNPJ, valores, toda a escrituração da empresa). Em vez de subir o arquivo pro backend pra processar, **a leitura, o cálculo e a geração do novo arquivo acontecem inteiramente no navegador** — o servidor nunca vê o conteúdo do SPED. Esse padrão foi repetido depois na feature de [[17 - Compensação via PER-DCOMP]].

## Módulos (`src/lib/sped/`)

- `calculo.ts` — motor de cálculo com `decimal.js` (nunca `number` puro, pra não introduzir erro de ponto flutuante em valor fiscal): distribuição do crédito entre base/PIS/COFINS, e o algoritmo de diferenciação de crédito entre múltiplos meses/SPEDs (alterna um padrão "baixo/alto" de variação percentual, com o último mês absorvendo o resíduo do arredondamento).
- `parser.ts` — leitura do arquivo via File API do navegador: detecção de encoding na mesma ordem do Python (`utf-8-sig` → `utf-8` → `cp1252` → `latin-1`), separação do texto da assinatura digital binária que a Receita anexa depois do `|9999|` (preservada intacta e reescrita sem modificação), funções de busca de registro (`info0000`, `contaExiste`, `participanteExiste`, `acharM100`, etc.).
- `gerador.ts` — os geradores de cada linha nova e a função principal `buildSped()`, que percorre o arquivo original e insere os registros novos respeitando a hierarquia oficial do bloco 0 (`0000, 0001, 0002, 0100, 0110, 0111, 0120, 0140, 0145, 0150, 0190, 0200, 0205, 0206, 0208, 0300, 0400, 0450, 0500, 0600, 0900, 0990`) e do bloco M/1.
- `io.ts` — reescreve o texto de volta pro encoding original, dispara o download, e empacota várias retificadoras num `.zip` (modo multi-SPED) via `fflate`.

## Validação contra o Python original

Antes de considerar a porta pronta: instalado `python3-tk` pra rodar o `sped_retificador.py` original diretamente, e comparado byte a byte contra a versão TypeScript — motor de cálculo, algoritmo de diferenciação entre meses (incluindo um cenário de estouro de teto trimestral) e uma geração completa de `buildSped()` simulando o round-trip pela File API. Todos os testes bateram idênticos.

## Bug real encontrado depois, com um arquivo de produção

> [!bug] Registro `0500` inserido depois do `0900`, quebrando a hierarquia do bloco 0
> O primeiro teste síntetico não incluía um registro `0900` (identificação de outras obrigações), então não pegou um defeito que também existia no Python original: o código inseria o novo `0500` (plano de contas) sempre "logo antes do `0990`" — sem checar se havia um `0900` no meio do caminho. Rodado contra um SPED real de produção, isso quebrou a ordem oficial (`...0500 → 0600 → 0900 → 0990`) e o validador da Receita rejeitou o arquivo ("esperado 0990, encontrado 0500").
>
> Corrigido inserindo o `0500` antes do primeiro entre `0600`/`0900`/`0990` (o que vier primeiro), no mesmo padrão que já era usado corretamente pra inserir o `0150` e os registros do bloco M. Revalidado com um SPED sintético reproduzindo a estrutura exata que expôs o problema.

## Onde está o código
- `src/components/SpedRetificador.tsx` — página (modo arquivo único e modo múltiplos SPEDs), carregada sob demanda (`React.lazy`) pra não inflar o bundle inicial do Kanban.
- `src/lib/sped/*` — descrito acima.
- `sped-retificador/` (raiz do repositório) — código Python original, preservado como referência histórica.
