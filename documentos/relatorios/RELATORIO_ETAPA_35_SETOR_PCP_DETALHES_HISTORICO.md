# Etapa 35 — Setor PCP e detalhes de históricos

## Resumo

PCP passou a ser um setor próprio vinculado ao perfil exclusivo PCP. Administradores também podem selecionar esse modo operacional e executar as ações da fila sem trocar de conta.

## Alterações

- constraint e validações de usuário aceitam o setor PCP e exigem a correspondência com o perfil PCP;
- usuários PCP existentes são migrados da Revisão para PCP;
- o seletor administrativo inclui PCP e o backend limita esse modo às permissões próprias da fila;
- linhas e cards de movimentações, relatórios, envios e atividades recentes abrem detalhes em modal central;
- os detalhes distinguem o estado operacional da movimentação do estado administrativo PCP.

## Implementação

A alteração reutiliza a projeção e os endpoints existentes do PCP. O estado de estoque continua `EFETIVADA` após a execução administrativa; somente `pcp_execution_status` transita de `PENDENTE` para `EXECUTADA`.
