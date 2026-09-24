# Etapa 46 — Navegação simplificada

## Resumo

Na branch `feat/navegacao-simplificada`, a navegação principal mostra destinos operacionais diretos. O Histórico reúne envios e movimentações em uma lista com filtros; Estoque e validades é a consulta principal dos saldos. Envios e recebimentos concentra apenas o trabalho em aberto. Relatórios analíticos e administração permanecem em Menu e conta.

## Implementação

`GET /api/v1/history` combina registros existentes sem criar tabela, respeita setor/permissões e pagina o conjunto após a união. Envios confirmados aparecem uma vez, sem duplicar seus movimentos técnicos. A Home consulta apenas registros sem recebimento, separação ou execução PCP pendente para o bloco de finalizadas. Não foi criada migration nem alterada regra de saldo.
