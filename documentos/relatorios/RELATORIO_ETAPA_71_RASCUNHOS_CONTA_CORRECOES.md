# Etapa 71 — Rascunhos por conta e correções administrativas

Adicionado favicon local. Rascunhos agora permitem começar no computador e continuar no celular com a mesma conta, ambiente e modo, incluindo fotos. A API guarda versões por formulário; o cache local protege falhas de conexão, e conflitos entre dispositivos exigem escolha explícita.

Entradas aceitas oferecem atalho para o fluxo existente de revisão com produto/lote preenchidos, consultando a posição atual antes de editar quantidade e classificação.

Administradores responsáveis podem cancelar solicitações ainda não executadas no PCP, preservando histórico e motivo. Edição corrige quantidades/observações/carregamento em nova solicitação vinculada; estorno, nova reserva e auditoria são uma transação. Retorno imediato é tratado junto ao recebimento original; saldo insuficiente ou execução PCP parcial bloqueiam tudo.

Estrutura acrescentada pelas migrations `AccountFormDrafts1791331200000` e `AdministrativeShipmentCorrections1791417600000`, aplicadas ao Supabase de teste conectado ao ambiente local, preservando o catálogo e os demais dados existentes. Regras e endpoints detalhados nos documentos canônicos. Entrega somente na `develop`; produção não foi alterada.
