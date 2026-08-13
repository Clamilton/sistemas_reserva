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
- `encode.ts` — funções puras (sem `document`/`Blob`/nenhuma API de DOM): reescreve o texto de volta pro encoding original (`montarArquivoSped`) e normaliza recibo (`normalizarRecibo`). Separado de `io.ts` justamente por ser "sem DOM" — é o que permite esse código rodar dentro do Web Worker (ver seção abaixo).
- `io.ts` — só o que precisa do navegador: dispara o download de um `Blob`/`Uint8Array` (`downloadBlob`, `baixarBytes`).
- `spedWorkerProtocol.ts`, `spedWorker.ts`, `useSpedWorker.ts` — o Web Worker e sua API, ver seção abaixo.

## Validação contra o Python original

Antes de considerar a porta pronta: instalado `python3-tk` pra rodar o `sped_retificador.py` original diretamente, e comparado byte a byte contra a versão TypeScript — motor de cálculo, algoritmo de diferenciação entre meses (incluindo um cenário de estouro de teto trimestral) e uma geração completa de `buildSped()` simulando o round-trip pela File API. Todos os testes bateram idênticos.

## Bugs reais encontrados depois, com arquivos de produção

Os dois casos abaixo têm a mesma causa raiz: a inserção de um registro novo procurava só por um conjunto **limitado** de "próximos registros possíveis" pra decidir onde entrar — quando o arquivo real tinha um registro intermediário fora desse conjunto (mas que, pela hierarquia oficial, precisa vir depois do registro novo), a inserção pulava esse registro e entrava fora de ordem.

> [!bug] Registro `0500` inserido depois do `0900`, quebrando a hierarquia do bloco 0
> O primeiro teste síntetico não incluía um registro `0900` (identificação de outras obrigações), então não pegou um defeito que também existia no Python original: o código inseria o novo `0500` (plano de contas) sempre "logo antes do `0990`" — sem checar se havia um `0900` no meio do caminho. Rodado contra um SPED real de produção, isso quebrou a ordem oficial (`...0500 → 0600 → 0900 → 0990`) e o validador da Receita rejeitou o arquivo ("esperado 0990, encontrado 0500").
>
> Corrigido inserindo o `0500` antes do primeiro entre `0600`/`0900`/`0990` (o que vier primeiro), no mesmo padrão que já era usado corretamente pra inserir o `0150` e os registros do bloco M. Revalidado com um SPED sintético reproduzindo a estrutura exata que expôs o problema.

> [!bug] Registro `F100` inserido depois de `F120`, quebrando a hierarquia do bloco F
> No leiaute oficial, `F100` é o **primeiro filho** de `F010`, antes de `F111`/`F120`/`F129`/`F130`/`F139`/`F150`. O código (também igual no Python original — o próprio comentário do código citava F111/F120/F150 como gatilho, mas o conjunto usado não os incluía) só reconhecia `F200` em diante como "saída do grupo F010". Um SPED real com registros `F120` (créditos de Ativo Imobilizado) antes do fechamento do bloco F fez o `F100` novo entrar **depois** desses registros — o PVA rejeitou o arquivo na importação.
>
> Corrigido expandindo o conjunto de saída pra cobrir todo registro que deve vir depois do F100 no leiaute oficial (F111 até F990). Na mesma revisão, identificado e corrigido preventivamente o mesmo padrão de bug nos blocos `M100`→`M110` e `M500`→`M510` (a inserção de um M100/M500 novo também só considerava M200/M600 como destino, ignorando M110/M510 como possíveis registros intermediários) — sem evidência de arquivo real que acionasse esse caso, mas a mesma causa raiz. Revalidado rodando `buildSped()` contra o SPED completo (35 mil linhas) que gerou o erro original.

> [!bug] Dropdown de "Nome Conta Analítica" não mostrava nenhuma opção ao clicar
> Campo de texto livre com um `<datalist>` de 8 descrições pré-cadastradas (`CONTAS_ANALITICAS`), pra sugerir sem travar a digitação livre. O campo vem pré-preenchido com um texto padrão ("LANCAMENTO DE CREDITO EXTEMPORANEO ACORDAO 9303009893") que não é nenhuma das 8 opções da lista — e o navegador filtra as sugestões do `<datalist>` pelo texto **já digitado** no campo, não mostra a lista inteira incondicionalmente. Com um valor que não bate com nenhuma opção, o resultado é sempre zero sugestões, então o dropdown nunca aparecia, mesmo com o `list`/`id` corretamente associados no HTML.
>
> Corrigido limpando o campo no foco (`onFocus`) — string vazia bate com as 8 opções, revelando a lista completa — e restaurando o valor anterior no blur (`onBlur`) caso o usuário clique pra fora sem digitar ou escolher nada, pra não exigir que quem nunca mexe nesse campo precise preenchê-lo de novo antes de gerar.

