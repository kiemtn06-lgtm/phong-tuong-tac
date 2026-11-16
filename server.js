'use strict';
// Phòng tương tác trên lớp: học sinh quét QR, chọn tên trong danh sách lớp, giơ tay và trả lời nhanh.
// Máy chủ nhỏ, không cần cài gói nào (Node 18 trở lên).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const TEACHER_PASS = process.env.TEACHER_PASS || 'giaovien';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_AGE = 12 * 3600 * 1000;   // phiên tự xóa sau 12 giờ
const MAX_ROSTER = 80;
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

let S = { sessions: {} };
try { S = Object.assign(S, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch (e) {}
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(S)); } catch (e) {}
  }, 800);
}
function sweep() { const now = Date.now(); for (const c of Object.keys(S.sessions)) if (now - S.sessions[c].created > MAX_AGE) delete S.sessions[c]; }
setInterval(sweep, 600000); sweep();

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-teacher-pass', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
function send(res, code, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': buf.length }, CORS));
  res.end(buf);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 30000) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function isTeacher(req) {
  const a = crypto.createHash('sha256').update(String(req.headers['x-teacher-pass'] || '')).digest();
  const b = crypto.createHash('sha256').update(TEACHER_PASS).digest();
  return crypto.timingSafeEqual(a, b);
}
function newCode() { for (let i = 0; i < 50; i++) { const c = String(crypto.randomInt(1000, 10000)); if (!S.sessions[c]) return c; } return null; }
function num(x) { const n = parseFloat(String(x).trim().replace(',', '.')); return isFinite(n) ? n : NaN; }
// chấm một câu trả lời theo đáp án giáo viên gửi kèm (nếu có). mc, short: true/false. tf: mảng đúng/sai từng ý.
function gradeQ(q, v) {
  if (!q.key || v == null) return null;
  if (q.type === 'mc') return v === q.key;
  if (q.type === 'tf') return Array.isArray(v) ? q.key.map((k, i) => v[i] === k) : null;
  const a = num(v), b = num(q.key.v);
  if (isFinite(a) && isFinite(b)) return Math.abs(a - b) <= (q.key.tol || 0) + 1e-9;
  return String(v).trim().toLowerCase() === String(q.key.v).trim().toLowerCase();
}
function cleanName(s) { return String(s == null ? '' : s).trim().slice(0, 60); }
// điểm quá trình của một em: các buổi trước (Hồ sơ gửi lên khi mở phòng) + câu hỏi nhanh có đáp án đã đóng trong buổi này
function qtOf(s, name) {
  let dg = 0, qk = 0;
  for (const r of s.qlog.concat(s.q && !s.q.open ? [s.q] : [])) {
    if (!r.key) continue; qk++;
    const g = r.answers[name] == null ? null : gradeQ(r, r.answers[name]);
    if (r.type === 'tf' ? Array.isArray(g) && g.every(Boolean) : g === true) dg++;
  }
  return { truoc: (s.qt && s.qt[name]) || null, nay: { dg, qk } };
}

