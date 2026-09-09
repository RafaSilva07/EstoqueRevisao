# Relatório da etapa 18 — Revisão funcional do núcleo

## O que foi revisado

Foram verificados os fluxos de entrada externa, saldos, revisão com múltiplos destinos, transferência com preservação de lote, saída externa, histórico e cancelamento/estorno.

## Problemas encontrados

Não foi encontrado novo defeito funcional no núcleo. As proteções de saldo não negativo, atomicidade, rollback, integridade produto/lote e preservação de quantidade permanecem coerentes. Faltava apenas um guia único para preparar e executar o sistema em uma máquina nova.

## Correções realizadas

Foi adicionada uma validação integrada do ciclo completo, incluindo revisão distribuída entre três destinos, transferência com troca de lote, saída e estorno de todas as operações em ordem reversa. Também foi criado `COMO_RODAR.md` e incluído no índice principal da documentação. Não houve mudança de regra ou comportamento da aplicação.
