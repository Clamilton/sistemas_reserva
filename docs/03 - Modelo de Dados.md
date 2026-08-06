---
tags: [sistema-demandas, banco-de-dados, técnico]
---

# Modelo de Dados

← [[00 - Índice]] · Ver também [[02 - Arquitetura]]

Schema definido em `server/prisma/schema.prisma`. Todas as tabelas usam `id` do tipo UUID.

## Diagrama de relacionamento

```mermaid
erDiagram
    User ||--o{ Task : "cria (createdBy)"
    User ||--o{ Task : "é responsável (operador)"
    User ||--o{ Task : "finaliza (finalizedBy)"
    User ||--o{ StatusHistoryEntry : "muda status (changedBy)"
    User ||--o{ Notification : "recebe (se direcionada)"
    Empresa |o--o{ Task : "referenciada por"
    Column ||--o{ Task : "contém"
    Task ||--o{ StatusHistoryEntry : "tem histórico"

    User {
        string id
        string username
        string passwordHash
        string nome
        boolean isGestor
    }
    Empresa {
        string id
        string cnpj
        string nome
    }
    Column {
        string id
        string title
        enum kind
        int order
    }
    Task {
        string id
        string empresaNome
        string cnpj
        string guiaImposto
        string_array siglasImpostos
        enum tipo
        string retificacaoDetalhes
        enum prioridade
        string rawText
        datetime startedAt
        datetime finishedAt
        string finalMessage
    }
    StatusHistoryEntry {
        string id
        string columnId
        string columnTitle
        enum columnKind
        string motivo
        datetime enteredAt
        datetime exitedAt
    }
```

## Tabelas

### `User` (usuários / operadores)
Cada pessoa da equipe tem uma conta própria. **É a mesma entidade que "operador"** — não existe mais um cadastro de operador separado de login (ver [[12 - Histórico de Decisões]]).

| Campo | Tipo | Observação |
|---|---|---|
| `username` | string, único | login (minúsculo) |
| `passwordHash` | string | bcrypt, nunca a senha em texto puro |
| `nome` | string | nome de exibição |
| `isGestor` | boolean, default `false` | recebe as notificações direcionadas de motivo de pausa — ver [[14 - Prioridade e Pausa com Gestor]] |

### `Empresa` (cadastro de empresas)
Base de CNPJ + Nome usada pra identificar automaticamente a empresa no texto colado ao criar uma demanda. Ver [[07 - Cadastro de Empresas]].

### `Column` (colunas do Kanban)
Fixas hoje, semeadas por `server/prisma/seed.ts`:

| id | título | kind |
|---|---|---|
| `fila` | Aguardando Início | `queue` |
| `andamento` | Em Andamento | `active` |
| `revisao` | Em Pausa | `paused` |
| `concluido` | Concluído | `done` |

O campo `kind` controla comportamento (ver [[05 - Quadro Kanban e Cronômetro]]):
- `queue` — ainda não iniciada, cronômetro parado.
- `active` — cronômetro rodando (primeira vez que a tarefa entra numa coluna que não é `queue`, grava `startedAt`).
- `paused` — cronômetro **pausado** (o tempo nesse período não conta no total trabalhado); exige motivo, que vira notificação pro gestor.
- `done` — dispara a tela de finalização.

### `Task` (demanda)
A entidade central. Campos importantes:

| Campo | Observação |
|---|---|
| `empresaNome`, `cnpj`, `empresaId` | `empresaId` é opcional — só é preenchido quando a empresa foi encontrada no cadastro; `empresaNome`/`cnpj` ficam gravados direto na tarefa mesmo assim (histórico não depende do cadastro não ser editado depois) |
| `guiaImposto` | Código(s) da Receita, ex: `2089-01, 2372-01` |
| `siglasImpostos` | array de siglas, ex: `["IRPJ", "CSLL"]` |
| `tipo` | `compensacao` \| `retificacao` (renomeado de `ressarcimento` — ver [[12 - Histórico de Decisões]]) |
| `retificacaoDetalhes` | texto livre, sem limite, só preenchido quando `tipo = retificacao` — descreve como a retificação vai ser feita |
| `prioridade` | `baixa` \| `media` \| `alta` — controla a ordem obrigatória de início, ver [[14 - Prioridade e Pausa com Gestor]] |
| `rawText` | o texto original colado — só usado/preenchido pra Compensação; guardado pra auditoria |
| `createdById` | **quem criou** — sempre o usuário autenticado, nunca um campo enviado pelo cliente |
| `operadorId` | quem está designado a trabalhar a demanda (escolhido num dropdown ao criar) |
| `startedAt` / `finishedAt` | preenchidos automaticamente pelas regras do Kanban |
| `finalMessage` | a mensagem final gerada (Bitrix) |
| `finalizedById` | quem confirmou a finalização |

### `StatusHistoryEntry` (histórico de status)
Uma linha por passagem da tarefa por uma coluna. Registra `enteredAt`/`exitedAt`, **`changedById`** (sempre o usuário autenticado que fez a ação, nunca informação vinda do front), **`columnKind`** (cópia do tipo da coluna no momento — usada pra somar só os períodos "ativos" no cálculo de tempo trabalhado) e **`motivo`** (preenchido só na entrada que representa uma pausa). É essa tabela que permite responder "quanto tempo ficou em cada etapa", "quem moveu pra onde" e "por que foi pausada".

### `Notification`
Log de eventos (`created`, `moved`, `finalized`, `paused`) com mensagem pronta pra exibir. A maioria é **global** (todo mundo vê), exceto a notificação de tipo `paused` com o motivo, que é **direcionada** só pros usuários com `isGestor = true` via `recipientUserId` (ver [[14 - Prioridade e Pausa com Gestor]]).

## Regra de ouro do schema

> Nenhum campo de "quem fez a ação" (`createdById`, `changedById`, `finalizedById`) é aceito vindo do cliente. Todos são preenchidos no backend a partir do usuário autenticado na sessão. Essa é a base técnica que sustenta "provar quem fez o quê" — ver [[04 - Autenticação e Usuários]] e [[11 - Segurança]].
