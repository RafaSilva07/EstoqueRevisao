# ADR 023 - Cancelamento e estorno de movimentacoes

- Status: aceito
- Data: 2026-09-06
- Escopo: movimentacoes, estoque, historico e auditoria

## Contexto

Uma movimentacao efetivada pode precisar ser cancelada por erro operacional. O documento funcional determina que o registro original nunca seja excluido e que a reversao seja bloqueada quando o saldo necessario ja tiver sido consumido. A arquitetura atribui ao modulo de movimentacoes a coordenacao dos efeitos compensatorios e exige transacao, rastreabilidade e controle de concorrencia.

## Decisao

- O estado canonico adotado para uma movimentacao estornada e `CANCELADA`.
- A movimentacao original permanece com o mesmo identificador, tipo, rota, itens, quantidades, responsavel e data originais. Somente seu estado e os metadados de cancelamento sao acrescentados.
- Uma movimentacao cancelada registra obrigatoriamente `canceled_by_user_id`, `canceled_at` e `cancellation_reason`.
- Constraints no PostgreSQL limitam o estado a `EFETIVADA` ou `CANCELADA` e garantem que os tres metadados estejam todos ausentes na primeira ou todos preenchidos na segunda.
- O endpoint `POST /api/v1/movements/:id/cancellation` exige a permissao dedicada `movements.cancel`, mantendo o principio do menor privilegio. O corpo recebe somente o motivo obrigatorio, com no maximo 1000 caracteres.
- O cancelamento bloqueia pessimisticamente a linha da movimentacao antes de verificar o estado. Assim, dois pedidos concorrentes nao podem aplicar o estorno duas vezes.
- Reversao dos saldos, mudanca de estado e auditoria `MOVEMENT_CANCEL` ocorrem na mesma transacao. Qualquer falha provoca rollback integral.
- As posicoes envolvidas sao processadas em ordem deterministica. Baixas continuam condicionadas a saldo suficiente e transferencias/distribuicoes reutilizam os bloqueios centrais do estoque.

## Regras de reversao

| Tipo original | Efeito do cancelamento |
| --- | --- |
| `ENTRADA_EXTERNA` | Retira de cada posicao de destino a quantidade que havia sido adicionada. |
| `SAIDA_EXTERNA` | Devolve a cada posicao de origem a quantidade que havia sido retirada. |
| `TRANSFERENCIA_INTERNA` | Retira da posicao de destino, usando inclusive o lote de destino historico, e devolve a posicao de origem. |
| `REVISAO` | Retira cada parcela de sua classificacao de destino e devolve o total do item ao local configurado como origem Revisar. |

Se qualquer baixa compensatoria resultar em saldo insuficiente, o cancelamento e rejeitado por `INSUFFICIENT_STOCK`. Isso cobre o caso em que operacoes posteriores consumiram total ou parcialmente o saldo que precisaria ser retirado.

## Historico e correcoes

- Cancelar nao apaga nem reescreve os dados operacionais da movimentacao original.
- A mudanca de estado formaliza o cancelamento exigido pelo dominio; ela nao transforma quantidades, itens, lotes, locais ou datas originais.
- Caso seja necessario registrar a operacao correta, o usuario deve criar uma nova movimentacao pelos fluxos existentes. O cancelamento nao edita a original para simular uma correcao.
- O detalhe apresenta responsavel e data originais, alem de responsavel, data e motivo do cancelamento.
- O impacto exibido na interface e derivado dos dados imutaveis do detalhe. A confirmacao definitiva sempre ocorre no backend sob nova validacao transacional.

## Consequencias

- O historico geral passa a conter movimentacoes efetivadas e canceladas, sem exclusao fisica.
- A auditoria preserva a transicao de estado e os metadados do cancelamento na mesma atomicidade dos saldos.
- O botao de cancelamento aparece somente para movimentacoes efetivadas e usuarios com permissao de escrita.
- A interface impede reenvio enquanto a requisicao esta em andamento; o bloqueio no banco continua sendo a protecao definitiva contra concorrencia e repeticao.

## Alternativas nao adotadas

- Excluir a movimentacao original: eliminaria a rastreabilidade e violaria a regra funcional.
- Alterar itens ou quantidades originais: misturaria correcao com historico e impediria reconstruir o fato ocorrido.
- Criar logica de saldo paralela no modulo de movimentacoes: duplicaria validacoes, locks e operacoes atomicas ja centralizadas no estoque.
- Aceitar cancelamento parcial: produziria um estado ambiguo e contrariaria a reversao integral definida para o MVP.
- Confiar apenas no bloqueio do botao: nao protegeria chamadas concorrentes ou repetidas diretamente a API.
