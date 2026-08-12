---
tags: [sistema-demandas, decisões, changelog]
---

# Histórico de Decisões

← [[00 - Índice]]

Registro cronológico das decisões importantes tomadas durante a construção do sistema, e o porquê de cada uma — pra não perder o contexto depois.

## 1. Início: protótipo local, sem backend

Na primeira conversa, antes de escrever qualquer código, foi perguntado explicitamente: multiusuário com backend desde já, ou protótipo local (só navegador, `localStorage`) pra validar o fluxo rápido primeiro? A escolha foi **protótipo local primeiro** — mais rápido de iterar, sem custo de infraestrutura.

Resultado: React + Vite + Tailwind + Zustand com `persist` em `localStorage`. Ver [[02 - Arquitetura]] pro estado atual (bem diferente disso).

## 2. Formato da mensagem de finalização

O pedido original era "finalização com PERDCOMP (documento PDF)". Depois de conversa, ficou claro que não era um PDF de verdade — era uma **mensagem de texto** pronta pra colar no Bitrix, com formatos diferentes pra compensação e o tipo que na época se chamava "ressarcimento" (depois renomeado pra "retificação" — ver item 10). Detalhado em [[08 - Finalização e Mensagem Bitrix]].

## 3. Bug do `crypto.randomUUID` em contexto inseguro

Ao expor o protótipo via IP público em HTTP puro (sem HTTPS), a tela ficou em branco. Causa: `crypto.randomUUID()` só existe em "contexto seguro" (HTTPS ou `localhost`) — usado na inicialização da store, quebrava a aplicação inteira antes de qualquer coisa renderizar. Corrigido com um gerador de ID alternativo (`src/lib/id.ts`) que cai num fallback manual quando a API nativa não existe. O mesmo problema existia pra `navigator.clipboard` — resolvido com fallback via `document.execCommand('copy')` (`src/lib/clipboard.ts`).

## 4. Guia de imposto vs. Sigla — a confusão inicial

O formulário tinha dois campos parecidos ("Guia de imposto" e "Sigla dos impostos") que pareciam redundantes. Investigando o repositório próprio do usuário (`github.com/Clamilton/compensacao`), ficou claro que **guia = Código da Receita** (número oficial, formato `XXXX-YY`) e **sigla é derivada dele** por uma tabela de conversão. O sistema passou a resolver a sigla automaticamente a partir do código, mantendo os dois campos editáveis. Detalhe completo em [[06 - Criação de Demandas]].

## 5. Match automático de empresa — e o bug do "Sabryna Luz"

Pedido: colar o texto e o sistema identificar sozinho a empresa, comparando contra uma base própria de empresas (CNPJ + Nome). Implementado com prioridade CNPJ exato → nome aproximado. Um teste real revelou um bug sério: sem match, o sistema chutava a primeira linha do texto como nome da empresa — e a primeira linha era `SABRYNA LUZ:` (nome de quem mandou a mensagem, não uma empresa). A correção foi radical: **removido todo tipo de "chute"** — sem match no cadastro, o campo fica em branco. Detalhado em [[06 - Criação de Demandas]].

## 6. A virada: de protótipo local pra sistema com banco de dados real

Depois de testar o protótipo, o usuário pediu explicitamente a migração pra banco de dados: **dados críticos, trabalhados com outras pessoas, precisam estar "bem guardados" e ser "prováveis"** (auditáveis) — algo que `localStorage` de navegador não garante (se limpar o cache, trocar de PC, ou o disco falhar, os dados somem sem rastro).

Isso disparou uma reformulação grande:
- **PostgreSQL** dedicado, em Docker, isolado dos outros serviços da VPS.
- **API própria** (Express + Prisma) substituindo o acesso direto ao `localStorage`.
- **Login individual por pessoa** (em vez do campo "Operador" livre), decidido depois de uma pergunta direta: como provar quem fez o quê, se qualquer um pode escolher qualquer nome num menu? A resposta foi login = operador, com toda ação gravando o autor a partir da sessão autenticada, nunca de um campo enviado pelo cliente.
- Deploy em **Docker Compose** com `restart: unless-stopped`, pra não depender de um processo manual (`npm run dev`) rodando numa sessão de terminal.

Detalhes técnicos completos em [[02 - Arquitetura]], [[03 - Modelo de Dados]], [[04 - Autenticação e Usuários]], [[10 - Infraestrutura e Deploy]].

## 7. Exposição pública vs. rede privada (Tailscale)

