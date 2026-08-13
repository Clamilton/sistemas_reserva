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

## 25. SPED Retificador: processamento em Web Worker

Relatado que a geração de múltiplas SPEDs retificadoras travava a aba, principalmente com os arquivos grandes (~2,6MB/35 mil linhas) usados pra testar os bugs dos itens 23/24. Pergunta natural do usuário: dava pra jogar esse processamento pro backend? Recomendado que não — isso quebraria a decisão de arquitetura de que o SPED nunca sai do navegador (mesmo raciocínio de [[17 - Compensação via PER-DCOMP]]) — e proposto **Web Worker** no lugar: outra thread, mesmo navegador, mesma máquina do usuário, mas fora da thread que trava a UI. Usuário aprovou ("Pode implementar.").

Maior obstáculo técnico foi o TypeScript: `lib: DOM` (usado pelo app) e `lib: WebWorker` (usado pelo worker) declaram um `self` global incompatível, não compilam juntos. Resolvido isolando o worker no seu próprio `tsconfig.worker.json`, referenciado em `tsconfig.json` e excluído de `tsconfig.app.json` — dois programas TS independentes. Também foi preciso separar as funções puras (sem DOM) de `io.ts` num módulo novo (`encode.ts`), já que o worker não tem acesso a `document`/`Blob`.

O worker mantém cache das leituras em memória (por nome de arquivo) pra não precisar transferir o array de linhas inteiro de volta e pra frente a cada geração — só o resumo cruza a fronteira na leitura, e os bytes finais (como `Uint8Array` transferível, sem cópia) na geração. `Decimal` não sobrevive ao `postMessage` (structured clone não sabe serializar), então o crédito atravessa como string. Detalhe técnico completo em [[16 - SPED Retificador]].

Validado ao vivo no navegador contra os mesmos arquivos reais que expuseram os bugs de hierarquia: leitura e geração (single e múltiplos) completam em segundos com a aba respondendo normalmente durante o processamento — confirmado com uma captura de tela feita no meio da geração, sem atraso proposital, que não travou.

## 26. SPED Retificador: dropdown de "Nome Conta Analítica" não mostrava opções

Reportado: clicar no campo não mostrava nenhuma opção pra selecionar. Causa raiz encontrada por inspeção do código, não do DOM em si (dropdown nativo de `<datalist>` não é capturável por screenshot de automação de navegador) — o valor padrão pré-preenchido no campo ("LANCAMENTO DE CREDITO EXTEMPORANEO ACORDAO 9303009893") não é nenhuma das 8 opções cadastradas, e o navegador filtra as sugestões do `<datalist>` pelo texto já presente no campo. Sem nenhuma opção batendo com esse texto, o resultado é sempre zero sugestões — o dropdown "não fazia nada" porque não tinha o que mostrar, não por estar quebrado.

Corrigido limpando o campo ao focar (revela as 8 opções) e restaurando o valor anterior ao perder o foco sem escolha, pra não afetar quem nunca mexe nesse campo. Detalhe técnico completo em [[16 - SPED Retificador]].

## 27. Fila de prioridade por operador: confirmado que vale também pra gestor

Reportado "de novo" um bloqueio de prioridade parecendo o bug do item 22 — usuário bloqueado tentando iniciar uma demanda, citando uma demanda Alta que "não é minha". Investigado direto na API (reproduzido a chamada de `PATCH /:id/move` manualmente): não era regressão do fix do item 22. O usuário (gestor) estava movendo o card de **outro operador**, e tanto a demanda sendo iniciada quanto a demanda Alta bloqueadora eram desse mesmo outro operador — ou seja, a fila por operador estava correta, só que aplicada à fila de quem é dono do card, não à do gestor que arrasta.

Perguntado diretamente: gestor deveria conseguir pular a ordem de prioridade de outro operador? Resposta: não, deve continuar bloqueando — mesmo um gestor não deve conseguir iniciar a demanda Baixa de alguém enquanto a Alta dessa mesma pessoa está esperando. Nenhuma mudança de código; documentado aqui pra não reabrir a investigação à toa numa próxima vez que alguém relatar algo parecido.

## 28. SPED Retificador: tabela de prévia (múltiplos) sem Base + cabeçalho fixo

