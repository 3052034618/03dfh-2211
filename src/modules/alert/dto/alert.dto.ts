import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const ALERT_TYPES = ['TEMPERATURE_HIGH', 'TEMPERATURE_LOW', 'TEMPERATURE_FLUCTUATION', 'DOOR_OPEN', 'POWER_FAILURE', 'POSITION_DEVIATION', 'HUMIDITY_HIGH', 'HUMIDITY_LOW'];
const ALERT_LEVELS = ['INFO', 'WARNING', 'CRITICAL'];
const ALERT_STATUS = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED'];

export class QueryAlertDto {
  @ApiPropertyOptional({ description: '按集装箱号筛选' })
  @IsOptional()
  @IsString()
  containerNo?: string;

  @ApiPropertyOptional({ description: '按告警类型筛选', enum: ALERT_TYPES })
  @IsOptional()
  @IsIn(ALERT_TYPES)
  alertType?: string;

  @ApiPropertyOptional({ description: '按告警级别筛选', enum: ALERT_LEVELS })
  @IsOptional()
  @IsIn(ALERT_LEVELS)
  alertLevel?: string;

  @ApiPropertyOptional({ description: '按告警状态筛选', enum: ALERT_STATUS })
  @IsOptional()
  @IsIn(ALERT_STATUS)
  status?: string;
}
