# EstoqueRevisao

Sistema web para controle de estoque por produto, lote e local lógico. A aplicação usa React/TypeScript/Vite, NestJS/TypeScript e PostgreSQL 17 em uma arquitetura de monólito modular.

## Documentação

A fonte principal para desenvolvimento está em [`documentos/README.md`](./documentos/README.md). Comece por esse índice antes de alterar regras, funcionalidades ou arquitetura.

- [Regras de negócio](./documentos/REGRAS_NEGOCIO.md)
- [Arquitetura](./documentos/ARQUITETURA.md)
- [Funcionalidades implementadas](./documentos/FUNCIONALIDADES.md)
- [Histórico e decisões](./documentos/HISTORICO.md)

## Execução local

Pré-requisitos: Node.js 22+, npm e Docker Desktop com Docker Compose.

```powershell
Copy-Item .env.example .env
npm install
npm run docker:up
npm run db:migration:run
npm run db:user:create
```

Antes dos comandos, substitua no `.env` as credenciais, a `DATABASE_URL`, o segredo JWT e a senha bootstrap. Depois execute em terminais separados:

```powershell
npm run dev:backend
npm run dev:frontend
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Health check: `http://localhost:3000/api/v1/health`

O PostgreSQL roda em container. `npm run docker:down` remove container e rede, mas preserva o volume e os dados. Execute migrations após receber alterações de schema; um simples reinício do mesmo ambiente não exige reaplicar migrations já registradas.

## Verificações

```powershell
npm run build
npm run lint
npm test
npm run db:migration:show
docker compose config --quiet
```

Use um banco separado e descartável em `TEST_DATABASE_URL` para executar os testes de integração PostgreSQL.
