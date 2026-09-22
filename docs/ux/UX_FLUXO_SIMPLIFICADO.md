# Experimento de navegação simplificada

Branch: `experiment/ux-navegacao-simplificada`, criada a partir de `main` sem alterações locais. Sem merge ou deploy.

## Objetivo e problema

Reduzir a quantidade de informações e ações simultâneas. A Home anterior combinava indicadores, atividades recentes e atalhos operacionais; o menu expunha cada operação separadamente.

## Proposta

**Início → ação** para perfis com até seis ações; **Início → área → ação** para os demais. Produção/Expedição veem quatro ações de solicitações diretamente, e PCP vê suas três consultas. Cards em coluna no celular e grid no tablet/desktop. Breadcrumb de até três níveis e Voltar respeitam o menu direto da Home.

| Área | Destinos |
| --- | --- |
| Movimentar produtos | Realizar entrada, Realizar saída, Transferência interna, Realizar revisão |
| Solicitações | Enviar para/da Revisão, Pendentes de aceite, Acompanhar solicitações, Histórico |
| Estoque | Saldos e lotes, Estoque e validades, Estoques e locais |
| Histórico | Movimentações, relatório de movimentações, relatório de revisões |
| Produtos | Listagem e CRUD existentes |
| PCP | Pendentes de execução, Todas as movimentações, Executadas |

Produção/Expedição continuam restritas aos envios. PCP continua na interface administrativa. O administrador mantém o seletor de modo operacional e encontra usuários em Menu e conta. A solicitação posterior ampliou o escopo para separar o perfil Revisão operacional de ADMIN: a migration `ReviewOperatorRole1789948800000` associa permissões existentes ao novo perfil `REVISAO`. Não modifica contas existentes.

## Implementação

- `apps/frontend/src/App.tsx`: composição da navegação e reutilização das telas existentes; estoque abre sem atalhos de transferência/revisão.
- `apps/frontend/src/Navigation.tsx`: componentes `SectionMenu` e `NavigationTrail`; cards, breadcrumb e Voltar.
- `apps/frontend/src/navigation-model.ts`: nomes, agrupamentos e visibilidade dos destinos.
- `apps/frontend/src/styles.css`: estilos responsivos dos cards e breadcrumb.
- `apps/frontend/src/ShipmentsPage.tsx`: parâmetros de entrada para consulta/formulário existentes; criação principal parte de Solicitações.
- `apps/frontend/src/PcpPage.tsx`: filtro inicial da consulta escolhida, mantendo os filtros editáveis e o comportamento anterior de Limpar filtros.
- `apps/frontend/src/Navigation.spec.tsx`: regressão da Home, setores, permissões, hierarquia e consultas predefinidas.

As páginas intermediárias são `operations`, `requests`, `stock-menu`, `history-menu` e `pcp-menu`. Os destinos adicionais de consultas são `shipment-new`, `shipment-sent`, `shipment-history`, `pcp-all` e `pcp-executed`. São estados internos, não URLs: o projeto já navegava por estado React. A URL `/` e a arquitetura de execução permanecem; recarregar volta ao Início. Voltar é hierárquico, sem integração nova com o histórico do navegador.

## Preservado e limitações

Regras de cálculo, saldos, status, aceite/recusa, fotos e conteúdo dos formulários operacionais permanecem. A etapa posterior altera autorização no frontend e API: somente ADMIN pode realizar entrada/saída direta, cancelar movimentações/revisões, administrar usuários e ativar/inativar cadastros. Exclusão física de histórico não foi criada. Revisão operacional acessa solicitações, transferência, revisão e consultas; produtos e locais são somente leitura nesse perfil.

“Enviar para Revisão” aparece em Produção/Expedição; “Enviar da Revisão” aparece na Revisão. Não são oferecidas direções que o setor não pode executar. O histórico de movimentações mantém a listagem atual, inclusive seus limites; nenhuma paginação de negócio foi acrescentada. O dashboard antigo permanece no código para comparação, mas não é montado na Home experimental.

## Teste local

Com as dependências e o ambiente atual configurados, em terminais separados:

```powershell
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:5173`. API: `http://localhost:3000/api/v1`. Para preparar um ambiente novo, seguir `documentos/COMO_RODAR.md` e executar `npm run db:migration:run`. A migration do novo perfil já foi aplicada ao banco configurado nesta sessão, após teste em banco descartável. Em Gerenciar usuários, atribua Revisão operacional a uma conta do setor Revisão sem marcar Administrador para obter acesso restrito.

## Validação e comparação com usuários

- Testes existentes e novos: `npm run test --workspace @estoque-revisao/frontend` — 39 testes aprovados em 16 arquivos.
- Backend: 176 testes aprovados, incluindo 15 verificações HTTP de autorização; 101 testes de integração ignorados na execução padrão por dependerem de banco de teste.
- Integração direcionada: 8 testes de usuários/perfis aprovados em PostgreSQL descartável local, incluindo todas as migrations e o perfil Revisão. O banco descartável foi removido após os testes.
- Refinamento da Home: ações diretas, retorno e restrições de Produção, Expedição, PCP e Revisão conferidos no navegador com sessões simuladas em 360, 768 e 1440 px. A API real confirmou o novo perfil disponível em `/users/roles` para ADMIN.
- Build: `npm run build` — backend e frontend compilados.
- Qualidade: `npm run lint` — sem erros ou avisos.
- Navegador Edge headless com API simulada: login, Home de consulta e de administrador nos quatro modos operacionais; abertura de entrada/saída/transferência/revisão, envio para/da Revisão, três consultas de solicitações, estoque, histórico, produtos, três consultas PCP e Voltar aprovados em 360, 768 e 1440 px. Sem erros JavaScript ou rolagem horizontal nas telas verificadas; screenshots da Home mobile/desktop inspecionados. Não houve gravações reais.
- A API local não estava em execução. A checagem de interface usa respostas simuladas; login real, gravação de operações, aceite/recusa, fotos persistidas e execução PCP com dados reais ainda precisam de validação integrada no ambiente do usuário.

Comparar tempo para localizar cada ação, entendimento de “Solicitações” versus “Movimentar produtos”, facilidade de retornar à área anterior, descoberta de pendências sem indicadores na Home e conforto de uso por toque. Conferir com operadores dos quatro setores e usuários somente de consulta. Abrir formulários e cancelar sem salvar para comparar a navegação; validar operações reais apenas no ambiente de testes habitual.
