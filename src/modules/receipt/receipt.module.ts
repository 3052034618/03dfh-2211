import { Module } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { ReceiptController } from './receipt.controller';
import { PrismaService } from '../../common/prisma.service';
import { NotificationOrchestratorService } from '../notification/notification-orchestrator.service';
import { NotificationContentService } from '../notification/notification-content.service';
import { NotificationSenderService } from '../notification/notification-sender.service';

@Module({
  controllers: [ReceiptController],
  providers: [
    ReceiptService,
    PrismaService,
    NotificationOrchestratorService,
    NotificationContentService,
    NotificationSenderService,
  ],
  exports: [ReceiptService],
})
export class ReceiptModule {}
