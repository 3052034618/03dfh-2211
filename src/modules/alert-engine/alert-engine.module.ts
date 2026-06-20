import { Module } from '@nestjs/common';
import { AlertEngineService } from './alert-engine.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  providers: [AlertEngineService, PrismaService],
  exports: [AlertEngineService],
})
export class AlertEngineModule {}
