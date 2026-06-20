import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  await prisma.contact.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.deviceData.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.container.deleteMany();

  const contacts = await prisma.contact.createMany({
    data: [
      { name: '张师傅', role: 'DRIVER', phone: '13800138001', wechatId: 'zhang_driver' },
      { name: '李调度', role: 'DISPATCHER', phone: '13800138002', wechatId: 'li_dispatch' },
      { name: '王客服', role: 'CUSTOMER_SERVICE', phone: '13800138003', wechatId: 'wang_cs' },
      { name: '赵经理', role: 'MANAGER', phone: '13800138004', wechatId: 'zhao_manager' },
    ],
  });
  console.log(`Created ${contacts.count} contacts`);

  const containers = await Promise.all([
    prisma.container.create({
      data: {
        containerNo: 'REEFER001',
        cargoType: 'VACCINE',
        origin: '上海',
        destination: '北京',
        currentRoute: '京沪高速',
        driverId: '13800138001',
        routeWaypoints: JSON.stringify([
          { lat: 31.2304, lng: 121.4737 },
          { lat: 32.0603, lng: 118.7969 },
          { lat: 34.2632, lng: 117.2258 },
          { lat: 36.6512, lng: 117.1201 },
          { lat: 39.9042, lng: 116.4074 },
        ]),
      },
    }),
    prisma.container.create({
      data: {
        containerNo: 'REEFER002',
        cargoType: 'FROZEN',
        origin: '广州',
        destination: '深圳',
        currentRoute: '广深高速',
        driverId: '13800138001',
        routeWaypoints: JSON.stringify([
          { lat: 23.1291, lng: 113.2644 },
          { lat: 22.8, lng: 113.5 },
          { lat: 22.5431, lng: 114.0579 },
        ]),
      },
    }),
    prisma.container.create({
      data: {
        containerNo: 'REEFER003',
        cargoType: 'FRESH_PRODUCE',
        origin: '成都',
        destination: '重庆',
        currentRoute: '成渝高速',
        driverId: '13800138001',
        routeWaypoints: JSON.stringify([
          { lat: 30.5728, lng: 104.0668 },
          { lat: 30.0, lng: 105.0 },
          { lat: 29.4316, lng: 106.9123 },
        ]),
      },
    }),
  ]);
  console.log(`Created ${containers.length} containers`);

  const rules = await prisma.alertRule.createMany({
    data: [
      {
        name: '疫苗-温度偏高',
        cargoType: 'VACCINE',
        alertType: 'TEMPERATURE_HIGH',
        alertLevel: 'CRITICAL',
        minValue: 2,
        maxValue: 8,
        allowedDuration: 60,
        tolerance: 0.5,
        escalationInterval: 300,
        escalationChannels: JSON.stringify({
          DRIVER: 'SMS',
          DISPATCHER: 'WECHAT_WORK',
          CUSTOMER_SERVICE: 'WECHAT_WORK',
          MANAGER: 'SMS',
        }),
        description: '疫苗箱温度超过8℃，持续超过1分钟即告警，催办间隔5分钟',
      },
      {
        name: '疫苗-温度偏低',
        cargoType: 'VACCINE',
        alertType: 'TEMPERATURE_LOW',
        alertLevel: 'CRITICAL',
        minValue: 2,
        maxValue: 8,
        allowedDuration: 60,
        tolerance: 0.5,
        escalationInterval: 300,
        escalationChannels: JSON.stringify({
          DRIVER: 'SMS',
          DISPATCHER: 'WECHAT_WORK',
          CUSTOMER_SERVICE: 'WECHAT_WORK',
          MANAGER: 'SMS',
        }),
        description: '疫苗箱温度低于2℃，持续超过1分钟即告警，催办间隔5分钟',
      },
      {
        name: '疫苗-开门限制',
        cargoType: 'VACCINE',
        alertType: 'DOOR_OPEN',
        alertLevel: 'CRITICAL',
        allowedDuration: 120,
        escalationInterval: 300,
        escalationChannels: JSON.stringify({
          DRIVER: 'SMS',
          DISPATCHER: 'WECHAT_WORK',
          CUSTOMER_SERVICE: 'WECHAT_WORK',
          MANAGER: 'SMS',
        }),
        description: '疫苗箱开门超过2分钟即告警，催办间隔5分钟',
      },
      {
        name: '疫苗-路线偏离',
        cargoType: 'VACCINE',
        alertType: 'POSITION_DEVIATION',
        alertLevel: 'CRITICAL',
        allowedDuration: 300,
        deviationType: 'ROUTE_CORRIDOR',
        maxDeviationDistance: 10,
        escalationInterval: 600,
        escalationChannels: JSON.stringify({
          DRIVER: 'SYSTEM_MESSAGE',
          DISPATCHER: 'WECHAT_WORK',
          CUSTOMER_SERVICE: 'SYSTEM_MESSAGE',
          MANAGER: 'WECHAT_WORK',
        }),
        description: '疫苗箱偏离规划路线超过10km，持续5分钟告警，催办间隔10分钟',
      },
      {
        name: '冻品-温度偏高',
        cargoType: 'FROZEN',
        alertType: 'TEMPERATURE_HIGH',
        alertLevel: 'WARNING',
        minValue: -25,
        maxValue: -18,
        allowedDuration: 600,
        tolerance: 2,
        escalationInterval: 1800,
        escalationChannels: JSON.stringify({
          DRIVER: 'SMS',
          DISPATCHER: 'WECHAT_WORK',
          CUSTOMER_SERVICE: 'SYSTEM_MESSAGE',
          MANAGER: 'WECHAT_WORK',
        }),
        description: '冻品温度超过-18℃，持续超过10分钟才告警，催办间隔30分钟',
      },
      {
        name: '冻品-温度波动',
        cargoType: 'FROZEN',
        alertType: 'TEMPERATURE_FLUCTUATION',
        alertLevel: 'WARNING',
        allowedDuration: 300,
        tolerance: 5,
        escalationInterval: 1800,
        description: '冻品温度波动超过5℃，持续超过5分钟告警，催办间隔30分钟',
      },
      {
        name: '冻品-开门允许',
        cargoType: 'FROZEN',
        alertType: 'DOOR_OPEN',
        alertLevel: 'INFO',
        allowedDuration: 600,
        escalationInterval: 3600,
        description: '冻品允许短时开门，超过10分钟才告警，催办间隔60分钟',
      },
      {
        name: '冻品-路线偏离',
        cargoType: 'FROZEN',
        alertType: 'POSITION_DEVIATION',
        alertLevel: 'WARNING',
        allowedDuration: 600,
        deviationType: 'MAX_DISTANCE',
        maxDeviationDistance: 20,
        escalationInterval: 2400,
        description: '冻品箱偏离规划路线超过20km，持续10分钟告警，催办间隔40分钟',
      },
      {
        name: '通用-断电告警',
        cargoType: 'OTHER',
        alertType: 'POWER_FAILURE',
        alertLevel: 'CRITICAL',
        allowedDuration: 30,
        escalationInterval: 600,
        description: '任何货类断电超过30秒即告警，催办间隔10分钟',
      },
      {
        name: '生鲜-湿度告警',
        cargoType: 'FRESH_PRODUCE',
        alertType: 'HUMIDITY_LOW',
        alertLevel: 'WARNING',
        minValue: 85,
        maxValue: 95,
        allowedDuration: 300,
        escalationInterval: 1200,
        description: '生鲜湿度低于85%，持续5分钟告警，催办间隔20分钟',
      },
    ],
  });
  console.log(`Created ${rules.count} alert rules`);

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
