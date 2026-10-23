# Atividade Prática em Equipe — Controle de acesso

**Projeto:** EstoqueRevisao  
**Funcionalidade escolhida:** gestão de usuários e de permissões  
**Branch:** `atividade/controle-acesso-usuarios`  
**Situação:** controle e testes já implementados no projeto; reutilizados nesta entrega.

## 1. Identificação dos dados e acessos utilizados

A gestão de usuários permite consultar, cadastrar, editar e inativar contas, além de administrar seus perfis e permissões. O enunciado recebido apresenta alguns termos ausentes; esta resposta contempla os dados utilizados, os perfis de acesso, um risco, o controle aplicado e sua evidência.

| Dado utilizado | Finalidade na funcionalidade |
| --- | --- |
| `id` e `username` | Identificar a conta e seu nome de acesso. |
| `sector` | Indicar o setor operacional: Revisão, Produção, Expedição ou PCP. |
| `roles`, `roleCodes` e permissões | Definir o perfil atribuído e as ações autorizadas. |
| `status` | Indicar se a conta está ativa ou inativa. |
| `createdAt` e `updatedAt` | Registrar os instantes de criação e atualização. |
| `password` na entrada e `passwordHash` na persistência | Definir a credencial. O serviço gera hash Argon2id; a projeção pública `PublicUser` não devolve senha nem hash. |

Esses campos foram identificados em `CreateUserDto`, `UserEntity` e `PublicUser`, no código existente. Não foram coletados dados reais de usuários para esta atividade.

O perfil autorizado a gerir contas é o **`ADMIN` geral**. A ação exige o modo administrativo; quando o cabeçalho `X-Operational-Sector` é informado, seu valor deve ser `ADMIN`. Se o cabeçalho não for informado, o guard permite o administrador geral. Perfis operacionais e administradores de área não têm acesso à gestão de usuários.

## 2. Registro de um risco de acesso indevido

**Identificador:** R-01 — Consulta administrativa por usuário sem autorização.

- **Ator:** operador autenticado com perfil `REVISAO`, sem o perfil `ADMIN`.
- **Tentativa:** enviar diretamente `GET /api/v1/users`, mesmo sem o menu administrativo disponível na interface.
- **Dados expostos se o controle não existisse:** identificadores, nomes de acesso, setores, estados das contas, perfis e permissões.
- **Impacto:** divulgação indevida de informações de contas e de sua estrutura de autorização. O mesmo grupo de rotas também permite alterações administrativas, que precisam da mesma restrição.
- **Tratamento existente:** bloquear a requisição no backend com HTTP `403 Forbidden`, antes da execução do serviço.
- **Natureza do registro:** cenário de ameaça reproduzido em teste local; não é relato de incidente em produção.

## 3. Controle implementado e já existente

O projeto já contém a restrição necessária. Conforme solicitado, ela foi reaproveitada, sem alterar regras, rotas ou testes existentes.

O `UsersController` declara `@UseGuards(AdminGuard)` na classe, protegendo todas as suas rotas. O `AdminGuard` verifica o perfil obtido em `request.user` e o modo operacional. O retorno `false` faz o NestJS negar o acesso com HTTP 403 antes de chamar o método do controller.

```typescript
@Controller('users')
@UseGuards(AdminGuard)
export class UsersController {
  // Rotas administrativas de usuarios.
}
```

```typescript
const user = request.user as AuthenticatedUser | undefined;
const mode = request.headers?.[OPERATIONAL_SECTOR_HEADER];
return Boolean(user?.roles.includes('ADMIN') && (mode === undefined || mode === 'ADMIN'));
```

Na aplicação, a autenticação também é exigida pelo `JwtAuthGuard` global. O cabeçalho de modo, sozinho, não concede perfil administrativo: o usuário precisa possuir `ADMIN`. A cópia integral do guard e do controller está em [`codigo-fonte`](codigo-fonte/).

