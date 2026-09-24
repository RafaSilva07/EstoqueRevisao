# Funcionalidades implementadas

Este documento descreve o comportamento disponível hoje. As regras completas e invariantes estão em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md).

## Navegação simplificada e Revisão operacional

Na branch `feat/navegacao-simplificada`, a Home e o menu lateral mostram destinos diretos conforme o perfil: **Movimentar produtos**, **Envios e recebimentos**, **Estoque e validades**, **Histórico**, **Produtos** e, no PCP, **Fila do PCP**. Ações administrativas e relatórios de totais ficam em **Menu e conta**. Os menus intermediários de estoque, histórico, solicitações e PCP não aparecem mais.

O cadastro de usuários oferece `Revisão operacional` (`REVISAO`), no setor Revisão: solicitações, revisão, transferência, consultas e gestão de produtos, sem ADMIN. Entrada/saída direta, cancelamento de movimentações/revisões e alteração dos demais cadastros continuam exclusivos do ADMIN e bloqueados pela API. Usuários existentes não são reclassificados automaticamente. Para atribuir acesso operacional, selecione esse perfil sem marcar Administrador.

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

Usuários `ADMIN` possuem no cabeçalho da aplicação o seletor **Modo operacional**, com as opções Admin, Revisão, Produção, Expedição e PCP. O login administrativo inicia em **Admin**, modo completo que usa a Revisão como contexto físico e reúne as ações exclusivas de administração. Ao selecionar um modo operacional, a interface e a API aplicam o escopo desse perfil: gestão de produtos continua disponível, enquanto gestão de usuários, entrada/saída direta, estorno e alteração dos demais cadastros ficam restritos ao modo Admin. A identidade real do administrador continua registrada no histórico e na auditoria.

## Gerenciar usuários (ADMIN)

No modo **Admin**, o menu **Menu > Gerenciar usuários** permite buscar/listar com paginação, ver detalhes, criar, editar e excluir por inativação. A gestão de usuários não aparece nem é autorizada nos modos operacionais Revisão, Produção, Expedição e PCP.

O formulário reutiliza login, senha, setor e perfis existentes. Edição permite trocar a senha e reativar contas. Exclusão exige confirmação, bloqueia o acesso e preserva o histórico. Alterações encerram as sessões da conta; editar a própria conta retorna ao login. A API protege o acesso administrativo, a própria conta e o último administrador ativo. Regras em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md#administração-de-usuários).

```text
GET/POST        /api/v1/users
GET             /api/v1/users/roles
GET/PATCH/DELETE /api/v1/users/:id
```

Listagem aceita `search`, `page` e `limit`. `DELETE` inativa, sem excluir fisicamente. Respostas e auditoria não expõem credenciais. Os formulários mantêm campos de data limitados à largura disponível, inclusive dentro dos campos operacionais de lote no mobile.

## Cadastro de produtos

O cadastro mantém código, descrição, unidade, prazo de validade e, para fardos/caixas, quantidade e alternativas unitárias. Produtos do tipo `UN` também exigem **Gramatura da unidade (g)**, em gramas inteiras e positivas. O campo aparece somente para `UN`, é retornado nas consultas e registrado na auditoria; `FD` e `CX` mantêm a gramatura nula e não recebem cálculo de peso total. Cadastros unitários anteriores permanecem sem valor inventado e precisam ter a gramatura preenchida ao serem editados.

Todos os perfis podem cadastrar, editar, excluir por inativação e reativar produtos. O administrador pode abrir o **Log de produtos** para consultar autor, data e valores anteriores/novos das alterações. No desktop, os cards de envios e histórico ocupam colunas compactas em vez de esticar um único registro por toda a largura.

## Envios entre setores

A Revisão acessa **Envios e recebimentos** pela Home ou menu; Produção/Expedição recebem uma interface restrita ao próprio setor. A tela operacional separa **Para receber** de **Meus envios em aberto**; concluídos, recusados e cancelados são encontrados no **Histórico** unificado. O início destaca pendências e decisões recentes dos próprios envios; a indicação é atualizada a cada 30 segundos, sem interromper formulários/decisões abertos.

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

