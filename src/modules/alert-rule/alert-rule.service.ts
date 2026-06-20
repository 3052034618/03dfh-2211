import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto, QueryAlertRuleDto } from './dto/alert-rule.dto';
import { PaginationDto, buildPaginatedResponse, PaginatedResponse } from '../../common/dto/pagination.dto';
import { AlertRule } from '@prisma/client';
import { CargoType, CARGO_TYPE_VALUES } from '../../common/types/alert.types';

@Injectable()
export class AlertRuleService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAlertRuleDto): Promise<AlertRule> {
    return this.prisma.alertRule.create({
      data: dto,
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

  async update(id: string, dto: UpdateAlertRuleDto): Promise<AlertRule> {
    await this.findOne(id);
    return this.prisma.alertRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.alertRule.delete({ where: { id } });
  }
}
