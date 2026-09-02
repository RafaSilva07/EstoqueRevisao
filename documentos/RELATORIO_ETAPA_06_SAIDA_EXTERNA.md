# Relatorio da Etapa 06 - Saida externa

- Data: 2026-09-02
- Commit funcional: `d115389` (`feat(movements): implement external stock exits`)
- Status: concluida

## Objetivo

Implementar a saida externa efetivada como segunda operacao funcional de estoque, reutilizando a infraestrutura generica de movimentacoes, itens, saldos, autenticacao, permissoes, historico e auditoria, sem antecipar transferencias, revisoes, cancelamentos ou o fluxo em transito.

## Analise da documentacao

A arquitetura oficial define um monolito modular com React/TypeScript no frontend, NestJS/TypeScript no backend e PostgreSQL, com transacoes e auditoria nas operacoes relevantes. O modelo implementado na Etapa 05 ja separava cabecalho e itens e podia receber outro tipo de movimentacao.

A definicao funcional completa tambem descreve solicitacoes, fotos, transito e conferencia. O recorte desta etapa exige uma saida externa imediatamente `EFETIVADA`; os estados e artefatos futuros nao foram simulados. A decisao incremental foi registrada no ADR 019.

Nao foi identificada inconsistencia impeditiva. Tambem nao foi necessaria migration: `movements.type` e uma coluna textual protegida por constraint de preenchimento, e as permissoes genericas `movements.create` e `movements.read` ja representam a capacidade correta.

## Implementacao

### Backend

- Incluido o tipo `SAIDA_EXTERNA` no dominio de movimentacoes.
- Criada a rota autenticada `POST /api/v1/movements/external-exits`, protegida por `movements.create`.
- Generalizado o DTO externo para entrada e saida, preservando whitelist, UUIDs, limite de 100 itens, quantidade positiva e seis casas decimais.
- Extraido um fluxo transacional compartilhado para entrada e saida, mantendo regras especificas explicitas por tipo.
- Validada origem ativa `STOCK`/`SUBSTOCK` e destino ativo `EXTERNAL`.
- Rejeitada de forma deterministica a repeticao do mesmo produto/lote em uma saida.
- Mantida idempotencia por `request_key`, usuario e tipo; reutilizacao incompatível retorna conflito.
- Registrada auditoria `EXTERNAL_EXIT_CREATE` dentro da mesma transacao da movimentacao e dos saldos.
- Mantidos listagem, filtros e detalhe imutavel compartilhados entre entrada e saida.

### Saldo e concorrencia

- A baixa utiliza `UPDATE` condicional com `quantity >= requested` no PostgreSQL.
- Saldo insuficiente retorna o codigo `INSUFFICIENT_STOCK` e o valor disponivel.
- Uma falha em qualquer item reverte cabecalho, itens, todas as baixas anteriores e auditoria.
- A operacao nunca cria saldo no destino externo.
- Posicoes zeradas sao preservadas no banco e omitidas da listagem operacional, que apresenta somente saldos positivos.

### Frontend mobile-first

- Criada a tela `Nova saida externa`.
- A escolha da origem carrega apenas as posicoes positivas daquele local.
- Produtos e lotes derivam dessas posicoes, com saldo e validade visiveis.
- A quantidade e validada no formulario e novamente pela API.
- O formulario aceita varios itens, bloqueia duplicados, exibe resumo e exige confirmacao final.
- O botao de confirmacao fica indisponivel durante o envio e a mesma chave idempotente e preservada ate uma resposta bem-sucedida.
- Em erro de concorrencia, os saldos da origem sao recarregados.
- Inicio, menu lateral e uma tela compacta de operacoes oferecem acesso a entrada e saida.
- A barra inferior permanece com no maximo cinco destinos em celulares.
- O historico ganhou filtro por tipo e detalhe completo com identificador, tipo, status, data/hora, responsavel, origem, destino, observacao, produto, lote, fabricacao, validade e quantidade.

O atalho contextual a partir de uma posicao na consulta de estoque foi avaliado, mas nao incluido: a tela de saida ja oferece selecao orientada pelo saldo e o requisito o indicava como possibilidade, nao obrigacao. Isso evitou acoplar navegacao e estado de formulario sem necessidade nesta etapa.

