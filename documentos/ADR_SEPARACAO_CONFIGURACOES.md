# ADR — Separação imediata e configuração capturada

## Estado

Aceita.

## Decisão

O estado `EM_SEPARACAO` pertence ao envio setorial, antes da criação da movimentação efetiva. O prazo configurável é convertido em `separation_expires_at` no início e passa a ser imutável para aquele envio. Conclusão e expiração usam transação e lock pessimista da mesma linha.

O estoque recebe diretamente a quantidade líquida. Uma devolução positiva cria outro envio, ligado por `source_shipment_id`, para reutilizar fotos, aceite e recusa. Esse retorno não reservou nem recebeu o volume no saldo da Revisão e, por isso, sua confirmação não altera saldo e sua movimentação usa `requires_pcp_execution = false`.

Destinos atuais da revisão ficam em `review_process_destinations`, referenciando locais internos existentes. Distribuições históricas continuam referenciando os locais realmente usados e não são reescritas quando a configuração muda.

## Consequências

- não há estado global nem limite de separações concorrentes;
- configuração nova afeta apenas processos novos;
- não é necessário scheduler nesta etapa; operações de consulta/processamento consolidam expirações vencidas;
- um retorno integral pode não gerar movimento de entrada líquido, pois o efeito de estoque original é zero; o envio original e o retorno permanecem no histórico.

