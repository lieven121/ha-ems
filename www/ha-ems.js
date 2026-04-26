// src/shared/styles.ts
var CSS = `

:host { display: block; }

.root {
  --bg:#0a0c10; --surface:#111418; --surface2:#1a1e26; --border:#252a35;
  --text:#e2e8f0; --text-dim:#64748b; --text-bright:#f8fafc;
  --accent:#3b82f6; --now:#facc15;
  background:var(--bg); color:var(--text);
  font-family:inherit;
  padding:16px; border-radius:12px;
  user-select:none;
  container-type:inline-size;
}
*{margin:0;padding:0;box-sizing:border-box;}

header{display:flex;align-items:baseline;gap:16px;margin-bottom:20px;}
header h1{font-family:var(--code-font-family, monospace);font-size:16px;font-weight:600;color:var(--text-bright);letter-spacing:.05em;text-transform:uppercase;}
header span{font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);letter-spacing:.1em;}

.stats{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;flex:1;min-width:140px;}
@container(max-width:360px){.stat-card{flex:1 1 100%;min-width:unset;}}
.stat-label{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;}
.stat-value{font-family:var(--code-font-family, monospace);font-size:18px;font-weight:700;color:var(--text-bright);}
.stat-unit{font-size:10px;font-weight:400;color:var(--text-dim);margin-left:2px;}
.stat-sub{font-family:var(--code-font-family,monospace);font-size:9px;color:var(--text-dim);margin-top:2px;}
.stat-price-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
.stat-inj{font-family:var(--code-font-family,monospace);font-size:12px;font-weight:600;color:var(--text-dim);white-space:nowrap;}
.stat-action{font-family:var(--code-font-family,monospace);font-size:10px;font-weight:600;margin-top:6px;}
.stat-sep{color:var(--text-dim);margin:0 3px;font-weight:400;}
.stat-value.compound{font-size:14px;}

.controls{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;}
.btn{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:6px;cursor:pointer;font-family:var(--code-font-family, monospace);font-size:10px;font-weight:500;letter-spacing:.05em;transition:all .15s;}
.btn:hover{border-color:var(--accent);color:var(--accent);}
.btn.active{background:var(--accent);border-color:var(--accent);color:white;}
.date-label{font-family:var(--code-font-family, monospace);font-size:11px;color:var(--text-dim);margin-left:auto;}

/* Chart layout */
.chart-card{display:flex;flex-direction:row;background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.chart-card:has(+ .brush-wrap:not([hidden])){border-radius:12px 12px 0 0;}
.y-axis{width:30px;flex-shrink:0;padding:16px 4px 0 0;position:relative;background:var(--surface);border-right:1px solid var(--border);}
.y-label{position:absolute;right:4px;font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);transform:translateY(-50%);white-space:nowrap;}
.chart-right{flex:1;display:flex;flex-direction:column;min-width:0;}
.chart-wrap{overflow-x:auto;overflow-y:visible;padding:16px 16px 0;flex-shrink:0;}
.chart-body{min-width:640px;position:relative;display:flex;flex-direction:column;}
.grid-lines{position:absolute;top:0;left:0;right:0;height:220px;pointer-events:none;z-index:0;}
.grid-line{position:absolute;left:0;right:0;height:1px;background:var(--border);opacity:.45;}

.now-line{position:absolute;top:0;width:2px;background:var(--now);opacity:.85;pointer-events:none;z-index:15;transform:translateX(-50%);border-radius:1px;box-shadow:0 0 6px rgba(250,204,21,.45);}
.now-label{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-family:var(--code-font-family, monospace);font-size:8px;color:var(--now);white-space:nowrap;background:var(--surface);padding:1px 4px;border-radius:3px;letter-spacing:.05em;}

.bars{display:flex;align-items:flex-end;height:220px;gap:1px;position:relative;z-index:1;}
.slot{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative;cursor:pointer;min-width:0;}
.slot:hover .price-bar{filter:brightness(1.3);}
.slot.hl .price-bar{filter:brightness(1.6);outline:2px solid rgba(255,255,255,.4);outline-offset:1px;}
.slot.now-slot .price-bar{outline:1px solid rgba(250,204,21,.3);}
.price-bar{width:100%;border-radius:2px 2px 0 0;transition:filter .1s;}

#tooltip{position:fixed;z-index:8000;background:#0d1017;border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:var(--code-font-family,monospace);font-size:10px;color:var(--text-bright);white-space:nowrap;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.6);transition:opacity .1s;opacity:0;}
#tooltip.visible{opacity:1;}
.tip-time{color:var(--text-dim);margin-bottom:2px;}
.tip-act{margin-top:2px;}

.action-strip{display:flex;gap:1px;height:14px;margin-top:3px;}
.ac{flex:1;border-radius:2px;cursor:pointer;transition:filter .1s;}
.ac:hover{filter:brightness(1.4);}

.x-axis{display:flex;margin-top:4px;padding-bottom:8px;}
.x-lbl{flex:1;font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-align:center;}

/* Brush */
.brush-wrap{flex-shrink:0;padding:8px 16px 12px;border:1px solid var(--border);border-top:none;background:var(--surface);border-radius:0 0 12px 12px;margin-bottom:2px;}
.brush-wrap.brush-solo{border:none;background:transparent;padding:4px 0 8px;border-radius:0;margin-bottom:0;}
.brush-label-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.brush-label{font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;}
.brush-track{position:relative;height:22px;border-radius:4px;overflow:visible;cursor:pointer;user-select:none;}
.brush-segs{display:flex;height:100%;border-radius:4px;overflow:hidden;}
.brush-seg{flex:1;height:100%;transition:filter .08s;}
.brush-seg:hover{filter:brightness(1.3);}
.brush-dots{position:absolute;top:100%;left:0;right:0;height:8px;pointer-events:none;}
.brush-dot{position:absolute;width:3px;height:3px;border-radius:50%;transform:translate(-50%,2px);}
.brush-now{position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:1px;background:var(--now);transform:translateX(-50%);pointer-events:none;box-shadow:0 0 5px rgba(250,204,21,.5);}
.brush-cursor{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:2px;background:#fff;transform:translateX(-50%);pointer-events:none;box-shadow:0 0 6px rgba(255,255,255,.5);display:none;}

/* Legend */
.legend-wrap{display:flex;gap:24px;margin-top:16px;flex-wrap:wrap;}
.legend-title{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;}
.legend-items{display:flex;gap:10px;flex-wrap:wrap;}
.li{display:flex;align-items:center;gap:5px;font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);}
.ls{width:14px;height:9px;border-radius:2px;flex-shrink:0;}

/* Empty / loading state */
.empty{padding:40px;text-align:center;font-family:var(--code-font-family, monospace);font-size:12px;color:var(--text-dim);}

/* \u2500\u2500 Popup \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;}
#overlay.open{display:flex;}
#popup{background:var(--bg);border:1px solid var(--border);border-radius:14px;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 80px);overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.85);animation:popIn .17s cubic-bezier(.34,1.56,.64,1);container-type:inline-size;container-name:popup;}
@keyframes popIn{from{opacity:0;transform:scale(.92) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}

.ph{padding:14px 16px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;}
.ph-nav{display:flex;align-items:center;gap:10px;}
.ph-nav-btn{background:none;border:1px solid var(--border);color:var(--text-dim);width:26px;height:26px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;font-family:var(--code-font-family, monospace);}
.ph-nav-btn:hover{border-color:var(--text-bright);color:var(--text-bright);}
.ph-nav-btn:disabled{opacity:.2;cursor:default;}
.ph-title{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.12em;margin-bottom:3px;}
.ph-time{font-family:var(--code-font-family, monospace);font-size:17px;font-weight:700;color:var(--text-bright);}
.ph-close{background:none;border:1px solid var(--border);color:var(--text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;}
.ph-close:hover{border-color:var(--text-bright);color:var(--text-bright);}

/* Popup mini nav bar */
.pop-nav-wrap{padding:10px 16px 12px;border-bottom:1px solid var(--border);}
.pop-nav-label{font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;}
.pop-nav-track{position:relative;height:14px;border-radius:3px;overflow:visible;cursor:pointer;user-select:none;}
.pop-nav-segs{display:flex;height:100%;border-radius:3px;overflow:hidden;}
.pop-nav-seg{flex:1;height:100%;}
.pop-nav-dots{position:absolute;top:100%;left:0;right:0;height:8px;pointer-events:none;}
.pop-nav-dot{position:absolute;width:3px;height:3px;border-radius:50%;transform:translate(-50%,2px);}
.pop-nav-cursor{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:2px;background:var(--text-bright);transform:translateX(-50%);pointer-events:none;box-shadow:0 0 6px rgba(255,255,255,.5);}
.pop-nav-now{position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:1px;background:var(--now);transform:translateX(-50%);pointer-events:none;opacity:.85;}

/* Price trio */
.price-trio{display:flex;align-items:center;gap:4px;padding:12px 16px;border-bottom:1px solid var(--border);}
.pt-slot{flex:1;background:var(--surface2);border-radius:8px;padding:9px 10px 7px;min-width:0;}
.pt-slot.cur{background:var(--surface);outline:1px solid var(--border);}
.pt-slot.is-now{outline:1px solid var(--now);box-shadow:0 0 10px rgba(250,204,21,.25);}
.pt-slot.nav{cursor:pointer;transition:background .12s;}
.pt-slot.nav:hover{background:var(--surface);}
.pt-label{font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;}
.pt-time{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);margin-bottom:4px;}
.pt-price{font-family:var(--code-font-family, monospace);font-size:15px;font-weight:700;line-height:1;white-space:nowrap;}
.pt-unit{font-size:9px;font-weight:400;opacity:.7;margin-left:1px;}
.pt-inj{font-family:var(--code-font-family,monospace);font-size:10px;color:var(--text-dim);margin-top:2px;}
.pt-bar{height:3px;border-radius:2px;margin-top:5px;}
.pt-arrow{color:var(--border);font-size:16px;flex-shrink:0;padding-bottom:6px;}

/* Popup detail section */
.pop-detail{padding:8px 16px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:0 12px;}
.pop-section-title{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;}
.pop-row{display:flex;flex-direction:column;gap:2px;padding:6px 0;border-bottom:1px solid var(--border);}
.pop-row:last-child{border-bottom:none;}
.pop-row-label{font-family:var(--code-font-family,monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;}
.pop-row-value{font-family:var(--code-font-family,monospace);font-size:13px;color:var(--text-bright);font-weight:600;}

.device-list{margin-top:8px;display:flex;flex-direction:column;gap:5px;}
.device-item{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface2);border-radius:7px;border:1px solid var(--border);}
.device-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.device-name{font-family:var(--code-font-family, monospace);font-size:11px;color:var(--text-bright);flex:1;}
.device-watt{font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);}

/* Edit section */
.edit-section{padding:0 16px 16px;}
.edit-row{display:flex;align-items:center;gap:8px;margin-top:8px;}
.edit-label{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);white-space:nowrap;min-width:80px;}
.edit-input{background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text-bright);font-family:var(--code-font-family, monospace);font-size:11px;padding:5px 8px;width:100%;transition:border-color .12s;}
.edit-input:focus{outline:none;border-color:var(--accent);}
.edit-unit{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);white-space:nowrap;}
.edit-btn{margin-top:10px;background:var(--accent);border:none;border-radius:6px;color:white;font-family:var(--code-font-family, monospace);font-size:10px;font-weight:600;padding:7px 14px;cursor:pointer;transition:opacity .12s;width:100%;letter-spacing:.05em;}
.edit-btn:hover{opacity:.85;}
.edit-hint{font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);margin-top:8px;line-height:1.5;padding:6px 8px;background:var(--surface2);border-radius:4px;border:1px solid var(--border);}

/* Action editor */
.action-section{padding:12px 16px 16px;border-top:1px solid var(--border);}
.action-section-title{font-family:var(--code-font-family,monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;}
.action-columns{display:flex;gap:10px;}
.action-col{flex:1;min-width:0;}
.action-col-title{font-family:var(--code-font-family,monospace);font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;opacity:.6;}
/* Action editor: stacked by default, side-by-side on wider popup */
.action-editor{display:flex;flex-direction:column;gap:10px;}
@container popup (min-width:460px){
  .action-editor{flex-direction:row;align-items:flex-start;}
  .ap-grid{min-width:130px;flex-shrink:0;}
  .params-panel{flex:1;min-width:0;}
}
.ap-grid{display:flex;flex-direction:column;gap:5px;}
.ap-btn{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-family:var(--code-font-family,monospace);font-size:11px;font-weight:500;transition:all .12s;text-align:left;width:100%;}
.ap-btn:hover{border-color:var(--btn-c,#888);color:var(--btn-c,#888);}
.ap-btn.sel{border-color:var(--btn-c);color:var(--btn-c);background:color-mix(in srgb,var(--btn-c) 14%,var(--surface));}
.ap-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.params-panel{display:flex;flex-direction:column;gap:8px;}
.action-params{display:flex;flex-direction:column;gap:6px;}
.param-row{display:flex;align-items:center;gap:7px;}
.param-label{font-family:var(--code-font-family,monospace);font-size:9px;color:var(--text-dim);white-space:nowrap;min-width:60px;}
.param-input{background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text-bright);font-family:var(--code-font-family,monospace);font-size:11px;padding:5px 8px;width:100%;transition:border-color .12s;}
.param-input:focus{outline:none;border-color:var(--accent);}
.param-unit{font-family:var(--code-font-family,monospace);font-size:9px;color:var(--text-dim);white-space:nowrap;}
.param-optional{font-size:8px;color:var(--text-dim);margin-left:2px;opacity:.6;}
/* Toggle button (use solar, etc.) */
.toggle-btn{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);color:var(--text-dim);cursor:pointer;font-family:var(--code-font-family,monospace);font-size:11px;font-weight:500;transition:all .12s;text-align:left;width:100%;}
.toggle-btn:hover{border-color:var(--tc,#888);}
.toggle-btn.on{border-color:var(--tc,#888);color:var(--tc,#888);background:color-mix(in srgb,var(--tc,#888) 14%,var(--surface));}
.toggle-btn-dot{width:8px;height:8px;border-radius:50%;background:var(--tc,#888);opacity:.35;flex-shrink:0;}
.toggle-btn.on .toggle-btn-dot{opacity:1;}
/* Watt-card: clickable card that toggles and reveals an embedded input */
.watt-card{border:1px solid var(--border);border-radius:8px;overflow:hidden;cursor:pointer;transition:border-color .12s;}
.watt-card:hover{border-color:var(--wc-c,#888);}
.watt-card.on{border-color:var(--wc-c,#888);}
.watt-card-header{display:flex;align-items:center;gap:7px;padding:7px 10px;}
.watt-card-dot{width:8px;height:8px;border-radius:50%;background:var(--wc-c,#888);opacity:.35;flex-shrink:0;}
.watt-card.on .watt-card-dot{opacity:1;}
.watt-card-label{font-family:var(--code-font-family,monospace);font-size:11px;color:var(--text-dim);flex:1;}
.watt-card.on .watt-card-label{color:var(--wc-c,#888);}
.watt-card-input-wrap{display:none;padding:6px 10px 8px;border-top:1px solid var(--border);gap:4px;flex-direction:column;}
.watt-card.on .watt-card-input-wrap{display:flex;}
.watt-card-row{display:flex;align-items:center;gap:7px;}
.watt-card-sub-label{font-family:var(--code-font-family,monospace);font-size:9px;color:var(--text-dim);white-space:nowrap;min-width:50px;}
.car-sep{width:1px;background:var(--border);flex-shrink:0;margin:0 4px;}
.action-locked-row{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);}
.action-locked-label{font-family:var(--code-font-family,monospace);font-size:9px;color:var(--text-dim);}
.action-btn-row{display:flex;gap:6px;margin-top:10px;}
.action-copy-btn,.action-paste-btn{display:flex;align-items:center;justify-content:center;padding:8px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-dim);cursor:pointer;transition:background .12s,color .12s,border-color .12s;--mdc-icon-size:18px;}
.action-copy-btn:hover{background:var(--border);color:var(--text-bright);}
.action-copy-btn.success{background:#16a34a;color:#fff;border-color:#16a34a;}
.action-paste-btn:not([disabled]):hover{background:var(--border);color:var(--text-bright);}
.action-paste-btn[disabled]{opacity:0.35;cursor:default;}
.action-paste-btn.success{background:#16a34a;color:#fff;border-color:#16a34a;}
.action-paste-btn.error{background:#dc2626;color:#fff;border-color:#dc2626;}
.action-apply-btn{flex:1;padding:9px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-family:var(--code-font-family,monospace);font-size:12px;font-weight:600;cursor:pointer;transition:background .12s;}
.action-apply-btn:hover{background:#2563eb;}
.action-apply-btn.success{background:#16a34a;}
.action-apply-btn.error{background:#dc2626;}

.action-strip[hidden]{display:none;}
.brush-wrap[hidden]{display:none;}
.battery-svg{position:absolute;top:0;left:0;width:100%;pointer-events:none;overflow:visible;}
.battery-svg[hidden]{display:none;}
header[hidden]{display:none;}
#chart-card[hidden]{display:none;}
#stats[hidden]{display:none;}
#day-btns[hidden]{display:none;}
.legend-wrap[hidden]{display:none;}

/* Light theme */
.root.theme-light {
  --bg:#f8fafc; --surface:#ffffff; --surface2:#f1f5f9; --border:#e2e8f0;
  --text:#1e293b; --text-dim:#94a3b8; --text-bright:#0f172a;
  --accent:#3b82f6; --now:#ca8a04;
}
/* System theme: use light vars when OS is set to light */
@media (prefers-color-scheme: light) {
  .root.theme-system {
    --bg:#f8fafc; --surface:#ffffff; --surface2:#f1f5f9; --border:#e2e8f0;
    --text:#1e293b; --text-dim:#94a3b8; --text-bright:#0f172a;
    --accent:#3b82f6; --now:#ca8a04;
  }
}
/* Home Assistant theme: inherit from HA CSS custom properties */
.root.theme-ha {
  --bg:var(--card-background-color, #fff);
  --surface:var(--secondary-background-color, #f5f5f5);
  --surface2:var(--primary-background-color, #fafafa);
  --border:var(--divider-color, #e0e0e0);
  --text:var(--primary-text-color, #212121);
  --text-dim:var(--secondary-text-color, #727272);
  --text-bright:var(--primary-text-color, #212121);
  --accent:var(--primary-color, #3b82f6);
  --now:var(--warning-color, #ff9800);
  border-radius:var(--ha-card-border-radius, 12px);
  box-shadow:var(--ha-card-box-shadow, none);
}
`;

