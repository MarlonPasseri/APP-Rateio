/* Movimento da interface: scroll-reveal + parallax.
   Sem dependências externas (compatível com o CSP). Respeita prefers-reduced-motion. */
"use strict";
(function () {
  const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveals = document.querySelectorAll("[data-reveal], [data-reveal-slide]");
  const revelarTudo = () => reveals.forEach((el) => el.classList.add("in"));

  // Acessibilidade: sem animação, mostra tudo imediatamente.
  if (reduz) { revelarTudo(); return; }

  // Ativa o estado oculto inicial só agora (sem JS, nada fica invisível).
  document.documentElement.classList.add("has-anim");

  // Rede de segurança: se o observer não disparar, revela tudo após 2s.
  const failsafe = setTimeout(revelarTudo, 2000);

  // ---- Scroll-reveal (entra ao aparecer na viewport) ----
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0, rootMargin: "0px 0px -5% 0px" });
  reveals.forEach((el) => io.observe(el));

  // Garante que o card de resultado apareça mesmo que já esteja na viewport
  // quando passa de display:none para visível.
  const cardResult = document.getElementById("card-result");
  if (cardResult) {
    new MutationObserver(() => {
      if (cardResult.style.display !== "none") cardResult.classList.add("in");
    }).observe(cardResult, { attributes: true, attributeFilter: ["style"] });
  }

  // ---- Parallax dos blobs e do cabeçalho ----
  const blobs = [...document.querySelectorAll(".bg .blob")];
  const speeds = [0.12, -0.08, 0.06];
  const headerIn = document.querySelector(".header-in");
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || window.pageYOffset || 0;
      blobs.forEach((b, i) => { b.style.transform = `translate3d(0, ${(y * speeds[i]).toFixed(1)}px, 0)`; });
      if (headerIn) {
        headerIn.style.transform = `translateY(${(y * 0.25).toFixed(1)}px)`;
        headerIn.style.opacity = String(Math.max(0, 1 - y / 280));
      }
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();
})();
