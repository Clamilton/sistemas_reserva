---
tags: [sistema-demandas, perdcomp, finalização, técnico]
---

# Compensação via PER/DCOMP

← [[00 - Índice]] · Ver também [[08 - Finalização e Mensagem Bitrix]] · [[12 - Histórico de Decisões]]

## O problema que motivou

Toda finalização de uma demanda de Compensação exige escrever um texto-resumo dos valores compensados (impostos, período, responsável) — até aqui, sempre feito à mão, olhando PDF por PDF do PER/DCOMP. Já existia uma ferramenta Python/Streamlit própria (`github.com/Clamilton/compensacao`, `pages/_Processador_PERDCOMP.py`, usando `pdfplumber`) que lê esses PDFs, valida o CNPJ contra a empresa e extrai os débitos — mas ela gera uma planilha Excel, não o texto pronto pra colar.

O pedido: portar a **extração** desse Python pra TypeScript (mesmo padrão 100% client-side do [[16 - SPED Retificador]] — o PDF nunca sobe pro backend) e, a partir dela, **construir o texto final** no molde que a equipe já usa, direto no fluxo de [[08 - Finalização e Mensagem Bitrix|Finalizar demanda]].

## Onde entra no fluxo

Só aparece no modal de finalização quando `task.tipo === "compensacao"`. CNPJ e nome da empresa vêm da própria demanda — não precisa digitar nada (diferente da ferramenta Python original, que pede o CNPJ manualmente). Se a demanda não tem CNPJ cadastrado, o upload fica bloqueado com um aviso.

## Extração (`src/lib/perdcomp/`)

- `pdfText.ts` — extrai o texto de cada página via `pdfjs-dist`, agrupando os itens de `getTextContent()` por linha (coordenada Y) e ordenando por X, só inserindo espaço entre itens quando há um vão real (evita quebrar uma palavra no meio por causa de kerning). Importado **dinamicamente** dentro da função de extração — a biblioteca é pesada (~1,4MB com o worker) e só é buscada quando o usuário de fato processa um PDF, pra não inflar o carregamento inicial do Kanban.
- `extractor.ts` — porta das funções de normalização do Python: parsing de valor BR/US (`1.500,00` vs `1,500.00`), conversão de período de apuração conforme a periodicidade (Mensal/Trimestral mantém texto original, Anual extrai só o ano, Diário converte `"Dia 25 de set de 2023"` → `"25/09/2023"`), e o de-para de código da Receita pra nome do imposto.
- `message.ts` — monta o texto final a partir dos débitos extraídos.
- `historico.ts` — soma compensações de demandas diferentes da mesma empresa no mesmo mês (ver abaixo).

## O molde do texto

Cabeçalho (uma vez):
```
{empresa} - {cnpj}
```

**Uma única compensação no mês:**
```
VALORES COMPENSADOS – {período de apuração}

{IMPOSTO}: R$ {valor}
...
TOTAL GERAL: R$ {soma}

RESPONSÁVEL: {operador da demanda, em MAIÚSCULO}
```

**Duas ou mais compensações no mês** (2+ demandas — ver seção seguinte): cada bloco fecha com `TOTAL` e `RESPONSÁVEL` (o operador da demanda de onde aquele bloco veio, não necessariamente o mesmo em todos os blocos); a partir do 2º bloco entra o sufixo `(2ª COMPENSAÇÃO)`, `(3ª COMPENSAÇÃO)` etc.; no fim, uma linha única `TOTAL GERAL` soma tudo.

Dentro de um mesmo bloco, se o mesmo imposto aparecer em mais de um débito (comum quando 1 PDF declara vários débitos, ou quando a demanda tem mais de 1 PDF anexado), os valores são somados numa única linha.

> [!note] "CP ..." vira INSS
> Qualquer imposto cujo "Grupo de Tributo" no PDF comece com "CP" (CP Patronal, CP Segurados, CP Terceiros — Salário-Educação, INCRA, SENAC, SESC, SEBRAE etc., cada um com um código de receita diferente) é agrupado como uma única linha **INSS** na mensagem — pedido explícito, pra não fragmentar o texto em várias linhas de contribuição previdenciária.

## "2ª/3ª compensação" é por TAREFA, não por PDF nem por upload

Duas idas e vindas até chegar nessa regra:

1. **Primeira versão**: cada PDF selecionado virava um bloco — soltar 2 PDFs na mesma demanda já gerava "1ª" e "2ª compensação".
2. **Corrigido pra**: contar por **quantas demandas** (não uploads) da mesma empresa já foram finalizadas no mesmo mês — mas nessa correção, vários PDFs soltos juntos na mesma demanda *ainda* viravam blocos separados entre si.
3. **Versão final**: uma demanda inteira é sempre **1 compensação**, não importa quantos PDFs ela tenha anexado (os débitos de todos eles se somam num bloco só). Só vira "2ª/3ª" quando existe de fato **outra demanda** de Compensação da mesma empresa (mesmo CNPJ), criada no mesmo mês, já finalizada.

Pra isso, `Task.perdcompDados` (`Json?`) guarda os débitos extraídos ao finalizar cada demanda (`{pa, imposto, valor}[]`, já com todos os PDFs daquela demanda somados). Ao finalizar uma nova demanda de Compensação, `acharCompensacoesAnteriores()` busca outras demandas com o mesmo CNPJ, criadas no mesmo mês, já finalizadas e com `perdcompDados` preenchido, ordenadas pela ordem em que foram concluídas — e esses blocos entram *antes* do bloco da demanda atual na mensagem.

> [!warning] Limitação conhecida
> Só entram nessa soma automática demandas que já passaram por esse fluxo (têm `perdcompDados` salvo). Compensações finalizadas manualmente, sem anexar PDF — inclusive todas as anteriores a essa feature — não são contabilizadas.

## Bugs reais encontrados testando contra um PER/DCOMP de verdade

O usuário enviou um PDF real (10 débitos, CP Patronal/Segurados/Terceiros, um deles dividido entre duas páginas) pra validar. Isso expôs dois problemas que o teste sintético não pegava:

1. **Código `1082` mal classificado na fonte original.** O dicionário `DE_PARA_IMPOSTOS` do Python mapeava `1082` pra "CP Terceiros" — mas no PDF real, `1082` é **"CP Segurados - Empregados/Avulsos"**. A extração agora prioriza o texto do "Grupo de Tributo" do próprio PDF sobre esse código específico.
2. **"CP Terceiros" tem várias entidades, cada uma com um código diferente** (Salário-Educação `1170`, INCRA `1176`, SENAC `1191`, SESC `1196`, SEBRAE `1200`...) — só `1170` estava coberto no de-para original. A checagem agora é por palavra no texto (`/\bCP\b/`), cobrindo qualquer variante sem precisar listar código por código.

Revalidado depois: os 10 débitos do PDF real bateram exatamente com o `TOTAL` impresso no próprio documento, numa única linha `INSS: R$ 1.630,71`.

## Onde está o código
- `src/lib/perdcomp/*` — descrito acima.
- `src/components/FinalizeModal.tsx` — UI de upload, lista de status por arquivo, campo de mensagem separado (ver [[08 - Finalização e Mensagem Bitrix]]).
- `server/prisma/schema.prisma` — campo `Task.perdcompDados`.
