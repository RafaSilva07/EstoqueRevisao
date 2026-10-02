# Etapa 60 — limpeza do banco para produção

Em 02/10/2026, a limpeza autorizada foi executada no Supabase configurado no `.env`, usando o plano de [limpeza](../scripts/limpeza_teste_para_producao.sql). Trata-se de manutenção excepcional para remover testes, não de exclusão operacional oferecida pelo sistema.

Removidos 23 movimentos e seus itens/distribuições, 21 envios e seus 25 itens, 28 posições de estoque, 17 lotes, 6 produtos/vínculos, 552 eventos de auditoria de teste, 140 sessões e os 7 usuários anteriores. As tabelas operacionais ficaram vazias.

Preservados integralmente 7 perfis, 21 permissões, 77 vínculos perfil/permissão, 7 locais, 3 destinos de revisão, 3 configurações e 30 registros de `schema_migrations`. Atribuições aos usuários removidos nos locais/configurações foram limpas. As sequências ENT/SAI/REV reiniciaram em 1.

Foi criado um único usuário ativo `admin`, perfil `ADMIN`, com as 21 permissões. A senha vem de `BOOTSTRAP_PASSWORD` e foi validada contra o hash Argon2id; nenhuma credencial consta deste registro. A auditoria de criação desse usuário foi preservada. `BOOTSTRAP_USERNAME` local passou a `admin`.

Antes da execução, foi gerado um backup custom do schema `public` e seus dados com `pg_dump`, conferido pelo índice e pela decodificação completa via `pg_restore`. O plano passou por simulação com rollback verificado e execução definitiva em transação, com bloqueios exclusivos, FKs ativas e reativação dos quatro triggers de imutabilidade. O backend no Railway permaneceu ligado a pedido do usuário, que informou não haver uso; as verificações sob lock confirmaram as contagens do backup, acrescidas somente da nova conta. Nenhuma migration foi executada.

O backup e os registros ficam fora do Git, em `../EstoqueRevisao-backups/limpeza-2026-10-02-0633ad82/`, relativo à raiz do projeto. Incluem `estoque-revisao-public.dump`, manifesto de fotos, inventário do Storage, resultado da simulação, resultado definitivo e o plano efetivamente executado. SHA-256 do dump: `ba4defa14d5a36462b22ad498ef5801c66906f76410bf96fcf4107a53a4ca499`. A pasta tem acesso local restrito ao usuário que executou a manutenção.

O bucket privado `shipment-evidence` e seus 22 objetos foram preservados. O manifesto registra 21 referências anteriores; há um objeto sem referência. A limpeza de fotos é uma etapa separada, pela API/Dashboard do Storage, usando esse manifesto; nunca por `DELETE` em `storage.objects`. É necessário entrar novamente no sistema com a nova conta.
