import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreatePostDto {
  @ApiProperty({
    example: 'Just shipped a new feature to production 🚀',
    description: 'Post content',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/v1570975200/sample.jpg',
    description: 'Optional attached image URL',
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
