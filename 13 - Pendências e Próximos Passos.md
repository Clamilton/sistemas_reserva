---
tags: [sistema-demandas, pendências, todo]
---

# Pendências e Próximos Passos

← [[00 - Índice]]

Lista do que é **sabidamente incompleto** hoje, organizada por nota relacionada.

## Dados
- [x] Reimportar a lista completa de empresas — já há demandas reais criadas referenciando empresas do cadastro (ex: Vitrine Móveis, RGS Engenharia). Ver [[07 - Cadastro de Empresas]].

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

## Notificações — [[09 - Notificações em Tempo Real]] · [[14 - Prioridade e Pausa com Gestor]]
- [x] Motivo de pausa já é direcionado só pros gestores (não é mais só broadcast global).
- [ ] Criação/movimentação/finalização continuam broadcast global (todo mundo vê tudo). Avaliar se faz sentido notificar só o operador responsável nesses casos também, ou manter global.
- [ ] Marcar notificação como lida por usuário — hoje "lida" é um estado único, compartilhado (marcar como lida pra um marca pra todos, exceto as direcionadas que já são por usuário).

## Quadro Kanban — [[05 - Quadro Kanban e Cronômetro]]
- [ ] Atualização otimista no drag-and-drop (hoje espera a resposta do servidor antes de mover visualmente).
- [ ] Reordenar/editar as colunas pela interface (hoje são fixas, definidas no seed do banco).

## Prioridade e Retificação — [[14 - Prioridade e Pausa com Gestor]] · [[06 - Criação de Demandas]]
- [ ] O campo `retificacaoDetalhes` (como será feita a retificação) não é obrigatório hoje — avaliar se deveria ser.
- [ ] A checagem de bloqueio por prioridade é global (considera todas as tarefas do sistema, não só as do operador). Confirmar se é o comportamento desejado pra equipes maiores.
- [ ] Não há edição de colunas/etapas adicionais além de Baixa/Média/Alta — se precisar de mais granularidade, revisitar `PRIORITY_RANK`.

## Finalização — [[08 - Finalização e Mensagem Bitrix]]
- [ ] Se algum dia fizer sentido, gerar um PDF de verdade no layout oficial do PER/DCOMP (hoje é só a mensagem de texto — decisão consciente, ver [[12 - Histórico de Decisões]]).

## Infraestrutura — [[10 - Infraestrutura e Deploy]]
- [ ] Rotina de backup do volume do Postgres (`demandas-db-data`) — hoje os dados sobrevivem a reinício de container/VPS, mas não há backup externo configurado.
- [ ] Monitoramento/alertas se o container cair.
