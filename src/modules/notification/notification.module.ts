import { Module } from '@nestjs/common';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationContentService } from './notification-content.service';
import { NotificationSenderService } from './notification-sender.service';
import { NotificationController } from './notification.controller';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationOrchestratorService,
    NotificationContentService,
    NotificationSenderService,
    PrismaService,
  ],
  exports: [NotificationOrchestratorService, NotificationContentService],
})
export class NotificationModule {}
