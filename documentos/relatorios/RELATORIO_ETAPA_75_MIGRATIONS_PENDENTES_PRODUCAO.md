# Etapa 75 — Migrations pendentes em produção

O resultado de `schema_migrations` enviado pelo usuário mostrou `AccountFormDrafts1791331200000` e `AdministrativeShipmentCorrections1791417600000` pendentes, enquanto o índice da etapa 73 já estava aplicado. A Home consulta envios com os campos de correções administrativas; a ausência dessa estrutura reproduz erro de coluna inexistente mesmo com conexão ao banco saudável.

Preparado [SQL manual](../scripts/aplicar_migrations_etapa_71.sql) equivalente às duas migrations oficiais, com verificação de pré-requisitos, transação conjunta, registro após cada DDL e conferência final. Validado apenas em PostgreSQL local descartável, inclusive repetição e rollback. Não houve alteração de código funcional nem execução no Supabase de produção; a aplicação pelo usuário ainda depende de confirmação.
