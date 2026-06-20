import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlertRule, Alert, Container, DeviceData } from '@prisma/client';
import {
  AlertType,
  AlertStatus,
  ALERT_TYPE_VALUES,
} from '../../common/types/alert.types';
import * as dayjs from 'dayjs';

interface RuleCheckResult {
  triggered: boolean;
  alertType: AlertType;
  currentValue?: number;
  threshold?: string;
  durationSec: number;
}

interface ContainerContext {
  container: Container;
  rules: AlertRule[];
  recentData: DeviceData[];
  activeAlerts: Alert[];
}

@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  constructor(private prisma: PrismaService) {}

  async processDeviceData(containerNo: string, data: Partial<DeviceData>): Promise<Alert[]> {
    this.logger.debug(`Processing device data for container: ${containerNo}`);

    const ctx = await this.buildContext(containerNo);
    if (!ctx) {
      this.logger.warn(`Container not found: ${containerNo}`);
      return [];
    }

    const triggeredAlerts: Alert[] = [];

    for (const rule of ctx.rules) {
      if (!ALERT_TYPE_VALUES.includes(rule.alertType as AlertType)) {
        continue;
      }

      const checkResult = this.checkRule(rule, ctx, data);

      if (checkResult.triggered) {
        const alert = await this.handleTriggeredRule(ctx, rule, checkResult, data);
        if (alert) {
          triggeredAlerts.push(alert);
        }
      } else {
        await this.resolveAlertIfRecovered(ctx, rule, data);
      }
    }

    return triggeredAlerts;
  }

  private async buildContext(containerNo: string): Promise<ContainerContext | null> {
    const container = await this.prisma.container.findUnique({
      where: { containerNo },
    });

    if (!container) return null;

    const [rules, recentData, activeAlerts] = await Promise.all([
      this.prisma.alertRule.findMany({
        where: {
          cargoType: { in: [container.cargoType, 'OTHER'] },
          enabled: true,
        },
      }),
      this.prisma.deviceData.findMany({
        where: { containerId: container.id },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      this.prisma.alert.findMany({
        where: {
          containerId: container.id,
          status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
        },
        include: { notifications: true, receipts: true },
      }),
    ]);

    return { container, rules, recentData, activeAlerts };
  }

  private checkRule(
    rule: AlertRule,
    ctx: ContainerContext,
    currentData: Partial<DeviceData>,
  ): RuleCheckResult {
    const dataPoints = [currentData, ...ctx.recentData].filter(
      (d) => d !== undefined && d !== null,
    ) as DeviceData[];

    const alertType = rule.alertType as AlertType;

    switch (alertType) {
      case 'TEMPERATURE_HIGH':
        return this.checkTemperatureHigh(rule, dataPoints);
      case 'TEMPERATURE_LOW':
        return this.checkTemperatureLow(rule, dataPoints);
      case 'TEMPERATURE_FLUCTUATION':
        return this.checkTemperatureFluctuation(rule, dataPoints);
      case 'DOOR_OPEN':
        return this.checkDoorOpen(rule, dataPoints);
      case 'POWER_FAILURE':
        return this.checkPowerFailure(rule, dataPoints);
      case 'HUMIDITY_HIGH':
        return this.checkHumidityHigh(rule, dataPoints);
      case 'HUMIDITY_LOW':
        return this.checkHumidityLow(rule, dataPoints);
      default:
        return { triggered: false, alertType, durationSec: 0 };
    }
  }

  private checkTemperatureHigh(rule: AlertRule, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.temperature !== undefined && d.temperature !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'TEMPERATURE_HIGH', durationSec: 0 };

    const threshold = rule.maxValue! + (rule.tolerance || 0);
    const violatingData = validData.filter((d) => d.temperature! > threshold);

    if (violatingData.length === 0) {
      return { triggered: false, alertType: 'TEMPERATURE_HIGH', durationSec: 0 };
    }

    const duration = this.calculateDuration(violatingData);
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'TEMPERATURE_HIGH',
      currentValue: validData[0].temperature ?? undefined,
      threshold: `> ${threshold}℃`,
      durationSec: duration,
    };
  }

  private checkTemperatureLow(rule: AlertRule, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.temperature !== undefined && d.temperature !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'TEMPERATURE_LOW', durationSec: 0 };

    const threshold = rule.minValue! - (rule.tolerance || 0);
    const violatingData = validData.filter((d) => d.temperature! < threshold);

    if (violatingData.length === 0) {
      return { triggered: false, alertType: 'TEMPERATURE_LOW', durationSec: 0 };
    }

    const duration = this.calculateDuration(violatingData);
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'TEMPERATURE_LOW',
      currentValue: validData[0].temperature ?? undefined,
      threshold: `< ${threshold}℃`,
      durationSec: duration,
    };
  }

  private checkTemperatureFluctuation(rule: AlertRule, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.temperature !== undefined && d.temperature !== null);
    if (validData.length < 2) return { triggered: false, alertType: 'TEMPERATURE_FLUCTUATION', durationSec: 0 };

    const temps = validData.map((d) => d.temperature!);
    const max = Math.max(...temps);
    const min = Math.min(...temps);
    const fluctuation = max - min;

    if (fluctuation < (rule.tolerance || 0)) {
      return { triggered: false, alertType: 'TEMPERATURE_FLUCTUATION', durationSec: 0 };
    }

    const duration = this.calculateDuration(validData);
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'TEMPERATURE_FLUCTUATION',
      currentValue: fluctuation,
      threshold: `波动 > ${rule.tolerance}℃`,
      durationSec: duration,
    };
  }

  private checkDoorOpen(rule: AlertRule, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.doorOpen !== undefined && d.doorOpen !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'DOOR_OPEN', durationSec: 0 };

    const openData = validData.filter((d) => d.doorOpen === true);
    if (openData.length === 0) {
      return { triggered: false, alertType: 'DOOR_OPEN', durationSec: 0 };
    }

    const duration = this.calculateDuration(openData);
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'DOOR_OPEN',
      currentValue: 1,
      threshold: `开门时长 > ${rule.allowedDuration}秒`,
      durationSec: duration,
    };
  }

  private checkPowerFailure(rule: AlertRule, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.powerStatus !== undefined && d.powerStatus !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'POWER_FAILURE', durationSec: 0 };

    const failureData = validData.filter((d) => d.powerStatus === false);
    if (failureData.length === 0) {
      return { triggered: false, alertType: 'POWER_FAILURE', durationSec: 0 };
    }

    const duration = this.calculateDuration(failureData);
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'POWER_FAILURE',
      currentValue: 0,
      threshold: '电源断开',
      durationSec: duration,
    };
  }

  private checkHumidityHigh(rule: AlertRule, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.humidity !== undefined && d.humidity !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'HUMIDITY_HIGH', durationSec: 0 };

    const threshold = rule.maxValue!;
    const violatingData = validData.filter((d) => d.humidity! > threshold);

    if (violatingData.length === 0) {
      return { triggered: false, alertType: 'HUMIDITY_HIGH', durationSec: 0 };
    }

    const duration = this.calculateDuration(violatingData);
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'HUMIDITY_HIGH',
      currentValue: validData[0].humidity ?? undefined,
      threshold: `> ${threshold}%`,
      durationSec: duration,
    };
  }

  private checkHumidityLow(rule: AlertRule, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.humidity !== undefined && d.humidity !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'HUMIDITY_LOW', durationSec: 0 };

    const threshold = rule.minValue!;
    const violatingData = validData.filter((d) => d.humidity! < threshold);

    if (violatingData.length === 0) {
      return { triggered: false, alertType: 'HUMIDITY_LOW', durationSec: 0 };
    }

    const duration = this.calculateDuration(violatingData);
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'HUMIDITY_LOW',
      currentValue: validData[0].humidity ?? undefined,
      threshold: `< ${threshold}%`,
      durationSec: duration,
    };
  }

  private calculateDuration(data: DeviceData[]): number {
    if (data.length === 0) return 0;

    const now = dayjs();
    const oldest = dayjs(data[data.length - 1].timestamp);
    return now.diff(oldest, 'second');
  }

  private async handleTriggeredRule(
    ctx: ContainerContext,
    rule: AlertRule,
    checkResult: RuleCheckResult,
    data: Partial<DeviceData>,
  ): Promise<Alert | null> {
    const existingAlert = ctx.activeAlerts.find((a) => a.alertType === rule.alertType);

    const suggestion = this.generateSuggestion(checkResult.alertType);

    if (existingAlert) {
      return this.prisma.alert.update({
        where: { id: existingAlert.id },
        data: {
          durationSec: checkResult.durationSec,
          currentValue: checkResult.currentValue ?? null,
          threshold: checkResult.threshold ?? null,
          updatedAt: new Date(),
        },
      });
    }

    this.logger.log(
      `New alert triggered for container ${ctx.container.containerNo}: ${rule.alertType}`,
    );

    return this.prisma.alert.create({
      data: {
        containerId: ctx.container.id,
        alertType: checkResult.alertType,
        alertLevel: rule.alertLevel,
        status: 'ACTIVE' as AlertStatus,
        currentValue: checkResult.currentValue ?? null,
        threshold: checkResult.threshold ?? null,
        durationSec: checkResult.durationSec,
        suggestion,
      },
    });
  }

  private async resolveAlertIfRecovered(
    ctx: ContainerContext,
    rule: AlertRule,
    data: Partial<DeviceData>,
  ): Promise<void> {
    const activeAlert = ctx.activeAlerts.find(
      (a) => a.alertType === rule.alertType && a.status !== 'CLOSED',
    );

    if (activeAlert) {
      this.logger.log(
        `Alert resolved for container ${ctx.container.containerNo}: ${rule.alertType}`,
      );

      await this.prisma.alert.update({
        where: { id: activeAlert.id },
        data: {
          status: 'RESOLVED' as AlertStatus,
          endTime: new Date(),
          updatedAt: new Date(),
        },
      });
    }
  }

  private generateSuggestion(alertType: AlertType): string {
    const suggestions: Record<AlertType, string> = {
      TEMPERATURE_HIGH: '建议先检查制冷机组运行状态，确认温度设定是否正确',
      TEMPERATURE_LOW: '建议先检查温控器设定，确认是否误调低温',
      TEMPERATURE_FLUCTUATION: '建议检查箱门密封是否完好，制冷机组是否频繁启停',
      DOOR_OPEN: '建议立即关闭箱门，检查门锁是否正常',
      POWER_FAILURE: '建议检查电源插头和线缆，必要时启动备用电源',
      POSITION_DEVIATION: '建议确认行驶路线，联系调度核实',
      HUMIDITY_HIGH: '建议检查通风系统，适当降低湿度',
      HUMIDITY_LOW: '建议检查加湿器运行状态，适当提高湿度',
    };
    return suggestions[alertType] || '请尽快检查设备状态';
  }
}
