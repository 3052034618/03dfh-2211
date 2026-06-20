import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotificationOrchestratorService, NotificationResult } from '../notification/notification-orchestrator.service';
import { QueryAlertDto } from './dto/alert.dto';
import { PaginationDto, buildPaginatedResponse, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Alert, Notification, Receipt, Container, AlertOperationLog } from '@prisma/client';
import { AlertStatus, NOTIFICATION_ORDER, RecipientRole } from '../../common/types/alert.types';
import { EscalationInfo, EscalationStatus, calculateEscalationInfo, getRoleDisplayName } from '../../common/utils/escalation.util';
import * as dayjs from 'dayjs';

export interface TimelineEvent {
  id: string;
  type: 'ALERT_CREATED' | 'NOTIFICATION_SENT' | 'ESCALATION' | 'RECEIPT_SUBMITTED' | 'ALERT_RESOLVED' | 'ALERT_CLOSED' | 'MANUAL_PAUSE' | 'MANUAL_RESUME' | 'MANUAL_JUMP_LEVEL' | 'MANUAL_INTERVENTION';
  timestamp: string;
  title: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface AlertDetail extends Alert {
  container?: Container;
  notifications?: Notification[];
  receipts?: Receipt[];
  escalationInfo: EscalationInfo;
}

@Injectable()
export class AlertService {
  constructor(
    private prisma: PrismaService,
    private orchestratorService: NotificationOrchestratorService,
  ) {}

  async findAll(
    query: QueryAlertDto,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<Alert & { escalationInfo: EscalationInfo }>> {
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

    const listWithInfo = list.map((alert: any) => ({
      ...alert,
      escalationInfo: calculateEscalationInfo(alert),
    }));

    return buildPaginatedResponse(listWithInfo, total, page, pageSize);
  }

  async findOne(id: string): Promise<AlertDetail> {
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

    return {
      ...alert,
      escalationInfo: calculateEscalationInfo(alert),
    };
  }

  async getTimeline(id: string): Promise<TimelineEvent[]> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        container: true,
        notifications: { orderBy: { createdAt: 'asc' } },
        receipts: { orderBy: { handledAt: 'asc' } },
        operationLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!alert) {
      throw new NotFoundException('告警不存在');
    }

    const events: TimelineEvent[] = [];

    events.push({
      id: `alert-${alert.id}`,
      type: 'ALERT_CREATED',
      timestamp: alert.createdAt.toISOString(),
      title: '告警触发',
      description: `告警类型：${this.getAlertTypeName(alert.alertType)}，当前值：${alert.currentValue}，阈值：${alert.threshold}`,
      metadata: {
        alertType: alert.alertType,
        currentValue: alert.currentValue,
        threshold: alert.threshold,
      },
    });

    let lastEscalationLevel = -1;
    for (const notif of alert.notifications) {
      if (notif.escalationLevel > lastEscalationLevel && notif.escalationLevel > 0) {
        const prevRole = getRoleDisplayName(NOTIFICATION_ORDER[notif.escalationLevel - 1]);
        const currRole = getRoleDisplayName(NOTIFICATION_ORDER[notif.escalationLevel]);
        events.push({
          id: `escalation-${notif.id}`,
          type: 'ESCALATION',
          timestamp: notif.createdAt.toISOString(),
          title: `催办升级：${prevRole} → ${currRole}`,
          description: `${prevRole}未处理，已升级通知到${currRole}`,
          metadata: {
            fromLevel: notif.escalationLevel - 1,
            toLevel: notif.escalationLevel,
            fromRole: NOTIFICATION_ORDER[notif.escalationLevel - 1],
            toRole: NOTIFICATION_ORDER[notif.escalationLevel],
          },
        });
        lastEscalationLevel = notif.escalationLevel;
      }

      events.push({
        id: `notif-${notif.id}`,
        type: 'NOTIFICATION_SENT',
        timestamp: notif.createdAt.toISOString(),
        title: `通知已发送（${this.getChannelDisplayName(notif.channel)}）`,
        description: `发送给：${notif.recipientName}（${getRoleDisplayName(notif.recipientRole as RecipientRole)}），状态：${this.getNotifStatusName(notif.status)}`,
        metadata: {
          recipientRole: notif.recipientRole,
          recipientName: notif.recipientName,
          channel: notif.channel,
          status: notif.status,
          escalationLevel: notif.escalationLevel,
        },
      });
    }

