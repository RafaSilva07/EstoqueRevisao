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

## Rascunhos de preenchimento

- Entradas, saídas, transferências, revisão, envios/montagem, recebimento/recusa, separação, cancelamento, execução PCP e formulários administrativos permitem rascunhos. CRUD de produtos, login e filtros de consulta não participam.
- Rascunho não é movimentação, não recebe código operacional, não reserva saldo, não cria lote e não modifica histórico/auditoria. A confirmação definitiva continua passando pelas permissões e validações atuais da API.
- Cada formulário tem um rascunho na conta, separado por ambiente, usuário e modo operacional; ações/edições também incluem o identificador do registro. Ao voltar ao mesmo formulário, inclusive em outro dispositivo no mesmo ambiente e modo, o conteúdo é recuperado, incluindo itens incompletos e fotos anexadas.
- Ao sair por navegação, botão, clique externo ou Escape, um preenchimento alterado oferece salvar e sair, descartar o preenchimento ou continuar. Atualizar/fechar a aba utiliza a confirmação nativa do navegador e o salvamento automático.
- Uma cópia no navegador protege alterações ainda não sincronizadas. Sem conexão, a interface avisa e não confirma “salvar e sair” como sincronizado. Edições concorrentes não sobrescrevem a versão da conta: o preenchimento local é preservado, e carregar a versão sincronizada exige escolha explícita. Descarte/conclusão impedem ressuscitar versões antigas. Encerramento abrupto antes da gravação não tem garantia de recuperação. Senhas, tokens e segredos não são armazenados; a chave técnica de idempotência é preservada.
- Sucesso na API remove o rascunho correspondente; falha mantém o conteúdo. A separação mantém seu rascunho servidor e prazo existentes: guardar conteúdo local não interrompe o prazo, e “Salvar e sair” também atualiza as parcelas no servidor.

## Administração de usuários

- Os perfis existentes são presets de permissões editáveis pelo admin geral. O preset inicial `REVISAO` permite solicitações, revisão, transferência, consultas e gestão de produtos. Entrada/saída direta e estorno são permissões separadas que podem ser concedidas individualmente ou no preset, dentro do setor Revisão.
- `ADMIN_REVISAO_EXPEDICAO` opera nos modos Revisão e Expedição; `ADMIN_PRODUCAO_PCP` opera nos modos Produção e PCP. Esses perfis devem ser atribuídos isoladamente, com setor inicial pertencente ao respectivo par. Editar permissões não muda setores nem habilita novos modos; a leitura transversal da fila continua pertencendo ao PCP.
- Os presets iniciais permitem cadastrar, editar, inativar e reativar produtos. Cada ação pode ser ajustada separadamente. Excluir significa inativar, preservando saldos, vínculos, histórico e auditoria. O log dos produtos continua exclusivo de `ADMIN` no modo `ADMIN`.
- A conta guarda a base de permissões recebida dos presets e os ajustes individuais de concessão/negação. Os ajustes prevalecem sobre a base. O admin geral mantém acesso completo protegido e é o único gestor de usuários, presets e configurações gerais.
- Ao salvar um preset, o administrador escolhe explicitamente se deseja atualizar os usuários vinculados. Sem atualização, acessos existentes permanecem e novas atribuições usam o preset atualizado. Com atualização, a base é recomposta pelos presets atuais atribuídos, preservando ajustes individuais e encerrando as sessões afetadas. Reaplicar presets na edição individual substitui a base e permite redefinir os ajustes daquela conta.
- Não há exclusão física de movimentações ou revisões. Usuários com permissão de cancelamento utilizam estorno integral, sujeito às validações já existentes; cadastros utilizam inativação. Vincular `ADMIN` concede acesso administrativo mesmo se a conta também possuir `REVISAO`.

