// Xchange (/xchange): Einladungslink setzen und Abschnitte beim Scrollen einblenden.
(function () {
  "use strict";
  var invite = (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.xchangeInvite) || "";
  document.querySelectorAll("[data-xchange-invite]").forEach(function (a) {
    if (!invite) return;
    a.href = invite;
    a.target = "_blank";
    a.rel = "noopener";
  });
  var pending = document.querySelector("[data-xchange-pending]");
  if (pending) pending.hidden = !!invite;

  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("js-reveal");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  document.querySelectorAll("[data-reveal]").forEach(function (el, i) {
    el.style.transitionDelay = (i % 4) * 60 + "ms";
    io.observe(el);
  });
})();