> [!bug] Com matriz + filiais no mesmo SPED, o 0150/F100 novo saía associado à filial errada
> Um SPED pode ter mais de um registro `0140` (um por estabelecimento — matriz e cada filial). `info0140()` sempre devolvia o **primeiro** `0140` do arquivo, na ordem em que aparece — não necessariamente a matriz. Esse CNPJ/nome/município alimentam o `0150` novo, e também decidem em qual seção do bloco F o `F100` novo entra (o código compara o CNPJ de cada `F010` encontrado contra esse valor pra saber se "entrou" na seção certa). Com uma filial na primeira posição do `0140`, tanto o `0150` quanto o `F100` podiam sair vinculados à filial em vez da matriz.
>
> Corrigido: `info0140()` agora varre todos os `0140` do arquivo e prefere o que tem CNPJ de matriz — os 12 dígitos antes do DV (raiz + ordem) terminando em `0001`, convenção da Receita pra identificar a matriz. Só cai no primeiro registro como fallback se nenhum bater (SPED sem matriz cadastrada, ou CNPJ fora do padrão). Validado com um SPED sintético com a filial listada antes da matriz tanto no `0140` quanto no `F010` do bloco F: `0150` sai com CNPJ/nome da matriz, e `F100` entra depois do `F010` da matriz. Reconfirmado que os arquivos de único estabelecimento usados nos testes anteriores continuam resolvendo pro mesmo CNPJ de sempre (sem regressão).
>
> Reportado de novo pouco depois, com um SPED real de 2 estabelecimentos que ainda dava erro no PVA. Confirmado com esse arquivo que o fix acima resolve mesmo o `0150`/`F100` — mas apareceu um segundo bug, independente, envolvendo `M100`/`M500`/`M105`/`M505` (ver abaixo).

> [!bug] Crédito extemporâneo em M100/M500: três tentativas até o PVA aceitar
> A porta original (fiel ao Python) lançava o crédito extemporâneo em dois registros por tributo: um `M100|101`/`M500|101` **placeholder zerado** (`VL_CRED=0`, só "declarando" a base) e um `M100|201`/`M500|201` com o crédito real — ambos com um `M105`/`M505|13|53` (natureza "outras operações", CST 53, descrição "RECUPERACAO DE CREDITOS TRIBUTARIOS"). Sempre buscava um `M100`/`M500` existente com o mesmo código pra "aproveitar" (soma nele) antes de criar um novo. Três problemas reais, cada um só apareceu testando contra um SPED de produção diferente (todo teste anterior tinha Bloco M vazio, onde nenhum desses problemas se manifesta):
>
> 1. **Contaminação de crédito real**: a busca por um `M100`/`M500` existente não distinguia "nosso" (de uma rodada anterior da ferramenta) de um crédito **real e legítimo** do contribuinte sob o mesmo código (ex.: `101` — Aquisição de Bens para Revenda, presente em quase todo SPED com Bloco M preenchido). Um SPED real com `M100|101` genuíno (`NAT_BC_CRED` 01/02/03/04/09) ganhou um `M105|13|53` anexado sem nenhum documento por trás — PVA rejeitou: *"Não deverá existir um registro M105 ... não informados nos documentos e operações"*.
> 2. **Chave duplicada**: pra não repetir o problema 1, a correção passou a sempre criar um par **novo e dedicado** quando não achava o marcador "nosso" — inclusive pro placeholder `101`. Só que esse placeholder sempre usa a alíquota padrão (1,65%/7,60%), a mesma de qualquer `101` real — duas linhas com a mesma chave (`COD_CRED`+`ALIQ`) violam a unicidade do SPED. PVA rejeitou com *"Duplicidade de ocorrência da chave"*, e isso arrastou erro pros `M105` **reais** do mesmo grupo (*"Deverá existir um registro M105"* — o oposto do erro 1).
> 3. **Código errado**: removido o placeholder `101` de vez (nunca carregou crédito, só duplicava a base sob um código redundante com o `201`) — sobrou só o par `201`, dedicado, sem duplicidade. Mesmo assim o PVA voltou a pedir, explicitamente: *"Deverá existir um registro M105 ... (COD_CRED = 101, ..., NAT_BC_CRED = 13, CST_PIS = 53)"*. O validador estava dizendo, sem ambiguidade, que esse detalhamento pertence ao grupo `101` — o crédito normal do contribuinte —, não a um `201` isolado.
>
> **Correção atual**: o crédito extemporâneo agora soma direto no `M100|101`/`M500|101` existente — base e crédito no **próprio registro pai** (antes ficavam zerados no caso do placeholder, uma inconsistência pai-filho que provavelmente era a causa real do erro 1) e no `M105`/`M505|13|53` filho (natureza 13, CST 53). Sem nenhum `M100|101`/`M500|101` prévio, cria o par completo (agora com valores reais, não mais zerado). Validado localmente (fora do PVA) contra o SPED que tem `101` real com 5 naturezas (01/02/03/04/09): pai passa a somar base+crédito original+extemporâneo corretamente, os 5 filhos reais continuam intactos, e exatamente 1 `M105`/`M505|13|53` novo entra no grupo com o valor certo. No validador da Receita, os erros caíram de 12 (problema 2) pra 2 (o pedido explícito do problema 3, que motivou esta correção) — **ainda sem confirmação de 0 erros** com esta versão específica; depende do próximo teste do usuário no PVA.