Listagem: `view=pending|sent|history|updates|open`, `status`, `page` e `limit`; `sent` mostra apenas envios ainda em andamento criados pelo usuário, `open` reúne envios aguardando recebimento ou em separação dos quais o setor participa, e `updates` retorna decisões recentes dos próprios envios. Consultas respeitam o setor. `available-positions` é exclusivo da Revisão, exige `productId` e ao menos `batchCode` ou `manufacturingDate`, e retorna somente saldo positivo de produto/local ativos. Criação recebe multipart com `payload` contendo `requestKey`, `destinationSector` e `items`, além de um arquivo `photos` por item na mesma ordem; origem é inferida do usuário. Itens externos recebem `productId/lot/quantity` (ou variante existente via `batchId`); itens da Revisão recebem `productId/batchId/stockLocationId/quantity`. Confirmação aceita `confirmedExpirationKeys` quando houver divergência apresentada; recusa exige `reason`.

Somente a confirmação gera entradas/saídas nos relatórios existentes. Nas saídas da Revisão, o saldo já fica indisponível desde a criação e aparece como **em trânsito** nos envios pendentes; recusa ou cancelamento pré-recebimento restaura o disponível. O autor pode cancelar enquanto o envio estiver aguardando recebimento, com motivo obrigatório; o envio permanece no histórico como `CANCELADO`, e administradores visualizam a auditoria no detalhe. Estoque/Home/relatório de validades mostram saldo disponível. Movimentos vinculados exibem o identificador do envio na observação e não oferecem cancelamento isolado; devoluções são novos envios. Regras completas em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md#envios-entre-setores).

## Produtos e conversões

Produtos possuem listagem, busca, detalhe, criação, edição e exclusão por inativação em todos os perfis; cadastros inativos podem ser reativados. O formulário identifica código, descrição, tipo de unidade e prazo padrão em anos; o prazo apenas sugere a validade de novas operações. Conversões de unidade conservam suas permissões próprias. A auditoria de produtos pode ser consultada pelo administrador em `GET /api/v1/products/audit-history`.

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

Não existe mais tela/menu de cadastro de lotes, modal de criação antecipada nem endpoints de criação/edição separados. O componente `OperationalLotFields` é compartilhado por entrada, transferência e envios externos: preencha lote **ou** fabricação, saia do campo para completar o correspondente e revise a validade sugerida/editável. A fabricação aceita somente a data atual ou anterior; o backend aplica a mesma validação quando a data é derivada do lote CONSERVADI.

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

A entrada principal **Estoque e validades** consulta posições com saldo positivo, fabricação, validade, situação e totais, com filtros de produto, lote, local e vencimento. Cada validade mantém seu próprio saldo; os totais da Home e da consulta continuam usando essas posições reais.

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

## Configurações e separação imediata

Administradores no modo `ADMIN` acessam **Configurações** para definir o prazo de separação (5 a 1440 minutos, inicialmente 180) e selecionar um ou mais destinos internos cadastrados para a revisão. O formulário de revisão consulta essa configuração e monta os campos dinamicamente, mantendo total, distribuído e restante e bloqueando diferenças.

No recebimento Expedição → Revisão, **Sim, separar agora** coloca o envio em `EM_SEPARACAO`, exibe o prazo e permite salvar as quantidades de retorno como rascunho. A Expedição acompanha o estado sem ação. A conclusão exige foto em cada item retornado, credita somente a quantidade líquida e cria um envio de retorno ligado ao original. O retorno aguarda decisão da Expedição e é marcado como execução PCP não necessária. Se o prazo vencer, o acesso seguinte consolida integralmente o recebimento sem retorno.

Endpoints envolvidos:

```text
GET   /api/v1/settings/operational
GET   /api/v1/settings
PATCH /api/v1/settings/immediate-separation
PATCH /api/v1/settings/review-destinations
PATCH /api/v1/shipments/:id/separation-draft
POST  /api/v1/shipments/:id/separation-completion
```

