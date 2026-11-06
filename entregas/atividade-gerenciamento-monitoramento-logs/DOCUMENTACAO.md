# Documentação Técnica: Gerenciamento e Monitoramento de Logs

**Projeto:** EstoqueRevisao — Fábrica de Software  
**Branch da Atividade:** `atividade/gerenciamento-monitoramento-logs`  
**Data:** Novembro de 2026  

---

## 1. Visão Geral e Objetivo

O objetivo desta atividade é implementar e integrar à aplicação do projeto **EstoqueRevisao** uma solução completa de **observabilidade, gerenciamento e monitoramento de logs**. 

A solução possibilita:
1. **Tratamento robusto e padronizado de falhas** (esperadas e inesperadas) em um endpoint de negócio existente (`/api/v1/products`), sem exposição de dados sensíveis;
2. **Registro estruturado de logs em formato JSON**, contendo atributos canônicos (timestamp, nível de criticidade, código de erro, identificador do evento, descrição legível, classe de origem e metadados contextuais);
3. **Persistência resiliente** com armazenamento primário no banco de dados relacional (PostgreSQL via TypeORM) e buffer circular em memória com mecanismo de fallback (evitando perda de observabilidade caso o banco de dados fique indisponível);
4. **Recurso de consulta e gerenciamento de logs** via API RESTful com filtros avançados e interface gráfica integrada no Frontend SPA;
5. **Painel de métricas e observabilidade em tempo real**, com detecção de erros recorrentes e disparo de alertas operacionais automáticos (ex.: mais de 10 erros críticos em 5 minutos).

---

## 2. Endpoint Selecionado e Tratamento de Falhas (Requisito 1)

O endpoint selecionado para a aplicação prática foi o subsistema de **Produtos (`/api/v1/products`)**, responsável pela manutenção do catálogo de itens e embalagens do estoque.

### 2.1 Falha Esperada (Client Handled — HTTP 4xx)
- **Cenários identificados:**
  - **Conflito de dados (`PRODUCT_CODE_ALREADY_EXISTS` — HTTP 409 Conflict):** Tentativa de cadastrar ou atualizar um produto cujo código já pertença a outro registro no estoque.
  - **Recurso não encontrado (`PRODUCT_NOT_FOUND` — HTTP 404 Not Found):** Busca de produto por identificador UUID inexistente no catálogo.
  - **Dados inválidos (`VALIDATION_ERROR` — HTTP 400 Bad Request):** Envio de carga útil sem os campos obrigatórios ou formatos exigidos.
- **Formato da Resposta Padronizada (sem exposição de dados sensíveis):**
  ```json
  {
    "error": {
      "code": "PRODUCT_CODE_ALREADY_EXISTS",
      "message": "Ja existe um produto com esse codigo cadastrado.",
      "requestId": "5e12e84c-3a87-43c2-a9b1-e2fb1549419b",
      "timestamp": "2026-11-06T18:00:00.000Z",
      "path": "/api/v1/products"
    }
  }
  ```
- **Registro no Log:** Capturado pelo `GlobalExceptionFilter` e classificado automaticamente com nível **`WARN`**, contendo o código de erro, identificador da requisição (`requestId`) e rota afetada.

### 2.2 Falha Inesperada (Server / Database Handled — HTTP 5xx)
- **Cenários identificados:**
  - **Indisponibilidade do banco de dados (`DATABASE_UNAVAILABLE` — HTTP 503 Service Unavailable):** Queda de conectividade com o PostgreSQL (ex.: `ECONNREFUSED`, `ECONNRESET`, códigos `57P01`/`57P03`/`08xxx`).
  - **Erro interno inesperado (`INTERNAL_ERROR` — HTTP 500 Internal Server Error):** Falha não prevista em tempo de execução (bugs de código ou quebra de subsistemas).
- **Tratamento de Segurança:**
  - Mensagem amigável ao usuário final;
  - **Zero vazamento de informações sensíveis:** strings de conexão, hosts de infraestrutura, credenciais de banco e *stack traces* de sistema nunca são retornados na resposta HTTP.
- **Formato da Resposta:**
  ```json
  {
    "error": {
      "code": "DATABASE_UNAVAILABLE",
      "message": "O banco de dados esta temporariamente indisponivel. Tente novamente em instantes.",
      "requestId": "9c1b48d2-f673-40e1-bb90-71a25dbce871",
      "timestamp": "2026-11-06T18:02:00.000Z",
      "path": "/api/v1/products"
    }
  }
  ```
- **Registro no Log:** Classificado como **`ERROR`** ou **`FATAL`**, enriquecido com detalhes contextuais para investigação interna.

