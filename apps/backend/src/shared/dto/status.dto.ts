import { IsBoolean } from 'class-validator';

export class StatusDto {
  @IsBoolean()
  active!: boolean;
}
