# Etapa 40 — Supabase como banco padrão

## Resumo

O fluxo padrão do projeto foi ajustado para usar exclusivamente o PostgreSQL do Supabase em backend, migrations e criação do usuário inicial.

## Implementação

- `db:setup` passou a executar migrations diretamente, sem iniciar PostgreSQL local;
- URLs Supabase exigem `DATABASE_SSL=true` na aplicação e no executor de migrations;
- `.env.example` e guias passaram a usar a URL Session pooler como configuração principal;
- Docker foi mantido somente para testes locais isolados.

O projeto Supabase configurado continuava retornando `ECONNRESET` e `PGRST002` durante a etapa; essa indisponibilidade externa precisa ser resolvida no painel ou suporte do provedor antes da execução das migrations.
