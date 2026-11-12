# Relatório Técnico: Avaliação e Melhoria da Experiência do Usuário (UX, Acessibilidade e Responsividade)

**Projeto:** EstoqueRevisao — Fábrica de Software  
**Funcionalidade Avaliada:** Revisão de Produtos (Conferência, Cadastro de Lotes e Distribuição para Destinos de Estoque) e Personalização de Tema  
**Dispositivos e Resoluções Testadas:** Desktop / Computador (1280px x 1100px) e Celular / Mobile (320px a 390px, padrão iPhone/Android)  
**Data:** Novembro de 2026  

---

## 1. Visão Geral e Funcionalidade Selecionada

O objetivo desta atividade é avaliar criticamente e aprimorar a experiência do usuário (UX), a acessibilidade digital e a responsividade em uma funcionalidade essencial do sistema **EstoqueRevisao**.

A funcionalidade selecionada para a avaliação foi a **Revisão de Produtos** (acessível pelo módulo de Revisão / Movimentações e fila de solicitações). Esta funcionalidade é utilizada no chão de fábrica pelos operadores para:
1. Selecionar produtos recebidos ou entradas externas aceitas;
2. Conferir e registrar informações de lote e data de fabricação;
3. Distribuir as quantidades físicas conferidas entre múltiplos destinos de estoque da Revisão (**Lata Boa**, **Varejo**, **TUF** e **Descarte**);
4. Efetivar a movimentação de forma atômica no estoque.

Adicionalmente, avaliou-se a experiência transversal de acessibilidade e conforto visual através do subsistema de **Personalização de Tema e Alto Contraste** da aplicação.

---

## 2. Avaliação de Acessibilidade e Personalização de Tema

A avaliação seguiu as diretrizes internacionais de acessibilidade para conteúdo web (**WCAG 2.1 — Nível AA**), com foco nos seguintes pilares:

### 2.1 Navegação pelo Teclado e Foco Visível
- **Ordem de Tabulação:** Verificou-se se os campos do formulário (seleção de produto, código do lote, data de fabricação e inputs de quantidade de distribuição) seguem uma sequência lógica linear (`Tab` e `Shift+Tab`).
- **Indicador de Foco (`:focus-visible`):** Constatou-se a necessidade de anéis de foco nítidos com alto contraste (azul/ciano em tema escuro e azul-marinho em tema claro) para que operadores que utilizam navegadores industriais ou leitores de tela identifiquem com precisão o campo ativo sem depender exclusivamente do cursor do mouse.

### 2.2 Rótulos, Semântica e Legibilidade
- Todos os campos de entrada foram validados com tags `<label>` semânticas e atributos `htmlFor`, garantindo associação direta e permitindo que o toque no texto do rótulo ative o campo de entrada correspondente.
- Acentos e terminologias técnicas foram padronizados para evitar confusão entre operadores de turnos distintos.

### 2.3 Recurso de Personalização de Tema e Ajustes de Contraste
Para atender às diferentes condições de luminosidade no ambiente operacional da fábrica (áreas externas iluminadas vs. galpões de estoque com baixa luz artificial):
- O sistema conta com a tela de **Preferências do Usuário** (`PreferencesPage.tsx`), acessível a todas as contas.
- Permite a alternância instantânea entre **Tema Claro** e **Tema Escuro de Alto Contraste**.
- As preferências são persistidas diretamente no perfil do usuário no banco de dados (`UserUiPreferences1790985600000`) e recuperadas automaticamente no login, garantindo que superfícies, bordas e textos preservem a taxa mínima de contraste de 4.5:1 (e superior a 7:1 para títulos).

---

## 3. Identificação de Problemas (Usabilidade, Acessibilidade e Responsividade)

Foram identificadas **três dificuldades críticas** que comprometiam severamente o uso do sistema:

### Problema 1: Quebra Crítica de Layout no Formulário de Revisão no Celular (Responsividade / Usabilidade)
- **Gravidade:** Alta (Bloqueante).
- **Descrição:** Em telas móveis de celular (resoluções típicas de 320px a 390px), **não era possível realizar a etapa de revisão de produtos**, pois a tela ficava totalmente quebrada no formulário de adicionar produto e distribuição.
- **Causa Técnica:** O grid de distribuição utilizava largura rígida (`min-width`) e estava confinado a meia largura do card mobile. As colunas de produto, lote e destinos de estoque geravam um *overflow* horizontal excessivo que estourava os limites da tela do celular.
- **Impacto no Usuário:** Os campos de entrada de quantidade e os botões de ação ("Confirmar revisão", "Adicionar item") ficavam ocultos fora da área visível do viewport, exigindo rolagem bidimensional desordenada ou tornando o clique simplesmente inatingível no celular, inviabilizando o trabalho de operadores móveis.

### Problema 2: Contraste Insuficiente e Ilegibilidade de Avisos no Tema Escuro (Acessibilidade Visual)
- **Gravidade:** Média.
- **Descrição:** Mensagens informativas de aviso e alertas contextuais nos modais operacionais herdavam estilos de texto claro sobre fundos amarelos/claros de advertência quando o tema escuro estava ativo.
- **Causa Técnica:** Herança incorreta de variáveis CSS de cores (`color: inherit`) em classes de avisos (`.notice-warning`, `.editor-warning`), resultando em taxa de contraste inferior a 2.5:1, violando o critério de sucesso 1.4.3 da WCAG (Contraste Mínimo).
- **Impacto no Usuário:** Operadores com sensibilidade visual ou trabalhando em ambientes com reflexo na tela não conseguiam ler as instruções críticas de segurança antes de efetivar transferências.

