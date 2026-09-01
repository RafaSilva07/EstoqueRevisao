# Relatorio da Etapa 02 — Cadastros Base

- Projeto: EstoqueRevisao
- Data: 2026-08-31
- Commit funcional: `5cef867` — `feat: implement base domain registries`
- Status: concluida e validada

## 1. Objetivo da etapa

Implementar as entidades e os cadastros fundamentais que serao usados posteriormente pelo controle de estoque e pelas movimentacoes, sem antecipar saldos, entradas, saidas, transferencias ou o fluxo de revisao.

Tambem foi estabelecido o PostgreSQL 17 via Docker Compose como dependencia obrigatoria e reproduzivel do desenvolvimento local.

## 2. Analise anterior a implementacao

### Stack e arquitetura preservadas

- frontend React 19, TypeScript e Vite;
- backend NestJS 11 e TypeScript;
- API REST versionada em `/api/v1`;
- PostgreSQL e TypeORM com `synchronize` desativado;
- monolito modular, sem microservicos;
- autenticacao JWT com refresh token rotativo;
- hash de senha Argon2id;
- autorizacao por perfis e permissoes;
- auditoria persistente, logs estruturados e erros padronizados.

### Componentes reaproveitados da etapa 1

- configuracao tipada por variaveis de ambiente;
- conexao TypeORM e mecanismo de migrations;
- entidades de usuario, perfil e permissao;
- login, refresh, logout e validacao de sessao;
- guards globais de autenticacao e autorizacao;
- `AuditService` capaz de participar da transacao operacional;
- filtro global de excecoes, `ValidationPipe` e request ID;
- logger JSON com remocao de dados sensiveis;
- health check da API e do PostgreSQL.

### Divergencia encontrada e resolucao

O documento arquitetural inicial permitia PostgreSQL instalado localmente e considerava Docker opcional durante a fundacao. A instrucao explicita desta etapa tornou o PostgreSQL via Docker Compose obrigatorio para o desenvolvimento.

Como a mudanca afeta apenas a disponibilizacao da infraestrutura e nao altera a stack ou o dominio, ela nao foi impeditiva. A decisao foi registrada em `ADR_001_POSTGRESQL_DOCKER_COMPOSE_DESENVOLVIMENTO.md`.

## 3. Implementacao realizada

### 3.1 Docker e PostgreSQL

Foi criado `docker-compose.yml` com:

- imagem `postgres:17-alpine`;
- banco, usuario, senha e porta configurados por ambiente;
- porta publicada somente em `127.0.0.1`;
- volume nomeado `postgres_data`;
- health check com `pg_isready`;
- somente o servico PostgreSQL, sem componentes desnecessarios.

O script `npm run docker:up` usa `docker compose up -d --wait postgres`, aguardando o banco ficar saudavel. O `.env.example` agora documenta todas as variaveis do Compose e da aplicacao.

### 3.2 Produtos

Foi criado o modulo `products`, com entidade, DTOs, repositorio, servico, controller e testes.

Campos persistidos:

- UUID;
- codigo;
- nome;
- unidade padrao;
- indicador ativo/inativo;
- usuario de criacao e alteracao;
- data/hora de criacao e alteracao.

Regras e protecoes:

- codigo unico sem diferenca entre maiusculas e minusculas;
- validacao de comprimentos e campos obrigatorios na API e no banco;
- inativacao logica, sem exclusao fisica;
- criacao, edicao e alteracao de status auditadas na mesma transacao.

### 3.3 Conversoes de unidade

As conversoes foram modeladas em tabela propria, vinculada ao produto, para evitar campos rigidos ou regras ficticias no cadastro do produto.

Cada conversao possui unidade de origem, unidade de destino, fator positivo, status e rastreabilidade de criacao/alteracao. O banco impede unidades iguais e duplicidade da mesma conversao por produto.

### 3.4 Lotes

Foi criado o modulo `batches`, mantendo a associacao obrigatoria muitos-para-um entre lotes e produto.

