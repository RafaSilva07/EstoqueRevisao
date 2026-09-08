# Relatório da etapa 14 — Estoque e validades no backend

## Resumo

A consulta backend de estoque e validades foi confirmada para listar posições atuais com saldo positivo e permitir filtros por produto, lote, local/classificação e situação da validade. O retorno inclui fabricação, validade e a identificação de lotes válidos, próximos do vencimento ou vencidos.

## Implementação

Foi preservado o endpoint `GET /api/v1/reports/stock`, que consulta diretamente as posições materializadas e os lotes existentes, omite saldos zerados, aplica paginação e classifica a validade no PostgreSQL usando data civil, data de referência e janela de proximidade. O mapeamento padroniza fabricação e validade como `YYYY-MM-DD`, independentemente do idioma ou fuso do processo, sem alterar frontend, exportação, dashboard ou schema.