// src/shared/constants.ts
var CHART_H = 220;
var Y_STEPS = [0, 10, 20, 30, 40, 50];
var DEVICE_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#ec4899",
  "#10b981",
  "#f43f5e",
  "#a3e635"
];

// src/shared/utils.ts
function priceColor(p) {
  const stops = [
    { v: -10, r: 59, g: 130, b: 246 },
    { v: 5, r: 59, g: 130, b: 246 },
    { v: 8, r: 34, g: 197, b: 94 },
    { v: 20, r: 34, g: 197, b: 94 },
    { v: 25, r: 249, g: 115, b: 22 },
    { v: 32, r: 220, g: 38, b: 38 },
    { v: 40, r: 127, g: 29, b: 29 },
    { v: 55, r: 14, g: 14, b: 14 }
  ];
  if (p <= stops[0].v) return "rgb(59,130,246)";
  if (p >= stops[stops.length - 1].v) return "rgb(14,14,14)";
  let lo = stops[0], hi = stops[1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i].v && p <= stops[i + 1].v) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const t = (p - lo.v) / (hi.v - lo.v);
  return `rgb(${Math.round(lo.r + (hi.r - lo.r) * t)},${Math.round(lo.g + (hi.g - lo.g) * t)},${Math.round(lo.b + (hi.b - lo.b) * t)})`;
}
function slotAction(slot) {
  const ACTION_MAP = {
    idle: { key: "idle", label: "Idle", color: "#374151" },
    charge: { key: "charge", label: "Charge", color: "#16a34a" },
    discharge: { key: "discharge", label: "Discharge", color: "#dc2626" },
    use_net: { key: "use_net", label: "Use Net", color: "#2563eb" },
    car_charge: { key: "car_charge", label: "Car Charge", color: "#ca8a04" }
  };
  if (slot.action && ACTION_MAP[slot.action]) return ACTION_MAP[slot.action];
  const ov = slot.battery_manual_override_w;
  if (ov != null) {
    if (ov > 0) return ACTION_MAP.charge;
    if (ov < 0) return ACTION_MAP.discharge;
  }
  return ACTION_MAP.idle;
}
function slotHasCar(slot) {
  return slot.action === "car_charge";
}
function localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function slotTimeStr(slot) {
  const d = new Date(slot.start ?? slot.time);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function slotEndTimeStr(slots, idx) {
  if (idx + 1 < slots.length) return slotTimeStr(slots[idx + 1]);
  const d = new Date(slots[idx].start ?? slots[idx].time);
  const dur = idx > 0 ? d.getTime() - new Date(slots[idx - 1].start ?? slots[idx - 1].time).getTime() : 36e5;
  const end = new Date(d.getTime() + dur);
  return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

// src/dashboard/dashboard-graph.ts
function renderMainChart(sr, slots, config, hass, nowIdx, onSlotClick) {
  const n = slots.length;
  const prices = slots.map((s) => s.price);
  const maxP = Math.max(...prices, 45);
  const ns = nowIdx;
  const ySteps = Y_STEPS.filter((v) => v <= maxP + 5);
  sr.getElementById("y-axis").innerHTML = ySteps.map(
    (v) => `<div class="y-label" style="bottom:${v / maxP * CHART_H}px">${v}</div>`
  ).join("");
  sr.getElementById("grid-lines").innerHTML = ySteps.map(
    (v) => `<div class="grid-line" style="bottom:${v / maxP * CHART_H}px"></div>`
  ).join("");
  let nowLineHtml = "";
  if (ns >= 0) {
    const now = /* @__PURE__ */ new Date();
    const t0 = new Date(slots[ns].start ?? slots[ns].time);
    const t1 = ns + 1 < n ? new Date(slots[ns + 1].start ?? slots[ns + 1].time) : new Date(t0.getTime() + 36e5);
    const frac = Math.min(1, Math.max(0, (now.getTime() - t0.getTime()) / (t1.getTime() - t0.getTime())));
    const pct = ((ns + frac) / n * 100).toFixed(2);
    nowLineHtml = `<div class="now-line" style="left:${pct}%;height:${CHART_H}px">
      <div class="now-label">Now</div></div>`;
  }
  sr.getElementById("bars").innerHTML = nowLineHtml + slots.map((slot, i) => {
    const h = Math.max(2, slot.price / maxP * CHART_H);
    const col = priceColor(slot.price);
    return `<div class="slot${i === ns ? " now-slot" : ""}" data-i="${i}">
      <div class="price-bar" style="height:${h}px;background:${col}"></div>
    </div>`;
  }).join("");
  const tooltipEl = sr.getElementById("tooltip");
  sr.getElementById("bars").querySelectorAll(".slot").forEach((el) => {
    const i = +el.dataset.i;
    el.addEventListener("click", () => onSlotClick(i));
    el.addEventListener("mouseenter", () => {
      const slot = slots[i];
      const col = priceColor(slot.price);
      const act = slotAction(slot);
      tooltipEl.innerHTML = `<div class="tip-time">${slotTimeStr(slot)}\u2013${slotEndTimeStr(slots, i)}</div><div style="color:${col};font-weight:700">${slot.price.toFixed(2)} ct${slot._injPrice ? ` <span style="color:var(--text-dim);font-weight:400">\u2191 ${slot._injPrice.toFixed(2)}</span>` : ""}</div><div class="tip-act" style="color:${act.color}">${act.label}</div>`;
      const rect = el.getBoundingClientRect();
      const top = rect.top - tooltipEl.offsetHeight - 8;
      const left = rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2;
      tooltipEl.style.top = `${Math.max(4, top)}px`;
      tooltipEl.style.left = `${Math.min(window.innerWidth - tooltipEl.offsetWidth - 4, Math.max(4, left))}px`;
      tooltipEl.classList.add("visible");
    });
    el.addEventListener("mousemove", () => {
      const rect = el.getBoundingClientRect();
      const top = rect.top - tooltipEl.offsetHeight - 8;
      const left = rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2;
      tooltipEl.style.top = `${Math.max(4, top)}px`;
      tooltipEl.style.left = `${Math.min(window.innerWidth - tooltipEl.offsetWidth - 4, Math.max(4, left))}px`;
    });
    el.addEventListener("mouseleave", () => tooltipEl.classList.remove("visible"));
  });
  sr.getElementById("action-strip").innerHTML = slots.map((slot, i) => {
    const act = slotAction(slot);
    const hasCar = slotHasCar(slot);
    let bg;
    if (act.key === "car_charge") {
      bg = "#ca8a04";
    } else if (hasCar) {
      bg = `linear-gradient(to right, ${act.color} 60%, #ca8a04 60%)`;
    } else {
      bg = act.color;
    }
    const title = hasCar && act.key !== "car_charge" ? `${act.label} + Car` : act.label;
    return `<div class="ac" data-i="${i}" style="background:${bg}" title="${title}"></div>`;
  }).join("");
  sr.getElementById("action-strip").querySelectorAll(".ac").forEach((el) => {
    el.addEventListener("click", () => onSlotClick(+el.dataset.i));
  });
  const every = Math.max(1, Math.floor(n / 12));
  sr.getElementById("x-axis").innerHTML = slots.map(
    (slot, i) => `<div class="x-lbl">${i % every === 0 ? slotTimeStr(slot) : ""}</div>`
  ).join("");
}
function renderBatteryOverlay(sr, slots, config, hass) {
  const n = slots.length;
  const battSvg = sr.getElementById("battery-svg");
  const showBattery = config.layout?.show_battery !== false && !!config.integration?.battery_entity;
  if (battSvg) {
    if (showBattery && n > 0) {
      const battEntity = config.integration.battery_entity;
      const battState = hass?.states[battEntity];
      const currentPct = battState ? parseFloat(battState.state) : null;
      const lineColor = config.integration?.battery_line_color ? `rgb(${config.integration.battery_line_color.r},${config.integration.battery_line_color.g},${config.integration.battery_line_color.b})` : "#06b6d4";
      battSvg.setAttribute("viewBox", `0 0 100 ${CHART_H}`);
      battSvg.setAttribute("preserveAspectRatio", "none");
      const slotW = 100 / n;
      const predPoints = slots.map((s, idx) => {
        if (s.battery_prediction == null) return null;
        return { x: (idx + 0.5) * slotW, y: (1 - s.battery_prediction / 100) * CHART_H };
      }).filter(Boolean);
      let svgContent = "";
      if (predPoints.length > 1) {
        const pathD = predPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
        svgContent += `<path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="0.6" stroke-dasharray="1.5 1" opacity="0.75" vector-effect="non-scaling-stroke"/>`;
      }
      if (currentPct != null && !isNaN(currentPct)) {
        const y = (1 - currentPct / 100) * CHART_H;
        svgContent += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${lineColor}" stroke-width="0.8" opacity="0.9" vector-effect="non-scaling-stroke"/>`;
        svgContent += `<text x="99" y="${Math.max(6, y - 1.5)}" text-anchor="end" fill="${lineColor}" font-size="5" font-family="monospace" opacity="0.9" vector-effect="non-scaling-stroke">${currentPct.toFixed(0)}%</text>`;
      }
      battSvg.innerHTML = svgContent;
      battSvg.hidden = false;
    } else {
      battSvg.innerHTML = "";
      battSvg.hidden = true;
    }
  }
}
function renderBrush(sr, slots, activeIdx, nowIdx, config, onOpen, onScroll) {
  const n = slots.length;
  const ns = nowIdx;
  sr.getElementById("brush-segs").innerHTML = slots.map(
    (slot, i) => `<div class="brush-seg" data-i="${i}" style="background:${priceColor(slot.price)}"></div>`
  ).join("");
  sr.getElementById("brush-dots").innerHTML = slots.map((slot, i) => {
    const act = slotAction(slot);
    if (act.key === "idle") return "";
    return `<div class="brush-dot" style="left:${(i + 0.5) / n * 100}%;background:${act.color}"></div>`;
  }).join("");
  const brushNow = sr.getElementById("brush-now");
  if (ns >= 0) {
    brushNow.style.left = `${(ns + 0.5) / n * 100}%`;
    brushNow.style.display = "block";
    sr.getElementById("brush-now-label").textContent = `Now ${slotTimeStr(slots[ns])}`;
  } else {
    brushNow.style.display = "none";
  }
  const cur = sr.getElementById("brush-cursor");
  if (activeIdx !== null) {
    cur.style.display = "block";
    cur.style.left = `${(activeIdx + 0.5) / n * 100}%`;
  } else {
    cur.style.display = "none";
  }
  const chartHidden = config.layout?.show_chart === false;
  const track = sr.getElementById("brush-track");
  track.onclick = (e) => {
    const rect = track.getBoundingClientRect();
    const idx = Math.floor((e.clientX - rect.left) / rect.width * n);
    if (idx >= 0 && idx < n) {
      if (chartHidden || activeIdx !== null) onOpen(idx);
      else onScroll(idx);
    }
  };
  sr.querySelectorAll(".brush-seg").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = +el.dataset.i;
      if (chartHidden || activeIdx !== null) onOpen(i);
      else onScroll(i);
    });
  });
}
function scrollToSlot(sr, totalSlots, i, instant) {
  const wrap = sr.getElementById("chart-wrap");
  const body = sr.getElementById("chart-body");
  const doScroll = () => {
    const slotW = body.scrollWidth / totalSlots;
    if (slotW === 0) return;
    wrap.scrollTo({ left: Math.max(0, (i + 0.5) * slotW - wrap.clientWidth / 2), behavior: instant ? "instant" : "smooth" });
  };
  if (instant || body.scrollWidth > 0) {
    requestAnimationFrame(doScroll);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(doScroll));
  }
}

