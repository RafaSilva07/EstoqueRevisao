# Funcionalidades implementadas

Este documento descreve o comportamento disponível hoje. As regras completas e invariantes estão em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md).

Todas as entradas, saídas, transferências e distribuições de revisão aceitam somente quantidades inteiras positivas. O frontend orienta o preenchimento e o backend aplica a validação definitiva antes de alterar saldos.

## Acesso e sessão

| Método | Rota | Função |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Autentica e inicia sessão. |
| `POST` | `/api/v1/auth/refresh` | Rotaciona o refresh token e renova o acesso. |
| `POST` | `/api/v1/auth/logout` | Revoga a sessão. |
| `GET` | `/api/v1/auth/me` | Retorna o usuário autenticado. |
| `GET` | `/api/v1/health` | Verifica API e PostgreSQL; é público. |

O frontend possui login, restauração da sessão pelo cookie HttpOnly e navegação condicionada às permissões.

## Produtos e conversões

Produtos possuem listagem, busca, filtros, detalhe, criação, edição e ativação/inativação. O formulário identifica código, descrição, tipo de unidade e prazo padrão em anos; o prazo apenas sugere a validade de novas operações. O detalhe permite listar, criar, editar e ativar/inativar conversões de unidade.

Rotas principais:

```text
GET/POST        /api/v1/products
GET/PATCH       /api/v1/products/:id
PATCH           /api/v1/products/:id/status
GET/POST        /api/v1/products/:productId/conversions
PATCH           /api/v1/product-conversions/:id
PATCH           /api/v1/product-conversions/:id/status
```

## Lotes operacionais

Não existe mais tela/menu de cadastro de lotes, modal de criação antecipada nem endpoints de criação/edição separados. O componente `OperationalLotFields` é compartilhado por entrada e transferência: preencha lote **ou** fabricação, saia do campo para completar o correspondente e revise a validade sugerida/editável.

```text
POST            /api/v1/movements/resolve-lot
GET             /api/v1/batches
GET             /api/v1/batches/:id
```

`resolve-lot` exige `movements.create` e apenas valida/calcula, sem gravar. As consultas de lotes são somente leitura das variantes existentes, com `batches.read`. O cadastro operacional acontece somente ao efetivar a movimentação.

Quando o produto/lote já possui outra validade, a confirmação mostra as datas e a ação **Confirmar com validades separadas**. Sem essa confirmação, nada é gravado. Validades diferentes ficam em posições distintas, mesmo no mesmo local. A confirmação e a proteção contra duplo envio são compartilhadas pelas duas telas.

## Estoques, locais e saldo atual

Locais possuem listagem, filtros, detalhe, criação, edição e ativação/inativação. A interface trata estoque, subestoque e local externo com suas relações válidas.

```text
GET/POST        /api/v1/stocks
GET/PATCH       /api/v1/stocks/:id
PATCH           /api/v1/stocks/:id/status
GET             /api/v1/stock-positions
GET             /api/v1/stock-positions/:id
```

A tela Estoque atual filtra por produto, variante de lote/validade e local e mostra somente posições positivas, com fabricação e validade. Cada validade mantém seu próprio saldo; os totais da Home e dos relatórios continuam usando essas posições reais. Oferece atalhos para transferir uma posição e, quando ela pertence à origem de revisão, realizar revisão.

## Entrada externa

`POST /api/v1/movements/external-entries`

O fluxo seleciona origem externa, destino controlado e um ou mais itens. Recebe `items[].lot` com código e/ou fabricação e validade, sem cadastro prévio, mostra produto/lote/datas/quantidade no resumo antes da confirmação e protege reenvio por chave idempotente. Ao confirmar, incrementa o destino e abre o documento no histórico.

## Saída externa

`POST /api/v1/movements/external-exits`

O fluxo seleciona origem controlada, destino externo e itens derivados das posições positivas da origem. Mostra saldo e validade, rejeita duplicidade, valida quantidade e recarrega saldos após conflito. A confirmação reduz a origem sem criar posição externa.

## Transferência interna com lote de destino

`POST /api/v1/movements/internal-transfers`

O mesmo fluxo atende:

- mesmo lote para outro local;
- outro lote para outro local;
- outro lote no mesmo local.

Após escolher a posição de origem e a quantidade, o usuário seleciona o local de destino e mantém lote/validade ou informa os dados de destino inline (`items[].destinationLot`). Combinações existentes são reutilizadas automaticamente. A API continua aceitando `destinationBatchId` para uma variante existente do mesmo produto; não se enviam os dois formatos juntos. A tela mostra a rota completa antes de confirmar e bloqueia a combinação sem mudança real.

No histórico, cada item conserva:

```text
produto / lote, fabricação e validade de origem / local de origem
→ produto / lote, fabricação e validade de destino / local de destino
quantidade
```

## Revisar produtos

`POST /api/v1/movements/reviews`