## Histórico de movimentações

```text
GET             /api/v1/movements
GET             /api/v1/movements/:id
GET             /api/v1/history
```

A entrada principal **Histórico** reúne, em uma lista paginada, envios e movimentações diretas sem duplicar o envio confirmado pelo movimento de estoque que ele gerou. Filtra por etapa (em andamento, aguardando PCP, finalizada ou encerrada), origem do registro, tipo, período e código/produto; ordena por data. O setor vê apenas seus envios; Revisão também vê operações diretas; PCP vê as movimentações de sua competência. Os cards abrem os detalhes existentes. `GET /api/v1/history` fornece essa consulta somente de leitura. Relatórios de totais/CSV continuam acessíveis em **Menu e conta**.

O detalhe de movimentação apresenta identificador, tipo, estados operacional e PCP, data/hora, responsável, rota, observação, itens, lotes, fabricação, validade, quantidades e distribuições. Os dados do produto confirmados em novos itens são preservados por snapshot; datas são preservadas nas variantes imutáveis. Relatórios históricos e CSVs existentes também mostram as datas de origem/destino. Registros efetivados e cancelados permanecem consultáveis.

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

A interface **Menu e conta > Relatórios de movimentações** consulta período, tipo, produto, lote e status. Exibe os resultados paginados em cards no mobile e tabela no desktop, além dos totais entregues pela API, sem recalculá-los no navegador. Possui estados de carregamento, vazio e erro e permite limpar todos os filtros. O acesso exige `movements.read`.

Os endpoints de exportação existentes no backend ainda não possuem tela. Dashboard também não faz parte desta interface.

## Relatório de revisões

`GET /api/v1/reports/reviews` aceita período, produto, lote, classificação/destino e paginação. Retorna as distribuições de revisões efetivadas compatíveis, a quantidade total revisada separada por unidade e os totais de todos os destinos configurados para revisão — inicialmente Lata Boa, Varejo e TUF. Classificações sem quantidade válida são retornadas com total zero nas unidades presentes no resultado; revisões canceladas não entram nos resultados nem nos totais.

A interface **Menu e conta > Relatórios de revisões** apresenta esses totais sem recalculá-los, filtros combináveis, resultados paginados em cards no mobile e tabela no desktop, estados de carregamento, vazio e erro e ação para limpar filtros. Reutiliza `movements.read` e não oferece exportação nem dashboard.

Revisões com desmontagem mostram o código unitário e as quantidades de saída em UN. Movimentações mostram separadamente as embalagens consumidas e as unidades produzidas; o CSV já existente também inclui o produto resultante e a quantidade produzida.

## Relatório de estoque e validades

`GET /api/v1/reports/stock` retorna somente posições atuais com saldo positivo, incluindo produto, lote, local/classificação, quantidade, fabricação e validade. Aceita filtros de produto, lote, local e situação da validade. A situação é calculada em relação à data de referência e à janela configurada, resultando em `VALIDO`, `PROXIMO_VENCIMENTO` ou `VENCIDO`; fabricação e validade trafegam como data civil `YYYY-MM-DD`.

A interface principal **Estoque e validades** apresenta saldo, lote, fabricação, validade e situação, com destaque visual simples para cada estado. Possui os mesmos filtros, paginação da API, estados de carregamento, vazio e erro e ação para limpar filtros. O acesso exige `stock-positions.read`; exportação não faz parte desta interface.

## Dashboard operacional

Todos os cards das listas da Home abrem um resumo sem navegação imediata. Reutiliza Modal acessível, itens e visualizador privado de fotos; mostra código, rota, responsável, estados, datas, observações e, para envios, separação e vínculos de retorno. Fechar/ESC retornam à Home. Ações encaminham ao registro específico na página existente: confirmar recebimento/retorno, continuar separação, ver retorno, executar PCP ou ver detalhes completos. O resumo não executa operações.