// src/dashboard/dashboard-dialog.ts
var _clipboard = null;
var ACTION_LABELS = {
  idle: "Idle",
  charge: "Charge",
  discharge: "Discharge",
  use_net: "Use Net",
  car_charge: "Car Charge"
};
function renderPopup(ctx) {
  const { sr, slots, config, hass, kwpEntityId, devColors } = ctx;
  const i = ctx.slotIdx;
  const n = slots.length;
  const slot = slots[i];
  const ns = ctx.nowIdx;
  const act = slotAction(slot);
  const entryId = config.integration?.entry_id;
  const deviceId = config.integration?.device_id;
  const navSegs = slots.map(
    (s, si) => `<div class="pop-nav-seg" data-i="${si}" style="background:${priceColor(s.price)};cursor:pointer"></div>`
  ).join("");
  const navDots = slots.map((s, si) => {
    const a = slotAction(s);
    if (a.key === "idle") return "";
    return `<div class="pop-nav-dot" style="left:${(si + 0.5) / n * 100}%;background:${a.color}"></div>`;
  }).join("");
  const trio = [{ label: "Prev", idx: i - 1 }, { label: "Now", idx: i, cur: true }, { label: "Next", idx: i + 1 }];
  const trioHtml = trio.map(({ label, idx, cur }, ti) => {
    const arrow = ti < 2 ? `<div class="pt-arrow">\u203A</div>` : "";
    const isNav = !cur && idx >= 0 && idx < n;
    const isNow = idx === ns;
    if (idx < 0 || idx >= n) return `<div class="pt-slot${cur ? " cur" : ""}${isNow ? " is-now" : ""}">      <div class="pt-label">${label}</div><div class="pt-time">\u2013</div>      <div class="pt-price" style="color:#4a5568">\u2013</div></div>${arrow}`;
    const p = slots[idx].price, c = priceColor(p), w = Math.min(100, Math.max(5, p / 52 * 100));
    const injLine = cur && slots[idx]._injPrice ? `<div class="pt-inj">\u2191 ${slots[idx]._injPrice.toFixed(2)} <span class="pt-unit">ct</span></div>` : "";
    return `<div class="pt-slot${cur ? " cur" : ""}${isNav ? " nav" : ""}${isNow ? " is-now" : ""}"${isNav ? ` data-nav="${idx}"` : ""}
      title="${isNav ? "Click to navigate" : ""}">
      <div class="pt-label">${label}</div>
      <div class="pt-time">${slotTimeStr(slots[idx])}</div>
      <div class="pt-price" style="color:${c}">${p.toFixed(2)}<span class="pt-unit">ct</span></div>
      ${injLine}
      <div class="pt-bar" style="background:${c};width:${w}%"></div>
    </div>${arrow}`;
  }).join("");
  const devHtml = (slot.devices || []).length ? `<div class="device-list">${slot.devices.map((d) => `
        <div class="device-item">
          <div class="device-dot" style="background:${devColors[d.name] || "#3b82f6"}"></div>
          <div class="device-name">${d.name}</div>
          <div class="device-watt">${d.manual_override_w ?? d.allocated_wattage_w} W</div>
        </div>`).join("")}</div>` : `<div style="font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);margin-top:4px">No devices scheduled</div>`;
  const curAction = slot.action || (slot.battery_manual_override_w > 0 ? "charge" : slot.battery_manual_override_w < 0 ? "discharge" : "idle");
  const aCfg = slot.action_config || {};
  const kwpW = Math.round((parseFloat(hass?.states[kwpEntityId]?.state) || 3) * 1e3);
  const editHtml = deviceId || entryId ? (() => {
    const actions = [
      { key: "idle", label: "Idle", color: "#374151" },
      { key: "charge", label: "Charge", color: "#16a34a" },
      { key: "use_net", label: "Use Net", color: "#2563eb" },
      { key: "discharge", label: "Discharge", color: "#dc2626" },
      { key: "car_charge", label: "Car Charge", color: "#ca8a04" }
    ];
    const actionBtns = actions.map(
      (a) => `<button class="ap-btn${curAction === a.key ? " sel" : ""}" data-action="${a.key}" style="--btn-c:${a.color}">
        <div class="ap-dot" style="background:${a.color}"></div>${a.label}
      </button>`
    ).join("");
    const chargeW = curAction === "charge" ? aCfg.wattage ?? kwpW : kwpW;
    const dischargeW = curAction === "discharge" ? aCfg.wattage ?? kwpW : kwpW;
    const netW = curAction === "use_net" ? aCfg.max_wattage ?? kwpW : kwpW;
    const solarOnUseNet = curAction === "use_net" ? aCfg.use_solar !== false : true;
    const solarOnCar = curAction === "car_charge" ? aCfg.use_solar !== false : true;
    const carNetOn = curAction === "car_charge" && (aCfg.use_net_wattage ?? 0) > 0;
    const carNetW = curAction === "car_charge" ? aCfg.use_net_wattage ?? kwpW : kwpW;
    const carBatOn = curAction === "car_charge" && (aCfg.use_battery_wattage ?? 0) > 0;
    const carBatW = curAction === "car_charge" ? aCfg.use_battery_wattage ?? kwpW : kwpW;
    const carBatUntil = curAction === "car_charge" ? aCfg.use_battery_until_pct ?? "" : "";
    return `<div class="action-section" id="action-section">
      <div class="action-section-title">Plan Action</div>
      <div class="action-editor">
        <div class="ap-grid">${actionBtns}</div>
        <div class="params-panel">
          <div class="action-params" id="params-charge" style="${curAction === "charge" ? "" : "display:none"}">
            <div class="param-row">
              <span class="param-label">Power</span>
              <input class="param-input" id="param-charge-w" type="number" min="0" max="100000" step="100" value="${chargeW}">
              <span class="param-unit">W</span>
            </div>
            <div class="param-row">
              <span class="param-label">Until %<span class="param-optional">opt</span></span>
              <input class="param-input" id="param-charge-until" type="number" min="0" max="100" step="1" value="${curAction === "charge" ? aCfg.until_pct ?? "" : ""}">
              <span class="param-unit">%</span>
            </div>
          </div>
          <div class="action-params" id="params-discharge" style="${curAction === "discharge" ? "" : "display:none"}">
            <div class="param-row">
              <span class="param-label">Power</span>
              <input class="param-input" id="param-discharge-w" type="number" min="0" max="100000" step="100" value="${dischargeW}">
              <span class="param-unit">W</span>
            </div>
            <div class="param-row">
              <span class="param-label">Until %<span class="param-optional">opt</span></span>
              <input class="param-input" id="param-discharge-until" type="number" min="0" max="100" step="1" value="${curAction === "discharge" ? aCfg.until_pct ?? "" : ""}">
              <span class="param-unit">%</span>
            </div>
          </div>
          <div class="action-params" id="params-use_net" style="${curAction === "use_net" ? "" : "display:none"}">
            <div class="param-row">
              <span class="param-label">Max draw<span class="param-optional">opt</span></span>
              <input class="param-input" id="param-usenet-max" type="number" min="0" max="100000" step="100" value="${netW}">
              <span class="param-unit">W</span>
            </div>
            <button class="toggle-btn${solarOnUseNet ? " on" : ""}" id="param-usenet-solar" style="--tc:#f59e0b">
              <div class="toggle-btn-dot"></div>\u2600 Use Solar
            </button>
          </div>
          <div class="action-params" id="params-car_charge" style="${curAction === "car_charge" ? "" : "display:none"}">
            <button class="toggle-btn${solarOnCar ? " on" : ""}" id="param-car-solar" style="--tc:#f59e0b">
              <div class="toggle-btn-dot"></div>\u2600 Use Solar
            </button>
            <div class="watt-card${carNetOn ? " on" : ""}" id="wc-car-net" style="--wc-c:#2563eb">
              <div class="watt-card-header">
                <div class="watt-card-dot"></div>
                <span class="watt-card-label">Net Grid</span>
              </div>
              <div class="watt-card-input-wrap">
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Wattage</span>
                  <input class="param-input" id="param-car-net-w" type="number" min="0" max="100000" step="100" value="${carNetW}">
                  <span class="param-unit">W</span>
                </div>
              </div>
            </div>
            <div class="watt-card${carBatOn ? " on" : ""}" id="wc-car-bat" style="--wc-c:#7c3aed">
              <div class="watt-card-header">
                <div class="watt-card-dot"></div>
                <span class="watt-card-label">Battery</span>
              </div>
              <div class="watt-card-input-wrap">
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Wattage</span>
                  <input class="param-input" id="param-car-bat-w" type="number" min="0" max="100000" step="100" value="${carBatW}">
                  <span class="param-unit">W</span>
                </div>
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Until %<span class="param-optional">opt</span></span>
                  <input class="param-input" id="param-car-bat-until" type="number" min="0" max="100" step="1" value="${carBatUntil}">
                  <span class="param-unit">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="action-locked-row">
        <input type="checkbox" id="action-locked" ${slot.locked ? "checked" : ""}>
        <span class="action-locked-label">Locked (prevent auto-replanning)</span>
      </div>
      <div class="action-btn-row">
        <button class="action-apply-btn" id="action-apply">Apply</button>
        <button class="action-copy-btn" id="action-copy" title="Copy slot config"><ha-icon icon="mdi:content-copy"></ha-icon></button>
        <button class="action-paste-btn" id="action-paste" ${_clipboard ? "" : "disabled"} title="${_clipboard ? `Paste &amp; Save (${ACTION_LABELS[_clipboard.action] ?? _clipboard.action})` : "Paste &amp; Save"}"><ha-icon icon="mdi:content-paste"></ha-icon></button>
      </div>
    </div>`;
  })() : `<div style="padding:0 16px 16px">
    <div class="edit-hint">
      \u{1F4A1} To enable slot editing, configure <strong style="color:var(--text-bright)">integration.device_id</strong>
      (or legacy <strong style="color:var(--text-bright)">integration.entry_id</strong>)
      in your card config. Find it in Settings \u2192 Devices &amp; Services \u2192 EMS \u2192 (\u22EE) \u2192 Information.
    </div>
  </div>`;
  sr.getElementById("popup").innerHTML = `
    <div class="ph">
      <div class="ph-nav">
        <button class="ph-nav-btn" id="pop-prev" ${i === 0 ? "disabled" : ""}>\u2039</button>
        <div>
          <div class="ph-title">Slot Details</div>
          <div class="ph-time">${slotTimeStr(slot)} \u2013 ${slotEndTimeStr(slots, i)}</div>
        </div>
        <button class="ph-nav-btn" id="pop-next" ${i === n - 1 ? "disabled" : ""}>\u203A</button>
      </div>
      <button class="ph-close" id="pop-close">\u2715</button>
    </div>

    <div class="pop-nav-wrap">
      <div class="pop-nav-label">Jump to slot</div>
      <div class="pop-nav-track" id="pop-nav-track">
        <div class="pop-nav-segs">${navSegs}</div>
        <div class="pop-nav-dots">${navDots}</div>
        <div class="pop-nav-cursor" style="left:${(i + 0.5) / n * 100}%"></div>
        <div class="pop-nav-now"    style="left:${ns >= 0 ? (ns + 0.5) / n * 100 : 50}%;${ns < 0 ? "display:none" : ""}"></div>
      </div>
    </div>

    <div class="price-trio">${trioHtml}</div>

    <div class="pop-detail">
      ${slot._injPrice ? `<div class="pop-row">
        <span class="pop-row-label">Injection</span>
        <span class="pop-row-value" style="color:var(--text-dim)">\u2191 ${slot._injPrice.toFixed(2)} ct</span>
      </div>` : ""}
      ${slot.battery_prediction != null ? `<div class="pop-row">
        <span class="pop-row-label">Predicted Battery</span>
        <span class="pop-row-value">${slot.battery_prediction.toFixed(1)} %</span>
      </div>` : ""}
      ${slot.locked ? `<div class="pop-row">
        <span class="pop-row-label">Locked</span>
        <span class="pop-row-value">\u{1F512} Yes</span>
      </div>` : ""}
      ${/* solar_wh_predicted — will be added in future */
  ""}
    </div>

    ${config.layout?.show_actions !== false ? editHtml : ""}`;
  sr.getElementById("pop-close").addEventListener("click", () => ctx.onClose());
  sr.getElementById("pop-prev").addEventListener("click", (e) => {
    e.stopPropagation();
    ctx.onNavigate(i - 1);
  });
  sr.getElementById("pop-next").addEventListener("click", (e) => {
    e.stopPropagation();
    ctx.onNavigate(i + 1);
  });
  sr.querySelectorAll(".pop-nav-seg").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.onNavigate(+el.dataset.i);
    });
  });
  sr.querySelectorAll(".pt-slot.nav[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.onNavigate(+el.dataset.nav);
    });
  });
  if (deviceId || entryId) {
    let selAction = curAction;
    const showParams = (action) => {
      ["charge", "discharge", "use_net", "car_charge"].forEach((a) => {
        const el = sr.getElementById(`params-${a}`);
        if (el) el.style.display = a === action ? "" : "none";
      });
    };
    sr.querySelectorAll(".ap-btn[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selAction = btn.dataset.action;
        sr.querySelectorAll(".ap-btn[data-action]").forEach((b) => b.classList.toggle("sel", b === btn));
        showParams(selAction);
      });
    });
    sr.querySelectorAll(".param-input, #action-locked").forEach((el) => {
      el.addEventListener("click", (e) => e.stopPropagation());
    });
    const solarToggleIds = ["param-usenet-solar", "param-car-solar"];
    solarToggleIds.forEach((id) => {
      const btn = sr.getElementById(id);
      if (btn) btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.classList.toggle("on");
      });
    });
    ["wc-car-net", "wc-car-bat"].forEach((id) => {
      const card = sr.getElementById(id);
      if (!card) return;
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target.tagName === "INPUT") return;
        card.classList.toggle("on");
      });
      card.querySelectorAll("input").forEach((inp) => inp.addEventListener("click", (e) => e.stopPropagation()));
    });
    sr.getElementById("action-apply")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const lockedValue = sr.getElementById("action-locked")?.checked ?? false;
      const slotTime = slot.start ?? slot.time;
      const commonData = { device_id: deviceId || entryId, time: slotTime, locked: lockedValue };
      let svcPromise;
      if (selAction === "idle") {
        svcPromise = hass.callService("ha_ems", "planning_idle", commonData);
      } else if (selAction === "charge") {
        const watts = (() => {
          const v = parseFloat(sr.getElementById("param-charge-w")?.value);
          return isNaN(v) ? kwpW : v;
        })();
        const untilRaw = sr.getElementById("param-charge-until")?.value;
        const untilPct = untilRaw ? parseFloat(untilRaw) : null;
        svcPromise = hass.callService(
          "ha_ems",
          "planning_charge",
          { ...commonData, wattage: watts, ...untilPct != null ? { until_pct: untilPct } : {} }
        );
      } else if (selAction === "discharge") {
        const watts = (() => {
          const v = parseFloat(sr.getElementById("param-discharge-w")?.value);
          return isNaN(v) ? kwpW : v;
        })();
        const untilRaw = sr.getElementById("param-discharge-until")?.value;
        const untilPct = untilRaw ? parseFloat(untilRaw) : null;
        svcPromise = hass.callService(
          "ha_ems",
          "planning_discharge",
          { ...commonData, wattage: watts, ...untilPct != null ? { until_pct: untilPct } : {} }
        );
      } else if (selAction === "use_net") {
        const maxRaw = sr.getElementById("param-usenet-max")?.value;
        const maxWatts = maxRaw !== "" ? parseFloat(maxRaw) : null;
        const useSolar = sr.getElementById("param-usenet-solar")?.classList.contains("on") ?? true;
        svcPromise = hass.callService(
          "ha_ems",
          "planning_use_net",
          { ...commonData, use_solar: useSolar, ...maxWatts != null ? { max_wattage: maxWatts } : {} }
        );
      } else if (selAction === "car_charge") {
        const useSolar = sr.getElementById("param-car-solar")?.classList.contains("on") ?? true;
        const netCardOn = sr.getElementById("wc-car-net")?.classList.contains("on") ?? false;
        const batCardOn = sr.getElementById("wc-car-bat")?.classList.contains("on") ?? false;
        const netW2 = netCardOn ? (() => {
          const v = parseFloat(sr.getElementById("param-car-net-w")?.value);
          return isNaN(v) ? 0 : v;
        })() : 0;
        const batW2 = batCardOn ? (() => {
          const v = parseFloat(sr.getElementById("param-car-bat-w")?.value);
          return isNaN(v) ? 0 : v;
        })() : 0;
        const batUntilR = sr.getElementById("param-car-bat-until")?.value;
        const batUntil = batCardOn && batUntilR ? parseFloat(batUntilR) : null;
        svcPromise = hass.callService("ha_ems", "planning_car_charge_slot", {
          ...commonData,
          use_solar: useSolar,
          use_net_wattage: netW2,
          use_battery_wattage: batW2,
          ...batUntil != null ? { use_battery_until_pct: batUntil } : {}
        });
      }
      const applyBtn = sr.getElementById("action-apply");
      if (svcPromise) {
        svcPromise.then(() => {
          if (applyBtn) {
            applyBtn.textContent = "\u2713 Applied";
            applyBtn.classList.add("success");
          }
          setTimeout(() => {
            if (applyBtn) {
              applyBtn.textContent = "Apply";
              applyBtn.classList.remove("success");
            }
          }, 2e3);
        }).catch((err) => {
          if (applyBtn) {
            applyBtn.textContent = "\u2715 Error";
            applyBtn.classList.add("error");
            console.error("EMS card error:", err);
          }
        });
      }
    });
    sr.getElementById("action-copy")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const numVal = (id, fallback) => {
        const v = parseFloat(sr.getElementById(id)?.value);
        return isNaN(v) ? fallback : v;
      };
      const optNumVal = (id) => {
        const v = sr.getElementById(id)?.value;
        return v !== "" ? parseFloat(v) : null;
      };
      _clipboard = {
        action: selAction,
        locked: sr.getElementById("action-locked")?.checked ?? false,
        chargeW: numVal("param-charge-w", kwpW),
        chargeUntilPct: optNumVal("param-charge-until"),
        dischargeW: numVal("param-discharge-w", kwpW),
        dischargeUntilPct: optNumVal("param-discharge-until"),
        netMaxW: optNumVal("param-usenet-max"),
        netUseSolar: sr.getElementById("param-usenet-solar")?.classList.contains("on") ?? true,
        carUseSolar: sr.getElementById("param-car-solar")?.classList.contains("on") ?? true,
        carNetOn: sr.getElementById("wc-car-net")?.classList.contains("on") ?? false,
        carNetW: numVal("param-car-net-w", kwpW),
        carBatOn: sr.getElementById("wc-car-bat")?.classList.contains("on") ?? false,
        carBatW: numVal("param-car-bat-w", kwpW),
        carBatUntilPct: optNumVal("param-car-bat-until")
      };
      const pasteBtn = sr.getElementById("action-paste");
      if (pasteBtn) {
        pasteBtn.removeAttribute("disabled");
        pasteBtn.title = `Paste & Save (${ACTION_LABELS[selAction] ?? selAction})`;
      }
      const copyBtn = sr.getElementById("action-copy");
      if (copyBtn) {
        copyBtn.classList.add("success");
        setTimeout(() => copyBtn.classList.remove("success"), 1500);
      }
    });
    sr.getElementById("action-paste")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!_clipboard) return;
      const cb = _clipboard;
      selAction = cb.action;
      sr.querySelectorAll(".ap-btn[data-action]").forEach(
        (b) => b.classList.toggle("sel", b.dataset.action === selAction)
      );
      showParams(selAction);
      const setVal = (id, val) => {
        const el = sr.getElementById(id);
        if (el) el.value = val != null ? String(val) : "";
      };
      const setToggle = (id, on) => {
        sr.getElementById(id)?.classList.toggle("on", on);
      };
      setVal("param-charge-w", cb.chargeW);
      setVal("param-charge-until", cb.chargeUntilPct);
      setVal("param-discharge-w", cb.dischargeW);
      setVal("param-discharge-until", cb.dischargeUntilPct);
      setVal("param-usenet-max", cb.netMaxW);
      setToggle("param-usenet-solar", cb.netUseSolar);
      setToggle("param-car-solar", cb.carUseSolar);
      setToggle("wc-car-net", cb.carNetOn);
      setVal("param-car-net-w", cb.carNetW);
      setToggle("wc-car-bat", cb.carBatOn);
      setVal("param-car-bat-w", cb.carBatW);
      setVal("param-car-bat-until", cb.carBatUntilPct);
      const lockedChk = sr.getElementById("action-locked");
      if (lockedChk) lockedChk.checked = cb.locked;
      const slotTime = slot.start ?? slot.time;
      const commonData = { device_id: deviceId || entryId, time: slotTime, locked: cb.locked };
      let svcPromise2;
      if (cb.action === "idle") {
        svcPromise2 = hass.callService("ha_ems", "planning_idle", commonData);
      } else if (cb.action === "charge") {
        svcPromise2 = hass.callService(
          "ha_ems",
          "planning_charge",
          { ...commonData, wattage: cb.chargeW, ...cb.chargeUntilPct != null ? { until_pct: cb.chargeUntilPct } : {} }
        );
      } else if (cb.action === "discharge") {
        svcPromise2 = hass.callService(
          "ha_ems",
          "planning_discharge",
          { ...commonData, wattage: cb.dischargeW, ...cb.dischargeUntilPct != null ? { until_pct: cb.dischargeUntilPct } : {} }
        );
      } else if (cb.action === "use_net") {
        svcPromise2 = hass.callService(
          "ha_ems",
          "planning_use_net",
          { ...commonData, use_solar: cb.netUseSolar, ...cb.netMaxW != null ? { max_wattage: cb.netMaxW } : {} }
        );
      } else if (cb.action === "car_charge") {
        svcPromise2 = hass.callService("ha_ems", "planning_car_charge_slot", {
          ...commonData,
          use_solar: cb.carUseSolar,
          use_net_wattage: cb.carNetOn ? cb.carNetW : 0,
          use_battery_wattage: cb.carBatOn ? cb.carBatW : 0,
          ...cb.carBatOn && cb.carBatUntilPct != null ? { use_battery_until_pct: cb.carBatUntilPct } : {}
        });
      }
      const pasteBtn2 = sr.getElementById("action-paste");
      if (svcPromise2) {
        svcPromise2.then(() => {
          if (pasteBtn2) {
            pasteBtn2.classList.add("success");
          }
          setTimeout(() => {
            if (pasteBtn2) pasteBtn2.classList.remove("success");
          }, 2e3);
        }).catch((err) => {
          if (pasteBtn2) {
            pasteBtn2.classList.add("error");
            console.error("EMS card error:", err);
          }
        });
      }
    });
  }
}

