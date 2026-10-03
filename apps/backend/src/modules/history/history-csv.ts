type Row = Record<string, unknown>;
type Column = { title: string; value: (row: Row, data: Row) => unknown };

const types: Record<string, string> = {
  ENVIO: 'Envio entre setores', ENTRADA_EXTERNA: 'Entrada externa', SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna', REVISAO: 'Revisão',
};
const sectors: Record<string, string> = { REVISAO: 'Revisão', PRODUCAO: 'Produção', EXPEDICAO: 'Expedição' };
const shipmentKinds: Record<string, string> = { NORMAL: 'Normal', RETORNO_IMEDIATO: 'Retorno imediato', MONTAGEM: 'Montagem' };
const loadingStatuses: Record<string, string> = { CARREGADO: 'Carregado', NAO_CARREGADO: 'Não carregado' };
const timestamp = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const objects = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
const dateTime = (value: unknown): string => value ? timestamp.format(new Date(value as string | Date)).replace(', ', ' ') : '';
const quantity = (value: unknown): number | null => {
  if (value == null) return null;
  if ((typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value))) return Number(value);
  throw new TypeError('Quantidade inválida para exportação CSV.');
};

const columns: Column[] = [
  { title: 'Registro', value: (row) => row.code },
  { title: 'ID do registro', value: (row) => row.id },
  { title: 'Grupo (referência)', value: (row) => row.group_code },
  { title: 'Origem do registro', value: (row) => row.kind === 'SHIPMENT' ? 'Envio' : 'Movimentação de estoque' },
  { title: 'Tipo', value: (row) => types[String(row.type)] ?? row.type },
  { title: 'Status', value: () => 'Finalizada' },
  { title: 'Status operacional', value: (row) => row.status },
  { title: 'Data/hora (America/Sao_Paulo)', value: (row) => dateTime(row.occurred_at) },
  { title: 'Código do produto', value: (row) => row.product_code },
  { title: 'Descrição do produto', value: (row) => row.product_name },
  { title: 'Lote', value: (row) => row.batch_code },
  { title: 'Fabricação', value: (row) => row.manufacturing_date },
  { title: 'Validade', value: (_row, data) => data.expirationDate },
  { title: 'Unidade', value: (row) => row.product_unit },
  { title: 'Quantidade', value: (row) => quantity(row.quantity) },
  { title: 'Origem', value: (row) => sectors[String(row.origin)] ?? row.origin },
  { title: 'Destino', value: (row) => sectors[String(row.destination)] ?? row.destination },
  { title: 'Local de origem', value: (_row, data) => data.originLocation },
  { title: 'Local de destino', value: (_row, data) => data.destinationLocation },
  { title: 'Responsável', value: (row) => row.responsible },
  { title: 'Enviado por', value: (row) => row.sent_by },
  { title: 'Data/hora do envio (America/Sao_Paulo)', value: (_row, data) => dateTime(data.sentAt) },
  { title: 'Recebido por', value: (row) => row.received_by },
  { title: 'Data/hora do recebimento (America/Sao_Paulo)', value: (_row, data) => dateTime(data.receivedAt) },
  { title: 'Executado por (PCP)', value: (row) => row.pcp_executed_by },
  { title: 'Data/hora da execução (America/Sao_Paulo)', value: (_row, data) => dateTime(data.pcpExecutedAt) },
  { title: 'Status PCP', value: (row) => row.pcp_required ? row.pcp_execution_status === 'EXECUTADA' ? 'Executada' : 'Pendente' : 'Não necessário' },
  { title: 'Observação do registro', value: (_row, data) => data.recordObservation },
  { title: 'Observação da operação', value: (_row, data) => data.observation },
  { title: 'Observação PCP', value: (_row, data) => data.pcpObservation },
  { title: 'Envio de origem (referência)', value: (row) => row.parent_code },
  { title: 'Tipo de envio', value: (_row, data) => shipmentKinds[String(data.shipmentKind)] },
  { title: 'Carregamento', value: (_row, data) => loadingStatuses[String(data.loadingStatus)] },
  { title: 'Placa', value: (_row, data) => data.vehiclePlate },
  { title: 'Código do produto de origem', value: (_row, data) => data.sourceProductCode },
  { title: 'Descrição do produto de origem', value: (_row, data) => data.sourceProductName },
  { title: 'Unidade de origem', value: (_row, data) => data.sourceUnit },
  { title: 'Quantidade de origem', value: (_row, data) => quantity(data.sourceQuantity) },
  { title: 'Código do produto resultante', value: (_row, data) => data.outputProductCode },
  { title: 'Descrição do produto resultante', value: (_row, data) => data.outputProductName },
  { title: 'Unidade resultante', value: (_row, data) => data.outputUnit },
  { title: 'Quantidade resultante', value: (_row, data) => quantity(data.outputQuantity) },
  { title: 'Unidades por embalagem', value: (_row, data) => data.unitsPerPackage },
  { title: 'Lote de destino', value: (_row, data) => data.destinationBatchCode },
  { title: 'Fabricação de destino', value: (_row, data) => data.destinationManufacturingDate },
  { title: 'Validade de destino', value: (_row, data) => data.destinationExpirationDate },
  { title: 'Datas misturadas', value: (_row, data) => data.assembly ? object(data.assembly).mixedDates ? 'Sim' : 'Não' : '' },
  { title: 'Unidade das distribuições de revisão', value: (row) => row.review_distribution_unit },
];

// Quoting handles delimiters/newlines; a leading apostrophe also blocks spreadsheet formula injection.
export function csvCell(value: unknown): string {
  if (value != null && !['string', 'number', 'boolean'].includes(typeof value)) {
    throw new TypeError('Uma coluna CSV deve conter um valor simples.');
  }
  const text = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function historyCsv(rows: Row[]): string {
  const destinations = new Map<string, string>();
  let sourceCount = 0;
  for (const row of rows) {
    for (const distribution of objects(row.review_distributions)) {
      destinations.set(String(distribution.destinationCode), String(distribution.destination));
    }
    sourceCount = Math.max(sourceCount, objects(object(object(row.export_data).assembly).sources).length);
  }
  const dynamic: Column[] = [...destinations].sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => ({
    title: `Quantidade para ${name} (${code})`,
    value: (row) => quantity(objects(row.review_distributions).find((distribution) => distribution.destinationCode === code)?.quantity),
  }));
  for (let index = 0; index < sourceCount; index++) {
    for (const [key, label] of [
      ['locationName', 'Local'], ['lot', 'Lote'], ['manufacturingDate', 'Fabricação'],
      ['expirationDate', 'Validade'], ['quantity', 'Quantidade (UN)'],
    ]) dynamic.push({ title: `Origem ${index + 1} da montagem - ${label}`,
      value: (_row, data) => {
        const value = objects(object(data.assembly).sources)[index]?.[key];
        return key === 'quantity' ? quantity(value) : value;
      } });
  }
  const all = [...columns, ...dynamic];
  const lines = [all.map((column) => csvCell(column.title)).join(';')];
  for (const row of rows) {
    const data = object(row.export_data);
    lines.push(all.map((column) => csvCell(column.value(row, data))).join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
