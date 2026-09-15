# Regras de negócio

Este documento consolida o comportamento funcional vigente. Regras históricas substituídas não são válidas, mesmo que ainda apareçam nos arquivos preservados em `arquivo/`.

## Princípios gerais

- O estoque é controlado por `produto + lote + validade + local lógico`.
- Saldos nunca podem ser negativos.
- Movimentações confirmadas não são editadas nem excluídas fisicamente.
- Correções operacionais são registradas por novas movimentações. O cancelamento apenas marca a original e estorna integralmente seus efeitos.
- Operações de estoque, histórico e auditoria são atômicas: qualquer falha causa rollback integral.
- O backend é a autoridade final sobre permissões, referências, saldo e concorrência; validações do frontend são apenas orientação.
- Quantidades de estoque e movimentações devem ser números inteiros positivos; valores fracionários não são permitidos.
- Datas e horários de eventos usam instante com fuso (`timestamptz`) e trafegam em ISO 8601. Fabricação e validade de lote usam somente data civil (`date`).

## Produtos e conversões

- Produto é o cadastro mestre: código único, descrição (`name`), tipo de unidade (`defaultUnit`), prazo padrão de validade em anos inteiros positivos e estado ativo/inativo. Novos cadastros exigem o prazo; produtos antigos sem essa informação permanecem sem sugestão até serem configurados, sem inventar um padrão.
- O código do produto é único sem diferenciação entre maiúsculas e minúsculas.
- Cadastros referenciados são inativados em vez de excluídos.
- Conversões pertencem a um produto, possuem fator positivo e não podem repetir o mesmo par de unidades.
- Unidade de origem e destino de uma conversão devem ser diferentes.

## Lote, fabricação e validade nas operações

- Lote é informação operacional, não um cadastro mestre nem uma etapa prévia. Entrada e transferência recebem os dados diretamente; o sistema resolve ou cria a referência interna na mesma transação da movimentação.
- Cada combinação de produto, código e validade identifica uma variante imutável. O mesmo código pode existir para o produto com validades diferentes, mas nunca com fabricação incompatível.
- A validade sugerida é fabricação + prazo padrão do produto em anos civis. Em 29 de fevereiro, limita-se ao último dia de fevereiro do ano de destino. A sugestão é editável; sempre se preserva a validade confirmada, não um cálculo futuro.
- Havendo outra validade registrada para o mesmo produto/lote, a confirmação informa produto, lote, validades existentes e validade informada. Só após confirmação explícita a operação prossegue, com saldos separados. Referências históricas sem saldo também são consideradas.
- A confirmação fica vinculada às divergências apresentadas. Uma validade concorrente ainda não apresentada exige nova confirmação. Recusar/fechar não grava saldo, lote nem movimentação.
- Entradas com o mesmo produto, lote, validade e local acumulam o saldo, mantendo cada movimentação individual no histórico.
- Fabricação e validade são obrigatórias, e a validade não pode anteceder a fabricação.
- A fabricação deve estar entre 2000 e 2099.
- O código possui seis letras e representa `DDMMYY` pela tabela `CONSERVADI`:

| Dígito | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Letra | C | O | N | S | E | R | V | A | D | I |

- Código e fabricação, quando informados juntos, devem representar a mesma data.
- A geração e validação dessa relação usam exclusivamente o codec central do módulo de lotes. Informar fabricação completa o código, e informar código completa a fabricação. A API revalida ambos ao confirmar.

## Locais e posições de estoque

Os locais lógicos são configuráveis no banco:

- `STOCK`: estoque principal;
- `SUBSTOCK`: classificação interna ligada a um estoque pai;
- `EXTERNAL`: origem ou destino fora do estoque controlado.

Regras:

- Subestoque exige pai ativo do tipo `STOCK`.
- Estoque com subestoques ativos não pode ser inativado nem convertido para outro tipo.
- Uma posição é única por produto, lote, validade e local interno. As seleções operacionais mostram a validade e identificam a posição exata, sem misturar parcelas.
- O lote da posição deve pertencer ao mesmo produto.
- Posições com saldo zero permanecem persistidas, mas são omitidas da listagem operacional.
- Não existe endpoint público para alterar saldo diretamente; toda mudança deve ser consequência de uma operação de negócio.

