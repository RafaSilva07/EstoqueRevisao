import { IsIn, IsOptional, Matches } from 'class-validator';

export class UpdateUserPreferencesDto {
  @IsIn(['LIGHT', 'DARK'])
  theme!: 'LIGHT' | 'DARK';

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  backgroundColor?: string | null;
}
