/* Administrace Horská chata Zvonice: texty a ceny všech stránek, poptávky z formulářů, pop-up, akční balíčky, fotogalerie, video, heslo.
   Data jsou v repozitáři (_data/texty.json, popup.json, baliky.json, galerie.json, video.json); poptávky v KV webhunter-admin. Uložení = jeden commit přes webhunter-admin,
   GitHub Action pak web přegeneruje (~1 minuta). */
'use strict';
(() => {
const CFG = { id: 'zvonice', site: '../', api: 'https://webhunter-admin.webhunter.workers.dev' };
const FILES = { texty: '_data/texty.json', popup: '_data/popup.json', baliky: '_data/baliky.json', galerie: '_data/galerie.json', video: '_data/video.json' };
const SK = 'zvonice_admin';
const S = { tab: 'texty', str: null, sess: null, def: false, D: {}, snap: {}, prev: {}, pending: {}, preview: {}, saving: false, lib: null };
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
  (S.D.baliky.polozky || (S.D.baliky.polozky = [])).forEach((b) => { if (!b.id) b.id = uid(); });
}
/* Sloučení změn (3cestné): base = stav při načtení, mine = úpravy v tomto okně, theirs = aktuální stav na serveru.
   Uloží se jen to, co se v tomto okně opravdu změnilo – starší otevřená administrace tak nepřepíše novější úpravy. */
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const idOf = (x) => (isObj(x) ? (x.k ?? x.id ?? x.img ?? x.nazev ?? null) : null);
const unikatni = (a) => a.every((x) => idOf(x) != null) && new Set(a.map(idOf)).size === a.length;
function merge3(base, mine, theirs) {
  if (eq(mine, base)) return theirs;
  if (eq(theirs, base) || eq(mine, theirs)) return mine;
  if (isObj(base) && isObj(mine) && isObj(theirs)) {
    const out = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      const inB = k in base, inM = k in mine, inT = k in theirs;
      if (inM && inT) out[k] = merge3(inB ? base[k] : undefined, mine[k], theirs[k]);
      else if (inM) { if (!inB || !eq(base[k], mine[k])) out[k] = mine[k]; }
      else if (!inB || !eq(base[k], theirs[k])) out[k] = theirs[k];
    }
    return out;
  }
  if (Array.isArray(base) && Array.isArray(mine) && Array.isArray(theirs)) {
    if (unikatni(base) && unikatni(mine) && unikatni(theirs)) {
      const B = new Map(base.map((x) => [idOf(x), x])), M = new Map(mine.map((x) => [idOf(x), x])), T = new Map(theirs.map((x) => [idOf(x), x]));
      const out = [];
      if (eq(mine.map(idOf), base.map(idOf))) {          // pořadí ani položky jsem neměnil → pořadí ze serveru
        for (const t of theirs) { const id = idOf(t); out.push(M.has(id) ? merge3(B.get(id), M.get(id), t) : t); }
      } else {
        for (const m of mine) { const id = idOf(m);
          if (T.has(id)) out.push(merge3(B.get(id), m, T.get(id)));
          else if (!B.has(id) || !eq(B.get(id), m)) out.push(m); }   // smazané jinde nechat smazané, pokud jsem je neupravil
        for (const t of theirs) { const id = idOf(t); if (!B.has(id) && !M.has(id)) out.push(t); }
      }
      return out;
    }
    if (base.length === mine.length && mine.length === theirs.length) return mine.map((m, i) => merge3(base[i], m, theirs[i]));
  }
  return mine;
}
const dirty = () => Object.keys(FILES).filter((k) => JSON.stringify(S.D[k]) !== S.snap[k]);
const bar = () => { const b = $('#savebar'); if (!b) return; const d = dirty(); b.classList.toggle('on', d.length > 0 || S.saving); b.querySelector('span').textContent = S.saving ? 'Ukládám…' : 'Máte neuložené změny.'; b.querySelectorAll('button').forEach((x) => { x.disabled = S.saving; }); };
window.addEventListener('beforeunload', (e) => { if (dirty().length) { e.preventDefault(); e.returnValue = ''; } });

