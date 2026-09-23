# Etapa 42 — Validação do Supabase

## Resumo

Após a recuperação do PostgreSQL no Supabase, foram validados o estado das migrations, a saúde do backend e as consultas centrais do sistema nos modos Admin e Revisão.

## Resultado

As 16 migrations estão aplicadas e não há pendências. Login, produtos, locais, posições, lotes, movimentações, relatórios, envios e fila PCP responderam normalmente usando o Supabase. O aviso visual observado era o estado mantido no frontend após uma tentativa realizada enquanto o banco estava indisponível; uma nova carga da página consulta os dados normalmente.

Durante uma nova inicialização, o Session pooler voltou a encerrar uma conexão isolada com `ECONNRESET`. A configuração do TypeORM foi ajustada para usar um pool pequeno, keep-alive e até dez tentativas espaçadas na inicialização, evitando que uma oscilação transitória encerre imediatamente o backend. Não foram adicionadas repetições automáticas de movimentações.

Os comandos `migration:show` e `migration:run` também passaram a repetir, no máximo cinco vezes, apenas códigos conhecidos de indisponibilidade de conexão. Erros funcionais ou de schema continuam encerrando o comando imediatamente.

O DNS do Session pooler retornava três endereços: dois responderam de forma estável e um resetou todas as conexões testadas. Foi adicionado `DATABASE_HOST_OVERRIDE` para fixar temporariamente um nó saudável, mantendo o hostname original no TLS e toda a operação dentro do mesmo pooler Supabase.
