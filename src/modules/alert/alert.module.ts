import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { PrismaService } from '../../common/prisma.service';
import { NotificationOrchestratorService } from '../notification/notification-orchestrator.service';
import { NotificationContentService } from '../notification/notification-content.service';
import { NotificationSenderService } from '../notification/notification-sender.service';

@Module({
  controllers: [AlertController],
  providers: [
    AlertService,
    PrismaService,
    NotificationOrchestratorService,
    NotificationContentService,
    NotificationSenderService,
  ],
  exports: [AlertService],
})
export class AlertModule {}
