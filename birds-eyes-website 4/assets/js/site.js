(function () {
  'use strict';

  /* ==================================================================
     Settings
     ================================================================== */
  var CFG = {
    zoneRadius: 350,          // metres: how close an address has to be to the area data to count as covered
    searchRadius: 600,        // backup only: metres searched around an address if the area data can't load
    areaLayers: [
      'https://services2.arcgis.com/JkPEgZJGxhSjYOo0/ArcGIS/rest/services/BusService/FeatureServer/0/query',
      'https://services2.arcgis.com/JkPEgZJGxhSjYOo0/ArcGIS/rest/services/TrainService/FeatureServer/0/query'
    ],
    photon: 'https://photon.komoot.io',
    nominatim: 'https://nominatim.openstreetmap.org',
    overpass: [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    ],
    cacheKey: 'birdseye:area:v3',
    cacheDays: 7,
    aucklandBox: { s: -37.45, w: 174.15, n: -35.85, e: 175.6 },
    searchCentre: [-36.88, 174.76],
    // Estimate settings: start point, minutes = base + perKm x distance, then price per block of minutes.
    travel: { from: [-36.8797, 174.6316], baseMinutes: 10, perKm: 3, blockMinutes: 20, blockPrice: 10 }
  };


  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function money(amount) {
    return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(amount);
  }
  function icon(id) { return '<svg aria-hidden="true"><use href="#' + id + '"></use></svg>'; }

  /* ==================================================================
     Header, menu and year
     ================================================================== */
  var header = $('[data-header]');
  var hero = $('.hero');
  var drawer = $('#drawer');
  var menuBtn = $('[data-menu]');

  function syncHeader() {
    header.classList.toggle('is-solid', window.scrollY > 24);
  }
  var headerTicking = false;
  window.addEventListener('scroll', function () {
    if (headerTicking) return;
    headerTicking = true;
    requestAnimationFrame(function () { syncHeader(); headerTicking = false; });
  }, { passive: true });
  window.addEventListener('resize', syncHeader);
  syncHeader();

  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    drawer.hidden = !open;
    header.classList.toggle('menu-open', open);
    document.body.classList.toggle('no-scroll', open);
  }
  menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
  drawer.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !drawer.hidden) { setMenu(false); menuBtn.focus(); }
  });
  window.matchMedia('(min-width: 941px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });

  var yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ==================================================================
     Hero video
     ================================================================== */
  var video = $('[data-hero-video]');
  var videoBtn = $('[data-video-toggle]');
  var videoLabel = $('[data-video-label]');
  var userPaused = false;

  function showVideoState(playing) {
    videoBtn.classList.toggle('is-paused', !playing);
    videoBtn.setAttribute('aria-pressed', String(!playing));
    videoLabel.textContent = playing ? 'Pause video' : 'Play video';
  }
  function playVideo() {
    var p = video.play();
    if (p && typeof p.catch === 'function') p.catch(function () { showVideoState(false); });
  }
  if (video) {
    var saveData = navigator.connection && navigator.connection.saveData;
    if (reduceMotion || saveData) {
      video.removeAttribute('autoplay');
      video.pause();
      userPaused = true;
    }
    video.addEventListener('play', function () { showVideoState(true); });
    video.addEventListener('pause', function () { showVideoState(false); });
    showVideoState(!video.paused);
    videoBtn.addEventListener('click', function () {
      if (video.paused) { userPaused = false; playVideo(); } else { userPaused = true; video.pause(); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (userPaused) return;
        if (entries[0].isIntersecting) playVideo(); else video.pause();
      }).observe(hero);
    }
  }

  /* ==================================================================
     Gallery and full-size viewer
     ================================================================== */
  var galleryEl = $('[data-gallery]');
  if (galleryEl) initGallery(galleryEl);
  function initGallery(gallery) {
  var tiles = $$('.tile', gallery);
  var filterBtns = $$('[data-filter]');
  var visibleTiles = tiles.slice();

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.filter;
      filterBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      visibleTiles = [];
      tiles.forEach(function (t) {
        var show = f === 'all' || t.dataset.cats.split(' ').indexOf(f) !== -1;
        t.hidden = !show;
        if (show) visibleTiles.push(t);
      });
      gallery.classList.toggle('is-filtered', f !== 'all');
    });
  });

  var viewer = $('#viewer');
  var vImg = $('[data-viewer-img]');
  var vCap = $('[data-viewer-caption]');
  var vCount = $('[data-viewer-count]');
  var vIndex = 0;
  var lastTileBtn = null;

  function viewerShow(i) {
    if (!visibleTiles.length) return;
    vIndex = (i + visibleTiles.length) % visibleTiles.length;
    var img = $('img', visibleTiles[vIndex]);
    var base = img.dataset.base;
    vImg.removeAttribute('srcset');
    vImg.src = base + '-1280.jpg';
    vImg.srcset = base + '-1280.jpg 1280w, ' + base + '-2048.jpg 2048w';
    vImg.sizes = '100vw';
    vImg.alt = img.alt;
    vCap.textContent = img.dataset.caption || img.alt;
    vCount.textContent = (vIndex + 1) + ' of ' + visibleTiles.length;
    [1, -1].forEach(function (d) {
      var n = $('img', visibleTiles[(vIndex + d + visibleTiles.length) % visibleTiles.length]);
      var pre = new Image(); pre.src = n.dataset.base + (window.innerWidth > 1300 ? '-2048.jpg' : '-1280.jpg');
    });
  }
  function viewerOpen(tile) {
    vIndex = Math.max(0, visibleTiles.indexOf(tile));
    viewerShow(vIndex);
    if (typeof viewer.showModal === 'function') viewer.showModal(); else viewer.setAttribute('open', '');
    document.body.classList.add('no-scroll');
    $('[data-viewer-next]').focus();
  }
  function viewerClose() {
    if (typeof viewer.close === 'function' && viewer.open) viewer.close(); else viewer.removeAttribute('open');
  }
  viewer.addEventListener('close', function () {
    document.body.classList.remove('no-scroll');
    if (lastTileBtn) lastTileBtn.focus();
  });
  gallery.addEventListener('click', function (e) {
    var b = e.target.closest('.tile__btn');
    if (!b) return;
    lastTileBtn = b;
    viewerOpen(b.closest('.tile'));
  });
  $('[data-viewer-prev]').addEventListener('click', function () { viewerShow(vIndex - 1); });
  $('[data-viewer-next]').addEventListener('click', function () { viewerShow(vIndex + 1); });
  $('[data-viewer-close]').addEventListener('click', viewerClose);
  viewer.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); viewerShow(vIndex + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); viewerShow(vIndex - 1); }
    if (e.key === 'Escape' && !viewer.showModal) viewerClose();
  });
  var frame = $('[data-viewer-frame]');
  frame.addEventListener('click', function (e) { if (e.target === frame) viewerClose(); });
  var swipeX = null;
  frame.addEventListener('pointerdown', function (e) { swipeX = e.clientX; });
  frame.addEventListener('pointerup', function (e) {
    if (swipeX === null) return;
    var dx = e.clientX - swipeX; swipeX = null;
    if (Math.abs(dx) > 50) viewerShow(vIndex + (dx < 0 ? 1 : -1));
  });
  // Opened from a photo on the home page (gallery.html#slug): show that photo straight away.
  var wanted = window.location.hash.slice(1);
  if (wanted) {
    var hit = tiles.filter(function (t) { var i = $('img', t); return i && i.dataset.base.split('/').pop() === wanted; })[0];
    if (hit) { lastTileBtn = $('.tile__btn', hit); viewerOpen(hit); }
  }
  }

  /* ==================================================================
     Geography helpers
     ================================================================== */
  function metresBetween(lat1, lon1, lat2, lon2) {
    var R = 6371000, toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  // Waiheke and nearby gulf islands: reached by ferry, so they don't count.
  var WAIHEKE = [[174.945, -36.80], [174.95, -36.76], [175.05, -36.735], [175.215, -36.76], [175.215, -36.82], [175.13, -36.865], [175.04, -36.86], [174.98, -36.83]];
  function inPolygon(lon, lat, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function onIsland(lat, lon) {
    if (inPolygon(lon, lat, WAIHEKE)) return true;
    if (lon > 175.22 && lat > -36.5) return true;          // Aotea Great Barrier and the outer gulf
    if (lon > 174.76 && lon < 174.92 && lat > -36.47 && lat < -36.37) return true; // Kawau
    return false;
  }
  function inAucklandBox(lat, lon) {
    var b = CFG.aucklandBox;
    return lat > b.s && lat < b.n && lon > b.w && lon < b.e;
  }

  /* ==================================================================
     Network helpers
     ================================================================== */
  function getJSON(url, ms, opts) {
    opts = opts || {};
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms || 12000);
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else opts.signal.addEventListener('abort', function () { ctrl.abort(); }, { once: true });
    }
    var init = { method: opts.method || 'GET', signal: ctrl.signal };
    if (opts.body) init.body = opts.body;
    return fetch(url, init).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).finally(function () { clearTimeout(timer); });
  }
  function overpass(query, ms) {
    var urls = CFG.overpass.slice();
    function attempt() {
      var url = urls.shift();
      if (!url) return Promise.reject(new Error('No stop data service responded'));
      return getJSON(url, ms, { method: 'POST', body: new URLSearchParams({ data: query }) })
        .catch(function () { return attempt(); });
    }
    return attempt();
  }
  var nominatimAt = 0;
  function nominatim(path) {
    var wait = Math.max(0, nominatimAt + 1100 - Date.now());   // their limit: one request a second
    nominatimAt = Date.now() + wait;
    return sleep(wait).then(function () { return getJSON(CFG.nominatim + path, 12000); });
  }

  /* ==================================================================
     Addresses
     ================================================================== */
  function placeFromPhoton(f) {
    var p = f.properties || {};
    var c = f.geometry.coordinates;
    var street = p.street || '';
    var primary = p.housenumber && street ? p.housenumber + ' ' + street : (p.name || street || '');
    var suburb = p.district || p.locality || p.suburb || '';
    var city = p.city || p.county || '';
    if (!suburb) suburb = city;
    return finishPlace({ lat: c[1], lon: c[0], primary: primary, suburb: suburb, city: city,
      state: p.state || '', countrycode: (p.countrycode || '').toUpperCase() });
  }
  function placeFromNominatim(r) {
    var a = r.address || {};
    var road = a.road || a.pedestrian || a.footway || a.residential || a.path || '';
    var primary = a.house_number && road ? a.house_number + ' ' + road : (road || r.name || String(r.display_name || '').split(',')[0]);
    var suburb = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.village || a.town || a.hamlet || '';
    var city = a.city || a.town || a.county || '';
    if (!suburb) suburb = city;
    return finishPlace({ lat: +r.lat, lon: +r.lon, primary: primary, suburb: suburb, city: city,
      state: a.state || a.region || '', countrycode: (a.country_code || '').toUpperCase() });
  }
  function finishPlace(p) {
    var parts = [p.primary];
    if (p.suburb && p.suburb !== p.primary) parts.push(p.suburb);
    if (p.city && p.city !== p.suburb && p.city !== p.primary) parts.push(p.city);
    p.label = parts.filter(Boolean).join(', ');
    p.secondary = parts.slice(1).filter(Boolean).join(', ');
    return p;
  }
  var geo = {
    suggest: function (q, signal) {
      var b = CFG.aucklandBox;
      var params = new URLSearchParams({ q: q, limit: '7', lat: String(CFG.searchCentre[0]), lon: String(CFG.searchCentre[1]), bbox: [b.w, b.s, b.e, b.n].join(',') });
      return getJSON(CFG.photon + '/api/?' + params.toString(), 8000, { signal: signal }).then(function (j) {
        var seen = {};
        return (j.features || []).map(placeFromPhoton).filter(function (p) {
          if (p.countrycode && p.countrycode !== 'NZ') return false;
          if (!p.primary || seen[p.label]) return false;
          seen[p.label] = true;
          return true;
        }).slice(0, 5);
      });
    },
    search: function (q) {
      return geo.suggest(q).then(function (list) { return list[0] || null; }, function () { return undefined; })
        .then(function (found) {
          if (found) return found;
          var params = new URLSearchParams({ q: q, format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'nz', viewbox: '174.15,-35.85,175.6,-37.45' });
          return nominatim('/search?' + params.toString()).then(function (j) {
            return Array.isArray(j) && j.length ? placeFromNominatim(j[0]) : null;
          }, function (err) {
            if (found === null) return null;   // the first service answered "nothing found"
            throw err;
          });
        });
    }
  };

  /* ==================================================================
     Service area check: an address counts as covered when it is within
     CFG.zoneRadius metres of a point in the area data.
     ================================================================== */
  var STOP_FILTERS = [
    '["highway"="bus_stop"]["disused"!="yes"]',
    '["public_transport"="platform"]["bus"="yes"]',
    '["railway"~"^(station|halt)$"]',
    '["public_transport"="station"]["train"="yes"]'
  ];
  function stopKind(t) {
    if (!t) return null;
    if (t.disused === 'yes' || t.abandoned === 'yes' || t['disused:highway'] || t.usage === 'tourism' ||
        t['railway:preserved'] === 'yes' || t.historic || t.tourism) return null;
    var rail = /^(station|halt)$/.test(t.railway || '') || (t.train === 'yes' && !t.bus);
    if (rail && !/^(tram|light_rail|subway|funicular|monorail)$/.test(t.station || '')) return 'train';
    if (t.highway === 'bus_stop' || t.bus === 'yes') return 'bus';
    return null;
  }
  var regionStops = null;   // rows of [lat, lon, 0 bus | 1 train, name]
  function stopsNear(lat, lon) {
    var a = '(around:' + CFG.searchRadius + ',' + lat.toFixed(6) + ',' + lon.toFixed(6) + ')';
    var q = '[out:json][timeout:25];(' + STOP_FILTERS.map(function (f) { return 'node' + f + a + ';'; }).join('') + ');out body qt;';
    return overpass(q, 16000).then(function (data) {
      var out = [];
      (data.elements || []).forEach(function (el) {
        var kind = stopKind(el.tags);
        if (!kind || el.lat == null || onIsland(el.lat, el.lon)) return;
        out.push([el.lat, el.lon, kind === 'train' ? 1 : 0, (el.tags && el.tags.name) || '']);
      });
      return out;
    });
  }
  function nearestStop(lat, lon, stops) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i];
      if (Math.abs(s[0] - lat) > 0.03 || Math.abs(s[1] - lon) > 0.04) continue;
      var d = metresBetween(lat, lon, s[0], s[1]);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best ? { d: bestD, kind: best[2] === 1 ? 'train' : 'bus', name: best[3] || '' } : null;
  }
  function checkPlace(place) {
    var base = { place: place };
    var auckland = place.state ? /auckland/i.test(place.state) : inAucklandBox(place.lat, place.lon);
    if (place.countrycode && place.countrycode !== 'NZ') auckland = false;
    if (!auckland) return Promise.resolve(Object.assign(base, { status: 'no', reason: 'region' }));
    var text = (place.label + ' ' + place.suburb + ' ' + place.city).toLowerCase();
    if (onIsland(place.lat, place.lon) || /waiheke|great barrier|aotea|kawau|rakino|motutapu|rangitoto/.test(text)) {
      return Promise.resolve(Object.assign(base, { status: 'no', reason: 'island' }));
    }
    var stops = loadArea().catch(function () { return stopsNear(place.lat, place.lon); });
    return stops.then(function (list) {
      var near = nearestStop(place.lat, place.lon, list);
      var inside = !!near && near.d <= CFG.zoneRadius;
      return Object.assign(base, { status: inside ? 'yes' : 'no', reason: inside ? '' : 'far', nearest: near });
    }).catch(function () {
      return Object.assign(base, { status: 'error', reason: 'area' });
    });
  }
  function mapLink(p) {
    if (!p || p.lat == null) return '';
    var la = p.lat.toFixed(5), lo = p.lon.toFixed(5);
    return 'https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=18/' + la + '/' + lo;
  }
  // What customers see: just in or out.
  function areaWords(res) {
    if (res && res.status === 'yes') return 'In the service area';
    if (res && res.status === 'no') return 'Outside the service area';
    return 'Not checked';
  }
  // The extra detail only goes into the request email.
  function coverageSummary(res) {
    if (!res) return 'Not checked';
    var n = res.nearest, near = '';
    if (n) near = ' (nearest stop about ' + Math.max(10, Math.round(n.d / 10) * 10) + ' m away' + (n.name ? ': ' + n.name : '') + ')';
    if (res.status === 'yes') return 'In service area' + near;
    if (res.status === 'no') {
      if (res.reason === 'region') return 'Outside service area (outside Auckland)';
      if (res.reason === 'island') return 'Outside service area (island)';
      return 'Outside service area' + (near || ' (no stop nearby)');
    }
    if (res.status === 'notfound') return 'Not checked (address not found)';
    return 'Not checked (map services unavailable)';
  }

  /* ==================================================================
     Address suggestions (combobox)
     ================================================================== */
  function makeCombo(input, list, onPick) {
    var items = [], active = -1, timer = null, ctrl = null, cache = {};
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', list.id);
    function close() {
      list.hidden = true; active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function render() {
      if (!items.length) { close(); return; }
      list.innerHTML = items.map(function (p, i) {
        return '<li class="combo__opt" role="option" id="' + list.id + '-' + i + '" aria-selected="' + (i === active) + '">' +
          '<strong>' + esc(p.primary) + '</strong>' + (p.secondary ? '<span>' + esc(p.secondary) + '</span>' : '') + '</li>';
      }).join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', list.id + '-' + active);
      else input.removeAttribute('aria-activedescendant');
    }
    function pick(i) {
      var p = items[i];
      if (!p) return;
      input.value = p.primary;
      close();
      onPick(p);
    }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 3) { items = []; render(); return; }
      timer = setTimeout(function () {
        if (cache[q]) { items = cache[q]; active = -1; render(); return; }
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        geo.suggest(q, ctrl.signal).then(function (res) {
          cache[q] = res;
          if (input.value.trim() !== q) return;
          items = res; active = -1; render();
        }, function () { /* suggestions are a nice-to-have; the Check button still works */ });
      }, 280);
    });
    input.addEventListener('keydown', function (e) {
      if (list.hidden || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) {
      var li = e.target.closest('[role="option"]');
      if (li) pick(Number(li.id.split('-').pop()));
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    return { close: close };
  }


  /* The whole area, cached for a week */
  function readStopsCache() {
    try {
      var raw = localStorage.getItem(CFG.cacheKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || Date.now() - obj.t > CFG.cacheDays * 864e5) return null;
      return obj.s;
    } catch (e) { return null; }
  }
  function writeStopsCache(stops) {
    try { localStorage.setItem(CFG.cacheKey, JSON.stringify({ t: Date.now(), s: stops })); } catch (e) { /* storage full or blocked */ }
  }
  // One layer, paged 1000 at a time (the service's limit).
  function fetchAreaLayer(url) {
    var countUrl = url + '?' + new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' }).toString();
    return getJSON(countUrl, 15000).then(function (c) {
      if (!c || c.error || !c.count) throw new Error('No count');
      var pages = [];
      for (var off = 0; off < c.count; off += 1000) {
        pages.push(getJSON(url + '?' + new URLSearchParams({
          where: '1=1', outFields: 'OBJECTID', returnGeometry: 'true', outSR: '4326', geometryPrecision: '5',
          orderByFields: 'OBJECTID', resultOffset: String(off), resultRecordCount: '1000', f: 'json'
        }).toString(), 20000));
      }
      return Promise.all(pages);
    }).then(function (pages) {
      var out = [];
      pages.forEach(function (pg) {
        if (!pg || pg.error) throw new Error('Page failed');
        (pg.features || []).forEach(function (f) {
          var g = f.geometry;
          if (g && isFinite(g.x) && isFinite(g.y)) out.push([Math.round(g.y * 1e5) / 1e5, Math.round(g.x * 1e5) / 1e5]);
        });
      });
      return out;
    });
  }
  var areaPromise = null;
  function loadArea() {
    if (regionStops) return Promise.resolve(regionStops);
    if (areaPromise) return areaPromise;
    var cached = readStopsCache();
    var p = cached ? Promise.resolve(cached) :
      Promise.all(CFG.areaLayers.map(fetchAreaLayer)).then(function (layers) {
        var stops = [];
        layers.forEach(function (list, k) {
          list.forEach(function (pt) { if (!onIsland(pt[0], pt[1])) stops.push([pt[0], pt[1], k]); });
        });
        if (stops.length < 1000) throw new Error('Too few stops came back');
        writeStopsCache(stops);
        return stops;
      });
    areaPromise = p.then(function (stops) {
      regionStops = stops;
      return stops;
    }, function (err) {
      areaPromise = null;   // let the next check try again
      throw err;
    });
    return areaPromise;
  }

  /* ==================================================================
     FAQ: open a question linked to directly (faq.html#question-id)
     ================================================================== */
  var linkedQ = window.location.hash.length > 1 ? document.getElementById(window.location.hash.slice(1)) : null;
  if (linkedQ && linkedQ.tagName === 'DETAILS') linkedQ.open = true;

  /* ==================================================================
     Quote form (quote.html)
     ================================================================== */
  var quoteForm = $('#quote-form');
  if (quoteForm) initQuote(quoteForm);

  function initQuote(form) {
    form.noValidate = true;   // the script shows its own messages; without it, the browser's checks still apply
    var serviceInputs = $$('input[name="service"]', form);
    var mainAddress = $('#main-address');
    var locationInput = $('#location-input');
    var printEnabled = $('#print-enabled');
    var printFields = $('#print-fields');
    var printInputs = $$('input[name="print_size"], input[name="print_finish"]', form);
    var coverageField = $('#coverage-check');
    var mapLinkField = $('#map-link');
    var travelField = $('#travel-estimate');
    var totalField = $('#estimated-total');
    var formCheck = $('[data-form-check]');
    var estCheck = $('#est-check');
    var actionFeedback = $('#action-feedback');
    var formFeedback = $('[data-form-feedback]');
    var awayHint = $('[data-away-hint]');
    var flatHint = $('[data-apartment-hint]');
    var dateInput = $('#preferred-date');
    var customHint = $('[data-custom-hint]');
    var notesInput = $('#notes-input');
    var notesLabel = $('[data-notes-label]');
    var notesOptional = $('[data-notes-optional]');
    var SAVED_KEY = 'birdseye:lastRequest';
    var preparedRequestText = '';
    var formResult = null;     // last area check
    var formPlace = null;      // the located address
    var lookupFailed = false;  // the address couldn't be found or checked
    var suburbAuto = false;

    function checkedInput(name) { return $('input[name="' + name + '"]:checked', form); }

    /* Pre-select a package when arriving from a "Get a quote" link (quote.html?service=...) */
    var startParams = new URLSearchParams(window.location.search);
    var wantService = (startParams.get('service') || '').replace(/[^a-z-]/g, '');
    if (wantService) {
      var pre = $('input[name="service"][value="' + wantService + '"]', form);
      if (pre) pre.checked = true;
    }

    /* Estimate */
    function travelFor(place) {
      if (!place || place.lat == null || place.lon == null) return null;
      // Outside Auckland or on an island: worked out by hand instead.
      if (formResult && formResult.status === 'no' && (formResult.reason === 'region' || formResult.reason === 'island')) return null;
      var t = CFG.travel;
      var km = metresBetween(t.from[0], t.from[1], place.lat, place.lon) / 1000;
      var minutes = Math.round(t.baseMinutes + t.perKm * km);
      return { minutes: minutes, amount: Math.floor(minutes / t.blockMinutes) * t.blockPrice };
    }
    function getQuoteBreakdown() {
      var service = checkedInput('service') || serviceInputs[0];
      var custom = !service.dataset.price;   // custom jobs have no set price: they're quoted by email
      var baseAmount = custom ? 0 : Number(service.dataset.price);
      var travel = travelFor(formPlace);
      var printAmount = 0, printText = 'Not included';
      if (printEnabled.checked) {
        var size = checkedInput('print_size'), finish = checkedInput('print_finish');
        printAmount = Number(size.dataset.add || 0) + Number(finish.dataset.add || 0);
        printText = size.value + ' ' + finish.value.toLowerCase() + ' (' + money(printAmount) + ', 1–2 weeks)';
      }
      var travelAmount = travel ? travel.amount : 0;
      return {
        custom: custom, serviceText: service.dataset.label, baseAmount: baseAmount, travel: travel, travelAmount: travelAmount,
        printAmount: printAmount, printText: printText, totalAmount: baseAmount + travelAmount + printAmount
      };
    }
    function travelWords(q) {
      if (q.travel) return q.travel.amount ? money(q.travel.amount) : 'No charge';
      if (lookupFailed || (formResult && formResult.status === 'no')) return 'Confirmed by email';
      return mainAddress.value.trim() ? 'Needs the address checked' : 'Add the address';
    }
    function updateEstimate() {
      var q = getQuoteBreakdown();
      $('#est-service-label').textContent = q.serviceText;
      $('#est-base-price').textContent = q.custom ? 'Quoted by email' : money(q.baseAmount);
      $('#est-travel-price').textContent = travelWords(q);
      if (printEnabled.checked) {
        var size = checkedInput('print_size'), finish = checkedInput('print_finish');
        $('#est-print-price').textContent = size.value + ' ' + finish.value.toLowerCase() + ', ' + money(q.printAmount);
      } else {
        $('#est-print-price').textContent = 'Not included';
      }
      var totalEl = $('#est-total-price'), miniEl = $('[data-mini-total]');
      totalEl.textContent = q.custom ? 'Quoted by email' : money(q.totalAmount);
      miniEl.textContent = q.custom ? 'Custom quote' : money(q.totalAmount);
      totalEl.classList.toggle('is-text', q.custom);
      miniEl.classList.toggle('is-text', q.custom);
      $('.estimate__total small').hidden = q.custom;
      // for the email only
      travelField.value = q.travel ? money(q.travel.amount) + ' (about ' + q.travel.minutes + ' min one way)' :
        (formResult && formResult.status === 'no' ? 'Not worked out (outside the service area)' : 'Not worked out (address not located)');
      totalField.value = q.custom ? 'Custom quote (package priced by email)' : money(q.totalAmount) + ' NZD (estimate)';
    }

    /* Hints that depend on choices */
    function syncHints() {
      var onSite = checkedInput('on_site');
      awayHint.hidden = !(onSite && onSite.value === 'Go ahead without the client');
      var type = checkedInput('property_type');
      flatHint.hidden = !(type && type.value === 'Apartment or unit');
    }

    /* Custom jobs: say how they're priced; "Something else" needs a description */
    function syncService() {
      var s = checkedInput('service');
      var custom = !!s && !s.dataset.price;
      var other = !!s && s.value === 'something-else';
      customHint.hidden = !custom;
      notesInput.required = other;
      notesLabel.textContent = other ? 'Describe the job' : 'Anything else to mention?';
      notesOptional.hidden = other;
      if (!other) notesInput.classList.remove('is-invalid');
    }

    /* Prints */
    function syncPrint() {
      printFields.hidden = !printEnabled.checked;
      printInputs.forEach(function (i) { i.disabled = !printEnabled.checked; });
      updateEstimate();
    }
    printEnabled.addEventListener('change', syncPrint);
    form.addEventListener('change', function (e) {
      var n = e.target.name;
      if (n === 'service') syncService();
      if (n === 'service' || n === 'print_size' || n === 'print_finish') updateEstimate();
      if (n === 'on_site' || n === 'property_type') syncHints();
    });

    dateInput.min = new Date().toLocaleDateString('en-CA');

    /* Service area check, right under the address */
    var checkBtn = '<button type="button" class="linkbtn" data-form-check-btn>Check it’s in the service area</button>';
    function setFormCheck(res) {
      formResult = res || null;
      coverageField.value = coverageSummary(res);
      mapLinkField.value = res && res.place ? mapLink(res.place) : '';
      var cls = 'addr-check', html;
      if (!res) {
        html = checkBtn;
        estCheck.textContent = 'Service area: not checked yet';
      } else if (res.status === 'yes') {
        cls += ' addr-check--yes';
        html = icon('i-check') + '<span>That address is in the service area.</span>';
        estCheck.textContent = 'Service area: this address is covered';
      } else if (res.status === 'no') {
        cls += ' addr-check--no';
        html = icon('i-cross') + '<span>That address is outside the service area.</span>';
        estCheck.textContent = 'Service area: this address is outside it';
      } else if (res.status === 'notfound') {
        cls += ' addr-check--error';
        html = icon('i-alert') + '<span>Couldn’t find that address. Try picking it from the list as you type.</span> ' + checkBtn;
        estCheck.textContent = 'Service area: not checked yet';
      } else {
        cls += ' addr-check--error';
        html = icon('i-alert') + '<span>Couldn’t check that right now.</span> ' + checkBtn;
        estCheck.textContent = 'Service area: not checked yet';
      }
      formCheck.className = cls;
      formCheck.innerHTML = html;
      updateEstimate();
    }
    function showChecking(msg) {
      formCheck.className = 'addr-check';
      formCheck.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>' + esc(msg) + '</span>';
    }
    var formToken = 0;
    function formCheckPlace(place) {
      var t = ++formToken;
      formPlace = place;
      lookupFailed = false;
      updateEstimate();
      showChecking('Checking the service area…');
      return checkPlace(place).then(function (res) {
        if (t === formToken) setFormCheck(res);
      });
    }
    function formCheckFromText() {
      var text = mainAddress.value.trim();
      if (!text) { mainAddress.focus(); return; }
      var q = locationInput.value.trim() ? text + ', ' + locationInput.value.trim() : text;
      showChecking('Finding the address…');
      var t = ++formToken;
      geo.search(q).then(function (place) {
        if (t !== formToken) return;
        if (!place) { lookupFailed = true; setFormCheck({ status: 'notfound' }); return; }
        if (!locationInput.value.trim() && place.suburb) { locationInput.value = place.suburb; suburbAuto = true; }
        formCheckPlace(place);
      }, function () {
        if (t !== formToken) return;
        lookupFailed = true;
        setFormCheck({ status: 'error' });
      });
    }
    formCheck.addEventListener('click', function (e) { if (e.target.closest('[data-form-check-btn]')) formCheckFromText(); });
    makeCombo(mainAddress, $('#main-address-list'), function (place) {
      if (place.suburb && (!locationInput.value.trim() || suburbAuto)) { locationInput.value = place.suburb; suburbAuto = true; }
      formCheckPlace(place);
    });
    mainAddress.addEventListener('focus', function () { loadArea().catch(function () { /* checked again later */ }); }, { once: true });
    mainAddress.addEventListener('input', function () {
      formToken++;   // drop any check still running for the old text
      lookupFailed = false;
      if (formResult || formPlace || formCheck.querySelector('.spinner')) { formPlace = null; setFormCheck(null); }
      else updateEstimate();
    });
    // Typed an address without picking a suggestion: check it once the field is left.
    mainAddress.addEventListener('change', function () {
      setTimeout(function () {
        if (formPlace || formCheck.querySelector('.spinner') || mainAddress.value.trim().length < 5) return;
        formCheckFromText();
      }, 250);
    });
    locationInput.addEventListener('input', function () { suburbAuto = false; });

    /* Summary text (emailed, copied or downloaded) */
    function buildSummaryText() {
      var q = getQuoteBreakdown();
      var val = function (id, fallback) { var v = document.getElementById(id).value.trim(); return v || fallback; };
      var time = checkedInput('preferred_time'), type = checkedInput('property_type'), onSite = checkedInput('on_site');
      var suburb = locationInput.value.trim();
      return [
        'BIRDS-EYES DRONE SERVICES — QUOTE REQUEST',
        '=========================================',
        'Name: ' + val('full-name', 'Not provided'),
        'Email: ' + val('email-addr', 'Not provided'),
        'Phone: ' + val('phone-number', 'Not provided'),
        '',
        'Package: ' + q.serviceText,
        'Property type: ' + (type ? type.value : 'Not given'),
        'Address: ' + val('main-address', 'Not given') + (suburb ? ', ' + suburb : ''),
        'Service area: ' + areaWords(formResult),
        mapLinkField.value ? 'Map: ' + mapLinkField.value : 'Map: not available',
        'Preferred date: ' + (dateInput.value || 'Flexible'),
        'Preferred time: ' + (time ? time.value : 'Flexible'),
        'On the day: ' + (onSite ? onSite.value : 'Not given'),
        '',
        'Package price: ' + (q.custom ? 'Custom quote, priced by email' : money(q.baseAmount)),
        'Travel: ' + travelWords(q),
        'Print: ' + q.printText,
        'ESTIMATED TOTAL: ' + (q.custom ? 'To be quoted by email' : money(q.totalAmount) + ' NZD'),
        q.custom ? 'This job is priced individually and confirmed by email.' : 'This is an estimate only. The final price is confirmed by email and may change.',
        '',
        'Notes: ' + val('notes-input', 'None')
      ].join('\n');
    }
    function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; });
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return Promise.resolve(ok);
    }
    function downloadText(text) {
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'birds-eyes-quote-request.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
    $('[data-copy-summary]').addEventListener('click', function () {
      copyText(preparedRequestText || buildSummaryText()).then(function (ok) {
        actionFeedback.textContent = ok ? 'Summary copied.' : 'Your browser blocked copying. Use Download summary instead.';
      }, function () { actionFeedback.textContent = 'Your browser blocked copying. Use Download summary instead.'; });
    });
    $('[data-download-summary]').addEventListener('click', function () {
      downloadText(preparedRequestText || buildSummaryText());
      actionFeedback.textContent = 'Summary downloaded.';
    });

    /* Validation and sending */
    function fieldLabel(input) {
      var l = input.id ? $('label[for="' + input.id + '"]') : null;
      return l ? l.childNodes[0].textContent.trim() : 'a required field';
    }
    form.addEventListener('submit', function (e) {
      formFeedback.textContent = '';
      $$('.is-invalid', form).forEach(function (i) { i.classList.remove('is-invalid'); });
      var invalid = $$('input, textarea', form).filter(function (i) { return !i.disabled && i.willValidate && !i.checkValidity(); });
      if (invalid.length) {
        e.preventDefault();
        invalid.forEach(function (i) { i.classList.add('is-invalid'); });
        var first = invalid[0];
        var problem = first.dataset.missing ||
          (first.type === 'email' && first.value ? 'Check the email address.' : 'Please fill in ' + fieldLabel(first).toLowerCase() + '.');
        formFeedback.textContent = problem;
        first.focus();
        return;
      }
      var honeypot = $('#company-website');
      if (honeypot && honeypot.value.trim()) { e.preventDefault(); return; }

      updateEstimate();
      preparedRequestText = buildSummaryText();
      $('#form-summary').value = preparedRequestText;
      $('#form-subject').value = 'New Birds-Eyes quote request — ' + $('#full-name').value.trim();
      var returnUrl = new URL(window.location.href);
      returnUrl.search = '?quote=sent';
      returnUrl.hash = '';
      $('#form-next').value = returnUrl.toString();
      try { sessionStorage.setItem(SAVED_KEY, preparedRequestText); } catch (err) { /* private mode */ }
      var submit = $('[data-submit]');
      submit.textContent = 'Sending…';
      submit.setAttribute('aria-disabled', 'true');
      // No preventDefault: the browser posts the named fields straight to FormSubmit, as before.
    });
    form.addEventListener('input', function (e) {
      if (e.target.classList.contains('is-invalid') && e.target.checkValidity()) e.target.classList.remove('is-invalid');
      if (formFeedback.textContent && !$('.is-invalid', form)) formFeedback.textContent = '';
    });

    /* Back from FormSubmit */
    var success = $('#quote-success');
    if (startParams.get('quote') === 'sent') {
      success.hidden = false;
      var saved = null;
      try { saved = sessionStorage.getItem(SAVED_KEY); } catch (err) { saved = null; }
      var dl = $('[data-download-saved]');
      if (saved) {
        dl.hidden = false;
        dl.addEventListener('click', function () { downloadText(saved); });
      }
      startParams.delete('quote');
      window.history.replaceState({}, document.title, window.location.pathname + (startParams.toString() ? '?' + startParams.toString() : ''));
      setTimeout(function () {
        success.scrollIntoView({ behavior: 'auto', block: 'center' });
        success.focus({ preventScroll: true });
      }, 60);
    }
    $('[data-dismiss-success]').addEventListener('click', function () {
      success.hidden = true;
      try { sessionStorage.removeItem(SAVED_KEY); } catch (err) { /* ignore */ }
      form.reset();
      formPlace = null; lookupFailed = false; suburbAuto = false;
      setFormCheck(null);
      syncService(); syncPrint(); syncHints();
      $('[data-submit]').textContent = 'Send quote request';
      $('[data-submit]').removeAttribute('aria-disabled');
      form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) { $('[data-submit]').textContent = 'Send quote request'; $('[data-submit]').removeAttribute('aria-disabled'); }
    });

    syncService();
    syncPrint();
    syncHints();
    setFormCheck(null);
  }
})();
