# Funcionalidades implementadas

Este documento descreve o comportamento disponível hoje. As regras completas e invariantes estão em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md).

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

Produtos possuem listagem, busca, filtros, detalhe, criação, edição e ativação/inativação. O detalhe permite listar, criar, editar e ativar/inativar conversões de unidade.

Rotas principais:

```text
GET/POST        /api/v1/products
GET/PATCH       /api/v1/products/:id
PATCH           /api/v1/products/:id/status
GET/POST        /api/v1/products/:productId/conversions
PATCH           /api/v1/product-conversions/:id
PATCH           /api/v1/product-conversions/:id/status
```

## Lotes

Lotes possuem listagem, filtros, detalhe, criação e edição. O formulário vincula o lote ao produto, calcula código `CONSERVADI` pela fabricação ou resolve a fabricação pelo código e exige validade manual.

```text
GET/POST        /api/v1/batches
GET/PATCH       /api/v1/batches/:id
POST            /api/v1/batches/resolve-code
```

O componente de criação rápida de lote é compartilhado pela entrada e pela transferência, sem duplicar a regra de codificação.

## Estoques, locais e saldo atual

Locais possuem listagem, filtros, detalhe, criação, edição e ativação/inativação. A interface trata estoque, subestoque e local externo com suas relações válidas.

```text
GET/POST        /api/v1/stocks
GET/PATCH       /api/v1/stocks/:id
PATCH           /api/v1/stocks/:id/status
GET             /api/v1/stock-positions
GET             /api/v1/stock-positions/:id
```

A tela Estoque atual filtra por produto, lote e local e mostra somente posições positivas. Oferece atalhos para transferir uma posição e, quando ela pertence à origem de revisão, realizar revisão.

## Entrada externa

`POST /api/v1/movements/external-entries`

O fluxo seleciona origem externa, destino controlado e um ou mais itens. Permite criar lote pelo componente central, mostra resumo antes da confirmação e protege reenvio por chave idempotente. Ao confirmar, incrementa o destino e abre o documento no histórico.

## Saída externa

`POST /api/v1/movements/external-exits`

O fluxo seleciona origem controlada, destino externo e itens derivados das posições positivas da origem. Mostra saldo e validade, rejeita duplicidade, valida quantidade e recarrega saldos após conflito. A confirmação reduz a origem sem criar posição externa.

## Transferência interna com lote de destino

`POST /api/v1/movements/internal-transfers`

O mesmo fluxo atende:

- mesmo lote para outro local;
- outro lote para outro local;
- outro lote no mesmo local.

Após escolher origem e quantidade, o usuário seleciona local e lote de destino. Pode manter o lote, selecionar outro lote do produto ou criar um novo pelo modal compartilhado. A tela mostra a rota completa antes de confirmar e bloqueia a combinação sem mudança real.

No histórico, cada item conserva:

```text
produto / lote de origem / local de origem
→ produto / lote de destino / local de destino
quantidade
```

## Revisar produtos

`POST /api/v1/movements/reviews`

A tela mostra apenas produto/lote com saldo em Revisar. O usuário pode incluir vários itens e distribuir cada quantidade entre um ou mais destinos permitidos. O formulário informa quanto falta, quanto excede ou se a distribuição está completa e bloqueia a confirmação inválida.

A revisão preserva obrigatoriamente produto, lote, fabricação e validade. Não oferece seleção nem criação de lote. O histórico apresenta todas as distribuições dentro do mesmo documento.

## Histórico de movimentações

```text
GET             /api/v1/movements
GET             /api/v1/movements/:id
```

A listagem filtra por período, tipo, origem, destino e produto. O detalhe apresenta identificador, tipo, estado, data/hora, responsável, rota, observação, itens, lotes, quantidades e distribuições. Registros efetivados e cancelados permanecem no mesmo histórico.

## Cancelamento e estorno

`POST /api/v1/movements/:id/cancellation`

Movimentações efetivadas elegíveis mostram a ação `Cancelar movimentação` para usuários com `movements.cancel`. O fluxo possui três momentos:

1. informar motivo obrigatório;
2. visualizar o impacto por produto, lote, local e quantidade;
3. confirmar o estorno integral.

O backend revalida o saldo sob transação e bloqueios. Se uma parcela necessária já tiver sido consumida, nada é alterado. Em sucesso, a listagem e o detalhe passam a mostrar `CANCELADA`, usuário, data/hora e motivo, sem apagar os dados originais.

## Experiência de uso

- Home com atalhos somente para funções disponíveis ao usuário.
- Tela compacta de operações no mobile.
- Barra inferior no celular e sidebar no desktop.
- Cards responsivos, filtros recolhíveis e painéis de detalhe.
- Feedback padronizado de loading, vazio, sucesso e erro.
- Confirmação antes de operações críticas e bloqueio dos botões durante envio.

## Ainda não implementado

Os itens fora do escopo atual estão consolidados no fim de [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md). Não apresente esses itens como disponíveis nem crie implementações fictícias.
