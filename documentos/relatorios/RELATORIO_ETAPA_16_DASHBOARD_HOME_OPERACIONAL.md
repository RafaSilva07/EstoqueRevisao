# Relatório da etapa 16 — Dashboard/Home operacional

## Resumo

A Home foi convertida em um painel operacional simples para concentrar saldos, alertas de validade, atividade recente e acesso às rotinas mais usadas.

## Funcionalidades e alterações

- saldos de Revisar, Lata Boa, Varejo e TUF;
- contagem de posições vencidas e próximas do vencimento;
- cinco movimentações mais recentes;
- atalhos para Entrada, Saída, Revisão, Transferência e consulta de Estoque;
- apresentação mobile-first e visibilidade condicionada às permissões do usuário.

## Implementação

O painel reutiliza `GET /api/v1/reports/stock` para saldos e validades e `GET /api/v1/movements` para a atividade recente. As consultas são executadas em paralelo, os totais são exibidos como retornados pela API e os componentes responsivos e estados de feedback seguem o padrão existente. Não houve alteração de backend.
