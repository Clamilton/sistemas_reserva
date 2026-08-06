---
tags: [sistema-demandas, notificações, websocket, técnico]
---

# Notificações em Tempo Real

← [[00 - Índice]] · Ver também [[02 - Arquitetura]]

## O que existe

Toda vez que uma demanda é **criada**, **movida** de coluna ou **finalizada**, o backend:
1. Grava um registro em `Notification` (tipo, mensagem, data).
2. Transmite esse evento **na hora**, via WebSocket (Socket.IO), pra **todos** os usuários com o site aberto (broadcast global).

Exceção: a notificação de **motivo de pausa** (com o texto completo do motivo) não é broadcast — é **direcionada só pros usuários gestores**. Ver [[14 - Prioridade e Pausa com Gestor]] pro detalhe de como isso funciona (sala por usuário no Socket.IO).

Do lado do navegador, ao receber o evento:
- aparece um **toast** com a mensagem;
- o quadro Kanban e o sino de notificações são recarregados automaticamente (sem precisar dar F5).

## Por que WebSocket (e não só recarregar de tempos em tempos)

A primeira versão só criava a notificação no banco — cada usuário só via as notificações de ações que ele mesmo tinha feito, ou depois de recarregar a página manualmente. Ou seja, funcionava como um "histórico", não como "notificação" de verdade. A escolha, feita explicitamente pelo usuário, foi por entrega **instantânea** (em vez de checar o servidor a cada X segundos).

## Como a autenticação do socket funciona

O WebSocket usa o **mesmo cookie de sessão** do login normal (ver [[04 - Autenticação e Usuários]]):
1. Ao conectar, o cliente manda o cookie automaticamente (`withCredentials: true`).
2. No servidor, um middleware do Socket.IO (`server/src/socket.ts`) lê o cookie manualmente do handshake, valida o JWT, confirma que o usuário existe — só então aceita a conexão.
3. Conexão sem cookie válido é rejeitada (`"Não autenticado"`), sem derrubar o servidor.

## Escopo do broadcast (limitação parcialmente resolvida)

Os eventos de criação/movimentação/finalização continuam **globais** — todo usuário conectado recebe a notificação de **toda** demanda, não só das que ele criou ou é responsável. Pra uma equipe pequena isso tende a ser até desejável (todo mundo vê a atividade do time), mas não existe filtro por "só me avise das minhas". O motivo de pausa já é direcionado (só gestores) — ver [[14 - Prioridade e Pausa com Gestor]]. Restante da limitação em [[13 - Pendências e Próximos Passos]].

## Um bug real que apareceu aqui (vale registrar)

> [!bug] Container caindo a cada conexão
> Na primeira implementação, o middleware de autenticação do socket usava `import cookie from "cookie"` (import default) e chamava `cookie.parse(...)`. O pacote `cookie` não exporta um `default` — só funções nomeadas (`parse`, `serialize`). Isso fazia `cookie.parse` ser `undefined`, e a chamada explodia com `TypeError` **dentro** do tratamento de conexão do Socket.IO, o que derrubava o processo Node inteiro. Como o container tinha `restart: unless-stopped`, ele reiniciava sozinho — mas **toda tentativa de conexão derrubava a API de novo**, inclusive pra quem já estava usando o site.
>
> Corrigido trocando pra `import { parse as parseCookies } from "cookie"` (import nomeado) e envolvendo o middleware inteiro num `try/catch` que sempre chama `next(err)` em vez de deixar a exceção escapar. Validado depois com testes de conexão autenticada e não-autenticada, confirmando que o container não cai mais.

## Onde está o código
- `server/src/socket.ts` — servidor Socket.IO, autenticação do handshake, `broadcastNotification()` (global) e `notifyUser()` (direcionada, sala `user:<id>`).
- `server/src/routes/notifications.ts` — `pushNotification()` (global) e `pushNotificationToUsers()`/`notifyGestores()` (direcionadas).
- `src/lib/socket.ts` — cliente (conecta/desconecta).
- `src/App.tsx` — liga a conexão quando há usuário logado, ouve o evento `"notification"`.
