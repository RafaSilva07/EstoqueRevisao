# Relatório da etapa 15 — Estoque e validades no frontend

## Resumo

A área Relatórios passou a oferecer a consulta visual de posições atuais e validades, integrada às telas de Movimentações e Revisões.

## Funcionalidades e alterações

- filtros por produto, lote, local/classificação e situação da validade;
- saldo, lote, fabricação, validade e situação em resultados paginados;
- destaque para válido, próximo do vencimento e vencido;
- estados de carregamento, vazio e erro e ação para limpar filtros.

## Implementação

A tela consome `GET /api/v1/reports/stock`, usa os totais e a paginação retornados pela API e reutiliza navegação, filtros, tabela responsiva e componentes de feedback existentes. No mobile, as linhas assumem o padrão de cards do projeto. Nenhuma regra foi recalculada no navegador e não houve alteração de backend, exportação ou dashboard.
