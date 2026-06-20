import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class ReportDeviceDataDto {
  @ApiProperty({ description: '集装箱号' })
  @IsString()
  containerNo: string;

  @ApiPropertyOptional({ description: '温度（℃）' })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ description: '湿度（%）' })
  @IsOptional()
  @IsNumber()
  humidity?: number;

  @ApiPropertyOptional({ description: '箱门是否开启' })
  @IsOptional()
  @IsBoolean()
  doorOpen?: boolean;

  @ApiPropertyOptional({ description: '电源是否正常' })
  @IsOptional()
  @IsBoolean()
  powerStatus?: boolean;

  @ApiPropertyOptional({ description: '纬度' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: '经度' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: '速度（km/h）' })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional({ description: '原始上报数据' })
  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, any>;
}