- Somente contas com perfil `ADMIN` no modo `ADMIN` podem consultar, criar, editar e excluir usuários.
- Login é único sem diferenciar maiúsculas/minúsculas. O cadastro usa setores e presets existentes; as funcionalidades são selecionadas no catálogo de permissões implementadas, sem criação de novos setores ou códigos de permissão.
- Senhas têm entre 8 e 128 caracteres e são persistidas exclusivamente como Argon2id. Na edição, omitir a senha mantém a atual.
- Excluir significa inativar a conta, encerrar suas sessões e preservar os vínculos com histórico/auditoria. Contas inativas permanecem consultáveis e podem ser reativadas.
- Alterar uma conta encerra suas sessões anteriores. Ao editar a própria conta, o administrador precisa entrar novamente.
- Não é permitido inativar a própria conta nem remover seu acesso administrativo. O último administrador ativo é preservado, inclusive sob alterações concorrentes.
- O `ADMIN` geral pertence ao setor Revisão e inicia no modo `ADMIN`, que concentra o acesso completo. Ao selecionar Revisão, Produção, Expedição ou PCP, obedece ao escopo operacional escolhido. Administradores de área iniciam no setor cadastrado e só podem alternar entre seus dois modos; a identidade real permanece na auditoria.
- Alterações e auditoria são atômicas e nunca registram senhas ou hashes.

## Produtos e conversões

- Produto é o cadastro mestre: código único, descrição (`name`), tipo de unidade (`defaultUnit`), prazo padrão de validade em anos inteiros positivos e estado ativo/inativo. Produtos `UN` também possuem gramatura, correspondente ao peso positivo e inteiro, em gramas, de uma unidade. Novos cadastros exigem prazo e, para `UN`, gramatura; produtos antigos sem essas informações permanecem pendentes até serem configurados, sem inventar valores.
- O código do produto deve ser formado por exatamente seis dígitos (`123456`) ou seis dígitos, ponto e mais dois dígitos (`123456.78`). Zeros à esquerda são preservados. O código continua único; esta regra não se aplica ao código de lote, local ou movimentação, que têm formatos próprios.
- Cadastros referenciados são inativados em vez de excluídos.
- Conversões pertencem a um produto, possuem fator positivo e não podem repetir o mesmo par de unidades.
- Unidade de origem e destino de uma conversão devem ser diferentes.
- Novos cadastros selecionam Unidade (`UN`), Fardo (`FD`) ou Caixa (`CX`). Fardo/caixa exige quantidade inteira positiva de unidades por embalagem e um ou mais produtos `UN` ativos vinculados como alternativas. Não se trata de uma embalagem com mistura de códigos.
- Gramatura pertence somente ao código `UN`; `FD` e `CX` não recebem peso calculado nem gramatura própria nesta etapa.
- Cada item revisado escolhe um único código unitário entre essas alternativas. As conversões antigas de unidade do mesmo produto não definem a desmontagem entre códigos diferentes.
- Unidade e quantidade por embalagem não podem ser alteradas em produto que já possui lote operacional; uma configuração ausente de embalagem antiga pode ser completada. Um produto vinculado como opção unitária não pode mudar para fardo/caixa. Mudanças posteriores de nome ou opções não reescrevem revisões realizadas.
- Cadastros antigos mantêm seus dados, sem inventar fatores ou vínculos. Embalagens `FD`/`CX` sem configuração precisam ser completadas antes de revisar.

## Lote, fabricação e validade nas operações

- Lote é informação operacional, não um cadastro mestre nem uma etapa prévia. Entrada e transferência recebem os dados diretamente; o sistema resolve ou cria a referência interna na mesma transação da movimentação.
- Cada combinação de produto, código e validade identifica uma variante imutável. O mesmo código pode existir para o produto com validades diferentes, mas nunca com fabricação incompatível.
- A validade sugerida é fabricação + prazo padrão do produto em anos civis. Em 29 de fevereiro, limita-se ao último dia de fevereiro do ano de destino. A sugestão é editável; sempre se preserva a validade confirmada, não um cálculo futuro.
- Havendo outra validade registrada para o mesmo produto/lote, a confirmação informa produto, lote, validades existentes e validade informada. Só após confirmação explícita a operação prossegue, com saldos separados. Referências históricas sem saldo também são consideradas.
- A confirmação fica vinculada às divergências apresentadas. Uma validade concorrente ainda não apresentada exige nova confirmação. Recusar/fechar não grava saldo, lote nem movimentação.
- Entradas com o mesmo produto, lote, validade e local acumulam o saldo, mantendo cada movimentação individual no histórico.
- Fabricação e validade são obrigatórias, e a validade não pode anteceder a fabricação.
- A fabricação deve estar entre 2000 e a data atual; datas futuras não são permitidas. A regra também é aplicada quando a fabricação é obtida a partir do código CONSERVADI.
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
- Cada local interno pode configurar a consulta de estoque por posições de lote/validade ou por total de produto com posições detalhadas. É somente uma preferência de apresentação: saldo, unicidade por posição e movimentações não são agregados nem alterados. Locais externos não possuem essa preferência.

