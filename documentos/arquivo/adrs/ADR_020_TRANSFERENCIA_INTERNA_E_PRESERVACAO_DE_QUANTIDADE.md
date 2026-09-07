# ADR 020 - Transferencia interna e preservacao de quantidade

- Status: parcialmente substituido pela ADR 022
- Data: 2026-09-02
- Escopo: terceira operacao funcional de estoque

> A ADR 022 substitui as decisoes sobre preservacao obrigatoria do lote e diferenca obrigatoria entre locais. As demais decisoes deste registro permanecem validas.

## Contexto

Entrada e saida externas ja compartilham cabecalho, itens, idempotencia, historico, transacao, saldo e auditoria. A transferencia interna precisa mover a mesma combinacao produto/lote entre dois locais controlados, sem criar estrutura paralela e sem antecipar a futura operacao de Revisao com varios destinos.

## Decisao

- `TRANSFERENCIA_INTERNA` reutiliza `movements` e `movement_items`, com status `EFETIVADA`.
- Origem e destino devem ser locais ativos `STOCK` ou `SUBSTOCK`, identificados por configuracao de banco e nunca por nome fixo.
- Origem e destino devem ser diferentes. A aplicacao retorna `SAME_TRANSFER_LOCATIONS` antes de abrir a transacao; o banco tambem preserva a constraint estrutural existente.
- Cada item representa o mesmo produto, lote e quantidade na origem e no destino.
- O `StockPositionsService.transferQuantity` centraliza a operacao: valida as referencias, bloqueia as posicoes existentes, faz a baixa condicional da origem e o UPSERT no destino.
- Posicoes de origem e destino sao bloqueadas por identificador de local em ordem crescente. Movimentacoes com varios itens os processam por produto/lote em ordem deterministica.
- A baixa continua exigindo `quantity >= requested` na instrucao SQL, impedindo saldo negativo sob concorrencia.
- Se qualquer item falhar, movimentacao, itens, origem, destino e auditoria sao revertidos juntos.
- Duplicidade de produto/lote na mesma transferencia e rejeitada antes da transacao, seguindo a decisao adotada para Saida Externa.
- A `request_key` preserva idempotencia por usuario e tipo de movimentacao.
- A operacao usa a permissao existente `movements.create`; leitura usa `movements.read`.
- Transferencias aparecem na listagem e no detalhe geral e nao possuem rotas de edicao ou exclusao.

## Invariantes

Para cada item efetivado:

```text
quantidade retirada da origem = quantidade adicionada ao destino
saldo total antes = saldo total depois
```

Uma posicao inexistente no destino e criada; uma existente recebe a soma. A transferencia nao cria nem elimina quantidade.

## Consequencias

- Nao e necessaria migration: o tipo e textual, o modelo ja possui origem/destino e a constraint de locais diferentes ja existe.
- O mesmo servico central pode apoiar fluxos futuros que precisem deslocar quantidade entre locais, sem impor a interface simplificada da transferencia a operacao de Revisao.
- Transferencias simultaneas sobre o mesmo saldo sao serializadas pelas travas e pela baixa condicional.
- Uma transferencia em sentido oposto acessa as mesmas posicoes na mesma ordem, reduzindo o risco de deadlock.
- O frontend pode orientar a selecao pelo saldo positivo, mas o backend permanece a autoridade final.

## Alternativas nao adotadas

- Criar tabela `transfers`: duplicaria o modelo generico e fragmentaria o historico.
- Implementar a transferencia como uma saida e uma entrada independentes: produziria dois documentos e permitiria sucesso parcial.
- Hardcode de Revisar, Lata Boa, Varejo e TUF: impediria evolucao dos locais configuraveis.
- Oferecer destino por item: pertence ao futuro fluxo de Revisao, nao a transferencia interna desta etapa.
- Validar o saldo antes da transacao: permitiria consumo concorrente da mesma quantidade.
