import { ART } from './art-map.js';

// Components and UI are Construct Sprite/Text instances. The script only handles
// topology, the DC nodal solver, and linked drag/measurement state.
// The whole layout is usable except for the actual HUD surfaces.
const STAGE = { left: 0, right: 1920, top: 0, bottom: 1080 };
const HUD_AREAS = [
  {left:0,right:145,top:105,bottom:830},
  {left:0,right:140,top:831,bottom:890},
  {left:38,right:102,top:898,bottom:952},
  {left:0,right:140,top:968,bottom:1026},
  {left:1642,right:1920,top:205,bottom:845},
  {left:1370,right:1920,top:15,bottom:125}
];
const SNAP = 48;
const TERMINAL_RING_SIZE = 58;
const WIRE_DEFAULT_LENGTH = 190;
const WIRE_MIN_LENGTH = 165;
const ELECTRON_SPACING = 55;
const WIRE_THICKNESS = 26;
const WIRE_END_RADIUS = WIRE_THICKNESS / 2;
const TYPES = ['wire', 'battery', 'bulb', 'resistor', 'switch'];
const TR_NAMES = {wire:'Kablo',battery:'Pil',bulb:'Ampul',resistor:'Direnç',switch:'Anahtar',
  voltmeter:'Voltmetre',ammeter:'Ampermetre',mini:'Seri ampermetre'};
const DIM = {battery:[200,68],resistor:[206,118],switch:[217,162],bulb:[208,237],
  ammeter:[213,213],voltmeter:[261,213],mini:[208,131]};
const TERMINALS = {battery:[[-96,0],[96,0]],resistor:[[-99,29],[99,29]],
  switch:[[-99,62],[104,62]],bulb:[[-99,86],[99,86]],mini:[[-96,43],[96,43]]};
const PANEL_SCALE = .75;
// Coordinates measured from the source "... genel" compositions. Each
// control keeps the same source size and centre after the shared scale.
const PANEL_LAYOUT = {
  battery:{base:'parameterBattery',size:[846,200],field:[314,0,221,62],
    track:[156,90,435,31],thumb:[154,67,77,78],flip:[43,65,82,82],
    cut:[622,63,82,82],remove:[725,60,82,82]},
  resistor:{base:'parameterResistor',size:[728,200],field:[254,0,221,62],
    track:[40,90,435,31],thumb:[38,67,77,78],
    cut:[506,63,82,82],remove:[609,60,82,82]},
  bulb:{base:'parameterBulb',size:[728,181],field:[254,0,221,62],
    track:[40,90,435,31],thumb:[38,67,77,78],
    cut:[506,63,82,82],remove:[609,60,82,82]},
  switch:{base:'parameterSwitch',size:[643,188],flip:[50,47,82,82],
    cut:[410,47,82,82],remove:[513,46,82,82]},
  wire:{base:'parameterWire',size:[378,188],flip:[50,47,82,82],
    cut:[148,47,82,82],remove:[246,47,82,82]}
};

runOnStartup(async runtime => {
  runtime.addEventListener('afteranylayoutstart', () => {
    if (runtime.layout.name === 'game') setup(runtime);
  });
});

function solveLinear(a, b) {
  const n=b.length, m=a.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++) {
    let pivot=c;
    for(let r=c+1;r<n;r++)if(Math.abs(m[r][c])>Math.abs(m[pivot][c]))pivot=r;
    if(Math.abs(m[pivot][c])<1e-13)return null;
    [m[c],m[pivot]]=[m[pivot],m[c]];
    const d=m[c][c];
    for(let j=c;j<=n;j++)m[c][j]/=d;
    for(let r=0;r<n;r++)if(r!==c){const k=m[r][c];for(let j=c;j<=n;j++)m[r][j]-=k*m[c][j];}
  }
  return m.map(r=>r[n]);
}

