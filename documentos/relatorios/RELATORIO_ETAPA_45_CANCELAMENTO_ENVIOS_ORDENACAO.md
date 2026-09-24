# Etapa 45 — Cancelamento de envios e ordenação

## Resumo

Foi adicionado o cancelamento de envios ainda não recebidos pelo próprio autor, com motivo obrigatório, preservação do registro e auditoria administrativa. As principais consultas filtráveis passaram a oferecer ordenação.

## Implementação

O backend serializa cancelamento e recebimento com bloqueio pessimista e executa, na mesma transação, eventual restauração de reserva e auditoria. A interface oferece confirmação com motivo e exibe o estado cancelado no histórico. Também foi corrigido o UUID da auditoria usada na consolidação automática de separações vencidas, que causava erro 500 nas consultas de envios.
