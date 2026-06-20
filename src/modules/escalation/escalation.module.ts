import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EscalationScheduler } from './escalation.scheduler';
import { NotificationOrchestratorService } from '../notification/notification-orchestrator.service';
import { NotificationContentService } from '../notification/notification-content.service';
import { NotificationSenderService } from '../notification/notification-sender.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    EscalationScheduler,
    NotificationOrchestratorService,
    NotificationContentService,
    NotificationSenderService,
    PrismaService,
  ],
})
export class EscalationModule {}
