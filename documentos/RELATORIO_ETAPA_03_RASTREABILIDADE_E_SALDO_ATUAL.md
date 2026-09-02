# Relatorio da Etapa 03 — Rastreabilidade de lotes e saldo atual

- Projeto: EstoqueRevisao
- Data: 2026-09-01
- Commits funcionais: `67d16a2` e `8207da1`
- Status: concluida e validada

## 1. Objetivo

Consolidar a regra oficial de codificacao dos lotes e criar o nucleo transacional de saldo atual por produto, lote e local, sem implementar os documentos de movimentacao ou o fluxo de revisao.

## 2. Analise da documentacao

A stack e a arquitetura foram preservadas:

- React, TypeScript e Vite no frontend;
- NestJS e TypeScript no backend;
- API REST versionada em `/api/v1`;
- PostgreSQL 17 por Docker Compose e TypeORM com migrations;
- monolito modular, autenticacao JWT, Argon2id, permissoes, auditoria e logs estruturados.

A regra `CONSERVADI` desta etapa especializa o cadastro livre de lote entregue anteriormente. Nao houve inconsistencia impeditiva. A decisao foi registrada no ADR 017. O ADR local de Docker foi renumerado de 001 para 016 para nao colidir com os ADRs 01 a 15 do documento arquitetural oficial; seu conteudo nao foi alterado.

## 3. Implementacao

### 3.1 Codificacao de lotes

O `BatchCodeCodec` centraliza a conversao bidirecional entre a data de fabricacao `DDMMYY` e as letras `CONSERVADI`:

- 0=C, 1=O, 2=N, 3=S, 4=E, 5=R, 6=V, 7=A, 8=D e 9=I;
- `2026-08-31` gera `SOCDNV`, e `SOCDNV` retorna `2026-08-31`;
- codigos sao normalizados para maiusculas e possuem exatamente seis caracteres;
- caracteres desconhecidos, tamanhos invalidos e datas impossiveis sao rejeitados;
- a janela fixa de ano e 2000–2099;
- se codigo e data forem enviados juntos, ambos precisam ser equivalentes;
- validade e obrigatoria e nao pode anteceder a fabricacao.

O endpoint `POST /api/v1/batches/resolve-code` oferece a mesma regra ao formulario. A tela de lotes calcula automaticamente o campo correspondente e ainda envia os dois valores para validacao definitiva pelo backend.

### 3.2 Nucleo de saldo atual

A entidade `stock_positions` representa uma unica posicao por produto, lote e local, com quantidade `numeric(18,6)` nao negativa.

O servico interno oferece consulta, verificacao de disponibilidade, adicao e remocao. As alteracoes exigem o `EntityManager` da transacao chamadora. Adicoes usam UPSERT atomico e remocoes usam UPDATE condicional atomico, impedindo saldo negativo sob concorrencia.

O banco protege:

- unicidade de produto + lote + local;
- relacionamento entre produto e lote por chave estrangeira composta;
- referencias a produto, lote e local;
- quantidade nao negativa;
- precisao maxima definida para a quantidade.

Nao foi criado endpoint publico de alteracao de saldo. As futuras entradas, saidas e transferencias deverao chamar o servico interno e registrar o documento e sua auditoria na mesma transacao.

### 3.3 Consulta e autorizacao

Foram adicionados:

- `GET /api/v1/stock-positions`, paginado e filtravel por produto, lote e local;
- `GET /api/v1/stock-positions/:id`;
- permissao `stock-positions.read`, atribuida ao perfil `ADMIN` pela migration;
- tela Estoque atual, somente leitura, com filtros, tabela e detalhe.

Leituras comuns nao geram eventos excessivos de auditoria.

## 4. Migration

O arquivo `1788307200000-batch-manufacturing-and-stock-positions.ts`:

- adiciona fabricacao obrigatoria aos lotes;
- torna validade obrigatoria;
- aplica checks do codigo, intervalo do ano e ordem das datas;
- cria as posicoes, indices, constraints e permissao;
- converte lotes legados somente quando o codigo e a validade permitem uma interpretacao inequivoca;
- interrompe com mensagem explicita diante de codigo livre ou validade ausente, sem inventar dados.

