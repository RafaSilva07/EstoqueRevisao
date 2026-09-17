# ADR 024 — Separação entre estado operacional e execução PCP

## Contexto

Movimentações encerram um fluxo operacional que altera estoque. Depois disso, o PCP precisa registrá-las no sistema corporativo, sem reabrir, editar ou redefinir o resultado operacional.

## Decisão

Manter duas dimensões na movimentação:

- `status`: resultado operacional já existente (`EFETIVADA` ou `CANCELADA`);
- `pcp_execution_status`: etapa administrativa (`PENDENTE` ou `EXECUTADA`).

Uma execução PCP é única e registra executor, instante e observação opcional. A transição é permitida somente de pendente para executada quando o estado operacional é efetivado. A movimentação é bloqueada na transação e o evento usa a auditoria central.

## Motivos

- preservar responsabilidades e regras operacionais;
- impedir que o lançamento corporativo pareça nova movimentação de estoque;
- oferecer fila, filtros e auditoria sem duplicar o agregado;
- permitir evolução administrativa futura sem acoplar aceite, revisão ou cancelamento.

## Consequências

Positivas: domínio explícito, histórico preservado, consultas simples e nenhuma alteração de saldo. Negativas: quatro campos e filtros adicionais precisam permanecer coerentes; migrations e clientes devem conhecer o novo estado.

## Situação

Aceita na etapa 33 e consolidada em `ARQUITETURA.md` e `REGRAS_NEGOCIO.md`.