Pra o usuário (numa máquina diferente da VPS) conseguir ver o site, havia duas opções: abrir a porta pro IP público, ou usar o **Tailscale** (rede privada) já configurado na VPS — mais seguro, sem expor nada. O usuário optou por **expor publicamente** mesmo assim. Ficou registrado como risco aceito em [[11 - Segurança]].

## 8. Notificações: de "histórico" pra tempo real

A primeira versão de notificações só gravava eventos no banco — cada usuário só via o que **ele mesmo** tinha feito, sem atualização automática pros outros. O usuário pediu notificação de verdade, ao vivo. Escolhida a opção de **tempo real via WebSocket** (Socket.IO) em vez de checagem periódica (polling). No caminho, foi encontrado e corrigido um bug que derrubava o container inteiro a cada tentativa de conexão (import errado do pacote `cookie`) — detalhado em [[09 - Notificações em Tempo Real]].

## 9. Esta documentação

Pedido explícito: documentar tudo em Markdown interligado (estilo Obsidian), pra registrar o estado atual do sistema e as conexões entre os conceitos — o conjunto de notas que você está lendo agora, versionado num repositório GitHub próprio (`Clamilton/sistemas_reserva`) que serve como memória de alterações: cada rodada de mudanças no sistema gera uma atualização aqui + um commit novo.

## 10. Colunas renomeadas, prioridade com ordem obrigatória, pausa com motivo pro gestor

Pedido único com várias partes:
- **Colunas renomeadas**: "Fila" → "Aguardando Início", "Revisão" → "Em Pausa".
- **Cronômetro pausa de verdade** na coluna "Em Pausa" (decisão confirmada: o nome novo só fazia sentido se o tempo parasse de contar mesmo) — exigiu mudar o cálculo de tempo trabalhado de uma subtração simples (`finishedAt - startedAt`) pra uma soma dos períodos em colunas ativas (ver [[05 - Quadro Kanban e Cronômetro]]).
- **Motivo obrigatório ao pausar**, com pop-up antes do movimento acontecer (diferente do fluxo de finalização, que move e permite reverter depois).
- **Papel de gestor** criado (`User.isGestor`) especificamente pra receber essa notificação de motivo — decisão confirmada em vez de simplesmente destacar a notificação pra todo mundo, pra manter esse tipo de informação mais restrita.
- **Prioridade (Baixa/Média/Alta)** na criação da demanda, com bloqueio em cascata: não dá pra iniciar uma tarefa se houver outra de prioridade maior pendente; dentro de Alta/Média, tem que seguir ordem de criação (mais antiga primeiro); Baixa não tem essa exigência entre si. Testado extensivamente com múltiplos cenários (duas Alta, uma Baixa bloqueada por Alta criada depois dela, liberação após iniciar a mais antiga). Detalhe completo em [[14 - Prioridade e Pausa com Gestor]].

## 11. Ressarcimento renomeado pra Retificação

Pedido de renomear "Ressarcimento" pra "Retificação" em todo o sistema — o termo antigo não representava corretamente o processo real da equipe. Envolveu: renomear o valor do enum no banco (`ALTER TYPE ... RENAME VALUE`, preservando as tarefas já existentes com esse tipo, em vez de recriar a coluna), atualizar rótulos/badges na interface, e mudar o texto da mensagem final (`ressarcida` → `retificada`) — confirmado explicitamente que a mensagem deveria acompanhar a renomeação, não só o rótulo visual.

## 12. Tipo perguntado primeiro, sem pré-seleção

A escolha de Compensação/Retificação virou a **primeira pergunta** da tela de nova demanda (antes até de colar o texto), sem nenhuma opção pré-marcada — o resto do formulário só aparece depois de escolher. Decisão confirmada: bloquear o formulário (não só reordenar visualmente), porque "perguntando antes" só faz sentido de verdade se a pessoa for obrigada a decidir primeiro.

## 13. Campo de detalhes da retificação, sem o texto colado

Como Retificação não depende de identificar automaticamente a empresa a partir de um texto de grupo (diferente de Compensação), dois ajustes: um campo de texto livre, sem limite de caracteres, perguntando "Como será feita a retificação?" (só aparece pra esse tipo); e o campo "Cole o texto recebido" (com toda a extração automática de empresa/guia/siglas) passou a **não aparecer** quando o tipo é Retificação, já que não é necessário informá-lo — Empresa, CNPJ, Guia e Siglas continuam disponíveis, só que preenchidos manualmente nesse caso.

## 14. Log de auditoria separado do histórico de status

