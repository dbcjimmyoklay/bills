// GitHub Actions 每天執行：讀取雲端資料 → 有待繳就推播到手機
const webpush = require('web-push');
const B = require('./cycle.js');

const { GAS_URL, TOKEN, VAPID_PUBLIC, VAPID_PRIVATE, SITE, TEST } = process.env;

(async () => {
  for (const [k, v] of Object.entries({ GAS_URL, TOKEN, VAPID_PUBLIC, VAPID_PRIVATE })) {
    if (!v) throw new Error(`缺少 GitHub Secret：${k}`);
  }
  webpush.setVapidDetails(SITE || 'https://github.com', VAPID_PUBLIC, VAPID_PRIVATE);

  const r = await fetch(`${GAS_URL}?action=state&withSubs=1&token=${encodeURIComponent(TOKEN)}`);
  const s = await r.json();
  if (!s.ok) throw new Error('Apps Script 回應錯誤：' + s.error);

  const list = B.allPending(s.items, s.paid);
  console.log(`待繳 ${list.length} 筆、手機 ${s.subs.length} 支`);

  let title, body;
  if (list.length) {
    const lines = list.map(({ item, c }) => {
      const n = c.daysLeft;
      const when = n < 0 ? `逾期 ${-n} 天` : n === 0 ? '今天' + (item.billDay === item.dueDay ? '' : '截止') : `剩 ${n} 天`;
      return `${item.name}｜${when}（${B.md(c.dueDn)}）`;
    });
    const urgent = list.some(({ c }) => c.daysLeft <= 3);
    title = urgent ? `⚠️ ${list.length} 筆待繳，有快到期的` : `${list.length} 筆待繳`;
    body = lines.join('\n');
  } else if (TEST === 'true') {
    title = '繳費提醒（測試）';
    body = '推播正常！目前沒有待繳項目。';
  } else {
    console.log('沒有待繳，不發通知');
    return;
  }
  if (TEST === 'true' && list.length) title = '（測試）' + title;

  const payload = JSON.stringify({ title, body, count: list.length, tag: 'daily' });
  let sent = 0;
  for (const sub of s.subs) {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 20 * 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      console.log('推播失敗', e.statusCode, e.body || e.message);
      if (e.statusCode === 404 || e.statusCode === 410) {
        await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'unsubscribe', token: TOKEN, endpoint: sub.endpoint }) });
        console.log('已移除失效的手機訂閱');
      }
    }
  }
  console.log(`已送出 ${sent} 則\n${title}\n${body}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
