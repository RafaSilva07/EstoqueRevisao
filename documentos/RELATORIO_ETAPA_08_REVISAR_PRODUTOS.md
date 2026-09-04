# Relatorio da Etapa 08 - Revisar Produtos

- Data: 2026-09-03
- Commit funcional: `ef77070` (`feat(reviews): implement product review distribution`)
- Status: concluida e validada

## Objetivo

Implementar uma unica operacao de revisao capaz de distribuir integralmente cada produto/lote com saldo em Revisar entre um ou mais destinos internos permitidos, aceitando revisao parcial e varios itens, sem alterar produto, lote, fabricacao ou validade.

## Analise anterior

Os documentos oficiais, ADRs e relatorios das etapas 01 a 07 foram relidos integralmente. A arquitetura preservada e o monolito modular React/NestJS/PostgreSQL, com saldo materializado, movimentacoes imutaveis, auditoria independente, transacoes e autorizacao no backend.

Entrada, saida e transferencia ja utilizavam `movements`, `movement_items`, `StockPositionsService`, request key idempotente e historico geral. A incompatibilidade identificada era o destino unico obrigatorio no cabecalho. A menor extensao foi registrar as distribuicoes por item e deixar o destino do cabecalho nulo exclusivamente em `REVISAO`.

A definicao funcional admite transformacao futura no Varejo, mas o recorte explicito desta etapa exige preservacao do lote. Essa especializacao foi implementada sem antecipar o fluxo futuro.

## Modelagem e migration

A migration `1788480000000-review-movements.ts`:

- adiciona `stock_locations.review_role`, limitado a `SOURCE` ou `DESTINATION` em subestoques;
- garante no maximo uma origem de revisao por indice parcial unico;
- configura Revisar como origem e Lata Boa, Varejo e TUF como destinos usando os IDs oficiais;
- permite `destination_location_id` nulo apenas quando o tipo e `REVISAO`;
- cria `movement_item_distributions` com chaves estrangeiras, quantidade positiva, unicidade item/destino e indices;
- normaliza a descricao da permissao generica `movements.create`.

A migration foi aplicada no banco principal e validada em banco isolado por aplicacao completa, listagem, rollback e reaplicacao.

## Backend

O endpoint `POST /api/v1/movements/reviews` exige `movements.create` e recebe request key, observacao opcional e itens com produto, lote, quantidade e distribuicoes.

O backend:

- obtem a origem e os destinos pela configuracao persistida;
- rejeita destino Revisar, externo ou nao configurado;
- rejeita produto/lote e destinos duplicados;
- exige quantidades positivas com ate seis casas;
- exige soma dos destinos exatamente igual a quantidade revisada;
- nao aceita campos de novo lote, fabricacao ou validade;
- processa itens por chave deterministica;
- bloqueia origem e destinos existentes em ordem de local;
- baixa o total da origem uma vez e adiciona cada parcela por UPSERT;
- confirma documento, itens, distribuicoes, saldos e auditoria juntos;
- preserva idempotencia e imutabilidade.

O filtro de historico por produto ou destino usa `EXISTS`, evitando que o carregamento do documento perca itens ou distribuicoes nao correspondentes ao filtro.

## Frontend mobile-first

A tela `Revisar produtos` foi adicionada a Home, Operacoes e sidebar. Ela:

- mostra somente produto/lote com saldo na origem configurada;
- aceita varios cards de produto/lote;
- exibe saldo, lote e validade;
- permite preencher apenas os destinos utilizados;
- informa em texto quanto falta, quanto excede ou se a distribuicao esta completa;
- bloqueia confirmacao enquanto qualquer item estiver invalido;
- apresenta resumo antes de efetivar;
- bloqueia duplo envio e preserva a request key ate sucesso;
- oferece atalho `Realizar revisao` em posicoes de Revisar;
- encaminha ao mesmo historico geral com detalhe de todas as distribuicoes.

## Testes e fluxo real

Resultados finais da etapa:

- lint aprovado sem avisos;
- build backend e frontend aprovado;
- 126 testes backend aprovados com PostgreSQL real;
- 7 testes frontend aprovados;
- migration principal aplicada; rollback e reaplicacao aprovados em banco descartavel;
- Docker Compose valido e PostgreSQL 17 saudavel;
- API, frontend e health check respondendo localmente.

Os testes cobrem revisao total e parcial, um/dois/tres destinos, varios produto/lote, quantidades invalidas, distribuicao menor/maior/exata, destinos invalidos, preservacao de lote e datas, criacao e soma de posicoes, rollback, concorrencia, saldo inexistente/insuficiente, lote incompatível, duplicidade, historico, detalhe, responsavel, auditoria, imutabilidade e idempotencia.

No fluxo HTTP real, a entrada `ed785adb-364f-486f-aff4-e1464c39eaae` preparou dois lotes e a revisao `06eb65e1-3e3b-47eb-bc90-ab4c3f9efd3e` distribuiu nove unidades em quatro parcelas. O total permaneceu `56,25` antes e depois. Distribuicao incompleta/excedente retornou HTTP 400, saldo insuficiente e rollback retornaram HTTP 409, e a auditoria possui um unico `REVIEW_CREATE`.

Duas revisoes HTTP simultaneas sobre saldo `17,5` retornaram HTTP 201 e 409; uma unica baixa de `12,25` ocorreu e o total permaneceu preservado.

## Pendencias

- Nenhum navegador estava conectado ao ambiente do Codex, portanto a regressao visual automatizada nao foi capturada. O frontend foi validado por build, lint, testes e HTTP 200.
- O bundle principal possui aproximadamente 576 kB minificado; divisao por rotas permanece uma melhoria futura.
- Transformacao/criacao de produto ou lote no Varejo, cancelamento, estorno, transito, fotos e relatorios avancados continuam fora do escopo.

O PostgreSQL principal, a API e o frontend permaneceram ativos ao final da etapa.