Os registros iniciais são Estoque Revisão, Revisar, Lata Boa, Varejo, TUF, Expedição e Produção. Nomes não devem ser usados como regra no código. A revisão usa `review_role` persistido para identificar uma origem `SOURCE` e destinos `DESTINATION`.

## Regras comuns das movimentações

- Tipos implementados: `ENTRADA_EXTERNA`, `SAIDA_EXTERNA`, `TRANSFERENCIA_INTERNA` e `REVISAO`.
- Estados atuais: `EFETIVADA` e `CANCELADA`.
- Uma movimentação aceita um ou mais itens e é confirmada sempre como uma unidade.
- A `request_key` UUID é única. Reenvio pelo mesmo usuário e tipo retorna o documento existente; reutilização incompatível gera conflito.
- Uma combinação de produto/lote/validade não pode se repetir em saída, transferência ou revisão; variantes de validade distintas são itens distintos.
- Documento, itens, distribuições, saldos e auditoria usam a mesma transação.
- Falha em qualquer item reverte toda a operação.
- Itens e posições são processados em ordem determinística para reduzir deadlocks.
- Histórico operacional, auditoria e logs técnicos são conceitos separados.

## Envios entre setores

- Usuários possuem setor `REVISAO`, `PRODUCAO` ou `EXPEDICAO`. O setor atribuído vem da sessão validada no banco, nunca de um campo operacional comum. Usuários existentes permanecem na Revisão.
- Somente usuários com função `ADMIN` podem alternar temporariamente o modo operacional entre Revisão, Produção e Expedição. O modo escolhido vale por requisição, aplica todas as restrições do setor selecionado e não altera o setor cadastrado nem a identidade registrada em histórico e auditoria. Cabeçalhos de alternância enviados por não administradores ou com valor inválido são rejeitados.
- Produção/Expedição enviam somente para Revisão e decidem somente recebimentos destinados ao próprio setor. Não acessam operações, saldos ou relatórios internos da Revisão.
- Revisão envia para Produção/Expedição e decide os envios desses setores. Permissões `shipments.read/create/decide` complementam a validação do setor.
- Um envio tem vários itens e nasce `AGUARDANDO_RECEBIMENTO`. Os itens não são editáveis depois do envio. Somente o destinatário pode decidir uma única vez: `CONFIRMADO` ou `RECUSADO`; recusa exige motivo de até 1000 caracteres.
- O remetente pode registrar uma observação geral no envio e uma observação específica em cada item/produto. Ambas são opcionais, possuem até 1000 caracteres, são preservadas no histórico e tornam-se imutáveis junto com o envio.
- Produção/Expedição → Revisão: criar não altera saldo; confirmar adiciona os itens à origem configurada da revisão (`review_role = SOURCE`, “A Revisar”); recusar não altera saldo.
- Revisão → Produção/Expedição: criar retira atomicamente a quantidade disponível das posições selecionadas. Os itens pendentes representam **em trânsito**, sem criar um local consumível por outras operações. Confirmar encerra o trânsito e registra a saída sem descontar novamente; recusar devolve exatamente às posições originais, inclusive se o produto tiver sido inativado.
- O tipo de um local com quantidade em trânsito não pode mudar até a decisão, garantindo a restauração em caso de recusa.
- Lote/fabricação/validade de envio externo reutilizam integralmente as regras operacionais. Divergências de validade exigem aceite na criação e nova conferência no recebimento pela Revisão. Envios da Revisão preservam a variante selecionada no saldo.
- Criação usa chave idempotente; decisões bloqueiam o envio. Repetir a mesma decisão retorna o estado já registrado, sem novo efeito; tentar a decisão oposta gera conflito.
- Decisão, movimentações, saldo e auditoria são uma transação única. Quantidade reservada não pode ser consumida por revisão, transferência, saída, outro envio ou estorno de entrada.
- Confirmação gera movimentação externa vinculada ao envio. Como o cabeçalho atual possui uma origem, um envio com várias origens internas gera uma movimentação por local de origem, sob a mesma transação e vínculo.
- Envios e itens não são excluídos. Remetente, destinatário, datas, responsável pela decisão, motivo, observações e snapshot dos produtos permanecem no histórico. Correções exigem novo envio independente.
- Movimentações vinculadas a envio confirmado não aceitam cancelamento isolado: devolução exige novo envio no sentido inverso e confirmação do outro setor. Cancelamentos de movimentações anteriores ou não vinculadas continuam disponíveis.
- Indicações internas mostram pendências e decisões recentes dos próprios envios, com motivo de recusa. Não há e-mail, push, fotos ou controle de “lido”.