async function saveAll() {
  const keys = dirty(); if (!keys.length || S.saving) return;
  const v = S.D.video;
  if (v.zobrazit && !/(shorts\/|youtu\.be\/|v=|embed\/)[A-Za-z0-9_-]{11}/.test(v.youtube || '')) return toast('Video: odkaz na YouTube není platný.', 'err');
  for (const p of S.D.galerie.photos) if (!p.alt.trim()) p.alt = 'Fotka z chaty Zvonice';
  const P = S.D.popup;
  if (P.zapnuto && !String(P.nadpis || '').trim()) return toast('Pop-up: vyplňte nadpis, nebo pop-up vypněte.', 'err');
  if (P.tlacitko && !String(P.odkaz || '').trim()) return toast('Pop-up: k tlačítku doplňte odkaz.', 'err');
  if (!(Number(P.zpozdeni) >= 0 && Number(P.zpozdeni) <= 120)) return toast('Pop-up: zpoždění zadejte v sekundách (0–120).', 'err');
  P.zpozdeni = Number(P.zpozdeni);
  for (const [i, b] of S.D.baliky.polozky.entries()) if (!String(b.nadpis || '').trim()) return toast(`Akční balíčky: balíček č. ${i + 1} nemá název.`, 'err');
  S.saving = true; bar();
  try {
    // před uložením načíst aktuální stav – když se mezitím web změnil (jiné okno, jiný počítač), změny sloučit
    let slouceno = false;
    for (const k of keys) {
      const remote = JSON.parse(await readFile(FILES[k])), base = JSON.parse(S.snap[k]);
      if (eq(remote, base) || (S.prev[k] && eq(remote, JSON.parse(S.prev[k])))) continue;
      S.D[k] = merge3(base, S.D[k], remote); slouceno = true;
    }
    const files = keys.map((k) => ({ path: FILES[k], content: JSON.stringify(S.D[k], null, 2) + '\n' }));
    const used = JSON.stringify(S.D);
    const imgs = Object.keys(S.pending).filter((p) => used.includes(p.replace(/^img\//, '')));
    imgs.forEach((p) => files.push({ path: p, b64: S.pending[p] }));
    const sha = await commit(files, 'Administrace: ' + keys.join(', ') + (imgs.length ? ` (+${imgs.length} foto)` : ''));
    imgs.forEach((p) => delete S.pending[p]);
    keys.forEach((k) => { S.prev[k] = S.snap[k]; S.snap[k] = JSON.stringify(S.D[k]); });
    if (slouceno) { const y = window.scrollY; shell(); window.scrollTo(0, y); }
    toast(slouceno ? 'Uloženo. Mezitím se web změnil jinde – Vaše úpravy jsme sloučili s aktuální verzí.' : 'Uloženo. Změny se na webu objeví přibližně za minutu.', 'ok'); watchPublish(sha);
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
/* texty a ceny: _data/texty.json = stránky → skupiny (sekce webu) → pole {k, typ, t} nebo tabulka {hlavicka, radky} */
const bezDiak = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function poleTextu(p) {
  const dlouhy = (p.t || '').length > 70 || (p.t || '').includes('\n');
  const opt = { 'aria-label': p.typ, oninput: (e) => { p.t = e.target.value; bar(); if (e.target.tagName === 'TEXTAREA') roste(e.target); } };
  const el = dlouhy ? h('textarea', { rows: 2, ...opt }, p.t || '') : h('input', { type: 'text', value: p.t || '', ...opt });
  if (dlouhy) requestAnimationFrame(() => roste(el));
  return h('label.f', {}, h('span', {}, p.typ + (p.seo ? ' – zobrazuje se ve výsledcích vyhledávání' : '')), el);
}
const roste = (el) => { el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px'; };
function popisTabulky(g, p) {
  let sum = '', nad = '';
  for (const x of g.pole) { if (x === p) break; if (x.typ === 'Rozbalovací nadpis') { sum = x.t; nad = ''; } else if (/^(Podnadpis|Nadpis)$/.test(x.typ)) nad = x.t; }
  return 'Tabulka' + ([sum, nad].filter(Boolean).length ? ': ' + [sum, nad].filter(Boolean).join(' – ') : '');
}
function editorTabulky(p, nazev) {
  const box = h('div.tbl');
  const bunka = (arr, j, popis) => h('input', { type: 'text', value: arr[j] ?? '', 'aria-label': popis, oninput: (e) => { arr[j] = e.target.value; bar(); } });
  const render = () => {
    const sl = Math.max(p.hlavicka ? p.hlavicka.length : 0, ...p.radky.map((r) => r.length), 1);
    const t = h('table');
    if (p.hlavicka) t.append(h('thead', {}, h('tr', {}, p.hlavicka.map((c, j) => h('th', {}, bunka(p.hlavicka, j, 'Záhlaví sloupce ' + (j + 1)))), h('th'))));
    const tb = h('tbody');
    p.radky.forEach((r, i) => tb.append(h('tr', {}, Array.from({ length: sl }, (_, j) => h('td', {}, bunka(r, j, `Řádek ${i + 1}, sloupec ${j + 1}`))),
      h('td.x', {}, h('button', { type: 'button', title: 'Smazat řádek', 'aria-label': 'Smazat řádek', onclick: () => { if (confirm('Smazat tento řádek tabulky?')) { p.radky.splice(i, 1); bar(); render(); } } }, '×')))));
    t.append(tb);
    box.replaceChildren(h('span.tbl-n', {}, nazev), h('div.tbl-sc', {}, t),
      h('button.btn.btn-s', { type: 'button', onclick: () => { p.radky.push(Array(sl).fill('')); bar(); render(); } }, '＋ Přidat řádek'));
  };
  render(); return box;
}
function kartaSkupiny(g, cesta) {
  const kids = [];
  for (const p of g.pole) kids.push(p.typ === 'tabulka' ? editorTabulky(p, popisTabulky(g, p)) : poleTextu(p));
  return h('section.card', {}, cesta ? h('small.cesta', {}, cesta) : null, h('h2', {}, g.nazev), ...kids);
}
function vTexty() {
  const T = S.D.texty; if (!S.str) S.str = T.stranky[0].id;
  const obsah = h('div'), q = h('input', { type: 'search', placeholder: 'Hledat text nebo cenu na celém webu, např. 1 300', 'aria-label': 'Hledat text nebo cenu' });
  const volby = h('div.chips');
  const kresli = () => {
    const dotaz = bezDiak(q.value), bezMez = dotaz.replace(/ /g, '');
    volby.hidden = !!dotaz;
    if (dotaz.length >= 2) {
      const sedi = (s) => { const n = bezDiak(s); return n.includes(dotaz) || (bezMez.length > 2 && n.replace(/ /g, '').includes(bezMez)); };
      const karty = [];
      for (const st of T.stranky) for (const g of st.skupiny) {
        const pole = g.pole.filter((p) => p.typ === 'tabulka' ? sedi([...(p.hlavicka || []), ...p.radky.flat()].join(' | ')) : sedi(p.t));
        if (pole.length) karty.push(kartaSkupiny({ ...g, pole, id: null }, st.nazev));
      }
      obsah.replaceChildren(h('p.hint', {}, karty.length ? `Nalezeno v ${karty.length} ${karty.length === 1 ? 'sekci' : 'sekcích'}. Upravit můžete přímo tady.` : 'Nic nenalezeno.'), ...karty);
      return;
    }
    volby.replaceChildren(...T.stranky.map((st) => h('button', { type: 'button', 'aria-pressed': String(st.id === S.str), onclick: () => { S.str = st.id; kresli(); } }, st.nazev)));
    const st = T.stranky.find((x) => x.id === S.str) || T.stranky[0];
    obsah.replaceChildren(...st.skupiny.map((g) => kartaSkupiny(g)));
  };
  let tm; q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(kresli, 250); });
  kresli();
  return h('div', {}, h('section.card', {}, h('h2', {}, 'Texty a ceny'),
    h('p.hint', {}, 'Vyberte stránku a přepište, co potřebujete. Ceny a termíny jsou na webu na více místech (úvod, ceník, zimní pobyty, Silvestr), vyhledáváním je najdete všechny najednou. Pop-up a akční balíčky mají vlastní záložky. Nový řádek v textu se na webu zobrazí jako zalomení řádku.'),
    q, volby), obsah);
}
/* společné prvky formulářů */
const pole = (obj, key, label, o = {}) => {
  const set = (v) => { obj[key] = o.num ? (v === '' ? '' : Number(v)) : v; bar(); if (o.on) o.on(); };
  const el = o.multi ? h('textarea', { rows: o.rows || 3, oninput: (e) => set(e.target.value) }, obj[key] ?? '')
    : h('input', { type: o.num ? 'number' : 'text', value: obj[key] ?? '', placeholder: o.ph, list: o.list, min: o.min, max: o.max, oninput: (e) => set(e.target.value) });
  return h('label.f', {}, h('span', {}, label), el, o.hint ? h('small.pozn', {}, o.hint) : null);
};
const zaskrt = (obj, key, label, on) => { const c = h('input', { type: 'checkbox', onchange: (e) => { obj[key] = e.target.checked; bar(); if (on) on(); } }); c.checked = !!obj[key]; return h('label.f.chk', {}, c, ' ' + label); };
function fotka(obj, key, label) {
  const box = h('div.fotka');
  const kresli = () => {
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return; try { obj[key] = await upload(f); bar(); kresli(); toast('Fotka je připravená. Na web se nahraje po kliknutí na „Uložit změny“.'); } catch (er) { toast(er.message, 'err'); } } });
    let im = null;
    if (obj[key]) { im = h('img', { alt: '' }); im.src = src(obj[key]); im.onerror = () => { im.onerror = null; im.src = CFG.site + 'img/' + obj[key].replace(/\.[^.]+$/, '') + '-1280.webp'; }; }
    box.replaceChildren(h('span', {}, label), h('div.fotka-in', {}, im || h('div.fotka-prazdna', {}, 'Bez fotky'),
      h('div', {}, h('button.btn.btn-s', { type: 'button', onclick: () => file.click() }, obj[key] ? 'Vyměnit fotku' : '＋ Nahrát fotku'), ' ',
        obj[key] ? h('button.btn.btn-s', { type: 'button', onclick: () => { obj[key] = ''; bar(); kresli(); } }, 'Odebrat') : null, file)));
  };
  kresli(); return box;
}
const STRANKY_WEBU = [['', 'Úvod'], ['pobyty/', 'Pro skupiny'], ['ubytovani/', 'Ubytování'], ['cenik/', 'Ceník'], ['zimni-pobyty/', 'Zimní pobyty'], ['silvestr/', 'Silvestr'],
  ['okoli/', 'Okolí'], ['fotogalerie/', 'Fotogalerie'], ['partneri/', 'Partneři'], ['akcni-baliky/', 'Akční balíčky'], ['poptavka/', 'Poptávka a kontakt']];
const seznamStranek = () => h('datalist', { id: 'stranky-webu' }, STRANKY_WEBU.map(([v, n]) => h('option', { value: v || '/' }, n)));
function okno(nadpis, obsah, akce) {
  return new Promise((ok) => {
    const zavri = (v) => { bg.remove(); document.removeEventListener('keydown', esc); ok(v); };
    const esc = (e) => { if (e.key === 'Escape') zavri(null); };
    const bg = h('div.modal-bg', { onclick: (e) => { if (e.target === bg) zavri(null); } },
      h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': nadpis }, h('h2', {}, nadpis), obsah,
        h('div.modal-actions', {}, akce.map(([t, v, cls]) => h('button.btn' + (cls ? '.' + cls : '.btn-s'), { type: 'button', onclick: () => zavri(v) }, t)))));
    document.addEventListener('keydown', esc); document.body.append(bg);
  });
}

