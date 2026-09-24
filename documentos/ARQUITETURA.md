# Arquitetura

## Acesso operacional da Revisão

A migration `ReviewOperatorRole1789948800000` adiciona o perfil `REVISAO` reutilizando permissões existentes. O `AdminGuard`, além dos guards globais de sessão/permissões/setor, protege os endpoints de entrada/saída direta, cancelamento e alteração de status dos cadastros. Gerenciamento de usuários continua protegido pelo mesmo guard. Regras transacionais e contratos de operações não mudam. O frontend reflete essas restrições e mostra ações diretamente na Home quando o conjunto disponível tem até seis opções.

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
      storage/       armazenamento privado local/Supabase das evidências
      reports/       consultas operacionais e exportação CSV
      history/       linha do tempo de envios e movimentações
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
- `HistoryService` pagina uma união somente de leitura de envios e movimentações. Movimentos gerados por um envio não aparecem como segunda linha; setor e permissões são aplicados antes da consulta.
- `AuditService` aceita o `EntityManager` da operação para participar da mesma transação.
- O frontend nunca substitui validação ou autorização do backend.

Evite abstrações prematuras. Uma regra compartilhada deve ser extraída quando já existir uso real, como a codificação de lotes e as operações atômicas de saldo.

## Modelo de dados principal

- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`: identidade e autorização.
- `auth_sessions`: refresh tokens e revogação de sessão.
- `audit_logs`: trilha técnica/administrativa persistente.
- `products`, `product_unit_conversions`: cadastro mestre e conversões. Produto possui `shelf_life_years`, obrigatório em novas criações da API e nulo apenas para legados ainda não configurados. `unit_weight_grams` guarda um inteiro positivo somente para `UN`; permanece nulo em embalagens e em registros unitários antigos ainda não atualizados.
- `batches`: referências internas imutáveis de produto/código/fabricação/validade; unicidade por produto + código normalizado + validade, sem cadastro mestre público.
- `stock_locations`: locais lógicos hierárquicos e configuração da revisão.
- `stock_positions`: saldo materializado por produto, variante de lote/validade e local. O `batch_id` identifica a validade; as chaves de saldo e os serviços atômicos existentes permanecem.
- `shipments`, `shipment_items`: workflow imutável com itens e origens congelados; itens pendentes originados na Revisão são o registro do trânsito. O saldo disponível permanece em `stock_positions`, sem novo local artificial.
- `shipment_items` também guarda `photo_storage_key`, MIME e tamanho. A imagem permanece fora do PostgreSQL e a chave não é exposta nas respostas comuns.
- `movements`: cabeçalho, estado, metadados de cancelamento e `shipment_id` opcional; índice único por envio/origem impede duplicar a efetivação.
- `movement_items`: produto, referências imutáveis de lote/datas de origem e destino, quantidade e `product_snapshot` de código/descrição/unidade nas novas operações. Legados não recebem snapshots inventados.
- `movement_item_distributions`: destinos e parcelas de itens revisados.
- `products.units_per_package` e `product_unit_options`: fator por embalagem e alternativas de produto unitário. Não substituem as conversões legadas do mesmo código.
- Revisões com desmontagem gravam `output_product_id`, `output_batch_id`, `output_quantity`, `units_per_package` e `output_product_snapshot` em `movement_items`. Campos nulos preservam operações anteriores. FK composta protege a associação produto/lote resultante; check protege a multiplicação, e trigger restringe a conversão à revisão com lote/datas preservados.

UUIDs são gerados pela aplicação. Chaves estrangeiras usam `RESTRICT` onde o histórico deve ser preservado. O banco aplica checks, unicidades e chaves compostas para impedir dados incompatíveis.

## Transações, concorrência e integridade

- `MovementPublicCodes1790121600000` adiciona `movements.codigo_movimentacao`, UNIQUE e sequences PostgreSQL `seq_movimentacao_ent/sai/rev`. Um trigger gera o código no INSERT e bloqueia alteração de código/tipo no UPDATE. As sequences pertencem à coluna e são removidas no rollback da migration. Backfill transacional e cronológico. TypeORM mapeia o atributo sem escrita; o repositório recupera o código gerado antes da auditoria. Não se usa `MAX + 1`.
- `ShipmentLifecyclePublicCodes1790208000000` transfere a identidade pública dos fluxos setoriais para `shipments`: o trigger gera ENT/SAI no INSERT do envio e a movimentação efetivada herda esse valor. `shipments.codigo_movimentacao` é único; movimentos sem envio mantêm índice único parcial. Vários registros técnicos originados pelo mesmo envio podem compartilhar o código da operação. O backfill reutiliza o código já ligado a envios confirmados e gera códigos para pendentes/recusados antigos.

- `synchronize` é desativado; toda evolução do schema ocorre por migration versionada.
- Operações críticas recebem um único `EntityManager` e confirmam documento, saldo e auditoria juntos.
- Resolução/criação de lotes usa `OperationalLotsService` dentro do `EntityManager` da movimentação. Locks `FOR NO KEY UPDATE` de produtos são adquiridos em ordem antes dos locks de saldo, compatíveis com os locks de FK usados por revisão/estorno; índice único evita variantes duplicadas. A identidade dos lotes também é protegida por trigger contra edição.
- Divergências de validade retornam `LOT_EXPIRATION_CONFIRMATION_REQUIRED` (409), com mensagem operacional e `details.expirationKeys`. O reenvio usa `confirmedExpirationKeys` vinculadas a produto/código/data e a mesma `requestKey`; o aceite fica na auditoria. Chaves estáveis permitem confirmar inclusive duas validades novas após rollback.
- Adição de saldo usa UPSERT atômico.
- Remoção usa `UPDATE` condicionado a `quantity >= requested`.
- Transferências e distribuições bloqueiam posições com `pessimistic_write` em ordem determinística.
- `ShipmentsService` reutiliza lotes, saldo, repositório de movimentações e auditoria com o mesmo manager. Criação serializa retries via advisory lock transacional da chave; decisão e cancelamento pelo autor bloqueiam a mesma linha do envio, de modo que apenas uma transição concorrente prevalece. Triggers impedem edição/exclusão de envios e itens. Retorno da reserva usa a mesma operação de crédito atômico, sem exigir produto ainda ativo.
- Fotos são gravadas antes da transação do envio pelo `StorageService`; qualquer rejeição, conflito ou rollback executa exclusão compensatória. O item imutável recebe a chave somente na criação. Uma interrupção abrupta entre storage e compensação pode deixar objeto órfão e deverá ser tratada por limpeza operacional futura.
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
- Falhas reconhecidas de conexão com o PostgreSQL retornam `503/DATABASE_UNAVAILABLE`, mantendo detalhes técnicos apenas nos logs estruturados.
- Erros internos não expõem stack trace, SQL ou detalhes de infraestrutura ao cliente.
- A criação de envio usa `multipart/form-data`, com JSON em `payload` e um campo `photos` por item na mesma ordem. O backend limita quantidade/tamanho e revalida presença, MIME e conteúdo não vazio.
- Criações de movimentação usam `request_key` UUID para idempotência.
- Não existem endpoints públicos para alterar saldo nem endpoints de edição/exclusão de movimentação.

## Autenticação e autorização

- Senhas são armazenadas somente como hash Argon2id com salt e custos configuráveis.
- Access token JWT possui curta duração e fica somente em memória no frontend.
- Refresh token é aleatório, rotativo, enviado por cookie `HttpOnly`, `SameSite=Strict` e `Secure` configurável.
- O banco armazena somente SHA-256 do refresh token.
- Sessões são consultadas e podem ser revogadas; logout invalida a sessão.
- Guards globais exigem autenticação e permissões; rotas públicas usam declaração explícita.
- A administração em `/users` exige adicionalmente `AdminGuard`, que verifica o perfil autenticado e o modo `ADMIN`. Não há novas permissões ou tabelas. `UsersService` reutiliza o hash Argon2id, repositório, sessões e auditoria. Alterações são serializadas por advisory lock transacional; o autor é revalidado dentro da transação, e sessões da conta editada/inativada são revogadas atomicamente. Respostas usam projeção explícita sem credenciais.
- `users.sector` é consultado junto da sessão: REVISAO, PRODUCAO, EXPEDICAO ou PCP. `ADMIN` permanece cadastrado na Revisão; todos os perfis recebem `products.read/create/update`, inclusive no modo operacional do administrador. Produção/Expedição preservam as permissões de envios; PCP preserva suas leituras e execução administrativa. O guard bloqueia as demais permissões incompatíveis mesmo se algum perfil for configurado indevidamente. O endpoint paginado de auditoria dos produtos usa `AdminGuard` e expõe apenas os dados necessários do evento, sem IP ou request ID.
- O frontend envia `X-Operational-Sector` para alternância administrativa. O guard aceita `ADMIN`, `REVISAO`, `PRODUCAO`, `EXPEDICAO` ou `PCP` somente quando a sessão possui a função `ADMIN`. `ADMIN` mantém o contexto físico da Revisão com permissões completas; os demais valores projetam as permissões do respectivo perfil e bloqueiam guards administrativos. A identidade autenticada e o setor persistido do usuário não são substituídos.
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
pcp.movements.read / pcp.movements.execute
```

