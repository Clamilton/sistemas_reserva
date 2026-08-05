---
tags: [sistema-demandas, pendências, todo]
---

# Pendências e Próximos Passos

← [[00 - Índice]]

Lista do que é **sabidamente incompleto** hoje, organizada por nota relacionada.

## Dados
- [ ] Reimportar a lista completa de empresas (~209) — a versão local antiga não migrou pro banco automaticamente. Ver [[07 - Cadastro de Empresas]].
- [ ] Remover as empresas de teste usadas durante o desenvolvimento (RGS Engenharia, Cooperativa Agrícola do Sul foram usadas pra validar o sistema — mas também são empresas reais da lista, então provavelmente não precisam ser removidas, só conferir se os dados batem com o cadastro real).

## Autenticação — [[04 - Autenticação e Usuários]]
- [ ] Tela de trocar senha.
- [ ] Fluxo de "esqueci minha senha".
- [ ] Trocar a senha do usuário `clailton` (criada via bootstrap, entregue em texto no chat).
- [ ] Definir se faz sentido ter um papel de "administrador" (hoje qualquer usuário logado pode criar outro usuário).

## Segurança — [[11 - Segurança]]
- [ ] HTTPS (domínio + certificado) — hoje o tráfego (incluindo login) não é criptografado.
- [ ] Depois do HTTPS, mudar `COOKIE_SECURE` pra `true`.
- [ ] Rate limiting no login.
- [ ] Avaliar migrar de exposição pública pra Tailscale (rede privada já disponível na VPS).

## Notificações — [[09 - Notificações em Tempo Real]]
- [ ] Hoje é broadcast global (todo mundo vê tudo). Avaliar se faz sentido notificar só o operador responsável, ou manter global (pode ser intencional pra uma equipe pequena que quer visibilidade total).
- [ ] Marcar notificação como lida por usuário — hoje "lida" é um estado único, compartilhado (marcar como lida pra um marca pra todos).

## Quadro Kanban — [[05 - Quadro Kanban e Cronômetro]]
- [ ] Atualização otimista no drag-and-drop (hoje espera a resposta do servidor antes de mover visualmente).
- [ ] Reordenar/editar as colunas pela interface (hoje são fixas, definidas no seed do banco).

## Finalização — [[08 - Finalização e Mensagem Bitrix]]
- [ ] Se algum dia fizer sentido, gerar um PDF de verdade no layout oficial do PER/DCOMP (hoje é só a mensagem de texto — decisão consciente, ver [[12 - Histórico de Decisões]]).

## Infraestrutura — [[10 - Infraestrutura e Deploy]]
- [ ] Rotina de backup do volume do Postgres (`demandas-db-data`) — hoje os dados sobrevivem a reinício de container/VPS, mas não há backup externo configurado.
- [ ] Monitoramento/alertas se o container cair.
