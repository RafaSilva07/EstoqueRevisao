# Etapa 44 — Códigos públicos e resumos na Home

Implementados códigos ENT/SAI/REV com sequences PostgreSQL independentes e triggers para geração e imutabilidade. A migration `1790121600000-movement-public-codes.ts` identifica movimentações; a evolução `1790208000000-shipment-lifecycle-public-codes.ts` faz o envio receber ENT/SAI desde a criação e preservá-lo até a movimentação efetivada, PCP e histórico. Ambas possuem backfill e rollback. UUIDs permanecem nas relações/rotas.

Atualizados entidade Movement, DTOs de consulta de movimentações/envios, repositórios, auditoria e respostas. Busca completa em `/movements?codigoMovimentacao=ENT-000153`, `/shipments?codigoMovimentacao=ENT-000153` e `/pcp/movements?search=ENT-000153`, combinável com os demais filtros.

Home, histórico, PCP, solicitações e detalhes exibem os códigos. `ShipmentSummaryModal` consulta envios; `MovementDetailModal` reutiliza detalhes/fotos para Revisão e PCP. Cards abrem resumos; ações fecham o resumo e abrem o registro exato nas páginas existentes. Formulários e regras operacionais são reutilizados.

## Verificação manual

1. Aplicar `npm run db:migration:run` no ambiente de destino e reiniciar o backend.
2. Conferir ENT/SAI/REV em entrada, saída e revisão; pesquisar cada código completo no histórico e PCP.
3. Na Home, abrir envio pendente, conferir itens/fotos e clicar em confirmar recebimento: a tela existente deve abrir o mesmo envio. Repetir com separação e retorno.
4. Abrir movimentação concluída e ampliar foto; no PCP, encaminhar execução, sem executar no resumo.
5. Fechar por botão/ESC, percorrer com Tab e conferir celular/tablet/desktop sem rolagem horizontal.
