# Regras de negócio

Este documento consolida o comportamento funcional vigente. Regras históricas substituídas não são válidas, mesmo que ainda apareçam nos arquivos preservados em `arquivo/`.

## Princípios gerais

- O estoque é controlado por `produto + lote + local lógico`.
- Saldos nunca podem ser negativos.
- Movimentações confirmadas não são editadas nem excluídas fisicamente.
- Correções operacionais são registradas por novas movimentações. O cancelamento apenas marca a original e estorna integralmente seus efeitos.
- Operações de estoque, histórico e auditoria são atômicas: qualquer falha causa rollback integral.
- O backend é a autoridade final sobre permissões, referências, saldo e concorrência; validações do frontend são apenas orientação.
- Quantidades de estoque e movimentações devem ser números inteiros positivos; valores fracionários não são permitidos.
- Datas e horários de eventos usam instante com fuso (`timestamptz`) e trafegam em ISO 8601. Fabricação e validade de lote usam somente data civil (`date`).

## Produtos e conversões

- Produto possui código, nome, unidade padrão e estado ativo/inativo.
- O código do produto é único sem diferenciação entre maiúsculas e minúsculas.
- Cadastros referenciados são inativados em vez de excluídos.
- Conversões pertencem a um produto, possuem fator positivo e não podem repetir o mesmo par de unidades.
- Unidade de origem e destino de uma conversão devem ser diferentes.

## Lotes

- Todo lote pertence a exatamente um produto; essa associação não pode ser trocada por edição.
- O código é único dentro do produto, sem diferenciação entre maiúsculas e minúsculas.
- Fabricação e validade são obrigatórias, e a validade não pode anteceder a fabricação.
- A fabricação deve estar entre 2000 e 2099.
- O código possui seis letras e representa `DDMMYY` pela tabela `CONSERVADI`:

| Dígito | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Letra | C | O | N | S | E | R | V | A | D | I |

- Código e fabricação, quando informados juntos, devem representar a mesma data.
- A geração e validação dessa relação pertencem ao módulo de lotes e devem ser reutilizadas por qualquer fluxo que crie lote.

## Locais e posições de estoque

Os locais lógicos são configuráveis no banco:

- `STOCK`: estoque principal;
- `SUBSTOCK`: classificação interna ligada a um estoque pai;
- `EXTERNAL`: origem ou destino fora do estoque controlado.

Regras:

- Subestoque exige pai ativo do tipo `STOCK`.
- Estoque com subestoques ativos não pode ser inativado nem convertido para outro tipo.
- Uma posição é única por produto, lote e local interno.
- O lote da posição deve pertencer ao mesmo produto.
- Posições com saldo zero permanecem persistidas, mas são omitidas da listagem operacional.
- Não existe endpoint público para alterar saldo diretamente; toda mudança deve ser consequência de uma operação de negócio.

Os registros iniciais são Estoque Revisão, Revisar, Lata Boa, Varejo, TUF, Expedição e Produção. Nomes não devem ser usados como regra no código. A revisão usa `review_role` persistido para identificar uma origem `SOURCE` e destinos `DESTINATION`.

## Regras comuns das movimentações

- Tipos implementados: `ENTRADA_EXTERNA`, `SAIDA_EXTERNA`, `TRANSFERENCIA_INTERNA` e `REVISAO`.
- Estados atuais: `EFETIVADA` e `CANCELADA`.
- Uma movimentação aceita um ou mais itens e é confirmada sempre como uma unidade.
- A `request_key` UUID é única. Reenvio pelo mesmo usuário e tipo retorna o documento existente; reutilização incompatível gera conflito.
- Uma combinação de produto/lote não pode se repetir em saída, transferência ou revisão.
- Documento, itens, distribuições, saldos e auditoria usam a mesma transação.
- Falha em qualquer item reverte toda a operação.
- Itens e posições são processados em ordem determinística para reduzir deadlocks.
- Histórico operacional, auditoria e logs técnicos são conceitos separados.

## Entrada externa

- Origem deve ser local ativo `EXTERNAL`.
- Destino deve ser local ativo `STOCK` ou `SUBSTOCK`.
- A origem externa não possui saldo controlado a reduzir.
- Cada item soma sua quantidade à posição de destino; posição inexistente é criada e posição existente é acumulada.

## Saída externa

- Origem deve ser local ativo `STOCK` ou `SUBSTOCK`.
- Destino deve ser local ativo `EXTERNAL`.
- Cada item deve possuir saldo suficiente na origem.
- A operação reduz somente a origem e não cria saldo no destino externo.
- A baixa é condicional no banco para impedir saldo negativo sob concorrência.

## Transferência interna

