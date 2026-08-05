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
