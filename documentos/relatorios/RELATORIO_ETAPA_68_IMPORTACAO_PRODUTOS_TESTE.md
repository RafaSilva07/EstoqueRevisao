# Etapa 68 — Importação no Supabase de teste

O `.env` local foi conferido por projeto e comparado com o destino da carga anterior. O pooler configurado pertence a um projeto Supabase distinto. Uma consulta somente de leitura confirmou o catálogo vazio, um admin ativo, 31 migrations e nenhum lote, saldo ou movimentação.

Foi carregado o mesmo plano validado da planilha Oderich: 10.944 produtos (6.385 UN, 3.935 CX e 624 FD) e 5.899 vínculos entre embalagens e unidades. As 1.039 linhas com pendências continuaram de fora. Uma simulação integral foi revertida antes da carga; backup local verificável ficou em `tmp/product-import-test-20261006/backup-antes-da-importacao.dump`.

A carga usou `ProductsService` e `AuditService`, com validação dos DTOs e uma transação. A verificação final confirmou 10.944 produtos, 5.899 vínculos, 10.944 eventos `PRODUCT_CREATE` e nenhuma embalagem inválida. Usuário, schema/migrations, lotes, estoque e movimentações permaneceram preservados. Request ID: `6d9d63d9-a940-4438-8760-6b7d9748a512`.

Durante a conexão, foi identificado e corrigido o envio do hostname SNI pelo parser do PostgreSQL quando o DNS é usado diretamente. O IPv4 antigo foi removido do `.env` local. Após a transação, o script de carga retornou erro ao copiar um manifesto de pendências ausente na pasta temporária; o resultado registrava `committed=true` e uma verificação independente, somente de leitura, confirmou os dados no banco. A importação não foi repetida.