Reportado que a coluna Base de Cálculo estava faltando na tabela de prévia do modo múltiplos (só tinha Valor do Mês/PIS/COFINS — o modo arquivo único já mostrava Base, só não estava replicado na tabela). Pedido também pra fixar o cabeçalho da tabela, já que ela rola verticalmente (`max-h-64 overflow-y-auto`) quando tem muitos arquivos anexados.

Adicionada a coluna Base (usa o mesmo `calc.base` que já era calculado por arquivo, só não estava sendo renderizado) e cabeçalho `sticky top-0` com fundo sólido. Validado ao vivo anexando os 2 arquivos reais de PIS/COFINS usados nos testes anteriores (viraram 9 competências) — Base aparece com valor correto em cada linha, e o cabeçalho fica fixo durante o scroll.

## 29. SPED Retificador: matriz + filiais no mesmo arquivo — 0150/F100 pegava a empresa errada

Reportado: com mais de uma empresa no `0140` (matriz e filiais), o gerador usa a empresa da **primeira linha** do bloco `0140` pro `0150` novo — deveria sempre usar a matriz, identificada pelo CNPJ terminando em `/0001` antes do dígito verificador. A mesma seleção também definia em qual seção do bloco F o `F100` novo entra, então o problema afetava os dois registros, não só o `0150`.

Causa: `info0140()` em [[16 - SPED Retificador|parser.ts]] retornava o primeiro `0140` encontrado, sem nenhuma noção de matriz/filial — comportamento nunca exposto antes porque todo SPED usado nos testes anteriores desta sessão tinha só um estabelecimento. Corrigido fazendo `info0140()` preferir o `0140` cujo CNPJ (12 dígitos antes do DV) termina em `0001`, com fallback pro primeiro registro se nenhum bater. Validado com SPED sintético (filial antes da matriz tanto no `0140` quanto no `F010` do bloco F) — `0150` e `F100` novos passam a sair associados à matriz — e reconfirmado que arquivos de um único estabelecimento continuam resolvendo pro mesmo CNPJ de antes (sem regressão nos testes anteriores).

## 30. SPED Retificador: M105/M505 podia contaminar crédito real do contribuinte — e ainda assim o PVA rejeita (aberto)

Usuário reportou "de novo" erro no PVA, com um SPED real de 2 estabelecimentos e o relatório de erros da própria Receita anexado. O fix do item 29 (matriz) resolveu o erro de `COD_PART`/`0150` desse arquivo, confirmado comparando o relatório de erros linha a linha contra a saída da ferramenta — mas sobraram 4 erros de `M105`/`M505`.

Investigado o código de reaproveitamento de `M100`/`M500`: a busca por um registro existente (pra "somar" o crédito nele, pensada pro cenário de rodar a ferramenta de novo sobre um SPED que ela mesma já retificou) não checava se o registro achado era realmente "nosso" — bastava bater `COD_CRED`+alíquota, o que também combina com um `M100|101` genuíno do contribuinte (código muito comum: "Aquisição de Bens para Revenda"). No arquivo do relato, isso fez a ferramenta anexar um `M105|13|53` novo (sem documento nenhum por trás) como filho de um crédito real do contribuinte. Corrigido: só reaproveita se o `M100`/`M500` achado já tiver o filho `M105`/`M505|13|53` que só a própria ferramenta cria — sem isso, sempre cria um par novo e dedicado.

Esse fix é real e foi validado (o `M100|101` real do contribuinte não é mais contaminado), mas **não resolve os 4 erros do relatório** — refeito o teste contra o mesmo arquivo, tanto o par `101` quanto o `201`, cada um já em seu próprio `M100`/`M500` (o `201` nunca existiu nesse arquivo, então já era "novo" mesmo antes do fix, e mesmo assim aparece no relatório de erros original), continuam rejeitados pelo PVA com a mesma mensagem: o `NAT_BC_CRED=13`/`CST=53` não tem documento (Bloco C/D) que o sustente na competência — esperado, já que o crédito vem de um Acórdão, não de uma nota fiscal do mês. Registrado como pendência em [[13 - Pendências e Próximos Passos]] — precisa de orientação de quem opera a ferramenta sobre o código correto pra esse tipo de crédito antes de tentar mais uma correção às cegas.

## 31. SPED Retificador: removido o placeholder M100|101/M500|101 (chave duplicada)

