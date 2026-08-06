---
tags: [sistema-demandas, empresas, técnico]
---

# Cadastro de Empresas

← [[00 - Índice]] · Ver também [[06 - Criação de Demandas]]

## Pra que serve

Base própria de **CNPJ + Nome** usada como referência pra identificar automaticamente a empresa quando um texto é colado na criação de demanda (ver [[06 - Criação de Demandas]]). Sem estar cadastrada, uma empresa não é reconhecida automaticamente — precisa ser digitada na mão (e, idealmente, cadastrada em seguida).

## Origem dos dados

A lista real (na época da documentação, ~209 empresas) vem de um arquivo local do usuário: `C:\Users\Usuario\Desktop\lista de empresas.txt`, no formato:

```
27.628.991/0001-08| Nome:  NANA NENE COMERCIO DE ARTIGOS INFANTIS LTDA
24.495.141/0001-90| Nome:  LONDRI CAFE CAFETERIA E LANCHONETE LTDA
```

## Como cadastrar

Na tela **Empresas**:
- **Adicionar manualmente** — um CNPJ + nome por vez.
- **Importar lista** — cola o `.txt` inteiro (mesmo formato acima) e clica em Importar. O parser (`src/lib/parseEmpresaList.ts`) reconhece o CNPJ por regex e pega o resto da linha como nome, removendo o rótulo `Nome:` e separadores (`|`, `-`, `:`, `;`) automaticamente. Também aceita formatos mais simples (`CNPJ - Nome`, `CNPJ  Nome`), não só o formato com `| Nome:`.
- Importação é **idempotente por CNPJ**: se o CNPJ já existe, atualiza o nome (não duplica); relatório final mostra quantas foram adicionadas e quantas atualizadas.

## Importante — dado local, não centralizado (histórico)

Numa fase anterior do projeto (antes da migração pro banco de dados), essa lista foi importada uma vez num protótipo que guardava tudo em `localStorage` do navegador. Quando o sistema migrou pra ter banco de dados de verdade, **esses dados não migraram automaticamente** — precisou reimportar a lista completa depois do login passar a existir. Ver [[12 - Histórico de Decisões]] pra entender essa transição.

## Onde está o código
- `src/components/EmpresasModal.tsx` — tela.
- `src/lib/parseEmpresaList.ts` — parser da lista colada.
- `server/src/routes/empresas.ts` — API (`GET/POST /api/empresas`, `DELETE /api/empresas/:id`, `POST /api/empresas/import`).
