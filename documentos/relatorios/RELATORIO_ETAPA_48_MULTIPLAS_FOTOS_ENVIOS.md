# Etapa 48 — Múltiplas fotos dos envios

- Configuração administrativa auditada do mínimo e máximo por produto, inicialmente 1 a 5 (faixa configurável de 1 a 10; até 100 arquivos por envio).
- Envio e retorno da separação aceitam captura ou seleção de várias fotos por item, com prévia, remoção e conferência antes de enviar.
- A primeira foto conserva o armazenamento anterior; as demais usam `shipment_item_additional_photos` e rotas privadas por ordem. Histórico, decisão de recebimento e PCP exibem a galeria.
- Migration `MultipleShipmentPhotos1790467200000` adiciona os limites e a tabela de fotos adicionais. Aplicá-la antes de iniciar a nova versão do backend.
