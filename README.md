# EstoqueRevisao

Fundacao tecnica do Sistema Web de Controle do Estoque da Revisao. O projeto segue a arquitetura oficial registrada em `documentos/`: frontend React/Vite e API NestJS em monolito modular, com PostgreSQL.

Esta etapa entrega infraestrutura. Os modulos completos de estoque, movimentacoes e revisoes ainda nao foram implementados.

## Estrutura

```text
apps/
  backend/
    src/
      config/       validacao das variaveis de ambiente
      database/     TypeORM, migrations e scripts operacionais
      modules/
        auth/       login, refresh, logout e guards
        users/      usuarios, perfis e permissoes
        audit/      trilha de auditoria persistente
        health/     verificacao da API e do PostgreSQL
      shared/       erros, logs, request ID e seguranca transversal
  frontend/         shell React/Vite e verificacao do health check
documentos/         fonte oficial de decisoes do sistema
```

O npm workspace na raiz executa os dois aplicativos sem acoplar suas responsabilidades.

## Pre-requisitos

- Node.js 22 ou superior;
- npm 11 ou superior;
- PostgreSQL acessivel localmente ou por URL.

Docker nao e necessario para desenvolvimento. O codigo usa configuracao externa e escuta em `0.0.0.0`, portanto podera ser empacotado em container sem alterar o dominio.

## Configuracao local

1. Copie o arquivo de exemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Edite `.env`, principalmente `DATABASE_URL`, `JWT_ACCESS_SECRET` e `BOOTSTRAP_PASSWORD`. O segredo JWT deve ter no minimo 32 caracteres e nao deve ser versionado.

3. Instale as dependencias:

   ```powershell
   npm install
   ```

## PostgreSQL

No PostgreSQL, crie um usuario e um banco dedicados. O exemplo abaixo deve ser executado por um administrador do banco, trocando a senha:

```sql
CREATE ROLE estoque_revisao_app WITH LOGIN PASSWORD 'troque_esta_senha';
CREATE DATABASE estoque_revisao OWNER estoque_revisao_app;
```

Confirme que a `DATABASE_URL` do `.env` aponta para esse banco e aplique o schema:

```powershell
npm run db:migration:run
npm run db:migration:show
```

Para desfazer somente a ultima migration em ambiente de desenvolvimento:

```powershell
npm run db:migration:revert
```

`synchronize` esta desativado. Toda alteracao de schema deve ser versionada por migration. As colunas de data usam `timestamptz`; a aplicacao trafega datas em ISO 8601/UTC.

## Primeiro usuario

Depois das migrations, defina `BOOTSTRAP_USERNAME` e `BOOTSTRAP_PASSWORD` no `.env` e execute:

```powershell
npm run db:user:create
```

O comando gera um hash Argon2id com salt, cria o usuario em transacao e registra a acao na auditoria sem gravar a senha. Nenhum perfil ou permissao e atribuido automaticamente, pois a matriz funcional ainda precisa ser definida. Nao existe cadastro publico de usuarios.

## Execucao

Em terminais separados:

```powershell
npm run dev:backend
npm run dev:frontend
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Health check: `GET http://localhost:3000/api/v1/health`

Rotas de autenticacao preparadas:

- `POST /api/v1/auth/login` com `username` e `password`;
- `POST /api/v1/auth/refresh` usando cookie HttpOnly rotativo;
- `POST /api/v1/auth/logout`, que revoga a sessao;
- `GET /api/v1/auth/me` com access token Bearer.

## Verificacoes

```powershell
npm run build
npm run lint
npm test
```

## Decisoes de seguranca e rastreabilidade

- senha armazenada exclusivamente como hash Argon2id com salt e custos configuraveis;
- access token JWT curto e refresh token aleatorio, rotativo e persistido somente por hash SHA-256;
- sessao consultada no backend a cada acesso, permitindo revogacao efetiva no logout;
- perfis e permissoes modelados separadamente e aplicados por guards no backend;
- auditoria independente do log tecnico e do futuro historico de estoque;
- logs JSON com request ID, sem corpo da requisicao e com remocao defensiva de chaves sensiveis;
- erros e validacao seguem um envelope unico, com `code`, `message`, `requestId`, `timestamp` e `path`;
- migration com constraints, chaves estrangeiras e indices adequados para a fundacao atual.

Os dados de auditoria nao possuem endpoints de edicao ou exclusao. Operacoes futuras que afetem estoque devem usar uma transacao TypeORM e passar o mesmo `EntityManager` para persistencia operacional, saldo e `AuditService`.
