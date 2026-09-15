# Etapa 27 — Gestão de usuários e responsividade

- Criado menu exclusivo de ADMIN para listar, consultar, criar, editar e excluir usuários por inativação, preservando o histórico. Utiliza os campos, setores e perfis existentes.
- Implementados endpoints administrativos com validação, Argon2id, revogação de sessões e auditoria na mesma transação. Alterações concorrentes são serializadas e o acesso do autor é revalidado; própria conta e último administrador permanecem protegidos.
- Interface reutiliza listagem responsiva, modal, confirmação e avisos. Acesso também disponível durante os modos operacionais externos.
- Corrigidos limites de largura dos campos de data e dos contêineres de formulário para evitar que ultrapassem a borda no celular.
- Nenhuma migration necessária; não foram criadas tabelas ou permissões adicionais.
