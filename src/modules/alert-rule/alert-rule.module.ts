import { Module } from '@nestjs/common';
import { AlertRuleService } from './alert-rule.service';
import { AlertRuleController } from './alert-rule.controller';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [AlertRuleController],
  providers: [AlertRuleService, PrismaService],
  exports: [AlertRuleService],
})
export class AlertRuleModule {}
