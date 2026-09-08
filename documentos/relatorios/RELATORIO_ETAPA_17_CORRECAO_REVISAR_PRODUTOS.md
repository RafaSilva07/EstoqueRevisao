# Relatório da etapa 17 — Correção de Revisar Produtos

## Causa encontrada

Quando a API rejeitava a revisão, a tela registrava a mensagem de erro e logo executava a atualização dos saldos. O carregamento bem-sucedido apagava essa mensagem, fazendo a operação com falha parecer não responder. A transação de revisão no backend já realizava corretamente o débito, os créditos e o histórico.

## Correção realizada

O recarregamento das posições após falha passou a preservar a mensagem da operação. Também foi fixado como regressão o cenário de revisão parcial com distribuição simultânea entre Lata Boa, Varejo e TUF.

## Comportamento final

Revisões válidas continuam sendo efetivadas atomicamente como uma única movimentação, debitando Revisar e creditando todos os destinos. Se houver falha, nenhum efeito parcial é confirmado e a causa permanece visível ao usuário após a atualização dos saldos.
