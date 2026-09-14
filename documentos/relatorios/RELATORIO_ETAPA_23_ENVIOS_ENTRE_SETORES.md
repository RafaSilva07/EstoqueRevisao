# Etapa 23 — Envios entre setores

- Identidade existente ampliada com setor e perfis Produção/Expedição; permissões e validação do destinatário impedem acesso externo às operações internas.
- Criado envio com vários itens e estados Aguardando recebimento, Confirmado e Recusado. Recusa exige motivo; documentos enviados não são editáveis e correções geram novo registro.
- Entrada na Revisão ocorre somente na confirmação. Saídas reservam o disponível ao enviar; confirmação encerra o trânsito sem nova baixa, e recusa devolve às posições originais.
- Implementação reutiliza resolução de lotes, transações, crédito/baixa atômicos, snapshots, movimentações e auditoria. Há idempotência e bloqueio concorrente da decisão.
- Interface mobile com resumo, pendências, envios próprios, histórico, decisões e indicações internas. Campos CONSERVADI/fabricação/validade reutilizam o componente atual.
- Entradas/saídas diretas dos setores foram substituídas por envios; outros locais externos continuam atendidos. Movimentações confirmadas ficam vinculadas ao envio; devoluções usam novo envio inverso.

Regras e contratos mantidos nos documentos canônicos, sem duplicação aqui.
