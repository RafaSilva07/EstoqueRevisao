# Etapa 22 — Lotes operacionais e validades

- **Estruturas anteriores:** lote como cadastro separado, código único por produto, criação antecipada em modal e ausência de prazo padrão no produto.
- **Domínio:** produto continua mestre e passa a informar prazo em anos. CONSERVADI permanece centralizado. Entrada/transferência resolvem lote, fabricação e validade na própria transação; combinações existentes são reutilizadas.
- **Validades distintas:** confirmação informa produto/lote e datas divergentes. Aceitando, cada validade mantém saldo próprio. Revisão, saída e estorno usam a variante exata, sem misturar parcelas nem alterar datas históricas.
- **Telas/UX:** removidos menu/tela/modal de cadastro de lotes. Campos relacionados e validade sugerida/editável compartilhados pelas operações, resumo com datas, erro visível e bloqueio de duplo envio. Seletores, histórico e relatórios identificam as validades.
- **Persistência:** migration preserva referências e saldos, amplia unicidade por validade e bloqueia edição da identidade do lote. Novos itens guardam snapshot do produto; não são inventados dados para o histórico antigo. Produtos legados sem prazo continuam aceitando validade manual até configuração.

Regras completas: [REGRAS_NEGOCIO.md](../REGRAS_NEGOCIO.md). Rotas e comportamento: [FUNCIONALIDADES.md](../FUNCIONALIDADES.md).