/* poptávky z formulářů (uložené ve webhunter-admin) */
const fmtD = (iso) => { try { return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
async function loadForms(force) { if (!S.forms || force) S.forms = await api('/forms'); return S.forms; }
function vPoptavky() {
  const list = h('div', {}, h('p.hint', {}, 'Načítám…')); const filt = { s: '' }; let D;
  const filtry = h('div.chips', {}, [['', 'Vše'], ['nova', 'Nové'], ['potvrzena', 'Potvrzené'], ['vyrizena', 'Vyřízené'], ['zrusena', 'Zrušené']].map(([v, t]) =>
    h('button', { type: 'button', 'aria-pressed': String(v === ''), onclick: (e) => { filt.s = v; filtry.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); render(); } }, t)),
    h('button.obnovit', { type: 'button', onclick: async () => { try { D = await loadForms(true); render(); toast('Načteno.'); } catch (e) { toast('Poptávky se nepodařilo načíst: ' + e.message, 'err'); } } }, '↻ Obnovit'));
  const render = () => {
    if (!D) return; const STAT = D.statuses || {};
    const rows = D.forms.filter((f) => !filt.s || f.s === filt.s);
    if (!rows.length) return list.replaceChildren(h('p.hint', {}, D.forms.length ? 'V tomto stavu nic není.' : 'Zatím žádné poptávky. Jakmile někdo odešle formulář na webu, objeví se tady.'));
    list.replaceChildren(h('div.forms', {}, rows.map((f) => h('button.frow' + (f.s === 'nova' ? '.new' : ''), { type: 'button', onclick: () => detail(f.key) },
      h('span.fst.st-' + f.s, {}, STAT[f.s] || f.s), h('b', {}, f.n || '(bez jména)'), h('span', {}, f.t || 'Poptávka'), h('span', {}, f.w ? 'termín ' + f.w : ''), h('small', {}, fmtD(f.d))))));
  };
  const detail = async (key) => {
    let r; try { r = await api('/forms?key=' + encodeURIComponent(key)); } catch (e) { return toast('Poptávku se nepodařilo načíst: ' + e.message, 'err'); }
    const st = { status: r.status || 'nova', note: r.note || '' };
    const sel = h('select', { onchange: (e) => { st.status = e.target.value; } }, Object.entries(D.statuses || {}).map(([v, t]) => h('option', { value: v }, t))); sel.value = st.status;
    const body = h('div', {},
      h('table.ftable', {}, h('tbody', {},
        ...(r.fields || []).map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, k === 'E-mail' ? h('a', { href: 'mailto:' + v }, v) : /^Telefon/.test(k) ? h('a', { href: 'tel:' + String(v).replace(/\s/g, '') }, v) : String(v)))),
        h('tr', {}, h('th', {}, 'Odesláno'), h('td', {}, fmtD(r.created))))),
      h('label.f', {}, h('span', {}, 'Stav'), sel),
      h('label.f', {}, h('span', {}, 'Poznámka (vidíte jen vy)'), h('textarea', { rows: 3, oninput: (e) => { st.note = e.target.value; } }, st.note)));
    const res = await okno(r.typeLabel || 'Poptávka', body, [['Smazat', 'del', 'btn-s.smazat'], ['Zavřít', null], ['Uložit', 'save', 'btn-p']]);
    try {
      if (res === 'save') { await api('/forms', { method: 'POST', body: JSON.stringify({ key, status: st.status, note: st.note }) }); toast('Uloženo.', 'ok'); }
      if (res === 'del') { if (!confirm('Smazat poptávku? Bude z přehledu trvale odstraněna (e-mail, který přišel, zůstane).')) return; await api('/forms', { method: 'POST', body: JSON.stringify({ key, delete: true }) }); toast('Smazáno.'); }
      if (res) { D = await loadForms(true); render(); }
    } catch (e) { toast('Nepodařilo se uložit: ' + e.message, 'err'); }
  };
  loadForms(true).then((x) => { D = x; render(); }).catch((e) => list.replaceChildren(h('p.hint', {}, 'Poptávky se nepodařilo načíst: ' + e.message)));
  return h('section.card', {}, h('h2', {}, 'Poptávky'),
    h('p.hint', {}, 'Všechno, co návštěvníci odešlou z formulářů na webu. Každá poptávka zároveň přichází e-mailem na provozni@zvonice.cz. Kliknutím otevřete detail, změníte stav nebo připíšete poznámku.'),
    filtry, list);
}

