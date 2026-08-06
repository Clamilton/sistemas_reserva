---
tags: [sistema-demandas, auditoria, técnico]
---

# Auditoria

← [[00 - Índice]] · Ver também [[03 - Modelo de Dados]] · [[11 - Segurança]]

## O que é

Um log cronológico, só de leitura, de ações relevantes no sistema — separado do `StatusHistoryEntry` (que é só o histórico de movimentação de uma tarefa específica pelo Kanban). Cobre criação/movimentação/finalização/exclusão de demanda, mudança de prioridade, cadastro/edição/exclusão de empresa, importação de empresas, criação de usuário e mudança de poder de gestor.

Tela acessível só pra **gestores** (`isGestor = true`) — os mesmos que recebem a notificação direcionada de motivo de pausa (ver [[14 - Prioridade e Pausa com Gestor]]).

## Modelo

```
AuditLog {
  id, createdAt
  actorId (FK User, SetNull se o usuário for removido) · actorNome (cópia, sobrevive a exclusão do autor)
  action        // ex: "task.created", "task.deleted", "user.gestor_changed"
  entityType    // "Task", "Empresa", "User"
  entityId?     // id da entidade afetada, quando aplicável
  description   // texto pronto, já com os detalhes relevantes da ação
}
```

`actorNome` é gravado como cópia (não só a relação com `User`) de propósito — se o autor da ação for excluído depois, o registro de auditoria continua legível.

## Como é gravado

Um helper único, `server/src/lib/audit.ts` → `logAudit(...)`, chamado no fim de cada rota que muda estado relevante. Ponto importante: **nunca derruba a operação principal** — se a gravação do log falhar por qualquer motivo, só loga no console e segue (a ação que o usuário pediu já aconteceu; perder a auditoria dessa ação específica é preferível a falhar a operação toda por causa dela).

## Leitura

`GET /api/audit-logs` (`server/src/routes/auditLogs.ts`) — `403` se quem pede não é gestor. Aceita `dateFrom`/`dateTo` (filtra por `createdAt`) e `search` (contém, case-insensitive, em `description` ou `actorNome`), limitado a 500 registros por página (200 por padrão).

## Onde está o código
- `server/prisma/schema.prisma` — modelo `AuditLog`.
- `server/src/lib/audit.ts` — `logAudit()`.
- `server/src/routes/auditLogs.ts` — rota de leitura.
- `src/components/Auditoria.tsx` — tela (busca, filtro de data, tags coloridas pras ações mais sensíveis: exclusão de demanda/empresa, mudança de poder de gestor).
