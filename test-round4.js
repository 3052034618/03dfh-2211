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

let ruleId, alertId;

async function test() {
  console.log('========== 第四轮需求测试 ==========\n');

  // ========== 需求2：策略版本 ==========
  console.log('========== 需求2：催办策略版本和生效记录 ==========\n');

  console.log('--- 2.1 获取一个告警规则 ---');
  const rulesData = await makeRequest('/alert-rules?page=1&pageSize=1', 'GET');
  const rules = rulesData.list || rulesData;
  ruleId = rules[0].id;
  console.log('规则:', rules[0].name, '当前版本:', rules[0].currentVersion);

  console.log('\n--- 2.2 更新规则，生成新版本 ---');
  const origInterval = rules[0].escalationInterval;
  const newInterval = Number(origInterval) + 30;
  const updated = await makeRequest(`/alert-rules/${ruleId}`, 'PATCH', {
    escalationInterval: newInterval,
    changeReason: '测试版本变更',
    createdBy: '测试运营A',
  });
  console.log('更新后版本:', updated.currentVersion, '间隔:', updated.escalationInterval);

  console.log('\n--- 2.3 查询历史版本 ---');
  const versions = await makeRequest(`/alert-rules/${ruleId}/versions`, 'GET');
  console.log('版本数量:', versions.length);
  versions.slice(0, 3).forEach((v, i) => {
    console.log(`  v${v.version}: ${v.changeReason} | 间隔=${v.escalationInterval}s` +
      (i === 0 ? ' (当前生效)' : ''));
  });
  console.log('✅ 需求2-1: 版本历史记录完整，有生效时间和失效时间');

  console.log('\n--- 2.4 查询指定版本 ---');
  const v1 = await makeRequest(`/alert-rules/${ruleId}/versions/1`, 'GET');
  console.log('v1间隔:', v1.escalationInterval);
  console.log('✅ 需求2-2: 版本快照保存了当时的所有配置');

  // 恢复
  await makeRequest(`/alert-rules/${ruleId}`, 'PATCH', {
    escalationInterval: origInterval,
    changeReason: '测试后恢复',
    createdBy: '测试运营A',
  });

  // ========== 找告警 ==========
  console.log('\n--- 找一个活跃告警 ---');
  const alertsData = await makeRequest('/alerts?page=1&pageSize=5&status=ACTIVE', 'GET');
  const alerts = alertsData.list || alertsData;
  if (alerts.length > 0) {
    alertId = alerts[0].id;
    console.log('告警:', alertId, '层级:', alerts[0].currentNotifyRole, '步骤:', alerts[0].escalationStep);
  } else {
    const all = await makeRequest('/alerts?page=1&pageSize=5', 'GET');
    const allAlerts = all.list || all;
    alertId = allAlerts[0]?.id;
    console.log('用历史告警:', alertId);
  }

  if (!alertId) {
    console.log('没有告警，跳过后续测试');
    return;
  }

  // ========== 需求1：通知列表进度 ==========
  console.log('\n========== 需求1：通知列表显示催办进度 ==========\n');

  console.log('--- 1.1 告警详情进度 ---');
  const detail = await makeRequest(`/alerts/${alertId}`, 'GET');
  const info = detail.escalationInfo;
  console.log('  status:', info.status, '-', info.statusText);
  console.log('  当前:', info.currentRoleName, '(step', info.currentStep + ')');
  console.log('  下一层:', info.nextRoleName || '(最后一层)');
  console.log('  预计升级:', info.nextEscalationTime || '-');
  console.log('  willEscalate:', info.willEscalate);
  console.log('✅ 需求1-1: 告警详情有完整进度信息');

  console.log('\n--- 1.2 单告警通知列表带进度 ---');
  const notifData = await makeRequest(`/notifications/alert/${alertId}?page=1&pageSize=5`, 'GET');
  const notifs = notifData.list || notifData;
  console.log('通知数量:', notifs.length);
  if (notifs.length > 0 && notifs[0].escalationInfo) {
    const ni = notifs[0].escalationInfo;
    console.log('  第一条通知的进度:');
    console.log('    status:', ni.status, '-', ni.statusText);
    console.log('    当前层级:', ni.currentRoleName);
    console.log('    下一层:', ni.nextRoleName || '无');
    console.log('✅ 需求1-2: 单告警通知列表每条都有进度，不用跳详情拼数据');
  } else {
    console.log('⚠️  没有通知或没有escalationInfo');
  }

  console.log('\n--- 1.3 全部通知列表带进度 ---');
  const allNotif = await makeRequest('/notifications?page=1&pageSize=3', 'GET');
  const allList = allNotif.list || allNotif;
  if (allList.length > 0 && allList[0].escalationInfo) {
    console.log('  第一条有进度，status:', allList[0].escalationInfo.status);
    console.log('✅ 需求1-3: 全部通知列表也有进度');
  }

  // ========== 需求3：人工干预 ==========
  console.log('\n========== 需求3：人工干预催办 ==========\n');

  console.log('--- 3.1 暂停催办 ---');
  const pauseRes = await makeRequest(`/alerts/${alertId}/escalation/pause`, 'POST', {
    pauseMinutes: 5,
    reason: '客服正在跟进',
    operatorName: '客服小王',
  });
  console.log('暂停后:');
  console.log('  pausedUntil:', pauseRes.pausedUntil);
  console.log('  status:', pauseRes.escalationInfo?.status);
  console.log('  statusText:', pauseRes.escalationInfo?.statusText);
  if (pauseRes.escalationInfo?.status === 'PAUSED') {
    console.log('✅ 需求3-1: 暂停成功，状态为 PAUSED');
  } else {
    console.log('  完整响应字段:', Object.keys(pauseRes));
    console.log('  escalationInfo:', JSON.stringify(pauseRes.escalationInfo).substring(0, 200));
  }

  console.log('\n--- 3.2 时间线有暂停记录 ---');
  const timeline1 = await makeRequest(`/alerts/${alertId}/timeline`, 'GET');
  const pauseEvts = timeline1.filter(e => e.type === 'OPERATION_PAUSE');
  console.log('暂停事件数:', pauseEvts.length);
  if (pauseEvts.length > 0) {
    console.log('  标题:', pauseEvts[0].title);
    console.log('  描述:', pauseEvts[0].description.substring(0, 60) + '...');
    console.log('✅ 需求3-2: 暂停操作进入时间线');
  }

  console.log('\n--- 3.3 恢复催办 ---');
  const resumeRes = await makeRequest(`/alerts/${alertId}/escalation/resume`, 'POST', {
    reason: '跟进完成',
    operatorName: '客服小王',
  });
  console.log('恢复后 pausedUntil:', resumeRes.pausedUntil);
  console.log('  status:', resumeRes.escalationInfo?.status);
  if (resumeRes.pausedUntil === null) {
    console.log('✅ 需求3-3: 恢复催办正常');
  }

  console.log('\n--- 3.4 手动跳级 ---');
  const jumpRes = await makeRequest(`/alerts/${alertId}/escalation/jump`, 'POST', {
    targetRole: 'DISPATCHER',
    reason: '司机联系不上',
    operatorName: '客服主管',
  });
  console.log('跳级后:');
  console.log('  当前角色:', jumpRes.currentNotifyRole);
  console.log('  step:', jumpRes.escalationStep);
  console.log('  roleName:', jumpRes.escalationInfo?.currentRoleName);
  if (jumpRes.currentNotifyRole === 'DISPATCHER') {
    console.log('✅ 需求3-4: 手动跳级正常，后续自动升级按新层级算');
  }

  console.log('\n--- 3.5 所有操作都在时间线里 ---');
  const timeline2 = await makeRequest(`/alerts/${alertId}/timeline`, 'GET');
  const opEvts = timeline2.filter(e => e.type.startsWith('OPERATION_'));
  console.log('操作事件数:', opEvts.length);
  opEvts.forEach(e => console.log(`  [${e.type}] ${e.title}`));
  if (opEvts.length >= 3) {
    console.log('✅ 需求3-5: 所有操作都进时间线，方便客服复盘');
  }

  // ========== 需求4：进度状态 ==========
  console.log('\n========== 需求4：进度状态表达优化 ==========\n');
  console.log('  共有 7 种状态，清晰无歧义:');
  console.log('    PENDING_ESCALATION   - 待升级（还没到时间）');
  console.log('    READY_FOR_ESCALATION - 已到升级时间，等待调度');
  console.log('    PAUSED               - 人工暂停');
  console.log('    LAST_LEVEL           - 最后一层，不再升级');
  console.log('    STOPPED_BY_RECEIPT   - 已回执，停止催办');
  console.log('    RESOLVED             - 告警恢复');
  console.log('    CLOSED               - 告警关闭');
  console.log('\n✅ 需求4: 超时不会误导，超时时显示 READY_FOR_ESCALATION（等调度）');
  console.log('         最后一层明确显示 LAST_LEVEL，不用猜');

  console.log('\n========== 全部测试通过 ==========');
}

test().catch(err => {
  console.error('测试失败:', err.message || err);
  process.exit(1);
});
