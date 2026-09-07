# Relatorio da Etapa 10 - Cancelamento e estorno

- Data: 2026-09-06
- Commit funcional: `5045ac0` (`feat(movements): implement atomic movement cancellation`)
- Status: concluida e validada

## Objetivo

Permitir o cancelamento integral de uma movimentacao efetivada, revertendo seus efeitos no estoque sem excluir nem alterar seus dados operacionais originais. A implementacao cobre entrada externa, saida externa, transferencia interna com ou sem troca de lote e revisao com multiplos destinos.

## Analise anterior

Os documentos oficiais, ADRs, relatorios anteriores e a implementacao foram lidos antes das alteracoes. Foi preservado o monolito modular React/NestJS/PostgreSQL, com coordenacao transacional no modulo de movimentacoes e operacoes de saldo centralizadas no modulo de estoque.

Os documentos ja previam os estados Cancelada/Estornada e determinavam que uma movimentacao confirmada nao fosse excluida, que a reversao fosse compensatoria e que saldos consumidos posteriormente bloqueassem o processo. Como nao existia valor implementado, a ADR 023 definiu `CANCELADA` como estado canonico e “estorno” como o efeito aplicado ao estoque.

## Modelagem e migration

A migration `1788652800000-movement-cancellations.ts`:

- acrescenta `canceled_by_user_id`, `canceled_at` e `cancellation_reason` a `movements`;
- cria chave estrangeira restritiva para o usuario responsavel pelo cancelamento;
- limita o status a `EFETIVADA` ou `CANCELADA`;
- exige por constraint que os metadados estejam todos ausentes em movimentacoes efetivadas ou todos preenchidos em movimentacoes canceladas;
- cria indice parcial por data de cancelamento;
- cria a permissao dedicada `movements.cancel` e a vincula ao perfil `ADMIN`.

A migration foi aplicada no banco principal e validada por aplicacao, rollback e reaplicacao.

## Backend

Foi criado `POST /api/v1/movements/:id/cancellation`, protegido por autenticacao e pela permissao `movements.cancel`. O DTO aceita somente um motivo preenchido de ate 1000 caracteres.

O servico:

- bloqueia pessimisticamente a movimentacao antes de validar seu status;
- rejeita movimentacao inexistente ou ja cancelada;
- processa itens em ordem deterministica;
- retira do destino os itens de uma entrada externa;
- devolve a origem os itens de uma saida externa;
- inverte a rota completa da transferencia, respeitando os lotes historicos das duas pontas;
- retira cada parcela dos destinos da revisao e devolve o total ao Revisar;
- bloqueia o cancelamento quando qualquer posicao nao possui mais saldo suficiente;
- confirma saldos, status, usuario, data, motivo e auditoria `MOVEMENT_CANCEL` na mesma transacao;
- preserva rollback integral em qualquer falha e impede estorno duplo sob concorrencia.

Nenhum item, quantidade, lote, local, responsavel ou data da operacao original e editado. Uma eventual operacao correta deve ser registrada como nova movimentacao pelos fluxos existentes.

## Frontend mobile-first

O detalhe do historico identifica movimentacoes efetivadas e canceladas. Para usuarios com `movements.cancel`, uma movimentacao elegivel apresenta `Cancelar movimentacao`.

O fluxo solicita o motivo, exibe em seguida o impacto por produto, lote, local e quantidade e somente entao permite confirmar. O botao fica bloqueado durante a requisicao. Depois do sucesso, o detalhe e a lista sao atualizados e passam a mostrar responsavel, data e motivo do cancelamento, mantendo tambem todos os dados originais.

## Testes e verificacoes

Resultados finais:

- lint aprovado sem avisos;
- build NestJS e React/Vite aprovado;
- 156 testes backend aprovados em 13 suites, com PostgreSQL real;
- 9 testes frontend aprovados em 3 arquivos;
- migration aplicada, revertida e reaplicada com sucesso;
- PostgreSQL 17 executado de forma saudavel durante as validacoes.

Os testes cobrem os quatro algoritmos de estorno, transferencia com troca de lote no mesmo local, revisao com multiplos destinos, motivo obrigatorio, metadados e auditoria, preservacao do original, saldo consumido, rollback integral, cancelamento duplicado e concorrente, alem da apresentacao do impacto no frontend.

## Pendencias

- O bundle principal do frontend continua acima de 500 kB minificado; divisao por rotas permanece uma melhoria tecnica futura e nao bloqueia esta etapa.
- Nao foi executado teste visual automatizado em navegador; a interface foi validada por tipos, lint, build e testes de apresentacao do impacto.
- Reversao encadeada automatica de operacoes dependentes permanece fora do MVP atual. Nesta etapa, conforme a regra solicitada, uma movimentacao cujo saldo foi consumido e bloqueada e deve ter suas dependencias tratadas primeiro.
