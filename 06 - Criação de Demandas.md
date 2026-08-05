---
tags: [sistema-demandas, criação-de-demanda, técnico]
---

# Criação de Demandas

← [[00 - Índice]] · Ver também [[07 - Cadastro de Empresas]] · [[12 - Histórico de Decisões]]

## O fluxo (zero clique até os dados aparecerem)

1. Usuário clica em **Nova demanda** e cola o texto recebido no grupo.
2. Depois de ~350ms sem digitar (debounce), o sistema automaticamente:
   - tenta achar a **empresa** comparando o texto contra o [[07 - Cadastro de Empresas|cadastro de empresas]];
   - tenta achar o **Código da Receita** (guia) e resolve a(s) **sigla(s)** do imposto.
3. Os campos ficam preenchidos (editáveis) pra conferência antes de salvar.
4. Usuário escolhe **Tipo** (Compensação/Ressarcimento) e **Operador**, e clica em Criar demanda.

Não existe mais um botão "Extrair" — a extração roda sozinha ao colar/editar o texto.

## Empresa: nunca é um chute

**Regra central, decidida depois de um bug real:** o campo Empresa só é preenchido automaticamente se houver um **match real contra o cadastro de empresas**. Se não achar nada, o campo fica **em branco** pra digitar na mão — o sistema nunca tenta "adivinhar" a partir do texto solto.

> [!warning] Por que essa regra existe
> Na primeira versão, quando não havia match no cadastro, o sistema caía num fallback ingênuo: pegava a primeira linha do texto como se fosse o nome da empresa. Um teste real expôs o problema — um texto começando com `SABRYNA LUZ:` (nome de quem mandou a mensagem no grupo, não uma empresa) foi identificado como "empresa Sabryna Luz". A correção removeu completamente esse tipo de chute: hoje, sem match no cadastro = campo vazio, ponto final.

### Como o match funciona (`src/lib/matchEmpresa.ts`)

1. **CNPJ exato** (prioridade máxima): extrai qualquer CNPJ do texto colado, compara (só dígitos) contra o cadastro. Se achar, confiança 100%.
2. **Nome aproximado** (fuzzy, só roda se não achou CNPJ): para cada empresa cadastrada, calcula quantas das suas "palavras significativas" aparecem no texto.
   - Remove palavras genéricas (`LTDA`, `ME`, `EIRELI`, `EPP`, `SA`, `DE`, `DA`, `DO`, `COMERCIO`, `INDUSTRIA`, `SERVICOS`, etc.) antes de comparar.
   - Ignora acentuação e maiúsculas/minúsculas.
   - Empresa entra na lista de sugestões se **60% ou mais** das palavras significativas do nome aparecem no texto.
   - Mostra até 3 sugestões, ordenadas pela pontuação; a melhor já vem pré-selecionada (mas editável), as outras aparecem como botões de troca rápida.

Isso faz "COOPERATIVA AGRICOLA DO SUL" bater mesmo com o texto cheio de menções (`@Jorge Luis`, `@Clailton Junior` etc.) ao redor, porque a pontuação é sobre as palavras do **nome cadastrado**, não o inverso.

## Guia (Código da Receita) e siglas

- O sistema procura no texto o padrão `XXXX-YY` (ex: `2089-01`), que é o formato do "Código da Receita" como aparece nos documentos de PER/DCOMP.
- Cada código encontrado é resolvido pra uma sigla usando uma tabela extraída do projeto `github.com/Clamilton/compensacao` (arquivo `_Processador_PERDCOMP.py`, dicionário `DE_PARA_IMPOSTOS`).
- Se não achar nenhum código formal, tenta reconhecer siglas soltas no texto (`PIS`, `COFINS`, `IRPJ`, `CSLL`, `IRRF`, `CSRF`, `COSIRF`, `INSS`, `ICMS`, etc.) via lista fixa.
- Tudo fica editável — o campo "Siglas" nunca trava no valor sugerido.

Tabela replicada em `src/lib/taxCodes.ts`:

| Código (raiz) | Sigla |
|---|---|
| 0561, 0588 | IRRF |
| 1138 | CP PATRONAL |
| 1099 | CP SEGURADOS |
| 1082, 1170 | CP TERCEIROS |
| 2089, 3373 | IRPJ |
| 2372, 6012 | CSLL |
| 8109, 6912 | PIS |
| 2172 | COFINS |
| 5952, 5960, 5979, 5987 | CSRF |
| 6190, 6256 | COSIRF |

> [!note] Ponto em aberto
> No dicionário original em Python, o código `5952` aparecia duas vezes (`"PIS/COFINS/CSLL"` e depois `"CSRF"`); como chave duplicada num dict Python, a segunda sobrescreve a primeira. Foi replicado igual aqui (resolve pra `CSRF`), mas vale confirmar se isso é o comportamento correto na fonte original.

## Onde está o código
- `src/components/NewTaskModal.tsx` — tela e orquestração.
- `src/lib/parseDemandText.ts` — extração de guia/siglas do texto.
- `src/lib/matchEmpresa.ts` — motor de match de empresa.
- `src/lib/taxCodes.ts` — tabela código → sigla.
