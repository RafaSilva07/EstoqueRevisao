import { csvCell, historyCsv } from './history-csv';

describe('CSV do histórico finalizado', () => {
  it.each(['=HYPERLINK("evil")', '+SUM(A1)', '-1+1', '@SUM(A1)', '  =SUM(A1)', '\t=SUM(A1)'])('neutraliza fórmulas em %j', (value) => {
    expect(csvCell(value).startsWith('"\'')).toBe(true);
  });

  it('escapa ponto e vírgula, aspas e quebras sem alterar números nem zeros do código', () => {
    expect(csvCell('Produto; "teste"\nobservação')).toBe('"Produto; ""teste""\nobservação"');
    expect(csvCell('005601.90')).toBe('"005601.90"');
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell(null)).toBe('""');
  });

  it('gera uma linha por registro, com distribuições e parcelas de montagem em colunas', () => {
    const csv = historyCsv([{
      id: 'a', code: 'REV-000001-A', group_code: 'REV-000001', type: 'REVISAO', occurred_at: '2026-10-01T02:30:00Z',
      product_code: '005601.90', quantity: '600.000000', pcp_required: true, pcp_execution_status: 'EXECUTADA',
      review_distributions: [{ destinationCode: 'LATA_BOA', destination: 'Lata Boa', quantity: 300 },
        { destinationCode: 'VAREJO', destination: 'Varejo', quantity: 200 }, { destinationCode: 'TUF', destination: 'TUF', quantity: 100 }],
      export_data: { expirationDate: '2029-09-01', outputQuantity: 600 },
    }, {
      id: 'b', code: 'SAI-000002-A', type: 'ENVIO', occurred_at: '2026-10-01T12:00:00Z', quantity: 10,
      pcp_required: false, export_data: { assembly: { mixedDates: true,
        sources: [{ locationName: 'Lata Boa', lot: 'SOCDNV', quantity: 100 }, { locationName: 'Lata Boa', lot: 'NOCDNV', quantity: 140 }] } },
    }]);
    const [header, first, second, end] = csv.split('\r\n');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(end).toBe('');
    expect(header).toContain('"Quantidade para Lata Boa (LATA_BOA)"');
    expect(header).toContain('"Quantidade para Varejo (VAREJO)"');
    expect(header).toContain('"Origem 2 da montagem - Quantidade (UN)"');
    expect(first).toContain('"REV-000001-A"');
    expect(first).toContain('"30/09/2026 23:30:00"');
    expect(first).toContain('"005601.90"');
    expect(first).toContain('"600"');
    expect(first).not.toContain('600.000000');
    expect(second).toContain('"Não necessário"');
    expect(second).toContain('"100"');
    expect(second).toContain('"140"');
    const cellCount = (line: string): number => [...line.matchAll(/"(?:[^"]|"")*"/g)].length;
    expect(cellCount(first)).toBe(cellCount(header));
    expect(cellCount(second)).toBe(cellCount(header));
  });

  it('retorna apenas o cabeçalho quando não há finalizadas', () => {
    expect(historyCsv([]).split('\r\n')).toHaveLength(2);
    expect(historyCsv([])).not.toContain('undefined');
  });
});
