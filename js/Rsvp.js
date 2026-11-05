/* ==========================================================
   RSVP: nama otomatis (dari "Kepada Yth." / ?to=), hadir/tidak, ucapan
   - Kirim lewat WhatsApp: isi waNumber.
   - Agar ucapan tampil untuk SEMUA tamu: pasang apps-script.gs
     di Google Sheets, lalu isi sheetUrl.
   ========================================================== */
(function () {
  "use strict";

  var CONFIG = {
    waNumber: "6289638144271", // nomor WhatsApp penerima, format 62..., tanpa + atau spasi
    sheetUrl: "https://script.google.com/macros/s/AKfycbxUHkuu0nVtSTG78o6BTFqsJLj9JVuKUSvsfaXBKyN7FQmcM-gsz-XDahG17pIc0Lhj/exec"               // URL Web App dari apps-script.gs (kosongkan jika tidak dipakai)
  };

  var form = document.getElementById("rsvpForm");
  if (!form) return;

  var fNama = document.getElementById("fNama");
  var fStatus = document.getElementById("fStatus");
  var nameLock = document.getElementById("nameLock");
  // var nameHint = document.getElementById("nameHint");
  var inNama = document.getElementById("rNama");
  var inUcapan = document.getElementById("rUcapan");
  var counter = document.getElementById("rCount");
  var btn = document.getElementById("rSubmit");
  var note = document.getElementById("rsvpNote");
  var list = document.getElementById("wishList");
  var count = document.getElementById("wishCount");
  var box = list.parentNode; // pembungkus .wishes (untuk penanda bisa di-scroll)

  var wishes = [];       // yang ditampilkan
  var serverRows = [];   // data terakhir dari Google Sheet
  var pending = [];      // ucapan yang baru dikirim & belum muncul di Sheet
  var lastSig = "";
  var loadedOnce = false;
  var polling = false;
  var pollTimer = 0;
  var POLL_MS = 15000;   // cek perubahan Sheet tiap 15 detik (hanya saat daftar ucapan terlihat)
  var hasWA = /^\d{8,15}$/.test(CONFIG.waNumber);
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Nama otomatis sesuai "Kepada Yth." (?to=Nama) ---------- */
  var to = (new URLSearchParams(window.location.search).get("to") || "").trim().slice(0, 60);
  if (to) {
    inNama.value = to;
    inNama.readOnly = true; // terkunci: nama tamu sesuai undangan
    nameLock.classList.add("is-locked");
    // nameHint.hidden = false;
  }

  /* ---------- Pilihan hadir / tidak ---------- */
  function currentStatus() {
    var r = form.querySelector('input[name="status"]:checked');
    return r ? r.value : "";
  }

  form.querySelectorAll('input[name="status"]').forEach(function (r) {
    r.addEventListener("change", function () { fStatus.classList.remove("err"); });
  });
  inNama.addEventListener("input", function () { fNama.classList.remove("err"); });

  /* ---------- Penghitung huruf ucapan ---------- */
  function updateCount() {
    var n = inUcapan.value.length;
    counter.textContent = n + "/300";
    counter.classList.toggle("near", n >= 250);
  }
  inUcapan.addEventListener("input", updateCount);

  /* ---------- Penanda daftar ucapan bisa di-scroll ---------- */
  function checkScroll() {
    var can = list.scrollHeight > list.clientHeight + 4;
    var end = list.scrollTop + list.clientHeight >= list.scrollHeight - 6;
    box.classList.toggle("can-scroll", can);
    box.classList.toggle("at-end", end);
  }
  list.addEventListener("scroll", checkScroll, { passive: true });
  window.addEventListener("resize", checkScroll);

  /* ---------- Daftar ucapan ---------- */
  function when(w) {
    if (!w) return "";
    if (w === "now") return "Baru saja";
    var d = new Date(w);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }

  function render(freshEntry, silent) {
    var keep = list.scrollTop;
    list.textContent = "";
    var shown = wishes.filter(function (w) { return w.ucapan; });

    if (!shown.length) {
      var empty = document.createElement("li");
      empty.className = "wish-empty";
      empty.textContent = "Jadilah yang pertama mengirim ucapan";
      list.appendChild(empty);
      count.textContent = "Belum ada ucapan";
      checkScroll();
      return;
    }

    count.textContent = shown.length + " ucapan";

    shown.forEach(function (w, i) {
      var li = document.createElement("li");
      li.className = "wish" + (w === freshEntry ? " fresh" : "");
      li.style.setProperty("--i", Math.min(i, 10) * 0.08 + "s"); // muncul bergiliran
      if (silent && w !== freshEntry) { li.style.animation = "none"; li.style.opacity = "1"; } // pembaruan diam-diam: tanpa kedip

      var head = document.createElement("div");
      head.className = "wish-head";

      var name = document.createElement("span");
      name.className = "wish-name";
      name.textContent = w.nama;

      var badge = document.createElement("span");
      badge.className = "wish-badge" + (w.status === "tidak" ? " no" : "");
      badge.textContent = w.status === "tidak" ? "Tidak Hadir" : "Hadir";

      head.appendChild(name);
      head.appendChild(badge);

      var text = document.createElement("p");
      text.className = "wish-text";
      text.textContent = w.ucapan;

      li.appendChild(head);
      li.appendChild(text);

      var t = when(w.waktu);
      if (t) {
        var time = document.createElement("p");
        time.className = "wish-time";
        time.textContent = t;
        li.appendChild(time);
      }
      list.appendChild(li);
    });

    list.scrollTop = silent ? keep : 0;
    checkScroll();
  }

  /* ---------- Sinkron otomatis dengan Google Sheet ----------
     Bila baris di Sheet dihapus / diubah, daftar ucapan di web ikut
     berubah tanpa perlu refresh. */
  function sameKey(a, b) {
    return String(a.nama || "").trim().toLowerCase() === String(b.nama || "").trim().toLowerCase() &&
           String(a.ucapan || "").trim() === String(b.ucapan || "").trim();
  }

  function applyRows(rows, silent) {
    var now = Date.now();
    // entri lokal dibuang bila sudah muncul di Sheet (atau sudah terlalu lama)
    pending = pending.filter(function (p) {
      if (now - p.at > 90000) return false;
      return !rows.some(function (r) { return sameKey(r, p); });
    });

    var sig = JSON.stringify(rows.map(function (r) {
      return [r.nama, r.status, r.ucapan, r.waktu];
    })) + "|" + pending.length;
    var changed = sig !== lastSig;
    lastSig = sig;
    serverRows = rows;
    if (!changed && loadedOnce) return;

    wishes = pending.concat(serverRows);
    render(undefined, silent && loadedOnce);
    loadedOnce = true;
  }

  function firstRender() {
    if (loadedOnce) return;
    render();
    loadedOnce = true;
  }

  function fetchWishes(silent) {
    if (!CONFIG.sheetUrl) { firstRender(); return; }
    if (polling) return;
    polling = true;
    var guard = setTimeout(function () { polling = false; }, 15000);
    var url = CONFIG.sheetUrl + (CONFIG.sheetUrl.indexOf("?") > -1 ? "&" : "?") + "t=" + Date.now();

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (Array.isArray(rows)) { applyRows(rows, silent); } else { firstRender(); }
      })
      .catch(function () { firstRender(); })
      .then(function () { clearTimeout(guard); polling = false; });
  }

  function startPolling() {
    if (pollTimer || !CONFIG.sheetUrl) return;
    pollTimer = setInterval(function () {
      if (!document.hidden) fetchWishes(true);
    }, POLL_MS);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = 0;
  }

  // Cek berkala hanya selama daftar ucapan terlihat di layar (hemat kuota Google)
  function watchList() {
    if (!CONFIG.sheetUrl) return;
    if (!("IntersectionObserver" in window)) { startPolling(); return; }

    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { fetchWishes(true); startPolling(); }
      else { stopPolling(); }
    }, { rootMargin: "200px 0px" }).observe(box);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && pollTimer) fetchWishes(true);
    });
  }

  function loadWishes() {
    fetchWishes(false);
    watchList();
  }

  /* ---------- Efek kelopak emas saat berhasil ---------- */
  function burst() {
    if (reduceMotion) return;
    var fr = form.getBoundingClientRect();
    var br = btn.getBoundingClientRect();
    var cx = br.left - fr.left + br.width / 2;
    var cy = br.top - fr.top + br.height / 2;

    for (var i = 0; i < 24; i++) {
      var p = document.createElement("i");
      var angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.4;
      var dist = 70 + Math.random() * 110;
      p.className = "petal";
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--dy", Math.sin(angle) * dist * 0.8 - 40 + "px");
      p.style.setProperty("--rot", (Math.random() * 360 - 180) + "deg");
      p.style.animationDelay = Math.random() * 0.15 + "s";
      form.appendChild(p);
      (function (el) { setTimeout(function () { el.remove(); }, 2000); })(p);
    }
  }

  /* ---------- Kirim ---------- */
  function showNote(msg) {
    note.textContent = msg;
    note.hidden = false;
    note.style.animation = "none";
    void note.offsetWidth; // ulang animasi
    note.style.animation = "";
  }

  function waLink(e) {
    var lines = [
      "Assalamu'alaikum, saya " + e.nama + ".",
      e.status === "hadir"
        ? "Konfirmasi kehadiran: Insya Allah hadir"
        : "Konfirmasi kehadiran: Mohon maaf, tidak dapat hadir"
    ];
    if (e.ucapan) lines.push("", "Ucapan: " + e.ucapan);
    return "https://wa.me/" + CONFIG.waNumber + "?text=" + encodeURIComponent(lines.join("\n"));
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();

    var nama = inNama.value.trim();
    var status = currentStatus();

    fNama.classList.toggle("err", !nama);
    fStatus.classList.toggle("err", !status);
    if (!nama || !status) {
      (nama ? fStatus : fNama).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    var entry = {
      nama: nama,
      status: status,
      ucapan: inUcapan.value.trim(),
      waktu: "now"
    };

    btn.disabled = true;
    btn.textContent = "Mengirim…";

    function reset() {
      btn.disabled = false;
      btn.textContent = "Kirim Konfirmasi";
    }

    function finish(msg) {
      if (CONFIG.sheetUrl) {
        entry.at = Date.now();
        pending.unshift(entry);
        wishes = pending.concat(serverRows);
      } else {
        wishes.unshift(entry);
      }
      render(entry);
      inUcapan.value = "";
      updateCount();
      form.querySelectorAll('input[name="status"]').forEach(function (r) { r.checked = false; });
      if (!to) inNama.value = "";
      reset();
      showNote(msg);
      burst();
    }

    var thanks = status === "hadir"
      ? "Terima kasih, " + nama + ". Kami menantikan kehadiran Anda."
      : "Terima kasih atas doa dan konfirmasinya, " + nama + ".";

    if (CONFIG.sheetUrl) {
      fetch(CONFIG.sheetUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ nama: entry.nama, status: entry.status, ucapan: entry.ucapan })
      })
        .then(function () {
          finish(thanks);
          setTimeout(function () { fetchWishes(true); }, 3000);
        })
        .catch(function () {
          reset();
          showNote("Gagal mengirim. Periksa koneksi lalu coba lagi.");
        });
      return;
    }

    if (hasWA) {
      window.open(waLink(entry), "_blank", "noopener");
      finish(thanks + " Silakan lanjutkan pengiriman lewat WhatsApp.");
      return;
    }

    // Belum ada tujuan pengiriman: hanya tampil di perangkat ini (mode contoh)
    finish(thanks);
  });

  updateCount();
  loadWishes();
})();