// ---- học sinh nhìn thấy gì ----
function studentView(s, name) {
  const q = s.q;
  return {
    lop: s.lop, bai: s.bai, ended: !!s.ended,
    roster: s.roster,
    present: s.joined,                       // tên đã có mặt (để ẩn khỏi danh sách chọn)
    me: name && s.roster.includes(name) ? { name, joined: !!s.joined[name], hand: s.hands.some(h => h.name === name), called: s.called === name, qt: qtOf(s, name) } : null,
    nJoined: Object.keys(s.joined).length,   // cho vòng tròn: số em đã trả lời / số em có mặt
    q: q ? studentQ(q, name) : null
  };
}
function studentQ(q, name) {
  const mine = name && q.answers[name] != null ? q.answers[name] : null;
  const o = { id: q.id, type: q.type, label: q.label, open: q.open, n: q.n, mine, count: Object.keys(q.answers).length };
  if (!q.open && q.key) { o.key = q.key; o.e = q.e || ''; o.ok = mine == null ? null : gradeQ(q, mine); }
  return o;
}
function teacherView(s) {
  const q = s.q;
  let tally = null;
  let dung = null, ok = null;
  if (q && q.type === 'tf') { tally = Array.from({ length: q.n }, () => ({ d: 0, s: 0 })); for (const v of Object.values(q.answers)) v.forEach((x, i) => { if (x === true) tally[i].d++; else tally[i].s++; }); }
  else if (q) { tally = {}; for (const v of Object.values(q.answers)) tally[v] = (tally[v] || 0) + 1; }
  if (q && q.key) {
    dung = 0; ok = {};
    for (const [n, v] of Object.entries(q.answers)) { const g = gradeQ(q, v); ok[n] = g; if (q.type === 'tf' ? g.every(Boolean) : g) dung++; }
  }
  return {
    lop: s.lop, bai: s.bai, ended: !!s.ended, total: s.roster.length,
    joined: Object.keys(s.joined).map(n => ({ name: n, t: s.joined[n] })),
    hands: s.hands, called: s.called,
    q: q ? { id: q.id, type: q.type, label: q.label, open: q.open, count: Object.keys(q.answers).length, n: q.n, key: q.key, e: q.e, dung, tally, answers: q.type === 'short' ? q.answers : undefined, ok: q.type === 'short' ? ok : undefined } : null
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, INDEX, 'text/html; charset=utf-8');
    if (req.method === 'GET' && p === '/healthz') return send(res, 200, 'ok', 'text/plain');

    // ---- học sinh ----
    if (p.startsWith('/api/s/')) {
      const b = req.method === 'POST' ? await readJson(req) : Object.fromEntries(url.searchParams);
      const s = S.sessions[String(b.code || '')];
      if (!s) return send(res, 404, { error: 'Mã phòng không đúng hoặc phòng đã đóng' });
      const name = cleanName(b.name);
      if (p === '/api/s/state') return send(res, 200, studentView(s, name));
      if (s.ended) return send(res, 409, { error: 'Tiết học đã kết thúc' });
      if (!s.roster.includes(name)) return send(res, 400, { error: 'Chọn tên của em trong danh sách' });
      if (p === '/api/s/join') {
        // mỗi tên gắn với một thiết bị (token): thiết bị khác không vào trùng tên được
        const tok = String(b.tok || '').slice(0, 40);
        if (s.joined[name] && s.tokens[name] && s.tokens[name] !== tok) return send(res, 409, { error: 'Tên này đã có người vào bằng máy khác. Nếu là em, báo thầy cô.' });
        if (!s.joined[name]) { s.joined[name] = Date.now(); s.tokens[name] = tok; }
        save(); return send(res, 200, { ok: true });
      }
      if (!s.joined[name] || s.tokens[name] !== String(b.tok || '').slice(0, 40)) return send(res, 403, { error: 'Chưa vào phòng' });
      if (p === '/api/s/hand') {
        const i = s.hands.findIndex(h => h.name === name);
        if (i >= 0) s.hands.splice(i, 1); else s.hands.push({ name, t: Date.now() });
        save(); return send(res, 200, { ok: true });
      }
      if (p === '/api/s/answer') {
        const q = s.q;
        if (!q || !q.open) return send(res, 409, { error: 'Chưa có câu hỏi đang mở' });
        if (q.answers[name] != null) return send(res, 409, { error: 'Em đã gửi rồi' });
        let v = b.value;
        if (q.type === 'mc') { if (!['A', 'B', 'C', 'D'].includes(v)) return send(res, 400, { error: 'Đáp án không hợp lệ' }); }
        else if (q.type === 'tf') { if (!Array.isArray(v) || v.length !== q.n || !v.every(x => x === true || x === false)) return send(res, 400, { error: 'Chọn Đúng hoặc Sai cho tất cả các ý' }); }
        else { v = String(v == null ? '' : v).trim().slice(0, 80); if (!v) return send(res, 400, { error: 'Nhập câu trả lời' }); }
        q.answers[name] = v; save(); return send(res, 200, { ok: true });
      }
    }

    // ---- giáo viên ----
    if (p.startsWith('/api/t/')) {
      if (!isTeacher(req)) return send(res, 401, { error: 'Sai mật khẩu' });
      if (req.method === 'POST' && p === '/api/t/open') {
        const b = await readJson(req);
        const roster = Array.from(new Set((Array.isArray(b.roster) ? b.roster : []).map(cleanName).filter(Boolean))).slice(0, MAX_ROSTER);
        if (!roster.length) return send(res, 400, { error: 'Lớp chưa có danh sách học sinh' });
        const code = newCode(); if (!code) return send(res, 503, { error: 'Hết mã phòng, thử lại sau' });
        // qt: tóm tắt các buổi trước của từng em do Hồ sơ gửi (b: số buổi, dg/qk: câu đúng / câu có đáp án, pv: tổng điểm phát biểu, pn: số lần phát biểu)
        const qt = {};
        if (b.qt && typeof b.qt === 'object') for (const n of roster) {
          const x = b.qt[n]; if (!x || typeof x !== 'object') continue;
          const I = v => Math.max(0, Math.min(100000, parseInt(v, 10) || 0));
          qt[n] = { b: I(x.b), dg: I(x.dg), qk: I(x.qk), pv: Math.max(0, Math.min(100000, Number(x.pv) || 0)), pn: I(x.pn) };
        }
        S.sessions[code] = { code, lop: cleanName(b.lop), bai: cleanName(b.bai), roster, created: Date.now(), joined: {}, tokens: {}, hands: [], called: '', q: null, qlog: [], ended: false, qt };
        save(); return send(res, 200, { code });
      }
      const s = S.sessions[String(url.searchParams.get('code') || '')];
      if (!s && p !== '/api/t/ping') return send(res, 404, { error: 'Phòng không còn (máy chủ có thể đã khởi động lại)' });
      if (req.method === 'GET' && p === '/api/t/state') return send(res, 200, teacherView(s));
      if (req.method === 'GET' && p === '/api/t/export') {
        return send(res, 200, { lop: s.lop, bai: s.bai, created: s.created, roster: s.roster, joined: s.joined, qlog: s.qlog.concat(s.q ? [{ id: s.q.id, type: s.q.type, label: s.q.label, key: s.q.key, answers: s.q.answers }] : []) });
      }
      if (req.method === 'POST' && p === '/api/t/ctl') {
        const b = await readJson(req), a = b.action;
        if (a === 'call') { const n = cleanName(b.name); if (s.roster.includes(n)) { s.called = n; s.hands = s.hands.filter(h => h.name !== n); } }
        else if (a === 'uncall') s.called = '';
        else if (a === 'dropHand') s.hands = s.hands.filter(h => h.name !== cleanName(b.name));
        else if (a === 'question') {
          if (s.q) s.qlog.push({ id: s.q.id, type: s.q.type, label: s.q.label, key: s.q.key, answers: s.q.answers });
          const type = ['short', 'tf'].includes(b.type) ? b.type : 'mc';
          let key = null, n = 4;
          if (type === 'mc' && ['A', 'B', 'C', 'D'].includes(b.key)) key = b.key;
          else if (type === 'tf' && Array.isArray(b.key) && b.key.length >= 2 && b.key.length <= 6 && b.key.every(x => x === true || x === false)) key = b.key.slice();
          else if (type === 'short' && b.key && b.key.v != null && String(b.key.v).trim()) key = { v: String(b.key.v).trim().slice(0, 40), tol: Math.max(0, num(b.key.tol) || 0) };
          if (type === 'tf') n = key ? key.length : 4;
          s.q = { id: crypto.randomBytes(4).toString('hex'), type, label: cleanName(b.label).slice(0, 80), open: true, n, key, e: key ? String(b.e || '').slice(0, 400) : '', answers: {} };
        }
        else if (a === 'closeQ') { if (s.q) s.q.open = false; }
        else if (a === 'end') s.ended = true;
        else return send(res, 400, { error: 'Lệnh không hợp lệ' });
        save(); return send(res, 200, teacherView(s));
      }
    }
    send(res, 404, { error: 'Không tìm thấy' });
  } catch (e) {
    send(res, 400, { error: 'Yêu cầu không hợp lệ' });
  }
});

server.listen(PORT, () => {
  console.log('Phong tuong tac dang chay o cong ' + PORT + '  (hoc sinh: http://localhost:' + PORT + '/)');
  console.log('  Mat khau giao vien: ' + (process.env.TEACHER_PASS ? '(da dat)' : TEACHER_PASS + '   <- nen dat bien TEACHER_PASS'));
});
