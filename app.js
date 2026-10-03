(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const SITE = window.SITE;
  const params = new URLSearchParams(location.search);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const storage = (area) => ({
    get(k) { try { return window[area].getItem(k); } catch { return null; } },
    set(k, v) { try { window[area].setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { window[area].removeItem(k); } catch { /* private mode */ } },
  });
  const local = storage('localStorage');
  const session = storage('sessionStorage');
  const KEY = 'letters-key';
  const SEEN = 'letters-seen';

  let key = null;      // AES key, once unlocked
  let M = null;        // decrypted manifest
  let skew = 0;        // preview only: ?now=2026-12-20T09:00 pretends it is that moment
  const now = () => Date.now() + skew;

  // ---------- seasons & scenery ----------
  function seasonOf(date) {
    const m = date.getUTCMonth() + 1;
    if (m >= 9 && m <= 11) return 'fall';
    if (m === 12 || m <= 2) return 'winter';
    return 'spring';
  }

  const ICONS = {
    fall: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21c-5-2-8-7-7-14 6-1 11 2 13 7-1 4-3 6-6 7zM12 21c0-5 1-9 4-12"/></svg>',
    winter: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M20.700 7L3.3 17M12 6l-2.500-2M12 6l2.500-2M12 18l-2.500 2M12 18l2.500 2"/></svg>',
    spring: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2.500-5 6-5 0 3-2.500 5-6 5z"/></svg>',
  };

  // A layered Banff-ish skyline. Colours come from the season's CSS variables.
  let sceneCount = 0;
  function mountainsSvg() {
    const W = 2880, H = 420;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ridge = (step, peak, valley) => {
      const pts = [];
      for (let x = -40, up = false; x < W + 140; x += step[0] + rnd() * step[1], up = !up) {
        const [lo, hi] = up ? peak : valley;
        pts.push([Math.round(x), Math.round(lo + rnd() * (hi - lo))]);
      }
      return pts;
    };
    const fill = (pts) => 'M' + pts.map((p) => p.join(' ')).join('L') + `L${W} ${H}L0 ${H}Z`;

    const far = ridge([70, 50], [85, 165], [185, 245]);
    const mid = ridge([95, 60], [215, 255], [270, 305]);
    let caps = '';
    for (let i = 1; i < far.length - 1; i++) {
      const [l, p, r] = [far[i - 1], far[i], far[i + 1]];
      if (p[1] > l[1] || p[1] > r[1]) continue;
      const d = 24 + rnd() * 14;
      const lx = p[0] - ((p[0] - l[0]) * d) / (l[1] - p[1]);
      const rx = p[0] + ((r[0] - p[0]) * d) / (r[1] - p[1]);
      caps += `M${p[0]} ${p[1]}L${lx} ${p[1] + d}L${lx + (p[0] - lx) * 0.4} ${p[1] + d * 0.72}L${p[0] - 2} ${p[1] + d * 1.05}L${p[0] + (rx - p[0]) * 0.45} ${p[1] + d * 0.7}L${rx} ${p[1] + d}Z`;
    }

    const hillY = (x) => 350 + 9 * Math.sin(x / 170) + 5 * Math.sin(x / 61);
    const hill = [];
    for (let x = 0; x <= W; x += 30) hill.push([x, Math.round(hillY(x))]);
    let t1 = '', t2 = '';
    for (let x = 0; x < W; x += 8 + rnd() * 13) {
      const h = 20 + rnd() * 30, w = h * 0.24, y = hillY(x) + 5;
      const tree = `M${x.toFixed(0)} ${(y - h).toFixed(0)}l${(-w).toFixed(1)} ${h.toFixed(0)}h${(2 * w).toFixed(1)}Z`;
      if (rnd() < 0.68) t1 += tree; else t2 += tree;
    }
    const front = [];
    for (let x = 0; x <= W; x += 40) front.push([x, Math.round(400 + 6 * Math.sin(x / 140 + 1))]);

    const id = 'mist' + sceneCount++;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <circle cx="1650" cy="105" r="44" fill="var(--sun)" opacity=".85"/>
      <path d="${fill(far)}" fill="var(--m1)"/>
      <path d="${caps}" fill="#fff" opacity="var(--cap)"/>
      <rect y="170" width="${W}" height="130" fill="url(#${id})"/>
      <path d="${fill(mid)}" fill="var(--m2)"/>
      <rect y="255" width="${W}" height="110" fill="url(#${id})"/>
      <path d="${t2}" fill="var(--t2)"/><path d="${t1}" fill="var(--t1)"/>
      <path d="${fill(hill)}" fill="var(--m3)"/>
      <path d="${fill(front)}" fill="var(--page)"/>
    </svg>`;
  }

  function paintScenes(root = document) {
    const svg = mountainsSvg();
    root.querySelectorAll('.mountains').forEach((el) => { if (!el.firstChild) el.innerHTML = svg; });
  }

  // Gentle snow in winter, a few larch needles in fall, nothing in spring.
  function paintDrift(season) {
    const count = { winter: 26, fall: 9 }[season] || 0;
    document.querySelectorAll('.drift').forEach((el) => {
      if (el.dataset.for === season) return;
      el.dataset.for = season;
      el.textContent = '';
      for (let i = 0; i < count; i++) {
        const flake = document.createElement('i');
        const dur = 14 + Math.random() * 16;
        flake.style.cssText = `--x:${(Math.random() * 100).toFixed(1)}%;--s:${(3 + Math.random() * 5).toFixed(1)}px;` +
          `--o:${(0.45 + Math.random() * 0.5).toFixed(2)};--d:${dur.toFixed(1)}s;--delay:${(-Math.random() * dur).toFixed(1)}s;` +
          `--sway:${(Math.random() * 120 - 60).toFixed(0)}px;--spin:${(Math.random() * 720 - 360).toFixed(0)}deg`;
        el.appendChild(flake);
      }
    });
  }

  function setSeason(season) {
    document.documentElement.dataset.season = season;
    paintDrift(season);
  }

  // ---------- encryption (AES-GCM, key from PBKDF2; mirrors build.mjs) ----------
  const hexBytes = (hex) => Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
  const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

  async function deriveKey(password) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: hexBytes(SITE.salt), iterations: SITE.iterations }, base, 256);
    return new Uint8Array(bits);
  }
  const importKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const decrypt = (buf, k = key) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, k, buf.slice(12));

  async function fetchBin(name, init) {
    const res = await fetch(`data/${name}.bin`, init);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    return res.arrayBuffer();
  }
  const readManifest = async (buf, k) => JSON.parse(new TextDecoder().decode(await decrypt(buf, k)));

  const photoUrls = new Map();
  function photoUrl(name) {
    if (!photoUrls.has(name)) {
      const p = fetchBin(name).then(decrypt).then((buf) => URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' })));
      p.catch(() => photoUrls.delete(name));
      photoUrls.set(name, p);
    }
    return photoUrls.get(name);
  }

  const lazy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      lazy.unobserve(e.target);
      const img = e.target;
      photoUrl(img.dataset.pid).then((url) => {
        img.onload = () => img.classList.add('in');
        img.src = url;
      }).catch(() => {});
    }
  }, { rootMargin: '600px' });
  const watchPhotos = (root) => root.querySelectorAll('img[data-pid]').forEach((img) => lazy.observe(img));

  // ---------- password page ----------
  const gate = $('#gate');

  function showGate(message = '') {
    gate.hidden = false;
    $('#gate-msg').textContent = message;
    $('#pw').focus();
  }

  $('#gate-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const button = $('button', gate), card = $('.gate-card'), msg = $('#gate-msg');
    const typed = $('#pw').value.trim();
    if (!typed) return;
    button.disabled = true;
    button.textContent = 'Opening…';
    msg.textContent = '';
    try {
      const buf = await fetchBin('manifest', { cache: 'no-cache' });
      // phones like to capitalise the first letter, so also try it lower-cased
      for (const attempt of new Set([typed, typed.toLowerCase()])) {
        const raw = await deriveKey(attempt);
        const k = await importKey(raw);
        try {
          M = await readManifest(buf, k);
        } catch { continue; }
        key = k;
        session.set(KEY, toB64(raw));
        if ($('#remember').checked) local.set(KEY, toB64(raw));
        return enter();
      }
      msg.textContent = 'That’s not it. Try again?';
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      $('#pw').select();
    } catch {
      msg.textContent = 'Couldn’t reach the letters. Check your connection and try again.';
    } finally {
      button.disabled = false;
      button.textContent = 'Open';
    }
  });

  async function start() {
    setSeason(seasonOf(new Date()));
    paintScenes();
    if (!window.crypto || !crypto.subtle) return showGate('This page needs a secure (https) connection.');
    const saved = local.get(KEY) || session.get(KEY);
    if (!saved) return showGate();
    let buf;
    try {
      buf = await fetchBin('manifest', { cache: 'no-cache' });
    } catch {
      return showGate('Couldn’t reach the letters. Check your connection and try again.');
    }
    try {
      const k = await importKey(fromB64(saved));
      M = await readManifest(buf, k);
      key = k;
    } catch {
      local.del(KEY); // the password changed since this device was remembered
      session.del(KEY);
      return showGate();
    }
    enter();
  }

  // ---------- the scrapbook ----------
  const app = $('#app'), book = $('#book'), letterEl = $('#letter');
  const seen = new Set(JSON.parse(local.get(SEEN) || '[]'));
  let shown = new Set();
  const unlockAll = () => M.preview && !params.has('now');
  const visible = () => M.letters.filter((l) => unlockAll() || l.unlock <= now()).sort((a, b) => b.unlock - a.unlock);

  const dayOf = (id) => new Date(id + 'T12:00:00Z');
  const fmt = (id, opts) => dayOf(id).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
  const shortDate = (id) => fmt(id, { month: 'long', day: 'numeric', year: 'numeric' });
  const longDate = (id) => fmt(id, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // a stable little tilt per letter, so cards don't jump around between visits
  function tilt(str, max = 3.4) {
    let h = 0;
    for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const t = max * (0.3 + 0.7 * (h % 1000) / 1000);
    return (h & 1024 ? t : -t).toFixed(2);
  }

  // week 1 is the first Sunday in the schedule
  const weekOf = (l) => Math.round((l.unlock - M.schedule[0]) / (7 * 864e5)) + 1;
  const monthLabel = (id) => fmt(id, { month: 'long', year: 'numeric' });
  // newest or oldest first, remembered on her device
  const view = { oldestFirst: local.get('letters-order') === 'oldest' };

  function cardHtml(l, fresh) {
    const cls = ['card'];
    if (!seen.has(l.id)) cls.push('unseen');
    if (fresh.has(l.id)) cls.push('arrive');
    const face = l.cover >= 0
      ? `<span class="photo"><img data-pid="${l.photos[l.cover].thumb}" alt=""></span>`
      : `<span class="note-face">${esc(l.excerpt)}</span>`;
    return `<a class="${cls.join(' ')}" href="#/${l.id}" data-id="${l.id}" data-season="${l.season}" style="--tilt:${tilt(l.id, 1.3)}deg;--tape-tilt:${tilt(l.id + 't', 6)}deg">
      <span class="tape"></span>${face}
      <span class="week">Week ${weekOf(l)}</span>
      <span class="title">${esc(l.title)}</span>
      <span class="date">${shortDate(l.id)}</span>
    </a>`;
  }

  // "Jump to a month": one option per month, grouped by year, in the current order
  function renderToolbar(months) {
    $('#toolbar').hidden = months.length < 2;
    let html = '<option value="">Jump to a month…</option>', year = null;
    for (const m of months) {
      const y = m.key.slice(0, 4), n = m.letters.length;
      if (y !== year) html += (year ? '</optgroup>' : '') + `<optgroup label="${y}">`;
      year = y;
      html += `<option value="${m.key}">${fmt(m.letters[0].id, { month: 'long' })} ${y} · ${n} letter${n === 1 ? '' : 's'}</option>`;
    }
    $('#jump').innerHTML = html + (year ? '</optgroup>' : '');
    $('#sort').innerHTML = view.oldestFirst ? '↑ Oldest<span class="wide"> first</span>' : '↓ Newest<span class="wide"> first</span>';
  }

  function renderBook(fresh = new Set()) {
    const all = visible();
    shown = new Set(all.map((l) => l.id));
    const list = view.oldestFirst ? [...all].reverse() : all;

    const months = [];
    for (const l of list) {
      const key = l.id.slice(0, 7);
      const last = months[months.length - 1];
      if (last && last.key === key) last.letters.push(l);
      else months.push({ key, letters: [l] });
    }
    renderToolbar(months);
    let html = months.map((m) => {
      const season = m.letters[0].season, n = m.letters.length;
      return `<section class="month" id="m-${m.key}" data-season="${season}">
        <h2 class="month-label">${ICONS[season]}${monthLabel(m.letters[0].id)} <span class="count">${n} letter${n === 1 ? '' : 's'}</span></h2>
        <div class="cards">${m.letters.map((l) => cardHtml(l, fresh)).join('')}</div>
      </section>`;
    }).join('');
    const welcome = M.welcome ? `<section class="month" data-season="${M.welcome.season}">
        <div class="welcome-note"><span class="tape"></span>
          ${M.welcome.title ? `<h2>${esc(M.welcome.title)}</h2>` : ''}
          <div class="prose">${M.welcome.html}</div>
        </div>
      </section>` : '';
    // the welcome note is where it all began: last when newest-first, first when oldest-first
    book.innerHTML = view.oldestFirst ? welcome + html : html + welcome;
    watchPhotos(book);

    // the page wears today's season (in preview, the newest letter's, since those may be in the future)
    setSeason(unlockAll() && all[0] ? all[0].season : seasonOf(new Date(now())));
  }

  $('#sort').addEventListener('click', () => {
    view.oldestFirst = !view.oldestFirst;
    local.set('letters-order', view.oldestFirst ? 'oldest' : 'newest');
    renderBook();
    const bar = $('#toolbar');
    if (bar.getBoundingClientRect().top <= 0) window.scrollTo(0, bar.offsetTop);
  });

  $('#jump').addEventListener('change', (ev) => {
    const section = document.getElementById('m-' + ev.target.value);
    ev.target.value = '';
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY - $('#toolbar').offsetHeight + 1;
    window.scrollTo(0, top);
  });

  // ---------- countdown ----------
  const nextEl = $('#next'), envelope = $('#envelope');
  let target = null;
  const nextUnlock = () => M.schedule.find((t) => t > now()) || null;

  function paintCountdown() {
    nextEl.hidden = !target;
    if (!target) return;
    const s = Math.max(0, Math.ceil((target - now()) / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const two = (n) => String(n).padStart(2, '0');
    const values = { d: String(d), h: two(h), m: two(m), s: two(sec) };
    for (const b of $('#countdown').querySelectorAll('b')) {
      if (b.textContent !== values[b.dataset.u]) b.textContent = values[b.dataset.u];
    }
    $('#countdown small').textContent = d === 1 ? 'day' : 'days';
    $('#countdown').setAttribute('aria-label', `${d} days ${h} hours ${m} minutes ${sec} seconds`);
  }

  // Bring any newly unlocked letters into the scrapbook, with the envelope opening if she is watching.
  let arriving = false;
  async function arrive(refetch = true) {
    if (arriving) return;
    arriving = true;
    try {
      if (refetch) {
        try {
          const fresh = await readManifest(await fetchBin('manifest', { cache: 'no-cache' }), key);
          M = fresh;
          if (!target) target = nextUnlock();
        } catch { /* offline: keep what we have */ }
      }
      const fresh = new Set(visible().filter((l) => !shown.has(l.id)).map((l) => l.id));
      if (!fresh.size) return;
      const watching = !app.hidden && !document.hidden;
      if (watching) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        nextEl.classList.add('arriving');
        $('#next-label').textContent = 'A new letter is here';
        envelope.classList.add('open');
        await sleep(2600);
      }
      renderBook(watching ? fresh : new Set());
      if (watching) {
        const card = $('.card.arrive', book);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(2400);
        envelope.classList.remove('open');
        nextEl.classList.remove('arriving');
        $('#next-label').textContent = 'Next letter in';
      }
    } finally {
      arriving = false;
    }
  }

  function tick() {
    if (target && now() >= target) {
      target = nextUnlock();
      arrive();
    } else if (visible().length !== shown.size) {
      arrive(false);
    }
    paintCountdown();
  }

  // ---------- one letter + photo viewer, driven by the URL hash ----------
  //   #/2026-10-04      the letter      #/2026-10-04/2    its second photo, enlarged
  const lightbox = $('#lightbox'), lbImg = $('#lb-img');
  let open = null;      // the letter currently open
  let photoAt = -1;     // index of the enlarged photo
  let bookScroll = 0;
  let lbToken = 0;

  function push(hash) {
    history.pushState({ depth: ((history.state && history.state.depth) || 0) + 1 }, '', hash);
    route();
  }
  function goBack(fallback) {
    if (history.state && history.state.depth) return history.back();
    history.replaceState(null, '', fallback || location.pathname + location.search);
    route();
  }

  function route() {
    const m = location.hash.match(/^#\/(\d{4}-\d{2}-\d{2})(?:\/(\d+))?$/);
    const l = m && visible().find((x) => x.id === m[1]);
    if (!l) {
      if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
      return showBook();
    }
    showLetter(l);
    const n = Number(m[2] || 0);
    if (n >= 1 && n <= l.photos.length) showPhoto(n - 1);
    else hidePhoto();
  }

  function showBook() {
    hidePhoto();
    if (!open) return;
    open = null;
    letterEl.hidden = true;
    app.hidden = false;
    window.scrollTo(0, bookScroll);
  }

  function showLetter(l) {
    if (open === l) return;
    if (!open) bookScroll = window.scrollY;
    open = l;
    letterEl.dataset.season = l.season;
    // big prints use the full-size image; the lightbox is for going edge to edge
    const prints = l.photos.map((p, i) => `
      <a class="print" href="#/${l.id}/${i + 1}" style="--r:${(p.w / p.h).toFixed(4)};--tilt:${tilt(l.id + i, 0.9)}deg">
        <img data-pid="${p.full}" alt="Photo ${i + 1} of ${l.photos.length}">
      </a>`).join('');
    const order = visible();
    const at = order.indexOf(l);
    const newer = order[at - 1], older = order[at + 1];
    const step = (x, text) => x
      ? `<a class="step" href="#/${x.id}">${text}</a>`
      : `<span class="step" aria-disabled="true">${text}</span>`;
    letterEl.innerHTML = `
      <div class="letter-top">
        <div class="scene" aria-hidden="true"><div class="mountains"></div></div>
        <button class="back" type="button">← our scrapbook</button>
      </div>
      <div class="letter-wrap">
        <div class="sheet"><span class="tape"></span>
          <p class="l-date">Week ${weekOf(l)} · ${longDate(l.id)}</p>
          <h1>${esc(l.title)}</h1>
          <div class="prose">${l.html}</div>
        </div>
      </div>
      ${prints ? `<div class="prints"><p class="prints-label">${l.photos.length} photo${l.photos.length === 1 ? '' : 's'} · tap to enlarge</p>${prints}</div>` : ''}
      <nav class="letter-nav" aria-label="Other letters">
        ${step(older, '← Older')}
        <button class="back" type="button">Our scrapbook</button>
        ${step(newer, 'Newer →')}
      </nav>`;
    paintScenes(letterEl);
    watchPhotos(letterEl);
    app.hidden = true;
    letterEl.hidden = false;
    window.scrollTo(0, 0);
    if (!seen.has(l.id)) {
      seen.add(l.id);
      local.set(SEEN, JSON.stringify([...seen]));
      const card = $(`.card[data-id="${l.id}"]`, book);
      if (card) card.classList.remove('unseen', 'arrive');
    }
  }

  function showPhoto(i) {
    const photos = open.photos, p = photos[i], token = ++lbToken;
    const opening = lightbox.hidden;
    photoAt = i;
    lightbox.hidden = false;
    document.body.classList.add('noscroll');
    $('#lb-count').textContent = photos.length > 1 ? `${i + 1} / ${photos.length}` : '';
    $('#lb-prev').hidden = $('#lb-next').hidden = photos.length < 2;
    lbImg.alt = `Photo ${i + 1} of ${photos.length}`;
    // show the small version straight away, then swap in the full one
    let sharp = false;
    photoUrl(p.thumb).then((url) => { if (token === lbToken && !sharp) lbImg.src = url; }).catch(() => {});
    photoUrl(p.full).then((url) => { if (token === lbToken) { sharp = true; lbImg.src = url; } }).catch(() => {});
    if (photos.length > 1) photoUrl(photos[(i + 1) % photos.length].full).catch(() => {});
    if (opening) $('#lb-close').focus();
  }

  function hidePhoto() {
    if (lightbox.hidden) return;
    lbToken++;
    photoAt = -1;
    lightbox.hidden = true;
    lbImg.removeAttribute('src');
    document.body.classList.remove('noscroll');
  }

  function stepPhoto(dir) {
    if (!open || photoAt < 0 || open.photos.length < 2) return;
    const n = open.photos.length, i = (photoAt + dir + n) % n;
    history.replaceState(history.state, '', `#/${open.id}/${i + 1}`);
    route();
  }
  const closePhoto = () => goBack(`#/${open.id}`);

  document.addEventListener('click', (ev) => {
    const link = ev.target.closest('a[href^="#/"]');
    if (link) {
      ev.preventDefault();
      if (link.classList.contains('step')) {
        history.replaceState(history.state, '', link.getAttribute('href'));
        return route();
      }
      return push(link.getAttribute('href'));
    }
    if (ev.target.closest('.back')) return goBack();
    if (ev.target.closest('#lb-prev')) return stepPhoto(-1);
    if (ev.target.closest('#lb-next')) return stepPhoto(1);
    if (ev.target.closest('#lb-close') || ev.target === lightbox) return closePhoto();
  });

  document.addEventListener('keydown', (ev) => {
    if (!lightbox.hidden) {
      if (ev.key === 'ArrowLeft') stepPhoto(-1);
      else if (ev.key === 'ArrowRight') stepPhoto(1);
      else if (ev.key === 'Escape') closePhoto();
    } else if (open && ev.key === 'Escape') {
      goBack();
    }
  });

  let touch = null;
  lightbox.addEventListener('touchstart', (ev) => { touch = ev.touches.length === 1 ? ev.touches[0] : null; }, { passive: true });
  lightbox.addEventListener('touchend', (ev) => {
    if (!touch) return;
    const dx = ev.changedTouches[0].clientX - touch.clientX, dy = ev.changedTouches[0].clientY - touch.clientY;
    touch = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) stepPhoto(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closePhoto();
  }, { passive: true });

  window.addEventListener('popstate', route);

  // ---------- go ----------
  function enter() {
    if (M.preview && params.has('now')) {
      const t = Date.parse(params.get('now'));
      if (!Number.isNaN(t)) skew = t - Date.now();
    }
    if (M.preview) {
      const badge = $('#preview-badge');
      badge.hidden = false;
      badge.textContent = unlockAll() ? 'Preview · every letter unlocked' : 'Preview · pretending it is ' + new Date(now()).toLocaleString();
    }
    $('#her').textContent = M.her;
    $('#me').textContent = M.me;
    gate.hidden = true;
    app.hidden = false;
    renderBook();
    target = nextUnlock();
    paintCountdown();
    route();
    setInterval(tick, 1000);
    // pick up a letter that was published while the page sat open
    setInterval(() => arrive(), 10 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) arrive(); });
  }

  start();
})();
