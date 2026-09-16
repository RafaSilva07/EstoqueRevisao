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
      batches/       variantes operacionais imutáveis e codec CONSERVADI
      stocks/        locais e posições de estoque
      movements/     operações e histórico
      shipments/     envios setoriais, reserva e decisão de recebimento
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
- `products`, `product_unit_conversions`: cadastro mestre e conversões. Produto possui `shelf_life_years`, obrigatório em novas criações da API e nulo apenas para legados ainda não configurados.
- `batches`: referências internas imutáveis de produto/código/fabricação/validade; unicidade por produto + código normalizado + validade, sem cadastro mestre público.
- `stock_locations`: locais lógicos hierárquicos e configuração da revisão.
- `stock_positions`: saldo materializado por produto, variante de lote/validade e local. O `batch_id` identifica a validade; as chaves de saldo e os serviços atômicos existentes permanecem.
- `shipments`, `shipment_items`: workflow imutável com itens e origens congelados; itens pendentes originados na Revisão são o registro do trânsito. O saldo disponível permanece em `stock_positions`, sem novo local artificial.
- `movements`: cabeçalho, estado, metadados de cancelamento e `shipment_id` opcional; índice único por envio/origem impede duplicar a efetivação.
- `movement_items`: produto, referências imutáveis de lote/datas de origem e destino, quantidade e `product_snapshot` de código/descrição/unidade nas novas operações. Legados não recebem snapshots inventados.
- `movement_item_distributions`: destinos e parcelas de itens revisados.
- `products.units_per_package` e `product_unit_options`: fator por embalagem e alternativas de produto unitário. Não substituem as conversões legadas do mesmo código.
- Revisões com desmontagem gravam `output_product_id`, `output_batch_id`, `output_quantity`, `units_per_package` e `output_product_snapshot` em `movement_items`. Campos nulos preservam operações anteriores. FK composta protege a associação produto/lote resultante; check protege a multiplicação, e trigger restringe a conversão à revisão com lote/datas preservados.

UUIDs são gerados pela aplicação. Chaves estrangeiras usam `RESTRICT` onde o histórico deve ser preservado. O banco aplica checks, unicidades e chaves compostas para impedir dados incompatíveis.

## Transações, concorrência e integridade

- `synchronize` é desativado; toda evolução do schema ocorre por migration versionada.
- Operações críticas recebem um único `EntityManager` e confirmam documento, saldo e auditoria juntos.
- Resolução/criação de lotes usa `OperationalLotsService` dentro do `EntityManager` da movimentação. Locks `FOR NO KEY UPDATE` de produtos são adquiridos em ordem antes dos locks de saldo, compatíveis com os locks de FK usados por revisão/estorno; índice único evita variantes duplicadas. A identidade dos lotes também é protegida por trigger contra edição.
- Divergências de validade retornam `LOT_EXPIRATION_CONFIRMATION_REQUIRED` (409), com mensagem operacional e `details.expirationKeys`. O reenvio usa `confirmedExpirationKeys` vinculadas a produto/código/data e a mesma `requestKey`; o aceite fica na auditoria. Chaves estáveis permitem confirmar inclusive duas validades novas após rollback.
- Adição de saldo usa UPSERT atômico.
- Remoção usa `UPDATE` condicionado a `quantity >= requested`.
- Transferências e distribuições bloqueiam posições com `pessimistic_write` em ordem determinística.
- `ShipmentsService` reutiliza lotes, saldo, repositório de movimentações e auditoria com o mesmo manager. Criação serializa retries via advisory lock transacional da chave; decisão bloqueia a linha do envio. Triggers impedem edição/exclusão de envios e itens. Retorno da reserva usa a mesma operação de crédito atômico, sem exigir produto ainda ativo.
- Cancelamento bloqueia primeiro a movimentação original e depois as posições necessárias.
- Revisões e estornos bloqueiam o conjunto completo de posições em ordem de produto/lote/local antes das alterações, inclusive quando várias embalagens convergem no mesmo código unitário. O serviço central de saldos mantém os débitos condicionais e créditos atômicos.
- Alterações do cadastro de embalagem e leitura da configuração na revisão usam o advisory lock transacional `product-packaging`. A revisão bloqueia produtos em ordem antes de resolver referências de lote. A auditoria registra fator, saída e distribuições na mesma transação; o estorno usa exclusivamente os dados persistidos da operação.
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
- A administração em `/users` exige adicionalmente `AdminGuard`, que verifica o perfil `ADMIN` autenticado no banco. É uma função administrativa independente do modo operacional, sem novas permissões ou tabelas. `UsersService` reutiliza o hash Argon2id, repositório, sessões e auditoria. Alterações são serializadas por advisory lock transacional; o autor é revalidado dentro da transação, e sessões da conta editada/inativada são revogadas atomicamente. Respostas usam projeção explícita sem credenciais.
- `users.sector` é consultado junto da sessão: REVISAO (incluindo usuários anteriores), PRODUCAO ou EXPEDICAO. `ADMIN` permanece interno; perfis PRODUCAO/EXPEDICAO recebem somente leitura de produtos e permissões de envios. O guard também bloqueia permissões internas para setores externos mesmo se algum perfil for configurado indevidamente.
- O frontend pode enviar `X-Operational-Sector` para alternância administrativa. O guard aceita apenas `REVISAO`, `PRODUCAO` ou `EXPEDICAO` e somente quando a sessão possui a função `ADMIN`; em seguida aplica as restrições normais do setor efetivo. A identidade autenticada e o setor persistido do usuário não são substituídos.
- Locais externos dos setores possuem `stock_locations.sector` único. A migration associa os registros iniciais uma única vez pelo código; os serviços usam o vínculo persistido, não nomes exibidos.

Permissões usadas pelas rotas atuais (as antigas `batches.create`/`batches.update` permanecem apenas nos registros de perfis existentes, sem endpoints associados):

```text
products.read / products.create / products.update
product-conversions.read / product-conversions.create / product-conversions.update
batches.read
stocks.read / stocks.create / stocks.update
stock-positions.read
movements.read / movements.create / movements.cancel
shipments.read / shipments.create / shipments.decide
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
- Componentes compartilhados atuais incluem cabeçalho de página, avisos, loading, estado vazio, confirmação, campos operacionais de lote/datas e envio idempotente com confirmação de validade divergente.

## Testes e critérios de mudança

- Regras puras e services devem possuir testes unitários.
- Operações transacionais, constraints e concorrência devem ser testadas em PostgreSQL real.
- Fluxos visuais devem ao menos passar por tipos, lint, build e testes dos cálculos/estados críticos; testes de interação devem crescer incrementalmente.
- Uma mudança de schema deve incluir migration, rollback válido e registro em [HISTORICO.md](./HISTORICO.md).
- Uma mudança funcional deve atualizar [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md) e [FUNCIONALIDADES.md](./FUNCIONALIDADES.md) quando aplicável.
