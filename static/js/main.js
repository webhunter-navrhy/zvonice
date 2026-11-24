// Horská chata Zvonice – hlavička, mobilní menu, záložky ubytování, odhalení sekcí.
(function () {
  var hl = document.querySelector('.hl');
  var plna = function () { hl.classList.toggle('plna', scrollY > 60 || !document.querySelector('.hero, .titulni')); };
  addEventListener('scroll', plna, { passive: true }); plna();

  var burger = document.querySelector('.burger');
  if (burger) burger.addEventListener('click', function () {
    var o = hl.classList.toggle('otevreno');
    burger.setAttribute('aria-expanded', o);
    document.body.style.overflow = o ? 'hidden' : '';
  });
  // klik na položku mobilního menu (i kotvu na stejné stránce) menu zavře
  document.querySelectorAll('.mob-menu a').forEach(function (a) {
    a.addEventListener('click', function () { hl.classList.remove('otevreno'); if (burger) burger.setAttribute('aria-expanded', false); document.body.style.overflow = ''; });
  });

  var tabs = [].slice.call(document.querySelectorAll('.zal [role=tab]'));
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute('aria-selected', on);
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
    });
  });

  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('videt'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('[data-odhal]').forEach(function (el) { el.classList.add('odhal'); io.observe(el); });
  }
})();

// fotogalerie: zvětšení fotky
(function () {
  var d = document.querySelector('dialog.lightbox');
  if (!d) return;
  var im = d.querySelector('img');
  document.querySelectorAll('[data-velka]').forEach(function (b) {
    b.addEventListener('click', function () { im.src = b.dataset.velka; im.alt = b.querySelector('img').alt; d.showModal(); });
  });
  d.addEventListener('click', function () { d.close(); });
})();

// formulář poptávky: v návrhu nic neodesílá
document.querySelectorAll('form.formular').forEach(function (f) {
  var stav = f.querySelector('.formular-stav'); var t0 = Date.now();
  var q = new URLSearchParams(location.search);
  if (q.get('pobyt') && f.elements.skupina) f.elements.skupina.value = q.get('pobyt');
  if (q.get('balicek') && f.elements.zprava && !f.elements.zprava.value) f.elements.zprava.value = 'Mám zájem o balíček: ' + q.get('balicek');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (f.dataset.odesila === '1' || f.dataset.odeslano === '1') return;
    var hp = f.querySelector('.past input').value;
    var btn = f.querySelector('button[type=submit],button:not([type])');
    var pole = {}, popis = {skupina:'Typ pobytu',jmeno:'Jméno',email:'E-mail',telefon:'Telefon',organizace:'Škola / klub / oddíl',prijezd:'Příjezd',odjezd:'Odjezd',deti:'Počet dětí',dospeli:'Počet dospělých',strava:'Strava',zprava:'Zpráva'};
    Object.keys(popis).forEach(function (k) { if (f.elements[k] && f.elements[k].value) pole[popis[k]] = f.elements[k].value; });
    var zaj = Array.prototype.map.call(f.querySelectorAll('input[name=zajem]:checked'), function (c) { return c.value; });
    if (zaj.length) pole['Mám zájem o'] = zaj.join(', ');
    stav.textContent = 'Odesílám…'; f.dataset.odesila = '1'; if (btn) btn.disabled = true;
    fetch('https://webhunter-admin.webhunter.workers.dev/api/zvonice/form', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'poptavka', fields: pole, page: location.href, hp: hp, ms: Date.now() - t0 })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok !== false, j: j }; }); })
    .then(function (r) {
      if (r.ok) {
        f.reset(); f.dataset.odeslano = '1'; f.classList.add('odeslano');
        if (btn) btn.textContent = 'Odesláno ✓';
        stav.textContent = 'Děkujeme, poptávka je odeslaná a brzy se Vám ozveme. Není potřeba odesílat znovu.';
        stav.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      else { stav.textContent = (r.j && r.j.error) || 'Odeslání se nepovedlo. Zkuste to prosím znovu, nebo nám napište na sales@lipperthotels.cz.'; }
    }).catch(function () { stav.textContent = 'Odeslání se nepovedlo. Zkuste to prosím znovu, nebo nám napište na sales@lipperthotels.cz.'; })
    .then(function () { f.dataset.odesila = ''; if (btn && f.dataset.odeslano !== '1') btn.disabled = false; });
  });
  });

// cookies: výchozí stav zamítnuto (v hlavičce), GTM se načte až po „Přijmout vše“ a jen na zvonice.cz
var cookiesVolba = (function () {
  var lis = document.getElementById('cookies'), KLIC = 'zvonice-cookies', cekaji = [];
  var nacti = function () { try { return localStorage.getItem(KLIC); } catch (e) { return null; } };
  var gtmNacten = false;
  var pouzij = function (v) {
    var ano = v === 'vse' ? 'granted' : 'denied';
    gtag('consent', 'update', { ad_storage: ano, ad_user_data: ano, ad_personalization: ano, analytics_storage: ano });
    var id = lis && lis.dataset.gtm;
    if (v === 'vse' && id && !gtmNacten && /(^|\.)zvonice\.cz$/.test(location.hostname)) {
      gtmNacten = true;
      dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      var s = document.createElement('script'); s.async = true;
      s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id);
      document.head.appendChild(s);
    }
  };
  var ukaz = function (bezFokusu) { if (lis) { lis.hidden = false; if (bezFokusu === true) return; var b = lis.querySelector('[data-cookies]'); if (b) b.focus({ preventScroll: true }); } };
  if (lis) lis.querySelectorAll('[data-cookies]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.dataset.cookies;
      try { localStorage.setItem(KLIC, v); } catch (e) {}
      lis.hidden = true; pouzij(v);
      var c = cekaji; cekaji = []; c.forEach(function (f) { f(); });
    });
  });
  document.querySelectorAll('[data-cookies-nastaveni]').forEach(function (b) { b.addEventListener('click', ukaz); });
  var v = nacti();
  if (v) pouzij(v); else ukaz(true);
  return function (f) { if (lis && lis.hidden) f(); else cekaji.push(f); };
})();

// pop-up s novinkami: jednou za návštěvu (až po volbě cookies), Esc / klik mimo / křížek zavře
(function () {
  var p = document.getElementById('popup');
  if (!p) return;
  var nahled = /[?&]popup\b/.test(location.search);
  try { if (!nahled && sessionStorage.getItem('popup-zavren')) return; } catch (e) {}
  var zav = function () {
    p.classList.remove('on'); p.hidden = true;
    try { sessionStorage.setItem('popup-zavren', '1'); } catch (e) {}
    if (last) last.focus();
  };
  var last;
  cookiesVolba(function () { setTimeout(function () {
    last = document.activeElement;
    p.hidden = false; p.classList.add('on');
    p.querySelector('.popup-zavrit').focus();
  }, nahled ? 400 : (parseFloat(p.getAttribute('data-zpozdeni')) || 6) * 1000); });
  p.querySelector('.popup-zavrit').addEventListener('click', zav);
  p.addEventListener('click', function (e) { if (e.target === p) zav(); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && p.classList.contains('on')) zav(); });
})();

// video: YouTube se načte až po kliknutí (bez cookies a bez spojení na Google předem)
(function () {
  document.querySelectorAll('.video-hraj').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(b.dataset.yt) + '?autoplay=1&rel=0&playsinline=1';
      f.title = 'Video – Horská chata Zvonice';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      b.parentNode.replaceChild(f, b);
    });
  });
})();
