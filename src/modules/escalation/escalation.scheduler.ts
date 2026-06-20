import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationOrchestratorService } from '../notification/notification-orchestrator.service';
import { PrismaService } from '../../common/prisma.service';
import { AlertStatus } from '../../common/types/alert.types';

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
        await this.orchestratorService.escalateAlert(alert);
      } catch (error) {
        this.logger.error(
          `Failed to escalate alert ${alert.id}`,
          error,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkResolvedAlerts() {
    this.logger.debug('Checking resolved alerts...');

    const activeAlerts = await this.prisma.alert.findMany({
      where: { status: 'ACTIVE' as AlertStatus },
      include: { container: true },
    });

    this.logger.log(`Checking ${activeAlerts.length} active alerts`);
  }
}
