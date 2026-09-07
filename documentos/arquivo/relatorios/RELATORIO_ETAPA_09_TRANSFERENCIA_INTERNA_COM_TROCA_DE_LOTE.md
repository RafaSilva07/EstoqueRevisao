# Relatorio da Etapa 09 - Transferencia interna com troca de lote

- Data: 2026-09-03
- Commit funcional: `cd58050` (`feat(movements): support destination batches in transfers`)
- Status: concluida e validada

## Objetivo

Permitir que cada item de uma transferencia interna escolha o lote de destino, mantendo obrigatoriamente o produto e alterando o lote, o local ou ambos. A evolucao preserva quantidade total, transacao, concorrencia, idempotencia, auditoria e historico imutavel, sem modificar a regra de Revisar Produtos.

## Analise anterior

Os documentos oficiais, ADRs, relatorios e a implementacao existente foram relidos antes da alteracao. A arquitetura preservada e o monolito modular React/NestJS/PostgreSQL, com movimentacoes imutaveis, saldo materializado por produto/lote/local e regras de dominio concentradas nos servicos correspondentes.

A transferencia anterior registrava um unico lote no item e proibia locais iguais. A menor extensao consistente foi manter `batch_id` como origem e acrescentar `destination_batch_id`, permitindo que o mesmo modelo de movimento represente as duas posicoes sem criar outro fluxo. A ADR 022 formaliza a evolucao e substitui apenas as decisoes incompatíveis da ADR 020.

## Modelagem e migration

A migration `1788566400000-transfer-destination-batches.ts`:

- adiciona `movement_items.destination_batch_id`;
- preenche transferencias antigas com o proprio lote de origem;
- protege o lote de destino por chave estrangeira simples e por chave composta com o produto;
- adiciona indice para consultas do lote de destino;
- permite locais iguais somente em `TRANSFERENCIA_INTERNA`, mantendo intactas as regras estruturais de `REVISAO` e dos movimentos externos.

A migration foi aplicada no banco principal e validada em banco descartavel por aplicacao completa, rollback e reaplicacao.

## Backend

O endpoint `POST /api/v1/movements/internal-transfers` possui DTO proprio e exige `destinationBatchId` em cada item. Entradas, saidas e revisoes rejeitam esse campo por whitelist estrita.

O backend:

- exige quantidade positiva e limitada ao saldo sob baixa condicional;
- rejeita mesmo local e mesmo lote antes de abrir a transacao;
- valida que o produto seja preservado e que os dois lotes pertençam a ele;
- bloqueia as posicoes exatas de origem e destino em ordem deterministica;
- baixa a origem e cria ou soma a posicao destino por UPSERT;
- grava os dois lotes no item e os dois locais no cabecalho;
- inclui lote de destino no detalhe e nos dados da auditoria;
- preserva rollback integral, idempotencia e historico imutavel.

O contrato e a aplicacao de saldo de `REVISAO` continuam usando somente o lote de origem em todas as distribuicoes. Um teste de contrato rejeita explicitamente `destinationBatchId` na revisao.

## Frontend mobile-first

O fluxo existente de transferencia foi ampliado, sem criar outra operacao. Depois da origem e quantidade, o usuario seleciona o local e o lote de destino. O lote atual aparece como opcao explicita, lotes existentes sao filtrados pelo produto e o mesmo local informa que exige troca de lote.

O modal rapido de lote foi extraido para `QuickBatchDialog` e e compartilhado com Nova Entrada. Ele continua enviando fabricacao e validade para o endpoint central de lotes, que gera e valida o codigo `CONSERVADI`. O novo lote e selecionado automaticamente ao ser criado.

Cards, confirmacao e historico apresentam a rota completa no formato produto, lote e local de origem para produto, lote e local de destino, acompanhada da quantidade.

## Testes e verificacoes

Resultados finais:

- lint aprovado sem avisos;
- build NestJS e React/Vite aprovado;
- 138 testes backend aprovados em 12 suites, incluindo PostgreSQL real;
- 7 testes frontend aprovados em 2 arquivos;
- migration principal aplicada; aplicacao completa, rollback e reaplicacao aprovados em banco descartavel;
- Docker Compose valido e PostgreSQL 17 saudavel;
- API e health check respondendo localmente.

Os testes cobrem lote mantido, lote alterado em outro local, lote alterado no mesmo local, soma em destino existente, criacao de posicao, lote incompatível com o produto, ausencia do lote de destino, operacao sem alteracao, saldo insuficiente, preservacao do total, historico das duas pontas, rollback, concorrencia, auditoria, idempotencia e preservacao estrita do lote em revisoes.

## Pendencias

- Nenhum navegador estava conectado ao ambiente do Codex, portanto nao foi possivel capturar uma regressao visual automatizada. O frontend foi validado por lint, build, testes e resposta HTTP.
- O bundle principal possui aproximadamente 582 kB minificado; divisao por rotas permanece uma melhoria futura.
- Cancelamento, estorno, conferencia em transito e relatorios avancados continuam fora do escopo.

O PostgreSQL, a API e o frontend devem permanecer ativos ao final da etapa.
