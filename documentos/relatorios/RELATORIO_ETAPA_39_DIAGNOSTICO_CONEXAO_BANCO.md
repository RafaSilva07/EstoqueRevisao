# Etapa 39 — Diagnóstico da conexão com o banco

## Resumo

Foi investigado o erro interno apresentado nas telas que carregam produtos, locais, lotes e saldos. A aplicação local e suas consultas funcionaram normalmente com o PostgreSQL do Docker; a falha foi isolada na conexão do projeto Supabase, que encerrava sessões PostgreSQL e também retornava `PGRST002` pela própria API REST.

## Alterações

- corrigido `DATABASE_SSL=true` no ambiente local que aponta para o Supabase;
- falhas reconhecidas de conexão agora retornam `503/DATABASE_UNAVAILABLE` com mensagem operacional, sem expor detalhes técnicos;
- documentada a configuração correta de `DATABASE_URL` e SSL para Supabase e o diagnóstico de indisponibilidade do projeto.
