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

Usuários `ADMIN` possuem no cabeçalho da aplicação o seletor **Modo operacional**, que alterna entre Revisão, Produção e Expedição sem exigir outro login. Ao escolher um setor externo, a interface passa para o portal restrito de envios daquele setor; ao retornar para Revisão, recupera o painel e as rotinas internas. O backend valida a função administrativa e aplica as restrições do setor escolhido em cada requisição, mantendo o administrador real como responsável e autor na auditoria.

## Gerenciar usuários (ADMIN)

O menu **Administração > Gerenciar usuários** no desktop e **Menu > Gerenciar usuários** no celular permite buscar/listar com paginação, ver detalhes, criar, editar e excluir por inativação. Nos modos Produção/Expedição, o administrador também dispõe do botão **Gerenciar usuários** acima dos envios.

O formulário reutiliza login, senha, setor e perfis existentes. Edição permite trocar a senha e reativar contas. Exclusão exige confirmação, bloqueia o acesso e preserva o histórico. Alterações encerram as sessões da conta; editar a própria conta retorna ao login. A API protege o acesso administrativo, a própria conta e o último administrador ativo. Regras em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md#administração-de-usuários).

```text
GET/POST        /api/v1/users
GET             /api/v1/users/roles
GET/PATCH/DELETE /api/v1/users/:id
```

Listagem aceita `search`, `page` e `limit`. `DELETE` inativa, sem excluir fisicamente. Respostas e auditoria não expõem credenciais. Os formulários mantêm campos de data limitados à largura disponível, inclusive dentro dos campos operacionais de lote no mobile.

## Cadastro de produtos

O cadastro mantém código, descrição, unidade, prazo de validade e, para fardos/caixas, quantidade e alternativas unitárias. Produtos do tipo `UN` também exigem **Gramatura da unidade (g)**, em gramas inteiras e positivas. O campo aparece somente para `UN`, é retornado nas consultas e registrado na auditoria; `FD` e `CX` mantêm a gramatura nula e não recebem cálculo de peso total. Cadastros unitários anteriores permanecem sem valor inventado e precisam ter a gramatura preenchida ao serem editados.

## Envios entre setores

A Revisão acessa **Envios entre setores** pelo início, operações ou menu; Produção/Expedição recebem uma interface restrita ao próprio setor. As três consultas são **Aguardando minha ação**, **Enviados por mim** e **Histórico**, com paginação, cards e detalhes. O início destaca pendências e decisões recentes dos próprios envios; a indicação é atualizada a cada 30 segundos, sem interromper formulários/decisões abertos.

Novo envio aceita vários itens e exige conferência do resumo. A seleção de produto possui campos independentes de código e descrição com sugestões filtradas durante a digitação; escolher em qualquer campo identifica o produto único e preenche o outro automaticamente, sem uma terceira seleção. A lista também pode ser aberta pelos botões dos campos e refinada por teclado.

Usuários externos reutilizam o produto selecionado e os campos CONSERVADI/fabricação/validade. Na saída da Revisão, após selecionar o produto, o operador informa o lote ou a fabricação; o par é completado imediatamente pelo resolvedor central de lotes e fica visível antes da escolha da posição. A consulta é paginada no backend, aceita os filtros combinados e apresenta primeiro as posições de Lata Boa, seguidas dos demais locais por nome; lote, fabricação, validade, local e saldo continuam visíveis para distinguir a posição exata. A Revisão pode incluir posições de locais diferentes no mesmo envio.

Em todos os sentidos de envio, cada produto pode receber uma observação opcional e o envio pode receber uma observação geral. Os textos são conferidos antes do envio, ficam disponíveis ao destinatário e no histórico e não podem ser editados após a criação. A observação geral também acompanha a movimentação gerada quando o recebimento é confirmado.

