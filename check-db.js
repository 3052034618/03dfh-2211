const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const alerts = await p.alert.findMany({
    where: { container: { containerNo: 'REEFER001' } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      container: { select: { containerNo: true, cargoType: true } },
      notifications: { orderBy: { createdAt: 'asc' } }
    }
  });
  alerts.forEach((a, i) => {
    console.log('--- 告警', i + 1, '---');
    console.log('ID:', a.id);
    console.log('类型:', a.alertType, '级别:', a.alertLevel);
    console.log('容器:', a.container?.containerNo, '货类:', a.container?.cargoType);
    console.log('escalationInterval:', a.escalationInterval);
    console.log('escalationChannels:', a.escalationChannels);
    console.log('escalationStep:', a.escalationStep, 'currentRole:', a.currentNotifyRole);
    console.log('通知数:', a.notifications?.length);
    a.notifications?.forEach((n, j) => {
      console.log('  通知', j + 1, ':', n.recipientRole, '-', n.channel, '-', n.recipientName);
    });
  });
  await p.$disconnect();
})();