Campos persistidos:

- UUID;
- produto;
- codigo do lote;
- validade opcional do tipo `date`;
- usuario e data/hora de criacao e alteracao.

O codigo do lote e unico dentro do produto, sem diferenca entre maiusculas e minusculas. O cadastro exige produto existente e ativo. A associacao ao produto nao pode ser trocada pela edicao, preservando a integridade historica futura. Nenhum saldo foi adicionado ao lote.

### 3.5 Estoques e locais logicos

Foi criado o modulo `stocks`, com um cadastro configuravel e hierarquico de locais logicos:

- `STOCK`: estoque principal;
- `SUBSTOCK`: classificacao interna vinculada a um estoque pai;
- `EXTERNAL`: origem ou destino externo para futuras movimentacoes.

A migration inclui os registros configuraveis:

- Estoque Revisao;
- Revisar;
- Lata Boa;
- Varejo;
- TUF;
- Expedicao;
- Producao.

Os registros ficam no PostgreSQL, e nao codificados na interface. Um subestoque exige pai ativo do tipo estoque. Estoques com subestoques ativos nao podem ser inativados nem convertidos para outro tipo. Nao existe saldo no cadastro e a estrutura permanece separada do futuro mapa fisico.

### 3.6 Autorizacao e bootstrap

A migration cria o perfil `ADMIN` e doze permissoes especificas:

- `products.read`, `products.create`, `products.update`;
- `batches.read`, `batches.create`, `batches.update`;
- `product-conversions.read`, `product-conversions.create`, `product-conversions.update`;
- `stocks.read`, `stocks.create`, `stocks.update`.

Todas as novas rotas exigem as permissoes correspondentes no backend. O script de bootstrap passou a vincular o usuario ao perfil configurado por `BOOTSTRAP_ROLE_CODE`, com `ADMIN` como padrao. A senha continua armazenada somente como hash Argon2id e nao aparece na auditoria ou nos logs.

### 3.7 Frontend

O shell tecnico foi evoluido para uma interface funcional com:

- login e restauracao de sessao pelo cookie HttpOnly;
- navegacao entre produtos, lotes e estoques;
- listagem, criacao e edicao de produtos;
- detalhe do produto e gerenciamento inicial de conversoes;
- ativacao/inativacao de produtos;
- listagem, criacao e edicao de lotes;
- listagem, criacao, edicao e ativacao/inativacao de estoques e locais;
- exibicao de mensagens de erro retornadas pela API;
- ocultacao de acoes quando o usuario nao possui a permissao correspondente.

O access token permanece apenas em memoria no navegador. Nenhum dashboard ou fluxo operacional foi antecipado.

## 4. Migration

Arquivo: `apps/backend/src/database/migrations/1788220800000-base-registries.ts`.

A migration cria:

- `products`;
- `batches`;
- `product_unit_conversions`;
- `stock_locations`;
- indices, checks, unicidades e chaves estrangeiras;
- locais logicos iniciais;
- perfil `ADMIN` e permissoes da etapa.

A reversao foi executada em banco descartavel e remove corretamente os objetos desta etapa. Em seguida, a migration foi reaplicada com sucesso.

## 5. Endpoints entregues

Todos os caminhos abaixo usam o prefixo `/api/v1`.

### Produtos

- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PATCH /products/:id`
- `PATCH /products/:id/status`

### Conversoes

- `GET /products/:productId/conversions`
- `POST /products/:productId/conversions`
- `PATCH /product-conversions/:id`
- `PATCH /product-conversions/:id/status`

### Lotes

- `GET /batches`
- `GET /batches/:id`
- `POST /batches`
- `PATCH /batches/:id`

### Estoques e locais

- `GET /stocks`
- `GET /stocks/:id`
- `POST /stocks`
- `PATCH /stocks/:id`
- `PATCH /stocks/:id/status`

As listagens oferecem paginacao e filtros basicos apropriados ao cadastro.

## 6. Arquivos principais

- `docker-compose.yml`
- `.env.example`
- `README.md`
- `apps/backend/src/database/migrations/1788220800000-base-registries.ts`
- `apps/backend/src/modules/products/`
- `apps/backend/src/modules/batches/`
- `apps/backend/src/modules/stocks/`
- `apps/backend/src/shared/pagination/`
- `apps/backend/src/shared/validation/`
- `apps/frontend/src/api.ts`
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/styles.css`
- `documentos/ADR_001_POSTGRESQL_DOCKER_COMPOSE_DESENVOLVIMENTO.md`