Os registros iniciais são Estoque Revisão, Revisar, Lata Boa, Varejo, TUF, Expedição e Produção. Nomes não devem ser usados como regra no código. A revisão usa `review_role` persistido para identificar uma origem `SOURCE` e destinos `DESTINATION`.

## Regras comuns das movimentações

- O UUID permanece técnico nas relações e rotas. `codigoMovimentacao` é público, único e imutável: `ENT-000001` para entrada externa, `SAI-000001` para saída externa e `REV-000001` para revisão. Cada prefixo tem sequência independente; transferências internas permanecem sem código.
- Nos envios entre setores, o código nasce no backend/banco junto com o envio e permanece igual durante `AGUARDANDO_RECEBIMENTO`, separação, confirmação, recusa e histórico. A movimentação de estoque criada na confirmação herda esse mesmo código; se um envio com várias origens gerar mais de um registro técnico de movimentação, todos pertencem ao mesmo código público. Cancelamentos preservam o código original. Entradas/saídas diretas e revisões recebem o código quando são criadas.
- O código acima identifica o **grupo**, criado/confirmado de uma vez. Cada item é um **registro individual** (produto, lote, quantidade e rota) com UUID próprio e, quando o grupo possui código público, código filho imutável: `ENT-000001-A`, `ENT-000001-B` etc. Um único item também recebe `-A`; após `-Z` seguem `-AA`, `-AB` e assim por diante, sem sequência independente. Em envios, o filho nasce com o item enviado e é preservado no movimento de estoque após o recebimento. A transferência mantém a regra anterior de não possuir código público; seus itens continuam identificados tecnicamente por UUID.
- Consultas operacionais mostram e paginam **registros** por padrão; a opção **Por grupo** pagina operações completas e permite abrir cada filho. Buscar o código do grupo retorna os filhos; buscar o código filho retorna somente ele. O status PCP pode variar entre filhos, mas criação, aceite de envio, cancelamento/estorno e efeitos de estoque continuam sendo da operação inteira conforme suas regras anteriores.
- Lacunas por rollback são aceitáveis. Utilizam-se no mínimo seis dígitos, crescendo sem truncamento. Legados recebem códigos por ocorrência, criação e UUID como desempate, sem alterar seus dados operacionais.

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

### Separação imediata no recebimento da Expedição

- Ao confirmar Expedição → Revisão, o operador escolhe entre receber integralmente ou iniciar separação imediata.
- A separação usa `EM_SEPARACAO`, com início e expiração persistidos por envio. O prazo configurado é capturado no início e não muda depois.
- Enquanto separa, nenhum saldo definitivo é creditado e o PCP não recebe uma movimentação executável. Vários envios podem permanecer nesse estado independentemente.
- O retorno aceita somente itens do envio original, quantidades inteiras entre zero e o recebido e fotos dentro dos limites configurados para cada item com quantidade positiva.
- Na conclusão, o saldo da Revisão recebe diretamente `recebido - retorno`. Não ocorre crédito bruto seguido de débito.
- Havendo retorno, nasce um envio derivado Revisão → Expedição, vinculado ao original. Ele usa o aceite/recusa de envios, não reserva saldo e não exige execução PCP.
- No histórico da Revisão, a separação concluída com retorno apresenta dois registros vinculados ao envio original: a entrada efetiva da quantidade líquida e o envio de retorno. A entrada é recebida pela Revisão; o retorno sai dela. O envio original permanece consultável pelas referências, sem um terceiro card nesse recorte.
- Se o prazo vencer, o rascunho é invalidado, todo o volume é creditado à Revisão e o movimento original segue para o PCP normalmente.
- Linha e status do envio são bloqueados na conclusão/expiração; somente uma transição pode consolidar saldo.

