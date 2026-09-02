# ADR 018 - Entrada externa e historico de movimentacoes

- Status: aceito
- Data: 2026-09-01
- Escopo: primeira operacao funcional de estoque

## Contexto

O saldo atual por produto, lote e local ja existe como estado materializado, mas ainda nao havia um documento operacional que explicasse sua alteracao. A arquitetura oficial exige que historico de negocio, auditoria e logs tecnicos sejam conceitos distintos e que qualquer operacao de estoque seja atomica e rastreavel.

Esta etapa foi deliberadamente limitada a entrada externa efetivada. O fluxo mais amplo de solicitacao em transito, fotos e conferencia permanece para uma etapa posterior.

## Decisao

- `movements` guarda o cabecalho imutavel da operacao: tipo, origem, destino, responsavel, momento de ocorrencia, status, observacao e criacao.
- `movement_items` guarda produto, lote e quantidade, permitindo varios itens no mesmo documento.
- O unico tipo implementado e `ENTRADA_EXTERNA`; o unico status produzido e `EFETIVADA`.
- A origem deve ser um local ativo `EXTERNAL`; ela nao possui saldo a reduzir.
- O destino deve ser um local ativo `STOCK` ou `SUBSTOCK`.
- O saldo do destino e alterado exclusivamente pelo `StockPositionsService` e exige produto ativo, lote associado e quantidade positiva com ate seis casas decimais.
- Cabecalho, itens, saldos e auditoria sao confirmados na mesma transacao PostgreSQL.
- Uma `request_key` UUID unica oferece idempotencia contra duplo envio do formulario.
- A API oferece somente criacao de entrada externa, listagem filtrada e detalhe. Nao existem rotas de edicao ou exclusao.
- As chaves estrangeiras usam `RESTRICT`; o documento que possui itens nao pode ser apagado fisicamente.

## Consequencias

- O saldo atual passa a possuir uma origem operacional consultavel.
- Uma falha em qualquer item reverte todo o documento, inclusive saldos e auditoria.
- O modelo de cabecalho e itens pode receber novos tipos no futuro sem misturar as regras desta etapa.
- Cancelamentos e estornos futuros deverao preservar o evento original e aplicar operacoes compensatorias; nenhuma logica desse tipo foi antecipada agora.
- A criacao rapida de lote usa a API e a regra `CONSERVADI` ja existentes, evitando uma segunda implementacao da regra no frontend.

## Alternativas nao adotadas

- Atualizar saldo diretamente pelo controller: quebraria a fronteira transacional e a rastreabilidade.
- Reutilizar auditoria como historico operacional: os conceitos respondem perguntas diferentes.
- Criar colunas ou tabelas separadas para cada futuro tipo de movimentacao: anteciparia regras e dificultaria consultas consolidadas.
- Permitir alteracao ou exclusao de uma entrada efetivada: impediria reconstruir o ocorrido.