Cada produto do envio exige uma foto própria. O botão **Tirar foto** abre a câmera dentro da aplicação, prioriza a câmera traseira e permite capturar, refazer e usar a imagem. A lista identifica itens completos ou sem foto, aceita substituição antes do envio e bloqueia a conferência enquanto faltar evidência. A captura é reduzida para até aproximadamente 1600 px e enviada como JPEG; o backend também aceita PNG/WebP de até 5 MB e aplica a validação definitiva.

Destinatário e remetente podem visualizar a miniatura e abrir a foto em um visualizador próprio, inclusive após confirmação ou recusa. O visualizador permite zoom de 100% a 400%, roda do mouse, duplo clique, restauração e deslocamento por arraste com mouse ou toque. Os cards de produto mantêm código/descrição, quantidade, lote, datas, observação e evidência em grupos alinhados tanto no resumo quanto na decisão de recebimento. A leitura passa por `GET /api/v1/shipments/:id/items/:itemId/photo`, com autenticação e escopo do setor. Itens históricos criados antes desta regra continuam visíveis com a indicação de ausência da foto.

Não há edição posterior: destinatário confirma ou recusa com motivo e responsável/data registrados. Recusas oferecem **Criar novo envio**, sem alterar o documento recusado. Loading, erros, sucesso e bloqueio de duplo envio seguem os componentes existentes.

```text
GET/POST        /api/v1/shipments
GET             /api/v1/shipments/available-positions
GET             /api/v1/shipments/:id
POST            /api/v1/shipments/resolve-lot
POST            /api/v1/shipments/:id/confirmation
POST            /api/v1/shipments/:id/refusal
```

Listagem: `view=pending|sent|history|updates`, `page` e `limit`; `updates` retorna decisões recentes dos próprios envios para a indicação da Home. Consultas respeitam o setor. `available-positions` é exclusivo da Revisão, exige `productId` e ao menos `batchCode` ou `manufacturingDate`, e retorna somente saldo positivo de produto/local ativos. Criação recebe multipart com `payload` contendo `requestKey`, `destinationSector` e `items`, além de um arquivo `photos` por item na mesma ordem; origem é inferida do usuário. Itens externos recebem `productId/lot/quantity` (ou variante existente via `batchId`); itens da Revisão recebem `productId/batchId/stockLocationId/quantity`. Confirmação aceita `confirmedExpirationKeys` quando houver divergência apresentada; recusa exige `reason`.

Somente a confirmação gera entradas/saídas nos relatórios existentes. Nas saídas da Revisão, o saldo já fica indisponível desde a criação e aparece como **em trânsito** nos envios pendentes; recusa restaura o disponível. Estoque/Home/relatório de validades mostram saldo disponível. Movimentos vinculados exibem o identificador do envio na observação e não oferecem cancelamento isolado; devoluções são novos envios. Regras completas em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md#envios-entre-setores).

## Produtos e conversões

Produtos possuem listagem, busca, filtros, detalhe, criação, edição e ativação/inativação. O formulário identifica código, descrição, tipo de unidade e prazo padrão em anos; o prazo apenas sugere a validade de novas operações. O detalhe permite listar, criar, editar e ativar/inativar conversões de unidade.

O tipo de unidade é uma seleção: Unidade (UN), Fardo (FD) ou Caixa (CX). Embalagens exigem **unidades por embalagem** e a vinculação de um ou mais códigos unitários existentes, pesquisáveis por código/descrição. A API recebe `unitsPerPackage` e `unitProductIds`; o filtro `defaultUnit=UN` restringe a busca às opções unitárias. As opções e o fator também aparecem nos detalhes. Valores antigos são preservados; configurações ausentes não são presumidas.

A consulta de produtos aceita `searchField=code|name` quando a interface precisa restringir as sugestões a um campo. Sem esse parâmetro, a busca geral continua considerando código e descrição.

