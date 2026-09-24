# Documentação do EstoqueRevisao

Este diretório é a fonte principal de contexto para desenvolvimento. Antes de alterar regras, estrutura ou arquitetura, comece por este arquivo e consulte o documento indicado para o assunto.

## Onde consultar

| Assunto | Documento |
| --- | --- |
| Regras funcionais e invariantes | [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md) |
| Stack, módulos, banco, segurança e padrões técnicos | [ARQUITETURA.md](./ARQUITETURA.md) |
| O que já está implementado na API e na interface | [FUNCIONALIDADES.md](./FUNCIONALIDADES.md) |
| Evolução do projeto, migrations, decisões substituídas e dívidas | [HISTORICO.md](./HISTORICO.md) |
| Instalação e execução local | [COMO_RODAR.md](./COMO_RODAR.md) |
| Decisão sobre separação imediata e configurações capturadas | [ADR_SEPARACAO_CONFIGURACOES.md](./ADR_SEPARACAO_CONFIGURACOES.md) |

Os quatro documentos acima são canônicos e devem ser atualizados quando uma etapa mudar o comportamento do sistema. Relatórios e ADRs anteriores permanecem em [`arquivo/`](./arquivo/README.md) apenas como evidência histórica; não devem ser usados isoladamente para determinar o comportamento atual.

Artefatos PDF/DOCX eventualmente mantidos para entrega formal constituem apenas a base original. Os Markdown canônicos incorporam as decisões incrementais posteriores e são a referência operacional atual.

## Visão geral

O EstoqueRevisao é um sistema web para controle de produtos por lote e local lógico. Atualmente oferece:

- autenticação, autorização, auditoria e logs estruturados;
- produtos com prazo padrão, gramatura para códigos unitários, conversões de unidade e locais de estoque;
- lotes e datas informados nas operações, sem cadastro prévio;
- saldo atual por produto, lote, validade e local, com confirmação de validades divergentes;
- envios Revisão ↔ Produção/Expedição, com reserva, confirmação/recusa e indicação interna;
- separação imediata opcional no recebimento Expedição → Revisão, com prazo configurável e retorno derivado;
- configurações administrativas para prazo de separação e destinos dinâmicos da revisão;
- entrada e saída diretas para outros locais externos;
- transferência interna, inclusive com troca ou criação de lote;
- revisão com distribuição de cada item entre múltiplos destinos;
- histórico de movimentações e cancelamento com estorno integral;
- fila transversal do PCP para consulta global e registro auditável da execução administrativa de movimentações concluídas;
- relatórios filtráveis de movimentações, classificação da revisão e estoque atual, com exportação CSV.

O sistema é um monólito modular: React/TypeScript/Vite no frontend, NestJS/TypeScript no backend e PostgreSQL 17 com TypeORM. Não utiliza microserviços.

## Leitura mínima antes de desenvolver

1. Leia [REGRAS_NEGOCIO.md](./REGRAS_NEGOCIO.md).
2. Leia as seções pertinentes de [ARQUITETURA.md](./ARQUITETURA.md) e [FUNCIONALIDADES.md](./FUNCIONALIDADES.md).
3. Consulte [HISTORICO.md](./HISTORICO.md) quando a tarefa evoluir uma decisão anterior.
4. Analise o código e os testes do módulo afetado antes de editar.

Não invente campos ou fluxos ainda não definidos. Mudanças de regra devem ser explícitas e registradas nestes documentos no mesmo trabalho.

## Execução local

Pré-requisitos: Node.js 22+, npm e um projeto Supabase ativo.

```powershell
Copy-Item .env.example .env
npm install
npm run db:setup
npm run db:user:create
```

Configure previamente no `.env` as senhas, a `DATABASE_URL`, o segredo JWT e o usuário bootstrap. Em terminais separados:

```powershell
npm run dev:backend
npm run dev:frontend
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Health check: `http://localhost:3000/api/v1/health`

Backend, migrations e criação de usuário usam a mesma `DATABASE_URL` do Supabase. O PostgreSQL Docker permanece apenas para testes locais isolados e não participa do fluxo operacional padrão.

## Verificações usuais

```powershell
npm run build
npm run lint
npm test
npm run db:migration:show
docker compose config --quiet
```

Testes de integração exigem um banco descartável separado em `TEST_DATABASE_URL`. Eles podem recriar todo o schema desse banco.