O `StatusHistoryEntry` já registrava a passagem de uma tarefa pelo Kanban, mas não cobria ações administrativas (exclusão de demanda, cadastro/exclusão de empresa, criação de usuário, mudança de poder de gestor). Criado um log próprio, só de leitura (`AuditLog`), com um helper único (`logAudit()`) chamado no fim de cada rota relevante — decisão explícita de que uma falha ao gravar o log **nunca** deveria derrubar a ação principal que o usuário pediu. Tela restrita a gestor. Detalhe em [[15 - Auditoria]].

## 15. Origem da solicitação e data de criação editável

Dois campos adicionados na criação da demanda: **Origem da solicitação** (de onde veio o pedido — padrão "Grupo de Comunicação e Atendimento", com opção de texto livre) e a possibilidade de **editar a data de criação** (`createdAt`) — pra registrar retroativamente um pedido que chegou antes de virar tarefa no sistema, em vez de forçar a hora exata do clique em "Criar". Ver [[06 - Criação de Demandas]].

## 16. Filtro de data com opção "Todos"

A barra de filtros do Kanban ganhou um intervalo de datas; a opção **"Todos"** foi pedida separadamente, pra limpar o intervalo e considerar o histórico completo sem precisar escolher uma data bem antiga manualmente. Ver [[05 - Quadro Kanban e Cronômetro]].

## 17. Visibilidade das demandas: restrita, depois reaberta pra todos

Numa fase intermediária, cada operador só via as demandas atribuídas a ele mesmo (gestores viam tudo). Foi pedido explicitamente reverter isso: **todo mundo vê todas as demandas**, independente de quem seja o operador — decisão de produto pra uma equipe pequena, onde ver o quadro completo é mais útil do que isolar por responsável. Ver [[05 - Quadro Kanban e Cronômetro]].

## 18. Porta do SPED Retificador (Python → TypeScript)

Pedido pra portar a ferramenta desktop `sped_retificador.py`/`calc_tributaria.py` (pasta `sped-retificador/` deste repositório) pra dentro do site, como mais uma página, rodando inteiramente no navegador (SPED contém dado fiscal sensível — decisão de nunca subir esse arquivo pro backend). Validado byte a byte contra o Python original em vários cenários sintéticos antes de considerar pronto.

Um SPED de produção real, testado depois, expôs um bug que o teste sintético não cobria: o código (**igual no Python e na porta**) inseria o registro novo `0500` sempre "logo antes do `0990`", sem considerar que um `0900` podia estar no meio do caminho — quebrando a ordem oficial do bloco 0 e sendo rejeitado pelo validador da Receita. Corrigido inserindo antes do primeiro entre `0600`/`0900`/`0990`. Detalhe completo (incluindo por que o teste sintético não pegou o bug) em [[16 - SPED Retificador]].

## 19. Permissões abertas: criar, excluir e delegar demanda

Exclusão e delegação (trocar o operador de uma demanda já existente) eram restritas a gestor; abertas pra **qualquer usuário autenticado** por pedido explícito — equipe pequena, confiança entre os membros, e toda ação continua rastreável em [[15 - Auditoria]] mesmo sem a restrição. Delegação também passou a gerar uma notificação direcionada só pro novo operador. Ver [[11 - Segurança]].

## 20. Notificação nativa do navegador + cards piscando

Pedido de dois reforços visuais pra "chegou demanda nova": uma notificação do sistema operacional (Notification API do navegador, pedida a permissão no login, disparada só quando a aba não está em foco pra não duplicar aviso) e um anel pulsante ao redor do card enquanto ele for "novo" — critério: `createdAt` mais recente que a última vez que o usuário teve a aba em foco (`localStorage`), cobrindo tanto quem está vendo em tempo real quanto quem reabre a aba depois de ausente. Ver [[09 - Notificações em Tempo Real]].

## 21. Compensação via PER/DCOMP: da extração ao texto pronto

A finalização de uma Compensação sempre exigiu escrever à mão um resumo dos valores compensados, olhando PDF por PDF do PER/DCOMP. Pedido pra portar a extração de uma ferramenta Python própria já existente (`github.com/Clamilton/compensacao`) e, a partir dela, **gerar o texto pronto** direto no modal de finalização — mesmo princípio de processamento 100% no navegador do item 18.

