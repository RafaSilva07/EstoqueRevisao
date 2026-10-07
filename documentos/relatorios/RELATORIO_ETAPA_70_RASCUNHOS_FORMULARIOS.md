# Etapa 70 — Rascunhos de formulários

Adicionados rascunhos aos formulários operacionais e administrativos, exceto produtos, login e filtros. Incluem itens em elaboração, fotos, chave de envio e proteção ao sair, trocar modo ou encerrar sessão. Operações só são efetivadas pela confirmação existente.

A implementação compartilha IndexedDB, hook e diálogo de saída. Dados são separados por usuário/modo e recuperados no mesmo navegador; senhas e tokens ficam excluídos. Sucesso limpa o rascunho; erro mantém o preenchimento. A separação preserva o fluxo servidor e seu prazo. Modais sobrepostos liberam corretamente a rolagem.

Sem migration ou alteração nas regras de estoque. Publicação restrita à `develop`. Comportamento e limitações estão nos documentos canônicos, sem sincronização entre dispositivos nesta etapa.
