// 오늘 (Today) — dailylab.app shared script. No dependencies; everything is progressive enhancement.
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");

  // ---- UTM / click-id persistence (so ad → landing → store clicks keep attribution) -------------
  var TRACK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "ttclid"];
  var params = new URLSearchParams(location.search);
  var attrib = {};
  try { attrib = JSON.parse(sessionStorage.getItem("dl_attrib") || "{}"); } catch (e) {}
  TRACK_KEYS.forEach(function (k) { if (params.get(k)) attrib[k] = params.get(k); });
  try { sessionStorage.setItem("dl_attrib", JSON.stringify(attrib)); } catch (e) {}

  // Forwards to whichever analytics tag is installed (GA4 gtag, Meta Pixel, GTM dataLayer). Safe no-op otherwise.
  function track(name, data) {
    var payload = Object.assign({}, attrib, data || {});
    if (window.gtag) window.gtag("event", name, payload);
    if (window.fbq && name === "store_click") window.fbq("track", "Lead", payload);
    if (window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, payload));
  }
  window.dlTrack = track;

  // ---- Platform-aware store links ------------------------------------------------------------------
  var ua = navigator.userAgent || "";
  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  doc.classList.add(isAndroid ? "is-android" : isIOS ? "is-ios" : "is-desktop");

  // App Store campaign token: `ct` shows up in App Analytics → Sources → Campaigns.
  var ct = attrib.utm_campaign || attrib.utm_source;
  document.querySelectorAll("a[data-store='ios']").forEach(function (a) {
    if (!ct) return;
    try { var u = new URL(a.href); u.searchParams.set("ct", ct.slice(0, 40)); a.href = u.toString(); } catch (e) {}
  });
  // [data-auto-store] buttons: point Android visitors to the beta and swap the label.
  document.querySelectorAll("a[data-auto-store]").forEach(function (a) {
    if (!isAndroid) return;
    var alt = document.querySelector("a[data-store='android']");
    if (alt) { a.href = alt.href; a.setAttribute("data-store", "android"); }
    var label = a.getAttribute("data-android-label");
    var t = a.querySelector("[data-label]");
    if (label && t) t.textContent = label;
  });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-store]");
    if (a) track("store_click", { store: a.getAttribute("data-store"), placement: a.getAttribute("data-placement") || "" });
  });

  // ---- Header border on scroll + sticky mobile CTA ---------------------------------------------------
  var header = document.querySelector(".site-header");
  var sticky = document.querySelector(".sticky-cta");
  var hero = document.querySelector(".hero");
  if (sticky) document.body.classList.add("has-sticky");
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle("scrolled", y > 8);
    if (sticky && hero) sticky.classList.toggle("show", y > hero.offsetHeight * 0.7);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---- Reveal on scroll ----------------------------------------------------------------------------
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ---- HyperFrames player: load the web component only when the video is near the viewport ----------
  var PLAYER_SRC = "https://cdn.jsdelivr.net/npm/@hyperframes/player@0.8.76/dist/hyperframes-player.js";
  var loaded = false;
  function loadPlayerLib() {
    if (loaded) return;
    loaded = true;
    var s = document.createElement("script");
    s.type = "module";
    s.src = PLAYER_SRC;
    document.head.appendChild(s);
  }
  function mount(shell, autoplay) {
    if (shell.dataset.mounted) return;
    shell.dataset.mounted = "1";
    loadPlayerLib();
    var p = document.createElement("hyperframes-player");
    p.setAttribute("src", shell.dataset.src);
    p.setAttribute("width", shell.dataset.width || "1920");
    p.setAttribute("height", shell.dataset.height || "1080");
    p.setAttribute("muted", "");
    p.setAttribute("loop", "");
    p.setAttribute("assets-loading-ui", "none");
    if (shell.dataset.controls !== "false") p.setAttribute("controls", "");
    if (autoplay) p.setAttribute("autoplay", "");
    p.setAttribute("aria-label", shell.getAttribute("aria-label") || "");
    p.addEventListener("ready", function () {
      var b = shell.querySelector(".play");
      if (b) b.remove();
      if (autoplay && p.paused && p.play) p.play(); // `autoplay` alone is not always honoured
    });
    p.addEventListener("ended", function () { track("video_complete", { video: shell.dataset.src }); });
    shell.appendChild(p);
    track("video_start", { video: shell.dataset.src });
  }
  document.querySelectorAll(".player-shell[data-src]").forEach(function (shell) {
    var btn = shell.querySelector(".play");
    if (btn) btn.addEventListener("click", function () { mount(shell, true); });
    if (shell.dataset.autoplay === "true" && "IntersectionObserver" in window) {
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;
      var pio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { mount(shell, true); pio.disconnect(); } });
      }, { rootMargin: "200px 0px" });
      pio.observe(shell);
    }
  });
})();
