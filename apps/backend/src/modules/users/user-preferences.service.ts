import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { UpdateUserPreferencesDto } from './dto/user-preferences.dto';

export interface UserPreferences {
  theme: 'LIGHT' | 'DARK';
  backgroundColor: string | null;
}

@Injectable()
export class UserPreferencesService {
  constructor(private readonly db: DataSource) {}

  async get(userId: string): Promise<UserPreferences> {
    const user = await this.db.getRepository(UserEntity).findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return { theme: user.uiTheme, backgroundColor: user.uiBackgroundColor };
  }

  async update(userId: string, dto: UpdateUserPreferencesDto): Promise<UserPreferences> {
    const result = await this.db.getRepository(UserEntity).update({ id: userId }, {
      uiTheme: dto.theme,
      uiBackgroundColor: dto.backgroundColor?.toUpperCase() ?? null,
    });
    if (!result.affected) throw new NotFoundException('Usuário não encontrado.');
    return this.get(userId);
  }
}