## 7. Verificacoes executadas

### Verificacoes automaticas

- `npm run build`: aprovado para backend e frontend;
- `npm run lint`: aprovado sem avisos;
- `npm test`: 5 suites e 9 testes aprovados;
- `git diff --check`: aprovado;
- `docker compose config --quiet`: aprovado;
- `npm run docker:up`: PostgreSQL 17 iniciado e marcado como saudavel;
- `npm run db:migration:run`: duas migrations aplicadas;
- `npm run db:migration:show`: todas as migrations marcadas como executadas;
- `npm run db:migration:revert`: migration da etapa revertida com sucesso;
- nova aplicacao de `npm run db:migration:run`: aprovada;
- `npm run docker:down`: container removido e volume preservado.

### Testes automatizados adicionados

- criacao de produto com auditoria na mesma transacao;
- ativacao/inativacao logica de produto;
- rejeicao de lote sem produto;
- rejeicao de lote para produto inativo;
- manutencao da associacao lote/produto;
- validacao do pai de subestoque;
- protecao contra inativacao de estoque com filhos ativos.

Os testes anteriores de Argon2id e remocao de dados sensiveis continuaram aprovados.

### Verificacao funcional com API e banco reais

Com o PostgreSQL do Compose, foram confirmados:

- health check `up`;
- login do usuario bootstrap com doze permissoes;
- criacao de produto, lote e conversao;
- vinculacao correta entre produto e lote;
- inativacao de produto;
- consulta dos sete locais iniciais;
- resposta HTTP 409 para codigo de produto duplicado;
- resposta HTTP 400 para entrada invalida;
- quatro operacoes funcionais registradas na auditoria.

## 8. Como executar localmente

```powershell
Copy-Item .env.example .env
# Edite senhas, DATABASE_URL e JWT_ACCESS_SECRET
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

Aplicacao em `http://localhost:5173`, API em `http://localhost:3000/api/v1` e health check em `http://localhost:3000/api/v1/health`.

## 9. Escopo preparado para as proximas etapas

- produtos e unidades prontos para serem referenciados por itens de movimentacao;
- lotes prontos para rastreabilidade e futuros saldos por local;
- locais logicos aptos a funcionar como origem e destino;
- perfis e permissoes extensivos a novos modulos;
- transacoes e auditoria reutilizaveis pelas operacoes criticas futuras;
- filtros e paginacao padronizados para novos cadastros;
- banco reproduzivel pelo Docker Compose.

## 10. Pendencias e divida tecnica conhecida

- O frontend ainda nao renova automaticamente o access token durante uma requisicao que expira; a sessao e restaurada ao carregar a aplicacao.
- Nao existem testes automatizados de componentes visuais; o comportamento principal foi validado pelo build e pelo teste funcional da API.
- A matriz definitiva de perfis alem do `ADMIN` depende das decisoes funcionais de usuarios e operacoes das proximas etapas.
- A politica de retencao e consulta da auditoria ainda devera ser definida antes de disponibilizar telas administrativas.

Essas pendencias nao impedem os cadastros base e nao exigem refatoracao arquitetural.

## 11. Itens deliberadamente nao implementados

- saldo de estoque;
- entradas e saidas;
- transferencias;
- fluxo de revisao;
- cancelamento ou estorno de movimentacoes;
- mapa fisico detalhado;
- dashboard e relatorios avancados.
