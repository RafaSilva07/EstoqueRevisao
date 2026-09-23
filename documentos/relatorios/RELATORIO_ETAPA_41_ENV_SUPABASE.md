# Etapa 41 — Orientação do `.env` para Supabase

## Resumo

O `.env` local foi comentado para identificar `DATABASE_URL` como a única conexão PostgreSQL usada por backend, migrations e bootstrap, sempre com `DATABASE_SSL=true`.

## Implementação

As antigas variáveis `SUPABASE_DATABASE_URL` e `SUPABASE_DATABASE_SSL` foram marcadas como legadas e sem efeito. As variáveis `POSTGRES_*` ficaram identificadas como exclusivas do Docker opcional de testes, sem participação no fluxo operacional.
