/* Administrace Horská chata Zvonice: fotogalerie, video na úvodní stránce, heslo.
   Data jsou v repozitáři (_data/galerie.json, _data/video.json). Uložení = jeden commit přes webhunter-admin,
   GitHub Action pak web přegeneruje (~1 minuta). */
'use strict';
(() => {
const CFG = { id: 'zvonice', site: '../', api: 'https://webhunter-admin.webhunter.workers.dev' };
const FILES = { galerie: '_data/galerie.json', video: '_data/video.json' };
const SK = 'zvonice_admin';
const S = { sess: null, def: false, D: {}, snap: {}, pending: {}, preview: {}, saving: false, lib: null };
const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 8);
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function h(sel, props = {}, ...kids) {
  const [tag, ...cls] = sel.split('.'); const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) { if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'value') el.value = v; else el.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
function toast(t, type = '') { const el = h('div.toast' + (type ? '.' + type : ''), {}, t); $('#toasts').append(el); setTimeout(() => el.remove(), type === 'err' ? 8000 : 4500); }
const b64e = (bytes) => { let s = ''; bytes = new Uint8Array(bytes); for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const utf8b64 = (str) => b64e(new TextEncoder().encode(str));
const saveSess = () => localStorage.setItem(SK, JSON.stringify({ t: S.sess, def: S.def, exp: Date.now() + 11.5 * 3600e3 }));

async function api(path, opt = {}, retried = false) {
  const headers = { ...(typeof opt.body === 'string' ? { 'Content-Type': 'application/json' } : {}) };
  if (S.sess) headers.Authorization = 'Bearer ' + S.sess;
  let r;
  try { r = await fetch(`${CFG.api}/api/${CFG.id}${path}`, { ...opt, headers, cache: 'no-store' }); }
  catch { throw new Error('Nelze se spojit se serverem. Zkontrolujte připojení k internetu.'); }
  if (r.status === 401 && path !== '/login' && !retried && S.D.galerie) { if (await reauth()) return api(path, opt, true); }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error || m; } catch {} const e = new Error(m); e.status = r.status; throw e; }
  return opt.raw ? r.text() : r.json();
}
const readFile = (p) => api('/file?path=' + encodeURIComponent(p) + '&t=' + Date.now(), { raw: true });
async function commit(files, message) {
  const out = []; const queue = [...files];
  const worker = async () => { while (queue.length) { const f = queue.shift(); const { sha } = await api('/blob', { method: 'POST', body: JSON.stringify({ content: f.b64 ?? utf8b64(f.content), encoding: 'base64' }) }); out.push({ path: f.path, sha }); } };
  await Promise.all([worker(), worker(), worker()]);
  return (await api('/commit', { method: 'POST', body: JSON.stringify({ files: out, message }) })).sha;
}
async function reauth() {
  const pw = prompt('Přihlášení vypršelo. Zadejte heslo znovu (rozdělaná práce zůstane zachována):');
  if (!pw) return false;
  try { const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: pw }) }); S.sess = r.token; S.def = r.def; saveSess(); return true; }
  catch (e) { toast('Přihlášení se nepovedlo: ' + e.message, 'err'); return false; }
}

/* data */
async function loadAll() {
  for (const k of Object.keys(FILES)) { S.D[k] = JSON.parse(await readFile(FILES[k])); S.snap[k] = JSON.stringify(S.D[k]); }
}
const dirty = () => Object.keys(FILES).filter((k) => JSON.stringify(S.D[k]) !== S.snap[k]);
const bar = () => { const b = $('#savebar'); if (!b) return; const d = dirty(); b.classList.toggle('on', d.length > 0 || S.saving); b.querySelector('span').textContent = S.saving ? 'Ukládám…' : 'Máte neuložené změny.'; b.querySelectorAll('button').forEach((x) => { x.disabled = S.saving; }); };
window.addEventListener('beforeunload', (e) => { if (dirty().length) { e.preventDefault(); e.returnValue = ''; } });

