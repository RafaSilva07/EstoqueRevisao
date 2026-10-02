# Etapa 65 — Permissões por usuário e presets

Os perfis existentes passaram a oferecer conjuntos editáveis de funcionalidades, mantendo os setores e modos operacionais. O admin geral pode conceder ou retirar ações de cada usuário e, ao salvar um preset, escolher se atualiza seus usuários.

A implementação persiste a base atribuída e ajustes individuais em `user_permissions`, com migration de preservação dos acessos existentes. Atualizações usam transação, auditoria, controle de versão do preset e revogação das sessões afetadas. Guards e menus passaram a verificar ações específicas, incluindo entrada direta, saída, revisão, transferência e inativação de cadastros. A gestão de usuários, presets e configurações gerais permanece exclusiva do admin geral.

Consulte as regras e os endpoints nos documentos canônicos; esta etapa não altera cálculos ou transações de estoque.
