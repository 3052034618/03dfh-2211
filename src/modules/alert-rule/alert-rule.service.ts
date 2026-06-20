import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto, QueryAlertRuleDto } from './dto/alert-rule.dto';
import { PaginationDto, buildPaginatedResponse, PaginatedResponse } from '../../common/dto/pagination.dto';
import { AlertRule, AlertRuleVersion } from '@prisma/client';
import { CargoType, CARGO_TYPE_VALUES } from '../../common/types/alert.types';

@Injectable()
export class AlertRuleService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAlertRuleDto & { createdBy?: string; changeReason?: string }): Promise<AlertRule> {
    const { changeReason, createdBy, ...ruleData } = dto;

    return this.prisma.$transaction(async (prisma) => {
      const rule = await prisma.alertRule.create({
        data: {
          ...ruleData,
          currentVersion: 1,
        },
      });

      await prisma.alertRuleVersion.create({
        data: {
          ruleId: rule.id,
          version: 1,
          name: rule.name,
          cargoType: rule.cargoType,
          alertType: rule.alertType,
          alertLevel: rule.alertLevel,
          enabled: rule.enabled,
          minValue: rule.minValue,
          maxValue: rule.maxValue,
          allowedDuration: rule.allowedDuration,
          tolerance: rule.tolerance,
          deviationType: rule.deviationType,
          maxDeviationDistance: rule.maxDeviationDistance,
          escalationInterval: rule.escalationInterval,
          escalationChannels: rule.escalationChannels,
          description: rule.description,
          changeReason: changeReason || '初始版本',
          createdBy: createdBy || null,
        },
      });

      return rule;
    });
  }

  async findAll(
    query: QueryAlertRuleDto,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<AlertRule>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.cargoType) where.cargoType = query.cargoType;
    if (query.alertType) where.alertType = query.alertType;
    if (query.alertLevel) where.alertLevel = query.alertLevel;
    if (query.enabled !== undefined) where.enabled = query.enabled;

    const [list, total] = await Promise.all([
      this.prisma.alertRule.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.alertRule.count({ where }),
    ]);

    return buildPaginatedResponse(list, total, page, pageSize);
  }

  async findOne(id: string): Promise<AlertRule> {
    const rule = await this.prisma.alertRule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundException('告警规则不存在');
    }
    return rule;
  }

  async findByCargoType(cargoType: CargoType): Promise<AlertRule[]> {
    return this.prisma.alertRule.findMany({
      where: {
        cargoType: { in: [cargoType, 'OTHER' as CargoType] },
        enabled: true,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateAlertRuleDto & { changeReason?: string; createdBy?: string },
  ): Promise<AlertRule> {
    const existing = await this.findOne(id);

    const { changeReason, createdBy, ...ruleData } = dto;

    return this.prisma.$transaction(async (prisma) => {
      const nextVersion = existing.currentVersion + 1;

      await prisma.alertRuleVersion.updateMany({
        where: {
          ruleId: id,
          effectiveTo: null,
        },
        data: {
          effectiveTo: new Date(),
        },
      });

      const updated = await prisma.alertRule.update({
        where: { id },
        data: {
          ...ruleData,
          currentVersion: nextVersion,
        },
      });

      await prisma.alertRuleVersion.create({
        data: {
          ruleId: id,
          version: nextVersion,
          name: updated.name,
          cargoType: updated.cargoType,
          alertType: updated.alertType,
          alertLevel: updated.alertLevel,
          enabled: updated.enabled,
          minValue: updated.minValue,
          maxValue: updated.maxValue,
          allowedDuration: updated.allowedDuration,
          tolerance: updated.tolerance,
          deviationType: updated.deviationType,
          maxDeviationDistance: updated.maxDeviationDistance,
          escalationInterval: updated.escalationInterval,
          escalationChannels: updated.escalationChannels,
          description: updated.description,
          changeReason: changeReason || '更新规则',
          createdBy: createdBy || null,
        },
      });

      return updated;
    });
  }

  async getRuleVersions(ruleId: string): Promise<AlertRuleVersion[]> {
    const rule = await this.findOne(ruleId);

    const existing = await this.prisma.alertRuleVersion.findMany({
      where: { ruleId },
      orderBy: { version: 'desc' },
    });

    if (existing.length > 0) {
      return existing;
    }

    return this.prisma.$transaction(async (prisma) => {
      const version = await prisma.alertRuleVersion.create({
        data: {
          ruleId,
          version: rule.currentVersion || 1,
          name: rule.name,
          cargoType: rule.cargoType,
          alertType: rule.alertType,
          alertLevel: rule.alertLevel,
          enabled: rule.enabled,
          minValue: rule.minValue,
          maxValue: rule.maxValue,
          allowedDuration: rule.allowedDuration,
          tolerance: rule.tolerance,
          deviationType: rule.deviationType,
          maxDeviationDistance: rule.maxDeviationDistance,
          escalationInterval: rule.escalationInterval,
          escalationChannels: rule.escalationChannels,
          description: rule.description,
          changeReason: '历史数据初始化',
          effectiveFrom: rule.createdAt,
          createdBy: null,
        },
      });
      return [version];
    });
  }

  async getRuleVersion(ruleId: string, version: number): Promise<AlertRuleVersion> {
    const ruleVersion = await this.prisma.alertRuleVersion.findFirst({
      where: { ruleId, version },
    });
    if (!ruleVersion) {
      throw new NotFoundException('规则版本不存在');
    }
    return ruleVersion;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.alertRule.delete({ where: { id } });
  }
}
