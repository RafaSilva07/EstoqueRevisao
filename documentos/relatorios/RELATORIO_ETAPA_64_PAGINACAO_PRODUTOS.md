# Etapa 64 — paginação de produtos

A página de Produtos deixou de exibir somente os primeiros 100 cadastros. Agora permite navegar pelas páginas e escolher 20, 50 ou 100 produtos por página, com indicação da página atual e do total encontrado.

A implementação reutiliza `page`, `limit` e os metadados da API existente, preservando busca, ações de cadastro e permissões. Mudanças na busca ou no tamanho da página reiniciam a navegação; respostas antigas não substituem a consulta atual, e páginas que deixam de existir são corrigidas automaticamente. Os controles reutilizam o layout responsivo do sistema. Sem alterações no backend, banco ou migrations.
