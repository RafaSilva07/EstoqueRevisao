# Etapa 21 — Tela de login

**Conceito:** organização em movimento. Azul-petróleo da identidade atual, formulário claro e composição geométrica de prateleira e caixa no desktop. No celular, marca compacta e foco integral no formulário.

**Mudanças:** login isolado em `Login.tsx` e `login.css`, com tipografia, espaçamento, campos de 52 px, labels explícitas, ícones discretos, foco visível e erro com título e mensagem. `App.tsx` importa o componente; apenas os estilos antigos do login foram retirados de `styles.css`.

**Interações:** caixa com movimento leve por dois ciclos, pausado ao interagir; transições de foco nos campos e ícones; botão com spinner e mensagem de processamento; bloqueio de envios duplicados; entrada sutil da mensagem de erro. Animações e transições desativadas com `prefers-reduced-motion`. Sucesso segue imediatamente para o sistema.

**Validação:** build, lint e 11 testes existentes aprovados. Navegador Edge com API simulada: nove larguras entre 320 e 1440 px, processamento e erro em 320 px, teclado, envio duplicado, preservação dos campos, redução de movimento e navegação após sucesso. Capturas mobile e desktop inspecionadas; sem overflow horizontal nos cenários. Evidências locais em `tmp/ui-validation/login-*`.

Autenticação, endpoints, tokens, sessão e demais telas preservados. Sem novas dependências no aplicativo. O build continua com o aviso de bundle acima de 500 kB.
