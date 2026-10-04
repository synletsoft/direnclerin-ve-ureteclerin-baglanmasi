import { ART } from './art-map.js';

// Components and UI are Construct Sprite/Text instances. The script only handles
// topology, the DC nodal solver, and linked drag/measurement state.
const STAGE = { left: 198, right: 1632, top: 130, bottom: 1028 };
const SNAP = 48;
const TERMINAL_RING_SIZE = 58;
const WIRE_DEFAULT_LENGTH = 190;
const WIRE_THICKNESS = 26;
const TYPES = ['wire', 'battery', 'bulb', 'resistor', 'switch'];
const TR_NAMES = {wire:'Kablo',battery:'Pil',bulb:'Ampul',resistor:'Direnç',switch:'Anahtar',
  voltmeter:'Voltmetre',ammeter:'Ampermetre',mini:'Temassız ampermetre'};
const DIM = {battery:[200,68],resistor:[206,118],switch:[217,162],bulb:[208,237],
  ammeter:[170,170],voltmeter:[261,213],mini:[208,131]};

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
  const state={parts:[],selected:null,drag:null,nextId:1,scale:1,
    showCurrent:true,showValues:false,showLabels:false,currentType:'electrons',
    sound:false,warning:'',volt:0,amps:0,probes:[],settingsOpen:false,panelOpen:false,view:'real'};
  const labels=[];
  const obj=key=>runtime.objects[key];
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const fmt=(v,unit)=>Number.isFinite(v)?`${Math.abs(v)<.005?'0.00':v.toFixed(2)} ${unit}`:'—';
  const inside=(x,y,x0,y0,w,h)=>x>=x0&&x<=x0+w&&y>=y0&&y<=y0+h;
  const inStage=(x,y)=>inside(x,y,STAGE.left,STAGE.top,STAGE.right-STAGE.left,STAGE.bottom-STAGE.top);
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
    labels.push(t);return t;
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
  const zoomOut=art('zoomOut','hud',34,996,58,52);
  const zoomIn=art('zoomIn','hud',106,996,58,52);
  art('menuIcon','hud',1638,69,99,100);
  const helpPanel=art('rightPanel','hud',1471,539,278,678);helpPanel.isVisible=false;
  const settingsTitle=text('GÖRÜNÜM','hud',1350,254,240,36,22,[.15,.19,.24],'center',true);
  art('rightPanel','hud',1781,525,278,640);
  // The source panel has a left shadow/border; its visible white interior is
  // centred 10 px to the right of the sprite origin.
  // Three instruments share equal centre spacing and are vertically centred
  // as one group inside the panel.
  art('paletteVoltmeter','hud',1791,315,190,166);
  art('paletteAmmeter','hud',1791,525,190,184);
  art('paletteMiniAmmeter','hud',1791,735,190,144);
  const optCurrent=text('☑ Akımı göster','hud',1350,324,235,42,21);
  const optType=text('Elektronlar  ⇄','hud',1350,378,235,42,21);
  const optLabels=text('☐ Etiketler','hud',1350,432,235,42,21);
  const optValues=text('☐ Değerler','hud',1350,486,235,42,21);
  const readout=text('','hud',1350,568,235,75,20,[.11,.2,.3]);readout.isVisible=false;
  const settingsItems=[settingsTitle,optCurrent,optType,optLabels,optValues];
  settingsItems.forEach(item=>item.isVisible=false);
  const formula=text('V = I·R     |     Seri: Rₑ = ΣR     |     Paralel: 1/Rₑ = Σ(1/R)','hud',288,1022,1325,45,22,[.18,.22,.3],'center');
  formula.isVisible=false;
  const parameter=art('parameterSurface','hud',930,971,640,130);
  const paramField=art('parameterField','hud',910,944,150,42);
  const paramLabel=text('','hud',680,925,135,42,22,[.08,.1,.13]);
  const paramValue=text('','hud',835,924,150,42,22,[.08,.1,.13],'center');
  const paramMinus=art('stepLeft','hud',700,988,32,30);
  const paramPlus=art('stepRight','hud',1000,988,32,30);
  const sliderTrack=art('sliderTrack','hud',850,988,246,18);
  const sliderThumb=art('sliderThumb','hud',760,988,32,32);
  const cut=art('cutIcon','hud',1100,969,72,72);
  const remove=art('deleteIcon','hud',1190,969,72,72);
  const flip=art('flipIcon','hud',630,969,72,72);
  const panelItems=[parameter,paramField,paramLabel,paramValue,paramMinus,paramPlus,sliderTrack,sliderThumb,cut,remove,flip];
  panelItems.forEach(i=>i.isVisible=false);
  let panelBox=null,sliderBounds=null;
  const smallTip=text('Devre kurmak için soldan bir parça sürükleyin.','hud',380,875,1120,100,28,[.18,.23,.29],'center');
  smallTip.isVisible=false;

  const moved=(p)=>{
    if(p.kind==='wire')return;
    const endpoints=ends(p);
    updateJoints(p,endpoints);
    p.main.setPosition(p.x,p.y);
    if(p.kind==='bulb')p.main.setPosition(p.x,p.y-65*state.scale);
    p.main.angle=p.angle;
    if(p.kind==='voltmeter'){
      for(const [point,probe,lead,side] of [
        [p.probeRed,p.red,p.redLead,-1],[p.probeBlack,p.black,p.blackLead,1]]){
        probe.setPosition(point.x,point.y);
        probe.setSize(35*state.scale,154*state.scale);
        const start={x:p.x+side*55*state.scale,y:p.y+86*state.scale};
        const dx=point.x-start.x,dy=point.y-start.y;
        lead.setPosition((start.x+point.x)/2,(start.y+point.y)/2);
        lead.setSize(Math.max(2,Math.hypot(dx,dy)),5*state.scale);
        lead.angle=Math.atan2(dy,dx);
      }
    }
    if(p.kind==='mini'&&p.sensor){
      p.sensor.setPosition(p.sensorPoint.x,p.sensorPoint.y);
      p.sensor.setSize(90*state.scale,120*state.scale);
    }
    if(p.reading){
      const [w,h,font,top]=p.kind==='voltmeter'?[138,48,29,-76]:p.kind==='ammeter'?[130,39,22,-69]:[130,39,21,-46];
      p.reading.setSize(w*state.scale,h*state.scale);p.reading.sizePt=font*state.scale;
      p.reading.setPosition(p.x-w*state.scale/2,p.y+(p.kind==='ammeter'&&state.view==='schematic'?80:top)*state.scale);
      if(p.glass){
        const g=p.kind==='voltmeter'?[156,68,-52]:p.kind==='ammeter'?[130,57,-46]:[145,58,-26];
        p.glass.setPosition(p.x,p.y+g[2]*state.scale);p.glass.setSize(g[0]*state.scale,g[1]*state.scale);
        p.glass.isVisible=p.kind!=='ammeter'||state.view==='real';
      }
    }
    if(p.nameLabel)p.nameLabel.setPosition(p.x-120*state.scale,p.y+(p.kind==='bulb'?137:104)*state.scale);
  };
  function ends(p) {
    if(p.kind==='wire')return [p.p0,p.p1];
    const offsets={battery:100,resistor:103,switch:105,bulb:104,ammeter:85}[p.kind]||0;
    const yy={battery:0,resistor:29,switch:48,bulb:86,ammeter:50}[p.kind]||0;
    const a=p.angle,c=Math.cos(a),s=Math.sin(a),f=state.scale;
    return [-1,1].map(dir=>({x:p.x+(dir*offsets*c-yy*s)*f,
                                   y:p.y+(dir*offsets*s+yy*c)*f}));
  }
  function makeCurrentNode(){
    const disc=text('●','meters',0,0,32,32,24,[.02,.56,.82],'center',true);
    const minus=text('−','meters',0,0,32,32,17,[1,1,1],'center',true);
    disc.isVisible=minus.isVisible=false;
    return {disc,minus};
  }
  function ensureWireNodes(p,len){
    const wanted=clamp(Math.floor(len/(55*state.scale)),1,40);
    p.nodes=p.nodes||[];
    while(p.nodes.length<wanted)p.nodes.push(makeCurrentNode());
    while(p.nodes.length>wanted){
      const node=p.nodes.pop();destroy(node.disc);destroy(node.minus);
    }
  }
  function createJointPair(){
    return {
      outer:art('jointOuter','meters',0,0,28,28),
      inner:art('jointCopper','meters',0,0,16,16)
    };
  }
  function updateJoints(p,endpoints=ends(p)){
    if(!p.term?.length)return;
    const others=allTerminals(p);
    for(let i=0;i<endpoints.length;i++){
      const e=endpoints[i];
      const connected=others.some(t=>Math.hypot(t.x-e.x,t.y-e.y)<15);
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
        const others=allTerminals(p);
        p.tip0.isVisible=state.view==='real'&&!others.some(t=>Math.hypot(t.x-p.p0.x,t.y-p.p0.y)<15);
        p.tip1.isVisible=state.view==='real'&&!others.some(t=>Math.hypot(t.x-p.p1.x,t.y-p.p1.y)<15);
      }
    }
  }
  function createPart(kind,x,y) {
    const id=state.nextId++;
    const wireHalf=kind==='wire'?WIRE_DEFAULT_LENGTH*state.scale/2:90;
    const p={id,kind,x,y,angle:0,resistance:kind==='resistor'?10:kind==='bulb'?10:0,
      voltage:kind==='battery'?9:0,closed:false,color:'black',current:0,power:0,
      p0:{x:x-wireHalf,y},p1:{x:x+wireHalf,y},phase:0,term:[]};
    let key={battery:'pieceBattery',resistor:'resistor10',switch:'pieceSwitchOpen',
      ammeter:'pieceAmmeter',voltmeter:'pieceVoltmeter',mini:'pieceMiniAmmeter'}[kind];
    if(kind==='bulb'){
      p.base=art('pieceBulbOff','parts',x,y,208,237);
      p.main=obj('bulbGlow').createInstance('parts',x,y-65);
      p.main.stopAnimation();p.main.animationFrame=125;p.main.setSize(448,370);
      p.main.isVisible=false;
      p.frame=125;p.target=125;
    } else if(kind==='wire') {
      p.main=art('wireBlack','wires',x,y,WIRE_DEFAULT_LENGTH,WIRE_THICKNESS);
      p.tip0=art('leftCableBlack','meters',x-wireHalf,y,65,WIRE_THICKNESS);
      p.tip1=art('rightCableBlack','meters',x+wireHalf,y,65,WIRE_THICKNESS);
      p.nodes=[];
    } else {
      const [w,h]=DIM[kind];
      p.main=art(key,'parts',x,y,w,h);
    }
    if(['battery','resistor','switch','bulb','ammeter','wire'].includes(kind)){
      p.term=[0,1].map(()=>art('terminalRing','meters',0,0,TERMINAL_RING_SIZE,TERMINAL_RING_SIZE));
      const joints=[createJointPair(),createJointPair()];
      p.jointOuter=joints.map(j=>j.outer);p.jointInner=joints.map(j=>j.inner);
      [...p.jointOuter,...p.jointInner].forEach(v=>v.isVisible=false);
      if(kind==='ammeter'){
        p.glass=art('meterGlass','meters',x,y-46,130,57);
        p.reading=text('0.00','meters',x-64,y-20,130,39,22,[0,0,0],'center',true);
      }
    }
    if(kind==='voltmeter'){
      p.glass=art('meterGlass','meters',x,y-52,156,68);
      p.reading=text('—','meters',x-69,y-44,138,48,29,[0,0,0],'center',true);
      p.redLead=art('wireRed','meters',x-80,y+95,60,5);
      p.blackLead=art('wireBlack','meters',x+80,y+95,60,5);
      p.red=art('probeRed','meters',x-112,y+110,35,154);
      p.black=art('probeBlack','meters',x+112,y+110,35,154);
      p.probeRed={p,x:x-112,y:y+110};p.probeBlack={p,x:x+112,y:y+110};
      state.probes.push(p.probeRed,p.probeBlack);
    }
    if(kind==='mini'){
      p.glass=art('miniMeterGlass','meters',x,y-26,145,58);
      p.reading=text('—','meters',x-67,y-16,130,39,21,[0,0,0],'center',true);
      p.sensorPoint={x:x-135,y:y-125};
      p.sensor=art('miniProbe','meters',p.sensorPoint.x,p.sensorPoint.y,90,120);
    }
    if(kind!=='wire')p.nameLabel=text(TR_NAMES[kind],'meters',x-100,y+100,200,33,18,[.17,.22,.27],'center');
    if(['battery','resistor','bulb','switch','ammeter'].includes(kind)){
      p.symbol=art('schematic'+({battery:'Battery',resistor:'Resistor',bulb:'Bulb',switch:'SwitchOpen',ammeter:'Ammeter'}[kind]),'parts',x,y,...DIM[kind]);
      p.symbol.isVisible=false;
    }
    state.parts.push(p);renderPart(p);select(null);recompute();return p;
  }
  function renderPart(p) {
    if(p.kind==='wire'){
      const dx=p.p1.x-p.p0.x,dy=p.p1.y-p.p0.y,len=Math.hypot(dx,dy);
      ensureWireNodes(p,len);
      p.x=(p.p0.x+p.p1.x)/2;p.y=(p.p0.y+p.p1.y)/2;
      p.main.setPosition((p.p0.x+p.p1.x)/2,(p.p0.y+p.p1.y)/2);
      p.main.animationFrame=ART[state.view==='schematic'?'schematicWire':p.color==='red'?'wireRed':'wireBlack'];
      p.main.setSize(Math.max(16,len),WIRE_THICKNESS*state.scale);p.main.angle=Math.atan2(dy,dx);
      const tip0Width=61/21*WIRE_THICKNESS*state.scale;
      const tip1Width=(p.color==='red'?77/26:61/22)*WIRE_THICKNESS*state.scale;
      const ux=dx/(len||1),uy=dy/(len||1);
      p.tip0.setPosition(p.p0.x+ux*tip0Width/2,p.p0.y+uy*tip0Width/2);
      p.tip1.setPosition(p.p1.x-ux*tip1Width/2,p.p1.y-uy*tip1Width/2);
      p.tip0.setSize(tip0Width,WIRE_THICKNESS*state.scale);
      p.tip1.setSize(tip1Width,WIRE_THICKNESS*state.scale);
      p.tip0.angle=p.tip1.angle=p.main.angle;
      const connected=[p.p0,p.p1].map(e=>allTerminals(p).some(t=>Math.hypot(t.x-e.x,t.y-e.y)<15));
      // Free ends keep their supplied copper tip. At a connection the joint
      // replaces it, preventing the old end art from protruding through the
      // component terminal as the cable rotates.
      p.tip0.isVisible=state.view==='real'&&!connected[0];p.tip1.isVisible=state.view==='real'&&!connected[1];
      updateJoints(p,[p.p0,p.p1]);
    } else {
      if(p.kind==='battery')p.main.animationFrame=ART.pieceBattery;
      if(p.kind==='resistor')p.main.animationFrame=ART['resistor'+p.resistance];
      if(p.kind==='switch')p.main.animationFrame=ART[
        p.closed?'pieceSwitchClosed':'pieceSwitchOpen'];
      const [w,h]=p.kind==='switch'?[p.closed?221:217,p.closed?113:162]:DIM[p.kind]||[0,0];
      if(w)p.main.setSize(w*state.scale,h*state.scale);
      if(p.kind==='bulb')p.main.setSize(448*state.scale,370*state.scale);
      if(p.kind==='bulb'){
        p.base.setPosition(p.x,p.y);
        p.base.setSize(208*state.scale,237*state.scale);
        p.base.angle=p.angle;
      }
      moved(p);
      if(p.symbol){
        p.symbol.animationFrame=ART['schematic'+({battery:'Battery',resistor:'Resistor',bulb:'Bulb',switch:p.closed?'SwitchClosed':'SwitchOpen',ammeter:'Ammeter'}[p.kind])];
        p.symbol.setPosition(p.x,p.y);p.symbol.setSize(...DIM[p.kind].map(v=>v*state.scale));p.symbol.angle=p.angle;
        p.symbol.isVisible=state.view==='schematic';
        p.main.isVisible=state.view==='real'&&(p.kind!=='bulb'||p.frame<125);
        if(p.base)p.base.isVisible=state.view==='real';
      }
    }
  }
  function select(p,openPanel=true) {
    state.selected=p;
    setText(info,p?.kind==='voltmeter'
      ?'Kırmızı ve siyah probun metal uçlarını iki bağlantı noktasına taşıyın.'
      :p?.kind==='mini'
      ?'Temassız ampermetreyi akımını ölçeceğiniz kablonun üstüne taşıyın.'
      :p?.kind==='ammeter'
      ?'Ampermetreyi devreye seri bağlayın; iki ucunu kablolara yaklaştırın.'
      :'Parçayı sürükleyin; uçları birbirine yaklaştırınca bağlantı oluşur.');
    state.parts.forEach(q=>renderPart(q));
    const supported=p&&TR_NAMES[p.kind];
    state.panelOpen=!!supported&&openPanel;
    panelItems.forEach(i=>i.isVisible=false);panelBox=null;sliderBounds=null;
    smallTip.isVisible=false;
    if(state.panelOpen){
      const numeric=['battery','resistor','bulb'].includes(p.kind);
      const width=numeric?(p.kind==='battery'?650:550):['wire','switch'].includes(p.kind)?380:p.term?.length?200:118;
      const left=930-width/2,right=930+width/2;
      panelBox={left,right,top:906,bottom:1036};
      parameter.setPosition(930,971);parameter.setSize(width,130);parameter.isVisible=true;
      cut.setPosition(right-126,971);remove.setPosition(right-43,971);
      cut.isVisible=!!p.term?.length;remove.isVisible=true;
      cut.animationFrame=ART[hasConnections(p)?'cutIcon':'cutDisabled'];
      if(numeric){
        const start=left+(p.kind==='battery'?108:18);
        paramLabel.setPosition(start+6,921);paramLabel.setSize(112,42);
        setText(paramLabel,p.kind==='battery'?'Gerilim':'Direnç');
        paramField.setPosition(start+220,942);paramValue.setPosition(start+145,921);
        paramMinus.setPosition(start+20,991);paramPlus.setPosition(start+323,991);
        sliderBounds={left:start+57,right:start+286,y:991};
        sliderTrack.setPosition((sliderBounds.left+sliderBounds.right)/2,991);
        sliderTrack.setSize(sliderBounds.right-sliderBounds.left,18);
        [paramLabel,paramField,paramValue,paramMinus,paramPlus,sliderTrack,sliderThumb].forEach(i=>i.isVisible=true);
        updateParameterValue();
      } else if(['wire','switch'].includes(p.kind)) {
        paramValue.setPosition(left+92,930);paramValue.setSize(110,74);paramValue.isVisible=true;
        setText(paramValue,p.kind==='wire'?(p.color==='red'?'Kırmızı':'Siyah'):(p.closed?'Kapalı':'Açık'));
      }
      flip.isVisible=['battery','wire','switch'].includes(p.kind);
      flip.setPosition(left+47,971);
      flip.animationFrame=ART[p.kind==='wire'?'colorIcon':p.kind==='switch'?(p.closed?'switchClosedButton':'switchOpenButton'):'flipIcon'];
    }
  }
  function parameterRange(p){return p.kind==='battery'?[1,20]:p.kind==='resistor'?[2,10]:[2,20];}
  function updateParameterValue(){
    const p=state.selected;if(!p||!sliderBounds)return;
    const [min,max]=parameterRange(p),value=p.kind==='battery'?p.voltage:p.resistance;
    paramValue.setSize(150,42);setText(paramValue,`${value.toFixed(1)} ${p.kind==='battery'?'V':'Ω'}`);
    sliderThumb.setPosition(sliderBounds.left+(value-min)/(max-min)*(sliderBounds.right-sliderBounds.left),sliderBounds.y);
    paramMinus.opacity=value<=min?.45:1;paramPlus.opacity=value>=max?.45:1;
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
  function hasConnections(p){return !!p.term?.length&&ends(p).some(e=>allTerminals(p).some(t=>Math.hypot(t.x-e.x,t.y-e.y)<15));}
  function removePart(p) {
    if(!p)return;
    for(const v of [p.main,p.base,p.symbol,p.glass,p.tip0,p.tip1,p.reading,p.red,p.black,p.redLead,p.blackLead,p.sensor,p.nameLabel,p.valueLabel,
      ...(p.term||[]),...(p.jointOuter||[]),...(p.jointInner||[]),...(p.nodes||[]).flatMap(n=>[n.disc,n.minus])])destroy(v);
    state.parts=state.parts.filter(q=>q!==p);
    state.probes=state.probes.filter(point=>point.p!==p);
    select(null);recompute();
  }
  function allTerminals(except=null) {
    return state.parts.filter(p=>p!==except&&p.term?.length).flatMap(p=>ends(p).map((v,index)=>({p,index,...v})));
  }
  function nearestTerminal(x,y,except=null,max=SNAP) {
    let best=null,dist=max;
    for(const t of allTerminals(except)){
      const d=Math.hypot(t.x-x,t.y-y);if(d<dist){best=t;dist=d;}
    }
    return best;
  }
  function snap(p,index=null,followAttachments=true) {
    magnetize(p,index,followAttachments);
    renderPart(p);recompute();beep();
  }
  function magnetize(p,index=null,followAttachments=true) {
    let connected=false;
    if(p.kind==='wire'){
      const ids=index===null?[0,1]:[index];
      for(const i of ids){const e=i?p.p1:p.p0,t=nearestTerminal(e.x,e.y,p);
        if(t){e.x=t.x;e.y=t.y;connected=true;}}
    } else if(p.term?.length) {
      let winner=null,dist=SNAP;
      for(const e of ends(p))for(const t of allTerminals(p)){
        const d=Math.hypot(e.x-t.x,e.y-t.y);
        if(d<dist){dist=d;winner={e,t};}
      }
      if(winner){movePart(p,winner.t.x-winner.e.x,winner.t.y-winner.e.y,followAttachments);connected=true;}
    }
    if(connected)renderPart(p);
    return connected;
  }

  // Modified nodal analysis. Near-ideal branches retain a tiny conductance
  // limit so branch currents remain computable at PhET's default settings.
  function recompute() {
    refreshConnections();
    const parts=state.parts.filter(p=>p.term?.length);
    const ts=parts.flatMap(p=>ends(p).map((v,i)=>({p,i,...v})));
    const parent=ts.map((_,i)=>i);
    const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
    for(let i=0;i<ts.length;i++)for(let j=0;j<i;j++)
      if(Math.hypot(ts[i].x-ts[j].x,ts[i].y-ts[j].y)<15)join(i,j);
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
      const resist=e=>e.p.kind==='wire'?0.0001:e.p.kind==='ammeter'?0.0001:
        e.p.kind==='switch'?(e.p.closed?0.0001:Infinity):e.p.resistance;
      for(const e of edges){
        if(e.p.kind==='battery'||e.a===e.b)continue;
        const r=resist(e);if(!Number.isFinite(r)||r<=0)continue;
        const g=1/r;A[e.a][e.a]+=g;A[e.b][e.b]+=g;
        A[e.a][e.b]-=g;A[e.b][e.a]-=g;
      }
      batteries.forEach((e,i)=>{
        const j=n+i;A[e.a][j]++;A[e.b][j]--;
        A[j][e.a]++;A[j][e.b]--;A[j][j]-=.0001;z[j]=e.p.voltage;
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
        const r=p.kind==='wire'?0.0001:p.kind==='ammeter'?0.0001:p.kind==='switch'?0.0001:p.resistance;
        p.current=(voltages[e.a]-voltages[e.b])/r;
      }
      p.power=p.current*p.current*(p.resistance||0);
      // The supplied 126 frames run bright -> dark. Match the Lab bulb's
      // measured low-voltage progression: 3/6/9 V at 10 Ω -> 4/12/21%.
      if(p.kind==='bulb')p.target=clamp(Math.round(125-7.3*Math.pow(p.power,.75)),0,125);
      if(p.kind==='ammeter'&&p.reading)setText(p.reading,fmt(p.current,'A'));
    });
    state.amps=Math.max(0,...edges.map(e=>Math.abs(e.p.current)));
    if(state.amps>20){
      state.warning='Kısa devre / ölçüm aralığı aşıldı.';
      state.amps=0;
      for(const e of edges){e.p.current=0;e.p.power=0;
        if(e.p.kind==='bulb')e.p.target=125;
        if(e.p.kind==='ammeter')setText(e.p.reading,'—');
      }
    }
    function probeNode(point){
      if(!point)return null;
      const t=ts.reduce((best,c,k)=>{
        // The source probe has its metal contact above its sprite origin.
        const d=Math.hypot(c.x-point.x,c.y-(point.y-65*state.scale));
        return d<best.d?{k,d}:best;
      },{k:-1,d:52*state.scale});
      return t.k<0?null:nodes.get(find(t.k));
    }
    for(const p of state.parts){
      if(p.kind==='voltmeter'){
        const a=probeNode(p.probeRed);
        const b=probeNode(p.probeBlack);
        setText(p.reading,a===null||b===null?'—':fmt(voltages[a]-voltages[b],'V'));
      }
      if(p.kind==='mini'){
        let best=null,d=85*state.scale;
        for(const e of edges){const q=e.p;
          let dd;
          if(q.kind==='wire'){
            const dx=q.p1.x-q.p0.x,dy=q.p1.y-q.p0.y;
            const t=clamp(((p.sensorPoint.x-q.p0.x)*dx+(p.sensorPoint.y-q.p0.y)*dy)/(dx*dx+dy*dy||1),0,1);
            dd=Math.hypot(p.sensorPoint.x-(q.p0.x+t*dx),p.sensorPoint.y-(q.p0.y+t*dy));
          }else dd=Math.hypot(q.x-p.sensorPoint.x,q.y-p.sensorPoint.y);
          if(dd<d){best=q;d=dd;}}
        setText(p.reading,best?fmt(best.current,'A'):'—');
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
    for(const p of state.parts)if(p.nameLabel)p.nameLabel.isVisible=state.showLabels;
  }

  function findPart(x,y) {
    for(let i=state.parts.length-1;i>=0;i--){const p=state.parts[i];
      if(p.kind==='wire'){
        const dx=p.p1.x-p.p0.x,dy=p.p1.y-p.p0.y,t=clamp(((x-p.p0.x)*dx+(y-p.p0.y)*dy)/(dx*dx+dy*dy||1),0,1);
        if(Math.hypot(x-(p.p0.x+t*dx),y-(p.p0.y+t*dy))<23)return p;
      }else{
        const [w,h]=DIM[p.kind];
        if(Math.abs(x-p.x)<w*state.scale*.55&&Math.abs(y-p.y)<h*state.scale*.55)return p;
      }
    }
    return null;
  }
  function movePart(p,dx,dy,followAttachments=true){
    if(p.kind==='wire'){
      // Preserve every component connection when the cable body is dragged.
      // The attached components travel with it; their other cables stretch.
      const attached=[];
      for(const e of followAttachments?[p.p0,p.p1]:[])for(const q of state.parts){
        if(q===p||q.kind==='wire'||!q.term?.length)continue;
        if(ends(q).some(t=>Math.hypot(t.x-e.x,t.y-e.y)<15)&&!attached.includes(q))attached.push(q);
      }
      p.x+=dx;p.y+=dy;p.p0.x+=dx;p.p0.y+=dy;p.p1.x+=dx;p.p1.y+=dy;
      renderPart(p);
      for(const q of attached){
        const before=ends(q);
        q.x+=dx;q.y+=dy;
        if(q.kind==='voltmeter')for(const point of [q.probeRed,q.probeBlack]){point.x+=dx;point.y+=dy;}
        if(q.kind==='mini'){q.sensorPoint.x+=dx;q.sensorPoint.y+=dy;}
        followAttachedWires(q,before,p);renderPart(q);
      }
    } else {
      const before=ends(p);
      p.x+=dx;p.y+=dy;
      if(p.kind==='voltmeter'){
        for(const point of [p.probeRed,p.probeBlack]){point.x+=dx;point.y+=dy;}
      }
      if(p.kind==='mini'){p.sensorPoint.x+=dx;p.sensorPoint.y+=dy;}
      if(followAttachments)followAttachedWires(p,before);
    }
    if(p.kind!=='wire')renderPart(p);
  }
  // Keep an existing terminal connection while a component is dragged.
  // Every coincident wire endpoint follows that terminal, so junctions stretch
  // together as in the PhET workbench instead of silently opening the circuit.
  function followAttachedWires(p,before,exclude=null){
    const after=ends(p);
    for(const q of state.parts)if(q.kind==='wire'&&q!==exclude){
      let changed=false;
      for(const point of [q.p0,q.p1])for(let i=0;i<before.length;i++){
        if(Math.hypot(point.x-before[i].x,point.y-before[i].y)<15){
          point.x=after[i].x;point.y=after[i].y;changed=true;break;
        }
      }
      if(changed)renderPart(q);
    }
  }
  function adjust(delta){
    const p=state.selected;if(!p)return;
    setParameter((p.kind==='battery'?p.voltage:p.resistance)+delta);beep();
  }
  function toggleSwitch(p){p.closed=!p.closed;renderPart(p);select(p,false);recompute();beep();}
  function paintWire(p,color){
    p.color=color;
    p.main.animationFrame=ART[color==='black'?'wireBlack':'wireRed'];
    p.tip0.animationFrame=ART[color==='black'?'leftCableBlack':'leftCableRed'];
    p.tip1.animationFrame=ART[color==='black'?'rightCableBlack':'rightCableRed'];
  }
  function disconnectPart(p){
    if(!hasConnections(p))return;
    const detached=(from,other)=>{
      let dx=other.x-from.x,dy=other.y-from.y,len=Math.hypot(dx,dy);
      if(len<1){dx=1;dy=0;len=1;}
      const short=len<80*state.scale,amount=short?60*state.scale:Math.min(60*state.scale,len*.3);
      return {x:from.x+(short?-dy:dx)/len*amount,y:from.y+(short?dx:dy)/len*amount};
    };
    const before=ends(p),targets=allTerminals(p);
    if(p.kind==='wire'){
      const old=[{...p.p0},{...p.p1}];
      for(let i=0;i<2;i++)if(targets.some(t=>Math.hypot(t.x-old[i].x,t.y-old[i].y)<15)){
        Object.assign(i?p.p1:p.p0,detached(old[i],old[1-i]));
      }
    }else{
      for(const q of state.parts)if(q!==p&&q.kind==='wire'){
        const old=[{...q.p0},{...q.p1}];
        for(let i=0;i<2;i++)if(before.some(t=>Math.hypot(t.x-old[i].x,t.y-old[i].y)<15)){
          Object.assign(i?q.p1:q.p0,detached(old[i],old[1-i]));
        }
        renderPart(q);
      }
      if(targets.some(t=>t.p.kind!=='wire'&&before.some(e=>Math.hypot(t.x-e.x,t.y-e.y)<15)))p.y+=SNAP+18;
    }
    renderPart(p);recompute();select(p);beep();
  }
  function flipSelected(){
    const p=state.selected;if(!p)return;
    if(p.kind==='wire'){
      paintWire(p,p.color==='black'?'red':'black');
    }else{
      const before=ends(p);
      p.angle=(p.angle+(p.kind==='battery'?Math.PI:Math.PI/2))%(2*Math.PI);
      followAttachedWires(p,before);
    }
    renderPart(p);select(p);recompute();beep();
  }
  function doZoom(f){
    const old=state.scale;state.scale=clamp(state.scale*f,.72,1.3);
    const ratio=state.scale/old;
    for(const p of state.parts){
      if(p.kind==='wire')for(const e of [p.p0,p.p1]){e.x=920+(e.x-920)*ratio;e.y=570+(e.y-570)*ratio;}
      else {
        p.x=920+(p.x-920)*ratio;p.y=570+(p.y-570)*ratio;
        if(p.kind==='voltmeter')for(const point of [p.probeRed,p.probeBlack]){
          point.x=920+(point.x-920)*ratio;point.y=570+(point.y-570)*ratio;
        }
        if(p.kind==='mini'){
          p.sensorPoint.x=920+(p.sensorPoint.x-920)*ratio;
          p.sensorPoint.y=570+(p.sensorPoint.y-570)*ratio;
        }
      }
      renderPart(p);
    }
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
    return [p.main,p.base,p.symbol,p.glass,p.tip0,p.tip1,p.reading,p.red,p.black,p.redLead,p.blackLead,p.sensor,p.nameLabel,p.valueLabel,
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
    if(inside(x,y,0,833,140,55)){setView(x<70?'real':'schematic');beep();return;}
    if(inside(x,y,0,970,140,58)){doZoom(x<70?.9:1.1);beep();return;}
    if(state.panelOpen&&panelBox&&inside(x,y,panelBox.left,panelBox.top,panelBox.right-panelBox.left,panelBox.bottom-panelBox.top)){
      const p=state.selected;
      if(Math.hypot(x-remove.x,y-remove.y)<40){removePart(p);return;}
      if(cut.isVisible&&Math.hypot(x-cut.x,y-cut.y)<40){disconnectPart(p);return;}
      if(flip.isVisible&&Math.hypot(x-flip.x,y-flip.y)<40){
        if(p.kind==='switch'){toggleSwitch(p);select(p);}else flipSelected();return;
      }
      if(sliderBounds){
        if(Math.abs(x-paramMinus.x)<20&&Math.abs(y-paramMinus.y)<23){adjust(-1);return;}
        if(Math.abs(x-paramPlus.x)<20&&Math.abs(y-paramPlus.y)<23){adjust(1);return;}
        if(x>=sliderBounds.left-18&&x<=sliderBounds.right+18&&Math.abs(y-sliderBounds.y)<26){
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
        if(y<370){state.showCurrent=!state.showCurrent;setText(optCurrent,(state.showCurrent?'☑':'☐')+' Akımı göster');}
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
      const p=createPart(kind,x,y);liftFromPalette(p);state.drag={p,mode:'part',x,y,rawX:p.x,rawY:p.y,fromPalette:true};beep();return;
    }
    for(const p of state.parts)if(p.kind==='mini'&&
      Math.abs(p.sensorPoint.x-x)<46*state.scale&&
      Math.abs(p.sensorPoint.y-y)<62*state.scale){
      state.drag={p,mode:'miniProbe',x,y};return;
    }
    for(const point of state.probes)if(
      Math.abs(point.x-x)<30*state.scale&&Math.abs(point.y-y)<88*state.scale){
      state.drag={p:point.p,mode:'probe',point,x,y};return;
    }
    for(const p of [...state.parts].reverse())if(p.kind==='wire'){
      for(const [index,end] of [p.p0,p.p1].entries())if(Math.hypot(end.x-x,end.y-y)<29){
        select(p,false);state.drag={p,mode:'endpoint',index,x,y,rawX:end.x,rawY:end.y};return;
      }
    }
    const p=findPart(x,y);
    if(p){select(p,false);state.drag={p,mode:'part',x,y,rawX:p.x,rawY:p.y,moved:false};return;}
    if(inStage(x,y))select(null);
  }
  function onMove(e){
    const d=state.drag;if(!d)return;
    if(d.mode==='slider'){sliderAt(mouse(e)[0]);return;}
    const [x,y]=mouse(e),dx=x-d.x,dy=y-d.y;
    if(d.mode==='endpoint'){
      d.rawX=clamp(d.rawX+dx,STAGE.left+12,STAGE.right-12);
      d.rawY=clamp(d.rawY+dy,STAGE.top+12,STAGE.bottom-12);
      const end=d.index?d.p.p1:d.p.p0;end.x=d.rawX;end.y=d.rawY;
      magnetize(d.p,d.index);
      renderPart(d.p);
    }else if(d.mode==='miniProbe'){
      d.p.sensorPoint.x=clamp(d.p.sensorPoint.x+dx,STAGE.left,STAGE.right);
      d.p.sensorPoint.y=clamp(d.p.sensorPoint.y+dy,STAGE.top,STAGE.bottom);
      renderPart(d.p);
    }else if(d.mode==='probe'){
      d.point.x=clamp(d.point.x+dx,STAGE.left,STAGE.right);
      d.point.y=clamp(d.point.y+dy,STAGE.top,STAGE.bottom);
      renderPart(d.p);
    }else{
      d.rawX+=dx;d.rawY+=dy;
      if(d.fromPalette&&d.p.kind==='wire'){
        const half=WIRE_DEFAULT_LENGTH*state.scale/2;
        d.p.p0={x:d.rawX-half,y:d.rawY};d.p.p1={x:d.rawX+half,y:d.rawY};renderPart(d.p);
      }else movePart(d.p,d.rawX-d.p.x,d.rawY-d.p.y,!d.fromPalette);
      magnetize(d.p,null,!d.fromPalette);d.moved=true;
    }
    d.x=x;d.y=y;
    recompute();
  }
  function onUp(){
    const d=state.drag;if(!d)return;state.drag=null;
    if(d.mode==='slider'){beep();return;}
    if(d.mode==='endpoint'){snap(d.p,d.index);select(d.p,false);}
    else if(d.mode==='probe'||d.mode==='miniProbe')recompute();
    else{
      if(d.fromPalette&&!inStage(d.p.x,d.p.y)){
        // A palette click is only a drag candidate. Releasing before the
        // pointer reaches the work area cancels it instead of spawning a part
        // at an unrelated default position.
        removePart(d.p);return;
      }
      if(d.fromPalette)restoreLayers(d.p);
      if(d.p.kind==='switch'&&!d.fromPalette&&!d.moved)toggleSwitch(d.p);
      snap(d.p,null,!d.fromPalette);
      if(!d.fromPalette&&!d.moved)select(d.p);
      else select(null);
    }
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
      if(p.kind==='bulb'){
        const step=Math.max(1,Math.round(dt*100));
        p.frame+=Math.sign(p.target-p.frame)*Math.min(step,Math.abs(p.target-p.frame));
        if(p.main.animationFrame!==p.frame)p.main.animationFrame=p.frame;
        p.main.isVisible=state.view==='real'&&p.frame<125;
        p.main.opacity=clamp(.2+4.3*Math.pow(Math.max(0,p.power),.75)/35,.2,1);
        p.base.isVisible=state.view==='real';
        // The glow frame supplies the light while the base always keeps its
        // standard sprite and dimensions, including while selected.
        p.base.animationFrame=ART.pieceBulbOff;
      }
      if(p.kind==='wire'&&p.nodes){
        const electrons=state.currentType==='electrons',flowing=Math.abs(p.current)>.002;
        const visible=state.showCurrent&&(electrons||flowing);
        for(const node of p.nodes){
          node.disc.isVisible=visible&&electrons;node.minus.isVisible=visible;
          setText(node.minus,electrons?'−':'➜');node.minus.fontColor=electrons?[1,1,1]:[.9,.06,.05];
        }
        if(visible){
          if(flowing)p.phase=(p.phase+dt*Math.min(2.5,Math.abs(p.current)*.7+.2))%1;
          const count=p.nodes.length;
          p.nodes.forEach((node,i)=>{
            let t=(p.phase+i/count)%1;
            if(p.current<0)t=1-t;
            if(state.currentType==='electrons')t=1-t;
            const x=p.p0.x+(p.p1.x-p.p0.x)*t-16,y=p.p0.y+(p.p1.y-p.p0.y)*t-16;
            node.disc.setPosition(x,y);node.minus.setPosition(x,y);
            node.minus.angle=electrons?0:p.main.angle+(p.current<0?Math.PI:0);
          });
        }
      }
    }
  });
  recompute();
}
