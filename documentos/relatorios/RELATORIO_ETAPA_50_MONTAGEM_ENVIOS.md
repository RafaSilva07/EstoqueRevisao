# Etapa 50 — montagem de fardos e caixas no envio

Resumo: a Revisão pode enviar à Expedição embalagens FD/CX montadas de unidades vinculadas. A tela sugere a capacidade por posição e o combinado do lote; somente no `Lote 0 — datas misturadas` usa o saldo total. As parcelas de origem devem fechar exatamente o total necessário.

Implementação: envio `MONTAGEM` persiste produto/fator/quantidade resultantes e snapshots imutáveis dos lotes, locais, datas e unidades consumidas. A reserva, confirmação, recusa, cancelamento, histórico e PCP seguem o ciclo transacional existente; recusa/cancelamento devolvem cada parcela ao lote/local original. Migration `ShipmentAssembly1790899200000` adiciona o tipo e os metadados aos registros existentes sem reescrever dados anteriores.
