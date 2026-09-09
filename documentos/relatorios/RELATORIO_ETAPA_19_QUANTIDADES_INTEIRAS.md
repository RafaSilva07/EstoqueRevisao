# Relatório da etapa 19 — Quantidades inteiras

## Resumo

O sistema passou a aceitar somente valores inteiros positivos nas quantidades de estoque e movimentações.

## Alterações

- entrada, saída, transferência e revisão bloqueiam valores fracionários no frontend;
- DTOs e o serviço central de saldos rejeitam valores fracionários no backend;
- o cálculo de distribuição da revisão passou a operar diretamente com inteiros;
- testes e documentação foram alinhados à nova regra.

As colunas numéricas foram preservadas para manter compatibilidade com registros históricos existentes; nenhuma migration foi necessária.
