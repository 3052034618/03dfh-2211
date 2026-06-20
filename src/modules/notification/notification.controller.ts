import { Controller, Post, Param, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificationOrchestratorService, NotificationResult } from './notification-orchestrator.service';
import { PrismaService } from '../../common/prisma.service';
import { PaginationDto, buildPaginatedResponse, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Notification } from '@prisma/client';

@ApiTags('通知管理')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly orchestratorService: NotificationOrchestratorService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: '查询通知列表' })
  async findAll(
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<Notification>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count(),
    ]);

    return buildPaginatedResponse(list, total, page, pageSize);
  }

  @Get('alert/:alertId')
  @ApiOperation({ summary: '查询某个告警的所有通知' })
  async findByAlert(
    @Param('alertId') alertId: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<Notification>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { alertId },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { alertId } }),
    ]);

    return buildPaginatedResponse(list, total, page, pageSize);
  }

  @Post(':alertId/send')
  @ApiOperation({ summary: '手动触发告警通知发送' })
  async sendAlertNotifications(@Param('alertId') alertId: string): Promise<NotificationResult[]> {
    const alert = await this.prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) {
      throw new Error('告警不存在');
    }
    return this.orchestratorService.processNewAlert(alert);
  }

  @Post(':alertId/retry')
  @ApiOperation({ summary: '重试失败的通知' })
  async retryFailed(@Param('alertId') alertId: string): Promise<NotificationResult[]> {
    return this.orchestratorService.retryFailedNotifications(alertId);
  }

  @Post(':alertId/escalate')
  @ApiOperation({ summary: '手动升级告警通知' })
  async escalate(@Param('alertId') alertId: string): Promise<NotificationResult[]> {
    const alert = await this.prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) {
      throw new Error('告警不存在');
    }
    return this.orchestratorService.escalateAlert(alert);
  }
}
