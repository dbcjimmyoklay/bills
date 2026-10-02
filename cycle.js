/* 繳費週期計算 —— 網頁和 GitHub Actions 共用同一份邏輯 */
(function (root) {
  const DAY = 86400000;

  // 台北時間的「今天」
  function today(now) {
    const t = new Date((now ? now.getTime() : Date.now()) + 8 * 3600000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dn = (y, m, d) => Math.round(Date.UTC(y, m - 1, Math.min(d, dim(y, m))) / DAY);
  const addM = (y, m, k) => { const i = y * 12 + (m - 1) + k; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; };
  const key = (y, m) => y + '-' + String(m).padStart(2, '0');
  const parse = (k) => { const [y, m] = k.split('-').map(Number); return { y, m }; };
  const fromDn = (n) => { const t = new Date(n * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };

  // 某個月份的週期：帳單日、截止日
  function cycle(item, y, m) {
    const due = addM(y, m, item.dueNext ? 1 : 0);
    return { key: key(y, m), y, m, billDn: dn(y, m, item.billDay), dueDn: dn(due.y, due.m, item.dueDay) };
  }

  // 有期數的項目（貸款、分期）：第幾期
  function periodIndex(item, k) {
    if (!item.total || !item.start) return null;
    const a = parse(item.start), b = parse(k);
    return (b.y - a.y) * 12 + (b.m - a.m) + 1;
  }
  function inRange(item, k) {
    const p = periodIndex(item, k);
    return p === null || (p >= 1 && p <= item.total);
  }

  // 目前週期 = 帳單日已到的最近一個月
  function current(item, t) {
    t = t || today();
    const tn = dn(t.y, t.m, t.d);
    let c = cycle(item, t.y, t.m);
    if (c.billDn > tn) { const p = addM(t.y, t.m, -1); c = cycle(item, p.y, p.m); }
    return c;
  }

  // 尚未繳清、而且已經出帳的週期（含逾期），最多往回看 6 個月
  function pending(item, paid, t) {
    t = t || today();
    const tn = dn(t.y, t.m, t.d);
    const done = (paid && paid[item.id]) || {};
    const cur = current(item, t);
    const out = [];
    for (let i = 0; i < 6; i++) {
      const ym = addM(cur.y, cur.m, -i);
      const k = key(ym.y, ym.m);
      if (item.since && k < item.since) break;
      if (!inRange(item, k)) continue;
      if (done[k]) continue;
      const c = cycle(item, ym.y, ym.m);
      out.push(Object.assign(c, { daysLeft: c.dueDn - tn, period: periodIndex(item, k) }));
    }
    return out.sort((a, b) => a.dueDn - b.dueDn);
  }

  // 下一次出帳
  function next(item, t) {
    t = t || today();
    const cur = current(item, t);
    for (let i = 1; i < 60; i++) {
      const ym = addM(cur.y, cur.m, i);
      const k = key(ym.y, ym.m);
      if (inRange(item, k)) return cycle(item, ym.y, ym.m);
      if (item.total && periodIndex(item, k) > item.total) return null;
    }
    return null;
  }

  // 新增項目時：從「截止日還沒過」的那一期開始提醒，不追溯以前
  function sinceFor(item, t) {
    t = t || today();
    const tn = dn(t.y, t.m, t.d);
    const cur = current(item, t);
    let c = cycle(item, cur.y, cur.m);
    const prev = addM(cur.y, cur.m, -1);
    const pc = cycle(item, prev.y, prev.m);
    if (pc.dueDn >= tn) c = pc;
    if (c.dueDn < tn) { const n = addM(c.y, c.m, 1); return key(n.y, n.m); }
    return c.key;
  }

  function allPending(items, paid, t) {
    const list = [];
    (items || []).forEach((it) => pending(it, paid, t).forEach((c) => list.push({ item: it, c })));
    return list.sort((a, b) => a.c.dueDn - b.c.dueDn);
  }

  const md = (n) => { const x = fromDn(n); return x.m + '/' + x.d; };

  const api = { today, dn, fromDn, addM, key, parse, cycle, current, pending, next, sinceFor, allPending, periodIndex, md };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bills = api;
})(typeof self !== 'undefined' ? self : this);
