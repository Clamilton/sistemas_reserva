---
tags: [sistema-demandas, finalização, técnico]
---

# Finalização e Mensagem Bitrix

← [[00 - Índice]] · Ver também [[05 - Quadro Kanban e Cronômetro]]

## Quando dispara

Automaticamente quando uma tarefa é arrastada pra coluna **Concluído** (`kind: done`) — abre um modal de finalização. Também pode ser reaberto depois pra reconsultar/copiar a mensagem (nos detalhes da tarefa).

## As duas mensagens

O formato **não é um PDF do PER/DCOMP real** — é uma mensagem de texto pronta pra colar no Bitrix, com um formato diferente por tipo de demanda:

### Compensação
```
Empresa "NOME DA EMPRESA" - Compensada, SIGLA1/SIGLA2
```
As siglas vêm do campo "Siglas" da tarefa (ver [[06 - Criação de Demandas]]), juntadas com `/`.

### Ressarcimento
```
Empresa "NOME DA EMPRESA" ressarcida, relatório no Bitrix.
```
Texto fixo — **não** lista siglas (diferente da compensação). Motivo: ressarcimento tem um relatório à parte já registrado no Bitrix, então a mensagem só sinaliza que o processo terminou.

> [!note] Por que dois formatos diferentes
> Isso foi definido diretamente pelo usuário durante o desenvolvimento, ajustando a partir do formato inicial "Empresa X - Compensada, [siglas]" que ele já usava. O texto de ressarcimento veio de um exemplo real que ele forneceu.

## Fluxo do modal

1. Mostra resumo (empresa, tipo, operador, tempo total desde `startedAt`).
2. Mensagem pré-preenchida (mas **editável** — texto livre antes de confirmar).
3. Botão **Copiar mensagem** — usa a Clipboard API quando disponível (contexto seguro/HTTPS); como o site roda em HTTP puro hoje, cai automaticamente num fallback (`document.execCommand('copy')` via um `<textarea>` temporário) — ver [[11 - Segurança]] pra entender por que isso é necessário.
4. **Confirmar finalização** — grava `finishedAt`, `finalMessage`, `finalizedById` (usuário autenticado).
5. **Cancelar (voltar tarefa)** — devolve a tarefa pra coluna anterior, sem finalizar (fica registrado no histórico como uma ida e volta).

## Onde está o código
- `src/components/FinalizeModal.tsx` — modal.
- `src/lib/finalMessage.ts` — geração das duas mensagens.
- `src/lib/clipboard.ts` — cópia com fallback.
- `server/src/routes/tasks.ts` — rota `POST /api/tasks/:id/finalize`.