/* pop-up s novinkami: _data/popup.json */
function vPopup() {
  const P = S.D.popup;
  return h('section.card', {}, h('h2', {}, 'Pop-up s novinkami'),
    h('p.hint', {}, 'Okno, které se návštěvníkům ukáže po několika sekundách na webu (jednou za návštěvu). Hodí se na novinky, akce nebo volné termíny.'),
    zaskrt(P, 'zapnuto', 'Zobrazovat pop-up na webu'),
    pole(P, 'stitek', 'Malý štítek nad nadpisem', { ph: 'např. Novinka' }), pole(P, 'nadpis', 'Nadpis'), pole(P, 'text', 'Text', { multi: true, rows: 4 }),
    fotka(P, 'foto', 'Fotka (nepovinná)'),
    h('div.dva', {}, pole(P, 'tlacitko', 'Text tlačítka', { ph: 'např. Zimní pobyty' }), pole(P, 'odkaz', 'Kam tlačítko vede', { list: 'stranky-webu', ph: 'např. silvestr/', hint: 'Stránka webu (vyberte ze seznamu) nebo celá adresa https://…' })),
    h('div.dva', {}, pole(P, 'odkaz2_text', 'Druhý odkaz – text (nepovinný)'), pole(P, 'odkaz2', 'Druhý odkaz – kam vede', { list: 'stranky-webu' })),
    pole(P, 'zpozdeni', 'Za kolik sekund se pop-up ukáže', { num: true, min: 0, max: 120 }), seznamStranek(),
    h('p.hint', {}, 'Po uložení si pop-up můžete prohlédnout hned: ', h('a', { href: CFG.site + '?popup', target: '_blank', rel: 'noopener' }, 'otevřít web s pop-upem'), ' (zobrazí se ihned, i když jste ho už zavřeli).'));
}

