/** Original Siga o Voto artwork. No Politique assets are bundled. */
export const brandColors = {primary:"#245FE5",navy:"#090F1F",action:"#137847",accent:"#FFD633",background:"#F2F5FA",muted:"#56657A",border:"#DCE4EF",soft:"#EAF1FF"} as const;
export const brandMark = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><path d="m34 5 14 19-14 19-14-19Z" fill="#FFD633"/><circle cx="21" cy="24" r="20" fill="#245FE5"/><path d="M29 15c-2-2-5-3-8-3-5 0-8 3-8 6 0 8 17 4 17 12 0 4-4 6-9 6-4 0-7-2-9-4" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>';
const icons = {
 data:'<path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3"/>',
 territory:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/>',
 access:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
 municipality:'<path d="M3 21h18M6 21V8h7v13M13 12h5v9M8 11h3M8 15h3M8 18h3M15 15h1M15 18h1"/>',
 neighborhood:'<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>',
 polling_place:'<path d="M12 22s8-8 8-13a8 8 0 1 0-16 0c0 5 8 13 8 13Z"/><circle cx="12" cy="9" r="3"/>',
 zone:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/>',
 section:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
 map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/>',
 compare:'<path d="M5 20V10M12 20V4M19 20v-7M3 20h18"/>',
} as const;
export function brandIcon(name:keyof typeof icons){return '<svg class="sov-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>'}
export const brandCss = `
@font-face{font-family:SigaLato;src:url('/assets/siga-voto/lato-regular-v1.ttf') format('truetype');font-style:normal;font-weight:400;font-display:swap}
@font-face{font-family:SigaLato;src:url('/assets/siga-voto/lato-bold-v1.ttf') format('truetype');font-style:normal;font-weight:700;font-display:swap}
:root{--sov-blue:${brandColors.primary};--sov-navy:${brandColors.navy};--sov-bg:${brandColors.background};--sov-muted:${brandColors.muted};--sov-line:${brandColors.border};--sov-soft:${brandColors.soft};--sov-shadow:0 8px 30px rgba(20,43,74,.045)}
body.sov-shell{font-family:SigaLato,system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--sov-bg);color:var(--sov-navy);line-height:1.5;font-weight:400}
.sov-shell button,.sov-shell input,.sov-shell select{font:inherit}
.sov-shell .wrap{max-width:1240px;padding:24px 32px}
.sov-shell .nav{gap:20px;padding:14px 0 28px;margin-bottom:28px;border-bottom:1px solid var(--sov-line)}
.sov-shell .brand{display:inline-flex;align-items:center;gap:12px;white-space:nowrap;text-decoration:none}
.brand-symbol{display:block;width:46px;height:46px;flex-shrink:0}.brand-symbol svg{display:block;width:100%;height:100%}
.brand-wordmark{display:flex;flex-direction:column;line-height:1.2}.brand-wordmark strong{font-size:21px;letter-spacing:-.5px;font-weight:700}.brand-wordmark small{font-size:10px;letter-spacing:1.5px;margin-top:4px;color:var(--sov-muted);font-weight:700}
.sov-shell .tag{background:var(--sov-soft);color:#1B4FBF;font-weight:700;padding:5px 10px}
.sov-shell h1,.sov-shell h2,.sov-shell h3{font-weight:700;letter-spacing:-.025em;line-height:1.2;color:var(--sov-navy)}.sov-shell h1{font-size:34px;margin:0 0 12px}
.sov-shell .muted,.sov-shell .candidate-meta,.sov-shell .comparison-head span,.sov-shell .comparison-item small,.sov-shell .compare-help,.sov-shell .map-note,.sov-shell .popup-meta{color:var(--sov-muted)}
.sov-shell .card{border:1px solid var(--sov-line);border-radius:24px;padding:28px;box-shadow:var(--sov-shadow)}
.sov-shell .btn{background:var(--sov-blue);color:white;border:1px solid var(--sov-blue);border-radius:14px;padding:12px 20px;font-weight:700;min-height:46px;line-height:1.4;transition:background .15s,border-color .15s,box-shadow .15s}
.sov-shell .btn:hover{background:#1B4FBF;border-color:#1B4FBF;box-shadow:0 4px 12px rgba(36,95,229,.15)}.sov-shell .btn.secondary{background:white;border-color:var(--sov-line);color:var(--sov-navy)}.sov-shell .btn.secondary:hover{border-color:#9CB9EF;background:var(--sov-soft)}
.sov-shell button:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}.sov-shell :is(a,button,input,select):focus-visible{outline:3px solid #245FE5;outline-offset:3px}
.sov-shell input,.sov-shell select{min-width:0;max-width:100%;background:#FBFCFE;color:var(--sov-navy);border:1px solid #B8C6D9;border-radius:12px;min-height:46px}.sov-shell input::placeholder{color:#62738B;opacity:1}.sov-shell input:focus,.sov-shell select:focus{border-color:var(--sov-blue)}
.sov-shell .field{font-size:14px;font-weight:700;gap:8px}.sov-shell .field input,.sov-shell .field select{font-weight:400}
.sov-shell .hero{padding:38px 0 56px}.sov-shell .hero h1{font-size:clamp(34px,4.7vw,58px);line-height:1.08;max-width:900px;letter-spacing:-.035em;margin:16px 0 22px}
.hero-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12px;letter-spacing:1.3px;font-weight:700;color:#1B4FBF;text-transform:uppercase}.hero-eyebrow:before{content:'';width:7px;height:7px;border-radius:50%;background:var(--sov-blue)}
.sov-icon{width:22px;height:22px;display:inline-block;flex-shrink:0;vertical-align:middle}.feature-icon{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:16px;background:var(--sov-soft);color:var(--sov-blue);margin-bottom:18px}
.sov-shell .grid>.card>b{font-size:18px}.sov-shell .auth{max-width:460px;margin:52px auto}.sov-shell .auth h1{font-size:30px;margin-bottom:24px}.sov-shell .footer{font-size:12px;color:var(--sov-muted);border-top:1px solid var(--sov-line);margin-top:40px;padding:24px 0}
.sov-shell .searchbox{border-top:3px solid var(--sov-blue);margin:24px 0}.sov-shell .candidate-item{border-color:var(--sov-line);border-radius:18px;padding:20px;color:var(--sov-navy);font-family:inherit;transition:border-color .15s,background .15s}.sov-shell .candidate-item:hover,.sov-shell .compare-choice:hover{background:var(--sov-soft);border-color:#9CB9EF}.sov-shell .candidate-name,.sov-shell .dash-title h2{font-weight:700}
.sov-shell .metrics{gap:14px;margin:22px 0}.sov-shell .metric-card{border:1px solid var(--sov-line);border-radius:20px;padding:20px;background:#FBFCFF;min-width:0}.sov-shell .metric-card:first-child{background:var(--sov-soft);border-color:#C7D9FF}.sov-shell .metric-card .n{color:var(--sov-navy);font-size:32px;font-weight:700;line-height:1.15;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.sov-shell .metric-card:first-child .n{color:#1B4FBF}
.sov-shell .tabs{gap:10px;margin:24px 0}.sov-shell .tab{display:inline-flex;align-items:center;gap:8px;min-height:48px;border:1px solid var(--sov-line);border-radius:14px;padding:12px 14px;background:#fff;color:var(--sov-muted);font-weight:700}.sov-shell .tab:hover{border-color:#9CB9EF;background:var(--sov-soft);color:#1B4FBF}.sov-shell .tab.active{background:var(--sov-blue);border-color:var(--sov-blue);color:#fff;box-shadow:0 4px 12px rgba(36,95,229,.12)}.sov-shell .tab .sov-icon{width:19px;height:19px}
.sov-shell .vote-comparison{border-color:var(--sov-line);border-radius:18px;box-shadow:var(--sov-shadow)}.sov-shell .comparison-item,.sov-shell .compare-picker{background:#FBFCFE;border-color:var(--sov-line);border-radius:14px}.sov-shell .comparison-current{background:var(--sov-soft);border-color:#9CB9EF}.sov-shell .compare-bar{background:var(--sov-blue)}.sov-shell .compare-track{background:var(--sov-soft)}
.sov-shell .map-style-switch{background:var(--sov-soft);border-color:var(--sov-line)}.sov-shell .map-style-button{font-weight:700}.sov-shell .map-style-button.active{background:var(--sov-blue);color:#fff}.sov-shell .map-canvas,.sov-shell .compare-map{border-color:var(--sov-line);border-radius:20px}
.sov-shell .empty{background:#FBFCFE;color:var(--sov-muted);border-color:#B8C6D9;border-radius:18px}.sov-shell table{font-variant-numeric:tabular-nums}.sov-shell th{color:var(--sov-muted);font-weight:700;letter-spacing:.05em;background:#F5F8FD}.sov-shell th,.sov-shell td{border-color:var(--sov-line)}.sov-shell tbody tr:hover{background:#F5F8FD}.sov-shell .error{border:1px solid #F3C4C4;color:#922626;background:#FFF2F2}
@media(max-width:760px){.sov-shell .wrap{padding:18px}.sov-shell .nav{padding:8px 0 22px;margin-bottom:24px;flex-wrap:wrap;gap:16px}.sov-shell .nav>.row{margin-left:auto;gap:8px}.sov-shell .nav .btn{padding:10px 14px;min-height:44px}.sov-shell .card{padding:20px;border-radius:20px}.sov-shell .hero{padding:22px 0 38px}.sov-shell .grid{grid-template-columns:1fr}.sov-shell .metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sov-shell .metric-card{padding:16px}.sov-shell .metric-card .n{font-size:26px}.sov-shell .tabs{gap:8px}.sov-shell .tab{padding:10px 12px;font-size:13px}.sov-shell .scopebar .field{min-width:0;width:100%}.sov-shell .map-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.sov-shell .map-canvas{height:520px}.sov-shell .auth{margin:28px auto}.brand-wordmark strong{font-size:19px}.brand-symbol{width:40px;height:40px}}
@media(max-width:380px){.sov-shell .brand>.tag{display:none}.sov-shell .nav>.row{margin-left:0}.sov-shell .wrap{padding:14px}}
@media(prefers-reduced-motion:reduce){.sov-shell *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
/* Public presentation: dark navy, yellow headlines, green actions.
   The working dashboard keeps its light surfaces for dense electoral data. */
.sov-shell .brand-wordmark strong{text-transform:uppercase;letter-spacing:.035em;font-size:20px}
.sov-shell .btn:not(.secondary){background:${brandColors.action};border-color:${brandColors.action}}
.sov-shell .btn:not(.secondary):hover{background:#0D6138;border-color:#0D6138;box-shadow:0 4px 16px rgba(19,120,71,.2)}
.sov-shell .tab.active,.sov-shell .map-style-button.active{background:${brandColors.action};border-color:${brandColors.action}}
body.sov-public{background:${brandColors.navy};color:#fff}
.sov-public .nav{border-color:#293248}.sov-public .brand-wordmark strong{color:#fff}.sov-public .brand-wordmark small{color:#B8C4D8}
.sov-public .brand>.tag{background:#FFD633;color:#090F1F}
.sov-public .hero{padding:48px 0 56px}.sov-public .hero h1{color:${brandColors.accent};text-transform:uppercase;font-size:clamp(36px,4.8vw,62px);max-width:1050px;line-height:1.08;letter-spacing:-.02em}
.sov-public .hero .muted{color:#E0E6F1}.sov-public .hero-eyebrow{color:${brandColors.accent}}.sov-public .hero-eyebrow:before{background:${brandColors.accent}}
.sov-public .card{color:#142B4A;box-shadow:none;border-color:#DCE4EF}.sov-public .card h1,.sov-public .card h2,.sov-public .card h3{color:#142B4A}
.sov-public main>h1{color:${brandColors.accent};text-transform:uppercase}
.sov-public .footer{color:#B8C4D8;border-color:#293248}
.hero-checks{display:flex;flex-wrap:wrap;gap:12px 28px;padding:0;margin:26px 0 0;list-style:none;font-size:14px;color:#E0E6F1}
.hero-checks li{display:inline-flex;gap:9px;align-items:center}.hero-checks li:before{content:'✓';color:#45D18B;font-size:21px;font-weight:700}
.sov-app .app-intro{background:${brandColors.navy};padding:30px 32px;border-radius:24px;margin-bottom:24px}
.sov-app .app-intro h1{color:${brandColors.accent};text-transform:uppercase;font-size:clamp(28px,3.2vw,40px);margin-top:12px}
.sov-app .app-intro .muted{color:#E0E6F1;margin-bottom:0}.sov-app .app-intro .hero-eyebrow{color:${brandColors.accent}}.sov-app .app-intro .hero-eyebrow:before{background:${brandColors.accent}}
@media(max-width:760px){.sov-public .hero{padding:24px 0 36px}.sov-shell .brand-wordmark strong{font-size:18px}.sov-app .app-intro{padding:24px 20px;border-radius:20px}.hero-checks{display:grid;gap:8px}}
@media print{body.sov-shell{background:white;color:#142B4A}.sov-shell .wrap{max-width:none;padding:0}.sov-shell .card{padding:0;border:0;box-shadow:none}.sov-shell .vote-comparison{position:static;box-shadow:none}.sov-shell .nav,.sov-shell .footer{display:none!important}}
`;
