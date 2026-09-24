import 'reflect-metadata';
import { Repository } from 'typeorm';
import { MovementStatus } from './domain/movement-status.enum';
import { MovementEntity } from './entities/movement.entity';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementsRepository } from './movements.repository';
import { PcpExecutionStatus } from '../pcp/domain/pcp-execution-status.enum';

describe('Consultas operacionais de movimentações', () => {
  it('filtra concluídas pendentes de execução no PCP', async () => {
    const builder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const repository = new MovementsRepository({ createQueryBuilder: () => builder } as unknown as Repository<MovementEntity>);

    await repository.findAndCount(Object.assign(new MovementQueryDto(), {
      status: MovementStatus.Effective,
      pcpStatus: PcpExecutionStatus.Pending,
      page: 1,
      limit: 5,
    }));

    expect(builder.andWhere).toHaveBeenCalledWith('movement.status = :status', { status: MovementStatus.Effective });
    expect(builder.andWhere).toHaveBeenCalledWith('movement.pcpExecutionStatus = :pcpStatus', { pcpStatus: PcpExecutionStatus.Pending });
    expect(builder.andWhere).toHaveBeenCalledWith('movement.requiresPcpExecution = true');
  });
});
