# EstoqueRevisao

Sistema web para controle do estoque da Revisao, estruturado como monolito modular. A stack oficial e React com TypeScript/Vite no frontend, NestJS com TypeScript no backend e PostgreSQL 17, executado localmente por Docker Compose.

O sistema entrega os cadastros base, a codificacao rastreavel de lotes, o saldo atual por produto/lote/local e entradas, saidas e transferencias internas efetivadas com historico imutavel. Conferencia em transito e revisoes ainda nao fazem parte do sistema.

## Estrutura

```text
apps/
  backend/src/
    config/             configuracao e validacao do ambiente
    database/           TypeORM, migrations e scripts operacionais
    modules/
      auth/             login, sessao rotativa, guards e permissoes
      users/            usuarios e perfis
      audit/            trilha de auditoria persistente
      products/         produtos e conversoes de unidade
      batches/          lotes vinculados a produtos
      stocks/           locais logicos e posicoes de estoque
      movements/        entradas, saidas, transferencias e historico
      health/           saude da API e do banco
    shared/             erros, logs, paginacao e validacao
  frontend/src/         cliente da API e telas dos cadastros base
documentos/             decisoes oficiais, ADRs e relatorios das etapas
docker-compose.yml      PostgreSQL para desenvolvimento
```

## Pre-requisitos

- Node.js 22 ou superior;
- npm 11 ou superior;
- Docker Desktop com Docker Compose.

Nao e preciso instalar PostgreSQL diretamente na maquina.

## Configuracao e banco

1. Crie o arquivo local de configuracao:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Troque no `.env` pelo menos `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_ACCESS_SECRET` e `BOOTSTRAP_PASSWORD`. A senha presente na `DATABASE_URL` deve ser igual a `POSTGRES_PASSWORD`. Use um segredo JWT aleatorio com no minimo 32 caracteres.

3. Instale as dependencias e suba o PostgreSQL:

   ```powershell
   npm install
   npm run docker:up
   ```

   O comando aguarda o health check do container. Por padrao, o PostgreSQL fica disponivel apenas em `127.0.0.1:5432` e os dados persistem no volume nomeado `postgres_data`. Se a porta estiver ocupada, altere `POSTGRES_PORT` e a porta da `DATABASE_URL` no `.env`.

4. Aplique e confira as migrations:

   ```powershell
   npm run db:migration:run
   npm run db:migration:show
   ```

   `synchronize` permanece desativado. O schema so evolui por migrations versionadas. Datas e horarios persistentes usam `timestamptz` e trafegam em ISO 8601/UTC; a validade de lote usa o tipo `date`, pois nao representa um instante do dia.

5. Crie o primeiro usuario:

   ```powershell
   npm run db:user:create
   ```

   O script usa `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` e `BOOTSTRAP_ROLE_CODE`. O perfil `ADMIN`, criado pela migration, recebe as permissoes desta etapa. A senha e armazenada exclusivamente como hash Argon2id com salt e o bootstrap e auditado sem expor credenciais.

Comandos operacionais do container:

```powershell
npm run docker:logs
npm run docker:down
```

`docker:down` preserva o volume do banco. A exclusao do volume deve ser uma decisao explicita do operador.

O container e a instancia executavel e pode ser recriado automaticamente por `npm run docker:up`. Os dados ficam no volume persistente `estoque-revisao_postgres_data`, que e reconectado ao novo container. No uso diario, voce tambem pode apenas iniciar e parar o container pelo Docker Desktop; nao e necessario executar migrations novamente quando o volume ja esta atualizado.

## Execucao

Em dois terminais:

```powershell
npm run dev:backend
npm run dev:frontend
```

- Frontend: `http://localhost:5173`
- API REST: `http://localhost:3000/api/v1`
- Health check: `GET http://localhost:3000/api/v1/health`

O frontend restaura a sessao pelo refresh token HttpOnly, mantem o access token apenas em memoria e apresenta os cadastros, o estoque atual, entradas, saidas, transferencias internas e o historico operacional.

## API preparada nesta etapa

