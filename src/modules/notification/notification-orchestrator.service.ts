import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotificationContentService } from './notification-content.service';
import { NotificationSenderService } from './notification-sender.service';
import { Alert, Container, Contact, Notification } from '@prisma/client';
import {
  RecipientRole,
  NotificationChannel,
  NotificationStatus,
  AlertStatus,
  NOTIFICATION_ORDER,
} from '../../common/types/alert.types';

export interface NotificationResult {
  notificationId: string;
  success: boolean;
  role: RecipientRole;
  escalationLevel: number;
}

@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    private prisma: PrismaService,
    private contentService: NotificationContentService,
    private senderService: NotificationSenderService,
  ) {}

  async processNewAlert(alert: Alert): Promise<NotificationResult[]> {
    this.logger.log(`Processing initial notification for alert: ${alert.id}, sending to DRIVER only`);

    const container = await this.prisma.container.findUnique({
      where: { id: alert.containerId },
    });

    if (!container) {
      this.logger.error(`Container not found for alert: ${alert.id}`);
      return [];
    }

    const firstRole: RecipientRole = 'DRIVER';
    const contacts = await this.prisma.contact.findMany({
      where: { role: firstRole, enabled: true },
    });

    const results: NotificationResult[] = [];
    const receiptLink = this.contentService.buildReceiptLink(alert.id);

    for (const contact of contacts) {
      const result = await this.createAndSendNotification(
        alert,
        container,
        contact,
        this.getChannelForRole(firstRole, alert),
        receiptLink,
        0,
      );
      if (result) {
        results.push(result);
      }
    }

    await this.prisma.alert.update({
      where: { id: alert.id },
      data: {
        lastNotifyTime: new Date(),
        escalationStep: 0,
        currentNotifyRole: firstRole,
      },
    });

    return results;
  }

  async escalateAlert(alert: Alert): Promise<NotificationResult[]> {
    const nextStep = alert.escalationStep + 1;
    if (nextStep >= NOTIFICATION_ORDER.length) {
      this.logger.log(`Alert ${alert.id} has reached maximum escalation level, no more roles to notify`);
      return [];
    }

    const nextRole = NOTIFICATION_ORDER[nextStep];
    this.logger.log(`Escalating alert: ${alert.id}, from ${alert.currentNotifyRole} → ${nextRole} (step ${nextStep})`);

    const container = await this.prisma.container.findUnique({
      where: { id: alert.containerId },
    });

    if (!container) {
      return [];
    }

    const contacts = await this.prisma.contact.findMany({
      where: { role: nextRole, enabled: true },
    });

    const results: NotificationResult[] = [];
    const receiptLink = this.contentService.buildReceiptLink(alert.id);

    for (const contact of contacts) {
      const result = await this.createAndSendNotification(
        alert,
        container,
        contact,
        this.getChannelForRole(nextRole, alert),
        receiptLink,
        nextStep,
        true,
      );
      if (result) {
        results.push(result);
      }
    }

    await this.prisma.alert.update({
      where: { id: alert.id },
      data: {
        escalationStep: nextStep,
        currentNotifyRole: nextRole,
        lastNotifyTime: new Date(),
      },
    });

    return results;
  }

  async retryFailedNotifications(alertId: string): Promise<NotificationResult[]> {
    const failedNotifications = await this.prisma.notification.findMany({
      where: {
        alertId,
        status: 'FAILED' as NotificationStatus,
      },
      include: { alert: { include: { container: true } } },
    });

    const results: NotificationResult[] = [];

    for (const notification of failedNotifications) {
      const content = this.contentService.generateContent(
        notification.alert.container,
        notification.alert,
      );

      const success = await this.senderService.send(notification, content);

      if (success) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'SENT' as NotificationStatus,
            sentAt: new Date(),
          },
        });
      }

      results.push({
        notificationId: notification.id,
        success,
        role: notification.recipientRole as RecipientRole,
        escalationLevel: notification.escalationLevel,
      });
    }

    return results;
  }

  private async createAndSendNotification(
    alert: Alert,
    container: Container,
    contact: Contact,
    channel: NotificationChannel,
    receiptLink: string,
    escalationLevel: number,
    isEscalation: boolean = false,
  ): Promise<NotificationResult | null> {
    const existingNotification = await this.prisma.notification.findFirst({
      where: {
        alertId: alert.id,
        recipientId: contact.id,
        channel,
      },
    });

    if (existingNotification) {
      this.logger.debug(
        `Notification already sent to ${contact.name} for alert ${alert.id}`,
      );
      return null;
    }

    let content: string;
    switch (channel) {
      case 'SMS':
        content = this.contentService.generateSmsContent(container, alert, receiptLink);
        break;
      case 'WECHAT_WORK':
        content = this.contentService.generateWechatContent(container, alert, receiptLink);
        break;
      case 'SYSTEM_MESSAGE':
        content = this.contentService.generateSystemMessageContent(container, alert, receiptLink);
        break;
      default:
        content = this.contentService.generateContent(container, alert);
    }

    if (isEscalation) {
      const roleName = this.getRoleDisplayName(alert.currentNotifyRole as RecipientRole);
      content = `【升级通知·${roleName}未处理】\n${content}`;
    }

    const notification = await this.prisma.notification.create({
      data: {
        alertId: alert.id,
        recipientRole: contact.role,
        recipientId: contact.id,
        recipientName: contact.name,
        recipientPhone: contact.phone,
        channel,
        content,
        receiptLink,
        escalationLevel,
      },
    });

    const success = await this.senderService.send(notification, content);

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: (success ? 'SENT' : 'FAILED') as NotificationStatus,
        sentAt: success ? new Date() : null,
      },
    });

    this.logger.log(
      `Notification ${success ? 'sent' : 'failed'} to ${contact.name} (${contact.role}) via ${channel}, escalationLevel=${escalationLevel}`,
    );

    return {
      notificationId: notification.id,
      success,
      role: contact.role as RecipientRole,
      escalationLevel,
    };
  }

  private getChannelForRole(role: RecipientRole, alert?: Alert): NotificationChannel {
    if (alert?.escalationChannels) {
      try {
        const channels = JSON.parse(alert.escalationChannels);
        if (channels[role]) {
          return channels[role] as NotificationChannel;
        }
      } catch {
        // fall through to default
      }
    }

    switch (role) {
      case 'DRIVER':
        return 'SMS';
      case 'DISPATCHER':
        return 'WECHAT_WORK';
      case 'CUSTOMER_SERVICE':
        return 'SYSTEM_MESSAGE';
      case 'MANAGER':
        return 'WECHAT_WORK';
      default:
        return 'SYSTEM_MESSAGE';
    }
  }

  private getRoleDisplayName(role: RecipientRole): string {
    switch (role) {
      case 'DRIVER': return '司机';
      case 'DISPATCHER': return '调度';
      case 'CUSTOMER_SERVICE': return '货主客服';
      case 'MANAGER': return '经理';
      default: return role;
    }
  }

  async findPendingAlertsForEscalation(): Promise<Alert[]> {
    const now = Date.now();

    const activeAlerts = await this.prisma.alert.findMany({
      where: {
        status: { in: ['ACTIVE'] as AlertStatus[] },
        escalationStep: { lt: NOTIFICATION_ORDER.length - 1 },
        receipts: {
          none: {
            status: { in: ['CONFIRMED', 'FALSE_ALARM', 'IN_PROGRESS'] },
          },
        },
      },
    });

    const pendingAlerts = activeAlerts.filter((alert) => {
      if (!alert.lastNotifyTime) {
        return false;
      }
      const intervalMs = (alert.escalationInterval || 1800) * 1000;
      return now - alert.lastNotifyTime.getTime() >= intervalMs;
    });

    this.logger.debug(
      `Found ${pendingAlerts.length} alerts pending escalation out of ${activeAlerts.length} active alerts`,
    );

    return pendingAlerts;
  }
}
