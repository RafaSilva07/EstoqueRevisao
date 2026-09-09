# Arquitetura

## Stack

| Camada | Tecnologia |
| --- | --- |
| Organização | npm workspaces |
| Frontend | React 19, TypeScript e Vite |
| Backend | Node.js 22+, TypeScript e NestJS 11 |
| API | REST/JSON com prefixo `/api/v1` |
| Persistência | PostgreSQL 17 e TypeORM |
| Testes | Jest no backend e Vitest no frontend |
| Qualidade | TypeScript estrito e ESLint |

A aplicação é um monólito modular. Microserviços, filas e tecnologias adicionais só devem ser introduzidos diante de uma necessidade documentada.

## Estrutura do repositório

```text
apps/
  backend/src/
    config/          validação do ambiente
    database/        TypeORM, migrations e scripts
    modules/
      auth/          login, sessões, JWT e guards
      users/         usuários, perfis e permissões
      audit/         auditoria persistente
      products/      produtos e conversões
      batches/       lotes e código CONSERVADI
      stocks/        locais e posições de estoque
      movements/     operações e histórico
      reports/       consultas operacionais e exportação CSV
      health/        saúde da aplicação e do banco
    shared/          logs, erros, validação e paginação
  frontend/src/      shell, páginas, componentes e cliente da API
documentos/          documentação canônica e arquivo histórico
docker-compose.yml   PostgreSQL do desenvolvimento
```

## Responsabilidades e dependências

- Controllers tratam HTTP, autenticação contextual e DTOs; não implementam regra de negócio.
- Services concentram regras e coordenam casos de uso.
- Repositories isolam persistência e consultas.
- Entities refletem o modelo relacional, sem transformar DTOs em contratos implícitos.
- `StockPositionsService` é a única fronteira de alteração do saldo.
- `MovementsService` coordena documento, itens, distribuições, efeitos no estoque e auditoria.
- `ReportsRepository` concentra consultas de leitura, agregações e filtros sem duplicar histórico ou saldo.
- `AuditService` aceita o `EntityManager` da operação para participar da mesma transação.
- O frontend nunca substitui validação ou autorização do backend.

Evite abstrações prematuras. Uma regra compartilhada deve ser extraída quando já existir uso real, como a codificação de lotes e as operações atômicas de saldo.

## Modelo de dados principal

- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`: identidade e autorização.
- `auth_sessions`: refresh tokens e revogação de sessão.
- `audit_logs`: trilha técnica/administrativa persistente.
- `products`, `product_unit_conversions`, `batches`: cadastros de produto e lote.
- `stock_locations`: locais lógicos hierárquicos e configuração da revisão.
- `stock_positions`: saldo materializado por produto, lote e local.
- `movements`: cabeçalho, estado e metadados de cancelamento.
- `movement_items`: produto, lote de origem, lote de destino quando aplicável e quantidade.
- `movement_item_distributions`: destinos e parcelas de itens revisados.

UUIDs são gerados pela aplicação. Chaves estrangeiras usam `RESTRICT` onde o histórico deve ser preservado. O banco aplica checks, unicidades e chaves compostas para impedir dados incompatíveis.

## Transações, concorrência e integridade

- `synchronize` é desativado; toda evolução do schema ocorre por migration versionada.
- Operações críticas recebem um único `EntityManager` e confirmam documento, saldo e auditoria juntos.
- Adição de saldo usa UPSERT atômico.
- Remoção usa `UPDATE` condicionado a `quantity >= requested`.
- Transferências e distribuições bloqueiam posições com `pessimistic_write` em ordem determinística.
- Cancelamento bloqueia primeiro a movimentação original e depois as posições necessárias.
- Uma falha deve ser propagada para o limite transacional; não se deve capturar erro para confirmar estado parcial.
- Quantidade permanece armazenada como `numeric(18,6)` por compatibilidade com o histórico, mas novas operações aceitam somente números inteiros positivos. Data/hora de evento é `timestamptz`.

## API, validação e erros

- Prefixo global: `/api/v1`.
- Entrada é validada por DTOs com `whitelist`, rejeição de campos desconhecidos e transformação controlada.
- Listagens usam paginação e filtros definidos por DTO.
- Relatórios aplicam os mesmos filtros nas linhas e totais; a exportação CSV remove apenas a paginação.
- Erros seguem envelope padronizado com código, mensagem, request ID, timestamp e caminho.
- Erros internos não expõem stack trace, SQL ou detalhes de infraestrutura ao cliente.
- Criações de movimentação usam `request_key` UUID para idempotência.
- Não existem endpoints públicos para alterar saldo nem endpoints de edição/exclusão de movimentação.

## Autenticação e autorização

- Senhas são armazenadas somente como hash Argon2id com salt e custos configuráveis.
- Access token JWT possui curta duração e fica somente em memória no frontend.
- Refresh token é aleatório, rotativo, enviado por cookie `HttpOnly`, `SameSite=Strict` e `Secure` configurável.
- O banco armazena somente SHA-256 do refresh token.
- Sessões são consultadas e podem ser revogadas; logout invalida a sessão.
- Guards globais exigem autenticação e permissões; rotas públicas usam declaração explícita.
- O perfil inicial `ADMIN` recebe as permissões criadas pelas migrations. Perfis adicionais não devem ser presumidos.

Permissões atuais:

```text
products.read / products.create / products.update
product-conversions.read / product-conversions.create / product-conversions.update
batches.read / batches.create / batches.update
stocks.read / stocks.create / stocks.update
stock-positions.read
movements.read / movements.create / movements.cancel
```

## Logs, auditoria e dados sensíveis

- Logs técnicos são JSON estruturado com timestamp, nível, contexto e request ID.
- O middleware registra método, rota, status e duração, mas não registra corpos de requisição.
- Chaves relacionadas a senha, token, cookie, autorização e segredo são removidas defensivamente.
- Auditoria é separada dos logs e do histórico de movimentações.
- Senhas, access tokens, refresh tokens e segredos nunca devem aparecer em logs ou auditoria.

## Configuração e PostgreSQL

- Variáveis públicas estão documentadas em `.env.example`; valores reais ficam no `.env`, fora do Git.
- O backend valida as variáveis ao iniciar.
- PostgreSQL de desenvolvimento roda em `postgres:17-alpine` via Docker Compose, com health check, porta limitada ao loopback e volume persistente.
- API e frontend rodam diretamente pelo Node.js no desenvolvimento e podem ser containerizados futuramente sem alteração de domínio.
- `DATABASE_URL` é o banco local; `TEST_DATABASE_URL` deve apontar para banco isolado e descartável.

## Frontend

- Abordagem mobile-first a partir de 320 px.
- Navegação inferior no celular e sidebar no desktop.
- Tabelas se tornam cards em telas estreitas.
- Formulários possuem feedback de carregamento, erro, sucesso, estados vazios e confirmação para ações críticas.
- Ações são ocultadas conforme permissões, mas a proteção definitiva permanece no backend.
- A área Relatórios usa cards/listas no celular e reutiliza `movements.read` e `stock-positions.read`, sem criar permissões redundantes.
- Componentes compartilhados atuais incluem cabeçalho de página, avisos, loading, estado vazio, confirmação e criação rápida de lote.

## Testes e critérios de mudança

- Regras puras e services devem possuir testes unitários.
- Operações transacionais, constraints e concorrência devem ser testadas em PostgreSQL real.
- Fluxos visuais devem ao menos passar por tipos, lint, build e testes dos cálculos/estados críticos; testes de interação devem crescer incrementalmente.
- Uma mudança de schema deve incluir migration, rollback válido e registro em [HISTORICO.md](./HISTORICO.md).
- Uma mudança funcional deve atualizar [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md) e [FUNCIONALIDADES.md](./FUNCIONALIDADES.md) quando aplicável.
