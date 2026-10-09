# Etapa 74 — Intervalo configurável de duplicidade

O aviso de operação duplicada ganhou título de atenção, ícone e contraste nos temas claro/escuro. A tela de Configurações permite ao administrador geral ajustar o intervalo em minutos, mantendo 30 como padrão.

A configuração reutiliza `system_settings`, o guard administrativo e os rascunhos. O backend valida o intervalo e grava responsável, antes/depois e auditoria na mesma transação; cada verificação lê o valor atual sem reinício. Não foi necessária migration nem alteração das regras de saldo ou confirmação. Regras e endpoint nos documentos canônicos.

Publicação exclusiva na `develop` para o ambiente de teste, sem alterações na `main` ou no banco de produção.
