---
tags: [sistema-demandas, autenticação, técnico]
---

# Autenticação e Usuários

← [[00 - Índice]] · Ver também [[03 - Modelo de Dados]] · [[11 - Segurança]]

## Por que login individual

Inicialmente o sistema tinha um campo "Operador" livre (um menu de seleção, sem senha). Quando o projeto migrou pra ter banco de dados de verdade — porque os dados são críticos e compartilhados com outras pessoas —, a pergunta natural foi: **como provar quem fez o quê**, se qualquer um podia escolher qualquer nome no menu?

A resposta foi tornar operador = conta de usuário real, com senha. Detalhes da decisão em [[12 - Histórico de Decisões]].

## Como funciona

1. Login em `POST /api/auth/login` com `username` + `password`.
2. Senha verificada com **bcrypt** contra `passwordHash` (nunca texto puro no banco).
3. Se válido, o servidor assina um **JWT** (`{ sub: userId }`, validade 30 dias) e devolve num cookie:
   - `httpOnly` — o JavaScript do navegador não consegue ler o cookie (protege contra roubo via XSS).
   - `sameSite: lax`.
   - `secure: false` **hoje**, porque o site ainda está em HTTP puro (sem certificado). Ver [[11 - Segurança]] pra entender o risco disso e quando mudar.
4. Toda rota da API (exceto `/api/auth/login`) passa pelo middleware `requireAuth`, que lê o cookie, valida o JWT e busca o usuário no banco. Se não tiver sessão válida, `401`.
5. O `req.user` (id, username, nome) fica disponível pra qualquer rota usar como "autor" de uma ação — é isso que alimenta `createdById`, `operadorId` (quando aplicável) e `changedById` no histórico.

## Criando novos usuários

Não existe cadastro público. Um usuário **já logado** cria outro em **Usuários** (tela no site) ou via `POST /api/users`:
- `username` (mínimo 3 caracteres)
- `password` (mínimo 6 caracteres)
- `nome` (nome de exibição)

O primeiro usuário do sistema foi criado via script de seed (`server/prisma/seed.ts`, variáveis `BOOTSTRAP_USERNAME`/`BOOTSTRAP_PASSWORD`), não pela tela — porque na hora não existia ninguém logado ainda pra criar o primeiro.

## O que falta aqui (ver [[13 - Pendências e Próximos Passos]])
- Não existe tela de "trocar senha" nem "esqueci minha senha" ainda.
- Não existe conceito de "administrador" — qualquer usuário logado pode criar outro usuário.
- Sessão dura 30 dias fixos, sem refresh nem logout automático por inatividade.
