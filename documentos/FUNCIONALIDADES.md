# Funcionalidades implementadas

Este documento descreve o comportamento disponível hoje. As regras completas e invariantes estão em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md).

## Navegação simplificada e Revisão operacional

Na branch `feat/navegacao-simplificada`, a Home e o menu lateral mostram destinos diretos conforme o perfil: **Movimentar produtos**, **Envios e recebimentos**, **Estoque e validades**, **Histórico**, **Produtos** e, no PCP, **Fila do PCP**. Ações administrativas e relatórios de totais ficam em **Menu e conta**. Os menus intermediários de estoque, histórico, solicitações e PCP não aparecem mais.

O preset inicial `Revisão operacional` (`REVISAO`) oferece solicitações, revisão, transferência, consultas e gestão de produtos, sem ADMIN. O admin geral pode ajustar as funcionalidades do preset ou de cada usuário, incluindo entrada/saída direta e estorno no setor Revisão. Usuários existentes mantêm sua base até atualização explícita.

Todas as entradas, saídas, transferências e distribuições de revisão aceitam somente quantidades inteiras positivas. O frontend orienta o preenchimento e o backend aplica a validação definitiva antes de alterar saldos.

## Rascunhos de formulários

Os formulários operacionais e administrativos possuem salvamento automático e botão **Salvar rascunho**, com recuperação ao reabrir o mesmo fluxo, inclusive em outro computador/celular com a mesma conta, ambiente e modo. Itens, campos incompletos e fotos são sincronizados na conta; o navegador mantém uma cópia de segurança para falhas de conexão. Sair oferece **Salvar rascunho e sair**, **Descartar e sair** ou **Continuar preenchendo**; navegar, trocar modo e sair da conta usam a mesma proteção. Conflitos entre dispositivos não sobrescrevem o preenchimento local: **Carregar versão da conta** exige confirmação. CRUD de produtos e consultas permanecem sem rascunhos. Senhas devem ser digitadas novamente. Limitações e efeito sobre separação em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md#rascunhos-de-preenchimento).

API autenticada: `GET/POST/DELETE /api/v1/form-drafts/:key?mode=...` e `GET /api/v1/form-drafts/:key/photos/:ordinal?mode=...&version=...`. Escrita multipart contém payload/arquivos e versão; descarte exige a versão atual. Não há rascunhos compartilhados entre usuários.

## Acesso e sessão

| Método | Rota | Função |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Autentica e inicia sessão. |
| `POST` | `/api/v1/auth/refresh` | Rotaciona o refresh token e renova o acesso. |
| `POST` | `/api/v1/auth/logout` | Revoga a sessão. |
| `GET` | `/api/v1/auth/me` | Retorna o usuário autenticado. |
| `POST` | `/api/v1/presence/heartbeat` | Atualiza a presença da sessão e do modo operacional ativo. |
| `GET` | `/api/v1/presence/pcp` | Lista outros usuários online no modo PCP para aviso operacional. |
| `GET` | `/api/v1/presence` | Lista usuários online para administradores. |
| `GET` | `/api/v1/health` | Verifica API e PostgreSQL; é público. |

O frontend possui login, restauração da sessão pelo cookie HttpOnly e navegação condicionada às permissões.

