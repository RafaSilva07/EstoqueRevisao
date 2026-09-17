# Etapa 36 — Limite da data de fabricação

## Resumo

O sistema passou a rejeitar produtos com data de fabricação posterior ao dia atual.

## Implementação

A validação foi adicionada ao serviço central de lotes e cobre tanto datas digitadas quanto datas derivadas do código CONSERVADI. O campo compartilhado de fabricação também limita visualmente a seleção até a data atual.
