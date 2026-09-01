# EstoqueRevisao

Sistema web para controle do estoque da Revisao, estruturado como monolito modular. A stack oficial e React com TypeScript/Vite no frontend, NestJS com TypeScript no backend e PostgreSQL 17, executado localmente por Docker Compose.

Esta etapa entrega os cadastros base de produtos, lotes, conversoes de unidade e estoques/locais logicos. Saldos, movimentacoes, revisoes, transferencias e relatorios operacionais ainda nao fazem parte do sistema.

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
      stocks/           estoques, subestoques e pontos externos
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

## Execucao

Em dois terminais:

```powershell
npm run dev:backend
npm run dev:frontend
```

- Frontend: `http://localhost:5173`
- API REST: `http://localhost:3000/api/v1`
- Health check: `GET http://localhost:3000/api/v1/health`

O frontend restaura a sessao pelo refresh token HttpOnly, mantem o access token apenas em memoria e apresenta telas de consulta, criacao e edicao de produtos, lotes e estoques/locais.

## API preparada nesta etapa

- produtos: listagem paginada com busca/status, detalhe, criacao, edicao e ativacao/inativacao;
- conversoes: listagem por produto, criacao, edicao e ativacao/inativacao;
- lotes: listagem paginada com filtros, detalhe, criacao e edicao, sempre vinculados a um produto;
- estoques/locais: listagem paginada com filtros, detalhe, criacao, edicao e ativacao/inativacao;
- autenticacao: login, refresh rotativo, logout e consulta da sessao;
- autorizacao: permissoes especificas aplicadas em todas as rotas de cadastro;
- auditoria: usuario, acao, entidade, identificador, data/hora, valores anteriores e novos;
- validacao e erros: DTOs com whitelist e envelope de erro padronizado.

Os locais iniciais sao configuracao persistida no banco: Revisao, Revisar, Lata Boa, Varejo, TUF, Expedicao e Producao. Nenhum saldo foi adicionado a produto, lote ou local.

## Verificacoes

```powershell
npm run build
npm run lint
npm test
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