## 4. Evidência: código e testes existentes executados

**Resultado registrado:** 29 testes aprovados em duas suítes, sem falhas ou testes ignorados. O JSON e o resumo de execução acompanham esta entrega.

Foram executadas integralmente duas suítes já presentes no repositório:

- [`users.spec.ts`](codigo-fonte/users.spec.ts): testa o `AdminGuard`, a negação sem `ADMIN`, a aceitação do administrador, a restrição de modo operacional e as validações de cadastro/edição.
- [`admin-operations.spec.ts`](codigo-fonte/admin-operations.spec.ts): executa requisições HTTP locais contra controllers e guards reais. O recorte de usuários cobre as sete rotas abaixo; a suíte completa também contém verificações de outras operações administrativas.

| Rota de usuários na API | Verificação existente |
| --- | --- |
| `GET /api/v1/users` | Listagem restrita. |
| `GET /api/v1/users/roles` | Consulta de perfis restrita. |
| `GET /api/v1/users/permissions` | Catálogo de permissões restrito. |
| `POST /api/v1/users` | Criação de contas restrita. |
| `PATCH /api/v1/users/:id` | Edição de contas restrita. |
| `DELETE /api/v1/users/:id` | Inativação de contas restrita. |
| `PATCH /api/v1/users/roles/:code/permissions` | Alteração de permissões de perfil restrita. |

Para cada uma dessas rotas, o teste verifica a recusa de `REVISAO`, `PRODUCAO`, `EXPEDICAO`, `PCP`, `ADMIN_REVISAO_EXPEDICAO` e `ADMIN_PRODUCAO_PCP`; confirma HTTP 403 e que o serviço não foi chamado. Em seguida, confirma sucesso HTTP 2xx para `ADMIN` e uma chamada ao serviço.

Trecho do teste existente:

```typescript
expect(denied.status).toBe(403);
expect(write).not.toHaveBeenCalled();
expect(allowed.ok).toBe(true);
expect(write).toHaveBeenCalledTimes(1);
```

O HTTP é real e local; as identidades são simuladas no middleware de teste e os serviços são dublês, evitando alterações em contas ou banco. Esses testes comprovam a autorização das rotas; não exercitam a validação criptográfica do JWT nem a persistência. Os cabeçalhos `test-role` e `test-permissions` pertencem apenas ao ambiente do teste. A suíte HTTP não configura o prefixo global; o controller e o guard são os mesmos usados nas rotas `/api/v1` da aplicação.

## 5. Arquivos de entrega e reprodução

- [`execucao-teste.png`](execucao-teste.png): captura do relatório renderizado em Chrome/Edge headless, com barra verde baseada nos resultados reais do Jest.
- [`resultado-jest.json`](resultado-jest.json): saída original do Jest com todos os casos e seus estados.
- [`resultado-execucao.txt`](resultado-execucao.txt): totais e lista completa dos testes aprovados.
- [`relatorio-testes.html`](relatorio-testes.html): relatório que originou o print, destacando as sete rotas de usuários.
- [`manifesto-fontes.json`](manifesto-fontes.json): caminhos e hashes SHA-256 das cópias dos arquivos existentes.
- [`codigo-fonte`](codigo-fonte/): cópias integrais de `admin.guard.ts`, `users.controller.ts`, `users.spec.ts` e `admin-operations.spec.ts`.

Com as dependências do projeto instaladas, Node.js 22+ e Chrome ou Edge, execute na raiz:

```powershell
node .\entregas\atividade-controle-acesso\executar.cjs
```

O comando executa as duas suítes originais, atualiza os arquivos de evidência e exporta o print. Não exige PostgreSQL nem acesso à aplicação publicada. Os testes e as cópias devem ser executados no contexto do repositório, pois usam os módulos reais do projeto.

O controle existente atende ao risco documentado: um perfil sem `ADMIN` é impedido de acessar a gestão de usuários diretamente pela API.