A migration foi aplicada em banco vazio, revertida e reaplicada com lote existente valido. Todas as tres migrations ficaram marcadas como executadas no ambiente descartavel.

## 5. Testes e verificacoes

Resultados finais:

- `npm run build`: aprovado no backend e frontend;
- `npm run lint`: aprovado sem avisos;
- suite normal: 7 suites e 40 testes aprovados; a suite PostgreSQL fica ignorada quando `TEST_DATABASE_URL` nao existe;
- integracao PostgreSQL: 1 suite e 5 testes aprovados;
- `docker compose --env-file .env.example config --quiet`: aprovado;
- `git diff --check`: aprovado;
- migration show, revert, run e novo show: aprovados.

Os testes de integracao confirmam unicidade, acumulacao, remocao valida, rejeicao de saldo insuficiente, rollback, concorrencia sem saldo negativo e filtros combinados.

## 6. Arquivos principais

- `apps/backend/src/modules/batches/domain/batch-code.codec.ts`
- `apps/backend/src/database/migrations/1788307200000-batch-manufacturing-and-stock-positions.ts`
- `apps/backend/src/modules/stocks/entities/stock-position.entity.ts`
- `apps/backend/src/modules/stocks/stock-positions.repository.ts`
- `apps/backend/src/modules/stocks/stock-positions.service.ts`
- `apps/backend/src/modules/stocks/stock-positions.controller.ts`
- `apps/backend/src/modules/stocks/stock-positions.integration.spec.ts`
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/api.ts`
- `documentos/ADR_017_CODIFICACAO_DE_LOTES_E_POSICOES_DE_ESTOQUE.md`

## 7. Como executar localmente

```powershell
Copy-Item .env.example .env
# Troque as senhas, DATABASE_URL, JWT_ACCESS_SECRET e BOOTSTRAP_PASSWORD
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

Frontend: `http://localhost:5173`. API: `http://localhost:3000/api/v1`. Health check: `GET /api/v1/health`.

Para os testes reais de saldo, crie um banco descartavel separado, configure `TEST_DATABASE_URL` e execute:

```powershell
npm test --workspace @estoque-revisao/backend -- --runInBand stock-positions.integration.spec.ts
```

## 8. Container e persistencia

O container pode ser removido e recriado; ele e apenas o processo do PostgreSQL. Os dados permanecem no volume `estoque-revisao_postgres_data`. `npm run docker:up` cria ou inicia o container e reconecta o mesmo volume. `npm run docker:down` remove o container e a rede, mas preserva o volume porque nao usa `--volumes`.

Nesta validacao, somente o container temporario `estoque-revisao-stage3-validation` foi removido. O volume principal existente foi preservado. Como o repositorio nao versiona `.env`, o container principal deve ser iniciado depois que o operador criar esse arquivo com suas credenciais locais.

## 9. Preparacao para as proximas etapas

- saldo atual transacional pronto para ser consumido pelos documentos operacionais;
- lote e fabricacao consistentes para rastreabilidade;
- filtros e tela de consulta prontos para operacao;
- constraints capazes de impedir combinacoes incoerentes;
- permissionamento pronto para novos perfis;
- transacoes e auditoria reutilizaveis pelas futuras movimentacoes.

## 10. Divida tecnica e itens fora do escopo

- Volumes criados na etapa 2 que contenham lotes de codigo livre precisam ter esses dados corrigidos explicitamente antes da nova migration; nao existe conversao segura por suposicao.
- O frontend ainda nao possui testes automatizados de componentes.
- A renovacao transparente do access token durante uma requisicao expirada continua pendente.
- A matriz de perfis alem de `ADMIN` ainda depende da definicao funcional futura.
- Entradas, saidas, transferencias, estornos, revisao e mapa fisico detalhado nao foram implementados nesta etapa.
