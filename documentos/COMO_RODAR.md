# Como rodar o EstoqueRevisao

## Pré-requisitos

- Git;
- Node.js 22 ou superior, com npm;
- projeto Supabase ativo, com acesso ao painel.

No Windows, execute os comandos abaixo em PowerShell.

## 1. Obter o projeto

```powershell
git clone https://github.com/RafaSilva07/EstoqueRevisao.git
Set-Location EstoqueRevisao
```

## 2. Configurar o ambiente

Crie o arquivo local `.env` a partir do exemplo da raiz:

```powershell
Copy-Item .env.example .env
```

Edite `.env` antes de iniciar. No mínimo:

- copie a URL **Session pooler** do Supabase para `DATABASE_URL`;
- mantenha `DATABASE_SSL=true`;
- defina `JWT_ACCESS_SECRET` com pelo menos 32 caracteres;
- mantenha `JWT_ACCESS_TTL=15m` e `REFRESH_TOKEN_TTL_HOURS=14` para a sessão de até 14 horas; se o `.env` antigo usar `REFRESH_TOKEN_TTL_DAYS`, substitua a chave pela nova e reinicie o backend;
- defina `BOOTSTRAP_USERNAME` e `BOOTSTRAP_PASSWORD` para o primeiro acesso;
- em desenvolvimento local, mantenha `FRONTEND_URL=http://localhost:5173` e `VITE_API_URL=http://localhost:3000/api/v1`.
- para fotos locais, mantenha `STORAGE_DRIVER=local` e configure `FILE_STORAGE_PATH=./storage`; o diretório é criado automaticamente e não entra no Git.

Para usar Supabase Storage, crie um bucket **privado** (por padrão `shipment-evidence`) e configure somente no backend:

```dotenv
STORAGE_DRIVER=supabase
STORAGE_BUCKET=shipment-evidence
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_sua-chave-de-backend
```

Nunca use `SUPABASE_SECRET_KEY` em variável `VITE_*`, no frontend ou no Git. Projetos antigos ainda podem usar `SUPABASE_SERVICE_ROLE_KEY`, mas a secret key atual é a opção recomendada. No ambiente publicado, use HTTPS para permitir acesso à câmera pelo navegador.

Para usar também o PostgreSQL do Supabase, copie no painel a URL **Session pooler** completa para `DATABASE_URL` e configure:

```dotenv
DATABASE_SSL=true
```

A aplicação lê somente `DATABASE_URL` e `DATABASE_SSL` para o banco. Uma variável chamada `SUPABASE_DATABASE_URL` não substitui automaticamente a conexão. Senhas com caracteres reservados de URL devem permanecer codificadas conforme a URL fornecida pelo painel.

O projeto não possui credenciais fixas. O primeiro usuário será criado com `BOOTSTRAP_USERNAME` e `BOOTSTRAP_PASSWORD` do seu `.env`, usando o perfil `ADMIN` por padrão.

## 3. Instalar dependências

```powershell
npm install
```

## 4. Preparar o banco Supabase

Confirme no painel que o projeto está ativo. Depois execute:

```powershell
npm run db:setup
npm run db:user:create
```

`db:setup` executa todas as migrations diretamente no `DATABASE_URL` do Supabase. As migrations também cadastram os perfis, permissões e locais iniciais necessários ao sistema; não há outro seed para executar.

Execute `db:user:create` somente para criar um novo usuário. Se o identificador já existir, utilize esse usuário ou altere `BOOTSTRAP_USERNAME`.

## 5. Iniciar backend e frontend

Abra dois terminais PowerShell na raiz do projeto.

Terminal 1 — backend:

```powershell
npm run dev:backend
```

Terminal 2 — frontend:

```powershell
npm run dev:frontend
```

Abra no navegador:

- aplicação: `http://localhost:5173`;
- health check da API: `http://localhost:3000/api/v1/health`.

Entre na aplicação com os valores configurados em `BOOTSTRAP_USERNAME` e `BOOTSTRAP_PASSWORD`.

## Sessão nos ambientes publicados

Nas variáveis do backend de cada ambiente (teste e produção), mantenha:

```dotenv
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_HOURS=14
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=auto
FRONTEND_URL=https://endereco-exato-do-frontend
```

`AUTH_COOKIE_SAME_SITE` é opcional: sem a variável, `auto` adapta o cookie para frontend HTTPS externo (Pages/Railway). No localhost usa `Strict`; em HTTP local o exemplo mantém `AUTH_COOKIE_SECURE=false`. Frontend e backend precisam utilizar o mesmo hostname local, sem misturar `localhost` e `127.0.0.1`.

No frontend publicado, `VITE_API_URL` precisa apontar para a API do mesmo ambiente, incluindo `/api/v1`. Após publicar a correção, entre novamente para receber o cookie atualizado. Atualizar a página e renovar o JWT não prolongam o limite de 14 horas. Mudar senha/permissões ou sair ainda pode encerrar a sessão antes desse limite.

POSTs de `/auth/login`, `/auth/refresh` e `/auth/logout` exigem `Origin` igual à origem de `FRONTEND_URL`; o navegador envia automaticamente. Em clientes como curl/Postman, envie esse cabeçalho explicitamente. Um `403/AUTH_ORIGIN_NOT_ALLOWED` indica origem incorreta/ausente, não senha inválida. CORS não substitui essa validação.

Cookies externos usam `Partitioned` para navegadores compatíveis. Se o navegador bloquear também esse cookie ou não suportar o recurso, disponibilize a API no mesmo site do frontend via domínio/proxy; aumentar `JWT_ACCESS_TTL` não resolve esse bloqueio. A coordenação entre abas exige Web Locks (HTTPS ou localhost); sem suporte, só as requisições da mesma aba são coordenadas.

## Usuários de Produção e Expedição

No `.env` da raiz, configure um novo `BOOTSTRAP_USERNAME`, uma senha forte em `BOOTSTRAP_PASSWORD` e `BOOTSTRAP_ROLE_CODE=PRODUCAO` ou `EXPEDICAO`. Execute `npm run db:user:create` para cada usuário. O script usa Argon2id e vincula o setor ao perfil; `ADMIN` continua na Revisão. Não recrie usuários existentes nem compartilhe a conta administrativa com setores externos.

## PostgreSQL Docker opcional para testes

O Docker não é usado pelo backend no fluxo padrão. Os comandos abaixo servem somente quando for necessário um banco local descartável para testes:

```powershell
npm run docker:down
```

Para iniciar o container de testes:

```powershell
npm run docker:up
```

Esses comandos não alteram `DATABASE_URL`; backend, migrations e bootstrap continuam usando o Supabase. Não use `docker compose down -v` se quiser manter os dados locais de teste.

## Verificações úteis

```powershell
npm run db:migration:show
Invoke-WebRequest http://localhost:3000/api/v1/health
```

Para acompanhar os logs do PostgreSQL opcional de testes:

```powershell
npm run docker:logs
```

## Erros comuns

- **Docker não conecta:** isso não impede o uso normal do Supabase; Docker é necessário apenas para testes locais isolados.
- **Frontend abre, mas não carrega dados:** confirme que PostgreSQL e backend também estão ativos, abra o health check e confira `VITE_API_URL` e `FRONTEND_URL` no `.env`.
- **Migration não conecta:** recopie a URL Session pooler completa para `DATABASE_URL`, confirme `DATABASE_SSL=true` e valide se o projeto está ativo no painel do Supabase.
- **Supabase retorna `ECONNRESET`, `DATABASE_UNAVAILABLE` ou `PGRST002`:** confirme `DATABASE_SSL=true`, recopie a URL Session pooler em **Connect** e verifique no painel se o projeto/banco está ativo. Se a API REST do próprio projeto também responder `PGRST002`, reinicie o projeto pelo painel; persistindo, acione o suporte do Supabase.




| Setor | Usuário | Senha |
|---|---|---|
| Revisão/Admin | `teste.revisao` | `Revisao#Teste2026!` |
| Produção | `teste.producao` | `Producao#Teste2026!` |
| Expedição | `teste.expedicao` | `Expedicao#Teste2026!` |