### 2.3 Rotas de Demonstração e Simulação
Para facilitar testes manuais, demonstrações ao vivo e suítes de validação automatizada, foram integradas rotas públicas controladas:
- `GET /api/v1/products/simulate/expected-conflict` (Dispara 409 Conflict)
- `GET /api/v1/products/simulate/expected-not-found` (Dispara 404 Not Found)
- `GET /api/v1/products/simulate/unexpected-database` (Dispara 503 Database Unavailable)
- `GET /api/v1/products/simulate/unexpected-crash` (Dispara 500 Internal Error)
- `POST /api/v1/products/simulate-failure` (Recebe `{ type: 'conflict'|'not-found'|'database'|'crash' }`)

---

## 3. Registro Estruturado de Logs (Requisito 2)

Os eventos são registrados em formato **JSON canônico estruturado**, tanto no fluxo de saída de console (`process.stdout`/`process.stderr`) para integração com coletores de logs (Fluentd, Logstash, Datadog), quanto no repositório de persistência.

### 3.1 Atributos do Registro Estruturado
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `UUID` | Identificador único do registro de log. |
| `timestamp` | `ISO 8601` | Data e hora exata da ocorrência em UTC. |
| `level` | `String` | Nível de criticidade: `INFO`, `WARN`, `ERROR` ou `FATAL`. |
| `errorCode` | `String (nullable)` | Código semântico do erro (ex: `PRODUCT_NOT_FOUND`, `DATABASE_UNAVAILABLE`). |
| `eventId` | `String` | Identificador de rastreamento do evento / `requestId`. |
| `description` | `String` | Descrição clara e legível do evento/falha. |
| `context` | `String` | Classe ou componente de origem (ex: `ProductsController`, `GlobalExceptionFilter`). |
| `details` | `JSON Object` | Metadados contextuais (método HTTP, rota, statusCode, etc.). |
| `environment` | `String` | Ambiente de execução (`development`, `test`, `production`). |

### 3.2 Exemplo de Log Emitido em JSON
```json
{
  "timestamp": "2026-11-06T18:02:00.000Z",
  "level": "ERROR",
  "errorCode": "DATABASE_UNAVAILABLE",
  "eventId": "9c1b48d2-f673-40e1-bb90-71a25dbce871",
  "description": "O banco de dados esta temporariamente indisponivel. Tente novamente em instantes.",
  "context": "GlobalExceptionFilter",
  "environment": "development",
  "details": {
    "method": "GET",
    "path": "/api/v1/products/simulate/unexpected-database",
    "statusCode": 503,
    "databaseUnavailable": true
  }
}
```

### 3.3 Mecanismo de Sanitização de Dados Sensíveis
Todos os detalhes e cargas de requisições passam pela função `redactSensitive()`, que mascara recursivamente qualquer ocorrência de chaves críticas, tais como:
- `password`, `senha`, `secret`, `hash`, `passwordHash`;
- `token`, `accessToken`, `refreshToken`, `authorization`;
- `cookie`, `creditCard`.

Dessa forma, valores sensíveis são substituídos por `[REDACTED]`, garantindo total conformidade com a LGPD e boas práticas de segurança em logs.

### 3.4 Persistência e Resiliência contra Queda do Banco
- **Persistência primária:** Tabela relacional `system_logs` no PostgreSQL (criada via migration TypeORM `SystemLogsMonitoring1791590400000`).
- **Resiliência e Fallback:** O `SystemLogsRepository` mantém um buffer circular em memória com capacidade configurada. Caso o PostgreSQL esteja indisponível (como no teste de falha inesperada simulada), a tentativa de gravação em banco é interceptada com segurança e o log permanece acessível no buffer em memória, assegurando que o próprio log que reporta a queda do banco seja armazenado e consultado.

---

## 4. Recurso de Gerenciamento e Consulta de Logs (Requisito 3)

### 4.1 Endpoints REST da API
- `GET /api/v1/logs`: Consulta paginada dos logs registrados com filtros múltiplos.
- `GET /api/v1/logs/:id`: Visualização detalhada de um evento individual.
- `GET /api/v1/logs/stats/count-by-error`: Quantidade de ocorrências agrupadas por código de erro.
- `GET /api/v1/logs/metrics`: Painel de métricas e avaliação de alertas.

### 4.2 Filtros Disponíveis
1. **Busca Textual (`search`):** Pesquisa livre por palavras-chave na descrição, contexto, código do erro ou payload de detalhes (case-insensitive);
2. **Nível de Criticidade (`level`):** Filtragem por `INFO`, `WARN`, `ERROR` ou `FATAL`;
3. **Código do Erro (`errorCode`):** Filtra ocorrências específicas (ex.: `PRODUCT_NOT_FOUND`, `DATABASE_UNAVAILABLE`);
4. **Classe de Origem (`context`):** Filtra pelo componente gerador (ex.: `ProductsController`, `ProductsService`);
5. **Identificador do Evento (`eventId`):** Permite localizar todos os registros associados a um determinado `requestId`;
6. **Período (`startDate` e `endDate`):** Filtro por intervalo temporal (data e hora inicial e final);
7. **Paginação (`page` e `limit`):** Navegação entre páginas de resultados com limites configuráveis.

