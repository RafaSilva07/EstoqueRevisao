# Relatorio da Etapa 05 - Entrada externa e historico de movimentacoes

- Projeto: EstoqueRevisao
- Data: 2026-09-01
- Commit funcional: `8559e6a` - `feat: implement external stock entries`
- Status: concluida, validada e em execucao local

## 1. Objetivo

Entregar a primeira operacao funcional que altera o estoque: uma entrada proveniente de local externo, com varios itens, efeito imediato no destino controlado, historico operacional imutavel e auditoria. Saidas, transferencias, revisoes, transito, conferencia, cancelamento e estorno permaneceram fora do escopo.

## 2. Analise anterior a implementacao

Foram relidos integralmente os documentos oficiais, ADRs e relatorios anteriores, alem do codigo existente.

A stack preservada foi:

- React 19, TypeScript e Vite no frontend;
- NestJS 11 e TypeScript no backend;
- API REST versionada em `/api/v1`;
- PostgreSQL 17 via Docker Compose e TypeORM com migrations;
- monolito modular;
- JWT com refresh rotativo, Argon2id, permissoes, auditoria e logs estruturados.

O nucleo de saldo da etapa 3 ja oferecia adicao atomica por produto, lote e local usando o `EntityManager` da transacao chamadora. Essa fronteira foi reutilizada sem expor endpoint direto de alteracao de saldo.

### Diferenca de escopo identificada

O documento funcional completo descreve uma solicitacao com fotos, estado em transito e conferencia posterior. A solicitacao desta etapa definiu explicitamente uma entrada externa efetivada. O recorte implementado registra somente `ENTRADA_EXTERNA` com status `EFETIVADA`, sem simular as etapas futuras. A decisao foi registrada no ADR 018.

## 3. Modelo e migration

A migration `1788393600000-external-entry-movements.ts` criou:

- `movements`, com identificador, chave idempotente, tipo, origem, destino, usuario responsavel, ocorrencia, status, observacao e criacao;
- `movement_items`, com movimentacao, produto, lote e quantidade `numeric(18,6)`;
- chaves estrangeiras `RESTRICT`;
- chave estrangeira composta que garante que o lote pertence ao produto;
- check de quantidade positiva e de origem/destino diferentes;
- indices por periodo, tipo, origem, destino, produto, lote e documento;
- permissoes `movements.read` e `movements.create`, atribuidas ao perfil `ADMIN`.

A chave UUID `request_key` e unica e protege o formulario contra duplo envio. Uma repeticao do mesmo usuario retorna o documento ja criado, sem duplicar saldo, itens ou auditoria.

## 4. Backend

Foi criado o modulo `movements`, seguindo a divisao controller, service, repository e entities.

### Operacao transacional

`POST /api/v1/movements/external-entries`:

1. valida a chave idempotente;
2. exige origem ativa do tipo `EXTERNAL`;
3. exige destino ativo `STOCK` ou `SUBSTOCK`;
4. cria o cabecalho efetivado;
5. valida produto ativo, lote associado e quantidade positiva com ate seis casas;
6. soma cada item ao destino pelo `StockPositionsService`;
7. grava todos os itens;
8. registra auditoria com usuario, documento, locais, momento e itens;
9. confirma tudo em uma unica transacao.

Qualquer falha reverte cabecalho, itens, saldos e auditoria. A origem externa nao possui posicao de estoque e nao sofre reducao.

### Historico

- `GET /api/v1/movements`: listagem paginada com filtros de periodo, tipo, origem, destino e produto;
- `GET /api/v1/movements/:id`: detalhe com cabecalho, responsavel e itens;
- nenhuma rota `PATCH`, `PUT` ou `DELETE` foi criada;
- itens usam `RESTRICT`, protegendo tambem contra exclusao fisica direta do cabecalho enquanto existirem dependencias.

## 5. Frontend mobile-first

A home passou a apresentar as acoes reais `Nova entrada` e `Historico`, condicionadas pelas permissoes.

### Nova entrada

- selecao de origem externa e destino controlado;
- composicao de varios itens por produto, lote e quantidade;
- remocao de itens antes da confirmacao;
- criacao rapida de lote em modal, usando o endpoint e a regra `CONSERVADI` existentes;
- resumo final de confirmacao;
- bloqueio visual durante o envio;
- chave idempotente mantida durante o envio e renovada somente apos sucesso;
- redirecionamento para o detalhe do documento criado.

