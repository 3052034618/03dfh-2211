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
        description: '疫苗箱温度超过8℃，持续超过1分钟即告警',
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
        description: '疫苗箱温度低于2℃，持续超过1分钟即告警',
      },
      {
        name: '疫苗-开门限制',
        cargoType: 'VACCINE',
        alertType: 'DOOR_OPEN',
        alertLevel: 'CRITICAL',
        allowedDuration: 120,
        description: '疫苗箱开门超过2分钟即告警',
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
        description: '冻品温度超过-18℃，持续超过10分钟才告警',
      },
      {
        name: '冻品-温度波动',
        cargoType: 'FROZEN',
        alertType: 'TEMPERATURE_FLUCTUATION',
        alertLevel: 'WARNING',
        allowedDuration: 300,
        tolerance: 5,
        description: '冻品温度波动超过5℃，持续超过5分钟告警',
      },
      {
        name: '冻品-开门允许',
        cargoType: 'FROZEN',
        alertType: 'DOOR_OPEN',
        alertLevel: 'INFO',
        allowedDuration: 600,
        description: '冻品允许短时开门，超过10分钟才告警',
      },
      {
        name: '通用-断电告警',
        cargoType: 'OTHER',
        alertType: 'POWER_FAILURE',
        alertLevel: 'CRITICAL',
        allowedDuration: 30,
        description: '任何货类断电超过30秒即告警',
      },
      {
        name: '生鲜-湿度告警',
        cargoType: 'FRESH_PRODUCE',
        alertType: 'HUMIDITY_LOW',
        alertLevel: 'WARNING',
        minValue: 85,
        maxValue: 95,
        allowedDuration: 300,
        description: '生鲜湿度低于85%，持续5分钟告警',
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
