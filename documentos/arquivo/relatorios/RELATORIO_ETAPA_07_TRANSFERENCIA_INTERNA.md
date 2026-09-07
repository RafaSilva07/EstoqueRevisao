# Relatorio da Etapa 07 - Transferencia interna

- Data: 2026-09-02
- Commit funcional: `6cdb738` (`feat(movements): implement internal stock transfers`)
- Status: concluida e validada

## Objetivo

Implementar a transferencia imediatamente efetivada entre dois locais controlados, preservando a quantidade total e reutilizando movimentacoes, itens, estoque, produtos, lotes, locais, autenticacao, permissoes, historico, auditoria, transacoes e controle de concorrencia.

O fluxo especifico de Revisar Produtos, com distribuicao para varios destinos, permaneceu fora do escopo.

## Analise anterior

### Estrutura reutilizada

- `movements`: cabecalho imutavel com tipo, origem, destino, responsavel, ocorrencia, status e observacao.
- `movement_items`: varios itens de produto, lote e quantidade no mesmo documento.
- `StockPositionsService`: fronteira unica para alteracoes do saldo.
- `StockPositionsRepository`: UPSERT atomico para adicao e UPDATE condicional para baixa.
- transacao TypeORM: o mesmo `EntityManager` participa de documento, itens, saldos e auditoria.
- locais configuraveis: `STOCK`, `SUBSTOCK` e `EXTERNAL`, sem nomes fixos na regra.
- historico e detalhe: consulta geral existente, separada da auditoria.
- frontend mobile-first: API client, feedback, loading, estado vazio, confirmacao e navegacao operacional.

Entrada e saida ja compartilhavam corretamente o fluxo efetivo de movimentacoes. O DTO foi apenas renomeado de externo para efetivo para representar os tres tipos sem uma abstracao paralela.

### Compatibilidade documental

A arquitetura oficial preve transferencia interna transacional e historico preservado. A definicao funcional tambem separa Transferencia da futura Revisao.

O documento funcional completo descreve estados de transito para operacoes que dependem de confirmacao. O recorte explicito desta etapa determina uma transferencia imediatamente `EFETIVADA`; nenhum estado futuro, foto ou confirmacao foi simulado.

Nao houve inconsistencia impeditiva.

## Implementacao do backend

### Endpoint

```text
POST /api/v1/movements/internal-transfers
```

A rota exige autenticacao e a permissao existente `movements.create`.

### Regras

- tipo `TRANSFERENCIA_INTERNA` e status `EFETIVADA`;
- origem ativa `STOCK` ou `SUBSTOCK`;
- destino ativo `STOCK` ou `SUBSTOCK`;
- origem e destino obrigatoriamente diferentes;
- uma origem e um destino para todos os itens;
- varios itens permitidos;
- quantidade positiva, finita e com no maximo seis casas decimais;
- quantidade limitada pelo saldo definitivo da origem;
- produto e lote associados corretamente;
- combinacao produto/lote duplicada rejeitada;
- destino inexistente criado e destino existente acumulado;
- request UUID idempotente por usuario e tipo;
- nenhuma rota de edicao ou exclusao.

Os nomes Revisar, Lata Boa, Varejo e TUF nao aparecem na regra. A classificacao configurada do local define se ele e interno.

## Transacao e concorrencia

O metodo `StockPositionsService.transferQuantity` executa, dentro do `EntityManager` recebido:

1. validacao de quantidade, produto, lote e locais;
2. bloqueio pessimista das posicoes existentes da origem e do destino;
3. baixa da origem por UPDATE condicionado a saldo suficiente;
4. UPSERT da mesma quantidade no destino.

As duas posicoes sao consultadas para lock em ordem crescente do identificador do local. Quando existem varios itens, eles sao processados em ordem deterministica por produto/lote. Isso reduz deadlocks tanto em operacoes com varios itens quanto em transferencias simultaneas de sentidos opostos.

O PostgreSQL continua sendo a autoridade final: duas requisicoes nao podem consumir o mesmo saldo alem do disponivel. Qualquer falha reverte movimentacao, itens, todas as origens, todos os destinos e auditoria.

Invariante por item:

```text
retirada da origem = adicao no destino
total antes = total depois
```

## Frontend mobile-first

Foi criada a tela `Nova transferencia interna` com:

- origem e destino internos, excluindo o proprio local de origem;
- produtos derivados apenas das posicoes positivas da origem;
- lotes derivados apenas do produto e saldo escolhidos;
- saldo disponivel e validade visiveis no formulario;
- validacao antecipada de quantidade;
- composicao e remocao de varios itens;
- bloqueio de origem e destino enquanto existirem itens, com orientacao para remove-los antes da troca;
- resumo da rota e dos itens antes da confirmacao;
- botao bloqueado e feedback durante o envio;
- chave idempotente preservada ate o sucesso;
- recarga dos saldos apos erro concorrente;
- redirecionamento para o detalhe com mensagem de sucesso.

A funcionalidade foi adicionada a Home, tela Operacoes e sidebar. A barra inferior continua com cinco destinos no mobile. A consulta de estoque oferece `Transferir esta posicao`, abrindo a mesma tela com origem, produto e lote preenchidos; o atalho so aparece com permissao de criacao.

O historico geral passou a reconhecer e filtrar `Transferencia interna`, mantendo o detalhe com identificador, tipo, status, data/hora, origem, destino, responsavel, observacao, produto, lote, fabricacao, validade e quantidade.

## Migration

Nenhuma migration foi criada.

