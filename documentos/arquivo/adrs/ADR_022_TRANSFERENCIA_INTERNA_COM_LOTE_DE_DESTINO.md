# ADR 022 - Transferencia interna com lote de destino

- Status: aceito
- Data: 2026-09-03
- Escopo: evolucao da transferencia interna
- Substitui parcialmente: ADR 020

## Contexto

A transferencia interna original preservava produto e lote e exigia locais diferentes. O processo operacional tambem precisa reclassificar o lote sem trocar o produto, inclusive dentro do mesmo local. O historico deve continuar imutavel e identificar exatamente as duas posicoes envolvidas.

## Decisao

- Cada item de `TRANSFERENCIA_INTERNA` preserva `batch_id` como lote de origem e registra `destination_batch_id` como lote de destino.
- Produto de origem e destino deve ser o mesmo. Uma chave estrangeira composta entre lote de destino e produto protege essa compatibilidade no PostgreSQL.
- O lote de destino e obrigatorio e pode ser o lote atual, outro lote existente do produto ou um lote criado pelo cadastro central de lotes.
- A criacao de lote continua sendo feita por `POST /batches`; nenhuma regra de codigo foi copiada para a transferencia. Assim, fabricacao e codigo `CONSERVADI`, validade manual, unicidade e vinculo ao produto permanecem sob as validacoes existentes.
- A operacao deve alterar lote, local ou ambos. Mesmo local e mesmo lote e rejeitado por `TRANSFER_WITHOUT_CHANGE` antes da transacao.
- A constraint de locais permite origem e destino iguais exclusivamente para `TRANSFERENCIA_INTERNA`. Os demais tipos preservam suas regras anteriores.
- O servico de estoque valida as duas referencias, bloqueia as posicoes exatas em ordem deterministica, realiza baixa condicional na origem e UPSERT no destino.
- Documento, itens, saldos e auditoria continuam confirmados em uma unica transacao. A `request_key` continua garantindo idempotencia por usuario e tipo.
- Listagem e detalhe carregam os lotes das duas pontas; codigos e nomes historicos sao resolvidos pelas referencias imutaveis preservadas no item e no cabecalho.
- Registros antigos de transferencia recebem o lote de origem como lote de destino durante a migration, preservando o significado anterior.

## Invariantes

Para cada item efetivado:

```text
produto de origem = produto de destino
quantidade retirada da origem = quantidade adicionada ao destino
saldo total do produto antes = saldo total do produto depois
lote de origem != lote de destino OU local de origem != local de destino
```

## Revisao de produtos

Esta decisao nao altera `REVISAO`. O contrato de revisao nao recebe lote de destino, e sua aplicacao de saldo continua usando obrigatoriamente o lote de origem em todas as distribuicoes.

## Consequencias

- O historico pode apresentar `produto / lote / local` na origem e no destino sem depender do saldo atual.
- Uma posicao destino existente recebe a soma; uma inexistente e criada.
- Troca de lote e deslocamento de local continuam compondo uma unica operacao atomica, sem entrada e saida artificiais.
- A criacao de um novo lote exige a permissao propria do cadastro; a transferencia exige `movements.create`.

## Alternativas nao adotadas

- Sobrescrever `batch_id`: perderia o lote de origem no historico.
- Duplicar a validacao `CONSERVADI` no modulo de movimentos: criaria duas autoridades para a mesma regra.
- Criar um fluxo separado de reclassificacao de lote: duplicaria a experiencia e a infraestrutura transacional da transferencia.
- Permitir troca de produto: deixaria de ser transferencia e violaria a preservacao quantitativa por produto.
