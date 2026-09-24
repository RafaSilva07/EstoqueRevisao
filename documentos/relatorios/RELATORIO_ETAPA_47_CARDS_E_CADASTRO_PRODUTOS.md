# Etapa 47 — Cards e cadastro de produtos

- Cards de envios e histórico passam a ocupar colunas compactas no desktop, mantendo uma coluna no celular.
- Todos os perfis podem criar, editar, inativar e reativar produtos. A exclusão é reversível e preserva referências operacionais.
- O log de produtos usa a auditoria transacional existente e tem consulta paginada exclusiva do administrador.
- A migration `ProductManagementAllRoles1790380800000` concede as permissões aos perfis operacionais; deve ser aplicada no ambiente escolhido para testar essa branch, não automaticamente no banco compartilhado.
