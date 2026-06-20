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

interface Waypoint {
  lat: number;
  lng: number;
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
        return this.checkTemperatureHigh(rule, ctx, dataPoints);
      case 'TEMPERATURE_LOW':
        return this.checkTemperatureLow(rule, ctx, dataPoints);
      case 'TEMPERATURE_FLUCTUATION':
        return this.checkTemperatureFluctuation(rule, ctx, dataPoints);
      case 'DOOR_OPEN':
        return this.checkDoorOpen(rule, ctx, dataPoints);
      case 'POWER_FAILURE':
        return this.checkPowerFailure(rule, ctx, dataPoints);
      case 'POSITION_DEVIATION':
        return this.checkPositionDeviation(rule, ctx, dataPoints);
      case 'HUMIDITY_HIGH':
        return this.checkHumidityHigh(rule, ctx, dataPoints);
      case 'HUMIDITY_LOW':
        return this.checkHumidityLow(rule, ctx, dataPoints);
      default:
        return { triggered: false, alertType, durationSec: 0 };
    }
  }

  private checkTemperatureHigh(rule: AlertRule, ctx: ContainerContext, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.temperature !== undefined && d.temperature !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'TEMPERATURE_HIGH', durationSec: 0 };

    const threshold = rule.maxValue! + (rule.tolerance || 0);
    const violatingData = validData.filter((d) => d.temperature! > threshold);

    if (violatingData.length === 0) {
      return { triggered: false, alertType: 'TEMPERATURE_HIGH', durationSec: 0 };
    }

    const continuousViolatingData = this.findContinuousViolation(violatingData, ctx, 'TEMPERATURE_HIGH');
    const duration = this.calculateContinuousDuration(continuousViolatingData, ctx, 'TEMPERATURE_HIGH');
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'TEMPERATURE_HIGH',
      currentValue: validData[0].temperature ?? undefined,
      threshold: `> ${threshold}℃`,
      durationSec: duration,
    };
  }

  private checkTemperatureLow(rule: AlertRule, ctx: ContainerContext, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.temperature !== undefined && d.temperature !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'TEMPERATURE_LOW', durationSec: 0 };

    const threshold = rule.minValue! - (rule.tolerance || 0);
    const violatingData = validData.filter((d) => d.temperature! < threshold);

    if (violatingData.length === 0) {
      return { triggered: false, alertType: 'TEMPERATURE_LOW', durationSec: 0 };
    }

    const duration = this.calculateContinuousDuration(violatingData, ctx, 'TEMPERATURE_LOW');
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'TEMPERATURE_LOW',
      currentValue: validData[0].temperature ?? undefined,
      threshold: `< ${threshold}℃`,
      durationSec: duration,
    };
  }

  private checkTemperatureFluctuation(rule: AlertRule, ctx: ContainerContext, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.temperature !== undefined && d.temperature !== null);
    if (validData.length < 2) return { triggered: false, alertType: 'TEMPERATURE_FLUCTUATION', durationSec: 0 };

    const temps = validData.map((d) => d.temperature!);
    const max = Math.max(...temps);
    const min = Math.min(...temps);
    const fluctuation = max - min;

    if (fluctuation < (rule.tolerance || 0)) {
      return { triggered: false, alertType: 'TEMPERATURE_FLUCTUATION', durationSec: 0 };
    }

    const duration = this.calculateContinuousDuration(validData, ctx, 'TEMPERATURE_FLUCTUATION');
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'TEMPERATURE_FLUCTUATION',
      currentValue: fluctuation,
      threshold: `波动 > ${rule.tolerance}℃`,
      durationSec: duration,
    };
  }

  private checkDoorOpen(rule: AlertRule, ctx: ContainerContext, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.doorOpen !== undefined && d.doorOpen !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'DOOR_OPEN', durationSec: 0 };

    const openData = validData.filter((d) => d.doorOpen === true);
    if (openData.length === 0) {
      return { triggered: false, alertType: 'DOOR_OPEN', durationSec: 0 };
    }

    const duration = this.calculateContinuousDuration(openData, ctx, 'DOOR_OPEN');
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'DOOR_OPEN',
      currentValue: 1,
      threshold: `开门时长 > ${rule.allowedDuration}秒`,
      durationSec: duration,
    };
  }

  private checkPowerFailure(rule: AlertRule, ctx: ContainerContext, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.powerStatus !== undefined && d.powerStatus !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'POWER_FAILURE', durationSec: 0 };

    const failureData = validData.filter((d) => d.powerStatus === false);
    if (failureData.length === 0) {
      return { triggered: false, alertType: 'POWER_FAILURE', durationSec: 0 };
    }

    const duration = this.calculateContinuousDuration(failureData, ctx, 'POWER_FAILURE');
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'POWER_FAILURE',
      currentValue: 0,
      threshold: '电源断开',
      durationSec: duration,
    };
  }

  private checkPositionDeviation(rule: AlertRule, ctx: ContainerContext, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter(
      (d) => d.latitude !== undefined && d.latitude !== null && d.longitude !== undefined && d.longitude !== null,
    );
    if (validData.length === 0) return { triggered: false, alertType: 'POSITION_DEVIATION', durationSec: 0 };

    const maxDistance = rule.maxDeviationDistance || 5;
    const deviationType = rule.deviationType || 'MAX_DISTANCE';

    const deviatedData = validData.filter((d) => {
      return this.isPositionDeviated(d.latitude!, d.longitude!, ctx.container, maxDistance, deviationType);
    });

    if (deviatedData.length === 0) {
      return { triggered: false, alertType: 'POSITION_DEVIATION', durationSec: 0 };
    }

    const distance = this.calculateDistanceToRoute(
      validData[0].latitude!,
      validData[0].longitude!,
      ctx.container,
    );

    const duration = this.calculateContinuousDuration(deviatedData, ctx, 'POSITION_DEVIATION');
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'POSITION_DEVIATION',
      currentValue: Math.round(distance * 10) / 10,
      threshold: `偏离路线 > ${maxDistance}km (${deviationType === 'ROUTE_CORRIDOR' ? '路线走廊' : '最大距离'}判断)`,
      durationSec: duration,
    };
  }

  private checkHumidityHigh(rule: AlertRule, ctx: ContainerContext, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.humidity !== undefined && d.humidity !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'HUMIDITY_HIGH', durationSec: 0 };

    const threshold = rule.maxValue!;
    const violatingData = validData.filter((d) => d.humidity! > threshold);

    if (violatingData.length === 0) {
      return { triggered: false, alertType: 'HUMIDITY_HIGH', durationSec: 0 };
    }

    const duration = this.calculateContinuousDuration(violatingData, ctx, 'HUMIDITY_HIGH');
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'HUMIDITY_HIGH',
      currentValue: validData[0].humidity ?? undefined,
      threshold: `> ${threshold}%`,
      durationSec: duration,
    };
  }

  private checkHumidityLow(rule: AlertRule, ctx: ContainerContext, data: DeviceData[]): RuleCheckResult {
    const validData = data.filter((d) => d.humidity !== undefined && d.humidity !== null);
    if (validData.length === 0) return { triggered: false, alertType: 'HUMIDITY_LOW', durationSec: 0 };

    const threshold = rule.minValue!;
    const violatingData = validData.filter((d) => d.humidity! < threshold);

    if (violatingData.length === 0) {
      return { triggered: false, alertType: 'HUMIDITY_LOW', durationSec: 0 };
    }

    const duration = this.calculateContinuousDuration(violatingData, ctx, 'HUMIDITY_LOW');
    const triggered = duration >= (rule.allowedDuration || 0);

    return {
      triggered,
      alertType: 'HUMIDITY_LOW',
      currentValue: validData[0].humidity ?? undefined,
      threshold: `< ${threshold}%`,
      durationSec: duration,
    };
  }

  private isPositionDeviated(
    lat: number,
    lng: number,
    container: Container,
    maxDistance: number,
    deviationType: string,
  ): boolean {
    const distance = this.calculateDistanceToRoute(lat, lng, container);
    return distance > maxDistance;
  }

  private calculateDistanceToRoute(lat: number, lng: number, container: Container): number {
    const waypoints = this.parseWaypoints(container);
    if (waypoints.length === 0) {
      return this.calculateHaversineDistance(
        lat, lng,
        this.getOriginCoords(container),
      );
    }

    let minDistance = Infinity;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const dist = this.distanceToSegment(lat, lng, waypoints[i], waypoints[i + 1]);
      minDistance = Math.min(minDistance, dist);
    }

    if (waypoints.length === 1) {
      const dist = this.calculateHaversineDistance(lat, lng, waypoints[0]);
      minDistance = Math.min(minDistance, dist);
    }

    return minDistance;
  }

  private parseWaypoints(container: Container): Waypoint[] {
    if (!container.routeWaypoints) return [];

    try {
      const parsed = JSON.parse(container.routeWaypoints);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private getOriginCoords(container: Container): Waypoint {
    const cityCoords: Record<string, Waypoint> = {
      '上海': { lat: 31.2304, lng: 121.4737 },
      '北京': { lat: 39.9042, lng: 116.4074 },
      '广州': { lat: 23.1291, lng: 113.2644 },
      '深圳': { lat: 22.5431, lng: 114.0579 },
      '成都': { lat: 30.5728, lng: 104.0668 },
      '重庆': { lat: 29.4316, lng: 106.9123 },
    };

    return cityCoords[container.origin] || { lat: 0, lng: 0 };
  }

  private distanceToSegment(lat: number, lng: number, a: Waypoint, b: Waypoint): number {
    const d1 = this.calculateHaversineDistance(lat, lng, a);
    const d2 = this.calculateHaversineDistance(lat, lng, b);
    const d3 = this.calculateHaversineDistance(a.lat, a.lng, b);

    if (d3 === 0) return d1;

    const t = Math.max(0, Math.min(1,
      ((lat - a.lat) * (b.lat - a.lat) + (lng - a.lng) * (b.lng - a.lng)) /
      ((b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2),
    ));

    const projLat = a.lat + t * (b.lat - a.lat);
    const projLng = a.lng + t * (b.lng - a.lng);

    return this.calculateHaversineDistance(lat, lng, { lat: projLat, lng: projLng });
  }

  private calculateHaversineDistance(lat1: number, lng1: number, p2: Waypoint): number {
    const R = 6371;
    const dLat = this.toRad(p2.lat - lat1);
    const dLng = this.toRad(p2.lng - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(p2.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private calculateContinuousDuration(
    violatingData: DeviceData[],
    ctx: ContainerContext,
    alertType: AlertType,
  ): number {
    if (violatingData.length === 0) return 0;

    const existingAlert = ctx.activeAlerts.find((a) => a.alertType === alertType);
    const abnormalSince = existingAlert?.abnormalSince;

    if (abnormalSince) {
      return dayjs().diff(dayjs(abnormalSince), 'second');
    }

    const now = dayjs();
    const oldest = dayjs(violatingData[violatingData.length - 1].timestamp);
    return now.diff(oldest, 'second');
  }

  private findContinuousViolation(violatingData: DeviceData[], ctx: ContainerContext, alertType: AlertType): DeviceData[] {
    return violatingData;
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
      const updateData: any = {
        durationSec: checkResult.durationSec,
        currentValue: checkResult.currentValue ?? null,
        threshold: checkResult.threshold ?? null,
        updatedAt: new Date(),
      };

      if (!existingAlert.abnormalSince) {
        updateData.abnormalSince = existingAlert.startTime;
      }

      return this.prisma.alert.update({
        where: { id: existingAlert.id },
        data: updateData,
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
        abnormalSince: new Date(),
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
        `Alert condition recovered for container ${ctx.container.containerNo}: ${rule.alertType}, resetting abnormalSince`,
      );

      await this.prisma.alert.update({
        where: { id: activeAlert.id },
        data: {
          status: 'RESOLVED' as AlertStatus,
          endTime: new Date(),
          abnormalSince: null,
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
      POSITION_DEVIATION: '建议确认行驶路线，联系调度核实是否需要调整',
      HUMIDITY_HIGH: '建议检查通风系统，适当降低湿度',
      HUMIDITY_LOW: '建议检查加湿器运行状态，适当提高湿度',
    };
    return suggestions[alertType] || '请尽快检查设备状态';
  }
}
