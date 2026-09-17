# Relatório da etapa 34 — Gramatura de produtos

## Resumo

Adicionada ao cadastro de produtos unitários a gramatura, representando em gramas o peso de uma unidade.

## Alterações

- novos produtos `UN` exigem gramatura inteira e positiva;
- o formulário exibe o campo somente quando a unidade selecionada é `UN`;
- `FD` e `CX` rejeitam gramatura e continuam usando apenas unidades por embalagem;
- API, entidade e auditoria incluem `unitWeightGrams`;
- a migration adiciona `products.unit_weight_grams` com constraint de integridade;
- produtos antigos permanecem nulos, sem peso presumido, até serem atualizados.

## Implementação

A validação definitiva fica em `ProductsService`, além da orientação no DTO e no frontend. A coluna é nullable somente para compatibilidade histórica, enquanto a criação atual de `UN` exige valor. Não foram alterados estoque, revisão, movimentações ou cálculos de embalagem.
