/** Vector contours traced from the approved CAPIXABA TECH LABS identity. */
export const companyMark = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 384 356\" fill=\"none\"><path d=\"M 3.457 7.750 C 9.228 56.044, 35.427 100.579, 74.500 128.514 C 91.489 140.661, 107.169 147.741, 140.897 158.494 C 153.016 162.358, 166.758 168.806, 173.750 173.910 C 177.724 176.811, 177.999 177.321, 177.983 181.756 C 177.938 193.907, 171.570 210.871, 162.622 222.677 C 157.311 229.684, 150.707 235.556, 137 245.457 C 111.727 263.713, 95.935 283.198, 79.463 316.449 C 73.452 328.581, 65 349.133, 65 351.614 C 65 351.897, 69.061 347.157, 74.024 341.079 C 97.041 312.894, 120.310 294.230, 151 279.338 C 158.425 275.735, 169.900 270.156, 176.500 266.941 C 216.559 247.429, 240.032 219.872, 261.373 167.302 C 270.107 145.787, 276.134 135.788, 285.700 126.947 C 296.362 117.093, 301.138 115.480, 348 105.902 L 376.500 100.077 336.796 100.696 L 297.092 101.316 292.920 97.546 C 285.278 90.643, 277.076 87.599, 264.949 87.168 C 255.655 86.837, 253.531 87.094, 247.114 89.325 C 236.680 92.954, 229.730 97.484, 222.088 105.638 C 212.034 116.366, 204.813 131.986, 201.904 149.299 C 201.192 153.535, 200.341 157, 200.013 157 C 199.685 157, 198.172 154.462, 196.650 151.359 C 180.252 117.924, 149.770 91.550, 87.086 56.560 C 49.310 35.473, 30.530 23.391, 11.329 7.817 C 7.384 4.617, 3.845 2, 3.463 2 C 3.082 2, 3.079 4.588, 3.457 7.750 M 33.129 141.250 C 59.158 178.599, 87.136 197.013, 117.969 197.087 C 134.749 197.128, 148.674 192.688, 164.257 182.329 C 170.824 177.964, 171.148 177.578, 169.384 176.229 C 163.083 171.414, 135.789 161.237, 116.552 156.529 C 103.258 153.276, 33.181 138, 31.553 138 C 31.174 138, 31.883 139.463, 33.129 141.250\" stroke=\"none\" fill=\"#38BDF8\" fill-rule=\"evenodd\"/><path d=\"M 159 196.508 C 156.525 197.837, 149.183 201.031, 142.684 203.605 C 128.534 209.210, 121.154 213.798, 114.658 221.030 C 106.739 229.847, 100.939 243.578, 99.404 257.143 L 98.689 263.462 105.595 257.124 C 109.393 253.638, 118.836 246.579, 126.581 241.438 C 143.657 230.100, 152.609 221.187, 158.660 209.500 C 162.746 201.607, 165.473 193.957, 164.169 194.045 C 163.801 194.070, 161.475 195.178, 159 196.508\" stroke=\"none\" fill=\"#F38BB9\" fill-rule=\"evenodd\"/></svg>";
export const companyName = 'CAPIXABA TECH LABS';
export const companySignatureText = 'SIGA O VOTO · Tecnologia CAPIXABA TECH LABS';
export function companySignature(auth = false) {
 return `<div class="ctl-signature${auth ? ' ctl-auth' : ''}" aria-label="${auth ? 'Desenvolvido por' : 'Tecnologia'} ${companyName}">${auth ? '<small class="ctl-prefix">Desenvolvido por</small>' : ''}<div class="ctl-lockup"><span class="ctl-symbol" aria-hidden="true">${companyMark}</span>${auth ? '<span class="ctl-wordmark"><strong>CAPIXABA</strong><small>TECH LABS</small></span>' : '<span>Tecnologia <strong>CAPIXABA TECH LABS</strong></span>'}</div></div>`;
}
type PrintText = (value:unknown,x:number,y:number,size:number,fill?:string,bold?:boolean)=>string;
export function companyExport(x:number,y:number,size:number,text:PrintText) {
 return `<g aria-label="${companySignatureText}">${companyMark.replace('<svg ',`<svg x="${x}" y="${y}" width="${size}" height="${size}" `)}${text(companySignatureText,x+size+18,y+size*.72,size*.56,'#081525')}</g>`;
}
export const companyCss = `
.ctl-signature{font-size:11px;line-height:1.5;color:#56657A;flex:none}
.ctl-lockup{display:flex;align-items:center;gap:9px}.ctl-lockup strong{font-weight:700;letter-spacing:.035em}
.ctl-symbol{display:block;width:26px;height:24px;flex:none}.ctl-symbol svg{display:block;width:100%;height:100%}
.sov-shell .footer{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}
.sov-public .ctl-signature{color:#B8C4D8}
.ctl-auth,.sov-public .ctl-auth{margin-top:24px;padding-top:20px;border-top:1px solid #DCE4EF;text-align:center;color:#081525}
.ctl-auth .ctl-lockup{justify-content:center;gap:12px}.ctl-auth .ctl-symbol{width:40px;height:37px}
.ctl-prefix{display:block;margin-bottom:10px;font-size:11px;color:#56657A}
.ctl-wordmark{display:flex;flex-direction:column;text-align:left;line-height:1.25}
.ctl-wordmark strong{font-size:16px;letter-spacing:.07em}.ctl-wordmark small{font-size:10px;letter-spacing:.3em;margin-top:3px}
@media(max-width:700px){.sov-shell .footer{align-items:flex-start;flex-direction:column;gap:14px}}
@media print{.sov-shell .footer{display:flex!important;margin-top:20px;padding:12px 0;break-inside:avoid}.sov-shell .footer,.sov-shell .ctl-signature{color:#081525}.ctl-auth{display:none}}
`;
