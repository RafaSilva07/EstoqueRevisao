# Etapa 37 — Modo Admin e escopo da Revisão

## Resumo

O seletor operacional do administrador recebeu a opção **Admin**. Esse é o modo completo; a opção **Revisão** passou a reproduzir somente as permissões do perfil Revisão operacional.

## Implementação

- administradores iniciam no modo Admin;
- frontend projeta menus, ações e permissões conforme o modo escolhido;
- backend aceita `ADMIN` no cabeçalho operacional e aplica listas restritas nos demais modos;
- guards administrativos bloqueiam gestão de usuários, entrada/saída direta, estorno e mudanças de status fora do modo Admin;
- a conta e a autoria do administrador permanecem inalteradas.
