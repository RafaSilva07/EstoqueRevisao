# Etapa 29 — Modais de produtos e aviso de código duplicado

- Inclusão de itens em envios, entrada, saída, transferência e revisão passa a ocorrer em modal; a página mantém a lista, observação geral e conferência. Revisões permitem editar o rascunho sem alterar a lista até salvar.
- Cadastro/edição de produtos também usa modal e consulta o código durante a digitação, indicando duplicidades inclusive inativas.
- Reutilizados o modal acessível, os campos de lote, a seleção de produtos e as validações existentes. A API recebeu somente um filtro exato por código; sem alterações no banco ou nas regras de movimentação.
- Ajustado alinhamento dos controles com textos de ajuda e aproveitamento da largura no modal, mantendo rolagem em telas pequenas.
