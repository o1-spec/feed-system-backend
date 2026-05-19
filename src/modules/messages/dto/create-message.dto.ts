import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    example: 'cl12345678901234567890123',
    description: 'The recipient user CUID ID',
  })
  @IsString()
  @MinLength(1)
  receiverId: string;

  @ApiProperty({
    example: 'Hey there! How is that systems design task coming along?',
    description: 'The body content of the direct message',
    minLength: 1,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;
}
