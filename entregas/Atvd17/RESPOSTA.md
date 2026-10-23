# Atividade 17 — Implementação e Testes em Aplicações Web

**Projeto:** EstoqueRevisao  
**Opção escolhida:** B — Camada de Persistência  
**Branch:** `atividade/teste-persistencia-repositorio`

## Implementação

A atividade foi adaptada ao framework do projeto, conforme permitido pelo enunciado. O backend utiliza NestJS com TypeScript, TypeORM e PostgreSQL. Por isso, o equivalente ao teste de repositório com `@DataJpaTest` foi implementado com Jest e `Test.createTestingModule`, carregando o `ProductsRepository` com um repositório TypeORM conectado a um banco PostgreSQL real.

O teste está em [`products-persistence.integration.spec.ts`](codigo-fonte/products-persistence.integration.spec.ts). O arquivo original executável fica em [`apps/backend/src/modules/products/products-persistence.integration.spec.ts`](../apps/backend/src/modules/products/products-persistence.integration.spec.ts). A cópia entregue mantém exatamente o conteúdo do original; deve ser executada no contexto do projeto.

Foram implementados três casos:

1. **Persistir e recuperar uma entidade:** cria um produto por `ProductsRepository.save`, recupera-o por `findById` e confirma identificador, código, nome, unidade, estado ativo, validade padrão, gramatura, autor e data de criação. Uma contagem adicional confirma a existência do registro no PostgreSQL.
2. **Validar uma consulta personalizada:** persiste quatro produtos e chama `ProductsRepository.findAndCount` com busca `panama milho`, filtro de unidade e filtro de ativos. Confirma que somente o produto ativo `MILHO VERDE PANAMÁ` é retornado, mesmo com palavras em outra ordem e sem acento. Produtos inativos ou sem todos os termos ficam fora do resultado.
3. **Validar ausência de correspondência:** persiste um produto, pesquisa um nome inexistente e confirma lista vazia e total zero.

São utilizados `expect`, `toMatchObject`, `toBe`, `toHaveLength` e `toEqual` para validar os dados recuperados. Não há mocks de banco ou de consultas. O schema é criado pelas migrations reais do projeto; cada caso usa uma transação revertida ao final, preservando o isolamento dos dados.

## Evidências

- [`execucao-teste.png`](execucao-teste.png): captura do relatório renderizado em navegador headless, com barra verde e os três testes aprovados. Os valores vêm da execução real do Jest.
- [`resultado-jest.json`](resultado-jest.json): resultado original exportado pelo Jest, incluindo casos, estados e tempos.
- [`resultado-execucao.txt`](resultado-execucao.txt): resumo legível da execução e SHA-256 do código entregue.
- [`relatorio-testes.html`](relatorio-testes.html): relatório local que originou a captura; gerado a partir do JSON real, com aprovação somente se os três testes passarem, sem falhas ou ignorados.

## Como reproduzir

Na raiz do repositório, com Node.js 22+, dependências instaladas (`npm ci`), PostgreSQL e Chrome ou Edge instalados:

```powershell
.\entregas\executar.ps1
```

Nesta execução foi utilizado o PostgreSQL 18 instalado no computador. Para outra instalação ou uma porta disponível diferente:

```powershell
.\entregas\executar.ps1 -PostgresBin 'C:\Program Files\PostgreSQL\17\bin' -Port 55440
```

O script cria uma instância temporária em `tmp`, limitada ao endereço local `127.0.0.1`, cria o banco exclusivo `estoque_revisao_atividade_test`, executa o teste e encerra a instância em um bloco `finally`. Os arquivos temporários ficam em `tmp`, fora da entrega e do Git. Não é necessário alterar o `.env` da aplicação.

O comando dedicado `npm run test:atividade` exige `TEST_DATABASE_URL` apontando para esse banco local exclusivo. A configuração rejeita outros destinos e não aceita uma execução sem banco. O comando geral `npm test` segue a convenção do projeto de ignorar integrações quando `TEST_DATABASE_URL` não estiver definida.

A execução atualiza o JSON, o resumo, o HTML, a cópia do código e o PNG. A captura é exportada automaticamente por `capturar-relatorio.cjs`, em um perfil temporário de Chrome/Edge, sem usar as abas abertas. Ela mostra o relatório da execução; o resultado original do runner permanece no JSON.

## Conclusão

A implementação atende à Opção B: salva uma entidade e valida uma consulta personalizada do repositório, persistindo e recuperando dados em PostgreSQL com asserções automatizadas.
