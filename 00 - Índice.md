---
tags: [sistema-demandas, moc, índice]
---

# Controle de Demandas — Índice

Hub central da documentação do **Controle de Demandas**: sistema web para gerenciar o fluxo de demandas fiscais (compensações e retificações) da equipe, desde o recebimento do pedido no grupo até a finalização com a mensagem pro Bitrix.

> [!info] Status atual
> Sistema em produção na VPS, acessível em `http://187.77.49.158:5173`.
> Login individual obrigatório (sem cadastro público).
> Banco de dados: PostgreSQL dedicado, em container Docker, com `restart: unless-stopped`.

## Mapa das notas

### Conceitual
- [[01 - Visão Geral do Projeto]] — o que é, pra quem, por que existe
- [[12 - Histórico de Decisões]] — decisões importantes e por que foram tomadas
- [[13 - Pendências e Próximos Passos]] — o que falta / o que pode melhorar

### Técnico — arquitetura
- [[02 - Arquitetura]] — visão geral de como as peças se conectam
- [[03 - Modelo de Dados]] — entidades do banco e como se relacionam
- [[10 - Infraestrutura e Deploy]] — Docker, containers, portas, VPS
- [[11 - Segurança]] — autenticação, exposição pública, riscos conhecidos

### Técnico — funcionalidades
- [[04 - Autenticação e Usuários]]
- [[05 - Quadro Kanban e Cronômetro]]
- [[06 - Criação de Demandas]]
- [[07 - Cadastro de Empresas]]
- [[08 - Finalização e Mensagem Bitrix]]
- [[09 - Notificações em Tempo Real]]
- [[14 - Prioridade e Pausa com Gestor]]

## Acesso rápido

| Item | Valor |
|---|---|
| URL | `http://187.77.49.158:5173` |
| Diretório do projeto (VPS) | `/root/gerenciador-demandas` |
| Frontend | React + TypeScript + Vite + Tailwind v4 |
| Backend | Node.js + Express + Prisma |
| Banco | PostgreSQL 15 (container `demandas-db`) |
| Tempo real | Socket.IO (container `demandas-api`) |
| Primeiro usuário | `clailton` (senha entregue via chat na configuração inicial — trocar e usar gerenciador de senhas) |

## Repositórios externos relacionados
- `github.com/Clamilton/compensacao` — ferramentas Python/Streamlit já existentes (Processador de PER/DCOMP, Distribuidor de Crédito PIS/COFINS). A tabela de códigos de receita usada em [[06 - Criação de Demandas]] foi extraída de lá.