// src/dashboard/dashboard.ts
var EmsDashboardCard = class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._slots = [];
    this._filteredSlots = [];
    this._days = [];
    this._dayIdx = -1;
    this._activeIdx = null;
    this._devColors = {};
    this._lastSer = "";
    this._config = {};
    this._hass = null;
    this._initialScroll = false;
    this._planningEntityId = null;
    this._kwpEntityId = null;
    this._entityRegistry = null;
  }
  setConfig(config) {
    if (!config.entity && !config.price?.entity)
      throw new Error("ems-dashboard-card: set entity or price.entity");
    this._config = config;
    this._buildDOM();
  }
  set hass(hass) {
    this._hass = hass;
    const deviceId = this._config?.integration?.device_id;
    if (deviceId && !this._planningEntityId) {
      this._resolveDeviceEntities(deviceId);
    }
    const slots = this._buildSlots(hass);
    const ser = JSON.stringify(slots);
    if (ser !== this._lastSer) {
      this._lastSer = ser;
      this._slots = slots;
      this._parseData();
      this._render();
    }
  }
  static getConfigElement() {
    return document.createElement("ems-dashboard-card-editor");
  }
  static getStubConfig() {
    return {
      price: {
        entity: "sensor.nordpool_kwh_xx_xx",
        attribute: "prices_today",
        start_key: "start",
        price_key: "price"
      }
    };
  }
  async _resolveDeviceEntities(deviceId) {
    if (!this._hass) return;
    try {
      if (!this._entityRegistry) {
        this._entityRegistry = await this._hass.callWS({ type: "config/entity_registry/list" });
      }
      const entry = (this._entityRegistry || []).find(
        (e) => e.device_id === deviceId && e.entity_id.includes("ems_planning")
      );
      if (entry) this._planningEntityId = entry.entity_id;
      const kwpEntry = (this._entityRegistry || []).find(
        (e) => e.device_id === deviceId && e.entity_id.includes("ems_kwp")
      );
      if (kwpEntry) this._kwpEntityId = kwpEntry.entity_id;
    } catch (err) {
    }
  }
  _buildSlots(hass) {
    const pCfg = this._config.price;
    const iCfg = this._config.integration;
    let slots = [];
    if (pCfg?.entity) {
      const stateObj = hass.states[pCfg.entity];
      if (!stateObj) return [];
      const list = stateObj.attributes[pCfg.attribute || "prices_today"] ?? [];
      const startKey = pCfg.start_key || "start";
      const priceKey = pCfg.price_key || "price";
      const injKey = pCfg.injection_price_key || null;
      slots = list.map((entry) => {
        const base = parseFloat(entry[priceKey]) || 0;
        const inj = injKey ? parseFloat(entry[injKey]) || 0 : 0;
        return {
          time: entry[startKey],
          start: entry[startKey],
          price: base,
          _injPrice: inj,
          action: "idle",
          locked: false,
          action_config: {},
          car: {},
          battery_prediction: null
        };
      });
    } else if (this._config.entity) {
      const stateObj = hass.states[this._config.entity];
      slots = stateObj?.attributes?.schedule ?? [];
    }
    const planEntity = this._planningEntityId || iCfg?.planning_entity;
    if (planEntity && slots.length > 0) {
      const planState = hass.states[planEntity];
      const planList = planState?.attributes?.planning ?? [];
      if (planList.length > 0) {
        const planMap = {};
        for (const p of planList) {
          const ts = new Date(p.start).getTime();
          if (!isNaN(ts)) planMap[ts] = p;
        }
        slots = slots.map((slot) => {
          const ts = new Date(slot.start ?? slot.time).getTime();
          const p = isNaN(ts) ? null : planMap[ts];
          if (!p) return slot;
          return {
            ...slot,
            action: p.action ?? slot.action,
            locked: p.locked ?? slot.locked,
            action_config: p.action_config ?? slot.action_config,
            car: p.car ?? slot.car,
            battery_prediction: p.battery_prediction ?? slot.battery_prediction,
            price: slot.price || p.price || 0,
            _injPrice: slot._injPrice || p.injection_price || 0
          };
        });
      }
    }
    return slots;
  }
  _parseData() {
    const groups = {};
    for (const slot of this._slots) {
      const key = localDateStr(new Date(slot.start ?? slot.time));
      if (!groups[key]) groups[key] = [];
      groups[key].push(slot);
    }
    this._days = Object.keys(groups).sort().map((k) => ({ date: k, slots: groups[k] }));
    const fixedDay = this._config.layout?.day;
    if (fixedDay) {
      const today = localDateStr(/* @__PURE__ */ new Date());
      const tomorrow = localDateStr(new Date(Date.now() + 864e5));
      const target = fixedDay === "tomorrow" ? tomorrow : today;
      const idx = this._days.findIndex((d) => d.date === target);
      this._dayIdx = idx >= 0 ? idx : 0;
    } else {
      const today = localDateStr(/* @__PURE__ */ new Date());
      const todayIdx = this._days.findIndex((d) => d.date === today);
      if (this._dayIdx < 0) {
        this._dayIdx = todayIdx >= 0 ? todayIdx : Math.max(0, this._days.length - 1);
      } else if (this._dayIdx >= this._days.length) {
        this._dayIdx = Math.max(0, this._days.length - 1);
      }
    }
    this._filteredSlots = this._days[this._dayIdx]?.slots ?? this._slots;
    this._buildDevColors();
  }
  _buildDevColors() {
    const names = /* @__PURE__ */ new Set();
    for (const slot of this._filteredSlots)
      for (const d of slot.devices ?? []) names.add(d.name);
    let i = 0;
    const map = {};
    for (const n of names) map[n] = DEVICE_PALETTE[i++ % DEVICE_PALETTE.length];
    this._devColors = map;
  }
  _nowSlotIdx() {
    const now = /* @__PURE__ */ new Date();
    const s = this._filteredSlots;
    for (let i = 0; i < s.length; i++) {
      const t0 = new Date(s[i].start ?? s[i].time);
      const t1 = s[i + 1] ? new Date(s[i + 1].start ?? s[i + 1].time) : new Date(t0.getTime() + 36e5);
      if (now >= t0 && now < t1) return i;
    }
    return -1;
  }
  _buildDOM() {
    this.shadowRoot.innerHTML = `
      <style>${CSS}
        .debug {
          font-family: var(--code-font-family, monospace);
          font-size: 11px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 10px 12px;
          margin-top: 16px;
          white-space: pre-wrap;
          word-break: break-all;
          color: var(--text-dim);
        }
        .debug[hidden] { display: none; }
        .debug b { color: var(--text-bright); }
        .dbg-table { margin-top: 12px; width: 100%; border-collapse: collapse; font-size: 11px; }
        .dbg-table th { text-align:left; padding:5px 8px; border-bottom:2px solid var(--border); color:var(--text-dim); font-size:9px; text-transform:uppercase; letter-spacing:.05em; }
        .dbg-table td { padding:4px 8px; border-bottom:1px solid var(--border); }
        .dbg-table tr.now td { background:rgba(250,204,21,.06); }
      </style>
      <div class="root">
        <header>
          <h1>EMS Schedule</h1>
          <span id="header-date"></span>
        </header>
        <div class="stats" id="stats"></div>
        <div class="controls" id="day-btns"></div>
        <div class="chart-card" id="chart-card">
          <div class="y-axis" id="y-axis" style="height:${CHART_H + 24}px"></div>
          <div class="chart-right">
            <div class="chart-wrap" id="chart-wrap">
              <div class="chart-body" id="chart-body">
                <div class="grid-lines" id="grid-lines"></div>
                <div class="bars" id="bars" style="height:${CHART_H}px"></div>
                <svg class="battery-svg" id="battery-svg" style="position:absolute;top:0;left:0;width:100%;height:${CHART_H}px;pointer-events:none;overflow:visible;" hidden></svg>
                <div class="action-strip" id="action-strip"></div>
                <div class="x-axis" id="x-axis"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="brush-wrap" id="brush-wrap">
          <div class="brush-label-row">
            <span class="brush-label">Overview</span>
            <span class="brush-label" id="brush-now-label"></span>
          </div>
          <div class="brush-track" id="brush-track">
            <div class="brush-segs" id="brush-segs"></div>
            <div class="brush-dots" id="brush-dots"></div>
            <div class="brush-now"    id="brush-now"    style="display:none"></div>
            <div class="brush-cursor" id="brush-cursor" style="display:none"></div>
          </div>
        </div>
        <div class="legend-wrap" id="legend"></div>
        <div id="debug" class="debug" hidden></div>
        <div id="overlay"><div id="popup"></div></div>
        <div id="tooltip"></div>
      </div>`;
    this.shadowRoot.getElementById("overlay").addEventListener("click", (e) => {
      if (e.target.id === "overlay") this._closePopup();
    });
    document.addEventListener("keydown", this._onKey.bind(this));
  }
  _render() {
    const sr = this.shadowRoot;
    if (!sr) return;
    const theme = this._config.layout?.theme || "dark";
    const root = sr.querySelector(".root");
    root.classList.toggle("theme-light", theme === "light");
    root.classList.toggle("theme-system", theme === "system");
    root.classList.toggle("theme-ha", theme === "ha");
    const slots = this._filteredSlots;
    const n = slots.length;
    const debugEl = sr.getElementById("debug");
    if (this._config.debug || this._config.advanced?.debug) {
      debugEl.hidden = false;
      const pCfg = this._config.price;
      const iCfg = this._config.integration;
      const lines = [];
      if (pCfg?.entity) {
        const stateObj = this._hass?.states[pCfg.entity];
        lines.push(`<b>price.entity:</b> ${pCfg.entity}`);
        lines.push(`<b>  state exists:</b> ${!!stateObj}`);
        if (stateObj) {
          const attrKey = pCfg.attribute || "prices_today";
          const raw = stateObj.attributes[attrKey];
          lines.push(`<b>  attribute "${attrKey}":</b> ${raw !== void 0 ? Array.isArray(raw) ? `array[${raw.length}]` : typeof raw : "missing"}`);
          if (Array.isArray(raw) && raw.length > 0) {
            lines.push(`<b>  first entry keys:</b> ${Object.keys(raw[0]).join(", ")}`);
            lines.push(`<b>  first entry:</b> ${JSON.stringify(raw[0])}`);
          }
        }
      } else if (this._config.entity) {
        const stateObj = this._hass?.states[this._config.entity];
        lines.push(`<b>entity:</b> ${this._config.entity}`);
        lines.push(`<b>  state exists:</b> ${!!stateObj}`);
        if (stateObj) {
          const schedule = stateObj.attributes.schedule;
          lines.push(`<b>  schedule attribute:</b> ${Array.isArray(schedule) ? `array[${schedule.length}]` : "missing"}`);
        }
      } else {
        lines.push("<b>\u26A0 No price entity configured</b>");
      }
      lines.push("");
      const planEntity = this._planningEntityId || iCfg?.planning_entity;
      const deviceId = iCfg?.device_id;
      if (deviceId) {
        lines.push(`<b>integration.device_id:</b> ${deviceId}`);
        lines.push(`<b>  resolved planning entity:</b> ${this._planningEntityId || "(pending\u2026)"}`);
      }
      if (planEntity) {
        const planState = this._hass?.states[planEntity];
        lines.push(`<b>integration.planning_entity (effective):</b> ${planEntity}`);
        lines.push(`<b>  state exists:</b> ${!!planState}`);
        if (planState) {
          const planList = planState.attributes?.planning;
          lines.push(`<b>  state value:</b> ${planState.state}`);
          lines.push(`<b>  planning attribute:</b> ${Array.isArray(planList) ? `array[${planList.length}]` : planList === void 0 ? "missing" : typeof planList}`);
          if (Array.isArray(planList) && planList.length > 0) {
            lines.push(`<b>  first slot keys:</b> ${Object.keys(planList[0]).join(", ")}`);
            lines.push(`<b>  first slot:</b> ${JSON.stringify(planList[0])}`);
            if (slots.length > 0) {
              const priceStart = slots[0].start ?? slots[0].time;
              const planStart = planList[0].start;
              const priceTs = new Date(priceStart).getTime();
              const planTs = new Date(planStart).getTime();
              lines.push(`<b>  price slot[0].start:</b> "${priceStart}"`);
              lines.push(`<b>  plan  slot[0].start:</b> "${planStart}"`);
              lines.push(`<b>  timestamp match:</b> ${priceTs === planTs} (${priceTs} vs ${planTs})`);
            }
          }
        } else {
          lines.push(`<b>  \u26A0 entity not found in hass.states</b>`);
        }
      } else {
        lines.push("<b>integration.planning_entity:</b> not configured (no device_id or planning_entity set)");
      }
      lines.push("");
      lines.push(`<b>parsed slots (this day):</b> ${slots.length}`);
      const actionCounts = {};
      for (const s of slots) {
        const a = s.action || "idle";
        actionCounts[a] = (actionCounts[a] || 0) + 1;
      }
      lines.push(`<b>action counts:</b> ${Object.entries(actionCounts).map(([k, v]) => `${k}\xD7${v}`).join(", ") || "\u2013"}`);
      lines.push(`<b>locked slots:</b> ${slots.filter((s) => s.locked).length}`);
      const ns2 = this._nowSlotIdx();
      const ACTION_COLORS = { idle: "#374151", charge: "#16a34a", discharge: "#dc2626", use_net: "#2563eb", car_charge: "#ca8a04" };
      const tableHtml = slots.length ? `
        <table class="dbg-table">
          <thead><tr><th>Time</th><th>Price</th><th>Action</th><th>Locked</th><th>Battery%</th></tr></thead>
          <tbody>${slots.map((slot, i) => {
        const act = slotAction(slot);
        const col = ACTION_COLORS[act.key] || "#888";
        return `<tr${i === ns2 ? ' class="now"' : ""}>
              <td>${slotTimeStr(slot)}</td>
              <td style="color:${priceColor(slot.price)};font-weight:600">${slot.price.toFixed(2)} ct</td>
              <td style="color:${col};font-weight:600">${act.label}</td>
              <td>${slot.locked ? "\u{1F512}" : "\u2013"}</td>
              <td>${slot.battery_prediction != null ? slot.battery_prediction.toFixed(1) + "%" : "\u2013"}</td>
            </tr>`;
      }).join("")}
          </tbody>
        </table>` : "";
      debugEl.innerHTML = lines.join("\n") + tableHtml;
    } else {
      debugEl.hidden = true;
      debugEl.innerHTML = "";
    }
    if (!n) {
      sr.getElementById("bars").innerHTML = '<div class="empty">No schedule data available</div>';
      sr.getElementById("stats").innerHTML = "";
      sr.getElementById("day-btns").innerHTML = "";
      return;
    }
    const prices = slots.map((s) => s.price);
    const ns = this._nowSlotIdx();
    const today = localDateStr(/* @__PURE__ */ new Date());
    const tomorrow = localDateStr(new Date(Date.now() + 864e5));
    const fixedDay = this._config.layout?.day;
    sr.getElementById("day-btns").hidden = !!fixedDay;
    if (!fixedDay) {
      sr.getElementById("day-btns").innerHTML = this._days.map((d, i) => {
        const label = d.date === today ? "Today" : d.date === tomorrow ? "Tomorrow" : d.date;
        return `<button class="btn${i === this._dayIdx ? " active" : ""}" data-day="${i}">${label}</button>`;
      }).join("");
      sr.getElementById("day-btns").querySelectorAll(".btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this._dayIdx = +btn.dataset.day;
          this._filteredSlots = this._days[this._dayIdx].slots;
          this._buildDevColors();
          this._render();
        });
      });
    }
    renderMainChart(sr, slots, this._config, this._hass, ns, (i) => this._openPopup(i));
    renderBatteryOverlay(sr, slots, this._config, this._hass);
    const avg = prices.reduce((a, b) => a + b, 0) / n;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    {
      const curSlot = ns >= 0 ? slots[ns] : null;
      const hasInj = !!this._config.price?.injection_price_key;
      const curCard = curSlot ? `<div class="stat-card">
            <div class="stat-label">Current</div>
            <div class="stat-price-row">
              <span class="stat-value">${curSlot.price.toFixed(2)}<span class="stat-unit">ct</span></span>
              ${hasInj ? `<span class="stat-inj">\u2191 ${curSlot._injPrice.toFixed(2)} ct</span>` : ""}
            </div>
            <div class="stat-action" style="color:${slotAction(curSlot).color}">\u25CF ${slotAction(curSlot).label}</div>
          </div>` : `<div class="stat-card">
            <div class="stat-label">Current</div>
            <div class="stat-value">\u2013</div>
          </div>`;
      const mmCard = `<div class="stat-card">
        <div class="stat-label">Min / Avg / Max</div>
        <div class="stat-value compound">${min.toFixed(2)}<span class="stat-sep">/</span>${avg.toFixed(2)}<span class="stat-sep">/</span>${max.toFixed(2)}<span class="stat-unit">ct</span></div>
      </div>`;
      sr.getElementById("stats").innerHTML = curCard + mmCard;
      if (ns >= 0) {
        sr.querySelector("#stats .stat-card").style.cursor = "pointer";
        sr.querySelector("#stats .stat-card").addEventListener("click", () => this._openPopup(ns));
      }
    }
    const devNames = Object.keys(this._devColors);
    const showPriceLegend = this._config.layout?.show_price_legend !== false;
    const showActionLegend = this._config.layout?.show_action_legend !== false;
    const legendEl = sr.getElementById("legend");
    legendEl.innerHTML = `
      ${showPriceLegend ? `<div>
        <div class="legend-title">Price</div>
        <div class="legend-items">
          ${[{ c: "#3b82f6", l: "Low" }, { c: "#22c55e", l: "Normal" }, { c: "#f97316", l: "High" }, { c: "#dc2626", l: "Peak" }].map((e) => `<div class="li"><div class="ls" style="background:${e.c}"></div>${e.l}</div>`).join("")}
        </div>
      </div>` : ""}
      ${showActionLegend ? `<div>
        <div class="legend-title">Action</div>
        <div class="legend-items">
          ${[{ c: "#374151", l: "Idle" }, { c: "#16a34a", l: "Charge" }, { c: "#2563eb", l: "Use Net" }, { c: "#dc2626", l: "Discharge" }, { c: "#ca8a04", l: "Car" }].map((e) => `<div class="li"><div class="ls" style="background:${e.c}"></div>${e.l}</div>`).join("")}
        </div>
      </div>` : ""}
      ${devNames.length ? `<div>
        <div class="legend-title">Devices</div>
        <div class="legend-items">
          ${devNames.map((n2) => `<div class="li"><div class="ls" style="background:${this._devColors[n2]}"></div>${n2}</div>`).join("")}
        </div>
      </div>` : ""}`;
    legendEl.hidden = !showPriceLegend && !showActionLegend && !devNames.length;
    sr.getElementById("action-strip").hidden = this._config.layout?.show_actions === false;
    sr.getElementById("brush-wrap").hidden = this._config.layout?.show_brush === false;
    sr.querySelector("header").hidden = this._config.layout?.show_header === false;
    sr.getElementById("chart-card").hidden = this._config.layout?.show_chart === false;
    sr.getElementById("stats").hidden = this._config.layout?.show_stats === false;
    sr.getElementById("brush-wrap").classList.toggle("brush-solo", this._config.layout?.show_chart === false);
    this._renderBrush();
    if (ns >= 0) {
      const isFirst = !this._initialScroll;
      this._initialScroll = true;
      this._scrollToSlot(ns, isFirst);
    }
  }
  _renderBrush() {
    renderBrush(
      this.shadowRoot,
      this._filteredSlots,
      this._activeIdx,
      this._nowSlotIdx(),
      this._config,
      (i) => this._openPopup(i),
      (i) => this._scrollToSlot(i)
    );
  }
  _scrollToSlot(i, instant = false) {
    scrollToSlot(this.shadowRoot, this._filteredSlots.length, i, instant);
  }
  _openPopup(i) {
    this._activeIdx = i;
    this.shadowRoot.getElementById("tooltip").classList.remove("visible");
    this.shadowRoot.querySelectorAll(".slot").forEach(
      (el) => el.classList.toggle("hl", +el.dataset.i === i)
    );
    this._renderBrush();
    this._renderPopup(i);
    this.shadowRoot.getElementById("overlay").classList.add("open");
  }
  _closePopup() {
    this.shadowRoot.getElementById("overlay").classList.remove("open");
    this.shadowRoot.querySelectorAll(".slot").forEach((el) => el.classList.remove("hl"));
    this._activeIdx = null;
    this._renderBrush();
  }
  _navigateSlot(i) {
    if (i < 0 || i >= this._filteredSlots.length) return;
    this._activeIdx = i;
    this.shadowRoot.querySelectorAll(".slot").forEach(
      (el) => el.classList.toggle("hl", +el.dataset.i === i)
    );
    this._scrollToSlot(i);
    this._renderPopup(i);
    this._renderBrush();
  }
  _renderPopup(i) {
    this._activeIdx = i;
    renderPopup({
      sr: this.shadowRoot,
      slots: this._filteredSlots,
      slotIdx: i,
      nowIdx: this._nowSlotIdx(),
      config: this._config,
      hass: this._hass,
      kwpEntityId: this._kwpEntityId,
      devColors: this._devColors,
      onClose: () => this._closePopup(),
      onNavigate: (j) => this._navigateSlot(j)
    });
  }
  _onKey(e) {
    const overlay = this.shadowRoot?.getElementById("overlay");
    if (!overlay?.classList.contains("open")) return;
    if (e.key === "Escape") this._closePopup();
    if (e.key === "ArrowLeft") this._navigateSlot(this._activeIdx - 1);
    if (e.key === "ArrowRight") this._navigateSlot(this._activeIdx + 1);
  }
  disconnectedCallback() {
    document.removeEventListener("keydown", this._onKey.bind(this));
  }
};

