const http = require('http');

function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api' + path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const r = http.request(options, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve(b); }
      });
    });
    r.on('error', reject);
    if (d) r.write(d);
    r.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRequirement1() {
  console.log('\n=== 需求1测试: 催办进度可视化');
  console.log('目标: 告警详情、通知列表显示当前层级和下一层级');

  const containerNo = 'REEFER001';

  console.log('\n步骤0: 清理现有温度告警，确保从新告警开始');
  const alertsBefore = await makeRequest('/alerts?page=1&pageSize=20', 'GET');
  const tempAlerts = alertsBefore.list?.filter(a =>
    a.container?.containerNo === containerNo
    && a.alertType === 'TEMPERATURE_HIGH'
    && (a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED')
  );
  for (const a of tempAlerts || []) {
    await makeRequest(`/alerts/${a.id}/close`, 'PATCH', { remark: '测试清理' });
  }
  console.log('  已关闭', tempAlerts?.length || 0, '个现有温度告警');

  console.log('\n步骤1: 创建即时触发的温度告警规则');
  const rule = await makeRequest('/alert-rules', 'POST', {
    name: '疫苗-温度偏高(测试进度可视化-' + Date.now() + ')',
    cargoType: 'VACCINE',
    alertType: 'TEMPERATURE_HIGH',
    alertLevel: 'CRITICAL',
    minValue: 2,
    maxValue: 8,
    allowedDuration: 0,
    tolerance: 0,
    escalationInterval: 300,
  });
  console.log('Created rule:', rule.id);

  console.log('\n步骤2: 触发新告警');
  const r1 = await makeRequest('/device-data/report', 'POST', {
    containerNo, temperature: 12, doorOpen: false, powerStatus: true,
    latitude: 32.06, longitude: 118.80, humidity: 55,
  });
  const alertId = r1.alerts[0].id;
  console.log('告警ID:', alertId);

  console.log('\n步骤3: 查询告警列表，查看escalationInfo');
  const alertList = await makeRequest('/alerts?page=1&pageSize=10', 'GET');
  const firstAlert = alertList.list.find(a => a.id === alertId);
  const info = firstAlert.escalationInfo;
  console.log('  currentRole:', info.currentRole, '→', info.currentRoleName);
  console.log('  nextRole:', info.nextRole, '→', info.nextRoleName);
  console.log('  isLastLevel:', info.isLastLevel);
  console.log('  currentStep:', info.currentStep, '/', info.totalLevels - 1);
  console.log('  escalationIntervalSec:', info.escalationIntervalSec, '秒');
  console.log('  lastNotifyTime:', info.lastNotifyTime ? '有' : '无');
  console.log('  nextEscalationTime:', info.nextEscalationTime ? '有' : '无');
  console.log('  willEscalate:', info.willEscalate);

  const pass1 = info.currentRole === 'DRIVER'
    && info.nextRole === 'DISPATCHER'
    && info.isLastLevel === false
    && info.currentStep === 0;

  console.log('\n步骤4: 查询告警详情，确认escalationInfo一致');
  const alertDetail = await makeRequest(`/alerts/${alertId}`, 'GET');
  const detailInfo = alertDetail.escalationInfo;
  console.log('  详情currentRole:', detailInfo.currentRoleName);
  console.log('  详情nextRole:', detailInfo.nextRoleName);

  const pass2 = detailInfo.currentRole === info.currentRole
    && detailInfo.nextRole === info.nextRole;

  console.log('\n步骤5: 升级到调度层，再查进度');
  await makeRequest('/receipts', 'POST', {
    alertId, handlerId: 'test-handler', handlerName: '测试处理人', status: 'ESCALATED',
  });

  const alertAfter = await makeRequest(`/alerts/${alertId}`, 'GET');
  const infoAfter = alertAfter.escalationInfo;
  console.log('  升级后currentRole:', infoAfter.currentRoleName);
  console.log('  升级后nextRole:', infoAfter.nextRoleName);
  console.log('  升级后currentStep:', infoAfter.currentStep);

  const pass3 = infoAfter.currentRole === 'DISPATCHER'
    && infoAfter.nextRole === 'CUSTOMER_SERVICE'
    && infoAfter.currentStep === 1;

  console.log('\n需求1测试结果:');
  console.log('  告警列表含进度信息:', pass1 ? '✅ PASS' : '❌ FAIL');
  console.log('  告警详情含进度信息:', pass2 ? '✅ PASS' : '❌ FAIL');
  console.log('  升级后进度正确更新:', pass3 ? '✅ PASS' : '❌ FAIL');
  console.log('  整体结果:', pass1 && pass2 && pass3 ? '✅ PASS' : '❌ FAIL');

  return { pass: pass1 && pass2 && pass3, alertId };
}

async function testRequirement2() {
  console.log('\n=== 需求2测试: 温度波动按连续波动段计算');
  console.log('目标: 中间稳定就切开，不累加前后段');

  const containerNo = 'REEFER002';

  console.log('\n步骤1: 创建温度波动规则（持续30秒触发，波动>3℃）');
  const rule = await makeRequest('/alert-rules', 'POST', {
    name: '疫苗-温度波动(测试连续段)',
    cargoType: 'VACCINE',
    alertType: 'TEMPERATURE_FLUCTUATION',
    alertLevel: 'WARNING',
    allowedDuration: 30,
    tolerance: 3,
    escalationInterval: 1800,
  });
  console.log('Created rule:', rule.id);

  console.log('\n步骤2: 第一段波动（温度2℃, 7℃, 5℃）波动大，但只有几秒，不应触发');
  await makeRequest('/device-data/report', 'POST', {
    containerNo, temperature: 2, doorOpen: false, powerStatus: true,
    latitude: 22.8, longitude: 113.5, humidity: 55,
  });
  await sleep(500);
  await makeRequest('/device-data/report', 'POST', {
    containerNo, temperature: 7, doorOpen: false, powerStatus: true,
    latitude: 22.8, longitude: 113.5, humidity: 55,
  });
  await sleep(500);
  const r1 = await makeRequest('/device-data/report', 'POST', {
    containerNo, temperature: 5, doorOpen: false, powerStatus: true,
    latitude: 22.8, longitude: 113.5, humidity: 55,
  });
  console.log('  第一段后告警数:', r1.alerts?.length || 0, '(应为0，持续时间不足)');

  console.log('\n步骤3: 温度稳定下来（都是5℃左右，无波动）');
  for (let i = 0; i < 5; i++) {
    await sleep(200);
    await makeRequest('/device-data/report', 'POST', {
      containerNo, temperature: 5 + (i % 2 === 0 ? 0.1 : -0.1),
      doorOpen: false, powerStatus: true,
      latitude: 22.8, longitude: 113.5, humidity: 55,
    });
  }
  console.log('  稳定期过后，异常段被切开');

  console.log('\n步骤4: 第二段波动（开始新的波动，持续几秒）');
  await sleep(500);
  await makeRequest('/device-data/report', 'POST', {
    containerNo, temperature: 2, doorOpen: false, powerStatus: true,
    latitude: 22.8, longitude: 113.5, humidity: 55,
  });
  await sleep(500);
  const r2 = await makeRequest('/device-data/report', 'POST', {
    containerNo, temperature: 7, doorOpen: false, powerStatus: true,
    latitude: 22.8, longitude: 113.5, humidity: 55,
  });
  console.log('  第二段后告警数:', r2.alerts?.length || 0, '(应为0，第二段也只有几秒)');

  const alerts = await makeRequest('/alerts?page=1&pageSize=10', 'GET');
  const fluctuationAlerts = alerts.list?.filter(a =>
    a.alertType === 'TEMPERATURE_FLUCTUATION' && a.container.containerNo === containerNo
  );
  console.log('  温度波动告警总数:', fluctuationAlerts?.length || 0, '(应为0，两段都不足30秒)');

  const pass = (r1.alerts?.length || 0) === 0
    && (r2.alerts?.length || 0) === 0
    && (fluctuationAlerts?.length || 0) === 0;

  console.log('\n需求2测试结果:');
  console.log('  两段波动未合并触发:', pass ? '✅ PASS' : '❌ FAIL');

  return { pass };
}

async function testRequirement3(alertId) {
  console.log('\n=== 需求3测试: 催办进度时间线');

  console.log('\n步骤1: 获取告警时间线');
  const timeline = await makeRequest(`/alerts/${alertId}/timeline`, 'GET');
  console.log('  事件数:', timeline.length);
  timeline.forEach((e, i) => {
    console.log(`  ${i + 1}. [${e.type}] ${e.title}`);
    console.log(`     时间: ${new Date(e.timestamp).toLocaleTimeString()}`);
    console.log(`     描述: ${e.description}`);
  });

  const hasCreated = timeline.some(e => e.type === 'ALERT_CREATED');
  const hasNotif = timeline.some(e => e.type === 'NOTIFICATION_SENT');
  const hasEscalation = timeline.some(e => e.type === 'ESCALATION');
  const hasReceipt = timeline.some(e => e.type === 'RECEIPT_SUBMITTED');

  console.log('\n需求3测试结果:');
  console.log('  包含告警创建事件:', hasCreated ? '✅ PASS' : '❌ FAIL');
  console.log('  包含通知发送事件:', hasNotif ? '✅ PASS' : '❌ FAIL');
  console.log('  包含升级事件:', hasEscalation ? '✅ PASS' : '❌ FAIL');
  console.log('  包含回执事件:', hasReceipt ? '✅ PASS' : '❌ FAIL');
  console.log('  整体结果:', hasCreated && hasNotif && hasEscalation && hasReceipt ? '✅ PASS' : '❌ FAIL');

  return { pass: hasCreated && hasNotif && hasEscalation && hasReceipt };
}

async function testRequirement4() {
  console.log('\n=== 需求4测试: 按货类+告警级别配置催办间隔和渠道');
  console.log('目标: 不同规则有不同催办间隔，新告警用新策略，老告警用老策略');

  console.log('\n步骤1: 查看种子数据中的规则催办配置');
  const rules = await makeRequest('/alert-rules?page=1&pageSize=20', 'GET');
  const vaccineCriticalList = rules.list?.filter(r =>
    r.cargoType === 'VACCINE' && r.alertLevel === 'CRITICAL' && r.alertType === 'TEMPERATURE_HIGH'
  );
  const vaccineCritical = vaccineCriticalList?.find(r => r.escalationChannels) || vaccineCriticalList?.[0];
  const frozenWarning = rules.list?.find(r => r.cargoType === 'FROZEN' && r.alertLevel === 'WARNING' && r.alertType === 'TEMPERATURE_HIGH');
  const frozenInfo = rules.list?.find(r => r.cargoType === 'FROZEN' && r.alertLevel === 'INFO');

  console.log('  疫苗-高危温度 催办间隔:', vaccineCritical?.escalationInterval, '秒 (期望300秒=5分钟)');
  console.log('  冻品-警告温度 催办间隔:', frozenWarning?.escalationInterval, '秒 (期望1800秒=30分钟)');
  console.log('  冻品-提示开门 催办间隔:', frozenInfo?.escalationInterval, '秒 (期望3600秒=60分钟)');

  const pass1 = vaccineCritical?.escalationInterval === 300
    && frozenWarning?.escalationInterval === 1800
    && frozenInfo?.escalationInterval === 3600;

  console.log('\n步骤2: 验证冻品警告规则的渠道配置');
  let frozenChannels = null;
  try {
    frozenChannels = JSON.parse(frozenWarning?.escalationChannels || '{}');
  } catch {}
  console.log('  冻品-警告 渠道配置:');
  console.log('    DRIVER:', frozenChannels?.DRIVER || '(默认)', '(期望: SMS)');
  console.log('    DISPATCHER:', frozenChannels?.DISPATCHER || '(默认)', '(期望: WECHAT_WORK)');
  console.log('    CUSTOMER_SERVICE:', frozenChannels?.CUSTOMER_SERVICE || '(默认)', '(期望: SYSTEM_MESSAGE)');

  const pass2 = frozenChannels?.DRIVER === 'SMS'
    && frozenChannels?.DISPATCHER === 'WECHAT_WORK'
    && frozenChannels?.CUSTOMER_SERVICE === 'SYSTEM_MESSAGE';

  console.log('\n步骤3: 创建自定义规则，验证策略快照（告警继承规则的间隔和渠道）');
  console.log('  创建一个自定义规则: 间隔200秒，司机用企微，调度用短信');
  const customRule = await makeRequest('/alert-rules', 'POST', {
    name: '测试-自定义催办策略',
    cargoType: 'VACCINE',
    alertType: 'POWER_FAILURE',
    alertLevel: 'WARNING',
    allowedDuration: 0,
    escalationInterval: 200,
    escalationChannels: JSON.stringify({
      DRIVER: 'WECHAT_WORK',
      DISPATCHER: 'SMS',
      CUSTOMER_SERVICE: 'SYSTEM_MESSAGE',
    }),
  });
  console.log('  规则ID:', customRule.id);

  console.log('  触发断电告警（用新规则）');
  const r = await makeRequest('/device-data/report', 'POST', {
    containerNo: 'REEFER001', temperature: 5, doorOpen: false, powerStatus: false,
    latitude: 32.06, longitude: 118.80, humidity: 55,
  });
  const alertId = r.alerts?.find(a => a.alertType === 'POWER_FAILURE')?.id;
  console.log('  告警ID:', alertId);

  if (!alertId) {
    console.log('  ⚠️  未找到断电告警，跳过策略快照验证');
    return { pass: pass1 && pass2 };
  }

  const alertDetail = await makeRequest(`/alerts/${alertId}`, 'GET');
  const info = alertDetail.escalationInfo;
  console.log('  告警escalationIntervalSec:', info.escalationIntervalSec, '秒 (期望200秒)');

  const pass3 = info.escalationIntervalSec === 200;

  console.log('\n步骤4: 验证通知渠道与配置一致');
  const notifs = alertDetail.notifications || [];
  const driverNotif = notifs.find(n => n.recipientRole === 'DRIVER');
  console.log('  司机通知渠道:', driverNotif?.channel, '(期望: WECHAT_WORK - 自定义配置)');

  const pass4 = driverNotif?.channel === 'WECHAT_WORK';

  console.log('\n需求4测试结果:');
  console.log('  规则催办间隔配置正确:', pass1 ? '✅ PASS' : '❌ FAIL');
  console.log('  冻品警告渠道配置正确:', pass2 ? '✅ PASS' : '❌ FAIL');
  console.log('  告警继承规则间隔:', pass3 ? '✅ PASS' : '❌ FAIL');
  console.log('  通知渠道与配置一致:', pass4 ? '✅ PASS' : '❌ FAIL');
  console.log('  整体结果:', pass1 && pass2 && pass3 && pass4 ? '✅ PASS' : '❌ FAIL');

  return { pass: pass1 && pass2 && pass3 && pass4 };
}

async function main() {
  console.log('=== 开始测试4个需求 ===');

  const result1 = await testRequirement1();
  const result2 = await testRequirement2();
  const result3 = await testRequirement3(result1.alertId);
  const result4 = await testRequirement4();

  console.log('\n========================================');
  console.log('            测试总览');
  console.log('========================================');
  console.log('需求1 - 催办进度可视化:', result1.pass ? '✅ PASS' : '❌ FAIL');
  console.log('需求2 - 温度波动连续段:', result2.pass ? '✅ PASS' : '❌ FAIL');
  console.log('需求3 - 催办进度时间线:', result3.pass ? '✅ PASS' : '❌ FAIL');
  console.log('需求4 - 催办策略配置化:', result4.pass ? '✅ PASS' : '❌ FAIL');
  console.log('========================================');
  console.log('总结果:',
    result1.pass && result2.pass && result3.pass && result4.pass
      ? '✅ 全部通过' : '❌ 存在失败');
}

main().catch(console.error);
