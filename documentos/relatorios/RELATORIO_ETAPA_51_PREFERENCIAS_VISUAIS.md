# Etapa 51 — preferências visuais

Todos os usuários receberam acesso a **Preferências** pelo menu, com tema claro/escuro e cor livre para o fundo geral. As escolhas são salvas na conta e aplicadas no login, mantendo superfícies e texto contrastantes. A migration `UserUiPreferences1790985600000` adiciona os dois atributos e suas constraints ao usuário; a API autenticada `GET/PATCH /auth/preferences` atende a tela.
