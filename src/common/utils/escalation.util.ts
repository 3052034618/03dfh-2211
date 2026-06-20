import { Alert } from '@prisma/client';
import { NOTIFICATION_ORDER, RecipientRole } from '../types/alert.types';
import * as dayjs from 'dayjs';

export type EscalationStatus =
  | 'PENDING_ESCALATION'
  | 'READY_FOR_ESCALATION'
  | 'PAUSED'
  | 'LAST_LEVEL'
  | 'STOPPED_BY_RECEIPT'
  | 'RESOLVED'
  | 'CLOSED';

export interface EscalationInfo {
  currentRole: string;
  currentRoleName: string;
  currentStep: number;
  nextRole: string | null;
  nextRoleName: string | null;
  isLastLevel: boolean;
  totalLevels: number;
  escalationIntervalSec: number;
  lastNotifyTime: string | null;
  nextEscalationTime: string | null;
  willEscalate: boolean;
  status: EscalationStatus;
  statusText: string;
  pausedUntil?: string | null;
  pausedReason?: string | null;
}

export function getRoleDisplayName(role: RecipientRole | string): string {
  const map: Record<string, string> = {
    DRIVER: '司机',
    DISPATCHER: '调度',
    CUSTOMER_SERVICE: '货主客服',
    MANAGER: '经理',
  };
  return map[role] || role;
}

export function calculateEscalationInfo(
  alert: Alert & { pausedUntil?: Date | null; pausedReason?: string | null },
): EscalationInfo {
  const currentStep = alert.escalationStep;
  const currentRole = alert.currentNotifyRole as RecipientRole;
  const isLastLevel = currentStep >= NOTIFICATION_ORDER.length - 1;
  const nextStep = currentStep + 1;
  const nextRole = isLastLevel ? null : NOTIFICATION_ORDER[nextStep];
  const intervalSec = alert.escalationInterval || 1800;

  let nextEscalationTime: string | null = null;
  let willEscalate = false;
  let status: EscalationStatus;
  let statusText: string;

  if (alert.status === 'CLOSED') {
    status = 'CLOSED';
    statusText = '告警已关闭';
  } else if (alert.status === 'RESOLVED') {
    status = 'RESOLVED';
    statusText = '异常已恢复';
  } else if (
    alert.status === 'ACKNOWLEDGED' ||
    alert.status === 'FALSE_POSITIVE' ||
    alert.status === 'PROCESSING'
  ) {
    status = 'STOPPED_BY_RECEIPT';
    statusText = '已处理，停止催办';
    willEscalate = false;
  } else if (alert.pausedUntil && dayjs(alert.pausedUntil).isAfter(dayjs())) {
    status = 'PAUSED';
    statusText = '催办已暂停';
    willEscalate = false;
    nextEscalationTime = dayjs(alert.pausedUntil).toISOString();
  } else if (isLastLevel) {
    status = 'LAST_LEVEL';
    statusText = '已到最后一层，不会继续升级';
    willEscalate = false;
  } else if (!alert.lastNotifyTime) {
    status = 'PENDING_ESCALATION';
    statusText = '等待首次通知';
    willEscalate = true;
  } else {
    const nextTime = dayjs(alert.lastNotifyTime).add(intervalSec, 'second');
    nextEscalationTime = nextTime.toISOString();
    const now = dayjs();

    if (now.isBefore(nextTime)) {
      status = 'PENDING_ESCALATION';
      statusText = `等待升级到${getRoleDisplayName(nextRole!)}`;
      willEscalate = true;
    } else {
      status = 'READY_FOR_ESCALATION';
      statusText = `已到升级时间，等待调度执行升级到${getRoleDisplayName(nextRole!)}`;
      willEscalate = true;
    }
  }

  return {
    currentRole,
    currentRoleName: getRoleDisplayName(currentRole),
    currentStep,
    nextRole,
    nextRoleName: nextRole ? getRoleDisplayName(nextRole) : null,
    isLastLevel,
    totalLevels: NOTIFICATION_ORDER.length,
    escalationIntervalSec: intervalSec,
    lastNotifyTime: alert.lastNotifyTime ? alert.lastNotifyTime.toISOString() : null,
    nextEscalationTime,
    willEscalate,
    status,
    statusText,
    pausedUntil: alert.pausedUntil ? alert.pausedUntil.toISOString() : null,
    pausedReason: alert.pausedReason || null,
  };
}
