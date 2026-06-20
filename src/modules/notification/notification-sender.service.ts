import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { NotificationChannel, NOTIFICATION_CHANNEL_VALUES } from '../../common/types/alert.types';

@Injectable()
export class NotificationSenderService {
  private readonly logger = new Logger(NotificationSenderService.name);

  async send(notification: Notification, content: string): Promise<boolean> {
    try {
      switch (notification.channel) {
        case 'SMS':
          return await this.sendSms(notification, content);
        case 'WECHAT_WORK':
          return await this.sendWechatWork(notification, content);
        case 'SYSTEM_MESSAGE':
          return await this.sendSystemMessage(notification, content);
        case 'EMAIL':
          return await this.sendEmail(notification, content);
        default:
          this.logger.warn(`Unknown channel: ${notification.channel}`);
          return false;
      }
    } catch (error) {
      this.logger.error(
        `Failed to send notification to ${notification.recipientName} via ${notification.channel}`,
        error,
      );
      return false;
    }
  }

  private async sendSms(notification: Notification, content: string): Promise<boolean> {
    this.logger.log(
      `[SMS] 发送给 ${notification.recipientName} (${notification.recipientPhone}): ${content.substring(0, 50)}...`,
    );
    return true;
  }

  private async sendWechatWork(notification: Notification, content: string): Promise<boolean> {
    this.logger.log(
      `[企业微信] 发送给 ${notification.recipientName}: ${content.substring(0, 50)}...`,
    );
    return true;
  }

  private async sendSystemMessage(notification: Notification, content: string): Promise<boolean> {
    this.logger.log(
      `[系统消息] 发送给 ${notification.recipientName} (${notification.recipientId})`,
    );
    return true;
  }

  private async sendEmail(notification: Notification, content: string): Promise<boolean> {
    this.logger.log(
      `[邮件] 发送给 ${notification.recipientName}: ${content.substring(0, 50)}...`,
    );
    return true;
  }
}
