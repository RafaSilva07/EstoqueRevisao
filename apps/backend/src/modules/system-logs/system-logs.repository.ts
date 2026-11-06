import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { SystemLogEntity, SystemLogLevel } from './entities/system-log.entity';
import { SystemLogQueryDto } from './dto/system-log-query.dto';

@Injectable()
export class SystemLogsRepository {
  private readonly logger = new Logger(SystemLogsRepository.name);
  private readonly memoryBuffer: SystemLogEntity[] = [];
  private readonly maxMemoryLogs = 2000;
  private ormRepository?: Repository<SystemLogEntity>;

  constructor(private readonly dataSource: DataSource) {
    try {
      this.ormRepository = this.dataSource.getRepository(SystemLogEntity);
    } catch {
      this.logger.warn('Repositorio TypeORM para SystemLogEntity nao inicializado de imediato; usando buffer em memoria.');
    }
  }

  async save(log: SystemLogEntity): Promise<SystemLogEntity> {
    // 1. Sempre registra no buffer em memória circular para alta resiliência e disponibilidade instantânea
    this.memoryBuffer.unshift(log);
    if (this.memoryBuffer.length > this.maxMemoryLogs) {
      this.memoryBuffer.pop();
    }

    // 2. Persiste no banco de dados quando conectado e tabela acessível
    try {
      const repo = this.getOrmRepository();
      if (repo && this.dataSource.isInitialized) {
        await repo.save(log);
      }
    } catch (error) {
      // Falha esperada caso o banco esteja indisponível (resiliência contra pane de banco)
      this.logger.warn(`Nao foi possivel persistir log no PostgreSQL; log mantido em memoria resiliente. Erro: ${(error as Error)?.message}`);
    }

    return log;
  }

  async findById(id: string): Promise<SystemLogEntity | null> {
    try {
      const repo = this.getOrmRepository();
      if (repo && this.dataSource.isInitialized) {
        const found = await repo.findOneBy({ id });
        if (found) return found;
      }
    } catch {
      // fallback para memória
    }

    return this.memoryBuffer.find((item) => item.id === id) ?? null;
  }

  async findAndCount(query: SystemLogQueryDto): Promise<[SystemLogEntity[], number]> {
    try {
      const repo = this.getOrmRepository();
      if (repo && this.dataSource.isInitialized) {
        const qb = repo.createQueryBuilder('log');
        this.applyFilters(qb, query);
        qb.orderBy('log.timestamp', 'DESC')
          .skip((query.page - 1) * query.limit)
          .take(query.limit);

        return await qb.getManyAndCount();
      }
    } catch (err) {
      this.logger.warn(`Consulta SQL falhou, realizando fallback para memoria: ${(err as Error)?.message}`);
    }

    return this.findAndCountInMemory(query);
  }

  async countByErrorCode(periodStart?: Date): Promise<Array<{ errorCode: string; count: number; sampleDescription: string; severity: SystemLogLevel; lastOccurrence: Date }>> {
    try {
      const repo = this.getOrmRepository();
      if (repo && this.dataSource.isInitialized) {
        const qb = repo.createQueryBuilder('log')
          .select('log.errorCode', 'errorCode')
          .addSelect('log.level', 'severity')
          .addSelect('COUNT(*)', 'count')
          .addSelect('MAX(log.timestamp)', 'lastOccurrence')
          .addSelect('MAX(log.description)', 'sampleDescription')
          .where('log.errorCode IS NOT NULL');

        if (periodStart) {
          qb.andWhere('log.timestamp >= :periodStart', { periodStart });
        }

        const raw = await qb
          .groupBy('log.errorCode')
          .addGroupBy('log.level')
          .orderBy('count', 'DESC')
          .getRawMany();

        return raw.map((item) => ({
          errorCode: item.errorCode,
          severity: item.severity as SystemLogLevel,
          count: Number(item.count),
          lastOccurrence: new Date(item.lastOccurrence),
          sampleDescription: item.sampleDescription ?? '',
        }));
      }
    } catch {
      // fallback memória
    }

    return this.countByErrorCodeInMemory(periodStart);
  }

