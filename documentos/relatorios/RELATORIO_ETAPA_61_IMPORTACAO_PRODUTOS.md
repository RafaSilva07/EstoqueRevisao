# Etapa 61 — importação do catálogo Oderich

Em 02/10/2026, foram cadastrados no Supabase configurado no `.env` os 10.944 produtos completos da planilha `Produtos_Oderich_Estrutura_Atualizada.xlsx`, aba `Estrutura_Produtos`, linhas 2–11984. O usuário autorizou importar os válidos e separar os demais para correção.

## Dados cadastrados

- 6.385 produtos UN, com gramatura em gramas inteiras e positivas.
- 3.935 caixas (CX) e 624 fardos (FD), todos com quantidade inteira por embalagem e pelo menos um componente UN ativo.
- 5.899 vínculos entre embalagens e códigos unitários; 1.340 embalagens possuem duas alternativas. As quantidades dos componentes não foram somadas: cada alternativa corresponde ao mesmo fator por embalagem, conforme a regra vigente.
- 10.944 eventos `PRODUCT_CREATE`, atribuídos ao `admin`, com os snapshots usuais e identificador comum da importação.

Código, descrição, unidade e prazo padrão vieram do cadastro principal da linha. Gramatura foi utilizada somente para UN; códigos e quantidades dos componentes, somente para FD/CX. A unidade de negócio e os componentes de fabricação dos produtos UN não foram importados. Códigos mantiveram os zeros à esquerda; nenhum código, fator, gramatura ou vínculo ausente foi inventado.

A carga utilizou os DTOs e as regras de `ProductsService`/`AuditService`, com preparação em memória e persistência em lotes em uma única transação. O lock de `product-packaging`, bloqueios nas tabelas do catálogo, constraints e FKs foram mantidos. A operação pontual bloqueia nova execução caso o catálogo deixe de estar vazio, evitando duplicação ou sobrescrita. Os scripts e manifestos locais estão em `tmp/product-import/`; não constituem API ou funcionalidade nova do sistema.

## Pendências da fonte

Ficaram fora da carga 1.039 linhas: 421 KG/L, 108 UN e 510 FD/CX. Os motivos incluem 26 códigos fora do padrão, 92 UN sem gramatura válida, 358 embalagens sem componente, 39 embalagens referenciando código sem cadastro próprio e 31 com fatores diferentes entre alternativas. Uma linha pode ter mais de um motivo; esses números não devem ser somados.

O arquivo local `outputs/importacao-produtos-2026-10-02/Produtos_Pendentes_Correcao.xlsx` identifica cada linha original, os dados relevantes e os motivos. É um diagnóstico da data da importação; editar os valores não atualiza automaticamente os motivos. A planilha original não foi modificada. A futura carga das correções deve conciliar o catálogo existente e nunca repetir esta carga integral.

## Conferência e preservação

Foi executada uma simulação integral com rollback confirmado antes do commit. Após o commit, conferiram-se todos os campos, vínculos e snapshots de auditoria contra o manifesto, além da consulta paginada pelo repositório real do backend e de uma embalagem com duas opções. Os 10 testes essenciais existentes do cadastro de produtos passaram. Nenhuma embalagem importada ficou sem componente. Lotes, posições, movimentações, envios e conversões antigas permaneceram vazios; usuários e as 30 migrations não foram alterados. Não houve mudança de código funcional, migration ou Storage.

Backup anterior à carga, manifestos e resultados estão fora do Git em `../EstoqueRevisao-backups/produtos-2026-10-02-b92e8178/`, com acesso local restrito. O dump custom do schema `public` foi conferido pelo índice e pela decodificação completa. SHA-256 do dump: `8c04753b8267bd0328aeb2f01d3b838c23391060fa2891d68831775cc593168a`.

SHA-256 da planilha original: `74c001e5240013872220e987505ed35f14fa90f39a9d69dde7c653f77d0d3277`. Request ID da carga confirmada: `2758b423-9b2d-4f51-95a3-b2731613426d`.
