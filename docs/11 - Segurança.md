---
tags: [sistema-demandas, segurança, técnico]
---

# Segurança

← [[00 - Índice]] · Ver também [[04 - Autenticação e Usuários]] · [[10 - Infraestrutura e Deploy]]

## O que está protegido

- **Toda rota de dados exige login** (`requireAuth` — cookie de sessão válido). Sem sessão, `401`.
- **Senhas** nunca em texto puro — hash com `bcrypt`.
- **Autoria de ações nunca vem do cliente.** `createdById`, `changedById`, `finalizedById` são sempre preenchidos no backend a partir da sessão autenticada — mesmo que alguém manipule a requisição manualmente, não dá pra "assinar" uma ação em nome de outra pessoa.
- **Banco de dados isolado**, sem porta pública (só `127.0.0.1:5433`, acessível apenas de dentro da própria VPS).
- Cadastro de novo usuário exige estar **logado** (não é público).

## O que NÃO está protegido (riscos conhecidos e aceitos)

> [!danger] Site em HTTP puro, sem HTTPS
> `http://187.77.49.158:5173` não tem certificado TLS. Isso tem duas consequências diretas:
> 1. **Tráfego não criptografado** — login, senha, dados das demandas trafegam em texto puro na rede. Qualquer um capaz de interceptar o tráfego entre o navegador e a VPS consegue ler tudo, inclusive a senha digitada no login.
> 2. **Cookie de sessão não pode ser `secure`** — teve que ser configurado `secure: false` propositalmente (`COOKIE_SECURE=false`), porque cookies `secure` só são enviados em HTTPS. Se o site tivesse certificado, essa flag deveria virar `true`.

> [!danger] Porta exposta publicamente, sem restrição de IP
> A porta `5173` foi aberta pro IP público da VPS por decisão explícita do usuário (havia a alternativa de usar Tailscale — rede privada já configurada na VPS —, mas foi descartada). Isso significa: **qualquer pessoa na internet que descobrir o IP:porta consegue tentar login** (não consegue ver dados sem senha, mas pode tentar força bruta, ou explorar qualquer vulnerabilidade futura).

## Recomendações pra evoluir isso

1. **Colocar um domínio + HTTPS** (ex: Let's Encrypt via Nginx/Caddy na frente do container) — resolve os dois pontos acima de uma vez: criptografa o tráfego e permite `secure: true` no cookie.
2. **Trocar a senha do primeiro usuário** (`clailton`, criada via bootstrap) assim que possível, e considerar usar um gerenciador de senhas pra todo mundo da equipe.
3. Considerar **rate limiting** no `/api/auth/login` (hoje não existe, então dá pra tentar senha repetidamente sem bloqueio).
4. Se algum dia o acesso não precisar ser público, migrar pra acesso via **Tailscale** (já disponível na VPS, rede privada, sem expor porta nenhuma pra internet).

## Regra que eu (assistente) sigo à parte disso
Por instrução de segurança do meu próprio funcionamento, eu não executo mudanças de firewall/configuração de segurança do sistema operacional diretamente — essas ações (abrir porta, editar `ufw`/`iptables`) precisam ser feitas pelo próprio usuário. O que eu configurei foi só o lado da aplicação (a porta que o processo escuta).
