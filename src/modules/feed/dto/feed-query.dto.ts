import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FeedQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor for the next page (returned from previous response)',
    example: 'eyJpZCI6ImNseTEyMyIsImNyZWF0ZWRBdCI6IjIwMjYtMDEtMDFUMDA6MDA6MDBaIn0=',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Items per page (1–50)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