    for (const receipt of alert.receipts) {
      const action = this.getReceiptAction(receipt.status);
      events.push({
        id: `receipt-${receipt.id}`,
        type: 'RECEIPT_SUBMITTED',
        timestamp: receipt.handledAt.toISOString(),
        title: `处置回执：${action.title}`,
        description: `处理人：${receipt.handlerName}，${action.description}`,
        metadata: {
          handlerId: receipt.handlerId,
          handlerName: receipt.handlerName,
          status: receipt.status,
          remark: receipt.remark,
          stopsEscalation: action.stopsEscalation,
        },
      });
    }

    if (alert.status === 'RESOLVED') {
      events.push({
        id: `resolved-${alert.id}`,
        type: 'ALERT_RESOLVED',
        timestamp: alert.endTime?.toISOString() || alert.updatedAt.toISOString(),
        title: '告警已恢复',
        description: '设备数据恢复正常，告警自动解除',
      });
    }

    if (alert.status === 'CLOSED') {
      events.push({
        id: `closed-${alert.id}`,
        type: 'ALERT_CLOSED',
        timestamp: alert.endTime?.toISOString() || alert.updatedAt.toISOString(),
        title: '告警已关闭',
        description: '告警已手动关闭',
      });
    }

    for (const log of alert.operationLogs || []) {
      const eventInfo = this.getOperationLogEventInfo(log);
      events.push({
        id: `op-${log.id}`,
        type: eventInfo.type as any,
        timestamp: log.createdAt.toISOString(),
        title: eventInfo.title,
        description: eventInfo.description,
        metadata: {
          operationType: log.operationType,
          operatorId: log.operatorId,
          operatorName: log.operatorName,
          reason: log.reason,
          beforeStep: log.beforeStep,
          afterStep: log.afterStep,
          beforeRole: log.beforeRole,
          afterRole: log.afterRole,
          pausedUntil: log.pausedUntil?.toISOString(),
        },
      });
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return events;
  }

  private getChannelDisplayName(channel: string): string {
    const map: Record<string, string> = {
      SMS: '短信',
      WECHAT_WORK: '企业微信',
      SYSTEM_MESSAGE: '系统消息',
      EMAIL: '邮件',
    };
    return map[channel] || channel;
  }

  private getNotifStatusName(status: string): string {
    const map: Record<string, string> = {
      PENDING: '待发送',
      SENT: '已发送',
      FAILED: '发送失败',
      ACKNOWLEDGED: '已确认',
    };
    return map[status] || status;
  }

  private getAlertTypeName(type: string): string {
    const map: Record<string, string> = {
      TEMPERATURE_HIGH: '温度偏高',
      TEMPERATURE_LOW: '温度偏低',
      TEMPERATURE_FLUCTUATION: '温度波动',
      DOOR_OPEN: '开门异常',
      POWER_FAILURE: '电源断开',
      POSITION_DEVIATION: '路线偏离',
      HUMIDITY_HIGH: '湿度偏高',
      HUMIDITY_LOW: '湿度偏低',
    };
    return map[type] || type;
  }

  private getReceiptAction(status: string): { title: string; description: string; stopsEscalation: boolean } {
    const map: Record<string, { title: string; description: string; stopsEscalation: boolean }> = {
      CONFIRMED: { title: '已确认', description: '确认告警有效，停止催办', stopsEscalation: true },
      FALSE_ALARM: { title: '误报', description: '判定为误报，告警已关闭', stopsEscalation: true },
      IN_PROGRESS: { title: '现场处理中', description: '正在现场处理，停止催办', stopsEscalation: true },
      ESCALATED: { title: '升级理赔', description: '申请升级理赔，继续催办升级', stopsEscalation: false },
    };
    return map[status] || { title: status, description: '', stopsEscalation: false };
  }

  private getOperationLogEventInfo(log: AlertOperationLog): { type: string; title: string; description: string } {
    const operator = log.operatorName || log.operatorId || '系统';
    const reason = log.reason ? `，原因：${log.reason}` : '';

    switch (log.operationType) {
      case 'PAUSE_ESCALATION':
        return {
          type: 'OPERATION_PAUSE',
          title: '人工暂停催办',
          description: `${operator}暂停了催办${reason}，暂停至：${log.pausedUntil ? new Date(log.pausedUntil).toLocaleString() : '未知'}`,
        };
      case 'RESUME_ESCALATION':
        return {
          type: 'OPERATION_RESUME',
          title: '人工恢复催办',
          description: `${operator}恢复了催办${reason}，从${getRoleDisplayName(log.afterRole || '')}层继续`,
        };
      case 'JUMP_LEVEL':
        const from = getRoleDisplayName(log.beforeRole || '');
        const to = getRoleDisplayName(log.afterRole || '');
        return {
          type: 'OPERATION_JUMP',
          title: `人工调整层级：${from} → ${to}`,
          description: `${operator}将催办层级从${from}调整到${to}${reason}`,
        };
      default:
        return {
          type: 'OPERATION_OTHER',
          title: '人工干预',
          description: `${operator}执行了${log.operationType}操作${reason}`,
        };
    }
  }

