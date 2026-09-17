# Relatório da etapa 33 — Perfil PCP

## 1. Objetivo

Disponibilizar ao PCP uma fila transversal de movimentações concluídas e registrar, sem alterar estoque, quando cada uma foi lançada no sistema corporativo.

## 2. Requisitos implementados

Consulta global paginada, filtros combináveis, ordenação, detalhe com itens/evidências/auditoria, execução única com observação opcional e interface exclusiva do perfil.

## 3. Backend

Criado o módulo `pcp`, com controller, service, repository e DTOs. A consulta resumida evita N+1; o detalhe carrega o agregado e evidências sob demanda. A execução revalida estado dentro de transação e lock pessimista.

## 4. Frontend

Criada `PcpPage`, mobile-first, com filtros preservados durante o detalhe, paginação, badges, estados de carregamento/vazio/erro, visualização das fotos privadas e modal de confirmação com bloqueio de duplo envio.

## 5. Banco

A migration `1789689600000` adiciona estado PCP, executor, instante, observação, constraints, chave estrangeira e índices da fila. Registros anteriores permanecem pendentes, sem inferir execução passada.

## 6. Autorização

O perfil exclusivo `PCP` recebe `pcp.movements.read`, `pcp.movements.execute` e permissões estritamente de leitura auxiliares. Não recebe criação/edição/cancelamento de movimentos nem decisão de envios.

## 7. Filtros

Período, estado operacional, estado PCP, tipo, origem, destino, produto/lote, ordenação crescente/decrescente e paginação são processados no PostgreSQL.

## 8. Fluxo de execução

Somente `EFETIVADA + PENDENTE` transita para `EXECUTADA`. Usuário e horário vêm do backend; observação é opcional. Cancelada ou já executada retorna conflito.

## 9. Auditoria

O evento `PCP_MOVEMENT_EXECUTE` registra movimentação, usuário, horário, observação e transição de estado na infraestrutura existente.

## 10. Testes

Foram adicionados testes do serviço para sucesso, observação vazia e transições inválidas, além de testes de renderização dos filtros e da regra de exibição da execução.

## 11. Arquivos principais

`modules/pcp/*`, `PcpPage.tsx`, `MovementEntity`, migration `1789689600000`, configuração TypeORM e documentação canônica.

## 12. Limitações

Não há reabertura ou reprocessamento PCP nesta versão. Movimentações de envios são agrupadas conforme a movimentação canônica já criada por origem no aceite.

## 13. Próximos passos possíveis

Somente mediante nova regra: indicadores agregados do PCP, reprocessamento formal ou exportação específica.
