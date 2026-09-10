/* ==========================================================================
   CARBONIX — interaction engine v2
   --------------------------------------------------------------------------
   Vanilla JS that progressively enhances with GSAP / ScrollTrigger / Lenis.
   Three hard rules:
     1. The site must be fully usable with zero JavaScript.
     2. No animation may ever trap the user (the transition curtain always lifts).
     3. Nothing may depend on a CDN being reachable.
   ========================================================================== */
(function () {
  'use strict';

  var W = window, D = document;
  var reduced = W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = W.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var isFile = W.location.protocol === 'file:';
  var rtl = D.documentElement.dir === 'rtl';

  var hasGSAP = function () { return typeof W.gsap !== 'undefined'; };
  var hasST = function () { return hasGSAP() && typeof W.ScrollTrigger !== 'undefined'; };
  var $ = function (s, c) { return (c || D).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || D).querySelectorAll(s)); };

  var lenis = null;

  /* Observers created by the per-page modules. A soft navigation replaces
     #page, so every observer made on the previous page is watching nodes that
     no longer exist — they are dropped here the same way ScrollTrigger's are.
     Use this instead of `new IntersectionObserver` inside anything boot()
     re-runs. */
  var pageObservers = [];
  function observer(cb, opts) {
    if (!('IntersectionObserver' in W)) return null;
    var io = new IntersectionObserver(cb, opts);
    pageObservers.push(io);
    return io;
  }
  function dropObservers() {
    pageObservers.forEach(function (io) { io.disconnect(); });
    pageObservers = [];
  }

  /* --------------------------------------------------------------------
     1. Preloader — full bar on first visit, quick fade afterwards
     -------------------------------------------------------------------- */
  function preloader(done) {
    var el = $('.preloader');
    if (!el) { done(); return; }

    var removed = false;
    function remove() {
      if (removed) return;
      removed = true;
      if (el.parentNode) el.parentNode.removeChild(el);
      D.body.classList.remove('is-loading');
      done();
    }

    if (reduced) { revealAboveFold(); remove(); return; }

    var seen = false;
    try { seen = W.sessionStorage.getItem('cx_seen') === '1'; } catch (e) {}

    if (seen) {
      // Returning within the session: no theatre, just a short fade.
      revealAboveFold();
      el.style.transition = 'opacity .32s ease';
      el.style.opacity = '0';
      setTimeout(remove, 340);
      return;
    }

    var bar = $('.preloader-bar i', el);
    var pct = $('.preloader-pct', el);
    var v = 0, raf = null, finished = false;

    var imgs = $$('img');
    var total = Math.max(imgs.length, 1), loaded = 0;
    imgs.forEach(function (im) {
      if (im.complete) { loaded++; return; }
      im.addEventListener('load', function () { loaded++; }, { once: true });
      im.addEventListener('error', function () { loaded++; }, { once: true });
    });

    var t0 = performance.now();

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      if (bar) bar.style.width = '100%';
      if (pct) pct.textContent = '100%';
      try { W.sessionStorage.setItem('cx_seen', '1'); } catch (e) {}
      revealAboveFold();
      el.classList.add('is-done');
      if (hasGSAP()) {
        W.gsap.to(el, { clipPath: 'inset(0 0 100% 0)', duration: .62, ease: 'expo.inOut', onComplete: remove });
      } else {
        el.style.transition = 'opacity .4s ease';
        el.style.opacity = '0';
        setTimeout(remove, 420);
      }
      // The curtain lift is the only thing standing between the visitor and a
      // booted page — remove() is what calls done(), which is what calls boot().
      // GSAP drives that tween off requestAnimationFrame, and rAF does not run
      // in a hidden or throttled tab, so a link opened in a background tab
      // would otherwise sit at 96% forever: no reveals, no menu, no forms.
      // A wall-clock backstop is immune to that. remove() is idempotent.
      setTimeout(remove, 1000);
    }

    function tick(now) {
      var byImg = loaded / total;
      var byTime = Math.min((now - t0) / 520, 1);
      var target = Math.max(byImg, byTime) * 100;
      v += (target - v) * .2;
      if (bar) bar.style.width = v.toFixed(1) + '%';
      if (pct) pct.textContent = Math.round(v) + '%';
      if (v >= 96 && target >= 99.9 && now - t0 > 380) { finish(); return; }
      raf = requestAnimationFrame(tick);
    }

    // Hard safety net: never hold the page hostage.
    setTimeout(finish, 3200);
    raf = requestAnimationFrame(tick);
  }

  /* --------------------------------------------------------------------
     2. Smooth scroll + progress bar
     -------------------------------------------------------------------- */
  function smoothScroll() {
    if (reduced || typeof W.Lenis === 'undefined') return;
    try {
      lenis = new W.Lenis({
        duration: 1.05,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true, touchMultiplier: 1.6
      });
    } catch (e) { lenis = null; return; }

    if (hasST()) {
      lenis.on('scroll', W.ScrollTrigger.update);
      W.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      W.gsap.ticker.lagSmoothing(0);
    } else {
      var loop = function (t) { lenis.raf(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    W.__lenis = lenis;
  }

  function scrollTo(target, offset) {
    if (lenis) { lenis.scrollTo(target, { offset: offset || 0 }); return; }
    if (typeof target === 'number') { W.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' }); return; }
    var y = target.getBoundingClientRect().top + W.scrollY + (offset || 0);
    W.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }

  function scrollProgress() {
    var bar = $('.progress');
    if (!bar) return;
    var upd = function () {
      var h = D.documentElement.scrollHeight - W.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? (W.scrollY / h).toFixed(4) : 0) + ')';
    };
    W.addEventListener('scroll', upd, { passive: true });
    W.addEventListener('resize', upd);
    upd();
  }

  /* --------------------------------------------------------------------
     3. Cursor + magnetic hover
     -------------------------------------------------------------------- */
  function cursor() {
    if (!fine || reduced) return;
    var dot = $('.cursor'), ring = $('.cursor-ring');
    if (!dot || !ring) return;
    D.body.classList.add('has-cursor');

    var mx = W.innerWidth / 2, my = W.innerHeight / 2;
    var rx = mx, ry = my, dx = mx, dy = my, first = true;

    W.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (first) { rx = dx = mx; ry = dy = my; first = false; D.body.classList.add('cursor-ready'); }
    }, { passive: true });

    (function loop() {
      dx += (mx - dx) * .58; dy += (my - dy) * .58;
      rx += (mx - rx) * .16; ry += (my - ry) * .16;
      dot.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) translate(-50%,-50%)';
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();

    var sel = 'a, button, [data-cursor], input, select, textarea, .filter-btn, .acc-head, .tab-btn, .card';
    D.addEventListener('mouseover', function (e) {
      var t = e.target.closest && e.target.closest(sel);
      if (!t) return;
      ring.classList.add('is-hover');
      var labelled = t.closest('[data-cursor]');
      var label = labelled && labelled.getAttribute('data-cursor');
      if (label) { ring.classList.add('is-label'); ring.textContent = label; }
    });
    D.addEventListener('mouseout', function (e) {
      var t = e.target.closest && e.target.closest(sel);
      if (!t) return;
      // mouseout also fires when the pointer crosses between two children of
      // the same card, which used to drop the ring mid-hover. Only let go once
      // the pointer has actually left the hovered element.
      if (e.relatedTarget && t.contains(e.relatedTarget)) return;
      ring.classList.remove('is-hover', 'is-label');
      ring.textContent = '';
    });
    D.addEventListener('mouseleave', function () { D.body.classList.remove('cursor-ready'); });
    D.addEventListener('mouseenter', function () { D.body.classList.add('cursor-ready'); });
  }

  function magnetic() {
    if (!fine || reduced) return;
    $$('[data-magnetic]').forEach(function (el) {
      if (el.dataset.magBound) return;
      el.dataset.magBound = '1';
      var str = parseFloat(el.getAttribute('data-magnetic')) || .28;
      var raf, tx = 0, ty = 0, cx = 0, cy = 0, active = false;
      function anim() {
        cx += (tx - cx) * .18; cy += (ty - cy) * .18;
        el.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
        if (active || Math.abs(cx) > .1 || Math.abs(cy) > .1) raf = requestAnimationFrame(anim);
        else el.style.transform = '';
      }
      el.addEventListener('mouseenter', function () { active = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(anim); });
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        tx = (e.clientX - (r.left + r.width / 2)) * str;
        ty = (e.clientY - (r.top + r.height / 2)) * str;
      });
      el.addEventListener('mouseleave', function () { active = false; tx = 0; ty = 0; });
    });
  }

  /* --------------------------------------------------------------------
     4. Reveals, hero intro, split headings, parallax, counters
     -------------------------------------------------------------------- */
  /* Everything already inside the first screen is revealed as soon as the
     preloader starts lifting, not when a scroll trigger fires. Without this
     the largest element on the page — usually the h1 or the lead paragraph —
     is still at opacity 0 when the curtain clears, which pushes Largest
     Contentful Paint out to ~2.4s on every inner page for an animation the
     curtain was hiding anyway. */
  function revealAboveFold() {
    var vh = W.innerHeight || 800;
    $$('.rv, .mask-img').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add('rv-in');
    });
  }

  function reveals() {
    var items = $$('.rv, .mask-img').filter(function (el) { return !el.classList.contains('rv-in'); });
    if (reduced) { items.forEach(function (el) { el.classList.add('rv-in'); }); return; }

    if (hasST()) {
      items.forEach(function (el) {
        W.ScrollTrigger.create({
          trigger: el, start: 'top 90%', once: true,
          onEnter: function () { el.classList.add('rv-in'); }
        });
      });
    } else if ('IntersectionObserver' in W) {
      var io = observer(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -10% 0px' });
      items.forEach(function (el) { io.observe(el); });
    } else {
      items.forEach(function (el) { el.classList.add('rv-in'); });
    }
  }

  function heroIntro() {
    var lines = $$('[data-hero-line] > span');
    var fades = $$('[data-hero-fade]');
    if (reduced || !hasGSAP()) {
      lines.forEach(function (l) { l.style.transform = 'none'; });
      fades.forEach(function (f) { f.style.opacity = 1; f.style.transform = 'none'; });
      return;
    }
    var tl = W.gsap.timeline({ defaults: { ease: 'expo.out' } });
    if (lines.length) {
      W.gsap.set(lines, { yPercent: 112 });
      tl.to(lines, { yPercent: 0, duration: 1.25, stagger: .085 }, .05);
    }
    if (fades.length) {
      W.gsap.set(fades, { opacity: 0, y: 22 });
      tl.to(fades, { opacity: 1, y: 0, duration: 1, stagger: .09 }, .42);
    }
    var media = $('[data-hero-media]');
    if (media) W.gsap.fromTo(media, { scale: 1.14 }, { scale: 1, duration: 2.2, ease: 'expo.out' });
    // hero parallax on scroll
    if (hasST() && media) {
      W.gsap.to(media, {
        yPercent: 12, ease: 'none',
        scrollTrigger: { trigger: media.closest('.hero') || media, start: 'top top', end: 'bottom top', scrub: true }
      });
    }
  }

  function splitHeads() {
    if (reduced || !hasST()) return;
    $$('[data-split]').forEach(function (h) {
      if (h.dataset.splitDone) return;
      var words = h.textContent.trim().split(/\s+/);
      if (words.length > 26) { h.dataset.splitDone = '1'; return; }   // don't shred long paragraphs
      h.innerHTML = words.map(function (w) {
        return '<span class="sw" style="display:inline-block;overflow:hidden;vertical-align:top">' +
               '<span style="display:inline-block;will-change:transform">' + w + '</span></span>';
      }).join(' ');
      h.dataset.splitDone = '1';
      var inner = $$('.sw > span', h);
      W.gsap.set(inner, { yPercent: 108 });
      W.ScrollTrigger.create({
        trigger: h, start: 'top 88%', once: true,
        onEnter: function () { W.gsap.to(inner, { yPercent: 0, duration: 1.05, ease: 'expo.out', stagger: .033 }); }
      });
    });
  }

  function parallax() {
    if (reduced || !hasST()) return;
    $$('[data-parallax]').forEach(function (el) {
      if (el.dataset.pxBound) return;
      el.dataset.pxBound = '1';
      var amt = parseFloat(el.getAttribute('data-parallax')) || 12;
      W.gsap.fromTo(el, { yPercent: -amt / 2 }, {
        yPercent: amt / 2, ease: 'none',
        scrollTrigger: { trigger: el.parentElement || el, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });
  }


  /* Animated counters on the highlight strip. Only touches pure numbers,
     so "CO₂ + N₂" and Persian numerals are left exactly as authored. */
  function counters() {
    var els = $$('[data-count]');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in W)) {
      els.forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
      return;
    }
    var io = observer(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target;
        var raw = el.getAttribute('data-count');
        var m = raw.match(/^(\D*)(\d+)(\D*)$/);
        if (!m) { el.textContent = raw; return; }
        var pre = m[1], end = parseInt(m[2], 10), post = m[3];
        var t0 = performance.now(), dur = 900;
        (function step(now) {
          var p = Math.min((now - t0) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = pre + Math.round(end * eased) + post;
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = raw;
        })(t0);
      });
    }, { rootMargin: '0px 0px -15% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* --------------------------------------------------------------------
     5. Header, dropdown, mobile menu
     -------------------------------------------------------------------- */
  function header() {
    var hdr = $('.hdr');
    if (!hdr) return;
    var last = 0;
    var onScroll = function () {
      var y = W.scrollY;
      hdr.classList.toggle('is-stuck', y > 40);
      if (!D.body.classList.contains('menu-open')) {
        hdr.classList.toggle('is-hidden', y > last && y > 340);
      }
      last = y;
    };
    W.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function dropdowns() {
    $$('.nav-item.has-drop').forEach(function (item) {
      var link = $('.nav-link', item);
      var drop = $('.nav-drop', item);
      if (!link || !drop) return;
      var timer = null;

      function place() {
        // Measure against the viewport and switch alignment if a centred
        // panel would hang off either edge.
        drop.classList.remove('align-start', 'align-end');
        var pad = 16;
        var r = drop.getBoundingClientRect();
        if (r.left < pad) drop.classList.add(rtl ? 'align-end' : 'align-start');
        else if (r.right > W.innerWidth - pad) drop.classList.add(rtl ? 'align-start' : 'align-end');
        // if the flipped side still overflows, use the other edge
        var r2 = drop.getBoundingClientRect();
        if (r2.left < pad || r2.right > W.innerWidth - pad) {
          drop.classList.remove('align-start', 'align-end');
          drop.classList.add(r2.left < pad ? 'align-start' : 'align-end');
        }
      }
      function open() {
        clearTimeout(timer);
        item.classList.add('is-open');
        link.setAttribute('aria-expanded', 'true');
        place();
      }
      function close() { item.classList.remove('is-open'); link.setAttribute('aria-expanded', 'false'); }
      function closeSoon() { timer = setTimeout(close, 160); }

      item.addEventListener('mouseenter', open);
      item.addEventListener('mouseleave', closeSoon);
      item.addEventListener('focusin', open);
      item.addEventListener('focusout', function (e) {
        if (!item.contains(e.relatedTarget)) close();
      });
      link.addEventListener('click', function (e) {
        // On touch, the first tap opens the panel instead of navigating.
        if (!fine && !item.classList.contains('is-open')) { e.preventDefault(); open(); }
      });
      D.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      W.addEventListener('resize', function () { if (item.classList.contains('is-open')) place(); });
    });
  }

  function mobileMenu() {
    var burger = $('.burger'), menu = $('.menu');
    if (!burger || !menu) return;
    var lastFocus = null;

    function setOpen(open) {
      D.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      D.documentElement.style.overflow = open ? 'hidden' : '';
      if (lenis) { open ? lenis.stop() : lenis.start(); }
      if (open) {
        lastFocus = D.activeElement;
        $$('.menu-link', menu).forEach(function (l, i) { l.style.animationDelay = (.08 + i * .055) + 's'; });
        var first = $('a, button', menu);
        if (first) setTimeout(function () { first.focus(); }, 340);
      } else if (lastFocus) {
        lastFocus.focus();
      }
    }

    burger.addEventListener('click', function () { setOpen(!D.body.classList.contains('menu-open')); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });

    D.addEventListener('keydown', function (e) {
      if (!D.body.classList.contains('menu-open')) return;
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab') return;
      var f = $$('a, button', menu).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && D.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && D.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    });
  }

  /* --------------------------------------------------------------------
     6. Components
     -------------------------------------------------------------------- */
  function tabs() {
    $$('[data-tabs]').forEach(function (root) {
      if (root.dataset.tabBound) return;
      root.dataset.tabBound = '1';
      var btns = $$('[role="tab"]', root);
      var panels = $$('[role="tabpanel"]', root);
      function select(i) {
        btns.forEach(function (b, j) {
          b.setAttribute('aria-selected', String(j === i));
          b.setAttribute('tabindex', j === i ? '0' : '-1');
        });
        panels.forEach(function (p, j) { p.classList.toggle('is-active', j === i); p.hidden = j !== i; });
        if (hasST()) W.ScrollTrigger.refresh();
      }
      btns.forEach(function (b, i) {
        b.addEventListener('click', function () { select(i); });
        b.addEventListener('keydown', function (e) {
          var n = null;
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % btns.length;
          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + btns.length) % btns.length;
          if (e.key === 'Home') n = 0;
          if (e.key === 'End') n = btns.length - 1;
          if (n !== null) { e.preventDefault(); select(n); btns[n].focus(); }
        });
      });
      select(0);
    });
  }

  /* Stacked full-screen panels (the technology section).

     The covering itself is CSS `position: sticky` — see the .stackx block in
     carbonix.css. This module only adds depth on top of it:

       • the panel being covered scales down and dims, so it reads as sliding
         behind rather than simply disappearing
       • the photograph inside each panel drifts against the scroll
       • the copy lifts slightly as its panel takes over

     Every one of those is a transform or an opacity, so nothing here can
     cause layout shift, and if this module never runs the section still
     works exactly as designed. */
  function stackPanels() {
    var roots = $$('[data-stack]');
    if (!roots.length) return;

    var groups = roots.map(function (root) {
      return { root: root, panels: $$('[data-stack-panel]', root) };
    }).filter(function (g) { return g.panels.length; });
    if (!groups.length) return;

    if (reduced) return;   /* CSS already flattens the stack */

    function frame() {
      var vh = W.innerHeight || 800;

      groups.forEach(function (g) {
        var rr = g.root.getBoundingClientRect();
        if (rr.bottom < -vh || rr.top > vh * 2) return;

        g.panels.forEach(function (panel, i) {
          var r = panel.getBoundingClientRect();

          /* How far the NEXT panel has covered this one, 0 → 1.
             While a panel is stuck its top is 0, and the next panel's top
             travels from vh down to 0 as it slides over. */
          var cover = 0;
          var next = g.panels[i + 1];
          if (next) {
            var nr = next.getBoundingClientRect();
            cover = Math.max(0, Math.min(1, (vh - nr.top) / vh));
          }

          /* recede: 6% smaller, 45% dimmer, by the time it is fully covered */
          var e = cover * cover * (3 - 2 * cover);           /* smoothstep */
          panel.style.transform = 'scale(' + (1 - e * 0.06).toFixed(4) + ')';
          panel.style.opacity = (1 - e * 0.45).toFixed(3);
          panel.style.borderRadius = (e * 18).toFixed(1) + 'px';

          /* photo drift — the panel is pinned, so drive it from how far the
             panel's own scroll span has been consumed */
          var img = $('[data-stack-img]', panel);
          if (img) {
            var span = Math.max(panel.offsetHeight, 1);
            var p = Math.max(-1, Math.min(1, -r.top / span));
            img.style.transform = 'translate3d(0,' + (p * -7.5).toFixed(2) + '%,0)';
          }

          /* copy settles in as the panel arrives, lifts out as it is covered */
          var copy = $('[data-stack-copy]', panel);
          if (copy) {
            var enter = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.62)));
            var ee = enter * enter * (3 - 2 * enter);
            copy.style.opacity = (ee * (1 - e * 0.9)).toFixed(3);
            copy.style.transform = 'translate3d(0,' + ((1 - ee) * 34 - e * 22).toFixed(1) + 'px,0)';
          }
        });
      });
    }

    var pending = false;
    var onScroll = function () {
      if (pending) return;
      pending = true;
      W.requestAnimationFrame(function () { pending = false; frame(); });
    };
    W.addEventListener('scroll', onScroll, { passive: true });
    W.addEventListener('resize', onScroll, { passive: true });
    frame();
  }

  function accordions() {
    $$('.acc').forEach(function (acc) {
      if (acc.dataset.accBound) return;
      acc.dataset.accBound = '1';
      var single = acc.hasAttribute('data-single');
      $$('.acc-head', acc).forEach(function (head) {
        var item = head.closest('.acc-item');
        head.addEventListener('click', function () {
          var open = item.classList.contains('is-open');
          if (single) {
            $$('.acc-item', acc).forEach(function (it) {
              it.classList.remove('is-open');
              var h = $('.acc-head', it); if (h) h.setAttribute('aria-expanded', 'false');
            });
          }
          item.classList.toggle('is-open', !open);
          head.setAttribute('aria-expanded', String(!open));
          if (hasST()) setTimeout(function () { W.ScrollTrigger.refresh(); }, 560);
        });
      });
    });
  }

  function filters() {
    $$('[data-filter-root]').forEach(function (root) {
      if (root.dataset.filterBound) return;
      root.dataset.filterBound = '1';
      var btns = $$('[data-filter]', root);
      var items = $$('[data-cat]', root);
      var empty = $('[data-filter-empty]', root);
      var live = $('[data-filter-live]', root);
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          var f = b.getAttribute('data-filter');
          btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          var shown = 0;
          items.forEach(function (it) {
            var ok = f === 'all' || it.getAttribute('data-cat') === f;
            it.classList.toggle('is-out', !ok);
            it.setAttribute('aria-hidden', String(!ok));
            if (ok) shown++;
          });
          if (empty) empty.hidden = shown > 0;
          if (live) live.textContent = live.getAttribute('data-tpl').replace('%n', shown);
          if (hasST()) setTimeout(function () { W.ScrollTrigger.refresh(); }, 520);
        });
      });
    });
  }

  function lightbox() {
    var lb = $('.lb');
    if (!lb) return;
    var img = $('img', lb), count = $('.lb-count', lb), cap = $('figcaption', lb);
    var group = [], idx = 0, lastFocus = null;

    function preload(i) {
      if (!group[i]) return;
      var p = new Image();
      p.src = group[i].getAttribute('data-lb');
    }
    function show(i) {
      idx = (i + group.length) % group.length;
      var g = group[idx];
      lb.classList.add('is-loading');
      var next = new Image();
      next.onload = function () { lb.classList.remove('is-loading'); };
      next.src = g.getAttribute('data-lb');
      img.src = next.src;
      img.alt = g.getAttribute('data-lb-alt') || '';
      if (cap) cap.textContent = img.alt;
      if (count) count.textContent = (idx + 1) + ' / ' + group.length;
      preload(idx + 1 < group.length ? idx + 1 : 0);
      preload(idx - 1 >= 0 ? idx - 1 : group.length - 1);
    }
    function open(list, i) {
      group = list; lastFocus = D.activeElement; show(i);
      lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false');
      if (lenis) lenis.stop();
      D.documentElement.style.overflow = 'hidden';
      $('.lb-close', lb).focus();
    }
    function close() {
      lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true');
      if (lenis) lenis.start();
      D.documentElement.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }

    D.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-lb]');
      if (!t) return;
      e.preventDefault();
      var scope = t.closest('[data-lb-group]') || D;
      var list = $$('[data-lb]', scope);
      open(list, list.indexOf(t));
    });

    $('.lb-close', lb).addEventListener('click', close);
    var prev = $('.lb-nav.prev', lb), next = $('.lb-nav.next', lb);
    if (prev) prev.addEventListener('click', function () { show(rtl ? idx + 1 : idx - 1); });
    if (next) next.addEventListener('click', function () { show(rtl ? idx - 1 : idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

    // swipe
    var sx = 0;
    lb.addEventListener('touchstart', function (e) { sx = e.changedTouches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      var d = e.changedTouches[0].clientX - sx;
      if (Math.abs(d) > 55) show(d > 0 ? idx - 1 : idx + 1);
    }, { passive: true });

    D.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(rtl ? idx - 1 : idx + 1);
      if (e.key === 'ArrowLeft') show(rtl ? idx + 1 : idx - 1);
      if (e.key === 'Tab') { e.preventDefault(); $('.lb-close', lb).focus(); }
    });
  }

  function toc() {
    var links = $$('.toc a');
    if (!links.length) return;
    var targets = links
      .map(function (a) { return D.getElementById(a.getAttribute('href').slice(1)); })
      .filter(Boolean);
    if (!targets.length || !('IntersectionObserver' in W)) return;
    var io = observer(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id); });
      });
    }, { rootMargin: '-18% 0px -70% 0px' });
    targets.forEach(function (t) { io.observe(t); });
  }

  function anchors() {
    D.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href*="#"]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var hash = href.slice(href.indexOf('#') + 1);
      if (!hash) return;
      // same-document anchors only
      var samePage = href.charAt(0) === '#' ||
        (a.pathname === W.location.pathname && a.host === W.location.host);
      if (!samePage) return;
      var el = D.getElementById(hash);
      if (!el) return;
      e.preventDefault();
      scrollTo(el, -90);
      if (history.replaceState) history.replaceState(null, '', '#' + hash);
    });
  }

  /* Floating buttons: reveal on scroll, lift clear of the footer. */
  function floatingActions() {
    var stack = $('.fab-stack');
    if (!stack) return;
    var fabs = $$('.fab, .to-top', stack);
    var top = $('.to-top', stack);

    var show = function () {
      var on = W.scrollY > 480;
      fabs.forEach(function (f) { f.classList.toggle('is-in', f.classList.contains('to-top') ? on : W.scrollY > 320); });
    };
    W.addEventListener('scroll', show, { passive: true });
    show();

    if (top) {
      top.addEventListener('click', function () { scrollTo(0); });
    }

    var ftr = $('.ftr');
    if (ftr && 'IntersectionObserver' in W) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var overlap = e.isIntersecting ? Math.max(0, W.innerHeight - e.boundingClientRect.top) : 0;
          stack.style.setProperty('--fab-lift', Math.min(overlap, 240) + 'px');
          stack.classList.toggle('is-lifted', overlap > 0);
        });
      }, { threshold: [0, .05, .2, .5, 1] });
      io.observe(ftr);
      // keep the offset live while scrolling through the footer
      W.addEventListener('scroll', function () {
        var r = ftr.getBoundingClientRect();
        var overlap = Math.max(0, W.innerHeight - r.top);
        stack.style.setProperty('--fab-lift', Math.min(overlap, 240) + 'px');
        stack.classList.toggle('is-lifted', overlap > 0);
      }, { passive: true });
    }
  }

  /* --------------------------------------------------------------------
     7. Forms — live validation + submission
     -------------------------------------------------------------------- */
  function forms() {
    var cfg = W.CARBONIX || null;   // present only on WordPress

    $$('form[data-cx-form]').forEach(function (form) {
      if (form.dataset.formBound) return;
      form.dataset.formBound = '1';

      var status = $('[data-form-status]', form);
      var btn = $('button[type="submit"]', form);

      function msgEl(field) {
        var m = $('.field-msg', field);
        if (!m) {
          m = D.createElement('span');
          m.className = 'field-msg';
          field.appendChild(m);
        }
        return m;
      }
      function validate(input, force) {
        var field = input.closest('.field');
        if (!field) return true;
        var ok = input.checkValidity();
        var touched = force || input.dataset.touched === '1';
        field.classList.toggle('is-invalid', touched && !ok);
        field.classList.toggle('is-valid', touched && ok && !!input.value);
        input.setAttribute('aria-invalid', String(touched && !ok));
        msgEl(field).textContent = (touched && !ok) ? input.validationMessage : '';
        return ok;
      }

      $$('input, select, textarea', form).forEach(function (input) {
        if (input.type === 'hidden') return;
        input.addEventListener('blur', function () { input.dataset.touched = '1'; validate(input); });
        input.addEventListener('input', function () { if (input.dataset.touched) validate(input); });
      });

      function say(kind, text) {
        if (!status) return;
        status.className = 'form-status ' + kind;
        status.textContent = text;
        status.hidden = false;
        status.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      }

      function readable() {
        var fd = new FormData(form);
        var lines = [];
        $$('[name]', form).forEach(function (f) {
          if (f.type === 'hidden' || f.name === 'cx_website') return;
          var lab = form.querySelector('label[for="' + f.id + '"]');
          var name = lab ? lab.textContent.replace('*', '').trim() : f.name;
          var val = fd.get(f.name);
          if (val) lines.push(name + ': ' + val);
        });
        return lines.join('\n');
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();

        // Honeypot: a field no human can see, so anything that fills it is a
        // bot. Accept the submission silently rather than telling it why.
        var trap = form.elements['cx_website'];
        if (trap && trap.value) {
          say('ok', form.getAttribute('data-msg-ok') || 'OK');
          form.reset();
          return;
        }

        var fields = $$('input, select, textarea', form)
          .filter(function (f) { return f.type !== 'hidden' && f.name !== 'cx_website'; });
        var allOk = true, firstBad = null;
        fields.forEach(function (f) {
          f.dataset.touched = '1';
          if (!validate(f, true)) { allOk = false; if (!firstBad) firstBad = f; }
        });
        if (!allOk) { if (firstBad) firstBad.focus(); return; }

        var mode = form.getAttribute('data-cx-form');
        var subject = form.getAttribute('data-subject') || 'Carbonix';
        var okMsg = form.getAttribute('data-msg-ok') || (cfg && cfg.strings.success) || 'OK';
        var errMsg = form.getAttribute('data-msg-err') || (cfg && cfg.strings.error) || 'Error';

        if (mode === 'whatsapp') {
          W.open('https://wa.me/' + form.getAttribute('data-whatsapp') +
                 '?text=' + encodeURIComponent(subject + '\n' + readable()), '_blank', 'noopener');
          say('ok', okMsg);
          form.reset();
          $$('.field', form).forEach(function (f) { f.classList.remove('is-valid', 'is-invalid'); });
          return;
        }

        if (cfg && cfg.ajaxUrl && mode === 'ajax') {
          if (btn) btn.classList.add('is-busy');
          W.fetch(cfg.ajaxUrl, { method: 'POST', body: new FormData(form), credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (json) {
              if (json && json.success) {
                say('ok', (json.data && json.data.message) || okMsg);
                form.reset();
                $$('.field', form).forEach(function (f) { f.classList.remove('is-valid', 'is-invalid'); });
              } else {
                say('err', (json && json.data && json.data.message) || errMsg);
              }
            })
            .catch(function () { say('err', errMsg); })
            .then(function () { if (btn) btn.classList.remove('is-busy'); });
          return;
        }

        // Static build: hand off to the visitor's mail client.
        //
        // Nothing reaches Carbonix at this point — the visitor still has to
        // press send in their own mail app, and on a device with no mail
        // client configured the handoff does nothing at all. Claiming "we have
        // received your request" here left people waiting for a call that was
        // never coming, so the message says what actually happened and offers
        // WhatsApp as the route that does not depend on a mail client.
        var to = form.getAttribute('data-email');
        W.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(subject) +
                          '&body=' + encodeURIComponent(readable());
        say('ok', form.getAttribute('data-msg-mail') || okMsg);
      });
    });
  }

  /* --------------------------------------------------------------------
     8. Page transitions
     --------------------------------------------------------------------
     Only ever engaged when it can genuinely work:
       · not on file:// (fetch is blocked there — this was the bug that made
         clicking a link produce a blank screen)
       · not without fetch / history / GSAP
       · and it disables itself permanently after a single failure
     The curtain is reset in every exit path, including errors.
     -------------------------------------------------------------------- */
  function transitions() {
    var curtain = $('.curtain');
    if (!curtain) return;
    if (isFile || reduced || !hasGSAP() || !W.fetch || !W.history || !W.history.pushState) return;

    var busy = false, disabled = false;

    /* Prefetched documents, keyed by URL without the fragment — two links to
       different sections of one page are one document. Capped because hovering
       your way around a 100-page site would otherwise pin every page it ever
       touched in memory, at roughly 75 KB each. */
    var cache = Object.create(null), cacheKeys = [], CACHE_MAX = 12;
    function cacheKey(url) { var i = url.indexOf('#'); return i > -1 ? url.slice(0, i) : url; }
    function cacheGet(url) { return cache[cacheKey(url)]; }
    function cachePut(url, html) {
      var k = cacheKey(url);
      if (!(k in cache)) {
        cacheKeys.push(k);
        while (cacheKeys.length > CACHE_MAX) delete cache[cacheKeys.shift()];
      }
      cache[k] = html;
    }

    function resetCurtain() {
      W.gsap.set(curtain, { scaleY: 0, transformOrigin: 'bottom' });
      W.gsap.set($('.curtain span'), { opacity: 0 });
      busy = false;
    }

    function eligible(a) {
      if (disabled || !a) return false;
      if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return false;
      if (a.origin !== W.location.origin) return false;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#') return false;
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;
      if (/\.(pdf|zip|jpe?g|png|webp|avif|svg|mp4)$/i.test(a.pathname)) return false;
      // stay inside one language tree so <html lang/dir> never has to change
      return W.location.pathname.split('/')[1] === a.pathname.split('/')[1];
    }

    function swap(html, url) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var next = doc.getElementById('page');
      var cur = D.getElementById('page');
      if (!next || !cur) throw new Error('no #page');

      D.title = doc.title;
      var md = D.querySelector('meta[name="description"]'), md2 = doc.querySelector('meta[name="description"]');
      if (md && md2) md.setAttribute('content', md2.getAttribute('content'));
      var can = D.querySelector('link[rel="canonical"]'), can2 = doc.querySelector('link[rel="canonical"]');
      if (can && can2) can.href = can2.href;

      // URL first, then the markup: the incoming links are relative to the
      // page being navigated to, so the document has to already be at that
      // URL when they are inserted.
      history.pushState({ cx: 1 }, '', url);
      cur.replaceWith(next);
      W.scrollTo(0, 0);
      if (lenis) lenis.scrollTo(0, { immediate: true });

      $$('.hdr .nav-link, .menu a').forEach(function (a) {
        if (a.pathname === W.location.pathname) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });

      if (hasST()) W.ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
      dropObservers();
      boot(true);
      if (hasST()) W.ScrollTrigger.refresh();

      /* A link may point at a section of the next page — the applications page
         is linked that way six times per language, and the pre-v5 /systems/
         redirects land on #portable and friends. A hard navigation goes to
         that section, so a soft one has to as well.

         This runs last, and off a frame: ScrollTrigger.refresh() rewrites
         scroll positions, so anything measured before it gets overwritten. */
      var hash = url.indexOf('#') > -1 ? url.slice(url.indexOf('#') + 1) : '';
      if (hash) {
        requestAnimationFrame(function () {
          var anchor = D.getElementById(hash);
          if (!anchor) return;
          var y = anchor.getBoundingClientRect().top + W.scrollY - 90;
          if (lenis) lenis.scrollTo(y, { immediate: true });
          else W.scrollTo(0, y);
        });
      }

      // announce for screen readers
      var live = $('[data-route-live]');
      if (live) live.textContent = D.title;
    }

    function bail(url) {
      disabled = true;
      resetCurtain();
      W.location.href = url;
    }

    function go(url) {
      if (busy) return;
      busy = true;

      var mark = $('.curtain span');
      var down = W.gsap.timeline();
      down.set(curtain, { transformOrigin: 'bottom', scaleY: 0 })
          .to(curtain, { scaleY: 1, duration: .5, ease: 'expo.inOut' })
          .to(mark, { opacity: 1, duration: .2 }, '-=.2');

      // Safety net: if anything hangs, hard-navigate rather than stay covered.
      var guard = setTimeout(function () { if (busy) bail(url); }, 4000);

      var fetching = cacheGet(url)
        ? Promise.resolve(cacheGet(url))
        : W.fetch(url, { credentials: 'same-origin' }).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.text();
          });

      Promise.all([fetching, down.then()])
        .then(function (res) {
          cachePut(url, res[0]);
          swap(res[0], url);
          clearTimeout(guard);
          return W.gsap.timeline()
            .to(mark, { opacity: 0, duration: .18 })
            .set(curtain, { transformOrigin: 'top' })
            .to(curtain, { scaleY: 0, duration: .58, ease: 'expo.inOut' })
            .then();
        })
        .then(function () { resetCurtain(); })
        .catch(function () { clearTimeout(guard); bail(url); });
    }

    D.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!eligible(a)) return;
      if (a.href === W.location.href) { e.preventDefault(); return; }
      e.preventDefault();
      go(a.href);
    });

    // prefetch on intent
    D.addEventListener('mouseover', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!eligible(a) || cacheGet(a.href)) return;
      W.fetch(a.href, { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (t) { if (t) cachePut(a.href, t); })
        .catch(function () {});
    });

    W.addEventListener('popstate', function () {
      if (disabled) return;
      W.location.reload();
    });

    // If we ever come back to a page with the curtain half-drawn, clear it.
    W.addEventListener('pageshow', resetCurtain);
    resetCurtain();
  }

  /* --------------------------------------------------------------------
     9. Boot
     -------------------------------------------------------------------- */
  function boot(isSwap) {
    reveals();
    heroIntro();
    splitHeads();
    parallax();
    counters();
    tabs();
    stackPanels();
    accordions();
    filters();
    toc();
    forms();
    magnetic();
    if (!isSwap) {
      header();
      dropdowns();
      mobileMenu();
      cursor();
      lightbox();
      anchors();
      scrollProgress();
      floatingActions();
      transitions();
    }
  }

  /* Everything outside #page — header, dropdowns, mobile menu, footer, the
     floating buttons — is authored with hrefs relative to the depth of the
     page it was served with, and a soft navigation leaves all of it in place
     while changing the URL underneath it. Go from /fa/ to /fa/products/ and
     the header's `../fa/projects/` starts resolving as /fa/fa/projects/, so
     every link in the chrome 404s until the next hard reload.

     Resolving them to absolute once, while the document URL is still the one
     they were written against, makes the chrome depth-proof. Runs before the
     first paint so no click can beat it. */
  function pinChromeLinks() {
    var page = D.getElementById('page');
    if (!page) return;
    $$('a[href]').forEach(function (a) {
      if (page.contains(a)) return;
      var raw = a.getAttribute('href');
      // absolute, scheme-relative, and pure fragments already survive a move
      if (!raw || raw.charAt(0) === '#' || raw.slice(0, 2) === '//' || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return;
      a.setAttribute('href', a.href);
    });
  }

  function init() {
    D.body.classList.add('is-loading');
    pinChromeLinks();
    smoothScroll();
    preloader(function () { boot(false); });
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
  else init();
})();
