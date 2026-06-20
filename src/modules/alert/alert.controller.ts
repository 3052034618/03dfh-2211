import { Controller, Get, Param, Query, Patch, Body, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AlertService } from './alert.service';
import { QueryAlertDto } from './dto/alert.dto';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Alert } from '@prisma/client';
import { NotificationResult } from '../notification/notification-orchestrator.service';

@ApiTags('告警管理')
@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  @ApiOperation({ summary: '查询告警列表' })
  findAll(
    @Query() query: QueryAlertDto,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<Alert>> {
    return this.alertService.findAll(query, pagination);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取告警统计' })
  getStats() {
    return this.alertService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取告警详情' })
  findOne(@Param('id') id: string): Promise<Alert> {
    return this.alertService.findOne(id);
  }

  @Patch(':id/close')
  @ApiOperation({ summary: '手动关闭告警' })
  close(@Param('id') id: string, @Body() body?: { remark?: string }): Promise<Alert> {
    return this.alertService.close(id, body?.remark);
  }

  @Post(':id/notify')
  @ApiOperation({ summary: '手动触发通知' })
  triggerNotifications(@Param('id') id: string): Promise<NotificationResult[]> {
    return this.alertService.triggerNotifications(id);
  }
}
