# Etapa 49 — Entrada líquida da separação no histórico

- Causa: a entrada líquida já gerava movimentação e saldo, mas a lista unificada ocultava a movimentação vinculada e o detalhe mostrava apenas a quantidade original do envio.
- Correção: o detalhe passou a exibir os itens creditados e, na Revisão, o histórico mostra a entrada líquida e o retorno em dois cards referenciando o envio original. O filtro de sentido separa entradas, saídas e operações internas do setor.
- Nenhum saldo ou registro histórico existente foi reescrito.