## Importação de recibos por competência (modo Múltiplos SPEDs)

No modo de múltiplos SPEDs, cada arquivo precisa do recibo da escrituração anterior daquela competência — digitar um por um era repetitivo. O botão **"Importar recibos"** lê um arquivo de exportação (formato tab-separated: `ativo(true/false) · cnpj · dtIni(ISO) · dtFin(ISO) · dtTransmissao(ISO) · tipo · recibo-dígito`) e casa cada linha com o SPED anexado correspondente por **CNPJ + competência** (mês/ano de `DT_INI`), preenchendo o campo de recibo automaticamente.

O recibo nesse arquivo de exportação vem com traço e dígito verificador (ex: `ABC...9-0`) — o campo `NUM_REC_ANTE` do SPED não aceita traço. `normalizarRecibo()` (já existente, usada também na digitação manual) remove esse e qualquer outro caractere não alfanumérico.

Funciona em qualquer ordem: se os SPEDs já estavam anexados quando o arquivo de recibos é importado, os campos são preenchidos na hora; se são anexados depois, o mapeamento importado já fica disponível e é aplicado automaticamente a cada novo arquivo.

## Tabela de prévia (modo Múltiplos SPEDs)

A tabela de resultado no modo múltiplos (Arquivo, Período, Valor do Mês, Base, PIS, COFINS) tem cabeçalho fixo (`sticky top-0`, com fundo sólido) — a lista de arquivos rola por baixo do cabeçalho sem ele sumir, útil com muitos arquivos anexados de uma vez. A coluna Base usa o mesmo `calc.base` já calculado por arquivo (o mesmo valor exibido como "Base de Cálculo" no modo arquivo único).

## Processamento em Web Worker (evita travar a aba)

Com arquivos grandes (na casa de dezenas de milhares de linhas, como os SPEDs reais usados nos testes dos bugs acima) e principalmente no modo múltiplos SPEDs, a leitura + geração rodando direto na thread principal travava a aba inteira até terminar — o navegador não conseguia nem repintar a tela.

A pergunta natural seria mandar esse processamento pro backend, mas isso contradiria a [[#Decisão de arquitetura: tudo no navegador, nada no servidor|decisão de arquitetura]] logo acima: o SPED tem dado fiscal sensível e o servidor não pode vê-lo. A solução que resolve as duas coisas ao mesmo tempo é um **Web Worker**: uma thread separada dentro do próprio navegador — o arquivo continua nunca saindo da máquina do usuário, só passa a rodar numa thread que não é a que desenha a tela.

- `spedWorker.ts` é o worker propriamente dito: mantém um cache em memória das leituras já feitas (indexado pelo nome do arquivo), e responde a 4 tipos de mensagem — `ler`, `remover`, `gerarUnico`, `gerarMulti` (esse último manda uma mensagem de progresso a cada arquivo concluído, pra popular o log da UI incrementalmente). Só devolve pra thread principal o resumo necessário pra exibir (cabeçalho do SPED, contagem de linhas) na leitura, e os bytes finais já prontos na geração — nunca o array de linhas inteiro ida e volta.
- `useSpedWorker.ts` é o hook React que cria o worker (uma vez, no mount de `SpedRetificador.tsx`) e expõe uma API baseada em `Promise` (`ler`/`remover`/`gerarUnico`/`gerarMulti`) por cima do protocolo de mensagens — o componente não lida com `postMessage`/`onmessage` diretamente.
- `spedWorkerProtocol.ts` só declara os tipos das mensagens (`type`-only), compartilhado pelos dois lados.

> [!bug] `lib` do TypeScript incompatível entre app e worker
> O código do app usa `lib: ["DOM", ...]` (tem `window`, `document` etc.) e o worker precisa de `lib: ["WebWorker", ...]` — as duas declaram um `self` global com assinatura de `postMessage` diferente, então não dá pra compilar os dois juntos num único `tsc`. Resolvido com um `tsconfig.worker.json` próprio (referenciado em `tsconfig.json`, excluído de `tsconfig.app.json`) — cada um vira um programa TS isolado, sem contaminação cruzada dos globais.

Valores `Decimal` (de `decimal.js`) não atravessam a fronteira do worker de forma segura via `postMessage` (structured clone não sabe serializar a instância) — por isso o crédito é passado como string (`.toString()`) e reconstruído (`new Decimal(str)`) do outro lado. Os bytes finais do SPED (e do `.zip`, no modo múltiplos) atravessam de volta como `Uint8Array` transferível (`Transferable`), sem custo de cópia.

Testado ao vivo no navegador contra os mesmos SPEDs reais de ~2,6MB/35 mil linhas que expuseram os bugs de hierarquia — nos dois modos, leitura e geração completam em poucos segundos e a aba permanece responsiva durante o processamento pesado.

## Onde está o código
- `src/components/SpedRetificador.tsx` — página (modo arquivo único e modo múltiplos SPEDs), carregada sob demanda (`React.lazy`) pra não inflar o bundle inicial do Kanban.
- `src/lib/sped/*` — descrito acima.
- `sped-retificador/` (raiz do repositório) — código Python original, preservado como referência histórica.