async function saveAll() {
  const keys = dirty(); if (!keys.length || S.saving) return;
  const v = S.D.video;
  if (v.zobrazit && !/(shorts\/|youtu\.be\/|v=|embed\/)[A-Za-z0-9_-]{11}/.test(v.youtube || '')) return toast('Video: odkaz na YouTube není platný.', 'err');
  for (const p of S.D.galerie.photos) if (!p.alt.trim()) p.alt = 'Fotka z chaty Zvonice';
  S.saving = true; bar();
  try {
    const files = keys.map((k) => ({ path: FILES[k], content: JSON.stringify(S.D[k], null, 2) + '\n' }));
    const used = JSON.stringify(S.D);
    const imgs = Object.keys(S.pending).filter((p) => used.includes(p.replace(/^img\//, '')));
    imgs.forEach((p) => files.push({ path: p, b64: S.pending[p] }));
    const sha = await commit(files, 'Administrace: ' + keys.join(', ') + (imgs.length ? ` (+${imgs.length} foto)` : ''));
    imgs.forEach((p) => delete S.pending[p]);
    keys.forEach((k) => { S.snap[k] = JSON.stringify(S.D[k]); });
    toast('Uloženo. Změny se na webu objeví přibližně za minutu.', 'ok'); watchPublish(sha);
  } catch (e) { toast('Uložení se nepovedlo: ' + e.message, 'err'); }
  finally { S.saving = false; bar(); }
}
let pubTimer = null;
function setPub(t) { const el = $('.pub'); if (el) el.textContent = t; }
function watchPublish(sha) {
  clearInterval(pubTimer); setPub('Zveřejňuji změny…'); const t0 = Date.now();
  pubTimer = setInterval(async () => {
    try { const v = await fetch(CFG.site + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
      if (v.sha === sha) { clearInterval(pubTimer); setPub('Web je aktuální'); toast('Změny jsou na webu.', 'ok'); return; } } catch {}
    if (Date.now() - t0 > 8 * 60000) { clearInterval(pubTimer); setPub('Zveřejnění trvá déle než obvykle'); }
  }, 6000);
}

/* obrázky: v prohlížeči se zmenší na 1800 px a převedou na WebP */
async function compress(file, max = 1800) {
  let bmp; try { bmp = await createImageBitmap(file); } catch { throw new Error(`Soubor „${file.name}“ nejde načíst. Použijte JPG, PNG nebo WebP.`); }
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.8)), ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85)); ext = 'jpg'; }
  return { blob, ext };
}
async function upload(file) {
  const { blob, ext } = await compress(file); const d = new Date();
  const name = slug(file.name.replace(/\.[^.]+$/, '')) || 'foto';
  const rel = `uploads/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${name}-${uid()}.${ext}`;
  S.pending['img/' + rel] = b64e(await blob.arrayBuffer()); S.preview[rel] = URL.createObjectURL(blob);
  return rel;
}
/* náhled: fotka z webu je v img/<název>, v živém webu až jako WebP varianta, proto se pro starší fotky bere z images.json knihovny */
const thumb = (rel) => S.preview[rel] || null;
async function lib() { if (!S.lib) { try { S.lib = await fetch(CFG.site + 'images.json?t=' + Date.now()).then((r) => r.json()); } catch { S.lib = []; } } return S.lib; }
/* URL náhledu: build ukládá <stem>-<šířka>.webp, stem = cesta s „-“ místo „/“ */
const live = (rel) => { const stem = rel.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-'); return CFG.site + 'img/' + stem + '-640.webp'; };
const src = (rel) => thumb(rel) || live(rel);

/* pohledy */
function vGalerie() {
  const arr = S.D.galerie.photos; const box = h('div');
  const render = () => {
    const grid = h('div.grid');
    arr.forEach((p, i) => {
      const im = h('img', { alt: '', loading: 'lazy' });
      im.src = src(p.img); im.onerror = () => { im.onerror = null; im.src = CFG.site + 'img/' + p.img.replace(/\.[^.]+$/, '') + '-1280.webp'; };
      const alt = h('input', { type: 'text', placeholder: 'Popis fotky', value: p.alt, 'aria-label': 'Popis fotky', oninput: (e) => { p.alt = e.target.value; bar(); } });
      const mv = (d) => { const j = i + d; if (j < 0 || j >= arr.length) return; arr.splice(j, 0, arr.splice(i, 1)[0]); bar(); render(); };
      grid.append(h('div.ph', {}, im, alt, h('div.t', {},
        h('button', { type: 'button', title: 'Posunout dopředu', 'aria-label': 'Posunout dopředu', onclick: () => mv(-1), disabled: i === 0 }, '←'),
        h('button', { type: 'button', title: 'Posunout dozadu', 'aria-label': 'Posunout dozadu', onclick: () => mv(1), disabled: i === arr.length - 1 }, '→'),
        h('button.x', { type: 'button', title: 'Smazat fotku', 'aria-label': 'Smazat fotku', onclick: () => { if (confirm('Odebrat tuto fotku z galerie?')) { arr.splice(i, 1); bar(); render(); } } }, '🗑'))));
    });
    const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async (e) => {
      for (const f of e.target.files) { try { arr.unshift({ img: await upload(f), alt: '' }); } catch (er) { toast(er.message, 'err'); } }
      e.target.value = ''; bar(); render(); toast('Fotky jsou připravené. Na web se nahrají po kliknutí na „Uložit změny“.'); } });
    box.replaceChildren(h('p.hint', {}, `Počet fotek: ${arr.length}. Nové fotky se přidají na začátek. Pořadí měníte šipkami, popis pod fotkou si můžete upravit.`),
      h('button.btn.btn-p', { type: 'button', onclick: () => file.click() }, '＋ Přidat fotky'), file, grid);
  };
  render();
  return h('section.card', {}, h('h2', {}, 'Fotogalerie'), h('p.hint', {}, 'Fotky se zobrazí na stránce Fotogalerie. Na úvodní stránce zůstává pět vybraných fotek.'), box);
}
function vVideo() {
  const v = S.D.video;
  const chk = h('input', { type: 'checkbox', onchange: (e) => { v.zobrazit = e.target.checked; bar(); } }); chk.checked = !!v.zobrazit;
  const fld = (key, label, o = {}) => h('label.f', {}, h('span', {}, label),
    o.multi ? h('textarea', { rows: 3, oninput: (e) => { v[key] = e.target.value; bar(); } }, v[key] || '') : h('input', { type: 'text', value: v[key] || '', oninput: (e) => { v[key] = e.target.value; bar(); } }));
  return h('section.card', {}, h('h2', {}, 'Video na úvodní stránce'),
    h('p.hint', {}, 'Sekce „Nahlédněte k nám“ pod ceníkem. Vložte odkaz na video z YouTube (i krátké video Shorts).'),
    h('label.f', {}, chk, ' Zobrazit video na úvodní stránce'), fld('youtube', 'Odkaz na YouTube'), fld('nadpis', 'Nadpis'), fld('text', 'Krátký text', { multi: true }));
}
function vHeslo() {
  const o = h('input', { type: 'password', autocomplete: 'current-password' }), a = h('input', { type: 'password', autocomplete: 'new-password' }), b = h('input', { type: 'password', autocomplete: 'new-password' });
  return h('section.card', {}, h('h2', {}, 'Heslo'), S.def ? h('div.banner', {}, 'Používáte výchozí heslo „admin“. Nastavte si prosím vlastní.') : null,
    h('label.f', {}, h('span', {}, 'Současné heslo'), o), h('label.f', {}, h('span', {}, 'Nové heslo (min. 8 znaků)'), a), h('label.f', {}, h('span', {}, 'Nové heslo znovu'), b),
    h('button.btn', { type: 'button', onclick: async () => {
      if (a.value.length < 8) return toast('Heslo musí mít aspoň 8 znaků.', 'err'); if (a.value !== b.value) return toast('Hesla se neshodují.', 'err');
      try { const r = await api('/password', { method: 'POST', body: JSON.stringify({ old: o.value, password: a.value }) }); if (r.token) { S.sess = r.token; S.def = false; saveSess(); } o.value = a.value = b.value = ''; toast('Heslo změněno.', 'ok'); }
      catch (e) { toast('Heslo se nepodařilo změnit: ' + e.message, 'err'); } } }, 'Změnit heslo'));
}
function shell() {
  $('#app').replaceChildren(
    h('header.top', {}, h('b', {}, 'Horská chata Zvonice – administrace'), h('span.pub', {}, 'Web je aktuální'),
      h('span', {}, h('a.btn.btn-s', { href: CFG.site, target: '_blank', rel: 'noopener' }, 'Zobrazit web'), ' ',
        h('button.btn.btn-s', { type: 'button', onclick: () => { if (dirty().length && !confirm('Máte neuložené změny. Opravdu se odhlásit?')) return; localStorage.removeItem(SK); S.sess = null; login(); } }, 'Odhlásit'))),
    h('div.wrap', {}, S.def ? h('div.banner', {}, 'Používáte výchozí heslo „admin“. Dole na stránce si nastavte vlastní.') : null, vVideo(), vGalerie(), vHeslo()),
    h('div.savebar#savebar', {}, h('span', {}, ''),
      h('span', {}, h('button.btn.btn-s', { type: 'button', onclick: () => { if (confirm('Zahodit neuložené změny?')) location.reload(); } }, 'Zahodit'), ' ',
        h('button.btn.btn-p', { type: 'button', onclick: saveAll }, 'Uložit změny'))));
  bar();
}
function login(msg = '') {
  const inp = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Heslo', required: true });
  const err = h('p.err', {}, msg); const btn = h('button.btn.btn-p', { type: 'submit' }, 'Přihlásit se');
  $('#app').replaceChildren(h('form.login', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try { const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: inp.value }) }); S.sess = r.token; S.def = r.def; saveSess(); start(); }
    catch (er) { err.textContent = er.message; btn.disabled = false; inp.select(); } } },
    h('h1', {}, 'Administrace webu'), h('p', {}, 'Horská chata Zvonice'), h('label.f', {}, h('span', {}, 'Heslo'), inp), btn, err));
  setTimeout(() => inp.focus(), 50);
}
async function start() {
  try { await loadAll(); } catch (e) { if (e.status === 401) { localStorage.removeItem(SK); S.sess = null; return login('Přihlášení vypršelo, přihlaste se znovu.'); } return login('Obsah se nepodařilo načíst: ' + e.message); }
  shell();
}
const s = JSON.parse(localStorage.getItem(SK) || 'null');
if (s && s.exp > Date.now()) { S.sess = s.t; S.def = s.def; start(); } else login();
})();
