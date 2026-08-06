---
tags: [sistema-demandas, notificações, websocket, técnico]
---

# Notificações em Tempo Real

← [[00 - Índice]] · Ver também [[02 - Arquitetura]]

## O que existe

Toda vez que uma demanda é **criada**, **movida** de coluna, **finalizada** ou **delegada**, o backend:
1. Grava um registro em `Notification` (tipo, mensagem, data).
2. Transmite esse evento **na hora**, via WebSocket (Socket.IO), pra **todos** os usuários com o site aberto (broadcast global) — exceto `paused` e `delegated`, que são direcionadas.

Exceções direcionadas (não são broadcast):
- **Motivo de pausa** (com o texto completo do motivo) — só pros usuários **gestores**. Ver [[14 - Prioridade e Pausa com Gestor]].
- **Delegação** (`delegated`) — só pro **novo operador** da demanda, quando ela é reatribuída (ver [[05 - Quadro Kanban e Cronômetro]]).

Do lado do navegador, ao receber o evento:
- aparece um **toast** com a mensagem;
- o quadro Kanban e o sino de notificações são recarregados automaticamente (sem precisar dar F5);
- se o evento é de demanda **criada**, o card entra piscando (ver seção abaixo) e, se a permissão foi concedida, dispara uma **notificação nativa do navegador**.

## Notificação nativa do navegador (Chrome/etc.)

Além do toast (que só é visto se a aba estiver aberta e em foco), o sistema pede permissão de `Notification` do navegador assim que o usuário loga, e dispara uma notificação do sistema operacional quando chega uma demanda nova **e a aba não está em foco** — se o usuário já está olhando o Kanban, o toast + o card piscando já bastam, sem duplicar aviso. Clicar na notificação foca a aba.

Implementado só no lado do cliente (`src/lib/browserNotify.ts`) — não depende de nenhum serviço externo de push (não é web push de verdade, que funcionaria com a aba fechada; é a Notification API do navegador, que exige a aba estar aberta em algum lugar, só não necessariamente em foco).

## Cards de demanda recém-criada piscam

Cada demanda tem, no navegador, uma marca de "última vez que a aba esteve em foco" (`localStorage`, `src/lib/lastSeen.ts`). Uma demanda pisca (anel pulsante ao redor do card) quando `createdAt` é mais recente que essa marca — cobre dois casos:
- **Tempo real**: chega um evento `created` via WebSocket enquanto a aba está aberta — o card novo aparece já piscando.
- **Reabrir a aba**: o usuário estava ausente, volta pra aba (evento `visibilitychange`/`focus`), e qualquer demanda criada nesse intervalo pisca.

Para de piscar quando o usuário abre o card (marca como "visto"). Ver `src/store/useAppStore.ts` (`novosIds`, `verificarNovasDemandas`, `marcarTaskVista`).

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
- `src/lib/browserNotify.ts` — pede permissão, dispara notificação nativa do navegador.
- `src/lib/lastSeen.ts` — marca de "última vez em foco", base do piscar de cards novos.
- `src/App.tsx` — liga a conexão quando há usuário logado, ouve o evento `"notification"`, ouve `visibilitychange`/`focus` pra recalcular cards novos.
