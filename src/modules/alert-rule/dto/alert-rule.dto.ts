import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, Min, IsIn } from 'class-validator';

const CARGO_TYPES = ['FROZEN', 'REFRIGERATED', 'VACCINE', 'PHARMACEUTICAL', 'FRESH_PRODUCE', 'OTHER'];
const ALERT_TYPES = ['TEMPERATURE_HIGH', 'TEMPERATURE_LOW', 'TEMPERATURE_FLUCTUATION', 'DOOR_OPEN', 'POWER_FAILURE', 'POSITION_DEVIATION', 'HUMIDITY_HIGH', 'HUMIDITY_LOW'];
const ALERT_LEVELS = ['INFO', 'WARNING', 'CRITICAL'];
const DEVIATION_TYPES = ['MAX_DISTANCE', 'ROUTE_CORRIDOR'];

export class CreateAlertRuleDto {
  @ApiProperty({ description: '规则名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '货类', enum: CARGO_TYPES })
  @IsIn(CARGO_TYPES)
  cargoType: string;

  @ApiProperty({ description: '告警类型', enum: ALERT_TYPES })
  @IsIn(ALERT_TYPES)
  alertType: string;

  @ApiProperty({ description: '告警级别', enum: ALERT_LEVELS })
  @IsIn(ALERT_LEVELS)
  alertLevel: string;

  @ApiPropertyOptional({ description: '最小值（温度、湿度等）' })
  @IsOptional()
  @IsNumber()
  minValue?: number;

  @ApiPropertyOptional({ description: '最大值（温度、湿度等）' })
  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @ApiPropertyOptional({ description: '允许持续时间（秒）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  allowedDuration?: number;

  @ApiPropertyOptional({ description: '容差（温度波动等）' })
  @IsOptional()
  @IsNumber()
  tolerance?: number;

  @ApiPropertyOptional({ description: '路线偏离判断方式', enum: DEVIATION_TYPES })
  @IsOptional()
  @IsIn(DEVIATION_TYPES)
  deviationType?: string;

  @ApiPropertyOptional({ description: '最大偏离距离（km）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDeviationDistance?: number;

  @ApiPropertyOptional({ description: '规则描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAlertRuleDto {
  @ApiPropertyOptional({ description: '规则名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '货类', enum: CARGO_TYPES })
  @IsOptional()
  @IsIn(CARGO_TYPES)
  cargoType?: string;

  @ApiPropertyOptional({ description: '告警类型', enum: ALERT_TYPES })
  @IsOptional()
  @IsIn(ALERT_TYPES)
  alertType?: string;

  @ApiPropertyOptional({ description: '告警级别', enum: ALERT_LEVELS })
  @IsOptional()
  @IsIn(ALERT_LEVELS)
  alertLevel?: string;

  @ApiPropertyOptional({ description: '最小值' })
  @IsOptional()
  @IsNumber()
  minValue?: number;

  @ApiPropertyOptional({ description: '最大值' })
  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @ApiPropertyOptional({ description: '允许持续时间（秒）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  allowedDuration?: number;

  @ApiPropertyOptional({ description: '容差' })
  @IsOptional()
  @IsNumber()
  tolerance?: number;

  @ApiPropertyOptional({ description: '路线偏离判断方式', enum: DEVIATION_TYPES })
  @IsOptional()
  @IsIn(DEVIATION_TYPES)
  deviationType?: string;

  @ApiPropertyOptional({ description: '最大偏离距离（km）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDeviationDistance?: number;

  @ApiPropertyOptional({ description: '规则描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class QueryAlertRuleDto {
  @ApiPropertyOptional({ description: '按货类筛选', enum: CARGO_TYPES })
  @IsOptional()
  @IsIn(CARGO_TYPES)
  cargoType?: string;

  @ApiPropertyOptional({ description: '按告警类型筛选', enum: ALERT_TYPES })
  @IsOptional()
  @IsIn(ALERT_TYPES)
  alertType?: string;

  @ApiPropertyOptional({ description: '按告警级别筛选', enum: ALERT_LEVELS })
  @IsOptional()
  @IsIn(ALERT_LEVELS)
  alertLevel?: string;

  @ApiPropertyOptional({ description: '是否只显示启用的' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
