import { Controller, Get, Param, Query, Patch, Body, Post, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AlertService, AlertDetail, TimelineEvent } from './alert.service';
import { QueryAlertDto } from './dto/alert.dto';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Alert } from '@prisma/client';
import { NotificationResult } from '../notification/notification-orchestrator.service';
import { NOTIFICATION_ORDER } from '../../common/types/alert.types';

@ApiTags('告警管理')
@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  @ApiOperation({ summary: '查询告警列表（含催办进度信息）' })
  findAll(
    @Query() query: QueryAlertDto,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<Alert & { escalationInfo: any }>> {
    return this.alertService.findAll(query, pagination);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取告警统计' })
  getStats() {
    return this.alertService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取告警详情（含催办进度信息）' })
  findOne(@Param('id') id: string): Promise<AlertDetail> {
    return this.alertService.findOne(id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: '获取告警催办进度时间线' })
  getTimeline(@Param('id') id: string): Promise<TimelineEvent[]> {
    return this.alertService.getTimeline(id);
  }

  @Patch(':id/close')
  @ApiOperation({ summary: '手动关闭告警' })
  close(@Param('id') id: string, @Body() body?: { remark?: string }): Promise<AlertDetail> {
    return this.alertService.close(id, body?.remark);
  }

  @Post(':id/notify')
  @ApiOperation({ summary: '手动触发通知' })
  triggerNotifications(@Param('id') id: string): Promise<NotificationResult[]> {
    return this.alertService.triggerNotifications(id);
  }

  @Post(':id/escalation/pause')
  @ApiOperation({ summary: '暂停催办' })
  async pauseEscalation(
    @Param('id') id: string,
    @Body() body: { pauseMinutes?: number; durationMinutes?: number; reason?: string; operatorId?: string; operatorName?: string },
  ): Promise<AlertDetail> {
    const minutes = body.pauseMinutes ?? body.durationMinutes;
    if (!minutes || minutes <= 0) {
      throw new HttpException('暂停时长必须大于0分钟', HttpStatus.BAD_REQUEST);
    }
    return this.alertService.pauseEscalation(id, { durationMinutes: minutes, ...body });
  }

  @Post(':id/escalation/resume')
  @ApiOperation({ summary: '恢复催办' })
  resumeEscalation(
    @Param('id') id: string,
    @Body() body?: { reason?: string; operatorId?: string; operatorName?: string },
  ): Promise<AlertDetail> {
    return this.alertService.resumeEscalation(id, body || {});
  }

  @Post(':id/escalation/jump')
  @ApiOperation({ summary: '手动调整催办层级' })
  async jumpEscalationLevel(
    @Param('id') id: string,
    @Body() body: { targetStep?: number; targetRole?: string; reason?: string; operatorId?: string; operatorName?: string },
  ): Promise<AlertDetail> {
    let step: number | undefined;
    if (body.targetStep !== undefined && body.targetStep !== null) {
      step = body.targetStep;
    } else if (body.targetRole) {
      step = NOTIFICATION_ORDER.indexOf(body.targetRole as any);
      if (step < 0) {
        throw new HttpException(`无效的目标角色: ${body.targetRole}`, HttpStatus.BAD_REQUEST);
      }
    } else {
      throw new HttpException('targetStep 或 targetRole 必填一个', HttpStatus.BAD_REQUEST);
    }
    return this.alertService.jumpEscalationLevel(id, { targetStep: step, ...body });
  }
}
