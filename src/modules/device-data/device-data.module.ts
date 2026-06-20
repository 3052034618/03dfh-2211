import { Module } from '@nestjs/common';
import { DeviceDataService } from './device-data.service';
import { DeviceDataController } from './device-data.controller';
import { PrismaService } from '../../common/prisma.service';
import { AlertEngineService } from '../alert-engine/alert-engine.service';

@Module({
  controllers: [DeviceDataController],
  providers: [DeviceDataService, PrismaService, AlertEngineService],
  exports: [DeviceDataService],
})
export class DeviceDataModule {}
