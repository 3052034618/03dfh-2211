const http = require('http');
function req(path, method, body) {
  return new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : '';
    const opt = { hostname: 'localhost', port: 3000, path: '/api' + path, method, headers: { 'Content-Type': 'application/json' } };
    const r = http.request(opt, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(b); } }); });
    r.on('error', reject);
    if (d) r.write(d); r.end();
  });
}
(async()=>{
  const rulesData = await req('/alert-rules?page=1&pageSize=1', 'GET');
  const rules = rulesData.list || rulesData;
  const ruleId = rules[0].id;
  console.log('规则ID:', ruleId);
  
  const updated = await req('/alert-rules/' + ruleId, 'PATCH', {
    escalationInterval: 250,
    changeReason: '测试版本',
    createdBy: 'tester',
  });
  console.log('更新响应:', JSON.stringify(updated, null, 2));
})();