function setup(runtime) {
  const layer=runtime.layout.getLayer('hud');
  const state={parts:[],links:[],selected:null,drag:null,nextId:1,scale:1,
    showCurrent:true,showValues:false,showLabels:false,currentType:'electrons',
    sound:false,warning:'',volt:0,amps:0,probes:[],settingsOpen:false,panelOpen:false,view:'real'};
  const obj=key=>runtime.objects[key];
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const fmt=(v,unit)=>Number.isFinite(v)?`${Math.abs(v)<.005?'0.00':v.toFixed(2)} ${unit}`:'—';
  const digits=v=>Number.isFinite(v)?(Math.abs(v)<.005?'0.00':v.toFixed(2)):'—';
  const local=(p,x,y)=>({x:p.x+(x*Math.cos(p.angle)-y*Math.sin(p.angle))*state.scale,
    y:p.y+(x*Math.sin(p.angle)+y*Math.cos(p.angle))*state.scale});
  const inside=(x,y,x0,y0,w,h)=>x>=x0&&x<=x0+w&&y>=y0&&y<=y0+h;
  const inStage=(x,y)=>inside(x,y,0,0,STAGE.right,STAGE.bottom)&&
    !HUD_AREAS.some(b=>inside(x,y,b.left,b.top,b.right-b.left,b.bottom-b.top));
  const mouse=e=>layer.cssPxToLayer(e.clientX,e.clientY);
  const sprite=(key,zone,x,y,w,h)=>{
    const s=obj('circuitArt').createInstance(zone,x,y);
    s.stopAnimation();s.animationFrame=ART[key];
    if(w&&h)s.setSize(w,h);
    return s;
  };
  const text=(value,zone,x,y,w,h,size=23,color=[.11,.15,.21],align='left',bold=false)=>{
    const t=obj('circuitText').createInstance(zone,x,y);
    t.setOrigin(0,0);t.setPosition(x,y);t.setSize(w,h);t.text=String(value);
    t.fontFace='Calibri';t.sizePt=size;t.fontColor=color;t.isBold=bold;
    t.horizontalAlign=align;t.verticalAlign='center';
    return t;
  };
  const art=(key,zone,x,y,w,h)=>sprite(key,zone,x,y,w,h);
  const setText=(t,value)=>{if(t&&t.text!==String(value))t.text=String(value);};
  const destroy=i=>{if(i)try{i.destroy();}catch(_){}};
  let clickSoundUrl=null;
  void Promise.resolve(runtime.assets.getMediaFileUrl('click.webm'))
    .then(url=>{clickSoundUrl=url;}).catch(()=>{});
  const beep=()=>{if(!state.sound||!clickSoundUrl)return;try{
    const a=new Audio(clickSoundUrl);a.volume=.35;void a.play().catch(()=>{});
  }catch(_){}};

  const heading=text('Dirençlerin ve Üreteçlerin Bağlanması','hud',200,24,1200,70,39,[.14,.19,.26],'left',true);
  const info=text('Parçayı sürükleyin; uçları birbirine yaklaştırınca bağlantı oluşur.','hud',215,100,1370,45,22,[.2,.25,.31]);
  heading.isVisible=info.isVisible=false;
  // PhET-style component drawer: one compact white column with a fixed slot
  // for each component. All five supplied parts fit, so no paging arrows are
  // shown.
  const palettePanel=art('rightPanel','hud',70,466,140,720);
  // Mirror the one-sided panel asset: its straight edge sits on the screen's
  // left edge and the rounded edge faces the work area.
  palettePanel.setSize(-140,720);
  const tools=[
    ['wire','paletteWire',185],['battery','paletteBattery',320],
    ['bulb','paletteBulb',455],['resistor','paletteResistor',590],
    ['switch','paletteSwitch',725]
  ];
  const paletteNames=[],paletteSprites=[];
  for(let i=0;i<tools.length;i++){
    const [kind,key,y]=tools[i];
    paletteSprites.push(art(key,'hud',65,y-13,104,104));
    const label=text(TR_NAMES[kind],'hud',0,y+43,130,35,20,[.05,.05,.06],'center',false);
    label.isVisible=true;paletteNames.push(label);
    if(i<tools.length-1)text('────────','hud',5,y+73,120,24,18,[.72,.72,.72],'center');
  }
  const realView=art('viewFrame','hud',34,860,62,48);
  const schematicView=art('viewFrame','hud',106,860,62,48);
  art('pieceBattery','hud',34,860,44,15);
  art('schematicBattery','hud',106,860,44,25);
  schematicView.opacity=.5;
  const currentToggle=art('viewFrame','hud',70,925,62,48);
  const currentDisc=text('●','hud',50,905,40,40,32,[.02,.56,.82],'center',true);
  const currentMinus=text('−','hud',50,905,40,40,23,[1,1,1],'center',true);
  const zoomOut=art('zoomOut','hud',34,996,58,52);
  const zoomIn=art('zoomIn','hud',106,996,58,52);
  art('menuIcon','hud',1638,69,99,100);
  const helpPanel=art('settingsPanel','hud',1471,539,278,678);helpPanel.isVisible=false;
  const settingsTitle=text('GÖRÜNÜM','hud',1350,254,240,36,22,[.15,.19,.24],'center',true);
  art('rightPanel','hud',1781,525,278,640);
  // The source panel has a left shadow/border; its visible white interior is
  // centred 10 px to the right of the sprite origin.
  // Three instruments share equal centre spacing and are vertically centred
  // as one group inside the panel.
  const meterPalette={
    voltmeter:art('paletteVoltmeter','hud',1791,315,190,166),
    ammeter:art('paletteAmmeter','hud',1791,525,171.4,166),
    mini:art('paletteMiniAmmeter','hud',1791,735,170,129)
  };
  const optCurrent=text('☑ Elektron akışı','hud',1350,324,235,42,21);
  const optType=text('Elektronlar  ⇄','hud',1350,378,235,42,21);
  const optLabels=text('☐ Etiketler','hud',1350,432,235,42,21);
  const optValues=text('☐ Değerler','hud',1350,486,235,42,21);
  const readout=text('','hud',1350,568,235,75,20,[.11,.2,.3]);readout.isVisible=false;
  const settingsItems=[settingsTitle,optCurrent,optType,optLabels,optValues];
  settingsItems.forEach(item=>item.isVisible=false);
  function toggleCurrent(){
    state.showCurrent=!state.showCurrent;
    currentToggle.opacity=state.showCurrent?1:.5;
    currentDisc.opacity=currentMinus.opacity=state.showCurrent?1:.3;
    setText(optCurrent,(state.showCurrent?'☑':'☐')+' Elektron akışı');beep();
  }
  const formula=text('V = I·R     |     Seri: Rₑ = ΣR     |     Paralel: 1/Rₑ = Σ(1/R)','hud',288,1022,1325,45,22,[.18,.22,.3],'center');
  formula.isVisible=false;
  const parameter=art('parameterBattery','hud',930,971,846*PANEL_SCALE,200*PANEL_SCALE);
  const paramValue=text('','hud',835,924,150,42,27,[.18,.20,.22],'center',true);
  paramValue.fontFace='Arial Black';
  const sliderTrack=art('sliderTrack','hud',850,988,246,18);
  const sliderThumb=art('sliderThumb','hud',760,988,32,32);
  const cut=art('cutIcon','hud',1100,969,72,72);
  const remove=art('deleteIcon','hud',1190,969,72,72);
  const flip=art('flipIcon','hud',630,969,72,72);
  const panelItems=[parameter,paramValue,sliderTrack,sliderThumb,cut,remove,flip];
  panelItems.forEach(i=>i.isVisible=false);
  let panelBox=null,sliderBounds=null;
  const smallTip=text('Devre kurmak için soldan bir parça sürükleyin.','hud',380,875,1120,100,28,[.18,.23,.29],'center');
  smallTip.isVisible=false;

  // Flexible instrument leads reuse the supplied cable texture along a curve.
  function makeLead(color){return Array.from({length:28},()=>art(color==='red'?'wireRed':'wireBlack','instrumentLeads',0,0,8,6));}
  function leadPath(start,end,bend=1,exit='down'){
    const f=state.scale,drop=Math.max(55*f,Math.min(180*f,Math.hypot(end.x-start.x,end.y-start.y)*.45));
    // A side jack has a fixed straight outlet before the flexible cable bends.
    const horizontal=exit==='side';
    const outlet=horizontal?[start,{x:start.x+bend*30*f,y:start.y},
      ...Array.from({length:4},(_,i)=>{const a=(i+1)*Math.PI/8;return {
        x:start.x+bend*(30+15*Math.sin(a))*f,y:start.y+15*(1-Math.cos(a))*f};}),
      {x:start.x+bend*45*f,y:start.y+30*f}]:[start,{x:start.x,y:start.y+12*f}];
    const neck=outlet.at(-1);
    const c1={x:neck.x,y:clamp(neck.y+drop,STAGE.top,STAGE.bottom)};
    // Approach a probe from below and from its inner side so the return loop
    // stays clear of the long handle instead of tracing over its silhouette.
    const c2={x:clamp(end.x+bend*(horizontal?-65:45)*f,STAGE.left,STAGE.right),
      y:clamp(end.y+drop,STAGE.top,STAGE.bottom)};
    const point=t=>{const u=1-t;return {x:u*u*u*neck.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*end.x,
      y:u*u*u*neck.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*end.y};};
    const count=29-outlet.length;
    return [...outlet,...Array.from({length:count},(_,i)=>point((i+1)/count))];
  }
  function drawLead(segments,start,end,bend=1,exit='down'){
    const f=state.scale,points=leadPath(start,end,bend,exit);
    segments.forEach((seg,i)=>{const before=points[i],next=points[i+1],dx=next.x-before.x,dy=next.y-before.y;
      const length=Math.hypot(dx,dy),first=i===0,shift=first?f/2:0;
      // Overlap only toward the next segment, never back over the socket.
      seg.setPosition((before.x+next.x)/2+dx/(length||1)*shift,(before.y+next.y)/2+dy/(length||1)*shift);
      seg.setSize(length+(first?1:2)*f,6*f);seg.angle=Math.atan2(dy,dx);});
  }
  function instrumentLeads(p){
    const f=state.scale;
    if(p.kind==='voltmeter')return [[p.redLead,local(p,-130.5,82),
      {x:p.probeRed.x-52*.7*f,y:p.probeRed.y+298*.7*f},-1,'side'],
      [p.blackLead,local(p,130.5,82),{x:p.probeBlack.x+53*.7*f,y:p.probeBlack.y+298*.7*f},1,'side']];
    if(p.kind==='ammeter')return [[p.sensorLead,local(p,-1,96),{x:p.sensorPoint.x,y:p.sensorPoint.y+67*f},-1]];
    return [];
  }
  function syncProbe(point){
    if(point.anchor&&state.parts.includes(point.anchor.p))Object.assign(point,ends(point.anchor.p)[point.anchor.index]);
    else point.anchor=null;
  }
  function updateInstruments(p){
    const f=state.scale;
    if(p.kind==='voltmeter'){
      for(const [point,probe,lead,side] of [[p.probeRed,p.red,p.redLead,-1],[p.probeBlack,p.black,p.blackLead,1]]){
        syncProbe(point);
        // Coordinates are the metal contact, not the centre of the handle.
        const tipX=side<0?60:8,tipY=2,probeScale=.7*f;
        probe.setSize(69*probeScale,305*probeScale);
        probe.setPosition(point.x+(34.5-tipX)*probeScale,point.y+(152.5-tipY)*probeScale);
        probe.moveToTop();
      }
    }
    if(p.kind==='ammeter'&&p.sensor){
      p.sensor.setPosition(p.sensorPoint.x,p.sensorPoint.y);p.sensor.setSize(108*f,144*f);
      p.sensor.moveToTop();
    }
    for(const [segments,start,end,bend,exit] of instrumentLeads(p))drawLead(segments,start,end,bend,exit);
    if(p.kind==='mini')for(const marker of [...p.term,...p.jointOuter,...p.jointInner])marker.moveToTop();
    if(p.reading){
      const [w,h,font,top]=p.kind==='voltmeter'?[187,67,42,-99]:p.kind==='ammeter'?[194,68,43,-100]:[142,46,30,-60];
      p.reading.setSize(w*f,h*f);p.reading.sizePt=font*f;p.reading.fontFace='Arial Black';
      p.reading.setPosition(p.x-w*f/2,p.y+(top+10)*f);
      // The supplied 156×68 glass keeps its source aspect over each large
      // instrument's white display; the mini meter uses its own 145×58 crop.
      const [gw,gh,gy]=p.kind==='voltmeter'?[192,84,-59]:p.kind==='ammeter'?[194,85,-59]:[145,58,-30];
      p.glass.setPosition(p.x,p.y+gy*f);p.glass.setSize(gw*f,gh*f);
      p.glass.moveToTop();
    }
  }
  const moved=(p)=>{
    if(p.kind==='wire')return;
    updateJoints(p);
    const position=p.kind==='bulb'?local(p,2.8,-65.2):p;
    p.main.setPosition(position.x,position.y);p.main.angle=p.angle+(p.reversed?Math.PI:0);
    updateInstruments(p);
    if(p.nameLabel)p.nameLabel.setPosition(p.x-120*state.scale,p.y+(p.kind==='bulb'?137:120)*state.scale);
  };
  function ends(p) {
    if(p.kind==='wire')return [p.p0,p.p1];
    return (TERMINALS[p.kind]||[]).map(([x,y])=>local(p,x,y));
  }
  function makeCurrentNode(){
    const disc=text('●','meters',0,0,40,40,32,[.02,.56,.82],'center',true);
    const minus=text('−','meters',0,0,40,40,23,[1,1,1],'center',true);
    disc.isVisible=minus.isVisible=false;return {disc,minus};
  }
  function ensureWireNodes(p,len){
    const wanted=clamp(Math.floor((len+.001)/(ELECTRON_SPACING*state.scale)),3,60);
    p.nodes=p.nodes||[];
    while(p.nodes.length<wanted)p.nodes.push(makeCurrentNode());
    while(p.nodes.length>wanted){const node=p.nodes.pop();destroy(node.disc);destroy(node.minus);}
  }
  function updateOutline(p){
    const o=p.outline;if(!o)return;
    o.isVisible=state.selected===p;
    if(!o.isVisible){if(p.capOutline)p.capOutline.forEach(v=>v.isVisible=false);return;}
    let key=p.kind==='wire'&&state.view==='schematic'?'outlineSchematicWire':
      'outline'+({battery:'Battery',resistor:'Resistor',bulb:'Bulb',voltmeter:'Voltmeter',ammeter:'Ammeter',mini:'Mini',wire:'Wire',switch:p.closed?'SwitchClosed':'SwitchOpen'}[p.kind]);
    o.animationFrame=ART[key];o.setPosition(p.x,p.y);o.angle=p.angle;
    if(p.kind==='wire'){
      const f=state.scale,r=WIRE_END_RADIUS*f;
      const dx=p.p1.x-p.p0.x,dy=p.p1.y-p.p0.y,len=Math.hypot(dx,dy);
      const schematic=state.view==='schematic';
      o.setSize(schematic?len:len-2*r,(schematic?19:WIRE_THICKNESS+14)*f);o.angle=p.main.angle;
      for(let i=0;i<2;i++){
        const point=i?p.p1:p.p0,dir=i?-1:1,attached=isConnected(p,i);
        const cap=p.capOutline[i];
        const offset=schematic||attached?0:r;
        cap.animationFrame=ART[schematic&&!attached?'outlineSchematicCap':'outlineWireCap'];
        cap.setPosition(point.x+dir*dx/(len||1)*offset,point.y+dir*dy/(len||1)*offset);
        const diameter=(attached?42:schematic?19:WIRE_THICKNESS+14)*f;
        cap.setSize(diameter,diameter);cap.isVisible=true;cap.moveToBottom();
      }
    }else{
      const [w,h]=DIM[p.kind],f=state.scale;
      o.setSize((w+14)*f,(h+14)*f);
    }
    o.moveToBottom();
  }
  function createJointPair(){
    return {
      outer:art('jointOuter','meters',0,0,28,28),
      inner:art('jointCopper','meters',0,0,16,16)
    };
  }
  function updateJoints(p,endpoints=ends(p)){
    if(!p.term?.length)return;
    for(let i=0;i<endpoints.length;i++){
      const e=endpoints[i];
      const connected=isConnected(p,i);
      const marker=p.term[i];
      marker.setPosition(e.x,e.y);
      marker.setSize(TERMINAL_RING_SIZE*state.scale,TERMINAL_RING_SIZE*state.scale);
      marker.angle=0;
      marker.isVisible=true;
      const outer=p.jointOuter[i],inner=p.jointInner[i];
      outer.setPosition(e.x,e.y);inner.setPosition(e.x,e.y);
      outer.setSize(28*state.scale,28*state.scale);inner.setSize(16*state.scale,16*state.scale);
      outer.isVisible=inner.isVisible=connected;
    }
  }
  function refreshConnections(){
    for(const p of state.parts){
      if(!p.term?.length)continue;
      const endpoints=ends(p);
      updateJoints(p,endpoints);
      if(p.kind==='wire'){
        p.tip0.isVisible=state.view==='real'&&!isConnected(p,0);
        p.tip1.isVisible=state.view==='real'&&!isConnected(p,1);
        p.cap0.isVisible=p.tip0.isVisible;
        p.cap1.isVisible=p.tip1.isVisible;
        p.bridge0.isVisible=state.view==='real'&&isConnected(p,0);
        p.bridge1.isVisible=state.view==='real'&&isConnected(p,1);
        updateOutline(p);
      }
    }
  }
  function createPart(kind,x,y) {
    if(['voltmeter','ammeter','mini'].includes(kind)&&state.parts.filter(p=>p.kind===kind).length>=2)return null;
    const id=state.nextId++,half=(kind==='wire'?WIRE_DEFAULT_LENGTH/2:185)*state.scale;
    const p={id,kind,x,y,angle:0,resistance:kind==='resistor'?10:kind==='bulb'?10:0,
      voltage:kind==='battery'?9:0,closed:false,color:'black',current:0,power:0,
      p0:{x:x-half,y:y+(kind==='mini'?90*state.scale:0)},p1:{x:x+half,y:y+(kind==='mini'?90*state.scale:0)},phase:0,term:[]};
    p.outline=art('outline'+({battery:'Battery',resistor:'Resistor',bulb:'Bulb',switch:'SwitchOpen',wire:'Wire',voltmeter:'Voltmeter',ammeter:'Ammeter',mini:'Mini'}[kind]),kind==='wire'?'wires':'parts',x,y,1,1);
    p.outline.isVisible=false;
    const key={battery:'pieceBattery',resistor:'resistor10',switch:'pieceSwitchOpen',
      ammeter:'pieceAmmeter',voltmeter:'pieceVoltmeter',mini:'pieceMiniAmmeter'}[kind];
    if(kind==='bulb'){
      // Each source frame already contains the bulb and its base. One sprite
      // prevents the unlit glass from covering the luminous frame.
      p.main=obj('bulbGlow').createInstance('parts',x,y);
      p.main.stopAnimation();p.main.animationFrame=125;p.main.setSize(448.4,370);
      p.frame=125;p.target=125;
    } else if(kind==='wire') {
      p.main=art('wireBlack','wires',x,y,WIRE_DEFAULT_LENGTH,WIRE_THICKNESS);
      p.tip0=art('leftCableBlack','meters',x-half,y,65,WIRE_THICKNESS);
      p.tip1=art('rightCableBlack','meters',x+half,y,65,WIRE_THICKNESS);p.nodes=[];
      // The supplied bare-copper crop bridges the insulation to a connected
      // joint; the source left/right cable crops remain the free-end caps.
      p.bridge0=art('tipBlack','meters',x-half,y,32,12);
      p.bridge1=art('tipBlack','meters',x+half,y,32,12);
      p.bridge0.isVisible=p.bridge1.isVisible=false;
      p.cap0=art('jointCopper','meters',x-half,y,WIRE_THICKNESS,WIRE_THICKNESS);
      p.cap1=art('jointCopper','meters',x+half,y,WIRE_THICKNESS,WIRE_THICKNESS);
      p.capOutline=[0,1].map(()=>art('outlineWireCap','wires',x,y,40,40));
      p.capOutline.forEach(v=>v.isVisible=false);
    } else p.main=art(key,'parts',x,y,...DIM[kind]);
    if(TERMINALS[kind]||['wire','mini'].includes(kind)){
      p.term=[0,1].map(()=>art('terminalRing','meters',0,0,TERMINAL_RING_SIZE,TERMINAL_RING_SIZE));
      const joints=[createJointPair(),createJointPair()];
      p.jointOuter=joints.map(j=>j.outer);p.jointInner=joints.map(j=>j.inner);
      [...p.jointOuter,...p.jointInner].forEach(v=>v.isVisible=false);
    }
    if(['voltmeter','ammeter','mini'].includes(kind)){
      p.reading=text('0.00','meters',x,y,190,70,42,[0,0,0],'center',true);
      p.glass=art(kind==='mini'?'miniMeterGlass':'meterGlass','meters',x,y,156,68);
    }
    if(kind==='voltmeter'){
      p.redLead=makeLead('red');p.blackLead=makeLead('black');
      p.red=art('probeRed','instrumentLeads',x-112,y+110,48.3,213.5);
      p.black=art('probeBlack','instrumentLeads',x+112,y+110,48.3,213.5);
      p.probeRed={p,x:x-225*state.scale,y:y+40*state.scale,side:-1};
      p.probeBlack={p,x:x+225*state.scale,y:y+40*state.scale,side:1};
      state.probes.push(p.probeRed,p.probeBlack);
    }
    if(kind==='ammeter'){
      p.sensorPoint={x:x-165*state.scale,y:y-95*state.scale};p.sensorLead=makeLead('black');
      p.sensor=art('miniProbe','instrumentLeads',p.sensorPoint.x,p.sensorPoint.y,108,144);
    }
    if(kind==='mini'){
      for(const marker of [...p.term,...p.jointOuter,...p.jointInner])marker.moveToLayer(runtime.layout.getLayer('instrumentLeads'));
    }
    if(kind!=='wire')p.nameLabel=text(TR_NAMES[kind],'meters',x-100,y+100,200,33,18,[.17,.22,.27],'center');
    if(['battery','resistor','bulb','switch'].includes(kind)){
      p.symbol=art('schematic'+({battery:'Battery',resistor:'Resistor',bulb:'Bulb',switch:'SwitchOpen'}[kind]),'parts',x,y,...DIM[kind]);p.symbol.isVisible=false;
    }
    state.parts.push(p);renderPart(p);select(null);updateMeterPalette();recompute();return p;
  }
  function updateMeterPalette(){
    for(const [kind,sprite] of Object.entries(meterPalette))sprite.opacity=state.parts.filter(p=>p.kind===kind).length>=2?.35:1;
  }
  function renderPart(p) {
    if(p.kind==='wire'){
      const dx=p.p1.x-p.p0.x,dy=p.p1.y-p.p0.y,len=Math.hypot(dx,dy);
      const ux=dx/(len||1),uy=dy/(len||1),r=WIRE_END_RADIUS*state.scale;
      ensureWireNodes(p,len);p.x=(p.p0.x+p.p1.x)/2;p.y=(p.p0.y+p.p1.y)/2;
      p.main.setPosition(p.x,p.y);
      p.main.animationFrame=ART[state.view==='schematic'?'schematicWire':p.color==='red'?'wireRed':'wireBlack'];
      p.main.setSize(state.view==='real'?len-2*r:len,WIRE_THICKNESS*state.scale);p.main.angle=Math.atan2(dy,dx);
      const tip0Width=61/21*WIRE_THICKNESS*state.scale,tip1Width=(p.color==='red'?77/26:61/22)*WIRE_THICKNESS*state.scale;
      p.tip0.setPosition(p.p0.x+ux*(r+tip0Width/2),p.p0.y+uy*(r+tip0Width/2));
      p.tip1.setPosition(p.p1.x-ux*(r+tip1Width/2),p.p1.y-uy*(r+tip1Width/2));
      p.tip0.setSize(tip0Width,WIRE_THICKNESS*state.scale);p.tip1.setSize(tip1Width,WIRE_THICKNESS*state.scale);
      p.tip0.angle=p.tip1.angle=p.main.angle;
      p.tip0.isVisible=state.view==='real'&&!isConnected(p,0);p.tip1.isVisible=state.view==='real'&&!isConnected(p,1);
      p.bridge0.setPosition(p.p0.x+ux*16*state.scale,p.p0.y+uy*16*state.scale);
      p.bridge1.setPosition(p.p1.x-ux*16*state.scale,p.p1.y-uy*16*state.scale);
      p.bridge0.setSize(32*state.scale,12*state.scale);p.bridge1.setSize(32*state.scale,12*state.scale);
      p.bridge0.angle=p.bridge1.angle=p.main.angle;
      p.bridge0.isVisible=state.view==='real'&&isConnected(p,0);
      p.bridge1.isVisible=state.view==='real'&&isConnected(p,1);
      p.cap0.setPosition(p.p0.x+ux*r,p.p0.y+uy*r);
      p.cap1.setPosition(p.p1.x-ux*r,p.p1.y-uy*r);
      p.cap0.setSize(WIRE_THICKNESS*state.scale,WIRE_THICKNESS*state.scale);
      p.cap1.setSize(WIRE_THICKNESS*state.scale,WIRE_THICKNESS*state.scale);
      p.cap0.isVisible=p.tip0.isVisible;p.cap1.isVisible=p.tip1.isVisible;
      updateJoints(p);
    } else {
      if(p.kind==='battery')p.main.animationFrame=ART.pieceBattery;
      if(p.kind==='resistor')p.main.animationFrame=ART['resistor'+p.resistance];
      if(p.kind==='switch')p.main.animationFrame=ART[p.closed?'switchClosedAligned':'pieceSwitchOpen'];
      if(p.kind==='bulb'){
        p.frame=p.target;p.main.animationFrame=p.frame;p.main.opacity=1;
        p.main.setSize(448.4*state.scale,370*state.scale);
      }else p.main.setSize(...DIM[p.kind].map(v=>v*state.scale));
      moved(p);
      if(p.symbol){
        p.symbol.animationFrame=ART['schematic'+({battery:'Battery',resistor:'Resistor',bulb:'Bulb',switch:p.closed?'SwitchClosed':'SwitchOpen'}[p.kind])];
        p.symbol.setPosition(p.x,p.y);p.symbol.setSize(...DIM[p.kind].map(v=>v*state.scale));p.symbol.angle=p.angle+(p.reversed?Math.PI:0);
        p.symbol.isVisible=state.view==='schematic';p.main.isVisible=state.view==='real';
      }
    }
    updateOutline(p);
  }
  function select(p,openPanel=true) {
    state.selected=p;
    setText(info,p?.kind==='voltmeter'
      ?'Kırmızı ve siyah probun metal uçlarını iki bağlantı noktasına taşıyın.'
      :p?.kind==='mini'
      ?'Küçük ampermetrenin gövdesindeki iki bağlantı noktasını devreye seri bağlayın.'
      :p?.kind==='ammeter'
      ?'Kablolu sensörü akımını ölçeceğiniz kablonun üstüne taşıyın.'
      :'Parçayı sürükleyin; uçları birbirine yaklaştırınca bağlantı oluşur.');
    state.parts.forEach(q=>renderPart(q));
    const supported=p&&TR_NAMES[p.kind];
    state.panelOpen=!!supported&&openPanel;
    panelItems.forEach(i=>i.isVisible=false);panelBox=null;sliderBounds=null;
    smallTip.isVisible=false;
    if(state.panelOpen){
      const layout=PANEL_LAYOUT[p.kind],s=PANEL_SCALE;
      if(layout){
        const [w,h]=layout.size,left=930-w*s/2,top=971-h*s/2;
        panelBox={left,right:left+w*s,top,bottom:top+h*s};
        const place=(sprite,[x,y,width,height])=>{
          sprite.setPosition(left+(x+width/2)*s,top+(y+height/2)*s);
          sprite.setSize(width*s,height*s);sprite.isVisible=true;
        };
        parameter.animationFrame=ART[p.kind==='switch'&&p.closed?'parameterSwitchClosed':layout.base];
        parameter.setPosition(930,971);parameter.setSize(w*s,h*s);parameter.isVisible=true;
        place(remove,layout.remove);
        remove.animationFrame=ART[['wire','switch'].includes(p.kind)?'deleteCompact':'deleteIcon'];
        place(cut,layout.cut);
        cut.animationFrame=ART[hasConnections(p)?'cutIcon':p.kind==='wire'?'cutWireDisabled':'cutDisabled'];
        if(layout.flip){
          place(flip,layout.flip);
          flip.animationFrame=ART[p.kind==='wire'?'colorIcon':p.kind==='switch'?
            (p.closed?'switchClosedButton':'switchOpenButton'):'flipIcon'];
        }
        if(layout.field){
          const [x,y,width,height]=layout.field;
          paramValue.setPosition(left+x*s,top+y*s);paramValue.setSize(width*s,height*s);
          paramValue.sizePt=27;paramValue.isVisible=true;
          place(sliderTrack,layout.track);
          sliderTrack.animationFrame=ART.sliderTrack;
          sliderThumb.animationFrame=ART.sliderThumb;
          sliderThumb.setSize(layout.thumb[2]*s,layout.thumb[3]*s);
          sliderThumb.isVisible=true;
          const railStart=left+layout.track[0]*s,railEnd=railStart+layout.track[2]*s;
          const thumbRadius=layout.thumb[2]*s/2;
          sliderBounds={left:railStart+thumbRadius,right:railEnd-thumbRadius,
            hitLeft:railStart,hitRight:railEnd,hitHalfHeight:layout.thumb[3]*s/2,
            y:top+(layout.track[1]+layout.track[3]/2)*s};
          updateParameterValue();
        }
      }else{
        // No meter-specific panel artwork exists. Show only source action
        // icons, without squeezing a battery panel around the instrument.
        panelBox={left:846,right:1014,top:927,bottom:1016};
        remove.animationFrame=ART.deleteCompact;
        remove.setPosition(p.term?.length?971:930,971);
        remove.setSize(82*s,82*s);remove.isVisible=true;
        if(p.term?.length){
          cut.animationFrame=ART[hasConnections(p)?'cutIcon':'cutDisabled'];
          cut.setPosition(889,971);cut.setSize(82*s,82*s);cut.isVisible=true;
        }
      }
    }
  }
  function parameterRange(p){return p.kind==='battery'?[1,20]:p.kind==='resistor'?[2,10]:[2,20];}
  function updateParameterValue(){
    const p=state.selected;if(!p||!sliderBounds)return;
    const [min,max]=parameterRange(p),value=p.kind==='battery'?p.voltage:p.resistance;
    setText(paramValue,`${value} ${p.kind==='battery'?'volt':'ohm'}`);
    sliderThumb.setPosition(sliderBounds.left+(value-min)/(max-min)*(sliderBounds.right-sliderBounds.left),sliderBounds.y);
  }
  function setParameter(value){
    const p=state.selected;if(!p||!sliderBounds)return;
    const [min,max]=parameterRange(p),v=clamp(Math.round(value),min,max);
    if(p.kind==='battery')p.voltage=v;else p.resistance=v;
    renderPart(p);updateParameterValue();recompute();
  }
  function sliderAt(x){
    const p=state.selected;if(!p||!sliderBounds)return;
    const [min,max]=parameterRange(p);
    setParameter(min+clamp((x-sliderBounds.left)/(sliderBounds.right-sliderBounds.left),0,1)*(max-min));
  }
  const refKey=(p,index)=>`${p.id}:${index}`;
  function isConnected(p,index){return state.links.some(l=>l.a.p===p&&l.a.index===index||l.b.p===p&&l.b.index===index);}
  function hasConnections(p){return ends(p).some((_,i)=>isConnected(p,i));}
  function jointMembers(p,index){
    const found=new Map(),queue=[{p,index}];
    while(queue.length){const r=queue.shift(),key=refKey(r.p,r.index);if(found.has(key))continue;found.set(key,r);
      for(const l of state.links){if(refKey(l.a.p,l.a.index)===key)queue.push(l.b);if(refKey(l.b.p,l.b.index)===key)queue.push(l.a);}}
    return [...found.values()];
  }
  function connect(p,index,t){
    const a=ends(p)[index],b=ends(t.p)[t.index];
    if(Math.hypot(a.x-b.x,a.y-b.y)>.1)return;
    if(jointMembers(p,index).some(r=>r.p===t.p&&r.index===t.index))return;
    state.links.push({a:{p,index},b:{p:t.p,index:t.index}});
  }
  function removePart(p) {
    if(!p)return;
    state.links=state.links.filter(l=>l.a.p!==p&&l.b.p!==p);
    for(const v of partInstances(p))destroy(v);
    state.parts=state.parts.filter(q=>q!==p);state.probes=state.probes.filter(point=>point.p!==p);
    for(const point of state.probes)if(point.anchor?.p===p)point.anchor=null;
    select(null);updateMeterPalette();recompute();
  }
  function allTerminals(except=null) {
    return state.parts.filter(p=>p!==except&&p.term?.length).flatMap(p=>ends(p).map((v,index)=>({p,index,...v})));
  }
  function nearestTerminal(x,y,except=null,max=SNAP) {
    let best=null,dist=max*state.scale;
    for(const t of allTerminals(except)){const d=Math.hypot(t.x-x,t.y-y);if(d<dist){best=t;dist=d;}}
    return best;
  }
  const flexible=p=>p.kind==='wire';
  function geometrySnapshot(){return state.parts.map(p=>({p,x:p.x,y:p.y,angle:p.angle,p0:{...p.p0},p1:{...p.p1},
    red:p.probeRed&&{x:p.probeRed.x,y:p.probeRed.y},black:p.probeBlack&&{x:p.probeBlack.x,y:p.probeBlack.y},sensor:p.sensorPoint&&{...p.sensorPoint}}));}
  function restoreGeometry(snapshot){for(const v of snapshot){const p=v.p;p.x=v.x;p.y=v.y;p.angle=v.angle;Object.assign(p.p0,v.p0);Object.assign(p.p1,v.p1);
    if(v.red)Object.assign(p.probeRed,v.red);if(v.black)Object.assign(p.probeBlack,v.black);if(v.sensor)Object.assign(p.sensorPoint,v.sensor);}}
  const overlaps=(a,b)=>a.left<b.right-.01&&a.right>b.left+.01&&a.top<b.bottom-.01&&a.bottom>b.top+.01;
  function visualRegions(p){
    const f=state.scale,regions=[];
    const rect=(x,y,w,h)=>regions.push({left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2});
    const segment=(a,b,pad)=>regions.push({left:Math.min(a.x,b.x)-pad,right:Math.max(a.x,b.x)+pad,
      top:Math.min(a.y,b.y)-pad,bottom:Math.max(a.y,b.y)+pad});
    if(p.kind==='wire'){
      for(const end of [p.p0,p.p1])rect(end.x,end.y,TERMINAL_RING_SIZE*f,TERMINAL_RING_SIZE*f);
      const n=Math.max(1,Math.ceil(Math.hypot(p.p1.x-p.p0.x,p.p1.y-p.p0.y)/32));
      let before=p.p0;
      for(let i=1;i<=n;i++){const next={x:p.p0.x+(p.p1.x-p.p0.x)*i/n,y:p.p0.y+(p.p1.y-p.p0.y)*i/n};
        segment(before,next,(WIRE_THICKNESS/2+7)*f);before=next;}
    }else{
      const [w,h]=DIM[p.kind],c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle));
      rect(p.x,p.y,(w*c+h*s+14)*f,(w*s+h*c+14)*f);
      if(p.term?.length)for(const end of ends(p))rect(end.x,end.y,TERMINAL_RING_SIZE*f,TERMINAL_RING_SIZE*f);
      if(p.kind==='voltmeter')for(const probe of [p.probeRed,p.probeBlack]){
        const tipX=probe.side<0?60:8;
        rect(probe.x+(34.5-tipX)*.7*f,probe.y+150.5*.7*f,54.3*f,219.5*f);
      }
      if(p.sensorPoint)rect(p.sensorPoint.x,p.sensorPoint.y,114*f,150*f);
      for(const [,start,end,bend,exit] of instrumentLeads(p)){
        const points=leadPath(start,end,bend,exit);
        for(let i=1;i<points.length;i++)segment(points[i-1],points[i],4*f);
      }
    }
    return regions;
  }
  function visualBounds(p){
    const regions=visualRegions(p);
    return {left:Math.min(...regions.map(b=>b.left)),right:Math.max(...regions.map(b=>b.right)),
      top:Math.min(...regions.map(b=>b.top)),bottom:Math.max(...regions.map(b=>b.bottom))};
  }
  const fitsStage=p=>visualRegions(p).every(b=>b.left>=STAGE.left-.01&&b.right<=STAGE.right+.01&&
    b.top>=STAGE.top-.01&&b.bottom<=STAGE.bottom+.01&&!HUD_AREAS.some(h=>overlaps(b,h)));
  function fitNewPart(p){
    if(fitsStage(p))return true;
    const b=visualBounds(p),snapshot=geometrySnapshot(),xs=new Set([0,-b.left,STAGE.right-b.right]),
      ys=new Set([0,-b.top,STAGE.bottom-b.bottom]);
    for(const h of HUD_AREAS)for(const r of visualRegions(p))if(overlaps(r,h)){
      xs.add(h.left-r.right);xs.add(h.right-r.left);ys.add(h.top-r.bottom);ys.add(h.bottom-r.top);
    }
    const near=s=>[...s].sort((a,b)=>Math.abs(a)-Math.abs(b)).slice(0,16);
    const choices=near(xs).flatMap(dx=>near(ys).map(dy=>({dx,dy,d:dx*dx+dy*dy}))).sort((a,b)=>a.d-b.d);
    for(const {dx,dy} of choices){
      restoreGeometry(snapshot);rawTranslate(p,dx,dy);
      if(fitsStage(p)){renderPart(p);return true;}
    }
    restoreGeometry(snapshot);return false;
  }
  function propagateGeometry(driver){
    const queue=ends(driver).map((point,index)=>({p:driver,index,point:{...point}})),assigned=new Map();
    const rigid=new Set(flexible(driver)?[]:[driver]);
    while(queue.length){const task=queue.shift(),members=jointMembers(task.p,task.index);
      for(const ref of members){const key=refKey(ref.p,ref.index),previous=assigned.get(key);
        if(previous&&Math.hypot(previous.x-task.point.x,previous.y-task.point.y)>.05)return false;
        if(previous)continue;assigned.set(key,task.point);
        const q=ref.p,current=ends(q)[ref.index],dx=task.point.x-current.x,dy=task.point.y-current.y;
        if(Math.hypot(dx,dy)<.001)continue;
        if(flexible(q)){Object.assign(ref.index?q.p1:q.p0,task.point);}
        else{
          if(rigid.has(q))return false;rigid.add(q);rawTranslate(q,dx,dy);
          ends(q).forEach((point,index)=>{if(index!==ref.index)queue.push({p:q,index,point:{...point}});});
        }
      }
    }
    return state.parts.every(p=>(p.kind!=='wire'||Math.hypot(p.p1.x-p.p0.x,p.p1.y-p.p0.y)>=WIRE_MIN_LENGTH*state.scale-.001)&&
      (state.drag?.fromPalette||fitsStage(p)));
  }
  // Reject or clamp a gesture as one transaction. A cable cannot collapse, and
  // every explicit connection survives all movement until scissors/delete.
  function geometryEdit(p,change){
    const snapshot=geometrySnapshot();
    const attempt=f=>{restoreGeometry(snapshot);change(f);return propagateGeometry(p);};
    const controls=()=>[p,...ends(p),...(p.kind==='mini'?[p.p0,p.p1]:[]),
      ...[p.probeRed,p.probeBlack,p.sensorPoint].filter(Boolean)].map(e=>({x:e.x,y:e.y}));
    const before=controls();change(1);
    const distance=Math.max(0,...controls().map((e,i)=>Math.hypot(e.x-before[i].x,e.y-before[i].y)));
    restoreGeometry(snapshot);
    const steps=Math.max(1,Math.min(128,Math.ceil(distance/25)));
    let accepted=1;
    for(let step=1;step<=steps;step++)if(!attempt(step/steps)){
      let lo=(step-1)/steps,hi=step/steps;
      for(let n=0;n<15;n++){const mid=(lo+hi)/2;if(attempt(mid))lo=mid;else hi=mid;}
      accepted=lo;attempt(lo);break;
    }
    for(const q of state.parts)renderPart(q);
    return accepted>.999;
  }
  function rawTranslate(p,dx,dy){
    p.x+=dx;p.y+=dy;
    if(p.kind==='wire'||p.kind==='mini')for(let i=0;i<2;i++){
      const point=i?p.p1:p.p0;point.x+=dx;point.y+=dy;
    }
    if(p.kind==='voltmeter')for(const point of [p.probeRed,p.probeBlack])if(!point.anchor){point.x+=dx;point.y+=dy;}
    if(p.sensorPoint){p.sensorPoint.x+=dx;p.sensorPoint.y+=dy;}
  }
  function movePart(p,dx,dy){return geometryEdit(p,f=>rawTranslate(p,dx*f,dy*f));}
  function rotateFromEnd(p,index,x,y){
    const fixed=ends(p)[1-index],start=p.angle;
    const offsets=TERMINALS[p.kind],dx=offsets[index][0]-offsets[1-index][0],dy=offsets[index][1]-offsets[1-index][1];
    const desired=Math.atan2(y-fixed.y,x-fixed.x)-Math.atan2(dy,dx);
    const delta=Math.atan2(Math.sin(desired-start),Math.cos(desired-start));
    geometryEdit(p,f=>{p.angle=start+delta*f;const pivot=ends(p)[1-index];p.x+=fixed.x-pivot.x;p.y+=fixed.y-pivot.y;});
  }
  function snap(p,index=null,rotation=false){magnetize(p,index,rotation);renderPart(p);recompute();beep();}
  function magnetize(p,index=null,rotation=false){
    const indices=index===null?ends(p).map((_,i)=>i):[index];
    for(const i of indices){
      if(isConnected(p,i))continue;
      const e=ends(p)[i],t=nearestTerminal(e.x,e.y,p);if(!t)continue;
      if(flexible(p)){
        if(p.kind==='wire'&&Math.hypot(t.x-ends(p)[1-i].x,t.y-ends(p)[1-i].y)<WIRE_MIN_LENGTH*state.scale)continue;
        const old={...e};
        if(!geometryEdit(p,f=>Object.assign(i?p.p1:p.p0,{x:old.x+(t.x-old.x)*f,y:old.y+(t.y-old.y)*f})))continue;
      }else if(rotation&&isConnected(p,1-i)){
        // Rotation keeps the pivot. An unattached cable tip can meet the rigid
        // component, but the component's body is never stretched to fit it.
        if(!flexible(t.p)||isConnected(t.p,t.index))continue;
        const old={...ends(t.p)[t.index]};
        if(!geometryEdit(t.p,f=>Object.assign(t.index?t.p.p1:t.p.p0,{x:old.x+(e.x-old.x)*f,y:old.y+(e.y-old.y)*f})))continue;
      }else if(!movePart(p,t.x-e.x,t.y-e.y))continue;
      connect(p,i,t);
    }
  }

  // Modified nodal analysis. Near-ideal branches retain a tiny conductance
  // limit so branch currents remain computable at PhET's default settings.
  function recompute() {
    refreshConnections();
    for(const point of state.probes)syncProbe(point);
    const parts=state.parts.filter(p=>p.term?.length);
    const ts=parts.flatMap(p=>ends(p).map((v,i)=>({p,i,...v})));
    const parent=ts.map((_,i)=>i);
    const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
    for(const link of state.links){
      const a=ts.findIndex(t=>t.p===link.a.p&&t.i===link.a.index),b=ts.findIndex(t=>t.p===link.b.p&&t.i===link.b.index);
      if(a>=0&&b>=0)join(a,b);
    }
    const roots=[...new Set(ts.map((_,i)=>find(i)))];
    const nodes=new Map(roots.map((r,i)=>[r,i]));
    const edges=parts.map((p,k)=>({p,a:nodes.get(find(k*2)),b:nodes.get(find(k*2+1))}));
    const n=roots.length, batteries=edges.filter(e=>e.p.kind==='battery');
    state.warning='';
    if(batteries.some(e=>e.a===e.b))state.warning='Kısa devre: pil uçlarını ayırın.';
    let voltages=Array(n).fill(0),batteryCurrents=[];
    if(n>0&&!state.warning){
      const N=n+batteries.length,A=Array.from({length:N},()=>Array(N).fill(0)),z=Array(N).fill(0);
      for(let i=0;i<n;i++)A[i][i]+=1e-9;
      A[0][0]+=1; // ground the first node
      const resist=e=>e.p.kind==='wire'?0.0001:e.p.kind==='mini'?0.0001:
        e.p.kind==='switch'?(e.p.closed?0.0001:Infinity):e.p.resistance;
      for(const e of edges){
        if(e.p.kind==='battery'||e.a===e.b)continue;
        const r=resist(e);if(!Number.isFinite(r)||r<=0)continue;
        const g=1/r;A[e.a][e.a]+=g;A[e.b][e.b]+=g;
        A[e.a][e.b]-=g;A[e.b][e.a]-=g;
      }
      batteries.forEach((e,i)=>{
        const j=n+i;A[e.a][j]++;A[e.b][j]--;
        A[j][e.a]++;A[j][e.b]--;A[j][j]-=.0001;z[j]=e.p.voltage*(e.p.reversed?-1:1);
      });
      const sol=solveLinear(A,z);
      if(sol){voltages=sol.slice(0,n);batteryCurrents=sol.slice(n);}
      else state.warning='Bağlantıları veya pil yönlerini kontrol edin.';
    }
    state.amps=0;state.volt=0;
    edges.forEach(e=>{
      const p=e.p;
      if(state.warning){p.current=0;p.power=0;if(p.kind==='bulb')p.target=125;return;}
      if(p.kind==='battery'){
        p.current=-(batteryCurrents[batteries.indexOf(e)]||0);
        state.volt=Math.max(state.volt,p.voltage);
      } else if(e.a===e.b||p.kind==='switch'&&!p.closed)p.current=0;
      else {
        const r=p.kind==='wire'?0.0001:p.kind==='mini'?0.0001:p.kind==='switch'?0.0001:p.resistance;
        p.current=(voltages[e.a]-voltages[e.b])/r;
      }
      p.power=p.current*p.current*(p.resistance||0);
      // The supplied 126 frames run bright -> dark. Match the Lab bulb's
      // measured low-voltage progression: 3/6/9 V at 10 Ω -> 4/12/21%.
      if(p.kind==='bulb')p.target=clamp(Math.round(125-7.3*Math.pow(p.power,.75)),0,125);
      if(p.kind==='mini'&&p.reading)setText(p.reading,digits(p.current));
    });
    state.amps=Math.max(0,...edges.map(e=>Math.abs(e.p.current)));
    if(state.amps>20){
      state.warning='Kısa devre / ölçüm aralığı aşıldı.';
      state.amps=0;
      for(const e of edges){e.p.current=0;e.p.power=0;
        if(e.p.kind==='bulb')e.p.target=125;
        if(e.p.kind==='mini')setText(e.p.reading,'—');
      }
    }
    function probeNode(point){
      if(!point)return null;
      const t=ts.reduce((best,c,k)=>{
        // The source probe has its metal contact above its sprite origin.
        const d=Math.hypot(c.x-point.x,c.y-point.y);
        return d<best.d?{k,d}:best;
      },{k:-1,d:52*state.scale});
      return t.k<0?null:nodes.get(find(t.k));
    }
    for(const p of state.parts){
      if(p.kind==='voltmeter'){
        const a=probeNode(p.probeRed);
        const b=probeNode(p.probeBlack);
        setText(p.reading,a===null||b===null?'0.00':digits(voltages[a]-voltages[b]));
      }
      if(p.kind==='ammeter'){
        let best=null,d=85*state.scale;
        for(const e of edges){const q=e.p;
          let dd;
          if(q.kind==='wire'){
            const dx=q.p1.x-q.p0.x,dy=q.p1.y-q.p0.y;
            const t=clamp(((p.sensorPoint.x-q.p0.x)*dx+(p.sensorPoint.y-q.p0.y)*dy)/(dx*dx+dy*dy||1),0,1);
            dd=Math.hypot(p.sensorPoint.x-(q.p0.x+t*dx),p.sensorPoint.y-(q.p0.y+t*dy));
          }else dd=Math.hypot(q.x-p.sensorPoint.x,q.y-p.sensorPoint.y);
          if(dd<d){best=q;d=dd;}}
        setText(p.reading,best?digits(best.current):'0.00');
      }
    }
    const sourceLine=batteries.length===1?`Pil: ${fmt(batteries[0].p.voltage,'V')}`:
      batteries.length>1?`Kaynak: ${batteries.length} pil`:'Gerilim: —';
    setText(readout,`${state.warning||sourceLine}\nMaks. akım: ${fmt(state.amps,'A')}`);
    if(state.showValues){
      for(const p of parts){
        if(!p.valueLabel)p.valueLabel=text('','meters',p.x-60,p.y+95,160,35,20,[.1,.18,.25],'center',true);
        const value=p.kind==='battery'?`${p.voltage} V`:p.kind==='resistor'||p.kind==='bulb'?`${p.resistance} Ω`:fmt(p.current,'A');
        p.valueLabel.setPosition(p.x-80,p.y+(p.kind==='bulb'?125:90)*state.scale);
        p.valueLabel.isVisible=true;setText(p.valueLabel,value);
      }
    } else for(const p of parts)if(p.valueLabel)p.valueLabel.isVisible=false;
    for(const p of state.parts){if(p.nameLabel)p.nameLabel.isVisible=state.showLabels;if(p.kind==='bulb')renderPart(p);if(p.kind==='voltmeter')updateInstruments(p);}
  }

  function findPart(x,y) {
    for(let i=state.parts.length-1;i>=0;i--){const p=state.parts[i];
      if(p.kind==='wire'){
        const dx=p.p1.x-p.p0.x,dy=p.p1.y-p.p0.y,t=clamp(((x-p.p0.x)*dx+(y-p.p0.y)*dy)/(dx*dx+dy*dy||1),0,1);
        if(Math.hypot(x-(p.p0.x+t*dx),y-(p.p0.y+t*dy))<23)return p;
      }else{
        const [w,h]=DIM[p.kind],dx=(x-p.x)*Math.cos(p.angle)+(y-p.y)*Math.sin(p.angle),dy=-(x-p.x)*Math.sin(p.angle)+(y-p.y)*Math.cos(p.angle);
        if(Math.abs(dx)<w*state.scale*.55&&Math.abs(dy)<h*state.scale*.55)return p;
      }
    }
    return null;
  }
  function toggleSwitch(p){p.closed=!p.closed;renderPart(p);select(p,false);recompute();beep();}
  function paintWire(p,color){
    p.color=color;
    p.main.animationFrame=ART[color==='black'?'wireBlack':'wireRed'];
    p.tip0.animationFrame=ART[color==='black'?'leftCableBlack':'leftCableRed'];
    p.tip1.animationFrame=ART[color==='black'?'rightCableBlack':'rightCableRed'];
    p.bridge0.animationFrame=p.bridge1.animationFrame=ART[color==='black'?'tipBlack':'tipRed'];
  }
  function disconnectPart(p){
    if(!hasConnections(p))return;
    state.links=state.links.filter(l=>l.a.p!==p&&l.b.p!==p);
    const a=p.kind==='wire'?p.main.angle:p.angle;
    rawTranslate(p,-Math.sin(a)*65*state.scale,Math.cos(a)*65*state.scale);
    fitNewPart(p);
    renderPart(p);recompute();select(p);beep();
  }
  function flipSelected(){
    const p=state.selected;if(!p)return;
    if(p.kind==='wire')paintWire(p,p.color==='black'?'red':'black');
    else if(p.kind==='battery'){
      // Reverse the source polarity without exchanging the attached nodes.
      p.reversed=!p.reversed;
    }
    renderPart(p);select(p);recompute();beep();
  }
  function doZoom(f){
    const old=state.scale,target=clamp(old*f,.72,1.3),snapshot=geometrySnapshot();
    const place=t=>{
      restoreGeometry(snapshot);state.scale=old+(target-old)*t;
      const ratio=state.scale/old;
      for(const p of state.parts){
        if(p.kind==='wire')for(const e of [p.p0,p.p1]){e.x=920+(e.x-920)*ratio;e.y=570+(e.y-570)*ratio;}
        else {
          p.x=920+(p.x-920)*ratio;p.y=570+(p.y-570)*ratio;
          if(p.kind==='voltmeter')for(const point of [p.probeRed,p.probeBlack]){
            point.x=920+(point.x-920)*ratio;point.y=570+(point.y-570)*ratio;
          }
          if(p.sensorPoint){p.sensorPoint.x=920+(p.sensorPoint.x-920)*ratio;p.sensorPoint.y=570+(p.sensorPoint.y-570)*ratio;}
          if(p.kind==='mini')for(const point of [p.p0,p.p1]){point.x=920+(point.x-920)*ratio;point.y=570+(point.y-570)*ratio;}
        }
      }
      return state.parts.every(fitsStage);
    };
    if(!place(1)){
      let lo=0,hi=1;
      for(let n=0;n<16;n++){const mid=(lo+hi)/2;if(place(mid))lo=mid;else hi=mid;}
      place(lo);
    }
    for(const p of state.parts)renderPart(p);
    recompute();
    zoomOut.opacity=state.scale<=.721?.4:1;zoomIn.opacity=state.scale>=1.299?.4:1;
  }
  function setView(view){
    state.view=view;select(null);
    realView.opacity=view==='real'?1:.5;schematicView.opacity=view==='schematic'?1:.5;
    const meta={wire:['schematicWire',200,26,0],battery:['schematicBattery',200,68,0],
      resistor:['schematicResistor',206,118,29],bulb:['schematicBulb',208,237,6.5],switch:['schematicSwitchOpen',217,162,16]};
    tools.forEach(([kind,key,y],i)=>{
      const s=paletteSprites[i];
      if(view==='real'){s.animationFrame=ART[key];s.setPosition(65,y-13);s.setSize(104,104);}
      else {const [frame,w,h,offset]=meta[kind],f=96/w;s.animationFrame=ART[frame];s.setSize(w*f,h*f);s.setPosition(65,y-13-offset*f);}
    });
    recompute();
  }
  function reset(){for(const p of [...state.parts])removePart(p);state.parts=[];select(null);state.warning='';recompute();}

  function partInstances(p){
    return [p.main,p.outline,p.symbol,p.glass,p.tip0,p.tip1,p.bridge0,p.bridge1,p.cap0,p.cap1,p.reading,p.red,p.black,p.sensor,p.nameLabel,p.valueLabel,
      ...(p.capOutline||[]),
      ...(p.redLead||[]),...(p.blackLead||[]),...(p.sensorLead||[]),
      ...(p.term||[]),...(p.jointOuter||[]),...(p.jointInner||[]),...(p.nodes||[]).flatMap(n=>[n.disc,n.minus])].filter(Boolean);
  }
  function liftFromPalette(p){
    const top=runtime.layout.getLayer('buttons');
    p.savedLayers=partInstances(p).map(inst=>[inst,inst.layer]);
    for(const [inst] of p.savedLayers)inst.moveToLayer(top);
  }
  function restoreLayers(p){
    if(!p.savedLayers)return;
    for(const [inst,original] of p.savedLayers)if(inst&&original)inst.moveToLayer(original);
    p.savedLayers=null;
  }

  function onDown(e){
    const [x,y]=mouse(e);
    if(inside(x,y,38,898,64,54)){toggleCurrent();return;}
    if(inside(x,y,0,833,140,55)){setView(x<70?'real':'schematic');beep();return;}
    if(inside(x,y,0,970,140,58)){doZoom(x<70?.9:1.1);beep();return;}
    if(state.panelOpen&&panelBox&&inside(x,y,panelBox.left,panelBox.top,panelBox.right-panelBox.left,panelBox.bottom-panelBox.top)){
      const p=state.selected;
      const iconHit=41*PANEL_SCALE+3;
      if(Math.hypot(x-remove.x,y-remove.y)<iconHit){removePart(p);return;}
      if(cut.isVisible&&Math.hypot(x-cut.x,y-cut.y)<iconHit){disconnectPart(p);return;}
      if(flip.isVisible&&Math.hypot(x-flip.x,y-flip.y)<iconHit){
        if(p.kind==='switch'){toggleSwitch(p);select(p);}else flipSelected();return;
      }
      if(sliderBounds){
        if(x>=sliderBounds.hitLeft&&x<=sliderBounds.hitRight&&
          Math.abs(y-sliderBounds.y)<sliderBounds.hitHalfHeight){
          sliderAt(x);state.drag={mode:'slider'};return;
        }
      }
      return;
    }
    if(inside(x,y,1370,20,550,100)){
      if(x<1476){reset();return;}
      if(x<1584){state.sound=!state.sound;obj('audioBtn').getFirstInstance().animationFrame=state.sound?1:0;beep();return;}
      if(x<1692){state.settingsOpen=!state.settingsOpen;helpPanel.isVisible=state.settingsOpen;
        settingsItems.forEach(item=>item.isVisible=state.settingsOpen);select(null);return;}
      if(x<1800){
        if(navigator.share)void navigator.share({title:'Devre Laboratuvarı',url:location.href}).catch(()=>{});
        else if(navigator.clipboard?.writeText)void navigator.clipboard.writeText(location.href)
          .then(()=>setText(info,'Uygulama bağlantısı kopyalandı.'))
          .catch(()=>setText(info,'Bağlantı bu tarayıcıda kopyalanamadı.'));
        else setText(info,'Paylaşım bu tarayıcıda kullanılamıyor.');
        return;
      }
      if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>{});
      return;
    }
    if(state.settingsOpen){
      if(inside(x,y,1330,310,280,230)){
        if(y<370){toggleCurrent();}
        else if(y<423){state.currentType=state.currentType==='electrons'?'conventional':'electrons';setText(optType,state.currentType==='electrons'?'Elektronlar  ⇄':'Geleneksel  ⇄');}
        else if(y<477){state.showLabels=!state.showLabels;setText(optLabels,(state.showLabels?'☑':'☐')+' Etiketler');recompute();}
        else{state.showValues=!state.showValues;setText(optValues,(state.showValues?'☑':'☐')+' Değerler');recompute();}
        return;
      }
      state.settingsOpen=false;helpPanel.isVisible=false;
      settingsItems.forEach(item=>item.isVisible=false);
      return;
    }
    if(x<140&&y>120&&y<805){
      const item=tools.find(([, ,cy])=>Math.abs(cy-y)<64);
      if(item){const p=createPart(item[0],x,y);liftFromPalette(p);state.drag={p,mode:'part',x,y,rawX:p.x,rawY:p.y,fromPalette:true};beep();return;}
    }
    for(const [kind,box] of [
      ['voltmeter',[1681,220,220,185]],['ammeter',[1681,425,220,200]],
      ['mini',[1681,650,220,170]]
    ])if(inside(x,y,...box)){
      const p=createPart(kind,x,y);if(!p)return;liftFromPalette(p);state.drag={p,mode:'part',x,y,rawX:p.x,rawY:p.y,fromPalette:true};beep();return;
    }
    for(const p of state.parts)if(p.kind==='ammeter'&&
      Math.abs(p.sensorPoint.x-x)<54*state.scale&&Math.abs(p.sensorPoint.y-y)<72*state.scale){
      select(p,false);state.drag={p,mode:'sensor',x,y};return;
    }
    for(const point of state.probes){
      const probe=point.side<0?point.p.red:point.p.black;
      if(Math.abs(probe.x-x)<32*state.scale&&Math.abs(probe.y-y)<115*state.scale){
        select(point.p,false);point.anchor=null;state.drag={p:point.p,mode:'probe',point,x,y};return;
      }
    }
    // Free rigid terminals rotate around the opposite terminal. Connected
    // terminals move their entire joint; dragging never deletes a connection.
    const candidates=allTerminals().map(t=>({...t,d:Math.hypot(t.x-x,t.y-y)})).filter(t=>t.d<30*state.scale);
    candidates.sort((a,b)=>a.d-b.d||Number(flexible(b.p))-Number(flexible(a.p)));
    const terminal=candidates[0];
    if(terminal){
      const p=terminal.p,index=terminal.index,rotation=!flexible(p)&&p.kind!=='mini'&&!isConnected(p,index);
      select(p,false);state.drag={p,mode:rotation?'rotate':flexible(p)?'endpoint':'part',index,x,y,rawX:rotation||flexible(p)?terminal.x:p.x,rawY:rotation||flexible(p)?terminal.y:p.y,moved:false};return;
    }
    const p=findPart(x,y);
    if(p){select(p,false);state.drag={p,mode:'part',x,y,rawX:p.x,rawY:p.y,moved:false};return;}
    if(inStage(x,y)||state.panelOpen)select(null);
  }
  function onMove(e){
    const d=state.drag;if(!d)return;
    if(d.mode==='slider'){sliderAt(mouse(e)[0]);return;}
    const [x,y]=mouse(e),dx=x-d.x,dy=y-d.y;
    if(Math.hypot(dx,dy)<.01)return;
    if(d.mode==='endpoint'){
      const end=ends(d.p)[d.index],old={...end};
      const inset=TERMINAL_RING_SIZE*state.scale/2;
      d.rawX=clamp(d.rawX+dx,STAGE.left+inset,STAGE.right-inset);
      d.rawY=clamp(d.rawY+dy,STAGE.top+inset,STAGE.bottom-inset);
      let tx=d.rawX,ty=d.rawY;
      if(d.p.kind==='wire'){
        const other=ends(d.p)[1-d.index],len=Math.hypot(tx-other.x,ty-other.y),min=WIRE_MIN_LENGTH*state.scale;
        if(len<min){const a=len>1?Math.atan2(ty-other.y,tx-other.x):Math.atan2(old.y-other.y,old.x-other.x);tx=other.x+Math.cos(a)*min;ty=other.y+Math.sin(a)*min;}
      }
      const full=geometryEdit(d.p,f=>Object.assign(d.index?d.p.p1:d.p.p0,{x:old.x+(tx-old.x)*f,y:old.y+(ty-old.y)*f}));
      magnetize(d.p,d.index);
      if(!full){const actual=ends(d.p)[d.index];d.rawX=actual.x;d.rawY=actual.y;}
    }else if(d.mode==='rotate'){
      rotateFromEnd(d.p,d.index,x,y);magnetize(d.p,d.index,true);
    }else if(d.mode==='sensor'){
      const old={...d.p.sensorPoint};
      geometryEdit(d.p,f=>{d.p.sensorPoint.x=old.x+dx*f;d.p.sensorPoint.y=old.y+dy*f;});
    }else if(d.mode==='probe'){
      const old={x:d.point.x,y:d.point.y};
      geometryEdit(d.p,f=>{d.point.x=old.x+dx*f;d.point.y=old.y+dy*f;});
    }else{
      d.rawX+=dx;d.rawY+=dy;
      const full=movePart(d.p,d.rawX-d.p.x,d.rawY-d.p.y);
      if(!full){d.rawX=d.p.x;d.rawY=d.p.y;}
      // Keep a new part under the pointer while crossing a panel edge. Its
      // silhouette is fitted once on release; repeated fitting causes drift.
      if(!d.fromPalette)magnetize(d.p);
    }
    d.moved=true;d.x=x;d.y=y;recompute();
  }
  function onUp(){
    const d=state.drag;if(!d)return;state.drag=null;
    if(d.mode==='slider'){beep();return;}
    if(d.mode==='probe'){
      const t=nearestTerminal(d.point.x,d.point.y,d.p,35);
      if(t){d.point.anchor={p:t.p,index:t.index};d.point.x=t.x;d.point.y=t.y;}
      renderPart(d.p);recompute();return;
    }
    if(d.mode==='sensor'){recompute();return;}
    if(d.fromPalette&&!inStage(d.x,d.y)){removePart(d.p);return;}
    if(d.fromPalette){if(!fitNewPart(d.p)){removePart(d.p);return;}restoreLayers(d.p);}
    if(d.p.kind==='switch'&&!d.fromPalette&&!d.moved&&d.mode==='part')toggleSwitch(d.p);
    snap(d.p,d.mode==='endpoint'||d.mode==='rotate'?d.index:null,d.mode==='rotate');
    select(d.p,!d.moved&&!d.fromPalette);
  }
  runtime.addEventListener('pointerdown',onDown);
  runtime.addEventListener('pointermove',onMove);
  runtime.addEventListener('pointerup',onUp);
  runtime.addEventListener('pointercancel',onUp);
  runtime.addEventListener('keydown',e=>{
    if((e.code==='Delete'||e.code==='Backspace')&&state.selected)removePart(state.selected);
    if(e.code==='KeyR'&&state.selected)flipSelected();
    if(e.code==='Space'&&state.selected?.kind==='switch')toggleSwitch(state.selected);
    if(e.code==='Escape')select(null);
  });
  runtime.addEventListener('tick',()=>{
    const dt=Math.min(runtime.dt,.1);
    for(const p of state.parts){
      if(p.kind==='wire'&&p.nodes){
        const electrons=state.currentType==='electrons',flowing=Math.abs(p.current)>.002;
        const visible=state.showCurrent&&(electrons||flowing);
        for(const node of p.nodes){
          node.disc.isVisible=visible&&electrons;node.minus.isVisible=visible;
          setText(node.minus,electrons?'−':'➜');node.minus.fontColor=electrons?[1,1,1]:[.9,.06,.05];
        }
        if(visible){
          const len=Math.hypot(p.p1.x-p.p0.x,p.p1.y-p.p0.y);
          const speed=Math.min(180,30+Math.abs(p.current)*65)*state.scale;
          const direction=(p.current<0?-1:1)*(electrons?-1:1);
          if(flowing)p.phase=((p.phase+dt*speed*direction)%len+len)%len;
          const count=p.nodes.length;
          p.nodes.forEach((node,i)=>{
            let t=((p.phase/Math.max(1,len))+i/count)%1;
            const box=40*state.scale;
            const x=p.p0.x+(p.p1.x-p.p0.x)*t-box/2,y=p.p0.y+(p.p1.y-p.p0.y)*t-box/2;
            node.disc.setSize(box,box);node.minus.setSize(box,box);node.disc.sizePt=32*state.scale;node.minus.sizePt=23*state.scale;
            node.disc.setPosition(x,y);node.minus.setPosition(x,y);
            node.minus.angle=electrons?0:p.main.angle+(p.current<0?Math.PI:0);
          });
        }
      }
    }
  });
  recompute();
}