A sessão dura até 14 horas desde o login, com renovação automática do acesso curto e sincronização entre abas em navegadores com Web Locks. O cookie se adapta ao localhost e aos ambientes HTTPS publicados; login, renovação e saída aceitam somente a origem configurada do frontend. Configuração em [COMO_RODAR.md](./COMO_RODAR.md#sessão-nos-ambientes-publicados).

Enquanto a aba está visível, a presença é atualizada a cada 20 segundos e também quando o usuário volta a ela. No modo PCP, um aviso no início da tela mostra o nome de outros colegas PCP online e se atualiza quando alguém entra ou sai. Administradores gerais e de área acessam **Usuários online** pelo menu lateral para consultar todos os usuários ativos e seus modos operacionais recentes. “Online” significa atividade recebida nos últimos 60 segundos; a indicação não reserva registros nem bloqueia operações.

A interface usa transições curtas em botões, cartões, campos, filtros e diálogos, com rolagem suave. Quando o dispositivo solicita redução de movimento, as animações e a rolagem suave são desativadas.

Usuários `ADMIN` possuem no cabeçalho o seletor **Modo operacional**: Admin, Revisão, Produção, Expedição e PCP. O login inicia em **Admin**, com acesso completo e contexto físico da Revisão. Nos demais modos, interface e API limitam as permissões ao setor escolhido. Gestão de usuários, presets e configurações gerais continua exclusiva do modo Admin. A identidade real do administrador permanece no histórico e na auditoria.

Administradores de área usam o mesmo seletor limitado a **Revisão + Expedição** ou **Produção + PCP**, conforme o perfil atribuído pelo admin geral. Iniciam no setor cadastrado, podem operar nos dois modos com as permissões já existentes e não acessam o modo Admin nem a gestão de usuários.

## Gerenciar usuários (ADMIN)

No modo **Admin**, o menu **Menu > Gerenciar usuários** permite buscar/listar com paginação, ver detalhes, criar, editar e excluir por inativação. A gestão de usuários não aparece nem é autorizada nos modos operacionais Revisão, Produção, Expedição e PCP.

O formulário reutiliza login, senha, setor e perfis existentes. Edição permite trocar a senha e reativar contas. Exclusão exige confirmação, bloqueia o acesso e preserva o histórico. Alterações encerram as sessões da conta; editar a própria conta retorna ao login. A API protege o acesso administrativo, a própria conta e o último administrador ativo. Regras em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md#administração-de-usuários).

Os perfis aparecem como **Presets de acesso**. Selecioná-los carrega as permissões para marcar/desmarcar por funcionalidade; **Reaplicar presets atuais** recarrega a base na edição. Leituras necessárias são selecionadas junto com as ações. Em **Presets de permissões**, o admin edita os conjuntos existentes e confirma **Salvar só o preset** ou **Salvar e atualizar usuários**. A segunda opção preserva ajustes individuais e encerra as sessões afetadas. Setores e modos operacionais continuam independentes dessas escolhas; o acesso completo do admin geral é protegido.

```text
GET/POST        /api/v1/users
GET             /api/v1/users/roles
GET             /api/v1/users/permissions
PATCH           /api/v1/users/roles/:code/permissions
GET/PATCH/DELETE /api/v1/users/:id
```

Listagem aceita `search`, `page` e `limit`. `DELETE` inativa, sem excluir fisicamente. Respostas e auditoria não expõem credenciais. Os formulários mantêm campos de data limitados à largura disponível, inclusive dentro dos campos operacionais de lote no mobile.

## Cadastro de produtos

O cadastro mantém código, descrição, unidade, prazo de validade e, para fardos/caixas, quantidade e alternativas unitárias. Produtos do tipo `UN` também exigem **Gramatura da unidade (g)**, em gramas inteiras e positivas. O campo aparece somente para `UN`, é retornado nas consultas e registrado na auditoria; `FD` e `CX` mantêm a gramatura nula e não recebem cálculo de peso total. Cadastros unitários anteriores permanecem sem valor inventado e precisam ter a gramatura preenchida ao serem editados.

Todos os perfis podem cadastrar, editar, excluir por inativação e reativar produtos. O administrador pode abrir o **Log de produtos** para consultar autor, data e valores anteriores/novos das alterações.

A listagem de produtos usa a paginação existente de `GET /api/v1/products`: navegação **Anterior/Próxima**, página atual, total de produtos encontrados e seleção de 20, 50 ou 100 produtos por página. A busca por código/nome é aplicada no backend e volta à primeira página ao mudar, assim como a quantidade por página. Cadastro, edição e inativação mantêm os filtros e atualizam a consulta; se a página deixar de existir, a tela retorna à última página disponível. Carregamento, lista vazia e erro com nova tentativa seguem os componentes existentes.

## Envios entre setores

A Revisão acessa **Envios e recebimentos** pela Home ou menu; Produção/Expedição recebem uma interface restrita ao próprio setor. A tela operacional separa **Para receber** de **Meus envios em aberto**; concluídos, recusados e cancelados são encontrados no **Histórico** unificado. O início destaca pendências e decisões recentes dos próprios envios; a indicação é atualizada a cada 30 segundos, sem interromper formulários/decisões abertos.

Na separação imediata para retorno, cada card mostra lote e fabricação em `DD/MM/AAAA` junto ao campo de quantidade, usando os dados do item recebido.

Novo envio aceita vários itens e exige conferência do resumo. A seleção de produto possui campos independentes de código e descrição com sugestões filtradas durante a digitação; escolher em qualquer campo identifica o produto único e preenche o outro automaticamente, sem uma terceira seleção. A lista também pode ser aberta pelos botões dos campos e refinada por teclado.

No envio **Expedição → Revisão**, o formulário exige escolher **Carregado** ou **Não carregado**. Em **Carregado**, a placa do veículo é obrigatória. Situação e placa aparecem na conferência, no recebimento e no detalhe histórico do envio; envios antigos sem o campo continuam legíveis.

Usuários externos reutilizam o produto selecionado e os campos CONSERVADI/fabricação/validade. Na saída da Revisão, após selecionar o produto, o operador informa o lote ou a fabricação; o par é completado imediatamente pelo resolvedor central de lotes e fica visível antes da escolha da posição. A consulta é paginada no backend, aceita os filtros combinados e apresenta primeiro as posições de Lata Boa, seguidas dos demais locais por nome; lote, fabricação, validade, local e saldo continuam visíveis para distinguir a posição exata. A Revisão pode incluir posições de locais diferentes no mesmo envio.

Em **Revisão → Expedição**, a opção **Montar fardos/caixas** usa o mesmo fluxo de novo envio. O operador escolhe o código `UN` e uma embalagem `FD/CX` vinculada. No modo comum, vê quantas embalagens cada posição (local + lote/data) forma isoladamente e o total combinado do lote; escolhe o lote e distribui as unidades entre suas posições paginadas. Apenas com **datas misturadas** vê a capacidade pelo saldo total, usa lotes/datas distintos e mostra **Lote 0 — datas misturadas** sem datas únicas. Resumo, recebimento, histórico e PCP exibem a embalagem e as parcelas de origem. Recusa/cancelamento restaura as unidades a cada origem.
No relatório de movimentações, a saída mantém a unidade/quantidade debitada do estoque como origem e informa separadamente o FD/CX resultante, com quantidade e unidade próprias; filtros por produto encontram tanto a unidade consumida quanto a embalagem montada.

Em todos os sentidos de envio, cada produto pode receber uma observação opcional e o envio pode receber uma observação geral. Os textos são conferidos antes do envio, ficam disponíveis ao destinatário e no histórico e não podem ser editados após a criação. A observação geral também acompanha a movimentação gerada quando o recebimento é confirmado.

Cada produto do envio aceita fotos conforme mínimo e máximo definidos em **Configurações** (inicialmente 1 a 5, até 100 por envio). O operador pode capturar pela câmera ou escolher várias imagens, conferir e remover cada uma antes do envio. A conferência é bloqueada se algum produto estiver fora dos limites. A captura é reduzida para até aproximadamente 1600 px e enviada como JPEG; o backend também aceita PNG/WebP de até 5 MB e aplica a validação definitiva. Retornos da separação imediata usam os mesmos limites por item retornado.

Destinatário e remetente podem visualizar todas as miniaturas e abrir cada foto no visualizador, inclusive após confirmação ou recusa. O visualizador permite zoom de 100% a 400%, roda do mouse, duplo clique, restauração e deslocamento por arraste com mouse ou toque. Os cards de produto mantêm código/descrição, quantidade, lote, datas, observação e evidências em grupos alinhados. A primeira foto usa `GET /api/v1/shipments/:id/items/:itemId/photo`; as demais usam `/photos/:ordinal`, sempre com autenticação e escopo autorizado. Itens históricos sem foto continuam consultáveis.

Os detalhes de envios abertos ou históricos usam a mesma apresentação para todos os perfis, na Home, no Histórico, em Envios e recebimentos e nos avisos: código/status, rota destacada, produtos, responsáveis/datas e observações. Cada produto possui seu próprio botão para mostrar/ocultar fotos, inicialmente recolhidas no detalhe; a confirmação de recebimento mantém as fotos abertas para conferência. As ações continuam condicionadas às permissões e ao estado do envio.

Destinatário confirma ou recusa com motivo e responsável/data registrados. Recusas oferecem **Criar novo envio**, sem alterar o documento recusado. Nos detalhes de envios e movimentações vinculadas, administradores responsáveis podem **Editar solicitação** ou **Cancelar solicitação**, antes de qualquer execução PCP. O fluxo exige motivo, conferência do impacto e confirmação, sem duplo envio. Edição produz uma nova solicitação vinculada, preservando a original cancelada e exigindo novo recebimento. Escopo, campos permitidos e estorno em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md#envios-entre-setores).

`POST /api/v1/shipments/:id/admin-cancellation` recebe motivo; `POST /api/v1/shipments/:id/correction` recebe motivo, chave idempotente, itens originais com quantidades/observações e campos do envio. Bloqueios de saldo/PCP causam rollback integral. O histórico mantém responsáveis originais e dados do cancelamento separados; os detalhes permitem navegar entre original e correção.

Na Revisão, detalhes de entrada manual efetivada e recebimento aceito oferecem **Revisar produto** dentro do produto, somente com permissão de revisão. O fluxo existente abre com produto/lote preenchidos e saldo atual, deixando quantidade e distribuição para o operador. Na separação com retorno, o atalho aparece apenas para o volume líquido realmente creditado. Entradas pendentes/canceladas não oferecem a ação. O favicon local identifica a aplicação com caminhão e símbolo de reaproveitamento.

```text
GET/POST        /api/v1/shipments
GET             /api/v1/shipments/available-positions
GET             /api/v1/shipments/assembly-options
GET             /api/v1/shipments/:id
POST            /api/v1/shipments/resolve-lot
POST            /api/v1/shipments/:id/confirmation
POST            /api/v1/shipments/:id/refusal
```

Listagem: `view=pending|sent|history|updates|open`, `status`, `page` e `limit`; `sent` mostra apenas envios ainda em andamento criados pelo usuário, `open` reúne envios aguardando recebimento ou em separação dos quais o setor participa, e `updates` retorna decisões recentes dos próprios envios. Consultas respeitam o setor. `available-positions` é exclusivo da Revisão, exige `productId` e ao menos `batchCode` ou `manufacturingDate`, e retorna somente saldo positivo de produto/local ativos. `assembly-options` é exclusivo da Revisão e retorna embalagens vinculadas, saldo total em UN, capacidades por lote e por posição, além das posições paginadas de um produto unitário; `batchId` opcional filtra as posições paginadas, sem alterar os totais. Criação recebe multipart com `payload` contendo `requestKey`, `destinationSector` e `items` com `photoCount`, além dos arquivos `photos` agrupados na ordem dos itens; origem é inferida do usuário. Itens externos recebem `productId/lot/quantity` (ou variante existente via `batchId`); itens da Revisão recebem `productId/batchId/stockLocationId/quantity`. Na montagem, `productId` identifica a unidade, `quantity` indica embalagens e `assembly` informa `packageProductId`, `mixedDates` e `sources[]` com lote/local/quantidade de UN. Confirmação aceita `confirmedExpirationKeys` quando houver divergência apresentada; recusa exige `reason`.

Somente a confirmação gera entradas/saídas nos relatórios existentes. Nas saídas da Revisão, o saldo já fica indisponível desde a criação e aparece como **em trânsito** nos envios pendentes; recusa ou cancelamento pré-recebimento restaura o disponível. O autor pode cancelar enquanto o envio estiver aguardando recebimento, com motivo obrigatório; o envio permanece no histórico como `CANCELADO`, e administradores visualizam a auditoria no detalhe. Estoque/Home/relatório de validades mostram saldo disponível. Movimentos vinculados exibem o identificador do envio na observação e não oferecem cancelamento isolado; devoluções são novos envios. Regras completas em [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md#envios-entre-setores).

Na interface da montagem Revisão → Expedição, as posições de Lata Boa aparecem primeiro, com saldo e capacidade individual; os demais locais ficam em **Ver outras posições**. No modo comum, marcar uma posição escolhe seu lote. Com apenas uma posição marcada, o formulário calcula a retirada exata de UN a partir da quantidade de FD/CX; com várias posições, pede a parcela inteira de cada uma. O total agregado continua visível apenas para **Lote 0 — datas misturadas**. Validações de lote, datas, saldo e soma permanecem as mesmas.

## Produtos e conversões

Produtos possuem listagem, busca, detalhe, criação, edição e exclusão por inativação em todos os perfis; cadastros inativos podem ser reativados. O formulário identifica código, descrição, tipo de unidade e prazo padrão em anos; o prazo apenas sugere a validade de novas operações. Conversões de unidade conservam suas permissões próprias. A auditoria de produtos pode ser consultada pelo administrador em `GET /api/v1/products/audit-history`.

O tipo de unidade é uma seleção: Unidade (UN), Fardo (FD) ou Caixa (CX). Embalagens exigem **unidades por embalagem** e a vinculação de um ou mais códigos unitários existentes, pesquisáveis por código/descrição. A busca serve apenas para adicionar vínculos: após vinculá-los, seus campos podem ficar vazios ao salvar. A API recebe `unitsPerPackage` e `unitProductIds`; o filtro `defaultUnit=UN` restringe a busca às opções unitárias. As opções e o fator também aparecem nos detalhes. Valores antigos são preservados; configurações ausentes não são presumidas.

A consulta de produtos aceita `searchField=code|name` quando a interface precisa restringir as sugestões a um campo. Sem esse parâmetro, a busca geral continua considerando código e descrição.

Cadastro e edição abrem em modal. O código exige `123456` ou `123456.78`; o formulário orienta e bloqueia o formato inválido, e a API/banco também o validam. Ao digitar o código, um aviso abaixo do campo identifica duplicidade, inclusive em produto inativo, e impede salvar enquanto ela estiver presente. A consulta usa o filtro exato `code` de `GET /products`; respostas antigas da digitação são descartadas. Falhas de consulta são informadas e a API continua validando a unicidade ao salvar.

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

`resolve-lot` exige ao menos uma das permissões específicas de entrada, saída, transferência ou revisão e apenas valida/calcula, sem gravar. As consultas de lotes exigem `batches.read`. O cadastro operacional acontece na transação da operação, incluindo envios pendentes ainda sem saldo.

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

Abaixo dos filtros há dois níveis de seleção rápida: **Todos** ou um estoque principal; ao escolher um estoque, **Geral** (principal e filhos) ou um local filho. Cada local configura no cadastro se a consulta mostra posições separadas por lote/validade ou total por produto com os lotes e validades expansíveis. A opção por produto é paginada no backend e respeita os mesmos filtros; não modifica os saldos. Com **Todos**, a consulta continua por posições.

## Entrada externa

`POST /api/v1/movements/external-entries`

Uma conta com **Entrada direta na Revisão** pode registrar recebimento de qualquer origem externa ativa, inclusive Produção e Expedição, sem Envio nem aceite do remetente. O fluxo seleciona origem, destino controlado e itens, resolve lote/datas na operação e exige conferência antes de creditar o saldo. Histórico, responsável, auditoria e idempotência permanecem; a tela alerta para não duplicar a mesma entrega por Envio.

A seleção da origem consulta especificamente todos os locais externos ativos. Se nenhum estiver cadastrado, a tela oferece acesso ao cadastro de uma origem externa antes de continuar.

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

Administradores no modo `ADMIN` acessam **Configurações** para definir o prazo de separação (5 a 1440 minutos, inicialmente 180), os limites de fotos por item dos envios e um ou mais destinos internos cadastrados para a revisão. O formulário de revisão consulta os destinos e monta os campos dinamicamente, mantendo total, distribuído e restante e bloqueando diferenças.

**Preferências** aparece em **Menu e conta** e diretamente na barra lateral do desktop para todos os perfis. Cada conta pode salvar modo claro/escuro e qualquer cor hexadecimal para o fundo geral, ou restaurar o fundo padrão do tema. A alteração acompanha a conta em novos logins e não muda parâmetros operacionais. `GET/PATCH /api/v1/auth/preferences` exigem sessão autenticada; a cor é validada na API e no banco.

No recebimento Expedição → Revisão, **Sim, separar agora** coloca o envio em `EM_SEPARACAO`, exibe o prazo e permite salvar as quantidades de retorno como rascunho. A Expedição acompanha o estado sem ação. A conclusão exige fotos dentro dos limites em cada item retornado, credita somente a quantidade líquida e cria um envio de retorno ligado ao original. O retorno aguarda decisão da Expedição e é marcado como execução PCP não necessária. Se o prazo vencer, o acesso seguinte consolida integralmente o recebimento sem retorno.

No histórico da Revisão, a separação concluída com retorno aparece em dois cards vinculados ao envio original: a **entrada líquida efetivada no estoque** e o envio de retorno. Os detalhes mostram itens e quantidades e permitem consultar o original. O próprio envio original não vira um terceiro card nesse recorte. Retorno integral é identificado sem inventar uma entrada de saldo zero.

Endpoints envolvidos:

```text
GET   /api/v1/settings/operational
GET   /api/v1/settings
GET   /api/v1/settings/shipment-photos
PATCH /api/v1/settings/immediate-separation
PATCH /api/v1/settings/shipment-photos
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

A entrada principal **Histórico** reúne envios e movimentações diretas, sem duplicar em geral o envio confirmado pelo movimento de estoque; a separação imediata com retorno mantém sua exceção. **Por registro** é a visão padrão, paginada no backend, com produto/lote/quantidade, rota e código filho. **Por grupo** pagina a operação inteira e lista os filhos clicáveis no detalhe. A busca pelo código do grupo encontra seus filhos; pelo filho, apenas esse registro. Os filtros de etapa, tipo, período, produto/código e sentido relativo ao setor continuam disponíveis. `GET /api/v1/history?view=RECORD|GROUP` fornece a consulta somente de leitura. Relatórios de totais/CSV continuam em **Menu e conta**.

**Exportar CSV** no Histórico baixa os registros **Finalizados**, com os mesmos filtros de tipo, origem do registro, período, busca, sentido e ordenação. Exporta todas as páginas e sempre uma linha por registro, mesmo na visualização por grupo; o código do grupo aparece apenas como referência. Pendências de recebimento/separação/PCP, recusas e cancelamentos não são exportados. Escolher Todos ou Finalizadas habilita a ação; outros status são incompatíveis. Reutiliza a permissão e o setor da consulta, sem acesso adicional.

`GET /api/v1/history/export.csv` entrega CSV UTF-8 com ponto e vírgula, cabeçalhos e atributos separados: identificação, produto, lote, fabricação/validade, unidade/quantidade, rota, responsáveis/datas e observações. Inclui lote de destino de transferências, produto/quantidade resultante de desmontagens, carregamento/placa e montagem quando existentes. Cada destino da revisão e cada parcela de montagem ganha suas próprias colunas, mantendo uma linha por registro. Instantes são exportados em `America/Sao_Paulo`; datas civis não mudam de fuso. Fotos, chaves privadas e dados de sessão não são exportados. Textos com aparência de fórmula são neutralizados. Ao importar no Excel, selecione separador **ponto e vírgula** e formato **Texto** nas colunas de códigos para preservar zeros à esquerda.

No desktop, registros individuais aparecem em linhas compactas na Home, Histórico, envios abertos e fila PCP: identificador, data/hora e estado acima de produto, lote/fabricação, quantidade/unidade, rota e responsáveis pelo envio, recebimento e PCP. Etapas ainda não concluídas indicam pendência; etapas que não se aplicam são diferenciadas. A linha abre os detalhes existentes e ações operacionais ficam abaixo dela quando cabíveis. No celular, permanecem os cards/listas atuais. Transferências continuam sem código público.

Quando um item de revisão possui mais de um destino, seu registro mostra uma matriz compacta com os destinos e, logo abaixo, as quantidades efetivamente distribuídas em cada um. A Home, o Histórico e a fila PCP usam as distribuições gravadas no item; a unidade exibida é a do produto resultante quando houve desmontagem. Destinos sem distribuição não são inventados.

O detalhe de movimentação apresenta identificador, tipo, estados operacional e PCP, data/hora, responsável, rota, observação, itens, lotes, fabricação, validade, quantidades e distribuições. Os dados do produto confirmados em novos itens são preservados por snapshot; datas são preservadas nas variantes imutáveis. Relatórios históricos e CSVs existentes também mostram as datas de origem/destino. Registros efetivados e cancelados permanecem consultáveis.

Na interface, o detalhe prioriza identificação e estados no cabeçalho, rota e produtos; responsáveis/data aparecem em uma faixa compacta, observações depois e ações ao final. As listas da Home usam fundos suaves diferentes para envios abertos, pendências PCP e finalizadas, mantendo os registros individuais em destaque. No tema escuro, as cores distinguem os painéis; os registros internos compartilham uma superfície neutra que contrasta com cada fundo.

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

`GET /api/v1/reports/stock/products` reutiliza os mesmos filtros e totais, mas pagina por produto e inclui as posições filtradas de cada produto. `includeSubstocks=true` com `stockLocationId` inclui as classificações filhas de um estoque principal nas duas consultas.

A interface principal **Estoque e validades** apresenta saldo, lote, fabricação, validade e situação, com destaque visual simples para cada estado. Possui os mesmos filtros, paginação da API, estados de carregamento, vazio e erro e ação para limpar filtros. O acesso exige `stock-positions.read`; exportação não faz parte desta interface.

## Dashboard operacional

Todos os cards das listas da Home abrem um resumo sem navegação imediata. Reutiliza Modal acessível, itens e visualizador privado de fotos; mostra código, rota, responsável, estados, datas, observações e, para envios, separação e vínculos de retorno. Fechar/ESC retornam à Home. Ações encaminham ao registro específico na página existente: confirmar recebimento/retorno, continuar separação, ver retorno, executar PCP ou ver detalhes completos. O resumo não executa operações.

`codigoMovimentacao` identifica o grupo desde a criação do envio e permanece igual durante todo o ciclo. Cada item recebe `codigoRegistro` (`-A`, `-B`, …, `-AA`) e conserva-o no recebimento. Histórico, `GET /movements` e PCP buscam grupo ou filho; `view=RECORD|GROUP` controla a paginação. Transferências não recebem código público nem usam UUID como substituto público.

A Home exibe, antes dos atalhos, um ponto de atenção quando o setor ativo possui solicitações aguardando seu aceite ou envios em separação. Os totais vêm das consultas de envios, com escopo do setor e atualização ao entrar ou alternar o modo operacional.

Abaixo dos menus e botões ficam, conforme as permissões: envios abertos dos quais o setor participa; movimentações concluídas no estoque aguardando PCP; e uma lista única das últimas operações **finalizadas**. A última lista usa o mesmo estado do Histórico e só inclui confirmação/efetivação sem ação restante do PCP. Recusas e cancelamentos ficam em **Encerradas**, não em finalizadas. A apresentação é mobile-first em cards clicáveis e não recalcula estados no navegador.

## Experiência de uso

Seletores de lote/posição nos envios, saídas, transferências e revisões usam uma lista contida no formulário, com quebra de linha e rolagem vertical. Textos usam `prod:` e `val:` para fabricação e validade, preservando as datas completas e o saldo. A seleção funciona por toque, mouse e teclado; Escape fecha a lista antes de fechar o modal.

Setas de seletores nativos e pesquisáveis têm traço definido e contraste nos temas claro/escuro. No mobile, modais não bloqueiam a rolagem da página; sua altura acompanha a área visível quando o teclado aparece e o conteúdo do formulário permanece rolável.

Todos os modais de **Adicionar produto** reutilizam o seletor pesquisável por código e descrição usado nos envios externos. Ao abrir um dos campos, a lista mostra os produtos disponíveis e é filtrada enquanto o operador digita; escolher por código preenche a descrição e escolher por descrição preenche o código. Entrada mostra produtos ativos do cadastro, enquanto saída, transferência e revisão limitam a lista aos produtos com posição disponível na origem correspondente.

Envios, entradas, saídas, transferências e revisões apresentam a lista e o botão **Adicionar produto**. Os campos ficam em modal central com rolagem interna: salvar inclui o item e fecha; cancelar descarta somente o rascunho. Na revisão, quantidade, código resultante e distribuições são preenchidos antes de salvar, com edição posterior do item ainda não confirmado. Observação geral e confirmação final permanecem na operação. Reutilizados os campos e validações existentes, sem alteração de saldos ou regras transacionais. Campos com texto de ajuda são alinhados pelo topo para não deslocar os controles vizinhos.

- Home com atalhos somente para funções disponíveis ao usuário.
- Tela compacta de operações no mobile.
- Barra inferior no celular; no desktop, barra lateral compacta por padrão, com ícones clicáveis, nomes acessíveis e botão para expandir/recolher os rótulos. Os destinos continuam limitados ao perfil e ao modo operacional ativo.
- Cards responsivos, filtros recolhíveis e painéis de detalhe.
- Feedback padronizado de loading, vazio, sucesso e erro.
- Confirmação antes de operações críticas e bloqueio dos botões durante envio.

## Perfil e fila PCP

Usuários do setor e perfil exclusivo `PCP` entram em uma interface própria, sem menus de criação, edição, cancelamento ou aceite. Administradores acessam a mesma interface ao selecionar PCP no modo operacional. A fila inicia em registros concluídos e pendentes, das mais antigas para as mais novas, e permite combinar período, estado operacional, estado PCP, tipo, origem, destino, produto/lote e ordenação. **Por registro** é o padrão; **Por grupo** mostra a operação completa e o progresso de seus filhos. Ambas as visões são paginadas no backend.

O detalhe da fila PCP reutiliza o mesmo modal de movimentação do restante do sistema: cabeçalho com código/estados, rota destacada, produtos/quantidades, responsáveis/datas, observações e histórico de eventos. Preserva lote, fabricação, validade, distribuições e fotos privadas por produto, com botão **Mostrar/Ocultar fotos**. A navegação entre registro e grupo conserva a contagem total de filhos e seus estados PCP individuais. **Marcar registro como executado** muda somente o status PCP daquele filho; outros ficam pendentes e o grupo só conclui quando todos forem executados. O modal aceita observação opcional, impede duplo envio e atualiza a fila. A API revalida o estado sob transação e lock, grava usuário/data/observação no filho e não altera dados operacionais.

## Ainda não implementado

Os itens fora do escopo atual estão consolidados no fim de [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md). Não apresente esses itens como disponíveis nem crie implementações fictícias.
