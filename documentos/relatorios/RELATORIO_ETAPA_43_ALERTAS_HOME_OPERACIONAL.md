# Etapa 43 — Alertas e filas na Home operacional

## Resumo

A Home passou a destacar no topo solicitações aguardando aceite do perfil ativo e envios em separação. Abaixo dos atalhos foram incluídas listas de movimentações abertas, concluídas aguardando execução do PCP e últimas movimentações finalizadas.

## Implementação

As listas reutilizam envios, histórico de movimentações e fila PCP existentes, sempre com o escopo e as permissões do modo operacional ativo. A consulta de envios ganhou a visão `open` e filtro por status; a consulta comum de movimentações ganhou filtros de status operacional e PCP. Os resultados são apresentados em cards responsivos e clicáveis, com acesso ao fluxo ou detalhe correspondente.
