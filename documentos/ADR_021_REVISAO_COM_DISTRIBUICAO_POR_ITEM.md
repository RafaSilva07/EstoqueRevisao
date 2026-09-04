# ADR 021 - Revisao com distribuicao por item

- Status: aceito
- Data: 2026-09-03
- Escopo: fluxo Revisar Produtos

## Contexto

Entrada, saida e transferencia interna utilizam um cabecalho imutavel de movimentacao e itens de produto, lote e quantidade. Uma revisao continua sendo uma unica operacao, mas cada item distribui a quantidade revisada entre um ou mais destinos internos. O cabecalho anterior exigia um destino unico e nao conseguia preservar essa informacao sem deformar o conceito funcional.

A definicao funcional geral admite transformacoes futuras no Varejo. O escopo desta etapa determina explicitamente que produto, lote, fabricacao e validade permanecam inalterados durante Revisar Produtos.

## Decisao

- `REVISAO` reutiliza `movements` e `movement_items`, com status `EFETIVADA`.
- O destino do cabecalho e nulo somente para `REVISAO`; os destinos reais ficam registrados por item.
- `movement_item_distributions` relaciona cada item aos locais de destino e a quantidade destinada, com chave estrangeira, quantidade positiva e unicidade de item/destino.
- `stock_locations.review_role` configura no banco a unica origem `SOURCE` e os destinos `DESTINATION`; nomes de locais nao participam da regra em tempo de execucao.
- A migration inicializa Revisar como origem e Lata Boa, Varejo e TUF como destinos pelos identificadores estaveis dos registros oficiais.
- O contrato da revisao nao aceita origem, novo lote, data de fabricacao ou validade. O backend obtem a origem configurada e preserva o lote informado no item.
- Para cada item, a soma das distribuicoes deve ser exatamente igual a quantidade revisada. A validacao usa unidades inteiras na escala de seis casas para evitar erro de ponto flutuante.
- O mesmo produto/lote e o mesmo destino nao podem se repetir na operacao.
- O servico de estoque bloqueia origem e destinos existentes em ordem deterministica, baixa o total uma vez e adiciona cada parcela por UPSERT.
- Itens sao processados por produto/lote em ordem deterministica. Documento, itens, distribuicoes, saldos e auditoria pertencem a uma unica transacao.
- A `request_key` existente mantem a idempotencia; o historico geral carrega a revisao completa mesmo quando filtrado por um destino.

## Invariantes

```text
soma dos destinos do item = quantidade revisada do item
quantidade retirada de Revisar = soma adicionada aos destinos
total do produto/lote antes = total do produto/lote depois
```

A revisao pode consumir parte ou todo o saldo. A parte nao revisada permanece na origem sem gerar distribuicao para a propria origem.

## Consequencias

- Uma revisao aparece como um unico documento com varios itens e distribuicoes detalhadas.
- A estrutura generica de movimentos, estoque, historico, autorizacao e auditoria permanece centralizada.
- Novos destinos podem ser configurados no banco sem criar colunas de saldo ou regras por nome.
- Revisar, locais externos e locais sem papel de destino nao sao aceitos na distribuicao.
- Transformacao de produto/lote, cancelamento, estorno e processos que criem novo lote permanecem fora desta etapa.

## Alternativas nao adotadas

- Criar varias transferencias visiveis: perderia a unidade funcional da revisao.
- Guardar tres colunas fixas para Lata Boa, Varejo e TUF: impediria evolucao configuravel.
- Usar um destino artificial no cabecalho: registraria uma rota que nao ocorreu.
- Criar um modulo de saldo paralelo: duplicaria transacao, concorrencia e historico existentes.
