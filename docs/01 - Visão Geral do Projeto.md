---
tags: [sistema-demandas, visão-geral]
---

# Visão Geral do Projeto

← [[00 - Índice]]

## O problema que o sistema resolve

A equipe recebe pedidos de **compensação** e **retificação** de tributos por texto (colado de um grupo de mensagens). Cada mensagem geralmente contém, misturados no mesmo texto solto:

- o nome da empresa (às vezes com o CNPJ, às vezes só o nome);
- o(s) código(s) da receita / guia de imposto envolvido(s);
- menções a pessoas do grupo (`@Fulano`), que **não** são a empresa;
- às vezes o nome de quem mandou a mensagem na primeira linha, que **também não** é a empresa.

Antes do sistema, esse controle era manual. O objetivo é ter um quadro único onde cada pedido vira uma **demanda** rastreável: quem está cuidando, quanto tempo levou, e um jeito rápido de fechar com a mensagem certa pro Bitrix.

## Quem usa

Uma equipe pequena (múltiplas pessoas), cada uma com login próprio. Uma pessoa pode:
- criar uma demanda colando o texto recebido;
- ver o quadro Kanban com todas as demandas em andamento;
- mover uma demanda entre colunas conforme o trabalho avança;
- finalizar, gerando a mensagem de fechamento.

## Os dois tipos de demanda

- **Compensação** — pede pra colar o texto recebido (o sistema identifica empresa/guia/siglas sozinho); ao finalizar, gera: `Empresa "X" - Compensada, SIGLA1/SIGLA2` (siglas dos impostos envolvidos, separadas por barra).
- **Retificação** — não usa o texto colado; em vez disso, pede um campo de texto livre descrevendo como a retificação vai ser feita; ao finalizar, gera: `Empresa "X" retificada, relatório no Bitrix.` (texto fixo).

A escolha do tipo agora é a **primeira pergunta** ao abrir "Nova demanda" — o resto do formulário só aparece depois de escolher, sem nenhum tipo pré-selecionado. Ver [[06 - Criação de Demandas]].

Ver [[08 - Finalização e Mensagem Bitrix]] pro detalhe de como e por que esses dois formatos são diferentes.

## Os pilares do sistema

1. **Quadro Kanban com cronômetro que pausa de verdade** — [[05 - Quadro Kanban e Cronômetro]]
2. **Criação facilitada de demanda** (colar texto → sistema identifica empresa e guia sozinho, só pra Compensação) — [[06 - Criação de Demandas]]
3. **Cadastro de empresas próprio** (CNPJ + Nome) usado pra identificar a empresa no texto colado — [[07 - Cadastro de Empresas]]
4. **Notificações em tempo real** entre todos os usuários logados — [[09 - Notificações em Tempo Real]]
5. **Autenticação individual**, porque os dados são críticos e precisam de rastreabilidade real (quem fez o quê, quando) — [[04 - Autenticação e Usuários]]
6. **Prioridade/urgência com ordem obrigatória e pausa com motivo pro gestor** — [[14 - Prioridade e Pausa com Gestor]]

## Trajetória do projeto (resumo)

O sistema começou como um protótipo **100% local** (React + `localStorage`, sem servidor), pra validar o fluxo rápido. Depois de testado, foi decidido migrar pra uma arquitetura com **banco de dados real e login individual**, porque os dados são críticos e compartilhados entre a equipe. Essa migração está detalhada em [[12 - Histórico de Decisões]].
