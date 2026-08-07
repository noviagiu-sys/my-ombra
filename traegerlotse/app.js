/* Trägerlotse — App-Logik. Liest die Träger aus window.TRAEGER (config.js).
   Diese Datei musst du normalerweise NICHT anpassen. */
(function(){
  "use strict";
  const CFG = window.TRAEGER;
  const el = id => document.getElementById(id);
  if(!CFG || !CFG.trays || !CFG.trays.length){
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">config.js fehlt oder ist leer.</p>';
    return;
  }
  const TRAYS = CFG.trays;

  let tray = TRAYS[0], POS = tray.pos, PARTS = tray.parts, N = PARTS.length;
  let mode = 'guided';
  const placed = new Set();
  let active = null;
  const byOrder = o => PARTS.find(p => p.order === o);

  const traySvg = el('tray');
  const overlaySvg = el('overlay');

  /* ---- Aussparungs-Rahmen ---- */
  function frame(p){
    const {cx,cy,shape,w,h}=p, x=cx-w/2, y=cy-h/2, rx=w/2;
    if(shape==='oval') return `<ellipse class="cut-frame" cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}"/>`;
    if(shape==='bracket') return `<rect class="cut-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>`;
    return `<rect class="cut-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  }
  function haloShape(p){
    const {cx,cy,shape,w,h}=p, pad=9;
    if(shape==='oval') return `<ellipse class="halo" cx="${cx}" cy="${cy}" rx="${w/2+pad}" ry="${h/2+pad}"/>`;
    const x=cx-w/2-pad, y=cy-h/2-pad;
    return `<rect class="halo" x="${x}" y="${y}" width="${w+pad*2}" height="${h+pad*2}" rx="${(w/2)+pad}"/>`;
  }
  // Silhouette je Teil. Chirurgie: vertikal in der Aussparung; Haushalt: zentriertes Symbol.
  function instr(part){
    const p=POS[part.pos]; if(!p) return '';
    const t=part.type, cx=p.cx, cy=p.cy; let d='';
    const vlen=(p.shape==='oval')?0:p.h*0.82, top=cy-vlen/2, bot=cy+vlen/2;
    if(t==='scis'||t==='sciscurve'){ const curve=t==='sciscurve', r=4, ringY=bot-r, piv=cy+vlen*0.08;
      d+=`<circle cx="${cx-6}" cy="${ringY}" r="${r}"/><circle cx="${cx+6}" cy="${ringY}" r="${r}"/>`;
      if(!curve) d+=`<path d="M${cx-6} ${ringY-r} L${cx} ${piv} L${cx+4} ${top}"/><path d="M${cx+6} ${ringY-r} L${cx} ${piv} L${cx-4} ${top}"/>`;
      else d+=`<path d="M${cx-6} ${ringY-r} L${cx} ${piv} Q${cx+7} ${top+7} ${cx+2} ${top}"/><path d="M${cx+6} ${ringY-r} L${cx} ${piv} Q${cx-3} ${top+6} ${cx-3} ${top}"/>`;
    } else if(t==='clamp'||t==='needle'){ const r=4, ringY=bot-r, piv=cy+vlen*0.14;
      d+=`<circle cx="${cx-6}" cy="${ringY}" r="${r}"/><circle cx="${cx+6}" cy="${ringY}" r="${r}"/>`;
      d+=`<path d="M${cx-6} ${ringY-r} L${cx-1.6} ${piv} L${cx-1.6} ${top}"/><path d="M${cx+6} ${ringY-r} L${cx+1.6} ${piv} L${cx+1.6} ${top}"/>`;
      d+=`<path d="M${cx-3} ${piv+5} L${cx+3} ${piv+5}"/>`;
      if(t==='needle') d+=`<rect x="${cx-2.6}" y="${top}" width="5.2" height="9" rx="1"/>`;
    } else if(t==='forceps'){
      d+=`<path d="M${cx-4} ${bot} Q${cx-3} ${cy} ${cx} ${top}"/><path d="M${cx+4} ${bot} Q${cx+3} ${cy} ${cx} ${top}"/>`;
    } else if(t==='scalpel'){ const hTop=top+vlen*0.44;
      d+=`<rect x="${cx-4}" y="${hTop}" width="8" height="${bot-hTop}" rx="3"/>`;
      d+=`<path d="M${cx-3} ${hTop} L${cx-3} ${top+6} Q${cx+2} ${top} ${cx+3} ${top+4} L${cx+3} ${hTop} Z"/>`;
    } else if(t==='hook'){
      d+=`<circle cx="${cx}" cy="${cy+9}" r="5"/><path d="M${cx} ${cy+4} L${cx} ${cy-8}"/>`;
      d+=`<path d="M${cx} ${cy-8} Q${cx+11} ${cy-13} ${cx+8} ${cy-2}"/><path d="M${cx} ${cy-8} Q${cx-11} ${cy-13} ${cx-8} ${cy-2}"/>`;
    } else if(t==='rod'){
      d+=`<rect x="${cx-3}" y="${top}" width="6" height="${bot-top}" rx="3"/>`;
      d+=`<circle cx="${cx}" cy="${bot-5}" r="4.5"/><rect x="${cx+3}" y="${cy-5}" width="7" height="9" rx="2"/>`;
    }
    /* ---- Haushalt / Spülmaschine ---- */
    else if(t==='plate'){ d+=`<circle cx="${cx}" cy="${cy}" r="25"/><circle cx="${cx}" cy="${cy}" r="16"/>`;
    } else if(t==='pot'){ d+=`<rect x="${cx-23}" y="${cy-14}" width="46" height="34" rx="5"/>`;
      d+=`<path d="M${cx-23} ${cy-6} q-8 0 -8 7 q0 6 8 6"/><path d="M${cx+23} ${cy-6} q8 0 8 7 q0 6 -8 6"/>`;
      d+=`<line x1="${cx-25}" y1="${cy-14}" x2="${cx+25}" y2="${cy-14}"/>`;
    } else if(t==='lid'){ d+=`<path d="M${cx-24} ${cy+8} A26 22 0 0 1 ${cx+24} ${cy+8}"/><line x1="${cx-26}" y1="${cy+8}" x2="${cx+26}" y2="${cy+8}"/>`;
      d+=`<line x1="${cx}" y1="${cy-15}" x2="${cx}" y2="${cy-8}"/><circle cx="${cx}" cy="${cy-18}" r="4"/>`;
    } else if(t==='pan'){ d+=`<circle cx="${cx-6}" cy="${cy}" r="19"/><rect x="${cx+13}" y="${cy-3.5}" width="26" height="7" rx="3.5"/>`;
    } else if(t==='bowl'){ d+=`<path d="M${cx-24} ${cy-4} A24 20 0 0 0 ${cx+24} ${cy-4}"/><line x1="${cx-26}" y1="${cy-4}" x2="${cx+26}" y2="${cy-4}"/>`;
    } else if(t==='cup'){ d+=`<path d="M${cx-12} ${cy-14} L${cx-12} ${cy+13} Q${cx-12} ${cy+18} ${cx-7} ${cy+18} L${cx+7} ${cy+18} Q${cx+12} ${cy+18} ${cx+12} ${cy+13} L${cx+12} ${cy-14}"/>`;
      d+=`<path d="M${cx+12} ${cy-8} q11 0 11 10 q0 9 -11 9"/>`;
    } else if(t==='glass'){ d+=`<path d="M${cx-11} ${cy-18} L${cx+11} ${cy-18} L${cx+8} ${cy+18} L${cx-8} ${cy+18} Z"/>`;
    } else if(t==='cutlery'){ d+=`<line x1="${cx-9}" y1="${cy-18}" x2="${cx-9}" y2="${cy+18}"/>`;
      d+=`<line x1="${cx-13}" y1="${cy-18}" x2="${cx-13}" y2="${cy-9}"/><line x1="${cx-5}" y1="${cy-18}" x2="${cx-5}" y2="${cy-9}"/>`;
      d+=`<line x1="${cx+8}" y1="${cy-18}" x2="${cx+8}" y2="${cy+18}"/><path d="M${cx+8} ${cy-18} q7 2 7 10 q0 6 -7 6"/>`;
    }
    return `<g class="instr">${d}</g>`;
  }
  function trayHTML(prefix){
    let s = `<rect class="trbg" x="8" y="8" width="284" height="384" rx="18" fill="var(--tray)" stroke="var(--tray-line)" stroke-width="2"/>`;
    s += `<path d="M8 34 L34 8" stroke="var(--tray-line)" stroke-width="2" fill="none"/>`;
    s += `<text x="150" y="30" text-anchor="middle" fill="var(--muted)" font-family="var(--mono)" font-size="10" letter-spacing="1">${tray.name.toUpperCase()}</text>`;
    for(const part of PARTS){
      const p = POS[part.pos]; if(!p) continue;
      s += `<g class="cut" id="${prefix}${part.pos}" data-code="${part.code}">`+
           haloShape(p)+ frame(p)+ instr(part)+
           `<text class="cut-lbl" x="${p.cx}" y="${p.cy+p.h/2+13}" text-anchor="middle">${part.pos}</text></g>`;
    }
    return s;
  }
  function buildTray(){
    traySvg.innerHTML = trayHTML('cut-');
    if(overlaySvg) overlaySvg.innerHTML = trayHTML('ov-');
  }
  const PREFIXES = ['cut-','ov-'];
  function paintTray(){
    const nextCode = mode==='guided' ? (byOrder(placed.size+1)||{}).code : null;
    for(const part of PARTS){
      for(const pf of PREFIXES){
        const g = el(pf+part.pos); if(!g) continue;
        g.classList.toggle('done', placed.has(part.code));
        g.classList.toggle('active', active===part.code);
        g.classList.toggle('next', part.code===nextCode && active!==part.code);
      }
    }
  }

  /* ---- Karten / Listen ---- */
  function setBanner(kind,msg){ const b=el('banner'); if(!msg){b.style.display='none';return;} b.className='banner '+kind; b.textContent=msg; b.style.display='flex'; }
  function renderNow(){
    const nextCode = mode==='guided' ? (byOrder(placed.size+1)||{}).code : null;
    if(active){
      const p = PARTS.find(x=>x.code===active);
      el('nowlbl').textContent = placed.has(active) ? 'Platziert' : 'Erkanntes Teil';
      el('nowpart').textContent = p.name;
      el('nowmeta').innerHTML = `Position <b>${p.pos}</b> · Reihenfolge <b>${p.order}</b>/${N} · Code <b>${p.code}</b>`;
    } else if(mode==='guided'){
      const nx = byOrder(placed.size+1);
      if(nx){ el('nowlbl').textContent = `Nächster Schritt · ${placed.size+1}/${N}`; el('nowpart').textContent = nx.name;
        el('nowmeta').innerHTML = `Einlegen in Position <b>${nx.pos}</b> — dann Code scannen.`;
      } else { el('nowlbl').textContent = 'Fertig'; el('nowpart').textContent = 'Träger vollständig bestückt ✓'; el('nowmeta').textContent = 'Alle Teile sind an ihrer Position.'; }
    } else { el('nowlbl').textContent = 'Bereit zum Scannen'; el('nowpart').textContent = '— Kein Teil erkannt —'; el('nowmeta').textContent = 'Scanne einen QR-Code oder tippe unten ein Demo-Teil an.'; }
    const rail=el('rail'); rail.innerHTML='';
    for(let i=1;i<=N;i++){ const sp=document.createElement('span');
      if(placed.has(byOrder(i).code)) sp.className='done'; else if(mode==='guided' && byOrder(i).code===nextCode) sp.className='next'; rail.appendChild(sp); }
    el('progresstxt').innerHTML = (mode==='guided'?'<span>Fortschritt</span>':'<span>Freier Modus</span>')+`<span>${placed.size} / ${N} platziert</span>`;
  }
  function renderSeq(){
    const nextCode = mode==='guided' ? (byOrder(placed.size+1)||{}).code : null;
    const seq=el('seq'); seq.innerHTML='';
    for(let i=1;i<=N;i++){ const p=byOrder(i), done=placed.has(p.code), next=(p.code===nextCode);
      const li=document.createElement('li'); li.className = done?'done':(next?'next':'');
      li.innerHTML = `<span class="ordbadge">${done?'✓':i}</span><span class="nm">${p.name}</span><span class="ps">${p.pos}</span><span class="st">${done?'PLATZIERT':(next?'NÄCHSTES':'OFFEN')}</span>`;
      seq.appendChild(li); }
  }
  function renderChips(){
    const c=el('chips'); c.innerHTML='';
    for(const p of PARTS){ const b=document.createElement('button'); b.className='chip'+(placed.has(p.code)?' placed':'');
      b.innerHTML=`<span class="o">${p.order}</span>${p.short}`; b.onclick=()=>handleScan(p.code); c.appendChild(b); }
  }
  function renderRef(){
    const t=el('reftab'); t.innerHTML='';
    for(const p of [...PARTS].sort((a,b)=>a.order-b.order)){ const tr=document.createElement('tr');
      tr.innerHTML=`<td>${p.name}</td><td><code>${p.code}</code></td><td>${p.pos}</td>`; t.appendChild(tr); }
  }
  function renderAll(){ paintTray(); renderNow(); renderSeq(); renderChips(); }

  /* ---- Feedback ---- */
  let ac=null;
  function beep(freq,dur){ try{ ac=ac||new (window.AudioContext||window.webkitAudioContext)();
    const o=ac.createOscillator(),g=ac.createGain(); o.frequency.value=freq;o.type='sine';o.connect(g);g.connect(ac.destination);
    g.gain.setValueAtTime(.001,ac.currentTime);g.gain.exponentialRampToValueAtTime(.25,ac.currentTime+.01);
    g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);o.start();o.stop(ac.currentTime+dur);}catch(e){} }
  const vibe=p=>{ try{ navigator.vibrate&&navigator.vibrate(p); }catch(e){} };

  /* ---- Kern ---- */
  function resolve(raw){ if(!raw) return null; const t=String(raw).trim(), up=t.toUpperCase(), lo=t.toLowerCase();
    return PARTS.find(p=>p.code.toUpperCase()===up) || PARTS.find(p=>p.name.toLowerCase()===lo)
        || PARTS.find(p=>lo.includes(p.name.toLowerCase())||up.includes(p.code.toUpperCase())) || null; }
  let lastScan=0, lastCode='';
  function handleScan(raw){
    const now=Date.now(), p=resolve(raw);
    if(!p){ setBanner('err','Unbekannter Code: „'+String(raw).trim()+'"'); beep(220,.18); vibe(60); return; }
    if(p.code===lastCode && now-lastScan<1200) return; lastScan=now; lastCode=p.code;
    if(mode==='free'){ active=p.code; if(!placed.has(p.code)) placed.add(p.code);
      setBanner('ok','Position '+p.pos+' — '+p.name); beep(880,.12); vibe(35); renderAll(); return; }
    if(placed.has(p.code)){ active=p.code; setBanner('info',p.name+' ist bereits platziert (Position '+p.pos+').'); beep(500,.1); vibe(25); renderAll(); return; }
    const expected=byOrder(placed.size+1);
    if(expected && p.code===expected.code){ placed.add(p.code); active=p.code; const doneAll=placed.size===N;
      setBanner('ok', doneAll?'Träger vollständig bestückt ✓':'Richtig! '+p.name+' → Position '+p.pos+' ('+p.order+'/'+N+')');
      beep(doneAll?1200:900,.14); vibe(doneAll?[60,40,60]:40); renderAll(); return; }
    active=null; setBanner('err','Falsches Teil. Erwartet: '+expected.name+' → Position '+expected.pos+'.'); beep(220,.2); vibe([50,40,50]); renderAll();
  }

  /* ---- Träger wechseln ---- */
  function setTray(idx){
    tray=TRAYS[idx]; POS=tray.pos; PARTS=tray.parts; N=PARTS.length;
    placed.clear(); active=null; lastCode='';
    el('setnote').textContent = tray.note || '';
    setBanner('',''); buildTray(); renderRef(); renderAll(); resetLabels();
  }
  function setMode(m){ mode=m; active=null; el('m-guided').setAttribute('aria-pressed',m==='guided'); el('m-free').setAttribute('aria-pressed',m==='free'); setBanner('',''); renderAll(); }

  /* ---- QR-Etiketten ---- */
  let qrLib = null, qrTried = false;
  function loadQRLib(){
    return new Promise(res=>{
      if(window.qrcode) return res(window.qrcode);
      if(qrTried) return res(window.qrcode||null);
      qrTried = true;
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload=()=>res(window.qrcode||null); s.onerror=()=>res(null);
      document.head.appendChild(s);
    });
  }
  function resetLabels(){ const g=el('labelsgrid'); if(g) g.innerHTML=''; const pb=el('printlabels'); if(pb) pb.style.display='none'; const h=el('labelshint'); if(h) h.textContent=''; }
  async function genLabels(){
    const grid=el('labelsgrid'), hint=el('labelshint'); if(!grid) return;
    hint.textContent='QR-Codes werden erzeugt…';
    qrLib = qrLib || await loadQRLib();
    grid.innerHTML='';
    for(const p of [...PARTS].sort((a,b)=>a.order-b.order)){
      const card=document.createElement('div'); card.className='lblcard';
      let qrHTML='';
      if(qrLib){
        try{ const qr=qrLib(0,'M'); qr.addData(p.code); qr.make(); qrHTML=qr.createSvgTag({cellSize:4, margin:2, scalable:true}); }
        catch(e){ qrHTML='<div class="qrfail">'+p.code+'</div>'; }
      } else {
        qrHTML='<div class="qrfail">QR nur online<br>'+p.code+'</div>';
      }
      card.innerHTML=`<div class="qrbox">${qrHTML}</div><div class="lblname">${p.name}</div><div class="lblcode">${p.code}</div>`;
      grid.appendChild(card);
    }
    hint.textContent = qrLib ? 'Zum Ausdrucken auf „Drucken“ tippen — jedes Etikett auf sein Teil kleben.'
                             : 'QR-Bibliothek nicht geladen (offline?). In der gehosteten Version werden die Codes als QR erzeugt.';
    el('printlabels').style.display = qrLib ? 'inline-flex' : 'none';
  }

  /* ---- Overlay ein/aus ---- */
  let overlayOn=false;
  function setOverlay(on){ overlayOn=on; if(overlaySvg) overlaySvg.style.display=on?'block':'none';
    el('ovbtn').setAttribute('aria-pressed', on); el('ovbtn').classList.toggle('accent', on); }

  /* ---- Bedienung ---- */
  const sel=el('trsel');
  TRAYS.forEach((t,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=t.name; sel.appendChild(o); });
  sel.onchange=()=>setTray(+sel.value);
  el('m-guided').onclick=()=>setMode('guided');
  el('m-free').onclick=()=>setMode('free');
  el('resetbtn').onclick=()=>{ placed.clear(); active=null; lastCode=''; setBanner('',''); renderAll(); };
  el('manualbtn').onclick=()=>{ const v=el('manual').value; if(v.trim()){ handleScan(v); el('manual').value=''; } };
  el('manual').addEventListener('keydown',e=>{ if(e.key==='Enter') el('manualbtn').click(); });
  el('genlabels').onclick=genLabels;
  el('printlabels').onclick=()=>window.print();
  el('ovbtn').onclick=()=>setOverlay(!overlayOn);

  /* ---- Kamera + QR ---- */
  const video=el('video'); let stream=null, running=false, detector=null, jsqrFn=null, raf=0;
  function setScan(state,text){ const d=el('scandot'); d.className='dot'+(state==='live'?' live':state==='off'?' off':''); el('scantext').textContent=text; }
  function loadJsQR(){ return new Promise(res=>{ if(window.jsQR) return res(window.jsQR);
    const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload=()=>res(window.jsQR||null); s.onerror=()=>res(null); document.head.appendChild(s); }); }
  async function startCam(){ try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('no-cam');
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=stream; await video.play();
    el('vpempty').style.display='none'; video.style.display='block'; el('frame').style.display='block'; el('scanline').style.display='block';
    el('cambtn').textContent='Kamera stoppen'; running=true;
    if('BarcodeDetector' in window){ try{ detector=new window.BarcodeDetector({formats:['qr_code']}); }catch(e){ detector=null; } }
    if(!detector){ jsqrFn=await loadJsQR(); }
    if(detector||jsqrFn){ setScan('live','Suche QR-Code…'); tick(); } else { setScan('off','Kein QR-Decoder — Demo/Manuell nutzen'); }
  }catch(e){ setScan('off','Kamera nicht verfügbar — Demo/Manuell nutzen'); el('cambtn').textContent='Kamera starten'; } }
  function stopCam(){ running=false; cancelAnimationFrame(raf); if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
    video.style.display='none'; el('frame').style.display='none'; el('scanline').style.display='none'; el('vpempty').style.display='block'; el('cambtn').textContent='Kamera starten'; setScan('','Kamera bereit'); }
  const cvs=document.createElement('canvas');
  async function tick(){ if(!running) return; try{
    if(video.readyState>=2 && video.videoWidth){
      if(detector){ const codes=await detector.detect(video); if(codes&&codes[0]?.rawValue) handleScan(codes[0].rawValue); }
      else if(jsqrFn){ cvs.width=video.videoWidth; cvs.height=video.videoHeight;
        const cx=cvs.getContext('2d',{willReadFrequently:true}); cx.drawImage(video,0,0,cvs.width,cvs.height);
        const d=cx.getImageData(0,0,cvs.width,cvs.height); const c=jsqrFn(d.data,d.width,d.height); if(c&&c.data) handleScan(c.data); }
    }}catch(e){} raf=requestAnimationFrame(tick); }
  el('cambtn').onclick=()=>{ running?stopCam():startCam(); };
  window.addEventListener('pagehide',stopCam);

  /* ---- Start ---- */
  setTray(0);
})();