Usuário reportou mais um erro do PVA, com outra empresa (AUTO POSTO PARASAO LTDA), dessa vez sem anexar o SPED — só o PDF de erros. O relatório mostrou 12 erros: 4 de "Duplicidade de ocorrência da chave" (`COD_CRED`, `IND_CRED_ORI`, `ALIQ_PIS`/`COFINS`, `ALIQ_QUANT`) em `M100`/`M500|101`, e 8 de "Deverá existir um registro M105/M505" (o oposto do erro anterior — "não deverá existir") pros `NAT_BC_CRED` 01/04/12/13 desse mesmo grupo.

Causa: o fix do item 30 passou a criar **sempre** um par `M100`/`M500` novo e dedicado quando não achava o marcador "nosso" — isso incluía o placeholder `101` (zerado). Como esse placeholder sempre usa a alíquota padrão (1,65%/7,60%), a mesma de praticamente qualquer `101` real do contribuinte, criar um segundo registro com essa chave é uma violação direta da unicidade do SPED — o PVA rejeita imediatamente, e isso aparentemente confunde o agrupamento `M100`→`M105` do validador o suficiente pra também reportar os `M105` **reais** (natureza 01/04/12) daquele grupo como "faltando".

Reconsiderado o próprio placeholder: ele nunca carregou crédito nenhum (sempre `VL_CRED=0`) — só declarava a mesma base do crédito extemporâneo sob um código "sem alocação", redundante com o `M100|201` (que já tem o crédito real). Removido de vez (`linhaM100_101`/`linhaM105_101`/`linhaM500_101`/`linhaM505_101` e a lógica de inserção associada) — só o par `201` dedicado continua sendo gerado. Validado contra o SPED do item 29/30 (que já tinha `M100|101`/`M500|101` reais e legítimos): sem duplicidade de chave, os registros reais saem intocados, exatamente 1 par `201` novo carrega o crédito.

Isso resolve estruturalmente a duplicidade de chave, mas **não confirma** se o `M100|201`/`M105` sozinho passa no PVA sem o problema original do item 30 (`NAT_BC_CRED=13`/`CST=53` sem documento) — segue como pendência em [[13 - Pendências e Próximos Passos]] até o usuário testar de novo no validador da Receita.

## 32. SPED Retificador: crédito extemporâneo confirmado no grupo M100|101, não M100|201

Usuário testou a versão do item 31 (sem placeholder `101`) na mesma empresa (AUTO POSTO PARASAO LTDA) — de 12 erros caiu pra só 2, e ambos eram do mesmo tipo, agora bem específicos: *"Deverá existir um registro M105/M505 ... (COD_CRED = 101, ..., NAT_BC_CRED = 13, CST_PIS = 53)"*. O próprio validador da Receita estava dizendo, sem ambiguidade nenhuma, onde esse detalhamento deveria estar: no grupo `COD_CRED=101` — o crédito normal do contribuinte —, não isolado num `201` como a ferramenta (e o Python original) sempre fez.

Reconsiderado o histórico completo dos itens 30/31 à luz dessa confirmação: a rejeição "não deverá existir" do item 30 provavelmente nunca foi sobre "anexar a um M100 alheio ser errado" em si — era porque, ao anexar o `M105|13|53`, o `M100|101` pai não tinha sua própria base/crédito somados (ficavam exatamente como estavam, zerados pra essa parcela), uma inconsistência pai-filho que o PVA pega. As tentativas anteriores (isolar num `201` dedicado) estavam resolvendo o sintoma errado.

Corrigido: o crédito extemporâneo agora soma no `M100|101`/`M500|101` existente — base e crédito **também no registro pai** (antes só o filho `M105` recebia valor) — e no `M105`/`M505|13|53` filho, na mesma alíquota padrão. Sem nenhum `M100|101`/`M500|101` prévio no arquivo, cria o par completo com valores reais (não mais um placeholder zerado). `fimGrupoM100()`, removida no item 31 por ficar sem uso, voltou — agora usada pra posicionar o `M105`/`M505|13|53` novo dentro de um grupo que já existe mas ainda não tem esse filho.

Validado localmente contra o SPED que tem `M100|101`/`M500|101` reais com 5 naturezas cada: o pai passa a somar base+crédito (original + extemporâneo) corretamente, os filhos reais continuam intactos, e exatamente 1 `M105`/`M505|13|53` novo entra no grupo. **Ainda sem confirmação de 0 erros no PVA com esta versão específica** — depende do próximo teste do usuário. Detalhe técnico completo (as três tentativas em sequência) em [[16 - SPED Retificador]].
