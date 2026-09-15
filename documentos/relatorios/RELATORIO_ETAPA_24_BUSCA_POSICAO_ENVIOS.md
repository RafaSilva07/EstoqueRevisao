# Etapa 24 — Busca e posição nos envios

- A seleção de produto dos dois sentidos do envio agora pesquisa por código ou descrição enquanto o operador digita e sincroniza os campos ao escolher uma sugestão.
- Na saída da Revisão, o operador informa lote ou fabricação antes de selecionar a posição disponível. O resolvedor central CONSERVADI completa e exibe o outro campo imediatamente; lote, fabricação, validade, local e saldo permanecem visíveis.
- A API ganhou uma consulta paginada de posições próprias para envio. Ela restringe o acesso à Revisão, filtra produto/lote/fabricação e ordena Lata Boa antes dos demais locais.
- Foram preservados o envio com múltiplos itens, a reserva atômica e todas as validações de saldo existentes.
