# Etapa 62 — recuperação do acesso administrativo inicial

Em 02/10/2026, foi conferida a conta inicial no Supabase e reproduzido o erro de `npm run db:user:create`: `Ja existe um usuario com esse identificador.` O comando é destinado à criação inicial e não altera contas existentes. A conta `admin` já estava ativa, mas sua senha não correspondia ao valor atualmente configurado em `BOOTSTRAP_PASSWORD`.

A pedido do usuário, o acesso foi regularizado na mesma conta `admin`, preservando UUID e data de criação. A senha foi atualizada a partir do `.env`, usando o `UsersService` existente, hash Argon2id, transação, encerramento das sessões anteriores e auditoria `USER_UPDATE`. Foi confirmado o perfil `ADMIN` (Admin geral), com as 21 permissões do sistema, e a correspondência da senha configurada com o hash persistido. Nenhuma credencial consta deste relatório.

Foi feito backup protegido das tabelas de usuários e vínculos antes da alteração, em `../EstoqueRevisao-backups/recuperacao-admin-2026-10-02-ee908daa/`, fora do Git. Os 9 testes existentes de administração de usuários passaram. Produtos, migrations e demais dados não foram alterados; não houve mudança no código funcional.

Para acessar, utilize o login `admin` e a senha configurada em `BOOTSTRAP_PASSWORD`, entrando novamente após a recuperação. O modo **Admin** oferece acesso completo e gerenciamento de usuários. Novas contas devem ser cadastradas pela tela **Gerenciar usuários**; executar novamente o bootstrap com o mesmo login continuará sendo bloqueado por duplicidade.
