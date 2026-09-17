# Etapa 31 — Foto obrigatória nos envios

- Cada item dos envios Revisão ↔ Produção/Expedição exige uma foto antes da conferência. A câmera abre em modal, permite capturar/refazer, comprime para JPEG e libera o dispositivo ao fechar.
- A criação passou a multipart e o backend valida correspondência item/foto, conteúdo, JPEG/PNG/WebP e limite de 5 MB. Destinatários visualizam miniatura e ampliação antes de confirmar ou recusar.
- A migration adiciona ao item somente chave privada, MIME e tamanho. `StorageService` oferece driver local e Supabase privado; leitura ocorre por endpoint autenticado e respeita o setor do envio.
- Fotos permanecem no histórico após aceite/recusa. Itens anteriores continuam consultáveis sem evidência, sem inventar dados retroativos.
- Correção posterior: o JSON do formulário multipart agora é convertido antes da validação do DTO, evitando a rejeição incorreta de envios válidos pela validação global.
