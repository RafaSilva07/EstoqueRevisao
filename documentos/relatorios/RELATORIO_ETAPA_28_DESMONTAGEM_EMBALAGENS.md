# Etapa 28 — Fardos/caixas e desmontagem na revisão

- Cadastro com seleção UN/FD/CX, quantidade por embalagem e múltiplas alternativas de códigos unitários.
- Revisão escolhe um único código de saída por item e mostra a conversão antes da distribuição. Débito de embalagens e crédito de unidades ocorrem na mesma transação, preservando lote, fabricação e validade.
- Histórico guarda origem, resultado e fator; estorno utiliza esses dados para devolver as embalagens, bloqueando saldo insuficiente. Relatórios distinguem quantidades de origem das unidades produzidas.
- Reutilizados seleção de produtos, validação de lotes/validades, serviço central de saldos, auditoria e confirmação. Migration aditiva com vínculos, snapshots e constraints; dados antigos permanecem intactos e fatores ausentes exigem configuração.