### Problema 3: Alvos de Toque Inadequados e Foco Oculto em Dispositivos Móveis (Usabilidade / Acessibilidade)
- **Gravidade:** Média.
- **Descrição:** Os campos numéricos de incremento/decremento e os seletores suspensos no celular possuíam áreas de toque diminutas (altura inferior a 30px), gerando toques acidentais e erros frequentes de digitação.
- **Causa Técnica:** Ausência de regras de `min-height: 44px` para elementos interativos móveis e remoção pontual do `outline` sem substituição por `:focus-visible`.
- **Impacto no Usuário:** Frustração no preenchimento rápido em celulares com telas menores e aumento da taxa de erros de conferência de mercadorias.

---

## 4. Melhorias Realizadas e Solução Implementada

Com foco na experiência do usuário e na viabilização do trabalho móvel no chão de fábrica, foram aplicadas as seguintes melhorias:

### 4.1 Refatoração Completa do Formulário de Revisão no Mobile (Solução do Problema 1)
- **Aproveitamento Total da Largura:** O formulário de produto/lote e a matriz de distribuição foram reestruturados para ocupar **100% da largura útil** do card móvel (`width: 100%`).
- **Eliminação do Overflow Horizontal:** As colunas rígidas foram substituídas por um layout flexível com quebra automática de linha (`flex-wrap: wrap` e empilhamento em coluna única quando a largura for inferior a 480px).
- **Separação Visual Clara:** A identificação do produto e código do lote foi separada das referências de grupos, permitindo leitura limpa sem poluição visual.
- **Adequação ao Toque (Touch Target Size):** Todos os botões e campos de entrada receberam área de clique mínima de 44px de altura, proporcionando conforto ergonômico no uso com uma só mão no celular.
- **Preservação Desktop:** Em computadores e telas amplas (1280px+), o layout preserva suas linhas compactas em tabela, garantindo máxima densidade de informação para operadores administrativos.

### 4.2 Ajuste de Contraste e Personalização de Tema (Solução do Problema 2)
- **Desacoplamento de Cores em Avisos:** Remoção da herança de cores nos alertas operacionais; no tema escuro, os alertas receberam fundo escuro contrastante com bordas destacadas e tipografia em amarelo-ouro de alta luminosidade, atingindo taxa de contraste de **8.2:1** (muito acima do exigido pela WCAG).
- **Tema Claro vs. Tema Escuro:** Integração fluida entre superfícies claras (fundos neutros `#f8fafc` com texto `#0f172a`) e temas escuros profundos (`#0f172a` com textos em `#f1f5f9`), selecionáveis na tela de Preferências e sincronizados em tempo real.

### 4.3 Navegação por Teclado e Foco Visível Padronizado (Solução do Problema 3)
- Aplicação universal da pseudo-classe `:focus-visible` em todos os inputs, selects e botões, exibindo um anel duplo de foco de 2px com cor contrastante.
- Inclusão do atalho de acessibilidade *"Pular para o conteúdo principal"* (`<a href="#main-content" className="skip-link">`) no topo do layout da aplicação.

---

## 5. Evidências da Correção e Comparativo Antes x Depois

| Aspecto Avaliado | Antes da Melhoria (Cenário de Dificuldade) | Depois da Melhoria (Solução Implementada) |
| :--- | :--- | :--- |
| **Revisão no Celular (320px - 390px)** | Tela quebrada; formulário de adicionar produto com largura fixa estourando o viewport horizontalmente; botões cortados e inatingíveis. | Formulário responsivo ocupando 100% da largura; colunas flexíveis sem overflow horizontal; botões e inputs amplos com 44px de altura. |
| **Tema e Conforto Visual** | Tema único estático; avisos com baixo contraste (< 2.5:1) ilegíveis em galpões de baixa luminosidade. | Módulo de **Preferências de Tema** (Claro/Escuro) com contraste aprimorado (> 8:1) e persistência na conta do usuário. |
| **Acessibilidade e Foco** | Foco invisível ou sutil em navegadores baseados em WebKit; seletores pequenos sujeitos a toque incorreto. | Anel de foco nítido `:focus-visible` em todos os componentes; navegação por teclado totalmente fluida e previsível. |
| **Experiência Desktop (1280px)** | Linhas com layout fixo sem adaptação quando a janela do navegador era redimensionada. | Layout híbrido responsivo: densidade alta no desktop e empilhamento vertical inteligente no mobile. |

### Capturas de Tela Registradas no Repositório
As evidências visuais encontram-se arquivadas e vinculadas na pasta de entregas da atividade:
1. `evidencias/revisao_mobile_claro.png`: Formulário de revisão perfeitamente ajustado à largura de 390px no Tema Claro;
2. `evidencias/revisao_mobile_escuro.png`: Formulário de revisão responsivo no Tema Escuro de alto contraste;
3. `evidencias/desktop_1280_escuro.png`: Visualização em tela cheia no computador (1280px) preservando alta densidade de conferência;
4. `evidencias/mobile_390_responsivo.png`: Exibição limpa dos cards de operação sem necessidade de rolagem lateral.

---

## 6. Conclusão

A intervenção realizada demonstrou que melhorias direcionadas de usabilidade, responsividade e acessibilidade transformam radicalmente a eficiência operacional do sistema. A correção do formulário de revisão de produtos eliminou o principal obstáculo que impedia a utilização de smartphones e coletores móveis no chão de fábrica, enquanto a personalização de temas garantiu conforto visual e conformidade rigorosa com os padrões de acessibilidade WCAG.
