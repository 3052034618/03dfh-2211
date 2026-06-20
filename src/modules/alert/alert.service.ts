import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotificationOrchestratorService, NotificationResult } from '../notification/notification-orchestrator.service';
import { QueryAlertDto } from './dto/alert.dto';
import { PaginationDto, buildPaginatedResponse, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Alert } from '@prisma/client';
import { AlertStatus } from '../../common/types/alert.types';

@Injectable()
export class AlertService {
  constructor(
    private prisma: PrismaService,
    private orchestratorService: NotificationOrchestratorService,
  ) {}

  async findAll(
    query: QueryAlertDto,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<Alert>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.alertType) where.alertType = query.alertType;
    if (query.alertLevel) where.alertLevel = query.alertLevel;
    if (query.status) where.status = query.status;
    if (query.containerNo) {
      where.container = {
        containerNo: query.containerNo,
      };
    }

    const [list, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          container: true,
          _count: {
            select: { notifications: true, receipts: true },
          },
        },
      }),
      this.prisma.alert.count({ where }),
    ]);

    return buildPaginatedResponse(list, total, page, pageSize);
  }

  async findOne(id: string): Promise<Alert> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        container: true,
        notifications: { orderBy: { createdAt: 'desc' } },
        receipts: { orderBy: { handledAt: 'desc' } },
      },
    });

    if (!alert) {
      throw new NotFoundException('告警不存在');
    }

    return alert;
  }

  async close(id: string, remark?: string): Promise<Alert> {
    const alert = await this.findOne(id);

    return this.prisma.alert.update({
      where: { id },
      data: {
        status: 'CLOSED' as AlertStatus,
        endTime: new Date(),
        updatedAt: new Date(),
      },
      include: {
        container: true,
      },
    });
  }

  async triggerNotifications(id: string): Promise<NotificationResult[]> {
    const alert = await this.findOne(id);
    return this.orchestratorService.processNewAlert(alert);
  }

  async getStats() {
    const [total, active, acknowledged, resolved, today] = await Promise.all([
      this.prisma.alert.count(),
      this.prisma.alert.count({ where: { status: 'ACTIVE' as AlertStatus } }),
      this.prisma.alert.count({ where: { status: 'ACKNOWLEDGED' as AlertStatus } }),
      this.prisma.alert.count({ where: { status: 'RESOLVED' as AlertStatus } }),
      this.prisma.alert.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      total,
      active,
      acknowledged,
      resolved,
      today,
    };
  }
}
