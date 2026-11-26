const STYLE_ID = "frontier-mobile-styles";

const CSS = `
html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
canvas{touch-action:none}
.rot-overlay{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(14,8,5,.88);backdrop-filter:blur(6px)}
.rot-overlay.show{display:flex}
.rot-card{width:min(320px,88vw);display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:42px 34px 36px;border-radius:6px;background:url("/ui/detail-panel-frame.jpg") center/100% 100% no-repeat;box-shadow:0 18px 48px rgba(0,0,0,.85);color:#2c1810;font-family:Georgia,serif}
.rot-icon{width:56px;height:56px;color:#84181a;animation:rotPhone 2.2s ease-in-out infinite}
@keyframes rotPhone{0%,15%{transform:rotate(0deg)}45%,75%{transform:rotate(-90deg)}100%{transform:rotate(0deg)}}
.rot-title{font:900 16px/1.2 'Cinzel','Rye',Georgia,serif;color:#84181a;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 1px 0 rgba(255,245,220,.75)}
.rot-desc{font-size:13px;line-height:1.45;color:#2c1810;margin:0}
.rot-btn{margin-top:4px;padding:10px 18px;border-radius:3px;border:1.5px solid #4a0a0c;background:linear-gradient(180deg,#8d1a1c,#670f11);box-shadow:0 3px 8px rgba(44,24,16,.38),inset 0 0 0 1px rgba(203,160,67,.42);cursor:pointer;color:#f7ebd0;font:800 11px/1.1 'Cinzel',Georgia,serif;text-transform:uppercase;letter-spacing:.08em}
@media (max-height:540px),(max-width:768px){
  .insp-drawer{top:8px;right:8px;bottom:8px;width:min(286px,calc(100vw - 16px));padding:28px 26px 24px;gap:8px}
  .insp-stage{aspect-ratio:auto;height:132px}
  .insp-av{width:38px;height:38px}
  .insp-name{font-size:13.5px}
  .insp-grid{font-size:11.5px;gap:3px 8px}
  .insp-btn{padding:8px 8px;font-size:10px}
  .western-menu-toggle{top:max(10px,env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));padding:6px 10px;font-size:11px}
  .western-side-menu{width:min(260px,78vw)}
  #wasd-indicator{display:none!important}
}
`;

export const IS_MOBILE =
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

export function initMobileExperience(): void {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

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