Levou várias rodadas de ajuste depois da primeira versão funcionar:
- A mensagem de PER/DCOMP estava **sobrescrevendo** a mensagem de conclusão no mesmo campo — viraram dois campos/botões de copiar independentes (ver [[08 - Finalização e Mensagem Bitrix]]).
- A contagem de "2ª/3ª compensação" primeiro considerava cada **PDF** como uma compensação — depois passou a considerar cada **demanda** (soltar vários PDFs na mesma demanda vira 1 bloco só; só conta como 2ª/3ª quando existe outra demanda da mesma empresa já finalizada no mesmo mês). Exigiu guardar (`Task.perdcompDados`) os débitos extraídos em cada demanda, pra recuperar depois.
- O rótulo do responsável oscilou entre "USUÁRIO QUE CONCLUIU DEMANDA" (só no caso de 1 única compensação) e "RESPONSÁVEL" (2+) — simplificado pra **sempre "RESPONSÁVEL"**, sempre com o operador da demanda, sempre em maiúsculo.
- Testado contra um PER/DCOMP real (não só dados sintéticos), o que expôs dois problemas de classificação de imposto no dicionário original (código `1082` mal rotulado, e várias entidades de "CP Terceiros" sem cobertura) — corrigidos priorizando o texto do PDF sobre o código quando o assunto é "CP ...", que agora vira uma única linha "INSS".

Detalhe técnico completo, incluindo os bugs encontrados com o PDF real, em [[17 - Compensação via PER-DCOMP]].

## 22. Fila de prioridade por operador, não global

Reportado com um caso concreto: uma demanda **Alta** atribuída a outra pessoa (Espedito) bloqueava o usuário de iniciar sua própria demanda **Baixa**, mesmo os dois não tendo relação nenhuma. A checagem de bloqueio (item de [[14 - Prioridade e Pausa com Gestor]]) considerava todas as tarefas do sistema — já estava registrada como ponto em aberto em [[13 - Pendências e Próximos Passos]] antes desse relato confirmar que devia mesmo ser por operador.

Corrigido filtrando a consulta de tarefas candidatas por `operadorId` — cada operador tem sua fila de prioridade independente das dos outros. O banner de "demanda mais urgente aguardando" no topo do Kanban tinha o mesmo problema (calculado sobre todas as tarefas) e recebeu o mesmo ajuste, senão mostraria um alerta que não bloqueia de verdade quem está vendo.

## 23. SPED Retificador: F100 também podia sair de ordem (mesma causa do bug do 0500)

Relatado com dois arquivos reais (original + retificado pelo modo de múltiplos SPEDs): erro de importação no validador do PVA. Investigação achou que `F100` — que no leiaute oficial é o primeiro filho de `F010`, antes de `F111`/`F120`/`F129`/`F130`/`F139`/`F150` — só era inserido levando em conta `F200` em diante como "saída do grupo". Um SPED real com registros `F120` (créditos de Ativo Imobilizado) fez o F100 novo entrar depois deles, fora de ordem — a mesma classe do bug do `0500`/`0900` do item anterior desta lista (registrado antes da criação deste histórico numerado, ver [[16 - SPED Retificador]]), só que num bloco diferente. O comentário do próprio código já citava F111/F120/F150 como deveriam disparar a inserção, mas o conjunto real usado não os incluía — sinal de que a intenção original era essa, só a implementação ficou incompleta (no Python original também).

Corrigido, e o mesmo padrão revisado preventivamente nos blocos M100→M110 e M500→M510 (risco idêntico, sem evidência de arquivo real que o acionasse ainda). Revalidado rodando `buildSped()` contra o SPED completo de 35 mil linhas que gerou o erro reportado — confirmado que F100 passa a ficar entre F010 e F120, e todos os fechamentos de bloco continuam batendo.

## 24. SPED Retificador: importar recibos por competência

No modo de múltiplos SPEDs, o recibo de cada arquivo tinha que ser digitado manualmente — repetitivo pra quem está retificando várias competências de uma vez. Pedido pra importar de um arquivo (exportação do e-CAC/PVA, tab-separated) que lista todas as competências já transmitidas de um CNPJ com seus recibos.

Detalhe que só apareceu testando contra um arquivo real fornecido pelo usuário: o recibo nessa exportação vem no formato `HASH-DÍGITO` (ex: `55D9ACB6878B47240ADA8FFADB48E817CE8D6194-3`), mas o campo do SPED não aceita o traço — precisa virar `55D9ACB6878B47240ADA8FFADB48E817CE8D61943` (hash + dígito concatenados). A função `normalizarRecibo()` que já existia (usada na digitação manual do recibo) já fazia exatamente essa limpeza, então a importação só precisou reaproveitá-la. Casamento de cada linha do arquivo importado com o SPED anexado é por CNPJ + competência (mês/ano de `DT_INI`). Validado com o arquivo real de 9 competências — todos os recibos bateram, incluindo o exemplo específico com traço que o usuário forneceu.
