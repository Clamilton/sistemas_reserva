---
tags: [sistema-demandas, finalização, técnico]
---

# Finalização e Mensagem Bitrix

← [[00 - Índice]] · Ver também [[05 - Quadro Kanban e Cronômetro]]

## Quando dispara

Automaticamente quando uma tarefa é arrastada pra coluna **Concluído** (`kind: done`) — abre um modal de finalização. Também pode ser reaberto depois pra reconsultar/copiar a mensagem (nos detalhes da tarefa).

## A mensagem de conclusão (Bitrix)

O formato **não é um PDF do PER/DCOMP real** — é uma mensagem de texto pronta pra colar no Bitrix, com um formato diferente por tipo de demanda:

### Compensação
```
*NOME DA EMPRESA* - Compensada, no bitrix(SIGLA1/SIGLA2)
```
As siglas vêm do campo "Siglas" da tarefa (ver [[06 - Criação de Demandas]]), juntadas com `/`. O nome da empresa vai entre asteriscos de propósito — é a sintaxe do WhatsApp pra **negrito**, já que a mensagem final é colada lá.

### Retificação
```
*NOME DA EMPRESA* retificada, relatório no Bitrix.
```
Texto fixo — **não** lista siglas (diferente da compensação). O tipo se chamava "Ressarcimento" originalmente; foi renomeado pra "Retificação" (nome/conceito mais correto pro processo real), e a palavra da mensagem acompanhou a mudança (`ressarcida` → `retificada`) — ver [[12 - Histórico de Decisões]].

> [!note] Por que dois formatos diferentes
> Isso foi definido diretamente pelo usuário durante o desenvolvimento, ajustando a partir do formato inicial "Empresa X - Compensada, [siglas]" que ele já usava. O texto de retificação veio de um exemplo real que ele forneceu; o negrito com asterisco e o "no bitrix(...)" vieram de um ajuste posterior.

## A segunda mensagem: PER/DCOMP (só Compensação)

Além da mensagem de conclusão acima, uma demanda de Compensação pode gerar uma **segunda mensagem**, separada — o texto detalhado dos valores compensados por imposto, extraído automaticamente dos PDFs de PER/DCOMP anexados no próprio modal. Tem campo e botão de copiar próprios, **não substitui** a mensagem de conclusão (as duas coexistem, com propósitos diferentes). Detalhe completo em [[17 - Compensação via PER-DCOMP]].

## Fluxo do modal

1. Mostra resumo (empresa, tipo, operador, tempo total desde `startedAt`).
2. **Se Compensação**: seção pra anexar PDFs de PER/DCOMP (opcional) — ver [[17 - Compensação via PER-DCOMP]].
3. Mensagem de conclusão pré-preenchida (mas **editável** — texto livre antes de confirmar).
4. Botão **Copiar mensagem de conclusão** — usa a Clipboard API quando disponível (contexto seguro/HTTPS); como o site roda em HTTP puro hoje, cai automaticamente num fallback (`document.execCommand('copy')` via um `<textarea>` temporário) — ver [[11 - Segurança]] pra entender por que isso é necessário.
5. **Confirmar finalização** — grava `finishedAt`, `finalMessage`, `finalizedById` (usuário autenticado) e, se houve upload de PDF, `perdcompDados`.
6. **Cancelar (voltar tarefa)** — devolve a tarefa pra coluna anterior, sem finalizar (fica registrado no histórico como uma ida e volta).

## Onde está o código
- `src/components/FinalizeModal.tsx` — modal, incluindo a seção de upload de PER/DCOMP.
- `src/lib/finalMessage.ts` — geração da mensagem de conclusão.
- `src/lib/perdcomp/*` — geração da mensagem de PER/DCOMP, ver [[17 - Compensação via PER-DCOMP]].
- `src/lib/clipboard.ts` — cópia com fallback.
- `server/src/routes/tasks.ts` — rota `POST /api/tasks/:id/finalize`.
