import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, MaxLength, MinLength } from 'class-validator';

export class UpdatePostDto {
  @ApiPropertyOptional({
    example: 'Edited post content 🚀',
    description: 'Post content',
    minLength: 1,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Flag to remove the associated image from the post',
  })
  @IsOptional()
  @IsBoolean()
  removeImage?: boolean;
}
