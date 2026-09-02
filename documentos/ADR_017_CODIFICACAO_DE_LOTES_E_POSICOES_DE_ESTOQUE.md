# ADR 017 — Codificacao de lotes e posicoes de estoque

- Status: aceito
- Data: 2026-09-01
- Escopo: rastreabilidade de lotes e nucleo de saldo atual

## Contexto

O cadastro de lotes da etapa 2 aceitava um codigo livre e validade opcional. A etapa 3 estabeleceu que o codigo representa a data de fabricacao no formato `DDMMYY`, substituindo cada digito pela letra correspondente em `CONSERVADI`: 0=C, 1=O, 2=N, 3=S, 4=E, 5=R, 6=V, 7=A, 8=D e 9=I.

O sistema tambem precisa manter o saldo atual por produto, lote e local antes da implementacao dos documentos de movimentacao. Esse saldo deve ser seguro sob concorrencia, mas nao pode se tornar uma via publica para alteracoes sem historico.

## Decisao

### Lotes

- O codigo possui exatamente seis letras da tabela `CONSERVADI` e e armazenado em maiusculas.
- A conversao entre codigo e data fica centralizada no `BatchCodeCodec`, usado pela criacao, edicao e rota de apoio ao formulario.
- O ano de dois digitos usa a janela fixa e deterministica de 2000 a 2099: `00` representa 2000 e `99` representa 2099.
- Datas impossiveis sao rejeitadas pela aplicacao e o banco limita a data de fabricacao a essa janela.
- A validade e obrigatoria, informada manualmente e nao pode anteceder a fabricacao.
- Se codigo e fabricacao forem enviados juntos, os dois devem representar a mesma data.

### Posicoes de estoque

- Uma posicao e identificada unicamente por produto, lote e local logico.
- O lote deve pertencer ao mesmo produto da posicao; a integridade tambem e protegida por chave estrangeira composta.
- A quantidade usa `numeric(18,6)`, nao pode ser negativa e e alterada apenas por um servico interno que recebe o `EntityManager` da transacao chamadora.
- Adicoes usam `INSERT ... ON CONFLICT` atomico. Remocoes usam `UPDATE` condicional atomico, exigindo saldo suficiente na propria instrucao SQL.
- A API publica expoe somente consulta paginada e detalhe, protegidos por `stock-positions.read`.
- Leituras comuns de saldo nao geram auditoria. As futuras operacoes de movimentacao deverao auditar o documento operacional dentro da mesma transacao.

## Consequencias

- A regra de codificacao pode ser testada e reutilizada sem duplicacao entre fluxos.
- O saldo atual fica preparado para entradas, saidas e transferencias, sem antecipar esses modulos.
- Operacoes concorrentes nao criam posicoes duplicadas nem permitem saldo negativo.
- Alteracoes de saldo fora de uma transacao operacional nao sao oferecidas por controller.
- Registros legados com codigo livre ou validade ausente precisam ser corrigidos antes da migration desta etapa; a migration falha de forma explicita para impedir conversao silenciosa ou inventada.

## Alternativas nao adotadas

- Inferir o seculo pela data atual: produziria resultados diferentes ao longo do tempo.
- Manter codigo livre em paralelo: permitiria divergencia entre o lote e sua fabricacao.
- Expor endpoints CRUD de saldo: permitiria mudancas sem documento, auditoria operacional ou regra de negocio.
- Calcular todo saldo lendo o historico futuro: adiado, pois a posicao materializada oferece consulta eficiente e sera atualizada transacionalmente pelos documentos operacionais.