A tela mostra apenas produto/lote com saldo em Revisar. O usuário pode incluir vários itens e distribuir cada quantidade entre um ou mais destinos permitidos. O formulário informa quanto falta, quanto excede ou se a distribuição está completa e bloqueia a confirmação inválida.

A revisão preserva obrigatoriamente produto, lote, fabricação e validade. Não oferece seleção nem criação de lote. O histórico apresenta todas as distribuições dentro do mesmo documento. Duas validades do mesmo código de lote são selecionadas e distribuídas separadamente.

## Histórico de movimentações

```text
GET             /api/v1/movements
GET             /api/v1/movements/:id
```

A listagem filtra por período, tipo, origem, destino e produto. O detalhe apresenta identificador, tipo, estado, data/hora, responsável, rota, observação, itens, lotes, fabricação, validade, quantidades e distribuições. Os dados do produto confirmados em novos itens são preservados por snapshot; datas são preservadas nas variantes imutáveis. Relatórios históricos e CSVs existentes também mostram as datas de origem/destino. Registros efetivados e cancelados permanecem no mesmo histórico.

## Cancelamento e estorno

`POST /api/v1/movements/:id/cancellation`

Movimentações efetivadas elegíveis mostram a ação `Cancelar movimentação` para usuários com `movements.cancel`. O fluxo possui três momentos:

1. informar motivo obrigatório;
2. visualizar o impacto por produto, lote, validade, local e quantidade;
3. confirmar o estorno integral.

O backend revalida o saldo sob transação e bloqueios. Se uma parcela necessária já tiver sido consumida, nada é alterado. Em sucesso, a listagem e o detalhe passam a mostrar `CANCELADA`, usuário, data/hora e motivo, sem apagar os dados originais.

## Relatório de movimentações

```text
GET             /api/v1/reports/movements
```

A interface `Relatórios > Movimentações` consulta período, tipo, produto, lote e status. Exibe os resultados paginados em cards no mobile e tabela no desktop, além dos totais entregues pela API, sem recalculá-los no navegador. Possui estados de carregamento, vazio e erro e permite limpar todos os filtros. O acesso exige `movements.read`.

Os endpoints de exportação existentes no backend ainda não possuem tela. Dashboard também não faz parte desta interface.

## Relatório de revisões

`GET /api/v1/reports/reviews` aceita período, produto, lote, classificação/destino e paginação. Retorna as distribuições de revisões efetivadas compatíveis, a quantidade total revisada separada por unidade e os totais de todos os destinos configurados para revisão — inicialmente Lata Boa, Varejo e TUF. Classificações sem quantidade válida são retornadas com total zero nas unidades presentes no resultado; revisões canceladas não entram nos resultados nem nos totais.

A interface `Relatórios > Revisões` apresenta esses totais sem recalculá-los, filtros combináveis, resultados paginados em cards no mobile e tabela no desktop, estados de carregamento, vazio e erro e ação para limpar filtros. Reutiliza `movements.read` e não oferece exportação nem dashboard.

## Relatório de estoque e validades

`GET /api/v1/reports/stock` retorna somente posições atuais com saldo positivo, incluindo produto, lote, local/classificação, quantidade, fabricação e validade. Aceita filtros de produto, lote, local e situação da validade. A situação é calculada em relação à data de referência e à janela configurada, resultando em `VALIDO`, `PROXIMO_VENCIMENTO` ou `VENCIDO`; fabricação e validade trafegam como data civil `YYYY-MM-DD`.

A interface `Relatórios > Estoque e validades` apresenta saldo, lote, fabricação, validade e situação, com destaque visual simples para cada estado. Possui os mesmos filtros, paginação da API, estados de carregamento, vazio e erro e ação para limpar filtros. O acesso exige `stock-positions.read`; exportação não faz parte desta interface.

## Dashboard operacional

A Home apresenta os saldos atuais de Revisar, Lata Boa, Varejo e TUF, a quantidade de posições vencidas e próximas do vencimento e as cinco movimentações mais recentes. Os dados são obtidos dos relatórios de estoque e do histórico de movimentações, respeitando as permissões existentes e sem recalcular regras de validade ou saldo no navegador.

Os atalhos operacionais levam diretamente a Entrada, Saída, Revisão, Transferência e consulta de Estoque. A visualização usa cards no mobile e tabela responsiva para a atividade recente, sem gráficos, exportações ou indicadores de BI.

## Experiência de uso

- Home com atalhos somente para funções disponíveis ao usuário.
- Tela compacta de operações no mobile.
- Barra inferior no celular e sidebar no desktop.
- Cards responsivos, filtros recolhíveis e painéis de detalhe.
- Feedback padronizado de loading, vazio, sucesso e erro.
- Confirmação antes de operações críticas e bloqueio dos botões durante envio.

## Ainda não implementado

Os itens fora do escopo atual estão consolidados no fim de [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md). Não apresente esses itens como disponíveis nem crie implementações fictícias.
