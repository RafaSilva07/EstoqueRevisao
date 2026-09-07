# ADR 019 - Saida externa e baixa atomica de saldo

- Status: aceito
- Data: 2026-09-02
- Escopo: segunda operacao funcional de estoque

## Contexto

A entrada externa e o historico imutavel ja estabelecem um documento generico de movimentacao, itens, idempotencia, transacao e auditoria. A proxima operacao precisa retirar itens de um local controlado para um destino externo sem criar um modelo paralelo nem permitir saldo negativo sob concorrencia.

O fluxo completo de solicitacao em transito, fotos e conferencia descrito na definicao funcional continua reservado para uma etapa posterior. Esta decisao trata apenas da saida externa imediatamente efetivada solicitada para o MVP incremental.

## Decisao

- `SAIDA_EXTERNA` reutiliza `movements` e `movement_items`, com status `EFETIVADA`.
- A origem deve ser um local ativo `STOCK` ou `SUBSTOCK`; o destino deve ser um local ativo `EXTERNAL`.
- A saida reduz exclusivamente a posicao da origem. Nenhuma posicao e criada no destino externo.
- Cada quantidade deve ser positiva, possuir no maximo seis casas decimais e nao superar o saldo disponivel.
- A baixa usa uma atualizacao condicional `quantity >= requested` dentro da transacao PostgreSQL. Se nenhuma linha for alterada, a operacao retorna `INSUFFICIENT_STOCK` com o saldo disponivel.
- Cabecalho, todos os itens, baixas de saldo e auditoria sao atomicos. A falha de qualquer item reverte o documento inteiro.
- Uma combinacao produto/lote nao pode se repetir na mesma saida. A API rejeita a duplicidade antes de abrir a transacao.
- A `request_key` continua garantindo idempotencia por usuario e tipo de movimentacao; uma chave usada por outro tipo ou usuario e rejeitada.
- A consulta operacional de posicoes lista somente saldos positivos. A linha zerada permanece no banco.
- Entrada e saida compartilham listagem, filtros, detalhe e regras de imutabilidade. Nao sao oferecidas rotas de edicao ou exclusao.

## Consequencias

- Saidas parciais e totais sao rastreaveis pelo mesmo historico das entradas.
- Duas saidas concorrentes nao conseguem consumir o mesmo saldo alem do disponivel.
- O frontend pode limitar produto e lote as posicoes positivas da origem selecionada, mas o backend permanece a autoridade final sobre o saldo.
- Nao foi necessaria migration: a estrutura generica ja aceita novos valores de tipo e as permissoes `movements.create` e `movements.read` abrangem a operacao.
- Transferencias internas, revisoes, cancelamentos, estornos e o fluxo em transito nao foram antecipados.

## Alternativas nao adotadas

- Criar tabelas separadas para entradas e saidas: duplicaria historico, filtros e infraestrutura transacional.
- Validar saldo apenas no frontend ou por leitura anterior a baixa: permitiria disputa entre requisicoes concorrentes.
- Apagar posicoes quando chegam a zero: perderia continuidade tecnica da posicao e criaria trabalho adicional sob concorrencia.
- Consolidar silenciosamente itens duplicados: esconderia erro de preenchimento e tornaria a confirmacao menos previsivel.
