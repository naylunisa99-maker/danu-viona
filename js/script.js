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
    if (openBox.checked) { play(); startReveal(); }
  });
  if (openBox.checked) startReveal();

  musicBtn.addEventListener("click", function () {
    if (audio.paused) { play(); } else { audio.pause(); setPlaying(false); }
  });

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

  /* ---------- Menu aktif saat scroll ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  var targets = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = targets.indexOf(e.target);
        links.forEach(function (a, n) { a.classList.toggle("active", n === i); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    targets.forEach(function (t) { if (t) io.observe(t); });
  }

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