### 4.3 Interface Gráfica Integrada
Foi desenvolvido o componente **`LogsMonitoringPage.tsx`**, integrado ao menu principal da aplicação (acessível no menu lateral de Administração). A interface oferece:
- **Painel de Status de Alerta em Tempo Real:** Banner visual com badges de criticidade (`NORMAL`, `WARNING`, `CRITICAL`);
- **Cards de Métricas:** Contadores ao vivo de eventos, erros críticos, falhas esperadas e taxa geral;
- **Painel de Simulação Rápida:** Botões de 1 clique para disparar simulações de 409, 404, 503, 500 e rajadas de erro;
- **Tabela de Erros Recorrentes:** Exibição com barra de percentual de impacto;
- **Filtros Dinâmicos:** Formulário interativo para busca rápida;
- **Grid de Logs com Modal de Detalhes:** Visualização formatada do JSON estruturado e metadados completos.

---

## 5. Monitoramento, Métricas e Regras de Alerta (Requisito 4)

### 5.1 Métricas Definidas
1. **Contagem por Nível de Criticidade:** Total de registros categorizados por `INFO`, `WARN`, `ERROR` e `FATAL`.
2. **Taxa Geral de Falhas (`errorRatePercentage`):** Percentual de requisições que resultaram em erro (`WARN + ERROR + FATAL`) em relação ao volume total de eventos observados.
3. **Erros Recorrentes (`topRecurringErrors`):** Lista ranqueada de erros por frequência de ocorrência, calculando a porcentagem de participação no total de falhas, severidade e instante da última manifestação.
4. **Distribuição Temporal (Timeline):** Gráfico/agrupamento temporal de erros e eventos por faixa de horário.

### 5.2 Regra e Condição de Alerta Operacional
- **Condição Definida:** Detecção de **mais de 10 erros críticos (`ERROR` ou `FATAL`) em uma janela de 5 minutos**.
- **Comportamento do Sistema:**
  - Quando `criticalErrorsInWindow >= 10`:
    - `alert.triggered`: `true`
    - `alert.status`: `'CRITICAL'`
    - `alert.message`: `"ALERTA DE INCIDENTE: Detectados X erros críticos nos últimos 5 minutos, ultrapassando o limiar de tolerância (10)!"`
  - Quando `criticalErrorsInWindow > 0` e `< 10`:
    - `alert.status`: `'WARNING'` (atenção preventiva)
  - Quando `criticalErrorsInWindow == 0`:
    - `alert.status`: `'NORMAL'` (operação estável)

---

## 6. Validação e Execução de Testes Automatizados

A funcionalidade possui cobertura completa de testes unitários e de integração:
- `apps/backend/src/modules/system-logs/system-logs.service.spec.ts`: Valida registro JSON, sanitização de senhas/tokens, buscas com filtros, paginação, contagem por erro e disparo do alerta com 11 erros em 5 minutos.
- `apps/backend/src/modules/system-logs/system-logs.controller.spec.ts`: Valida os endpoints de consulta, métricas e estatísticas.
- `apps/backend/src/modules/products/products-failure-simulation.spec.ts`: Valida a simulação de falhas esperadas (409/404) e inesperadas (503/500) com integração ao filtro global de exceções.

### Como Executar os Testes
Para rodar a suíte da atividade e gerar o relatório de evidências:
```bash
node entregas/atividade-gerenciamento-monitoramento-logs/executar-demonstracao.cjs
```
Ou diretamente via npm:
```bash
npm run test --workspace @estoque-revisao/backend -- system-logs products-failure
```

---

## 7. Conclusão

A implementação atende com fidelidade a todos os requisitos solicitados:
- Falhas esperadas e inesperadas devidamente tratadas e simuladas no endpoint de Produtos;
- Formato padronizado de erro HTTP sem vazamento de informações sensíveis;
- Registro estruturado em JSON com sanitização automática;
- Consulta com filtros múltiplos via REST e Interface Web interativa;
- Monitoramento contínuo com contagem de erros, métricas de severidade, identificação de falhas recorrentes e acionamento de alertas configuráveis.
- Trabalho mantido de forma isolada na branch `atividade/gerenciamento-monitoramento-logs`, sem qualquer alteração ou merge nas branches `develop` ou `main`.
