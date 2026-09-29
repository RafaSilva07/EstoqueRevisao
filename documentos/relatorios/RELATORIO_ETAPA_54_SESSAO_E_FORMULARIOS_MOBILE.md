# Etapa 54 — sessão e formulários mobile

Os seletores ganharam setas mais nítidas nos temas claro/escuro. Os modais no celular deixam a página rolável e acompanham a área visível quando o teclado reduz a tela.

O acesso JWT permanece curto, mas chamadas autenticadas renovam o token automaticamente uma vez, com renovação única para requisições simultâneas. A sessão tem limite de 14 horas a partir do login; a rotação do refresh não estende esse prazo. A configuração passou a usar `REFRESH_TOKEN_TTL_HOURS=14`, sem migration.
