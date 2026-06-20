import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotificationOrchestratorService } from '../notification/notification-orchestrator.service';
import { CreateReceiptDto, QueryReceiptDto } from './dto/receipt.dto';
import { PaginationDto, buildPaginatedResponse, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Receipt } from '@prisma/client';
import { ReceiptStatus, AlertStatus } from '../../common/types/alert.types';

export interface ReceiptResult {
  receipt: Receipt;
  alertUpdated: boolean;
  newAlertStatus: string;
  escalationTriggered: boolean;
  message: string;
}

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    private prisma: PrismaService,
    private orchestratorService: NotificationOrchestratorService,
  ) {}

  async create(dto: CreateReceiptDto): Promise<ReceiptResult> {
    this.logger.log(
      `Processing receipt for alert ${dto.alertId}: ${dto.status} by ${dto.handlerName}`,
    );

    const alert = await this.prisma.alert.findUnique({
      where: { id: dto.alertId },
      include: { container: true },
    });

    if (!alert) {
      throw new NotFoundException('告警不存在');
    }

    const receipt = await this.prisma.receipt.create({
      data: dto,
    });

    const { newStatus, shouldEscalate, message } = this.handleReceiptStatus(
      dto.status as ReceiptStatus,
      alert,
    );

    await this.prisma.alert.update({
      where: { id: dto.alertId },
      data: {
        status: newStatus,
        endTime: newStatus === ('RESOLVED' as AlertStatus) ? new Date() : alert.endTime,
        updatedAt: new Date(),
      },
    });

    await this.updateNotificationAcknowledgement(dto.alertId, dto.handlerId);

    let escalationTriggered = false;
    if (shouldEscalate) {
      this.logger.log(`Escalation triggered for alert ${dto.alertId} due to receipt status`);
      await this.orchestratorService.escalateAlert(alert);
      escalationTriggered = true;
    }

    return {
      receipt,
      alertUpdated: true,
      newAlertStatus: newStatus,
      escalationTriggered,
      message,
    };
  }

  private handleReceiptStatus(
    status: ReceiptStatus,
    alert: any,
  ): { newStatus: AlertStatus; shouldEscalate: boolean; message: string } {
    switch (status) {
      case 'CONFIRMED':
        return {
          newStatus: 'ACKNOWLEDGED' as AlertStatus,
          shouldEscalate: false,
          message: '告警已确认处理，暂缓催办',
        };

      case 'FALSE_ALARM':
        return {
          newStatus: 'RESOLVED' as AlertStatus,
          shouldEscalate: false,
          message: '误报，告警已关闭，停止催办',
        };

      case 'IN_PROGRESS':
        return {
          newStatus: 'ACKNOWLEDGED' as AlertStatus,
          shouldEscalate: false,
          message: '现场处理中，暂缓催办',
        };

      case 'ESCALATED':
        return {
          newStatus: 'ACTIVE' as AlertStatus,
          shouldEscalate: true,
          message: '已申请升级理赔，立即升级通知',
        };

      default:
        return {
          newStatus: alert.status as AlertStatus,
          shouldEscalate: false,
          message: '未知状态',
        };
    }
  }

  private async updateNotificationAcknowledgement(
    alertId: string,
    handlerId: string,
  ): Promise<void> {
    const notifications = await this.prisma.notification.findMany({
      where: {
        alertId,
        recipientId: handlerId,
      },
    });

    for (const notification of notifications) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
        },
      });
    }
  }

  async findAll(
    query: QueryReceiptDto,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<Receipt>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.alertId) where.alertId = query.alertId;
    if (query.status) where.status = query.status;

    const [list, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { handledAt: 'desc' },
        include: { alert: { include: { container: true } } },
      }),
      this.prisma.receipt.count({ where }),
    ]);

    return buildPaginatedResponse(list, total, page, pageSize);
  }

  async findOne(id: string): Promise<Receipt> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: { alert: { include: { container: true } }, notification: true },
    });

    if (!receipt) {
      throw new NotFoundException('回执不存在');
    }

    return receipt;
  }

  async getAlertWithReceipts(alertId: string): Promise<any> {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        container: true,
        receipts: { orderBy: { handledAt: 'desc' } },
        notifications: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!alert) {
      throw new NotFoundException('告警不存在');
    }

    return alert;
  }
}
