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
- [x] Delegação de demanda já é direcionada só pro novo operador.
- [x] Notificação nativa do navegador quando chega demanda nova (com a aba fora de foco) + cards recém-criados piscando.
- [ ] Criação/movimentação/finalização continuam broadcast global (todo mundo vê tudo). Avaliar se faz sentido notificar só o operador responsável nesses casos também, ou manter global.
- [ ] Marcar notificação como lida por usuário — hoje "lida" é um estado único, compartilhado (marcar como lida pra um marca pra todos, exceto as direcionadas que já são por usuário).

## Quadro Kanban — [[05 - Quadro Kanban e Cronômetro]]
- [ ] Atualização otimista no drag-and-drop (hoje espera a resposta do servidor antes de mover visualmente).
- [ ] Reordenar/editar as colunas pela interface (hoje são fixas, definidas no seed do banco).

## Prioridade e Retificação — [[14 - Prioridade e Pausa com Gestor]] · [[06 - Criação de Demandas]]
- [x] A checagem de bloqueio por prioridade era global (considerava todas as tarefas do sistema) — corrigida pra ser por operador, cada fila é independente.
- [ ] O campo `retificacaoDetalhes` (como será feita a retificação) não é obrigatório hoje — avaliar se deveria ser.
- [ ] Não há edição de colunas/etapas adicionais além de Baixa/Média/Alta — se precisar de mais granularidade, revisitar `PRIORITY_RANK`.

## Finalização — [[08 - Finalização e Mensagem Bitrix]]
- [ ] Se algum dia fizer sentido, gerar um PDF de verdade no layout oficial do PER/DCOMP (hoje é só a mensagem de texto — decisão consciente, ver [[12 - Histórico de Decisões]]).

## Compensação via PER/DCOMP — [[17 - Compensação via PER-DCOMP]]
- [ ] Só compensações finalizadas **usando esse fluxo** (com `perdcompDados` salvo) entram na soma automática por empresa/mês — compensações antigas ou finalizadas sem anexar PDF ficam de fora.
- [ ] A extração de texto do PDF via `pdfjs-dist` não é garantidamente idêntica à do `pdfplumber` usado na ferramenta Python original — validada contra alguns PDFs reais, mas formatos de PER/DCOMP muito diferentes podem exigir ajuste no agrupamento de linhas.
- [ ] O de-para de código de receita → imposto (`extractor.ts`) só foi conferido contra PDFs com débitos de CP Patronal/Segurados/Terceiros — vale revisar contra um PDF real com IRRF/PIS/COFINS/IRPJ/CSLL/CSRF quando aparecer um.
- [ ] Tabela equivalente em `src/lib/taxCodes.ts` (usada na criação da demanda, não na finalização) ainda tem o mesmo código `1082` mal classificado — ver nota em [[06 - Criação de Demandas]].

## SPED Retificador — [[16 - SPED Retificador]]
- [ ] Validado byte a byte contra o Python original em cenários sintéticos e contra um SPED de produção real (que expôs e permitiu corrigir o bug do registro `0500`/`0900`) — mas a cobertura de casos reais ainda é pequena; vale ficar atento a outros arquivos que gerem erro no validador da Receita.
- [ ] **Em aberto:** PVA rejeita o `M105`/`M505` que a ferramenta gera pro crédito extemporâneo ("Não deverá existir um registro M105 ... para Código da Natureza da Base de Cálculo do Crédito e Código de Situação Tributária não informados nos documentos e operações"). Confirmado que o erro ocorre tanto no par `101` (placeholder zerado) quanto no `201` (crédito real) — ou seja, não é só sobre anexar num M100 alheio (isso já foi corrigido), é sobre o próprio `NAT_BC_CRED=13`/`CST=53` não ter nenhum documento (Bloco C/D) que o sustente nessa competência, o que é sempre verdade pra um crédito vindo de decisão judicial/Acórdão, não de uma nota fiscal do mês. Precisa de orientação de quem opera a ferramenta: existe um código de natureza/CST correto pra esse tipo de crédito (sem exigir documento), ou o placeholder `101` deveria simplesmente deixar de ser gerado? Ver detalhe em [[16 - SPED Retificador]].

## Auditoria — [[15 - Auditoria]]
- [ ] Não há paginação de verdade (só um limite de 500 registros por consulta) — se o log crescer muito, avaliar cursor/paginação.

## Infraestrutura — [[10 - Infraestrutura e Deploy]]
- [ ] Rotina de backup do volume do Postgres (`demandas-db-data`) — hoje os dados sobrevivem a reinício de container/VPS, mas não há backup externo configurado.
- [ ] Monitoramento/alertas se o container cair.