- produtos: listagem paginada com busca/status, detalhe, criacao, edicao e ativacao/inativacao;
- conversoes: listagem por produto, criacao, edicao e ativacao/inativacao;
- lotes: codigo `CONSERVADI` calculado da fabricacao (ou o inverso), validade obrigatoria e vinculo com produto;
- estoques/locais: listagem paginada com filtros, detalhe, criacao, edicao e ativacao/inativacao;
- estoque atual: consulta paginada e detalhe por produto, lote e local, sem endpoint publico de alteracao;
- movimentacoes: criacao idempotente de entradas, saidas e transferencias internas com varios itens, listagem filtrada por tipo e detalhe somente leitura;
- autenticacao: login, refresh rotativo, logout e consulta da sessao;
- autorizacao: permissoes especificas aplicadas em todas as rotas de cadastro;
- auditoria: usuario, acao, entidade, identificador, data/hora, valores anteriores e novos;
- validacao e erros: DTOs com whitelist e envelope de erro padronizado.

Os locais iniciais sao configuracao persistida no banco: Revisao, Revisar, Lata Boa, Varejo, TUF, Expedicao e Producao. O saldo e mantido por um servico interno transacional e sera alimentado pelos modulos operacionais futuros.

### Entrada externa

`POST /api/v1/movements/external-entries` recebe uma origem externa, um destino controlado, uma chave UUID de idempotencia e um ou mais itens. A operacao cria historico, incrementa o saldo e registra auditoria na mesma transacao. Consulte por `GET /api/v1/movements` usando filtros de periodo, tipo, origem, destino e produto, ou obtenha o detalhe em `GET /api/v1/movements/:id`.

Entradas efetivadas nao possuem rotas de edicao ou exclusao. Cancelamentos e estornos serao operacoes compensatorias futuras.

### Saida externa

`POST /api/v1/movements/external-exits` recebe uma origem controlada, um destino externo, uma chave UUID de idempotencia e um ou mais itens. Cada produto/lote deve possuir saldo positivo na origem e a quantidade solicitada nao pode superar o disponivel. A operacao reduz somente o saldo da origem e confirma cabecalho, itens, saldos e auditoria na mesma transacao.

Itens repetidos pelo mesmo produto/lote sao rejeitados de forma deterministica. Atualizacoes condicionais no PostgreSQL impedem saldo negativo inclusive sob requisicoes concorrentes. Posicoes zeradas permanecem preservadas no banco para integridade historica, mas nao aparecem na consulta operacional de saldos disponiveis.

Saidas efetivadas compartilham o historico, os filtros e o detalhe imutavel das entradas. Nao existem rotas de edicao, exclusao, cancelamento ou estorno nesta etapa.

### Transferencia interna

`POST /api/v1/movements/internal-transfers` recebe dois locais controlados diferentes, uma chave UUID de idempotencia e um ou mais itens. Para cada item, a mesma quantidade e retirada da origem e adicionada ao destino dentro da transacao do documento, preservando o total geral.

Produto e lote devem possuir saldo positivo na origem. Itens repetidos sao rejeitados, as posicoes envolvidas sao bloqueadas em ordem deterministica e os itens sao processados por uma chave estavel para reduzir deadlocks. O destino e criado por UPSERT quando ainda nao possui a combinacao produto/lote, ou recebe a soma quando a posicao ja existe.

A transferencia usa os locais configurados no banco e aceita `STOCK` e `SUBSTOCK`; nomes como Revisar, Lata Boa, Varejo e TUF nao fazem parte da regra. Transferencias efetivadas aparecem no mesmo historico e permanecem imutaveis.

## Verificacoes

```powershell
npm run build
npm run lint
npm test
$env:TEST_DATABASE_URL='postgresql://usuario:senha@localhost:5432/estoque_revisao_test'
npm test --workspace @estoque-revisao/backend -- --runInBand stock-positions.integration.spec.ts
npm test --workspace @estoque-revisao/backend -- --runInBand movements.integration.spec.ts
npm run db:migration:show
docker compose config
```

Para validar reversibilidade em ambiente descartavel, use `npm run db:migration:revert` e reaplique com `npm run db:migration:run`.

## Seguranca e integridade

- JWT de curta duracao e refresh token aleatorio, rotativo, em cookie HttpOnly e persistido somente por SHA-256;
- senha Argon2id, sem armazenamento ou log de senha em texto puro;
- logs JSON com request ID e remocao defensiva de campos sensiveis;
- chaves estrangeiras `RESTRICT`, checks, indices e unicidade sem diferenca de maiusculas/minusculas nos codigos;
- inativacao no lugar de exclusao fisica dos cadastros aplicaveis;
- transacoes TypeORM compartilhadas entre operacao e auditoria;
- separacao entre locais logicos, futuro mapa fisico e futuros saldos.
