# Relatório de Proposta e Implementação — Governança e Qualidade dos Dados

**Sistema:** EstoqueRevisao  
**Funcionalidade Proposta:** Painel de Governança e Qualidade dos Dados (*Data Quality Monitor*)  
**Branch de Entrega:** `develop`  
**Data:** 19/11/2026

---

## 1. Apresentação da Funcionalidade Proposta

Foi proposto e implementado o **Painel de Governança e Qualidade dos Dados** (`Qualidade dos Dados`), integrado diretamente ao módulo administrativo do sistema **EstoqueRevisao**. A funcionalidade realiza uma auditoria automatizada e em tempo real sobre as bases operacionais (produtos, lotes, posições de estoque e remessas entre setores), consolidando métricas objetivas em um **Índice de Qualidade dos Dados (0% a 100%)**.

---

## 2. Como Funciona

A solução foi construída em arquitetura *full-stack* (NestJS + TypeORM no backend e React + TypeScript no frontend):

1. **Motor de Auditoria (`DataQualityService`):**
   Consulta os registros ativos no PostgreSQL e avalia **4 dimensões clássicas de Qualidade de Dados**:
   - **Completude Cadastral (`COMPLETENESS`):** detecta produtos ativos sem peso unitário em gramas (`PRODUCT_MISSING_WEIGHT`) ou sem prazo de validade padrão configurado (`PRODUCT_MISSING_SHELF_LIFE`).
   - **Validade de Lotes (`VALIDITY`):** identifica posições com saldo positivo vinculadas a lotes já vencidos (`EXPIRED_BATCH_WITH_STOCK` — severidade Alta) ou próximos do vencimento em até 30 dias (`EXPIRING_SOON_BATCH_WITH_STOCK` — severidade Média).
   - **Consistência de Saldos (`CONSISTENCY`):** verifica posições de estoque com quantidade negativa (`NEGATIVE_STOCK_POSITION` — severidade Alta).
   - **Tempestividade Operacional (`TIMELINESS`):** localiza remessas paradas em `EM_SEPARACAO` com prazo expirado (`STALE_SEPARATION_SHIPMENT` — severidade Alta) e remessas aguardando recebimento há mais de 72 horas (`UNRECEIVED_OLD_SHIPMENT` — severidade Baixa).

2. **Cálculo de Score e Classificação:**
   Cada dimensão recebe uma nota de 0% a 100% ponderada pela severidade das não conformidades encontradas, compondo o índice geral e classificando o ambiente em **SAUDÁVEL**, **ATENÇÃO** ou **CRÍTICO**.

3. **Interface Administrativa (`DataQualityPage.tsx`):**
   - Banner executivo com Índice de Qualidade, total de registros avaliados e contagem por severidade;
   - 4 cards individuais por dimensão de qualidade;
   - Filtros dinâmicos por dimensão, severidade e palavra-chave/código;
   - Tabela de não conformidades com código de referência, descrição e **ação recomendada**;
   - Botão **Exportar CSV** para envio de planos de saneamento às áreas responsáveis.

4. **Controle de Acesso e Rastreabilidade:**
   - Endpoint `GET /api/v1/data-quality/report` protegido pelo `AdminGuard` (acesso restrito ao perfil `ADMIN`);
   - Cada execução da auditoria registra automaticamente um evento estruturado (`INFO`) no `SystemLogsService`, mantendo trilha de observabilidade.

---

## 3. Problema que Resolve

Sem um monitoramento ativo de qualidade, dados cadastrados de forma incompleta (ex.: produtos sem peso ou validade) ou desvios operacionais (ex.: lotes vencidos ainda disponíveis para envio ou remessas travadas em separação) permanecem invisíveis até causarem erros em relatórios do PCP, divergências de inventário ou expedição de materiais impróprios.

O painel resolve esse problema ao transformar anomalias silenciosas do banco de dados em **alertas visuais priorizados por severidade**, permitindo ação corretiva preventiva na origem.

---

## 4. Contribuição para Governança e Qualidade dos Dados

- **Validação e Melhoria Contínua:** Padroniza critérios objetivos de completude, validade, consistência e tempestividade sobre o estoque.
- **Monitoramento por Métricas e Indicadores:** Fornece KPIs claros (Índice de Qualidade % e indicadores por dimensão) acompanháveis ao longo do tempo.
- **Controle de Acesso e Segurança:** Restringe o diagnóstico global de anomalias a administradores (`AdminGuard`).
- **Rastreabilidade:** Registra a execução das auditorias no subsistema central de logs (`DataQualityService`).

---

## 5. Artefatos Implementados e Validação

- **Backend:**
  - `apps/backend/src/modules/data-quality/data-quality.types.ts`
  - `apps/backend/src/modules/data-quality/data-quality.service.ts`
  - `apps/backend/src/modules/data-quality/data-quality.controller.ts`
  - `apps/backend/src/modules/data-quality/data-quality.module.ts`
  - `apps/backend/src/modules/data-quality/data-quality.service.spec.ts` (3/3 testes aprovados)
  - `apps/backend/src/app.module.ts`
- **Frontend:**
  - `apps/frontend/src/data-quality.types.ts`
  - `apps/frontend/src/DataQualityPage.tsx`
  - `apps/frontend/src/DataQualityPage.spec.tsx` (aprovado)
  - `apps/frontend/src/navigation-model.ts`, `Navigation.tsx`, `App.tsx`