- Origem é uma posição existente em local `STOCK` ou `SUBSTOCK`.
- Destino também deve ser `STOCK` ou `SUBSTOCK`.
- O produto permanece obrigatoriamente o mesmo.
- O usuário escolhe o local e o lote de destino.
- O lote de destino pode ser o lote atual, outro lote existente do mesmo produto ou um novo lote criado pelo fluxo central de lotes.
- É permitido alterar somente o local, somente o lote ou ambos.
- Mesmo local com mesmo lote é rejeitado por não produzir alteração real.
- Mesmo local é permitido exclusivamente quando o lote muda.
- O lote de destino deve pertencer ao produto transferido.
- A quantidade retirada da origem é exatamente a quantidade adicionada ao destino; o total do produto é preservado.
- O histórico mantém separadamente lote e local de origem e destino.

## Revisar produtos

- `REVISAO` é uma única movimentação que pode conter vários itens e vários destinos por item.
- A origem é obtida do único local configurado como `review_role = SOURCE`.
- Destinos devem ser locais configurados como `review_role = DESTINATION`.
- Revisar, locais externos e locais internos sem esse papel não podem ser destinos.
- Para cada item, a soma das distribuições deve ser exatamente igual à quantidade revisada.
- Destinos do mesmo item não podem se repetir.
- A revisão pode consumir parte do saldo; o restante permanece em Revisar.
- Produto, lote, fabricação e validade são obrigatoriamente preservados em todos os destinos.
- Revisão não permite escolher, trocar nem criar lote. Essa capacidade pertence somente à transferência interna.

Invariantes por item:

```text
soma das distribuições = quantidade revisada
quantidade retirada de Revisar = quantidade somada aos destinos
produto e lote de origem = produto e lote de todos os destinos
```

## Cancelamento e estorno

- Cancelamento é sempre integral; não existe cancelamento parcial.
- Motivo é obrigatório e possui no máximo 1000 caracteres.
- A movimentação original permanece no histórico com seus dados originais e recebe estado `CANCELADA`, usuário, data/hora e motivo do cancelamento.
- Uma movimentação já cancelada não pode ser cancelada novamente.
- O estorno bloqueia a movimentação e as posições necessárias, ocorre na mesma transação da mudança de estado e da auditoria e não pode deixar saldo negativo.
- Se saldo produzido pela operação já tiver sido consumido, o cancelamento é bloqueado. Dependências devem ser estornadas primeiro; a reversão encadeada automática ainda não existe.

Reversões:

| Operação original | Estorno |
| --- | --- |
| Entrada externa | Retira do destino tudo o que a entrada adicionou. |
| Saída externa | Devolve à origem tudo o que a saída retirou. |
| Transferência interna | Retira da posição de destino e devolve à origem, inclusive quando os lotes são diferentes. |
| Revisão | Retira cada parcela de seus destinos e devolve o total ao Revisar. |

## Histórico e auditoria

- O histórico mostra tipo, estado, responsável e data originais, rota, itens, lotes, quantidades e distribuições.
- Movimentações canceladas continuam consultáveis e mostram responsável, data e motivo do cancelamento.
- Não existem rotas para editar ou excluir movimentações.
- A auditoria registra usuário, ação, entidade, identificador, resultado, data/hora, request ID, IP, user-agent e dados anteriores/novos quando aplicável.
- Auditoria não substitui o histórico operacional e não possui endpoints de edição ou exclusão.

## Consultas e relatórios

- Relatórios são somente leitura e não criam estado paralelo nem alteram estoque.
- Dados históricos usam movimentações, itens e distribuições como fonte; a posição atual usa `stock_positions`.
- Movimentações canceladas permanecem consultáveis, mas suas quantidades não integram totais válidos.
- Totais de quantidade são separados por unidade de medida; unidades incompatíveis nunca são somadas entre si.
- Consultas extensas são paginadas e os filtros podem ser combinados.
- A exportação CSV usa os mesmos filtros da consulta e exporta todas as linhas correspondentes, sem a paginação da tela.
- Períodos históricos usam instantes ISO 8601. Validade usa data civil e é classificada em vencida, próxima do vencimento ou válida em relação à data de referência e à janela informada.
- A distribuição da revisão considera apenas movimentações `REVISAO` efetivadas e totaliza cada classificação de destino.

## Fora do escopo atual

- solicitação, trânsito, fotos e conferência posterior de movimentações;
- transformação ou criação de produto/lote específica do Varejo;
- mapa físico detalhado de armazenagem;
- reversão automática de uma cadeia de operações dependentes;
- administração completa de usuários e perfis;
- notificações, dashboard e relatórios analíticos avançados além das consultas operacionais implementadas.
