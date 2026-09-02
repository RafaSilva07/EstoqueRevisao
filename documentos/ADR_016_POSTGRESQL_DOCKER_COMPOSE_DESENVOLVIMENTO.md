# ADR 016 — PostgreSQL via Docker Compose no desenvolvimento

- Status: aceito
- Data: 2026-08-31
- Escopo: ambiente local de desenvolvimento do EstoqueRevisao

## Contexto

O documento arquitetural da fundacao permitia PostgreSQL instalado localmente e tratava Docker como opcional naquele momento. A orientacao explicita da etapa 2 determina que o PostgreSQL do projeto seja executado por Docker Compose, sem exigir uma instalacao local.

Esta orientacao nao muda a tecnologia de persistencia, o modelo relacional, o TypeORM ou a arquitetura de monolito modular. Ela padroniza apenas a forma de disponibilizar a dependencia de infraestrutura no ambiente de desenvolvimento.

## Decisao

O repositorio passa a fornecer `docker-compose.yml` com PostgreSQL 17 Alpine, health check, volume persistente e publicacao de porta restrita ao loopback. Banco, usuario, senha e porta sao configurados pelo `.env`, cujo contrato publico esta em `.env.example`.

A API e o frontend continuam executados diretamente pelo Node.js durante o desenvolvimento. Ambos permanecem configurados externamente e aptos a uma containerizacao futura sem alteracao do dominio.

## Consequencias

- Docker Desktop e Docker Compose tornam-se pre-requisitos do desenvolvimento local.
- Nao e necessario instalar nem administrar um PostgreSQL local fora do projeto.
- A versao do banco e o health check ficam reproduziveis entre desenvolvedores.
- Os dados sobrevivem a `docker compose down` por meio de volume nomeado.
- Migrations continuam sendo a unica forma autorizada de evoluir o schema; `synchronize` permanece desativado.
- A senha do banco deve existir apenas no `.env` local e nunca deve ser versionada.

## Alternativas nao adotadas

- PostgreSQL instalado diretamente no sistema operacional: deixa de ser o fluxo suportado desta etapa por reduzir a reprodutibilidade.
- Containerizar toda a aplicacao agora: adiado porque nao e necessario para os cadastros base e adicionaria complexidade sem ganho funcional imediato.