// src/dashboard/dashboard-config.ts
var EDITOR_SCHEMA = [
  {
    type: "expandable",
    name: "price",
    title: "Price",
    icon: "mdi:lightning-bolt",
    schema: [
      { name: "entity", selector: { entity: {} } },
      { name: "attribute", selector: { text: {} } },
      { name: "start_key", selector: { text: {} } },
      { name: "price_key", selector: { text: {} } },
      { name: "injection_price_key", selector: { text: {} } }
    ]
  },
  {
    type: "expandable",
    name: "layout",
    title: "Layout",
    icon: "mdi:view-dashboard-outline",
    schema: [
      { name: "theme", selector: { select: { options: [
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
        { value: "system", label: "System (follow OS)" },
        { value: "ha", label: "Home Assistant (follow card theme)" }
      ] } } },
      { name: "day", selector: { select: { options: [
        { value: "today", label: "Today" },
        { value: "tomorrow", label: "Tomorrow" }
      ], custom_value: false } } },
      { name: "show_stats", selector: { boolean: {} } },
      { name: "show_brush", selector: { boolean: {} } },
      { name: "show_header", selector: { boolean: {} } },
      { name: "show_chart", selector: { boolean: {} } },
      { name: "show_actions", selector: { boolean: {} } },
      { name: "show_price_legend", selector: { boolean: {} } },
      { name: "show_action_legend", selector: { boolean: {} } },
      { name: "show_battery", selector: { boolean: {} } }
    ]
  },
  {
    type: "expandable",
    name: "integration",
    title: "Integration",
    icon: "mdi:home-automation",
    schema: [
      { name: "device_id", selector: { device: { integration: "ha_ems" } } },
      { name: "battery_entity", selector: { entity: {} } },
      { name: "battery_line_color", selector: { color_rgb: {} } }
    ]
  },
  {
    type: "expandable",
    name: "advanced",
    title: "Advanced",
    icon: "mdi:cog-outline",
    schema: [
      { name: "debug", selector: { boolean: {} } }
    ]
  }
];
function editorLabel(schema) {
  if (schema.name === "entity") return "Price Entity";
  return {
    attribute: "Data Attribute",
    start_key: "Start Key",
    price_key: "Price Key",
    injection_price_key: "Injection Price Key (optional)",
    debug: "Debug Mode",
    theme: "Theme",
    show_brush: "Show Overview Brush",
    show_header: "Show Header Title",
    show_stats: "Show Stats Cards",
    show_chart: "Show Chart",
    show_actions: "Show Action Strip",
    show_price_legend: "Show Price Legend",
    show_action_legend: "Show Action Legend",
    show_battery: "Show Battery Line",
    day: "Fixed Day",
    device_id: "EMS Device",
    battery_entity: "Current Battery Entity",
    battery_line_color: "Battery Line Color"
  }[schema.name] ?? schema.name;
}
function editorHelper(schema) {
  return {
    entity: "The price sensor entity (e.g. Nordpool sensor).",
    attribute: "Attribute on the entity that contains the price list array (e.g. prices_today).",
    start_key: 'Key name for the start time in each price entry (e.g. "start").',
    price_key: 'Key name for the price value in each price entry (e.g. "price").',
    injection_price_key: "Optional. Key name for the injection (sell-back) price per entry. Displayed separately \u2014 not added to the buy price.",
    debug: "Show debug panel below the chart with entity state, attribute info, and a data table.",
    theme: "Colour scheme: Dark (default), Light, System (follow OS), or Home Assistant (uses your HA card theme).",
    show_brush: "Show the colour overview bar below the chart (default: true).",
    show_header: "Show the EMS Schedule header title (default: true).",
    show_stats: "Show the stats cards (Current, Min/Avg/Max) above the chart (default: true).",
    show_chart: "Show the bar chart. When hidden, clicking the brush opens the slot popup instead (default: true).",
    show_actions: "Show the action colour strip below the bars (default: true).",
    show_price_legend: "Show the price colour legend below the chart (default: true).",
    show_action_legend: "Show the action colour legend below the chart (default: true).",
    day: "Fix the displayed day. When set, the Today/Tomorrow buttons are hidden.",
    device_id: "Select the EMS device. Used to read planning data and send service calls.",
    battery_entity: "Number or sensor entity for current battery state of charge (0\u2013100). Used to draw the current battery % line on the chart.",
    battery_line_color: "Color for the battery overlay lines. Defaults to a teal/cyan color.",
    show_battery: "Overlay current (solid) and predicted (dashed) battery % on the chart (default: true when battery_entity is set)."
  }[schema.name] ?? "";
}
var EmsDashboardCardEditor = class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._form = null;
  }
  setConfig(config) {
    this._config = config || {};
    this._buildForm();
    this._sync();
  }
  set hass(hass) {
    this._hass = hass;
    this._sync();
  }
  connectedCallback() {
    this._buildForm();
    this._sync();
  }
  _buildForm() {
    if (this._form) return;
    this.shadowRoot.innerHTML = "<style>:host{display:block} ha-form{display:block;padding:4px 0}</style>";
    const form = document.createElement("ha-form");
    form.schema = EDITOR_SCHEMA;
    form.computeLabel = editorLabel;
    form.computeHelper = editorHelper;
    form.addEventListener("value-changed", (e) => {
      this._config = e.detail.value;
      this.dispatchEvent(new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true
      }));
    });
    this.shadowRoot.appendChild(form);
    this._form = form;
  }
  _sync() {
    if (!this._form) return;
    if (this._hass) this._form.hass = this._hass;
    this._form.data = this._config;
  }
};

// src/ems.ts
customElements.define("ems-dashboard-card", EmsDashboardCard);
customElements.define("ems-dashboard-card-editor", EmsDashboardCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ems-dashboard-card",
  name: "EMS Dashboard Card",
  description: "Energy Management System \u2014 price chart, action strip & schedule editor",
  preview: false
});