Cadastro e edição abrem em modal. Ao digitar o código, um aviso abaixo do campo identifica duplicidade, inclusive em produto inativo, e impede salvar enquanto ela estiver presente. A consulta usa o filtro exato `code` de `GET /products`, sem diferenciar maiúsculas/minúsculas; respostas antigas da digitação são descartadas. Falhas de consulta são informadas e a API continua validando a unicidade ao salvar.

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

Não existe mais tela/menu de cadastro de lotes, modal de criação antecipada nem endpoints de criação/edição separados. O componente `OperationalLotFields` é compartilhado por entrada, transferência e envios externos: preencha lote **ou** fabricação, saia do campo para completar o correspondente e revise a validade sugerida/editável.

```text
POST            /api/v1/movements/resolve-lot
GET             /api/v1/batches
GET             /api/v1/batches/:id
```

`resolve-lot` exige `movements.create` e apenas valida/calcula, sem gravar. As consultas de lotes são somente leitura das variantes existentes, com `batches.read`. O cadastro operacional acontece na transação de criação da operação (incluindo envios externos pendentes, ainda sem saldo).

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

Para Produção/Expedição, use Envios. A entrada direta rejeita esses locais no backend e os omite na seleção. Para outras origens, o fluxo seleciona origem externa, destino controlado e um ou mais itens. Recebe `items[].lot` com código e/ou fabricação e validade, sem cadastro prévio, mostra produto/lote/datas/quantidade no resumo antes da confirmação e protege reenvio por chave idempotente. Ao confirmar, incrementa o destino e abre o documento no histórico.

## Saída externa

`POST /api/v1/movements/external-exits`

Para Produção/Expedição, use Envios. A saída direta rejeita esses locais no backend e os omite na seleção. Para outros destinos, o fluxo seleciona origem controlada, destino externo e itens derivados das posições positivas da origem. Mostra saldo e validade, rejeita duplicidade, valida quantidade e recarrega saldos após conflito. A confirmação reduz a origem sem criar posição externa.

## Transferência interna com lote de destino

`POST /api/v1/movements/internal-transfers`

O mesmo fluxo atende:

- mesmo lote para outro local;
- outro lote para outro local;
- outro lote no mesmo local.

Após escolher os locais, o usuário adiciona a posição de origem e a quantidade no modal, mantendo lote/validade ou informando os dados de destino (`items[].destinationLot`). Combinações existentes são reutilizadas automaticamente. A API continua aceitando `destinationBatchId` para uma variante existente do mesmo produto; não se enviam os dois formatos juntos. A tela mostra a rota completa antes de confirmar e bloqueia a combinação sem mudança real.

No histórico, cada item conserva:

```text
produto / lote, fabricação e validade de origem / local de origem
→ produto / lote, fabricação e validade de destino / local de destino
quantidade
```

## Revisar produtos

`POST /api/v1/movements/reviews`

A tela mostra apenas produto/lote com saldo em Revisar. O usuário pode incluir vários itens e distribuir cada quantidade entre um ou mais destinos permitidos. O formulário informa quanto falta, quanto excede ou se a distribuição está completa e bloqueia a confirmação inválida.

A revisão de UN preserva o produto. Para FD/CX, o operador informa quantas embalagens revisar, escolhe **um código unitário resultante por item** entre os vinculados e distribui o total convertido entre os destinos. Exemplo: 10 CX × 12 = 120 UN. O formulário e a confirmação mostram origem, resultado e fator; a API revalida `outputProductId`, `expectedUnitsPerPackage` e a soma das distribuições, debita embalagens e credita unidades atomicamente.

Lote, fabricação e validade são preservados; não há edição desses campos na revisão. O produto unitário recebe uma referência interna equivalente, reutilizando a validação e a confirmação de validade divergente. O histórico mostra a transformação e todas as distribuições em uma única operação. O estorno retira as unidades e devolve as embalagens originais; se faltarem unidades no destino, nada é alterado. Revisões antigas permanecem com o comportamento original registrado.

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

Revisões com desmontagem mostram o código unitário e as quantidades de saída em UN. Movimentações mostram separadamente as embalagens consumidas e as unidades produzidas; o CSV já existente também inclui o produto resultante e a quantidade produzida.

