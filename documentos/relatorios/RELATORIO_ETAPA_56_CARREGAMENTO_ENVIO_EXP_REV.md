# Etapa 56 — carregamento no envio Expedição → Revisão

O novo envio da Expedição para Revisão agora registra se a carga foi carregada. Quando carregada, a placa do veículo é obrigatória; quando não carregada, não há placa. A escolha aparece na conferência, no recebimento e no detalhe compartilhado do histórico.

A API valida a regra por setor e destino, persiste os dados no envio e inclui ambos na auditoria. A migração adiciona colunas com restrição de integridade sem preencher dados fictícios nos envios anteriores. Estoque e demais tipos de envio não foram alterados.