## Arquivos principais

- `apps/backend/src/modules/movements/domain/movement-type.enum.ts`
- `apps/backend/src/modules/movements/dto/create-external-movement.dto.ts`
- `apps/backend/src/modules/movements/movements.controller.ts`
- `apps/backend/src/modules/movements/movements.service.ts`
- `apps/backend/src/modules/stocks/stock-positions.repository.ts`
- `apps/backend/src/modules/stocks/stock-positions.service.ts`
- `apps/backend/src/modules/movements/movements.service.spec.ts`
- `apps/backend/src/modules/movements/movements.integration.spec.ts`
- `apps/frontend/src/ExternalExitPage.tsx`
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/api.ts`
- `apps/frontend/src/styles.css`
- `documentos/ADR_019_SAIDA_EXTERNA_E_BAIXA_ATOMICA_DE_SALDO.md`
- `README.md`

## Verificacoes executadas

| Verificacao | Resultado |
| --- | --- |
| `npm run lint` | aprovado, sem avisos |
| `npm run build` | backend e frontend aprovados |
| Suite completa com PostgreSQL de teste | 73 testes backend aprovados |
| Suite do frontend | 4 testes aprovados |
| Integracao de saldo e movimentacoes | 13 testes aprovados |
| `npm run db:migration:show` | 4 migrations aplicadas |
| `docker compose config --quiet` | aprovado |
| Health check | API e PostgreSQL `up` |
| Frontend local | HTTP 200 com raiz React |

O build do frontend emite apenas o aviso nao bloqueante de bundle JavaScript acima de 500 kB.

## Fluxo real validado

Foi executado um fluxo autenticado no banco local persistente:

1. entrada de 3 unidades para preparar um segundo lote;
2. saida externa com dois itens;
3. reducao dos saldos de `2` para `1,5` e de `3` para `1,75`;
4. reenvio com a mesma chave retornando o mesmo identificador;
5. tentativa posterior com saldo excessivo retornando `INSUFFICIENT_STOCK`;
6. confirmacao de rollback do primeiro item dessa tentativa;
7. consulta da saida no historico e no detalhe;
8. confirmacao de um unico registro de auditoria `EXTERNAL_EXIT_CREATE`;
9. confirmacao de inexistencia de rota `PATCH` para movimentacoes.

A saida real criada foi `ea0ddb58-52bb-4f34-a92f-f635c7f8dab2`.

## Como executar

Com o `.env` configurado:

```powershell
npm install
npm run docker:up
npm run db:migration:run
npm run dev:backend
npm run dev:frontend
```

- Interface: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Health check: `http://localhost:3000/api/v1/health`

O container PostgreSQL pode ser parado e recriado. Os dados permanecem no volume nomeado enquanto `docker compose down -v` nao for executado.

## Preparacao para proximas etapas

- servico transacional comum pronto para novos tipos com regras explicitas;
- historico consolidado com filtro por tipo;
- baixa atomica reutilizavel sob controle do modulo operacional;
- resposta padronizada de saldo insuficiente para outras interfaces;
- auditoria e idempotencia integradas ao documento;
- tela mobile orientada pelas posicoes de saldo existentes.

## Dividas tecnicas e limites deliberados

- O bundle principal do frontend possui aproximadamente 531 kB minificado; divisao por rotas pode ser avaliada quando houver mais modulos.
- `App.tsx` concentra varias telas legadas e deve ser separado gradualmente, sem uma refatoracao ampla apenas por estilo.
- A tela de saida ainda nao possui testes isolados de interacao; as regras criticas estao cobertas no backend e o frontend possui build, lint e testes de componentes.
- A inspecao visual automatizada nao foi executada porque nenhum navegador estava conectado ao ambiente do Codex; a aplicacao respondeu corretamente por HTTP e permaneceu disponivel para verificacao manual.
- Nao foram implementados transferencia, revisao, transito, fotos, cancelamento, estorno ou relatorios operacionais.

Nenhuma dessas pendencias impede o uso da saida externa implementada nesta etapa.