A tabela generica ja possui tipo textual, origem, destino, itens e constraint de locais diferentes. As permissoes `movements.create` e `movements.read` tambem abrangem corretamente a operacao.

## Cobertura dos cenarios obrigatorios

| Cenario | Cobertura |
| --- | --- |
| transferencia simples, parcial e total | integracao PostgreSQL |
| varios itens | unidade e integracao PostgreSQL |
| origem igual ao destino | unidade, integracao e fluxo API real |
| origem ou destino externo | unidade e integracao PostgreSQL |
| quantidade zero, negativa ou com precisao invalida | servico central e integracao |
| saldo insuficiente | unidade, integracao e fluxo API real |
| produto sem saldo | integracao PostgreSQL |
| lote sem saldo | integracao PostgreSQL |
| lote de outro produto | integracao PostgreSQL |
| criacao de posicao no destino | integracao PostgreSQL |
| soma em posicao existente | integracao PostgreSQL |
| rollback completo | integracao e fluxo API real |
| preservacao da quantidade total | integracao e fluxo API real |
| historico, detalhe e responsavel | integracao e fluxo API real |
| auditoria | unidade, integracao e banco real |
| tentativa de editar | servico, integridade e HTTP 404 real |
| itens duplicados | unidade backend e frontend |
| concorrencia e saldo negativo | integracao PostgreSQL |
| locks em sentidos opostos | integracao PostgreSQL |
| submissao duplicada | unidade, integracao e fluxo API real |

## Verificacoes finais

| Verificacao | Resultado |
| --- | --- |
| `npm run build` | backend e frontend aprovados |
| `npm run lint` | aprovado sem erros ou avisos |
| suite backend com PostgreSQL | 10 suites e 98 testes aprovados |
| suite frontend | 1 suite e 4 testes aprovados |
| testes direcionados de movimento/saldo | 62 aprovados |
| `npm run db:migration:show` | 4 migrations aplicadas |
| `docker compose config --quiet` | aprovado |
| PostgreSQL Docker | saudavel |
| API e frontend | HTTP 200 |
| `git diff --check` | aprovado |

O build do frontend emite somente o aviso nao bloqueante de bundle principal com aproximadamente 553 kB minificado.

## Fluxo funcional real

O banco persistente foi validado com o usuario `admin-local`:

1. uma Entrada Externa adicionou 12 e 6 unidades de dois lotes em Revisar;
2. uma Transferencia Interna moveu 5 e 2 unidades de Revisar para TUF;
3. as origens mudaram de `12` para `7` e de `6` para `4`;
4. os destinos foram criados de `0` para `5` e de `0` para `2`;
5. o total permaneceu `18` antes e depois;
6. o reenvio retornou o mesmo documento;
7. uma transferencia com ultimo item insuficiente reverteu o primeiro;
8. origem igual ao destino retornou `SAME_TRANSFER_LOCATIONS`;
9. historico, detalhe, usuario responsavel e auditoria foram confirmados;
10. `PATCH` da movimentacao retornou HTTP 404.

Transferencia criada: `7022dbcf-65e5-4ff7-ad66-e86efcb34d91`.

Foi confirmado exatamente um registro `INTERNAL_TRANSFER_CREATE` na auditoria.

## Arquivos principais

- `apps/backend/src/modules/movements/domain/movement-type.enum.ts`
- `apps/backend/src/modules/movements/dto/create-effective-movement.dto.ts`
- `apps/backend/src/modules/movements/movements.controller.ts`
- `apps/backend/src/modules/movements/movements.service.ts`
- `apps/backend/src/modules/movements/movements.service.spec.ts`
- `apps/backend/src/modules/movements/movements.integration.spec.ts`
- `apps/backend/src/modules/stocks/stock-positions.repository.ts`
- `apps/backend/src/modules/stocks/stock-positions.service.ts`
- `apps/backend/src/modules/stocks/stock-positions.service.spec.ts`
- `apps/frontend/src/InternalTransferPage.tsx`
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/api.ts`
- `apps/frontend/src/styles.css`
- `documentos/ADR_020_TRANSFERENCIA_INTERNA_E_PRESERVACAO_DE_QUANTIDADE.md`
- `README.md`

## Como executar

```powershell
npm install
npm run docker:up
npm run db:migration:run
npm run dev:backend
npm run dev:frontend
```

- Interface: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Health: `http://localhost:3000/api/v1/health`
- PostgreSQL local atual: `127.0.0.1:55432`

O container pode ser recriado. O volume `estoque-revisao_postgres_data` preserva os dados enquanto nao for removido explicitamente.

## Pendencias e limites deliberados

- O bundle frontend ultrapassa 500 kB; divisao por rotas deve ser avaliada com o crescimento dos proximos modulos.
- `App.tsx` ainda concentra telas legadas; a extracao deve continuar incrementalmente.
- A tela de transferencia nao possui teste DOM de interacao isolado; regras criticas e fluxo real estao cobertos no backend e na API.
- As listagens operacionais carregam ate 100 registros; busca remota sera necessaria em bases maiores.
- A descricao historica da permissao `movements.create` no banco ainda menciona entradas externas, embora o codigo da permissao seja corretamente generico. A descricao deve ser normalizada quando houver uma tela de administracao de permissoes ou outra migration necessaria.
- Nao foram implementados Revisar Produtos, varios destinos por revisao, transito, fotos, cancelamento, estorno, dashboard ou relatorios avancados.

Nenhuma dessas pendencias impede o uso da transferencia interna.
