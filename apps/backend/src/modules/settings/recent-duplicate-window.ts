import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { SystemSettingEntity } from './system-setting.entity';

export const RECENT_DUPLICATE_MINUTES_KEY = 'recent_duplicate_minutes';
export const DEFAULT_RECENT_DUPLICATE_MINUTES = 30;
export const MAX_RECENT_DUPLICATE_MINUTES = 1440;

export async function recentDuplicateMinutes(manager: EntityManager): Promise<number> {
  const setting = await manager.findOneBy(SystemSettingEntity, { key: RECENT_DUPLICATE_MINUTES_KEY });
  const minutes = setting ? Number(setting.value) : DEFAULT_RECENT_DUPLICATE_MINUTES;
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_RECENT_DUPLICATE_MINUTES) {
    throw new ConflictException('A configuração do intervalo de duplicidade não está disponível.');
  }
  return minutes;
}
