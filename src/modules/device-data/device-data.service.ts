import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlertEngineService } from '../alert-engine/alert-engine.service';
import { ReportDeviceDataDto } from './dto/device-data.dto';
import { PaginationDto, buildPaginatedResponse, PaginatedResponse } from '../../common/dto/pagination.dto';
import { DeviceData, Alert } from '@prisma/client';

@Injectable()
export class DeviceDataService {
  constructor(
    private prisma: PrismaService,
    private alertEngine: AlertEngineService,
  ) {}

  async report(dto: ReportDeviceDataDto): Promise<{ data: DeviceData; alerts: Alert[] }> {
    const container = await this.prisma.container.findUnique({
      where: { containerNo: dto.containerNo },
    });

    if (!container) {
      throw new NotFoundException(`集装箱 ${dto.containerNo} 不存在`);
    }

    const deviceData = await this.prisma.deviceData.create({
      data: {
        containerId: container.id,
        temperature: dto.temperature,
        humidity: dto.humidity,
        doorOpen: dto.doorOpen,
        powerStatus: dto.powerStatus,
        latitude: dto.latitude,
        longitude: dto.longitude,
        speed: dto.speed,
        rawPayload: dto.rawPayload ? JSON.stringify(dto.rawPayload) : null,
      },
    });

    const alerts = await this.alertEngine.processDeviceData(dto.containerNo, deviceData);

    return { data: deviceData, alerts };
  }

  async findByContainer(
    containerNo: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<DeviceData>> {
    const container = await this.prisma.container.findUnique({
      where: { containerNo },
    });

    if (!container) {
      throw new NotFoundException(`集装箱 ${containerNo} 不存在`);
    }

    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [list, total] = await Promise.all([
      this.prisma.deviceData.findMany({
        where: { containerId: container.id },
        skip,
        take: pageSize,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.deviceData.count({ where: { containerId: container.id } }),
    ]);

    return buildPaginatedResponse(list, total, page, pageSize);
  }
}
