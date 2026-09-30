import { BadRequestException } from '@nestjs/common';
import { resolveShipmentLoading } from './shipment-loading';

describe('carregamento do envio Expedição → Revisão', () => {
  it('exige escolha e placa quando carregado', () => {
    expect(() => resolveShipmentLoading('EXPEDICAO', 'REVISAO')).toThrow(BadRequestException);
    expect(() => resolveShipmentLoading('EXPEDICAO', 'REVISAO', 'CARREGADO', '  ')).toThrow(BadRequestException);
    expect(resolveShipmentLoading('EXPEDICAO', 'REVISAO', 'CARREGADO', ' abc1d23 '))
      .toEqual({ loadingStatus: 'CARREGADO', vehiclePlate: 'ABC1D23' });
  });
  it('não associa placa ao envio não carregado', () => {
    expect(() => resolveShipmentLoading('EXPEDICAO', 'REVISAO', 'NAO_CARREGADO', 'ABC1D23')).toThrow(BadRequestException);
    expect(resolveShipmentLoading('EXPEDICAO', 'REVISAO', 'NAO_CARREGADO'))
      .toEqual({ loadingStatus: 'NAO_CARREGADO', vehiclePlate: null });
  });
  it('rejeita os campos nos demais sentidos de envio', () => {
    expect(() => resolveShipmentLoading('PRODUCAO', 'REVISAO', 'CARREGADO', 'ABC1D23')).toThrow(BadRequestException);
    expect(() => resolveShipmentLoading('REVISAO', 'EXPEDICAO', 'NAO_CARREGADO')).toThrow(BadRequestException);
    expect(resolveShipmentLoading('PRODUCAO', 'REVISAO')).toEqual({ loadingStatus: null, vehiclePlate: null });
  });
});