## Relatório de estoque e validades

`GET /api/v1/reports/stock` retorna somente posições atuais com saldo positivo, incluindo produto, lote, local/classificação, quantidade, fabricação e validade. Aceita filtros de produto, lote, local e situação da validade. A situação é calculada em relação à data de referência e à janela configurada, resultando em `VALIDO`, `PROXIMO_VENCIMENTO` ou `VENCIDO`; fabricação e validade trafegam como data civil `YYYY-MM-DD`.

A interface `Relatórios > Estoque e validades` apresenta saldo, lote, fabricação, validade e situação, com destaque visual simples para cada estado. Possui os mesmos filtros, paginação da API, estados de carregamento, vazio e erro e ação para limpar filtros. O acesso exige `stock-positions.read`; exportação não faz parte desta interface.

## Dashboard operacional

A Home apresenta os saldos atuais de Revisar, Lata Boa, Varejo e TUF, a quantidade de posições vencidas e próximas do vencimento e as cinco movimentações mais recentes. Os dados são obtidos dos relatórios de estoque e do histórico de movimentações, respeitando as permissões existentes e sem recalcular regras de validade ou saldo no navegador.

Antes dos indicadores, a Home destaca envios aguardando recebimento e decisões recentes. Os atalhos operacionais levam diretamente a Entrada, Saída, Revisão, Transferência e consulta de Estoque. A visualização usa cards no mobile e tabela responsiva para a atividade recente, sem gráficos, exportações ou indicadores de BI.

## Experiência de uso

Seletores de lote/posição nos envios, saídas, transferências e revisões usam uma lista contida no formulário, com quebra de linha e rolagem vertical. Textos usam `prod:` e `val:` para fabricação e validade, preservando as datas completas e o saldo. A seleção funciona por toque, mouse e teclado; Escape fecha a lista antes de fechar o modal.

Envios, entradas, saídas, transferências e revisões apresentam a lista e o botão **Adicionar produto**. Os campos ficam em modal central com rolagem interna: salvar inclui o item e fecha; cancelar descarta somente o rascunho. Na revisão, quantidade, código resultante e distribuições são preenchidos antes de salvar, com edição posterior do item ainda não confirmado. Observação geral e confirmação final permanecem na operação. Reutilizados os campos e validações existentes, sem alteração de saldos ou regras transacionais. Campos com texto de ajuda são alinhados pelo topo para não deslocar os controles vizinhos.

- Home com atalhos somente para funções disponíveis ao usuário.
- Tela compacta de operações no mobile.
- Barra inferior no celular e sidebar no desktop.
- Cards responsivos, filtros recolhíveis e painéis de detalhe.
- Feedback padronizado de loading, vazio, sucesso e erro.
- Confirmação antes de operações críticas e bloqueio dos botões durante envio.

## Perfil e fila PCP

Usuários com o perfil exclusivo `PCP` entram em uma interface própria, sem menus de criação, edição, cancelamento ou aceite. A fila inicia em movimentações concluídas e pendentes para o PCP, das mais antigas para as mais novas, e permite combinar período, estado operacional, estado PCP, tipo, origem, destino, produto/lote e ordenação. Os resultados são paginados no backend e usam cards responsivos no celular por meio da tabela adaptativa existente.

O detalhe apresenta rota, responsável, observações, itens, lotes, fabricação, validade, distribuições, eventos auditáveis e fotos privadas de envios confirmados. Uma movimentação concluída e pendente mostra **Marcar como executada**; o modal aceita observação opcional, impede duplo envio e atualiza a fila após sucesso. A API revalida o estado sob transação e lock, grava usuário/data/observação em campos próprios e não altera dados operacionais.

## Ainda não implementado

Os itens fora do escopo atual estão consolidados no fim de [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md). Não apresente esses itens como disponíveis nem crie implementações fictícias.
