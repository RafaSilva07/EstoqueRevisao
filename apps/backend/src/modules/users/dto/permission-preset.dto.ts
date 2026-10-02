import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class UpdatePermissionPresetDto {
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) @MaxLength(120, { each: true })
  permissionCodes!: string[];
  @IsBoolean() applyToUsers!: boolean;
  @IsInt() @Min(1) version!: number;
}