## Entrada externa

- Para Produção/Expedição, o fluxo obrigatório é **Envios**. Entrada direta atende somente outros locais externos ativos, sem setor associado.
- Destino deve ser local ativo `STOCK` ou `SUBSTOCK`.
- A origem externa não possui saldo controlado a reduzir.
- Cada item soma sua quantidade à posição de destino; posição inexistente é criada e posição existente é acumulada.

## Saída externa

- Origem deve ser local ativo `STOCK` ou `SUBSTOCK`.
- Para Produção/Expedição, o fluxo obrigatório é **Envios**. Saída direta atende somente outros locais externos ativos, sem setor associado.
- Cada item deve possuir saldo suficiente na origem.
- A operação reduz somente a origem e não cria saldo no destino externo.
- A baixa é condicional no banco para impedir saldo negativo sob concorrência.

## Transferência interna

- Origem é uma posição existente em local `STOCK` ou `SUBSTOCK`.
- Destino também deve ser `STOCK` ou `SUBSTOCK`.
- O produto permanece obrigatoriamente o mesmo.
- O usuário escolhe o local e o lote de destino.
- O destino pode manter lote e validade da origem ou receber lote/fabricação/validade dentro do próprio fluxo. Se a combinação do produto já existir, é reutilizada; caso contrário, é criada atomicamente, com confirmação para divergência de validade.
- É permitido alterar somente o local, somente o lote ou ambos.
- Mesmo local com mesmo código de lote é rejeitado; mudar apenas a validade não autoriza transferência no mesmo local.
- Mesmo local é permitido exclusivamente quando o lote muda.
- O lote de destino deve pertencer ao produto transferido.
- A quantidade retirada da origem é exatamente a quantidade adicionada ao destino; o total do produto é preservado.
- O histórico mantém separadamente lote, fabricação, validade e local de origem e destino.

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

- O histórico mostra tipo, estado, responsável e data originais, rota, itens, lotes, fabricação, validade, quantidades e distribuições. Referências de lote/validade não podem ser editadas. Novos itens também guardam uma cópia de código, descrição e unidade do produto; alterações posteriores no cadastro não reescrevem essa cópia. Dados antigos sem essa cópia continuam consultáveis, sem fabricar um histórico que não foi registrado.
- Movimentações canceladas continuam consultáveis e mostram responsável, data e motivo do cancelamento.
- Não existem rotas para editar ou excluir movimentações.
- A auditoria registra usuário, ação, entidade, identificador, resultado, data/hora, request ID, IP, user-agent e dados anteriores/novos quando aplicável.
- Auditoria não substitui o histórico operacional e não possui endpoints de edição ou exclusão.

## Consultas e relatórios

- Relatórios são somente leitura e não criam estado paralelo nem alteram estoque.
- Dados históricos usam movimentações confirmadas, itens e distribuições como fonte; a posição atual usa o saldo **disponível** de `stock_positions`. Pendências/recusas não entram nos totais de entrada/saída; itens de envios pendentes da Revisão representam separadamente o trânsito, consultável em Envios.
- Movimentações canceladas permanecem consultáveis, mas suas quantidades não integram totais válidos.
- Totais de quantidade são separados por unidade de medida; unidades incompatíveis nunca são somadas entre si.
- Consultas extensas são paginadas e os filtros podem ser combinados.
- A exportação CSV usa os mesmos filtros da consulta e exporta todas as linhas correspondentes, sem a paginação da tela.
- Períodos históricos usam instantes ISO 8601. Validade usa data civil e é classificada em vencida, próxima do vencimento ou válida em relação à data de referência e à janela informada.
- A distribuição da revisão considera apenas movimentações `REVISAO` efetivadas e totaliza cada classificação de destino.

## Fora do escopo atual

- fotos/evidências de envios e notificações externas;
- transformação ou criação de produto/lote específica do Varejo;
- mapa físico detalhado de armazenagem;
- reversão automática de uma cadeia de operações dependentes;
- administração completa de usuários e perfis;
- dashboard e relatórios analíticos avançados além das consultas operacionais implementadas.
