# Etapa 66 — Exportação do Histórico

Adicionado **Exportar CSV** ao Histórico para baixar somente registros finalizados conforme os filtros ativos, em todas as páginas. Cada registro ocupa uma linha; campos, distribuições de revisão e parcelas de montagem ocupam colunas separadas.

A implementação reutiliza a consulta SQL e a autorização por setor, incluindo os dados específicos de transferência, desmontagem, envio e montagem já registrados. O arquivo usa UTF-8 e ponto e vírgula, com escape e proteção contra fórmulas. Não altera saldos, schema, permissões ou etapas operacionais. Detalhes e endpoint permanecem em `FUNCIONALIDADES.md`.
