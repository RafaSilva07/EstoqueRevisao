# Como rodar o EstoqueRevisao

## Pré-requisitos

- Git;
- Node.js 22 ou superior, com npm;
- Docker Desktop com Docker Compose.

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

- substitua `POSTGRES_PASSWORD` e use a mesma senha dentro de `DATABASE_URL`;
- mantenha `POSTGRES_PORT` igual à porta de `DATABASE_URL`;
- defina `JWT_ACCESS_SECRET` com pelo menos 32 caracteres;
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

O projeto não possui credenciais fixas. O primeiro usuário será criado com `BOOTSTRAP_USERNAME` e `BOOTSTRAP_PASSWORD` do seu `.env`, usando o perfil `ADMIN` por padrão.

## 3. Instalar dependências

```powershell
npm install
```

## 4. Iniciar PostgreSQL e preparar o banco

Abra o Docker Desktop e aguarde o mecanismo ficar disponível. Depois execute:

```powershell
npm run db:setup
npm run db:user:create
```

`db:setup` cria/inicia o container PostgreSQL e executa todas as migrations. As migrations também cadastram os perfis, permissões e locais iniciais necessários ao sistema; não há outro seed para executar.

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

## Usuários de Produção e Expedição

No `.env` da raiz, configure um novo `BOOTSTRAP_USERNAME`, uma senha forte em `BOOTSTRAP_PASSWORD` e `BOOTSTRAP_ROLE_CODE=PRODUCAO` ou `EXPEDICAO`. Execute `npm run db:user:create` para cada usuário. O script usa Argon2id e vincula o setor ao perfil; `ADMIN` continua na Revisão. Não recrie usuários existentes nem compartilhe a conta administrativa com setores externos.

## Parar ou reiniciar o PostgreSQL

Para remover o container e a rede, preservando os dados no volume:

```powershell
npm run docker:down
```

Para iniciar novamente:

```powershell
npm run docker:up
```

Não use `docker compose down -v` se quiser manter os dados; a opção `-v` apaga o volume do banco.

## Verificações úteis

```powershell
docker compose ps
npm run db:migration:show
Invoke-WebRequest http://localhost:3000/api/v1/health
```

Para acompanhar os logs do PostgreSQL:

```powershell
npm run docker:logs
```

## Erros comuns

- **Docker não conecta ou menciona `dockerDesktopLinuxEngine`:** abra o Docker Desktop, aguarde a inicialização e repita `npm run docker:up`.
- **Porta do PostgreSQL ocupada:** altere `POSTGRES_PORT` e a porta de `DATABASE_URL` para o mesmo valor livre; depois reinicie o container.
- **Falha de autenticação do PostgreSQL após trocar a senha:** volumes existentes mantêm a senha usada na primeira criação. Restaure a senha anterior ou, somente se puder descartar os dados locais, execute `docker compose down -v` e refaça `npm run db:setup`.
- **Frontend abre, mas não carrega dados:** confirme que PostgreSQL e backend também estão ativos, abra o health check e confira `VITE_API_URL` e `FRONTEND_URL` no `.env`.
- **Migration não conecta:** confira `docker compose ps`, `DATABASE_URL` e se a porta configurada coincide com `POSTGRES_PORT`.




| Setor | Usuário | Senha |
|---|---|---|
| Revisão/Admin | `teste.revisao` | `Revisao#Teste2026!` |
| Produção | `teste.producao` | `Producao#Teste2026!` |
| Expedição | `teste.expedicao` | `Expedicao#Teste2026!` |
