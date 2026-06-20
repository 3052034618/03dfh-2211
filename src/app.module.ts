import { Module } from '@nestjs/common';
import { AlertRuleModule } from './modules/alert-rule/alert-rule.module';
import { DeviceDataModule } from './modules/device-data/device-data.module';
import { AlertEngineModule } from './modules/alert-engine/alert-engine.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ReceiptModule } from './modules/receipt/receipt.module';
import { AlertModule } from './modules/alert/alert.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { PrismaService } from './common/prisma.service';

@Module({
  imports: [
    AlertRuleModule,
    DeviceDataModule,
    AlertEngineModule,
    NotificationModule,
    ReceiptModule,
    AlertModule,
    EscalationModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
