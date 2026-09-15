# Etapa 26 — Modo operacional do administrador

- O perfil `ADMIN` recebeu um seletor para alternar entre as interfaces de Revisão, Produção e Expedição sem novo login.
- O setor escolhido segue em um cabeçalho por requisição, aceito e validado somente para administradores; as restrições normais do setor efetivo continuam obrigatórias.
- A alternância não modifica o cadastro do usuário. Histórico e auditoria preservam a identidade real do administrador.
