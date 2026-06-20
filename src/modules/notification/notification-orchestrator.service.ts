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
    this.logger.log(`Processing notifications for alert: ${alert.id}`);

    const container = await this.prisma.container.findUnique({
      where: { id: alert.containerId },
    });

    if (!container) {
      this.logger.error(`Container not found for alert: ${alert.id}`);
      return [];
    }

    const contacts = await this.prisma.contact.findMany({
      where: { enabled: true },
      orderBy: [{ role: 'asc' }],
    });

    const results: NotificationResult[] = [];
    const receiptLink = this.contentService.buildReceiptLink(alert.id);

    for (const role of NOTIFICATION_ORDER) {
      const roleContacts = contacts.filter((c) => c.role === role);

      for (const contact of roleContacts) {
        const result = await this.createAndSendNotification(
          alert,
          container,
          contact,
          this.getChannelForRole(role),
          receiptLink,
        );
        if (result) {
          results.push(result);
        }
      }
    }

    await this.prisma.alert.update({
      where: { id: alert.id },
      data: { lastNotifyTime: new Date() },
    });

    return results;
  }

  async escalateAlert(alert: Alert): Promise<NotificationResult[]> {
    this.logger.log(`Escalating alert: ${alert.id}, step: ${alert.escalationStep + 1}`);

    const container = await this.prisma.container.findUnique({
      where: { id: alert.containerId },
    });

    if (!container) {
      return [];
    }

    const nextStep = alert.escalationStep + 1;
    if (nextStep >= NOTIFICATION_ORDER.length) {
      this.logger.log(`Alert ${alert.id} has reached maximum escalation level`);
      return [];
    }

    const nextRole = NOTIFICATION_ORDER[nextStep];
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
        this.getChannelForRole(nextRole),
        receiptLink,
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

      results.push({ notificationId: notification.id, success });
    }

    return results;
  }

  private async createAndSendNotification(
    alert: Alert,
    container: Container,
    contact: Contact,
    channel: NotificationChannel,
    receiptLink: string,
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
      content = `【升级通知】\n${content}`;
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
      `Notification ${success ? 'sent' : 'failed'} to ${contact.name} via ${channel}`,
    );

    return { notificationId: notification.id, success };
  }

  private getChannelForRole(role: RecipientRole): NotificationChannel {
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

  async findPendingAlertsForEscalation(): Promise<Alert[]> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    return this.prisma.alert.findMany({
      where: {
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] as AlertStatus[] },
        OR: [
          { lastNotifyTime: { lt: thirtyMinutesAgo } },
          { lastNotifyTime: null },
        ],
      },
    });
  }
}
