import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationOrchestratorService } from '../notification/notification-orchestrator.service';
import { PrismaService } from '../../common/prisma.service';
import { AlertStatus, NOTIFICATION_ORDER } from '../../common/types/alert.types';

@Injectable()
export class EscalationScheduler {
  private readonly logger = new Logger(EscalationScheduler.name);

  constructor(
    private orchestratorService: NotificationOrchestratorService,
    private prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleEscalation() {
    this.logger.debug('Running escalation check...');

    const pendingAlerts = await this.orchestratorService.findPendingAlertsForEscalation();

    if (pendingAlerts.length === 0) {
      this.logger.debug('No alerts need escalation');
      return;
    }

    this.logger.log(`Found ${pendingAlerts.length} alerts needing escalation`);

    for (const alert of pendingAlerts) {
      try {
        const currentRole = alert.currentNotifyRole;
        const nextStep = alert.escalationStep + 1;
        const nextRole = nextStep < NOTIFICATION_ORDER.length ? NOTIFICATION_ORDER[nextStep] : 'MAX';

        this.logger.log(
          `Escalating alert ${alert.id}: ${currentRole} → ${nextRole} (step ${alert.escalationStep} → ${nextStep})`,
        );

        const results = await this.orchestratorService.escalateAlert(alert);
        this.logger.log(
          `Escalation results for alert ${alert.id}: ${results.length} notifications sent`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to escalate alert ${alert.id}`,
          error,
        );
      }
    }
  }
}
