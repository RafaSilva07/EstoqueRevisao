# Relatório da Etapa 01 - Fundação Técnica

## Identificação

| Campo | Valor |
| --- | --- |
| Projeto | EstoqueRevisao |
| Etapa | 01 - Fundação técnica do sistema |
| Data de conclusão | 31/08/2026 |
| Status | Concluída e validada |
| Branch | `main` |
| Commit da implementação | [`66236dd`](https://github.com/RafaSilva07/EstoqueRevisao/commit/66236dd84bdad57810f0e558abd87ede7f99e573) |

## 1. Objetivo da etapa

Construir a base técnica do EstoqueRevisao para permitir o desenvolvimento incremental dos módulos do MVP, sem antecipar as funcionalidades completas de estoque, movimentações ou revisão.

A etapa contemplou a estrutura dos aplicativos, persistência, migrations, autenticação, autorização, auditoria, logs, validação, tratamento de erros, health check e preparação operacional do projeto.

## 2. Documentos oficiais utilizados

As decisões foram implementadas a partir dos documentos oficiais existentes no projeto:

- [Definição Funcional do Sistema](./Definicao_Funcional_Sistema_Estoque_Revisao.docx.pdf);
- [Arquitetura e Estrutura do Sistema](./Arquitetura_e_Estrutura_Sistema_Estoque_Revisao.docx.pdf).

Não foram identificadas inconsistências impeditivas entre os documentos. Os pontos ainda não definidos, como a matriz detalhada de permissões e o modelo completo dos módulos de negócio, foram mantidos em aberto sem criação de regras fictícias.

## 3. Stack e arquitetura implementadas

| Camada | Tecnologia/decisão |
| --- | --- |
| Organização | npm workspaces |
| Frontend | React, TypeScript e Vite |
| Backend | Node.js, TypeScript e NestJS |
| API | REST/JSON versionada em `/api/v1` |
| Persistência | PostgreSQL e TypeORM |
| Arquitetura | Monólito modular |
| Autenticação | JWT de curta duração e refresh token rotativo |
| Senhas | Argon2id com salt e custos configuráveis |
| Testes | Jest no backend e Vitest preparado no frontend |
| Qualidade | ESLint 10, TypeScript estrito e npm audit |

O backend foi organizado por responsabilidades, com módulos independentes para autenticação, usuários, auditoria e health check, além das infraestruturas compartilhadas de configuração, banco, logs, erros e segurança.

## 4. Principais entregas

### 4.1 Estrutura do projeto

- workspace único com `apps/backend` e `apps/frontend`;
- comandos centralizados para build, desenvolvimento, testes, lint e migrations;
- configuração TypeScript separada por aplicação;
- `.gitignore`, `.dockerignore`, `.editorconfig` e `.gitattributes`;
- frontend mínimo capaz de consultar a disponibilidade da API;
- estrutura preparada para containerização futura, sem tornar Docker obrigatório no desenvolvimento.

### 4.2 Configuração e variáveis de ambiente

Foi criado o arquivo `.env.example` com as configurações necessárias para:

- ambiente e portas;
- URLs do frontend e da API;
- conexão e SSL do PostgreSQL;
- segredo e validade do JWT;
- duração do refresh token;
- proteção do cookie de autenticação;
- custos do Argon2id;
- nível de logs;
- diretório futuro de armazenamento de arquivos;
- criação controlada do primeiro usuário.

As variáveis utilizadas pelo backend são validadas durante a inicialização. Segredos e credenciais reais permanecem fora do repositório.

### 4.3 PostgreSQL e migrations

A migration inicial criou somente as entidades necessárias para a fundação:

- `users`;
- `roles`;
- `permissions`;
- `user_roles`;
- `role_permissions`;
- `auth_sessions`;
- `audit_logs`;
- `schema_migrations`, gerenciada pelo TypeORM.

Foram adicionados:

- chaves primárias UUID geradas pela aplicação;
- chaves estrangeiras e regras explícitas de exclusão;
- unicidade case-insensitive do identificador de usuário;
- constraints para status, hashes e campos obrigatórios;
- índices para sessões ativas, entidades auditadas, usuários e request IDs;
- colunas de data com `timestamptz`;
- `synchronize: false`, tornando migrations obrigatórias para alterações de schema.

Não foram criadas tabelas ou campos de estoque, produtos, lotes, movimentações ou revisões nesta etapa.

### 4.4 Autenticação

Foram implementadas as seguintes rotas:

| Método | Rota | Responsabilidade |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Validar credenciais e iniciar sessão |
| `POST` | `/api/v1/auth/refresh` | Rotacionar o refresh token e renovar o acesso |
| `POST` | `/api/v1/auth/logout` | Revogar a sessão e remover o cookie |
| `GET` | `/api/v1/auth/me` | Retornar o usuário autenticado |

Decisões de segurança aplicadas:

- senhas armazenadas exclusivamente como hash Argon2id;
- salt individual gerado pelo próprio algoritmo;
- parâmetros de custo configuráveis por ambiente;
- access token JWT com duração curta;
- refresh token aleatório armazenado no banco somente como hash SHA-256;
- rotação do refresh token com lock transacional;
- cookie `HttpOnly`, `SameSite=Strict` e `Secure` configurável;
- consulta da sessão no backend em cada acesso;
- revogação efetiva no logout;
- mensagens de credenciais inválidas sem revelar a existência do usuário;
- ausência de cadastro público de usuários.

Também foi criado o comando `npm run db:user:create`, que gera o primeiro usuário com senha segura, sem atribuir permissões presumidas e registrando a criação na auditoria.

### 4.5 Autorização

A base de autorização utiliza:

- perfis persistidos em banco;
- permissões granulares persistidas em banco;
- relacionamento muitos-para-muitos entre usuários, perfis e permissões;
- guard global de autenticação;
- guard global de permissões;
- decorator `@Public()` para rotas públicas;
- decorator `@RequirePermissions()` para os módulos futuros.

Nenhuma matriz de permissões foi inventada. O usuário criado pelo bootstrap começa sem permissões, respeitando o princípio de menor privilégio.

### 4.6 Auditoria

A auditoria foi mantida separada dos logs técnicos e do futuro histórico operacional de estoque.

Cada registro pode armazenar:

- usuário responsável;
- ação;
- tipo e identificador da entidade;
- resultado;
- valores anteriores e novos em JSON estruturado;
- IP;
- user-agent;
- request ID;
- data e hora.

O `AuditService` aceita o mesmo `EntityManager` utilizado pela operação chamadora. Dessa forma, operações futuras poderão confirmar ou reverter conjuntamente movimentação, saldo e auditoria.

Não existem endpoints para editar ou excluir registros de auditoria.

### 4.7 Logs e correlação

Foi implementada infraestrutura de logs estruturados em JSON com:

- timestamp em ISO 8601;
- nível do log;
- contexto;
- request ID;
- duração, método, rota e status das requisições;
- remoção defensiva de campos relacionados a senha, token, cookie, autorização e segredos;
- saída separada entre logs normais e erros.

Corpos de requisição não são registrados pelo middleware HTTP.

### 4.8 Validação e erros

O backend utiliza validação global com:

- DTOs tipados;
- remoção de campos não declarados;
- rejeição de propriedades extras;
- transformação controlada;
- limites de tamanho para entradas de autenticação.

As respostas de erro seguem o formato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A requisicao contem dados invalidos.",
    "requestId": "uuid",
    "timestamp": "ISO-8601",
    "path": "/api/v1/recurso"
  }
}
```

Erros internos não expõem stack trace ou detalhes de infraestrutura ao cliente.

### 4.9 Health check

Foi criado o endpoint público `GET /api/v1/health`, que verifica:

- disponibilidade da aplicação;
- conectividade com o PostgreSQL;
- timestamp da resposta.

Falhas no banco retornam resposta padronizada com status `503`.

## 5. Validações executadas

| Verificação | Resultado |
| --- | --- |
| Build do backend | Aprovado |
| Build do frontend | Aprovado |
| ESLint | Aprovado, sem warnings |
| Testes unitários | 2 suítes e 2 testes aprovados |
| Auditoria de dependências | 0 vulnerabilidades |
| Aplicação da migration | Aprovada em PostgreSQL 17 |
| Listagem da migration | Aprovada |
| Rollback da migration | Aprovado |
| Reaplicação da migration | Aprovada |
| Health check | HTTP 200 |
| Requisição inválida | HTTP 400 |
| Login | HTTP 200 |
| Consulta do usuário autenticado | HTTP 200 |
| Rotação do refresh token | HTTP 200 |
| Logout | HTTP 204 |
| Uso de sessão revogada | HTTP 401 |

O PostgreSQL 17 foi executado em container temporário exclusivamente para validação. O container, o banco e as credenciais temporárias foram removidos após os testes.

## 6. Problemas encontrados e corrigidos

Durante a validação foram identificados e resolvidos:

1. Identificador inicial da migration fora do padrão de 13 dígitos esperado pelo TypeORM. Foi substituído por epoch em milissegundos e validado com rollback e reaplicação.
2. Interoperabilidade CommonJS do `cookie-parser` na execução compilada. A configuração TypeScript foi corrigida e o backend reiniciado com sucesso.
3. Lock pessimista aplicado também aos `LEFT JOINs` durante refresh/logout. O lock foi restringido à tabela de sessões, permitindo rotação concorrente segura no PostgreSQL.
4. Wildcard legado no registro do middleware no NestJS 11. A rota foi atualizada para o formato atual, eliminando o aviso de inicialização.
5. ESLint 9 fora da janela de suporte. O conjunto de lint foi atualizado para ESLint 10 e novamente validado.

## 7. Itens fora do escopo

Conforme definido para esta etapa, não foram implementados:

- cadastro completo de produtos;
- lotes e conversões de unidade;
- saldos por estoque/subestoque;
- entradas, saídas e transferências;
- processo de revisão;
- transformação de produtos para Varejo;
- controle de fotos e anexos;
- notificações;
- relatórios operacionais;
- mapa de localizações físicas.

## 8. Pendências para etapas futuras

- definir e aprovar a matriz oficial de perfis e permissões;
- implementar a administração de usuários;
- criar o modelo detalhado dos módulos de negócio;
- definir contratos REST dos próximos módulos;
- ampliar testes unitários e adicionar testes de integração permanentes;
- adicionar testes do frontend quando existirem fluxos funcionais;
- definir storage de anexos, backup, retenção e restauração;
- criar os artefatos de containerização e produção quando o ambiente for definido.

## 9. Execução local resumida

```powershell
Copy-Item .env.example .env
npm install
npm run db:migration:run
npm run db:user:create
npm run dev:backend
```

Em outro terminal:

```powershell
npm run dev:frontend
```

As instruções completas estão no arquivo [README principal](../README.md).

## 10. Conclusão

A etapa 01 foi concluída com uma fundação modular, validada e consistente com a documentação oficial. O projeto está preparado para receber os módulos do MVP sem refatoração estrutural significativa e sem antecipar regras de negócio ainda não detalhadas.

Os próximos relatórios deverão seguir o padrão de nome `RELATORIO_ETAPA_XX_DESCRICAO.md` e ser armazenados nesta pasta após a conclusão de cada etapa.
