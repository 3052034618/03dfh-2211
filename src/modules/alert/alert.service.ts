import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotificationOrchestratorService, NotificationResult } from '../notification/notification-orchestrator.service';
import { QueryAlertDto } from './dto/alert.dto';
import { PaginationDto, buildPaginatedResponse, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Alert, Notification, Receipt, Container } from '@prisma/client';
import { AlertStatus, NOTIFICATION_ORDER, RecipientRole } from '../../common/types/alert.types';
import * as dayjs from 'dayjs';

export interface EscalationInfo {
  currentRole: string;
  currentRoleName: string;
  currentStep: number;
  nextRole: string | null;
  nextRoleName: string | null;
  isLastLevel: boolean;
  totalLevels: number;
  escalationIntervalSec: number;
  lastNotifyTime: string | null;
  nextEscalationTime: string | null;
  willEscalate: boolean;
}

export interface TimelineEvent {
  id: string;
  type: 'ALERT_CREATED' | 'NOTIFICATION_SENT' | 'ESCALATION' | 'RECEIPT_SUBMITTED' | 'ALERT_RESOLVED' | 'ALERT_CLOSED';
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
      escalationInfo: this.calculateEscalationInfo(alert),
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
      escalationInfo: this.calculateEscalationInfo(alert),
    };
  }

  async getTimeline(id: string): Promise<TimelineEvent[]> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        container: true,
        notifications: { orderBy: { createdAt: 'asc' } },
        receipts: { orderBy: { handledAt: 'asc' } },
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
        const prevRole = this.getRoleDisplayName(NOTIFICATION_ORDER[notif.escalationLevel - 1]);
        const currRole = this.getRoleDisplayName(NOTIFICATION_ORDER[notif.escalationLevel]);
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
        description: `发送给：${notif.recipientName}（${this.getRoleDisplayName(notif.recipientRole as RecipientRole)}），状态：${this.getNotifStatusName(notif.status)}`,
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

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return events;
  }

  private calculateEscalationInfo(alert: Alert): EscalationInfo {
    const currentStep = alert.escalationStep;
    const currentRole = alert.currentNotifyRole as RecipientRole;
    const isLastLevel = currentStep >= NOTIFICATION_ORDER.length - 1;
    const nextStep = currentStep + 1;
    const nextRole = isLastLevel ? null : NOTIFICATION_ORDER[nextStep];
    const intervalSec = alert.escalationInterval || 1800;

    let nextEscalationTime: string | null = null;
    let willEscalate = false;

    if (!isLastLevel && alert.status === 'ACTIVE' && alert.lastNotifyTime) {
      const nextTime = dayjs(alert.lastNotifyTime).add(intervalSec, 'second');
      nextEscalationTime = nextTime.toISOString();
      willEscalate = dayjs().isBefore(nextTime);
    }

    return {
      currentRole,
      currentRoleName: this.getRoleDisplayName(currentRole),
      currentStep,
      nextRole,
      nextRoleName: nextRole ? this.getRoleDisplayName(nextRole) : null,
      isLastLevel,
      totalLevels: NOTIFICATION_ORDER.length,
      escalationIntervalSec: intervalSec,
      lastNotifyTime: alert.lastNotifyTime ? alert.lastNotifyTime.toISOString() : null,
      nextEscalationTime,
      willEscalate,
    };
  }

  private getRoleDisplayName(role: RecipientRole | string): string {
    const map: Record<string, string> = {
      DRIVER: '司机',
      DISPATCHER: '调度',
      CUSTOMER_SERVICE: '货主客服',
      MANAGER: '经理',
    };
    return map[role] || role;
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
      escalationInfo: this.calculateEscalationInfo(updated),
    };
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