### Configuração do processo de revisão

- O prazo da separação e os destinos da revisão são configurações persistidas e alteráveis apenas no modo administrativo.
- Destinos devem ser locais internos ativos já cadastrados; pelo menos um deve permanecer selecionado.
- Novas revisões usam a seleção atual. Movimentações históricas preservam os destinos gravados em suas distribuições.
- A soma das distribuições continua obrigatoriamente igual à quantidade revisada; a configuração dinâmica não flexibiliza essa invariante.

- Usuários possuem setor `REVISAO`, `PRODUCAO`, `EXPEDICAO` ou `PCP`. O setor atribuído vem da sessão validada no banco, nunca de um campo operacional comum. PCP é um setor administrativo e não participa como origem ou destino de envios de mercadoria.
- Somente o `ADMIN` geral pode acessar o modo completo `ADMIN`. Administradores de área alternam apenas entre os dois setores de seu perfil. O modo escolhido vale por requisição, aplica todas as restrições operacionais do setor e não altera o setor cadastrado nem a identidade registrada em histórico e auditoria. Cabeçalhos de alternância fora dos modos atribuídos são rejeitados.
- Produção/Expedição enviam somente para Revisão e decidem somente recebimentos destinados ao próprio setor. Não acessam operações, saldos ou relatórios internos da Revisão.
- Em novos envios **Expedição → Revisão**, o remetente informa obrigatoriamente se a carga está **Carregada** ou **Não carregada**. Se carregada, informa a placa do veículo; se não carregada, não informa placa. Essa informação pertence ao envio inteiro, permanece no histórico/auditoria e não altera o cálculo de estoque. Não se aplica aos demais sentidos de envio. Envios históricos anteriores ao campo continuam consultáveis sem essa informação.
- Revisão envia para Produção/Expedição e decide os envios desses setores. Permissões `shipments.read/create/decide` complementam a validação do setor.
- Um envio tem vários itens e nasce `AGUARDANDO_RECEBIMENTO`. Os itens não são editáveis depois do envio. Somente o destinatário pode decidir uma única vez: `CONFIRMADO` ou `RECUSADO`; recusa exige motivo de até 1000 caracteres.
- Enquanto permanecer `AGUARDANDO_RECEBIMENTO`, somente o usuário autor pode cancelar o envio inteiro, informando motivo obrigatório de até 1000 caracteres. O registro passa a `CANCELADO`, permanece no histórico e não pode ser cancelado novamente. Depois de confirmação, recusa ou início da separação, o cancelamento pelo remetente é bloqueado.
- O cancelamento de envio originado na Revisão restaura atomicamente todas as reservas nas posições originais; envios originados em Produção/Expedição ainda não possuem saldo a estornar. Aceite e cancelamento concorrentes são serializados e apenas uma transição prevalece.
- A autoria, data/hora e o motivo do cancelamento são preservados no envio e em evento `SHIPMENT_CANCEL` da auditoria. Administradores podem consultar os eventos no detalhe do envio.
- Exceção administrativa: ADMIN geral e administradores responsáveis pelos setores podem cancelar solicitações pendentes, em separação ou aceitas, com motivo obrigatório, desde que nenhum registro vinculado tenha execução PCP, mesmo parcial. O admin Revisão/Expedição atua nos envios envolvendo esses setores; Produção/PCP atua nos envios envolvendo Produção. A identidade administrativa real é conferida, inclusive durante alternância operacional; operadores comuns continuam limitados ao cancelamento pelo autor antes do recebimento.
- O cancelamento administrativo preserva o envio, seus itens, evidências e responsáveis originais, registrando separadamente administrador, instante e motivo. Retira entradas efetivadas do saldo de Revisar e devolve saídas/reservas às origens exatas, inclusive montagem com múltiplas parcelas. Se faltar saldo, nada muda. Recebimento com retorno imediato e seus retornos são cancelados juntos, estornando apenas a entrada líquida efetivada, sem crédito fictício do volume retornado.
- **Editar solicitação** cancela/estorna a original e cria uma nova vinculada, na mesma transação, para novo aceite. Permite corrigir quantidades, observações, carregamento/placa e remover itens da nova solicitação; pelo menos um item permanece. Produto, lote, posição e fotos são preservados. Para mudar esses dados ou quantidade/parcelas de montagem, cancelar e criar um novo envio. Retornos derivados são corrigidos pelo recebimento original. Falha na nova solicitação também desfaz o cancelamento e a auditoria. A original nunca é editada fisicamente.
- O remetente pode registrar uma observação geral no envio e uma observação específica em cada item/produto. Ambas são opcionais, possuem até 1000 caracteres, são preservadas no histórico e tornam-se imutáveis junto com o envio.
- O administrador configura mínimo e máximo de fotos por item/produto do envio: inteiros entre 1 e 10, com mínimo não superior ao máximo. Inicialmente, permite-se de 1 a 5 fotos por item e até 100 fotos por envio. A mesma regra vale para os itens positivos de retornos da separação imediata.
- Cada foto deve ser JPEG, PNG ou WebP, não vazia e com até 5 MB. As fotos são evidências daquele item, não do cadastro mestre nem do lote, e permanecem vinculadas após confirmação, recusa ou cancelamento. Alterar os limites não reescreve envios anteriores.
- O envio só nasce `AGUARDANDO_RECEBIMENTO` quando todos os itens e fotos válidas são recebidos. Fotos não podem ser substituídas depois do envio. Registros históricos anteriores à regra permanecem consultáveis sem foto.
- Somente usuários autorizados a consultar o envio podem carregar suas fotos. O storage é privado; o banco guarda apenas chave, tipo e tamanho, nunca o binário nem URL pública permanente.
- Produção/Expedição → Revisão: criar não altera saldo; confirmar adiciona os itens à origem configurada da revisão (`review_role = SOURCE`, “A Revisar”); recusar não altera saldo.
- Revisão → Produção/Expedição: criar retira atomicamente a quantidade disponível das posições selecionadas. Os itens pendentes representam **em trânsito**, sem criar um local consumível por outras operações. Confirmar encerra o trânsito e registra a saída sem descontar novamente; recusar devolve exatamente às posições originais, inclusive se o produto tiver sido inativado.
- O tipo de um local com quantidade em trânsito não pode mudar até a decisão, garantindo a restauração em caso de recusa.
- No envio **Revisão → Expedição**, o operador pode escolher **montagem** de FD/CX a partir de um código `UN` ativo vinculado à embalagem no cadastro. Informa a quantidade inteira de embalagens e marca as posições de origem. Se escolher uma só, a parcela é calculada automaticamente; se escolher várias, informa a parcela inteira de cada uma. A soma deve ser exatamente `embalagens × unidades por embalagem`, sem repetir posições nem ultrapassar o saldo. Na montagem comum, a interface mostra a capacidade de cada posição (local + lote/data) isoladamente; só na opção **Lote 0 — datas misturadas** mostra também a capacidade pelo saldo total. A transação revalida vínculo, fator e saldo antes de reservar.
- Na montagem comum, todas as parcelas pertencem ao mesmo lote, mesmo que venham de locais diferentes; a embalagem mostra esse lote e suas datas. Excepcionalmente, a opção **datas misturadas** exige origens com datas diferentes: a embalagem é exibida como **Lote 0 — datas misturadas**, sem fabricação ou validade única. `Lote 0` não cria um lote operacional fictício no estoque; lotes, datas, locais e quantidades reais das unidades ficam preservados no registro imutável.
- Recusa ou cancelamento antes do recebimento devolvem cada parcela `UN` exatamente ao lote e local de origem, de forma atômica. A confirmação mantém a saída das unidades já reservadas e registra a embalagem resultante no envio/histórico/PCP, sem novo débito nem crédito de embalagem ao estoque. A movimentação de saída vinculada continua sem cancelamento isolado depois de confirmada.
- Lote/fabricação/validade de envio externo reutilizam integralmente as regras operacionais. Divergências de validade exigem aceite na criação e nova conferência no recebimento pela Revisão. Envios da Revisão preservam a variante selecionada no saldo.
- Criação usa chave idempotente; decisões bloqueiam o envio. Repetir a mesma decisão retorna o estado já registrado, sem novo efeito; tentar a decisão oposta gera conflito.
- Decisão, movimentações, saldo e auditoria são uma transação única. Quantidade reservada não pode ser consumida por revisão, transferência, saída, outro envio ou estorno de entrada.
- Confirmação gera movimentação externa vinculada ao envio. Em envios normais, várias origens internas geram uma movimentação por local. Na montagem, cada embalagem registrada permanece um único filho para recebimento/PCP; suas múltiplas origens exatas ficam detalhadas no item, embora o cabeçalho técnico da movimentação use a primeira origem.
- Envios e itens não são excluídos. Remetente, destinatário, datas, responsável pela decisão, motivo, observações e snapshot dos produtos permanecem no histórico. Correções utilizam novo envio; a ação administrativa vincula a nova solicitação à original cancelada.
- Movimentações vinculadas a envio confirmado não aceitam cancelamento isolado: operadores usam novo envio no sentido inverso e confirmação do outro setor; administradores utilizam a exceção integral descrita acima, antes de qualquer execução PCP. Cancelamentos de movimentações anteriores ou não vinculadas continuam disponíveis.
- Indicações internas mostram pendências e decisões recentes dos próprios envios, com motivo de recusa. Não há e-mail, push ou controle de “lido”.

