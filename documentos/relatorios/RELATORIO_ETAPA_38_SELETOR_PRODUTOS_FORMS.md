# Etapa 38 — Seletor pesquisável nos formulários de produto

## Resumo

Os formulários de entrada, saída, transferência e revisão passaram a usar o mesmo seletor de produto dos envios Produção/Expedição para Revisão.

## Implementação

O componente compartilhado permite abrir a lista e pesquisar por código ou descrição, filtrando as opções durante a digitação e sincronizando os dois campos após a escolha. Nos fluxos baseados em saldo, as opções são limitadas aos produtos disponíveis na origem; a entrada consulta os produtos ativos do cadastro.
