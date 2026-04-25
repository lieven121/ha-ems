export const CSS = `

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

/* ── Popup ───────────────────────────────────────────────────────────────── */
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
.action-apply-btn{margin-top:10px;width:100%;padding:9px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-family:var(--code-font-family,monospace);font-size:12px;font-weight:600;cursor:pointer;transition:background .12s;}
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
