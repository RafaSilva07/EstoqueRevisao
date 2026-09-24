# Relatório — Separação imediata e configurações

## Objetivo e fluxo

Foi adicionada a escolha de separação imediata no recebimento Expedição → Revisão. O envio pode permanecer em `EM_SEPARACAO`, com prazo individual, rascunho de quantidades e retomada posterior. Na conclusão, cada item credita somente `recebido - retorno`; itens retornados exigem foto e formam um envio derivado Revisão → Expedição.

Expirações consolidam o volume integral e descartam o rascunho. Locks e transações impedem conclusão, expiração, saldo ou retorno duplicados. O movimento original exige PCP; o retorno derivado fica consultável como PCP não necessário.

## Configurações e revisão dinâmica

A área administrativa permite alterar o prazo para novas separações e selecionar locais internos cadastrados como destinos da revisão. O frontend monta as distribuições com essa lista; o backend revalida os IDs configurados e a soma exata. Alterações futuras não modificam prazos capturados nem distribuições históricas.

## Implementação

- backend: módulo de configurações, novos estados/campos de envio, rascunhos, retorno vinculado, expiração lazy e flag de PCP;
- frontend: tela Configurações, pergunta no recebimento, tela responsiva de separação, status para Revisão/Expedição e PCP não necessário;
- ajuste visual: formulários de Configurações usam espaçamento próprio entre campos e ações, impedindo sobreposição dos botões;
- banco: `system_settings`, `review_process_destinations`, `shipment_separation_drafts`, campos/índices de separação e vínculo e `requires_pcp_execution`;
- testes: validação de DTOs, suítes unitárias existentes, lint e builds dos dois workspaces.

## Limitações

O rascunho persiste quantidades; fotos são enviadas apenas na conclusão. A expiração é processada no backend durante acessos relevantes, sem job periódico dedicado.
