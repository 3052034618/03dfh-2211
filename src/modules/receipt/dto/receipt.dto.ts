import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

const RECEIPT_STATUS = ['CONFIRMED', 'FALSE_ALARM', 'IN_PROGRESS', 'ESCALATED'];

export class CreateReceiptDto {
  @ApiProperty({ description: '告警ID' })
  @IsString()
  alertId: string;

  @ApiProperty({ description: '处理人ID' })
  @IsString()
  handlerId: string;

  @ApiProperty({ description: '处理人姓名' })
  @IsString()
  handlerName: string;

  @ApiProperty({
    description: '处理结果',
    enum: RECEIPT_STATUS,
    example: 'CONFIRMED',
  })
  @IsIn(RECEIPT_STATUS)
  status: string;

  @ApiPropertyOptional({ description: '处理备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class QueryReceiptDto {
  @ApiPropertyOptional({ description: '按告警ID筛选' })
  @IsOptional()
  @IsString()
  alertId?: string;

  @ApiPropertyOptional({ description: '按处理状态筛选', enum: RECEIPT_STATUS })
  @IsOptional()
  @IsIn(RECEIPT_STATUS)
  status?: string;
}