## Entrada externa

- A entrada direta permite qualquer origem externa ativa, inclusive Produção e Expedição, quando uma conta com `movements.external-entry` registra manualmente o recebimento na Revisão. Ela é uma movimentação independente e efetivada imediatamente, sem confirmação do setor remetente; não deve duplicar um Envio da mesma entrega.
- A origem, o usuário responsável, a data/hora, os itens e a operação ficam preservados no histórico e na auditoria. Correções seguem o estorno existente, sem editar ou excluir fisicamente a entrada.
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
- Para cada item unitário, a soma das distribuições deve ser exatamente igual à quantidade revisada. Para fardo/caixa, deve corresponder à quantidade revisada multiplicada pelas unidades por embalagem.
- Destinos do mesmo item não podem se repetir.
- A revisão pode consumir parte do saldo; o restante permanece em Revisar.
- Produtos unitários preservam o produto. Fardos/caixas são obrigatoriamente desmontados: a origem é debitada em embalagens e os destinos recebem o código `UN` ativo escolhido entre os vinculados, em unidades inteiras.
- Código de lote, fabricação e validade são obrigatoriamente preservados, inclusive na desmontagem. O backend resolve/cria a referência interna equivalente para o produto unitário, sem permitir datas ou lote diferentes. Eventual outra validade do mesmo produto/lote exige a confirmação já existente.
- Cada item guarda produto e quantidade originais, produto unitário resultante, referência de lote de saída, fator e quantidade convertida. O fator enviado para conferência deve corresponder ao cadastro atual; nenhum cálculo do cliente autoriza saldo.

