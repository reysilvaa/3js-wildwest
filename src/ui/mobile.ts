export const IS_MOBILE =
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

export function initMobileExperience(): void {
  const isMobile = () => IS_MOBILE;

  const overlay = document.createElement("div");
  overlay.className = "rot-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Rotate Device to Landscape");
  overlay.innerHTML = `
    <div class="rot-card">
      <svg class="rot-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="19" y="8" width="26" height="48" rx="4" fill="rgba(132,24,26,0.1)"/>
        <line x1="28" y1="49" x2="36" y2="49"/>
        <path d="M51 22a16 16 0 0 1 3 14" stroke="#2c1810"/>
        <polyline points="50 32 54 36 58 32" stroke="#2c1810"/>
      </svg>
      <div class="rot-title">Rotate Your Device</div>
      <p class="rot-desc">Putar layar ke mode <b>Landscape</b> agar peta Frontier Town & kontrol lebih lega.</p>
      <button class="rot-btn" type="button">Lanjut Portrait</button>
    </div>
  `;
  document.body.appendChild(overlay);

  let dismissed = false;
  overlay.querySelector(".rot-btn")?.addEventListener("click", () => {
    dismissed = true;
    overlay.classList.remove("show");
  });

  function syncOrientation(): void {
    const portrait = window.innerHeight > window.innerWidth;
    if (!portrait) dismissed = false;
    overlay.classList.toggle("show", isMobile() && portrait && !dismissed);
  }

  window.addEventListener("resize", syncOrientation);
  window.addEventListener("orientationchange", syncOrientation);
  syncOrientation();
}
