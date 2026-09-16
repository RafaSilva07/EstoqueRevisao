# Histórico de desenvolvimento

Este documento registra a evolução relevante sem repetir as regras vigentes. Para implementar, use [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md), [ARQUITETURA.md](./ARQUITETURA.md) e [FUNCIONALIDADES.md](./FUNCIONALIDADES.md).

## Etapas concluídas

| Etapa | Data | Entrega principal | Commit funcional |
| --- | --- | --- | --- |
| 01 | 2026-08-31 | Fundação: workspaces, NestJS/React, PostgreSQL, autenticação, autorização, logs, auditoria, erros e health check. | `66236dd` |
| 02 | 2026-08-31 | Produtos, conversões, lotes, locais e PostgreSQL via Docker Compose. | `5cef867` |
| 03 | 2026-09-01 | Código de lote `CONSERVADI` e saldo por produto/lote/local. | `67d16a2`, `8207da1` |
| 04 | 2026-09-01 | Interface mobile-first e componentes compartilhados. | `9dc431c` |
| 05 | 2026-09-01 | Entrada externa, documento de movimentação e histórico. | `8559e6a` |
| 06 | 2026-09-02 | Saída externa com baixa atômica. | `d115389` |
| 07 | 2026-09-02 | Transferência interna e preservação de quantidade. | `6cdb738` |
| 08 | 2026-09-03 | Revisão com múltiplas distribuições por item. | `ef77070` |
| 09 | 2026-09-03 | Lote de destino na transferência, inclusive troca no mesmo local. | `cd58050` |
| 10 | 2026-09-06 | Cancelamento e estorno integral das movimentações. | `5045ac0` |
| 11 | 2026-09-07 | Markdown consolidado como fonte principal; ADRs e relatórios anteriores arquivados. | documentação |
| 12 | 2026-09-07 | Relatórios de movimentações, revisão e estoque atual com filtros, totais, paginação e CSV. | este commit |
| 13 | 2026-09-08 | Interface do relatório de revisões com filtros, totais por classificação e paginação. | este commit |

### Registro da etapa 13

- **Objetivo:** disponibilizar no frontend a consulta de revisões já fornecida pelo backend.
- **Alterações:** nova rota interna `Relatórios > Revisões`, navegação entre relatórios, filtros, totais e resultados responsivos, sem alterar regras ou API.
- **Testes:** build e lint do frontend aprovados; 4 arquivos e 11 testes Vitest aprovados.
- **Pendências:** testes completos de interação/visual permanecem incrementais; exportação, dashboard e outros relatórios não fazem parte desta etapa.

Os relatórios completos dessas etapas foram preservados em [`arquivo/relatorios/`](./arquivo/relatorios/).

## Etapa 22 — Lotes operacionais e validades

Cadastro de produto com prazo padrão; lotes informados na operação, confirmação de validades divergentes e posições separadas. Interfaces e histórico adaptados sem alterar revisão/estorno. Resumo em [relatorios/RELATORIO_ETAPA_22_LOTES_OPERACIONAIS_VALIDADES.md](./relatorios/RELATORIO_ETAPA_22_LOTES_OPERACIONAIS_VALIDADES.md).

## Etapa 24 — Busca e seleção no envio

O formulário de envios passou a localizar produtos por código ou descrição com sugestões sincronizadas. Na saída da Revisão, lote/fabricação antecedem a posição disponível, são completados entre si pelo codec central e Lata Boa possui prioridade de ordenação. Resumo em [relatorios/RELATORIO_ETAPA_24_BUSCA_POSICAO_ENVIOS.md](./relatorios/RELATORIO_ETAPA_24_BUSCA_POSICAO_ENVIOS.md).

## Etapa 25 — Observações nos envios

Envios entre todos os setores passaram a aceitar uma observação geral e uma observação específica por produto, preservadas na confirmação e no histórico imutável. Resumo em [relatorios/RELATORIO_ETAPA_25_OBSERVACOES_ENVIOS.md](./relatorios/RELATORIO_ETAPA_25_OBSERVACOES_ENVIOS.md).

## Etapa 26 — Alternância operacional do administrador

Administradores passaram a alternar entre as interfaces e regras operacionais de Revisão, Produção e Expedição sem trocar de usuário. O backend valida o modo por requisição e preserva a identidade real na auditoria. Resumo em [relatorios/RELATORIO_ETAPA_26_MODO_OPERACIONAL_ADMIN.md](./relatorios/RELATORIO_ETAPA_26_MODO_OPERACIONAL_ADMIN.md).

## Decisões consolidadas

| Registro histórico | Situação atual |
| --- | --- |
| ADR 016 | PostgreSQL 17 via Docker Compose é o ambiente local suportado; dados ficam em volume persistente. |
| ADR 017 | Código de lote usa `CONSERVADI`; saldo é materializado por produto/lote/validade/local e só muda por serviço interno. |
| ADR 018 | Movimentações usam cabeçalho e itens, request key idempotente, histórico próprio e transação com auditoria. |
| ADR 019 | Saída usa baixa condicional e nunca cria saldo em local externo. |
| ADR 020 | Transferência preserva quantidade e usa locks ordenados. A exigência antiga de manter lote e mudar local foi substituída. |
| ADR 021 | Revisão registra destinos por item, usa configuração `review_role` e preserva lote. |
| ADR 022 | Transferência pode escolher lote de destino e usar o mesmo local quando o lote muda. |
| ADR 023 | Cancelamento marca a original como `CANCELADA` e estorna integralmente sob transação e lock. |