  async close(id: string, remark?: string): Promise<AlertDetail> {
    const alert = await this.findOne(id);

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        status: 'CLOSED' as AlertStatus,
        endTime: new Date(),
        updatedAt: new Date(),
      },
      include: {
        container: true,
        notifications: { orderBy: { createdAt: 'desc' } },
        receipts: { orderBy: { handledAt: 'desc' } },
      },
    });

    return {
      ...updated,
      escalationInfo: calculateEscalationInfo(updated),
    };
  }

  async triggerNotifications(id: string): Promise<NotificationResult[]> {
    const alert = await this.findOne(id);
    return this.orchestratorService.processNewAlert(alert);
  }

  async pauseEscalation(
    id: string,
    params: { durationMinutes: number; reason?: string; operatorId?: string; operatorName?: string },
  ): Promise<AlertDetail> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException('告警不存在');
    }

    const pausedUntil = dayjs().add(params.durationMinutes, 'minute').toDate();

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        pausedUntil,
        pausedReason: params.reason || null,
        updatedAt: new Date(),
      },
      include: {
        container: true,
        notifications: { orderBy: { createdAt: 'desc' } },
        receipts: { orderBy: { handledAt: 'desc' } },
      },
    });

    await this.prisma.alertOperationLog.create({
      data: {
        alertId: id,
        operationType: 'PAUSE_ESCALATION',
        operatorId: params.operatorId || null,
        operatorName: params.operatorName || null,
        reason: params.reason || null,
        beforeStep: alert.escalationStep,
        afterStep: alert.escalationStep,
        beforeRole: alert.currentNotifyRole,
        afterRole: alert.currentNotifyRole,
        pausedUntil,
      },
    });

    return {
      ...updated,
      escalationInfo: calculateEscalationInfo(updated),
    };
  }

  async resumeEscalation(
    id: string,
    params: { reason?: string; operatorId?: string; operatorName?: string },
  ): Promise<AlertDetail> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException('告警不存在');
    }

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        pausedUntil: null,
        pausedReason: null,
        lastNotifyTime: new Date(),
        updatedAt: new Date(),
      },
      include: {
        container: true,
        notifications: { orderBy: { createdAt: 'desc' } },
        receipts: { orderBy: { handledAt: 'desc' } },
      },
    });

    await this.prisma.alertOperationLog.create({
      data: {
        alertId: id,
        operationType: 'RESUME_ESCALATION',
        operatorId: params.operatorId || null,
        operatorName: params.operatorName || null,
        reason: params.reason || null,
        beforeStep: alert.escalationStep,
        afterStep: alert.escalationStep,
        beforeRole: alert.currentNotifyRole,
        afterRole: alert.currentNotifyRole,
      },
    });

    return {
      ...updated,
      escalationInfo: calculateEscalationInfo(updated),
    };
  }

  async jumpEscalationLevel(
    id: string,
    params: { targetStep: number; reason?: string; operatorId?: string; operatorName?: string },
  ): Promise<AlertDetail> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException('告警不存在');
    }

    if (params.targetStep < 0 || params.targetStep >= NOTIFICATION_ORDER.length) {
      throw new Error(`目标层级必须在 0 到 ${NOTIFICATION_ORDER.length - 1} 之间`);
    }

    const targetRole = NOTIFICATION_ORDER[params.targetStep];

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        escalationStep: params.targetStep,
        currentNotifyRole: targetRole,
        lastNotifyTime: new Date(),
        pausedUntil: null,
        pausedReason: null,
        updatedAt: new Date(),
      },
      include: {
        container: true,
        notifications: { orderBy: { createdAt: 'desc' } },
        receipts: { orderBy: { handledAt: 'desc' } },
      },
    });

    await this.prisma.alertOperationLog.create({
      data: {
        alertId: id,
        operationType: 'JUMP_LEVEL',
        operatorId: params.operatorId || null,
        operatorName: params.operatorName || null,
        reason: params.reason || null,
        beforeStep: alert.escalationStep,
        afterStep: params.targetStep,
        beforeRole: alert.currentNotifyRole,
        afterRole: targetRole,
      },
    });

    return {
      ...updated,
      escalationInfo: calculateEscalationInfo(updated),
    };
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
