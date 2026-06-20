import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DeviceDataService } from './device-data.service';
import { ReportDeviceDataDto } from './dto/device-data.dto';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { DeviceData, Alert } from '@prisma/client';

@ApiTags('设备数据')
@Controller('device-data')
export class DeviceDataController {
  constructor(private readonly deviceDataService: DeviceDataService) {}

  @Post('report')
  @ApiOperation({ summary: '上报设备数据（温度、位置、电源、门磁等）' })
  report(@Body() dto: ReportDeviceDataDto): Promise<{ data: DeviceData; alerts: Alert[] }> {
    return this.deviceDataService.report(dto);
  }

  @Get('container/:containerNo')
  @ApiOperation({ summary: '查询集装箱的历史设备数据' })
  findByContainer(
    @Param('containerNo') containerNo: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<DeviceData>> {
    return this.deviceDataService.findByContainer(containerNo, pagination);
  }
}
