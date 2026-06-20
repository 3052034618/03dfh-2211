export type AlertType =
  | 'TEMPERATURE_HIGH'
  | 'TEMPERATURE_LOW'
  | 'TEMPERATURE_FLUCTUATION'
  | 'DOOR_OPEN'
  | 'POWER_FAILURE'
  | 'POSITION_DEVIATION'
  | 'HUMIDITY_HIGH'
  | 'HUMIDITY_LOW';

export type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export type RecipientRole = 'DRIVER' | 'DISPATCHER' | 'CUSTOMER_SERVICE' | 'MANAGER';

export type NotificationChannel = 'SMS' | 'WECHAT_WORK' | 'SYSTEM_MESSAGE' | 'EMAIL';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'ACKNOWLEDGED';

export type ReceiptStatus = 'CONFIRMED' | 'FALSE_ALARM' | 'IN_PROGRESS' | 'ESCALATED';

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';

export type CargoType =
  | 'FROZEN'
  | 'REFRIGERATED'
  | 'VACCINE'
  | 'PHARMACEUTICAL'
  | 'FRESH_PRODUCE'
  | 'OTHER';

export interface AlertContext {
  containerNo: string;
  origin: string;
  destination: string;
  currentRoute: string;
  alertType: AlertType;
  alertLevel: AlertLevel;
  durationSec: number;
  currentValue?: number;
  threshold?: string;
  suggestion?: string;
}

export interface NotificationRecipient {
  role: RecipientRole;
  name: string;
  phone: string;
  wechatId?: string;
  email?: string;
}

export const ALERT_TYPE_NAMES: Record<AlertType, string> = {
  TEMPERATURE_HIGH: '温度偏高',
  TEMPERATURE_LOW: '温度偏低',
  TEMPERATURE_FLUCTUATION: '温度波动过大',
  DOOR_OPEN: '箱门异常开启',
  POWER_FAILURE: '电源断开',
  POSITION_DEVIATION: '路线偏离',
  HUMIDITY_HIGH: '湿度过高',
  HUMIDITY_LOW: '湿度过低',
};

export const ALERT_LEVEL_COLORS: Record<AlertLevel, string> = {
  INFO: '#2196F3',
  WARNING: '#FF9800',
  CRITICAL: '#F44336',
};

export const NOTIFICATION_ORDER: RecipientRole[] = [
  'DRIVER',
  'DISPATCHER',
  'CUSTOMER_SERVICE',
  'MANAGER',
];

export const ALERT_TYPE_VALUES: AlertType[] = [
  'TEMPERATURE_HIGH',
  'TEMPERATURE_LOW',
  'TEMPERATURE_FLUCTUATION',
  'DOOR_OPEN',
  'POWER_FAILURE',
  'POSITION_DEVIATION',
  'HUMIDITY_HIGH',
  'HUMIDITY_LOW',
];

export const ALERT_LEVEL_VALUES: AlertLevel[] = ['INFO', 'WARNING', 'CRITICAL'];

export const RECIPIENT_ROLE_VALUES: RecipientRole[] = [
  'DRIVER',
  'DISPATCHER',
  'CUSTOMER_SERVICE',
  'MANAGER',
];

export const RECEIPT_STATUS_VALUES: ReceiptStatus[] = [
  'CONFIRMED',
  'FALSE_ALARM',
  'IN_PROGRESS',
  'ESCALATED',
];

export const ALERT_STATUS_VALUES: AlertStatus[] = [
  'ACTIVE',
  'ACKNOWLEDGED',
  'RESOLVED',
  'CLOSED',
];

export const CARGO_TYPE_VALUES: CargoType[] = [
  'FROZEN',
  'REFRIGERATED',
  'VACCINE',
  'PHARMACEUTICAL',
  'FRESH_PRODUCE',
  'OTHER',
];

export const NOTIFICATION_CHANNEL_VALUES: NotificationChannel[] = [
  'SMS',
  'WECHAT_WORK',
  'SYSTEM_MESSAGE',
  'EMAIL',
];

export const NOTIFICATION_STATUS_VALUES: NotificationStatus[] = [
  'PENDING',
  'SENT',
  'FAILED',
  'ACKNOWLEDGED',
];