Invariantes por item:

```text
soma das distribuições = quantidade revisada × fator
fator = 1 para produto unitário; unidades por embalagem para fardo/caixa
saldo original diminui em embalagens; saldo resultante aumenta em unidades
código do lote, fabricação e validade são preservados
```

## Aviso de possível duplicidade recente

- A criação de entradas, saídas, transferências, revisões e envios comuns/montagem confere a operação inteira contra registros criados nos últimos **30 minutos**, inclusive por outro usuário. Movimentações são comparadas por tipo/rota; envios, por modalidade e setores de origem/destino. A janela usa a criação no servidor, não a data operacional informada.
- Devem coincidir produtos, variantes imutáveis de lote/validade, quantidades e posições. Revisões também comparam código resultante, fator e distribuições; montagens comparam embalagem e todas as parcelas. A ordem dos itens não interfere. Fotos, observações, autor e dados de carregamento não diferenciam os efeitos de estoque.
- Movimentações canceladas e envios recusados/cancelados não geram aviso. Envios pendentes, em separação e confirmados participam da conferência. A comparação é de operação inteira, não de itens isolados ou entregas parcialmente semelhantes.
- Havendo correspondência, nada é confirmado ou reservado: o usuário vê até cinco referências recentes com código, responsável, instante e estado, podendo voltar ou **continuar mesmo assim** após confirmação explícita. A operação legítima repetida permanece permitida, respeitando saldo, permissões e todas as demais validações.
- O aceite fica vinculado aos dados e registros apresentados. Alterar o preenchimento ou surgir outra operação igual exige nova conferência. A confirmação efetiva fica na auditoria da criação. Reenvios com a mesma chave idempotente continuam retornando a operação original, sem aviso nem efeito adicional.
- Recebimento, separação/retorno derivado, correção administrativa, cancelamento e execução PCP conservam seus controles próprios; não são tratados como uma nova criação comum pelo aviso.

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
| Revisão | Retira cada parcela de seus destinos e devolve o total original ao Revisar. Na desmontagem, retira o produto unitário e devolve as embalagens, usando o fator e os produtos históricos, mesmo após edição/inativação do cadastro. |