`codigoMovimentacao` aparece desde a criação do envio e permanece igual no recebimento, separação, confirmação/recusa, movimentação de estoque, PCP e histórico. Busque o código em **Histórico**, na fila do PCP ou nos envios em aberto. `GET /history` aceita busca parcial por código/produto; `GET /movements` e `GET /shipments` aceitam `codigoMovimentacao`; `GET /pcp/movements` aceita o código no `search`. Transferências não recebem código nem usam UUID como substituto público.

A Home exibe, antes dos atalhos, um ponto de atenção quando o setor ativo possui solicitações aguardando seu aceite ou envios em separação. Os totais vêm das consultas de envios, com escopo do setor e atualização ao entrar ou alternar o modo operacional.

Abaixo dos menus e botões ficam, conforme as permissões: envios abertos dos quais o setor participa; movimentações concluídas no estoque aguardando PCP; e uma lista única das últimas operações **finalizadas**. A última lista usa o mesmo estado do Histórico e só inclui confirmação/efetivação sem ação restante do PCP. Recusas e cancelamentos ficam em **Encerradas**, não em finalizadas. A apresentação é mobile-first em cards clicáveis e não recalcula estados no navegador.

## Experiência de uso

Seletores de lote/posição nos envios, saídas, transferências e revisões usam uma lista contida no formulário, com quebra de linha e rolagem vertical. Textos usam `prod:` e `val:` para fabricação e validade, preservando as datas completas e o saldo. A seleção funciona por toque, mouse e teclado; Escape fecha a lista antes de fechar o modal.

Todos os modais de **Adicionar produto** reutilizam o seletor pesquisável por código e descrição usado nos envios externos. Ao abrir um dos campos, a lista mostra os produtos disponíveis e é filtrada enquanto o operador digita; escolher por código preenche a descrição e escolher por descrição preenche o código. Entrada mostra produtos ativos do cadastro, enquanto saída, transferência e revisão limitam a lista aos produtos com posição disponível na origem correspondente.

Envios, entradas, saídas, transferências e revisões apresentam a lista e o botão **Adicionar produto**. Os campos ficam em modal central com rolagem interna: salvar inclui o item e fecha; cancelar descarta somente o rascunho. Na revisão, quantidade, código resultante e distribuições são preenchidos antes de salvar, com edição posterior do item ainda não confirmado. Observação geral e confirmação final permanecem na operação. Reutilizados os campos e validações existentes, sem alteração de saldos ou regras transacionais. Campos com texto de ajuda são alinhados pelo topo para não deslocar os controles vizinhos.

- Home com atalhos somente para funções disponíveis ao usuário.
- Tela compacta de operações no mobile.
- Barra inferior no celular e sidebar no desktop.
- Cards responsivos, filtros recolhíveis e painéis de detalhe.
- Feedback padronizado de loading, vazio, sucesso e erro.
- Confirmação antes de operações críticas e bloqueio dos botões durante envio.

## Perfil e fila PCP

Usuários do setor e perfil exclusivo `PCP` entram em uma interface própria, sem menus de criação, edição, cancelamento ou aceite. Administradores acessam a mesma interface ao selecionar PCP no modo operacional. A fila inicia em movimentações concluídas e pendentes para o PCP, das mais antigas para as mais novas, e permite combinar período, estado operacional, estado PCP, tipo, origem, destino, produto/lote e ordenação. Os resultados são paginados no backend; a linha/card inteiro abre o detalhe em modal.

O detalhe apresenta rota, responsável, observações, itens, lotes, fabricação, validade, distribuições, eventos auditáveis e fotos privadas de envios confirmados. Uma movimentação efetivada permanece efetivada no estoque; inicialmente ela está pendente no PCP e, após **Marcar como executada**, somente o estado PCP muda para executada. O modal aceita observação opcional, impede duplo envio e atualiza a fila após sucesso. A API revalida o estado sob transação e lock, grava usuário/data/observação em campos próprios e não altera dados operacionais.

## Ainda não implementado

Os itens fora do escopo atual estão consolidados no fim de [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md). Não apresente esses itens como disponíveis nem crie implementações fictícias.