### Historico

- filtros por periodo, origem, destino e produto;
- tipo limitado a Entrada externa nesta etapa;
- cards no mobile e tabela no desktop;
- detalhe somente leitura com data/hora, status, responsavel, origem, destino, observacao e itens.

A navegacao inferior mobile passou a oferecer Inicio, Entrada, Historico, Estoque e Mais. No desktop, Nova entrada e Historico foram adicionados a sidebar.

## 6. Testes implementados

Foram adicionados 12 testes unitarios do servico de movimentacoes e 4 testes de integracao PostgreSQL, cobrindo:

- entrada com um ou varios itens;
- criacao e acumulacao de posicao no destino;
- ausencia de reducao na origem externa;
- origem e destino invalidos;
- propagacao de produto, lote e quantidade invalidos;
- rollback integral quando um item posterior falha;
- auditoria dentro da transacao;
- tipo, status, responsavel e data/hora;
- protecao contra envio duplicado;
- listagem com filtros;
- detalhe completo;
- ausencia de operacoes de edicao/exclusao;
- protecao de exclusao pela integridade referencial.

## 7. Validacoes executadas

| Verificacao | Resultado |
| --- | --- |
| Build backend e frontend | Aprovado |
| ESLint | Aprovado sem erros ou avisos |
| Testes unitarios backend | 52 aprovados |
| Testes frontend | 4 aprovados |
| Integracao PostgreSQL de saldo e movimentacoes | 9 aprovados |
| `git diff --check` | Aprovado |
| `docker compose config --quiet` | Aprovado |
| Migration no banco principal | Aplicada e listada como executada |
| Health check | `up` |
| Fluxo API real com dois itens | Aprovado |
| Reenvio da mesma chave | Mesmo documento, sem duplicacao |
| Historico filtrado e detalhe | Aprovados |

O fluxo real criou a movimentacao `c83951a4-76db-447a-9d20-2c59c4f9849c`, com dois itens, quantidade total 2 no destino e uma unica efetivacao apesar do reenvio.

## 8. Arquivos principais

- `apps/backend/src/modules/movements/`;
- `apps/backend/src/database/migrations/1788393600000-external-entry-movements.ts`;
- `apps/backend/src/modules/stocks/stock-positions.service.ts`;
- `apps/frontend/src/App.tsx`;
- `apps/frontend/src/api.ts`;
- `apps/frontend/src/styles.css`;
- `documentos/ADR_018_ENTRADA_EXTERNA_E_HISTORICO_DE_MOVIMENTACOES.md`;
- `README.md`.

## 9. Como executar

Na raiz do projeto:

```powershell
npm install
npm run docker:up
npm run db:migration:run
npm run db:user:create
```

Depois, em terminais separados:

```powershell
npm run dev:backend
npm run dev:frontend
```

- frontend: `http://localhost:5173`;
- API: `http://localhost:3000/api/v1`;
- health: `http://localhost:3000/api/v1/health`;
- PostgreSQL local atual: `127.0.0.1:55432`, conforme o `.env` nao versionado.

O container principal e o volume `estoque-revisao_postgres_data` permaneceram ativos. Nenhum volume foi removido.

## 10. Preparacao para proximas etapas

- cabecalho e itens reutilizaveis por novos tipos de movimentacao;
- historico operacional separado de saldo e auditoria;
- permissao granular pronta para novos perfis;
- idempotencia para formularios operacionais;
- filtros consolidados de historico;
- saldo transacional pronto para futuras saidas e transferencias;
- estrutura imutavel preparada para operacoes compensatorias futuras.

## 11. Divida tecnica e escopo futuro

- solicitacao em transito, fotos, conferencia e divergencias ainda devem ser modeladas em etapa propria;
- cancelamento e estorno ainda nao existem e deverao usar operacao compensatoria, nunca apagar o original;
- saidas, transferencias e revisoes nao foram implementadas;
- a tela carrega ate 100 produtos, lotes e locais por vez; busca remota progressiva sera necessaria em bases maiores;
- o bundle principal do frontend superou levemente 500 kB e devera receber divisao por rotas quando novos modulos ampliarem a aplicacao;
- a renovacao transparente do access token durante uma requisicao expirada permanece pendente;
- regressao visual automatizada aguarda um navegador controlavel conectado.

Nenhuma dessas pendencias impede o uso da entrada externa desta etapa.
