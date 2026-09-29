# Etapa 52 — presença online

O PCP passa a ver um aviso quando outro usuário estiver online nesse modo, com o nome do colega. Administradores gerais e de área recebem uma página **Usuários online** no menu lateral para consultar a presença de todos.

A migration `SessionPresence1791072000000` acrescenta o modo operacional à sessão existente. A presença usa a atividade dos últimos 60 segundos e o modo validado pela API. A interface atualiza o estado periodicamente e ao voltar ao aplicativo. O aviso é apenas informativo: não bloqueia trabalho nem garante que dois usuários não abram o mesmo registro.