  async getCountsByLevel(periodStart?: Date): Promise<{ INFO: number; WARN: number; ERROR: number; FATAL: number }> {
    try {
      const repo = this.getOrmRepository();
      if (repo && this.dataSource.isInitialized) {
        const qb = repo.createQueryBuilder('log')
          .select('log.level', 'level')
          .addSelect('COUNT(*)', 'count');

        if (periodStart) {
          qb.where('log.timestamp >= :periodStart', { periodStart });
        }

        const raw = await qb.groupBy('log.level').getRawMany();
        const counts = { INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
        for (const r of raw) {
          const lvl = r.level as keyof typeof counts;
          if (counts[lvl] !== undefined) {
            counts[lvl] = Number(r.count);
          }
        }
        return counts;
      }
    } catch {
      // fallback memória
    }

    return this.getCountsByLevelInMemory(periodStart);
  }

  async getRecentLogs(limit = 1000): Promise<SystemLogEntity[]> {
    try {
      const repo = this.getOrmRepository();
      if (repo && this.dataSource.isInitialized) {
        return await repo.find({
          order: { timestamp: 'DESC' },
          take: limit,
        });
      }
    } catch {
      // fallback
    }
    return this.memoryBuffer.slice(0, limit);
  }

  private getOrmRepository(): Repository<SystemLogEntity> | undefined {
    if (!this.ormRepository && this.dataSource.isInitialized) {
      try {
        this.ormRepository = this.dataSource.getRepository(SystemLogEntity);
      } catch {
        // ignora se ainda não inicializado
      }
    }
    return this.ormRepository;
  }

  private applyFilters(qb: SelectQueryBuilder<SystemLogEntity>, query: SystemLogQueryDto): void {
    if (query.level) {
      qb.andWhere('log.level = :level', { level: query.level });
    }
    if (query.errorCode) {
      qb.andWhere('log.errorCode = :errorCode', { errorCode: query.errorCode });
    }
    if (query.eventId) {
      qb.andWhere('log.eventId = :eventId', { eventId: query.eventId });
    }
    if (query.context) {
      qb.andWhere('log.context ILIKE :context', { context: `%${query.context}%` });
    }
    if (query.startDate) {
      qb.andWhere('log.timestamp >= :startDate', { startDate: new Date(query.startDate) });
    }
    if (query.endDate) {
      qb.andWhere('log.timestamp <= :endDate', { endDate: new Date(query.endDate) });
    }
    if (query.search) {
      qb.andWhere(
        '(log.description ILIKE :search OR log.context ILIKE :search OR log.errorCode ILIKE :search OR CAST(log.details AS text) ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
  }

  private findAndCountInMemory(query: SystemLogQueryDto): [SystemLogEntity[], number] {
    let filtered = [...this.memoryBuffer];

    if (query.level) {
      filtered = filtered.filter((l) => l.level === query.level);
    }
    if (query.errorCode) {
      filtered = filtered.filter((l) => l.errorCode === query.errorCode);
    }
    if (query.eventId) {
      filtered = filtered.filter((l) => l.eventId === query.eventId);
    }
    if (query.context) {
      const c = query.context.toLowerCase();
      filtered = filtered.filter((l) => l.context?.toLowerCase().includes(c));
    }
    if (query.startDate) {
      const s = new Date(query.startDate).getTime();
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= s);
    }
    if (query.endDate) {
      const e = new Date(query.endDate).getTime();
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= e);
    }
    if (query.search) {
      const term = query.search.toLowerCase();
      filtered = filtered.filter((l) =>
        l.description?.toLowerCase().includes(term)
        || l.context?.toLowerCase().includes(term)
        || l.errorCode?.toLowerCase().includes(term)
        || JSON.stringify(l.details ?? {}).toLowerCase().includes(term),
      );
    }

    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = filtered.length;
    const start = (query.page - 1) * query.limit;
    const items = filtered.slice(start, start + query.limit);

    return [items, total];
  }

  private countByErrorCodeInMemory(periodStart?: Date): Array<{ errorCode: string; count: number; sampleDescription: string; severity: SystemLogLevel; lastOccurrence: Date }> {
    const map = new Map<string, { count: number; sampleDescription: string; severity: SystemLogLevel; lastOccurrence: Date }>();
    const startMs = periodStart ? periodStart.getTime() : 0;

    for (const item of this.memoryBuffer) {
      if (!item.errorCode) continue;
      if (startMs && new Date(item.timestamp).getTime() < startMs) continue;

      const existing = map.get(item.errorCode);
      if (!existing) {
        map.set(item.errorCode, {
          count: 1,
          sampleDescription: item.description,
          severity: item.level,
          lastOccurrence: new Date(item.timestamp),
        });
      } else {
        existing.count += 1;
        if (new Date(item.timestamp) > existing.lastOccurrence) {
          existing.lastOccurrence = new Date(item.timestamp);
        }
      }
    }

    return Array.from(map.entries())
      .map(([errorCode, val]) => ({
        errorCode,
        ...val,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private getCountsByLevelInMemory(periodStart?: Date): { INFO: number; WARN: number; ERROR: number; FATAL: number } {
    const counts = { INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
    const startMs = periodStart ? periodStart.getTime() : 0;

    for (const item of this.memoryBuffer) {
      if (startMs && new Date(item.timestamp).getTime() < startMs) continue;
      if (counts[item.level] !== undefined) {
        counts[item.level] += 1;
      }
    }
    return counts;
  }
}

