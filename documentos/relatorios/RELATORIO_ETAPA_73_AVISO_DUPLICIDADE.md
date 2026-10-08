# Etapa 73 — Aviso de possível movimentação duplicada

Adicionada conferência de operações inteiras equivalentes recentes nos formulários existentes de entrada, saída, transferência, revisão e envio/montagem. O aviso mostra referências anteriores e permite voltar ou continuar após aceite explícito; não transforma a duplicidade em proibição definitiva.

O backend compara dados operacionais imutáveis dentro da transação e serializa criações iguais. A primeira tentativa avisada faz rollback; aceitar não dispensa saldo, permissões ou idempotência, e fica registrado na auditoria. Fotos de tentativas não confirmadas usam a compensação já existente. O frontend compartilha aviso e envio, preservando preenchimento e confirmações independentes de validade.

Criada e aplicada `RecentOperationLookup1791504000000` no Supabase de teste, somente para índice de consulta. Regras detalhadas nos documentos canônicos. Publicação exclusiva na `develop`; `main` e banco de produção permanecem inalterados. Nenhum dado operacional foi alterado no Supabase nesta etapa.