Os ADRs completos estão em [`arquivo/adrs/`](./arquivo/adrs/). As decisões vigentes já foram incorporadas aos documentos canônicos.

## Migrations

| Migration | Conteúdo |
| --- | --- |
| `1788134400000-initial-foundation.ts` | Usuários, perfis, permissões, sessões e auditoria. |
| `1788220800000-base-registries.ts` | Produtos, conversões, lotes, locais iniciais e permissões de cadastro. |
| `1788307200000-batch-manufacturing-and-stock-positions.ts` | Fabricação/código dos lotes, posições de estoque e permissão de consulta. |
| `1788393600000-external-entry-movements.ts` | Movimentações, itens, histórico e permissões de movimentação. |
| `1788480000000-review-movements.ts` | Configuração da revisão e distribuições por item. |
| `1788566400000-transfer-destination-batches.ts` | Lote de destino e transferência com troca de lote. |
| `1788652800000-movement-cancellations.ts` | Estado/metadados de cancelamento e permissão `movements.cancel`. |
| `1789084800000-operational-lot-expiration.ts` | Prazo do produto, variantes por validade, identidade imutável e snapshots dos novos itens. Não regrava dados antigos. O rollback recusa descartar variantes ou snapshots já utilizados. |
| `1789344000000-sector-shipments.ts` | Setores/perfis, envios/itens, constraints, proteção de histórico e vínculo das movimentações. Rollback impede perda de envios ou usuários externos. |

`synchronize` permanece desativado. Migrations são a única forma autorizada de alterar o schema.

## Envios entre setores — etapa 23

Adicionados setor do usuário e perfis externos, envios imutáveis com confirmação/recusa, reserva do disponível, retorno após recusa e movimentações vinculadas. Produção/Expedição deixam de usar entrada/saída direta. Detalhes atuais em [FUNCIONALIDADES.md](./FUNCIONALIDADES.md#envios-entre-setores).

## Etapa 27 — Administração de usuários e responsividade

Adicionado gerenciamento exclusivo de ADMIN com consulta, criação, edição e exclusão lógica de usuários. Reutiliza perfis/setores e schema existentes, sem migration. Alterações revogam sessões e registram auditoria atômica; própria conta e último administrador são protegidos. Ajustados limites de largura dos campos de data em formulários mobile. Resumo em [relatórios da etapa 27](./relatorios/RELATORIO_ETAPA_27_GESTAO_USUARIOS_RESPONSIVIDADE.md).

## Decisões substituídas ou obsoletas

- Etapa 28: revisão passa a permitir transformação de fardo/caixa em um único código unitário por item, escolhido entre alternativas cadastradas. A preservação de produto continua para revisões sem desmontagem; lote/datas permanecem preservados em todas. Migration `1789516800000-review-package-unpacking`; resumo em [relatório 28](./relatorios/RELATORIO_ETAPA_28_DESMONTAGEM_EMBALAGENS.md).

- Lote deixou de ser cadastro independente. Produto/código deixou de ser único isoladamente: a validade também faz parte da identidade operacional e do saldo.

- A transferência não exige mais locais diferentes: o mesmo local é válido quando o lote muda.
- A transferência não preserva mais obrigatoriamente o lote: o produto continua imutável, mas o lote de destino é escolhido.
- Cancelamento e estorno deixaram de ser pendência na etapa 10.
- Revisão deixou de ser pendência na etapa 08 e continua sem permitir escolha de outro código de lote ou datas. Na desmontagem, cria/reutiliza a referência equivalente do produto resultante.
- PostgreSQL instalado diretamente não é o fluxo local oficial; usa-se Docker Compose.
- Os números de testes e tamanhos de bundle presentes nos relatórios antigos descrevem apenas o momento de cada etapa.
- Instruções antigas dizendo que serviços deveriam permanecer ativos não definem o estado atual do ambiente.

## Dívidas e próximos limites conhecidos

- Produtos legados precisam ter o prazo padrão configurado pelo operador; até lá, a validade é manual. Itens antigos não tinham snapshot do produto: continuam com a referência existente, sem inferir dados passados a partir do cadastro atual.
- O bundle principal do frontend está acima de 500 kB minificado; divisão por rotas é uma melhoria futura.
- `App.tsx` ainda concentra telas legadas e deve continuar sendo extraído incrementalmente.
- A exportação CSV é processada em memória; para volumes muito grandes deverá evoluir para streaming.
- Algumas telas operacionais ainda não possuem testes completos de interação em DOM ou regressão visual automatizada.
- Listagens que carregam até 100 registros precisarão de busca remota progressiva em bases maiores.
- Renovação transparente do access token durante uma requisição expirada ainda pode ser aprimorada.
- Edição de perfis/permissões personalizados e política de retenção/consulta da auditoria continuam pendentes; administração visual de usuários já está disponível.
- Reversão automática encadeada, fotos e relatórios analíticos avançados permanecem fora do escopo atual.

## Política para próximas etapas

- Atualize os documentos canônicos no mesmo commit ou etapa da mudança.
- Acrescente ao histórico apenas decisões e marcos que ajudem a entender o estado atual.
- Crie ADR separado somente para decisão arquitetural relevante e, depois, incorpore seu resultado aos documentos canônicos.
- Relatórios de execução podem ser arquivados; não replique neles todas as regras do sistema.
