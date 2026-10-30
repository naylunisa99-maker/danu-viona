/* ==========================================================
   Script kecil — hanya untuk fitur yang tidak bisa dengan CSS:
   musik, penanda menu aktif, animasi scroll, dan salin nomor rekening.
   ========================================================== */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var openBox = document.getElementById("open");
  var audio = document.getElementById("bgm");
  var musicBtn = document.getElementById("musicBtn");

  /* ---------- Nama tamu dari link personal (?to=Nama%20Tamu) ---------- */
  var guestName = document.getElementById("guestName");
  var params = new URLSearchParams(window.location.search);
  var recipient = (params.get("to") || "").trim();
  if (guestName && recipient) {
    // textContent mencegah teks nama diperlakukan sebagai HTML.
    guestName.textContent = recipient;
  }

  /* ---------- Musik ---------- */
  function setPlaying(on) {
    musicBtn.classList.toggle("is-playing", on);
  }

  function play() {
    audio.play().then(function () { setPlaying(true); }).catch(function () { setPlaying(false); });
  }

  // Musik & animasi mulai saat undangan dibuka (klik tombol = interaksi pengguna)
  openBox.addEventListener("change", function () {
    if (openBox.checked) { play(); startReveal(); setTimeout(spy, 50); }
  });
  if (openBox.checked) startReveal();

  musicBtn.addEventListener("click", function () {
    if (audio.paused) { play(); } else { audio.pause(); setPlaying(false); }
  });

  // Lagu dimuat SETELAH semua foto selesai, supaya tidak berebut kuota
  // dengan gambar (penyebab lagu putus-putus di data seluler).
  window.addEventListener("load", function () {
    if (!audio.paused) return;
    audio.preload = "auto";
    audio.load();
  });

  /* ---------- Tombol "Buka Undangan" menunggu foto utama siap ----------
     Supaya tamu tidak membuka undangan yang fotonya masih kosong. */
  var openBtn = document.querySelector(".splash label.btn");
  if (openBtn) {
    var label = openBtn.textContent;
    var keyImgs = Array.prototype.slice.call(document.querySelectorAll(".arch-photo img, .hero img"));
    var pending = keyImgs.filter(function (im) { return !(im.complete && im.naturalWidth); });

    if (pending.length) {
      var ready = false;
      var left = pending.length;
      openBtn.textContent = "Memuat…";
      openBtn.classList.add("is-wait");

      var ok = function () {
        if (ready) return;
        ready = true;
        openBtn.textContent = label;
        openBtn.classList.remove("is-wait");
      };
      pending.forEach(function (im) {
        var fin = function () { left -= 1; if (left <= 0) ok(); };
        im.addEventListener("load", fin, { once: true });
        im.addEventListener("error", fin, { once: true });
      });
      setTimeout(ok, 7000); // jaga-jaga bila koneksi sangat lambat
    }
  }

  /* ---------- Animasi muncul saat scroll ---------- */
  var revealStarted = false;

  function startReveal() {
    if (revealStarted) return;
    revealStarted = true;
    var items = document.querySelectorAll(".reveal, [data-anim]");

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }

    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        ro.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

    items.forEach(function (el) { ro.observe(el); });
  }

  /* ---------- Menu aktif ----------
     Dihitung dari posisi scroll (bukan IntersectionObserver), jadi tetap
     akurat walau section saling menumpuk, bentuknya melengkung, atau
     halaman di-scroll cepat / lewat klik menu. */
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  var targets = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });

  var forced = null;      // menu yang baru diklik
  var clicking = false;   // true selama scroll halus akibat klik
  var idleTimer = 0;
  var ticking = false;

  function setActive(i) {
    links.forEach(function (a, n) {
      var on = n === i;
      a.classList.toggle("active", on);
      if (on) { a.setAttribute("aria-current", "true"); }
      else { a.removeAttribute("aria-current"); }
    });
  }

  function spy() {
    ticking = false;
    if (clicking) return;

    // Menu yang baru diklik dipercaya selama section-nya sudah di puncak layar
    if (forced !== null) {
      var ft = targets[forced] ? targets[forced].getBoundingClientRect().top : 9999;
      if (Math.abs(ft) <= 24) { setActive(forced); return; }
      forced = null;
    }

    var probe = window.innerHeight * 0.4;   // garis acuan di 40% tinggi layar
    var idx = 0;
    targets.forEach(function (t, i) {
      if (t && t.getBoundingClientRect().top <= probe) idx = i;
    });

    // Mentok di dasar halaman: menu terakhir
    var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atBottom) idx = targets.length - 1;

    setActive(idx);
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(spy);
  }

  function endClick() {
    clicking = false;
    spy();
  }

  links.forEach(function (a, i) {
    a.addEventListener("click", function () {
      forced = i;
      clicking = true;
      setActive(i);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(endClick, 500); // jaga-jaga bila tidak ada scroll
    });
  });

  window.addEventListener("scroll", function () {
    if (clicking) {
      // tunggu scroll halus berhenti, baru pastikan menu sesuai
      clearTimeout(idleTimer);
      idleTimer = setTimeout(endClick, 160);
      return;
    }
    schedule();
  }, { passive: true });

  window.addEventListener("resize", schedule);
  spy();

  /* ---------- Salin nomor rekening ---------- */
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = document.querySelector(btn.dataset.copy).textContent.trim();
      var done = function () {
        var old = btn.textContent;
        btn.textContent = "Tersalin";
        btn.classList.add("done");
        setTimeout(function () { btn.textContent = old; btn.classList.remove("done"); }, 1600);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(done);
      } else {
        var t = document.createElement("textarea");
        t.value = text; document.body.appendChild(t); t.select();
        document.execCommand("copy"); document.body.removeChild(t); done();
      }
    });
  });
})();