# Etapa 69 — Renovação de sessão

O cookie fixo `SameSite=Strict` não atendia frontend e API em sites diferentes. A rotação também era coordenada somente dentro de uma aba, permitindo disputas pelo cookie compartilhado.

O backend agora resolve SameSite automaticamente por ambiente, preserva HttpOnly/Secure e usa cookie particionado quando necessário. Um guard valida a origem nas chamadas de login, refresh e logout. O frontend serializa essas chamadas entre abas com Web Locks, sem guardar tokens em Web Storage.

Permanecem o JWT curto e a sessão máxima de 14 horas, além de revogação, rotação e auditoria existentes. Não houve migration. Configuração e limitações de navegadores antigos estão em [COMO_RODAR.md](../COMO_RODAR.md#sessão-nos-ambientes-publicados).