## Logs, auditoria e dados sensíveis

- Logs técnicos são JSON estruturado com timestamp, nível, contexto e request ID.
- O middleware registra método, rota, status e duração, mas não registra corpos de requisição.
- Chaves relacionadas a senha, token, cookie, autorização e segredo são removidas defensivamente.
- Auditoria é separada dos logs e do histórico de movimentações.
- Senhas, access tokens, refresh tokens e segredos nunca devem aparecer em logs ou auditoria.

## Configuração e PostgreSQL

- Variáveis públicas estão documentadas em `.env.example`; valores reais ficam no `.env`, fora do Git.
- `STORAGE_DRIVER=local` grava em `FILE_STORAGE_PATH`; `supabase` usa bucket privado, `SUPABASE_URL` e `SUPABASE_SECRET_KEY` disponível exclusivamente no backend (com suporte à `SUPABASE_SERVICE_ROLE_KEY` legada). Fotos são lidas por rota autenticada da API.
- O backend valida as variáveis ao iniciar.
- O banco operacional de desenvolvimento e publicação é o PostgreSQL do Supabase, acessado pela `DATABASE_URL` Session pooler com SSL obrigatório. Backend, migrations e bootstrap usam essa mesma variável. O PostgreSQL em Docker fica restrito a testes locais isolados.
- A aplicação usa pool PostgreSQL pequeno e novas tentativas limitadas na inicialização para tolerar reinícios e resets transitórios do Session pooler, sem repetir operações de negócio já iniciadas.
- `migration:show` e `migration:run` repetem somente falhas reconhecidas de conexão, no máximo cinco vezes; erros de schema ou da própria migration não são repetidos.
- `DATABASE_HOST_OVERRIDE` permite contornar temporariamente um endereço IPv4 defeituoso retornado pelo DNS do pooler. A conexão continua usando as credenciais e o hostname TLS de `DATABASE_URL`; o override deve ser removido quando o provedor normalizar o nó.
- API e frontend rodam diretamente pelo Node.js no desenvolvimento e podem ser containerizados futuramente sem alteração de domínio.

## Módulo PCP

O módulo `pcp` expõe uma projeção paginada de `movements`, sem duplicar movimentações nem carregar itens/fotos na listagem. O detalhe reutiliza o agregado completo, a auditoria central e, quando existe `shipment_id`, apenas as referências de evidência dos itens do envio. A imagem privada continua sendo servida pelo endpoint autenticado de envios e nunca pelo banco ou frontend diretamente.

