import { Injectable } from '@nestjs/common';
import { Alert, Container } from '@prisma/client';
import { ALERT_TYPE_NAMES, AlertContext, AlertType } from '../../common/types/alert.types';

@Injectable()
export class NotificationContentService {
  generateContent(container: Container, alert: Alert): string {
    const durationText = this.formatDuration(alert.durationSec);
    const alertTypeName = ALERT_TYPE_NAMES[alert.alertType as AlertType] || alert.alertType;
    const routeText = this.formatRoute(container);

    const parts = [
      `【冷藏箱异常告警】`,
      `箱号：${container.containerNo}`,
      `路线：${routeText}`,
      `异常：${alertTypeName}`,
      `已持续：${durationText}`,
    ];

    if (alert.currentValue !== undefined && alert.currentValue !== null) {
      const valueText = this.formatValue(alert);
      parts.push(`当前：${valueText}`);
    }

    if (alert.threshold) {
      parts.push(`阈值：${alert.threshold}`);
    }

    if (alert.suggestion) {
      parts.push(`建议：${alert.suggestion}`);
    }

    return parts.join('\n');
  }

  generateSmsContent(container: Container, alert: Alert, receiptLink: string): string {
    const durationText = this.formatDuration(alert.durationSec);
    const alertTypeName = ALERT_TYPE_NAMES[alert.alertType as AlertType] || alert.alertType;

    return (
      `【冷藏箱告警】${container.containerNo} ${alertTypeName}，` +
      `已持续${durationText}，路线${container.origin}→${container.destination}。` +
      `${alert.suggestion} 点击处理：${receiptLink}`
    );
  }

  generateWechatContent(container: Container, alert: Alert, receiptLink: string): string {
    const durationText = this.formatDuration(alert.durationSec);
    const alertTypeName = ALERT_TYPE_NAMES[alert.alertType as AlertType] || alert.alertType;
    const levelText = this.getLevelEmoji(alert.alertLevel);

    return (
      `${levelText} **冷藏箱异常告警**\n\n` +
      `> **箱号**：${container.containerNo}\n` +
      `> **路线**：${container.origin} → ${container.destination}\n` +
      `> **当前位置**：${container.currentRoute || '未知'}\n` +
      `> **异常类型**：${alertTypeName}\n` +
      `> **持续时间**：${durationText}\n` +
      `${alert.currentValue !== undefined ? `> **当前值**：${this.formatValue(alert)}\n` : ''}` +
      `${alert.threshold ? `> **阈值**：${alert.threshold}\n` : ''}\n` +
      `💡 **处理建议**：${alert.suggestion}\n\n` +
      `[点击查看详情并处理](${receiptLink})`
    );
  }

  generateSystemMessageContent(container: Container, alert: Alert, receiptLink: string): string {
    const durationText = this.formatDuration(alert.durationSec);
    const alertTypeName = ALERT_TYPE_NAMES[alert.alertType as AlertType] || alert.alertType;

    return JSON.stringify({
      type: 'REEFER_ALERT',
      alertId: alert.id,
      containerNo: container.containerNo,
      cargoType: container.cargoType,
      alertType: alert.alertType,
      alertLevel: alert.alertLevel,
      alertTypeName,
      route: {
        origin: container.origin,
        destination: container.destination,
        current: container.currentRoute,
      },
      duration: {
        seconds: alert.durationSec,
        text: durationText,
      },
      currentValue: alert.currentValue,
      threshold: alert.threshold,
      suggestion: alert.suggestion,
      receiptLink,
      timestamp: new Date().toISOString(),
    });
  }

  buildReceiptLink(alertId: string): string {
    return `${process.env.BASE_URL || 'http://localhost:3000'}/api/receipts/${alertId}`;
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}秒`;
    }
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分钟`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  }

  private formatRoute(container: Container): string {
    if (container.currentRoute) {
      return `${container.origin} → ${container.currentRoute} → ${container.destination}`;
    }
    return `${container.origin} → ${container.destination}`;
  }

  private formatValue(alert: Alert): string {
    switch (alert.alertType) {
      case 'TEMPERATURE_HIGH':
      case 'TEMPERATURE_LOW':
      case 'TEMPERATURE_FLUCTUATION':
        return `${alert.currentValue?.toFixed(1)}℃`;
      case 'HUMIDITY_HIGH':
      case 'HUMIDITY_LOW':
        return `${alert.currentValue?.toFixed(1)}%`;
      case 'DOOR_OPEN':
        return alert.currentValue === 1 ? '开启' : '关闭';
      case 'POWER_FAILURE':
        return alert.currentValue === 0 ? '断开' : '正常';
      case 'POSITION_DEVIATION':
        return `${alert.currentValue?.toFixed(1)}km`;
      default:
        return String(alert.currentValue);
    }
  }

  private getLevelEmoji(level: string): string {
    switch (level) {
      case 'CRITICAL':
        return '🔴';
      case 'WARNING':
        return '🟠';
      case 'INFO':
        return '🔵';
      default:
        return '⚠️';
    }
  }

  buildAlertContext(container: Container, alert: Alert): AlertContext {
    return {
      containerNo: container.containerNo,
      origin: container.origin,
      destination: container.destination,
      currentRoute: container.currentRoute || '',
      alertType: alert.alertType as AlertType,
      alertLevel: alert.alertLevel as AlertContext['alertLevel'],
      durationSec: alert.durationSec,
      currentValue: alert.currentValue ?? undefined,
      threshold: alert.threshold ?? undefined,
      suggestion: alert.suggestion ?? undefined,
    };
  }
}
