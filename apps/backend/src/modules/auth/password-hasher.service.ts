import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordHasherService {
  constructor(private readonly configService: ConfigService) {}

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.configService.getOrThrow<number>('ARGON2_MEMORY_COST'),
      timeCost: this.configService.getOrThrow<number>('ARGON2_TIME_COST'),
      parallelism: this.configService.getOrThrow<number>('ARGON2_PARALLELISM'),
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