```text
fluxo operacional -> EFETIVADA/CONCLUIDA -> PCP PENDENTE -> PCP EXECUTADA
envio -> AGUARDANDO_RECEBIMENTO -> CONFIRMADO -> movement EFETIVADA -> PCP PENDENTE
```

`movements.pcp_execution_status` é separado de `movements.status`; executor, instante e observação administrativa completam a transição. Constraints garantem a coerência dos campos e índices atendem fila por estado/data. A execução usa transação, lock pessimista da movimentação e auditoria `PCP_MOVEMENT_EXECUTE`.

Endpoints:

- `GET /api/v1/pcp/movements`: período, estado operacional, estado PCP, tipo, origem, destino, produto/lote, ordenação e paginação;
- `GET /api/v1/pcp/movements/:id`: agregado, evidências e histórico auditável;
- `POST /api/v1/pcp/movements/:id/execution`: transição irreversível com observação opcional.

As permissões são `pcp.movements.read` e `pcp.movements.execute`. O papel exclusivo `PCP` recebe ainda somente leituras necessárias de produtos, lotes, locais, saldos e evidências. Autorizações operacionais continuam protegidas pelos guards existentes.
- `DATABASE_URL` é o banco local; `TEST_DATABASE_URL` deve apontar para banco isolado e descartável.

## Configurações e separação imediata

`SettingsModule` mantém apenas os parâmetros necessários: `system_settings` armazena o prazo em minutos e `review_process_destinations` relaciona locais cadastrados aos destinos atuais. Alterações são transacionais, administrativas e auditadas.

O estado intermediário pertence a `shipments`, pois ainda não existe movimentação efetiva de estoque. Cada envio guarda início/expiração e possui rascunhos por item. A finalização e a expiração bloqueiam a linha do envio; a primeira transição válida calcula o crédito e cria a movimentação. Retornos usam outro `shipment`, com `source_shipment_id`, preservando o fluxo existente de fotos e decisão do destinatário.

`movements.requires_pcp_execution` distingue lançamentos que devem entrar na fila pendente. Retornos imediatos permanecem consultáveis no PCP, mas não podem ser executados nem aparecem entre pendentes. A expiração é lazy e independente da tela: consultas/processamentos relevantes procuram timestamps vencidos no backend, sem introduzir scheduler.

## Frontend

- Abordagem mobile-first a partir de 320 px.
- Navegação inferior no celular e sidebar no desktop.
- Tabelas se tornam cards em telas estreitas.
- Formulários possuem feedback de carregamento, erro, sucesso, estados vazios e confirmação para ações críticas.
- Ações são ocultadas conforme permissões, mas a proteção definitiva permanece no backend.
- A área Relatórios usa cards/listas no celular e reutiliza `movements.read` e `stock-positions.read`, sem criar permissões redundantes.
- Componentes compartilhados atuais incluem cabeçalho de página, avisos, loading, estado vazio, confirmação, campos operacionais de lote/datas e envio idempotente com confirmação de validade divergente.
- `CameraModal` usa `getUserMedia` dentro da aplicação, prefere a câmera traseira, reduz o maior lado para aproximadamente 1600 px, gera JPEG e encerra todas as trilhas ao capturar ou fechar. Câmera publicada exige HTTPS; localhost continua válido no desenvolvimento.

## Testes e critérios de mudança

- Regras puras e services devem possuir testes unitários.
- Operações transacionais, constraints e concorrência devem ser testadas em PostgreSQL real.
- Fluxos visuais devem ao menos passar por tipos, lint, build e testes dos cálculos/estados críticos; testes de interação devem crescer incrementalmente.
- Uma mudança de schema deve incluir migration, rollback válido e registro em [HISTORICO.md](./HISTORICO.md).
- Uma mudança funcional deve atualizar [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md) e [FUNCIONALIDADES.md](./FUNCIONALIDADES.md) quando aplicável.