/* akční balíčky: _data/baliky.json, stránka /akcni-baliky/ + sekce na úvodu */
function vBaliky() {
  const B = S.D.baliky; const arr = B.polozky; const box = h('div');
  const render = () => {
    box.replaceChildren(...arr.map((b, i) => {
      const mv = (d) => { const j = i + d; if (j < 0 || j >= arr.length) return; arr.splice(j, 0, arr.splice(i, 1)[0]); bar(); render(); };
      return h('div.balik', {}, h('div.balik-h', {}, h('b', {}, `${i + 1}. ${b.nadpis || 'Nový balíček'}`), h('span', {},
          h('button.btn.btn-s', { type: 'button', title: 'Posunout výš', 'aria-label': 'Posunout výš', disabled: i === 0, onclick: () => mv(-1) }, '↑'), ' ',
          h('button.btn.btn-s', { type: 'button', title: 'Posunout níž', 'aria-label': 'Posunout níž', disabled: i === arr.length - 1, onclick: () => mv(1) }, '↓'), ' ',
          h('button.btn.btn-s.smazat', { type: 'button', onclick: () => { if (confirm(`Smazat balíček „${b.nadpis || 'bez názvu'}“?`)) { arr.splice(i, 1); bar(); render(); } } }, 'Smazat'))),
        h('div.dva', {}, pole(b, 'nadpis', 'Název balíčku'), pole(b, 'cena', 'Cena', { ph: 'např. od 1 290 Kč / osoba / noc' })),
        pole(b, 'stitek', 'Malý štítek (nepovinný)', { ph: 'např. Jen do 31. 1.' }), pole(b, 'text', 'Popis – co balíček obsahuje', { multi: true, rows: 4 }),
        fotka(b, 'foto', 'Fotka'), zaskrt(b, 'na_uvodu', 'Ukázat i na úvodní stránce'));
    }), ...(arr.length ? [] : [h('p.hint', {}, 'Zatím žádný balíček. Dokud nějaký nepřidáte, stránka Akční balíčky se v menu nezobrazuje.')]),
    h('button.btn.btn-p', { type: 'button', onclick: () => { arr.push({ id: uid(), nadpis: '', stitek: '', cena: '', text: '', foto: '', na_uvodu: true }); bar(); render(); } }, '＋ Přidat balíček'));
  };
  render();
  return h('div', {}, h('section.card', {}, h('h2', {}, 'Akční balíčky'),
    h('p.hint', {}, 'Balíčky se zobrazí na stránce Akční balíčky (odkaz se v menu objeví, jakmile je aspoň jeden), vybrané i na úvodní stránce. Každý má tlačítko „Poptat balíček“, které otevře formulář s vyplněným názvem.'),
    pole(B, 'nadpis', 'Nadpis stránky'), pole(B, 'menu', 'Název v menu'), pole(B, 'perex', 'Úvodní text', { multi: true, rows: 2 }),
    B.polozky.length ? h('p.hint', {}, h('a', { href: CFG.site + 'akcni-baliky/', target: '_blank', rel: 'noopener' }, 'Otevřít stránku Akční balíčky')) : null),
    h('section.card', {}, h('h2', {}, 'Balíčky'), box));
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
    h('div.wrap', {}, S.def ? h('div.banner', {}, 'Používáte výchozí heslo „admin“. V záložce Heslo si nastavte vlastní.') : null,
      h('nav.tabs', { 'aria-label': 'Části administrace' }, [['texty', 'Texty a ceny'], ['poptavky', 'Poptávky'], ['popup', 'Pop-up'], ['baliky', 'Akční balíčky'], ['foto', 'Fotogalerie a video'], ['heslo', 'Heslo']].map(([k, n]) =>
        h('button', { type: 'button', 'aria-pressed': String(S.tab === k), onclick: () => { S.tab = k; shell(); window.scrollTo(0, 0); } }, n))),
      ...({ texty: () => [vTexty()], poptavky: () => [vPoptavky()], popup: () => [vPopup()], baliky: () => [vBaliky()], foto: () => [vVideo(), vGalerie()] }[S.tab] || (() => [vHeslo()]))()),
    h('div.savebar', { id: 'savebar' }, h('span', {}, ''),
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