## Histórico e auditoria

- O histórico mostra tipo, estado, responsável e data originais, rota, itens, lotes, fabricação, validade, quantidades e distribuições. Referências de lote/validade não podem ser editadas. Novos itens também guardam uma cópia de código, descrição e unidade do produto; alterações posteriores no cadastro não reescrevem essa cópia. Dados antigos sem essa cópia continuam consultáveis, sem fabricar um histórico que não foi registrado.
- Movimentações canceladas continuam consultáveis e mostram responsável, data e motivo do cancelamento.

## Execução administrativa pelo PCP

- O estado operacional e o estado de execução PCP são dimensões independentes. Cada registro de uma movimentação efetivada nasce `PENDENTE` no PCP; o grupo fica `EXECUTADA` somente quando todos os seus registros exigíveis forem executados.
- Somente registros de movimentações concluídas podem transitar uma única vez de `PENDENTE` para `EXECUTADA`. Os demais registros do grupo permanecem pendentes. Canceladas, recusadas, aguardando aceite ou incompletas não podem ser executadas.
- Envios somente entram na fila depois do aceite, quando geram a movimentação efetiva vinculada. Solicitações pendentes ou recusadas não geram item executável.
- A execução registra o usuário autenticado, data/hora e observação opcional própria, sem alterar observação, itens, lote, datas, quantidade, origem, destino, foto ou qualquer dado operacional.
- Concorrência é serializada por lock pessimista. A primeira confirmação vence; tentativas posteriores recebem conflito e não reabrem a execução.
- `PCP` é simultaneamente setor e perfil exclusivo de leitura global e da ação específica de execução. Usuários PCP devem ter setor e perfil PCP; não recebem permissões de criação, edição, cancelamento ou decisão de envios. Administradores podem assumir o modo PCP sem mudar seu cadastro.
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
- No Histórico, a exportação é sempre por registro e somente para o estado **Finalizada**: recebimento/separação concluídos e execução PCP concluída quando exigível. Um filho executado pode ser exportado mesmo com outros filhos do grupo pendentes. Canceladas e recusadas permanecem consultáveis, mas não entram nessa exportação. O escopo de permissões/setor da consulta é preservado.
- Períodos históricos usam instantes ISO 8601. Validade usa data civil e é classificada em vencida, próxima do vencimento ou válida em relação à data de referência e à janela informada.
- A distribuição da revisão considera apenas movimentações `REVISAO` efetivadas e totaliza cada classificação de destino.
- Na desmontagem, o relatório de revisões mostra o produto e as unidades resultantes. O relatório de movimentações mantém a quantidade/unidade de origem e informa separadamente o produto e a quantidade produzidos. Filtros por produto encontram a origem ou o resultado; canceladas continuam excluídas dos totais válidos.

## Fora do escopo atual

- notificações externas;
- transformação ou criação de produto/lote específica do Varejo;
- mapa físico detalhado de armazenagem;
- reversão automática de uma cadeia de operações dependentes;
- criação de novos setores, modos operacionais ou códigos de permissão arbitrários;
- dashboard e relatórios analíticos avançados além das consultas operacionais implementadas.
