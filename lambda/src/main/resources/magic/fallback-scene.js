function buildScene(M, brief) {
  const C = M.cook;
  const THREE = M.THREE;
  const palette = {
    gold: '#C9A86A',
    amber: '#E8C99A',
    cream: '#F9F6F0',
    charcoal: '#3A3632',
    oak: '#D8C4A6',
    haze: '#E6EAF1',
    warm: '#F5E8D0'
  };
  if (brief && brief.palette) Object.assign(palette, brief.palette);

  // Look and atmosphere - warm golden hour
  C.look('crisp', { grain: 0.03, target: 0.48 });
  M.renderer.toneMappingExposure = 1.0;
  C.sky({ preset: 'sunset', top: '#E8B98A', bottom: '#FFF3E0', fog: true });
  M.scene.fog = new THREE.Fog(palette.warm, 7, 22);
  M.scene.background = new THREE.Color('#FFF6EE');

  C.env({
    top: '#FFF8EC',
    bottom: '#E8DCC8',
    horizon: '#F5E8D0',
    sun: { dir: [-0.55, 0.72, 0.45], color: '#FFD9A0', intensity: 1.4 },
    panels: [
      { pos: [-3.2, 2.2, 2.0], size: [2.4, 2.2], color: '#FFF1D8', intensity: 1.6 },
      { pos: [3.0, 1.8, -1.5], size: [1.2, 1.6], color: '#FFE9C8', intensity: 0.7 }
    ],
    intensity: 1.0
  });

  C.lights({ preset: 'warm', intensity: 1.0, shadows: true, pos: [-2.6, 4.2, 2.0], shadowArea: 14, shadowSize: 2048 });

  // Room - open luxury living room
  const room = C.room({
    width: 7.2,
    depth: 7.8,
    height: 3.2,
    wall: palette.cream,
    floor: '#D8C4A6',
    floorStyle: 'wood',
    ceiling: '#FFFCF6'
  });

  // Light oak herringbone floor - add subtle rug under seating
  const rug = C.prop.rugRect({ w: 3.8, d: 2.9, pos: [0, 0.015, 0.15], color: '#FFF8EC', accent: '#EDE0C8' });

  // Window view - city calm, floor to ceiling
  C.windowView({
    room: room,
    wall: 'back',
    at: [0, 0],
    y: 1.45,
    w: 5.6,
    h: 2.0,
    view: 'city',
    panes: 4,
    curtains: true,
    beams: true
  });

  // Abstract gold-framed art above sofa
  const art = C.prop.artwork({ w: 1.4, h: 0.75, pos: [0, 1.68, -3.82], rotY: 0, style: 'waves', palette: [palette.gold, palette.amber, '#FFF6E8'] });
  // thin gold frame is inside artwork, add extra wall accent
  const wallMat = C.mat('plaster', { color: palette.cream });

  // Curved cream boucle sofa - background center
  const sofa = C.prop.sofaSoft({ w: 3.0, pos: [0, 0, -2.25], rotY: 0, color: palette.cream, pillows: 3 });
  // add a throw
  const throwMat = C.mat('fabric', { color: '#E8D8B8' });

  // Olive tree in white pot - background left corner
  const olive = C.prop.plantLeafy({ h: 1.65, pos: [-2.85, 0, -2.9], leaves: 1.0 });
  const whitePot = C.prop.vase({ h: 0.42, pos: [-2.85, 0, -2.9], branches: false, color: '#F2EDE6' });

  // Small side table left of sofa
  const sideTable = C.prop.sideTable({ pos: [-1.9, 0, -2.15], top: 'wood', color: '#D8C4A6' });
  // books on side table
  const sideBooks = C.prop.books({ n: 2, pos: [-1.9, 0.42, -2.15], rotY: 0.3 });

  // Brushed brass floor lamp - background right next to sofa
  const lampGroup = new THREE.Group();
  lampGroup.position.set(1.95, 0, -2.2);
  {
    const baseMat = C.mat('metal', { color: '#C9A86A' });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.7, 16), baseMat);
    stem.position.y = 0.85;
    const shadeMat = C.mat('fabric', { color: '#F5E8D0' });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.32, 24, 1, true), shadeMat);
    shade.position.y = 1.65;
    shade.material.side = THREE.DoubleSide;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ emissive: '#FFD9A0', emissiveIntensity: 0.8, color: '#FFF6E0' }));
    bulb.position.y = 1.60;
    const lampLight = new THREE.PointLight('#FFD9A0', 6, 5, 1.6);
    lampLight.position.set(0, 1.55, 0);
    lampGroup.add(stem, shade, bulb, lampLight);
    M.scene.add(lampGroup);
  }

  // Low oval marble coffee table - center
  const tableGroup = new THREE.Group();
  tableGroup.position.set(0, 0, 0.05);
  let tableTopY = 0.38;
  {
    const marbleMat = C.mat('marble', { color: '#FFFBF5', clearcoat: 0.7, scale: 1.2 });
    const topShape = new THREE.Shape();
    const w = 1.35, d = 0.82;
    topShape.ellipse(0, 0, w/2, d/2, 0, Math.PI*2);
    const extr = new THREE.ExtrudeGeometry(topShape, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 4 });
    extr.rotateX(Math.PI/2);
    extr.translate(0, 0.38, 0);
    const topMesh = new THREE.Mesh(extr, marbleMat);
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    tableGroup.add(topMesh);
    // gold legs - 4 slender tapered
    const legMat = C.mat('metal', { color: '#C9A86A' });
    const legPos = [[0.55,0.28],[ -0.55,0.28],[0.55,-0.28],[-0.55,-0.28]];
    legPos.forEach(p=>{
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.38, 12), legMat);
      leg.position.set(p[0], 0.19, p[1]);
      leg.castShadow = true;
      tableGroup.add(leg);
    });
    // small brass stretcher ellipse underneath
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.008, 10, 32), legMat);
    ring.rotation.x = Math.PI/2;
    ring.position.y = 0.08;
    ring.scale.set(1, 0.6, 1);
    tableGroup.add(ring);
    M.scene.add(tableGroup);
  }

  // Decor on table
  // matte beige ceramic vase with pampas - middle left
  const vase = C.prop.vase({ h: 0.32, pos: [-0.52, 0.38, 0.12], color: '#E8DDC8', branches: true });
  // stack of art coffee table books - middle right
  const books = C.prop.books({ n: 3, pos: [0.58, 0.38, -0.08], rotY: 0.18 });
  // gold tray with candle - middle center below floating bottle
  const trayGroup = new THREE.Group();
  trayGroup.position.set(0.02, 0.405, 0.02);
  {
    const trayMat = C.mat('metal', { color: '#D8B56A' });
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.012, 32), trayMat);
    tray.receiveShadow = true;
    tray.castShadow = true;
    trayGroup.add(tray);
    const candleMat = C.mat('plaster', { color: '#FFF6E8' });
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.10, 20), candleMat);
    candle.position.set(0.08, 0.055, 0);
    trayGroup.add(candle);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.003,0.003,0.02,6), new THREE.MeshStandardMaterial({ color:'#2A221A', emissive:'#FF8C2A', emissiveIntensity:0.5 }));
    wick.position.set(0.08,0.11,0);
    trayGroup.add(wick);
    const flameLight = new THREE.PointLight('#FFB86A', 2.2, 1.2, 2);
    flameLight.position.set(0.08,0.12,0);
    trayGroup.add(flameLight);
    // small golden pebble decor
    const pebble = new THREE.Mesh(new THREE.SphereGeometry(0.028,12,10), trayMat);
    pebble.position.set(-0.09,0.02,-0.05);
    pebble.scale.y=0.6;
    trayGroup.add(pebble);
    M.scene.add(trayGroup);
  }

  // Additional foreground decor: sheer linen curtains breathing (already in windowView, add extra plants)
  // Plush ivory wool rug already done
  // Extra small succulent on floor near sofa
  const succ = C.prop.plantLeafy({ h: 0.45, pos: [2.6, 0, -1.2], leaves: 0.6 });

  // HERO - perfume bottle floating 40cm above table, large scale, no frame
  const heroW = 0.95;
  // pos centered above table: table at [0,0,0.05], topY 0.38, +0.42 = 0.80
  const heroY = 0.80;
  const hero = C.screen({
    width: heroW,
    pos: [0, heroY, 0.05],
    cutout: true,
    billboard: true,
    brightness: 1.02,
    glow: 0.32,
    rim: 0.45,
    relight: 0.42,
    wrap: 0.22,
    lightDir: [-0.55, 0.7, 0.55],
    lightColor: '#FFE9C0',
    wrapColor: '#F5E8D0'
  });
  if (hero) {
    hero.group.position.y = heroY;
    hero.group.userData.baseY = heroY;
  }

  // Contact shadow on marble table
  const shadow = C.contactShadow({ pos: [0, 0.38, 0.05], w: 0.55, d: 0.45, opacity: 0.45, follow: hero ? hero.group : null, offset: 0.006 });

  // Soft golden reflection on polished marble - flipped faint copy under table surface
  let reflectGroup = null;
  if (hero) {
    const reflTex = M.image.texture;
    const reflMat = new THREE.MeshBasicMaterial({
      map: reflTex,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    reflMat.map.colorSpace = THREE.SRGBColorSpace;
    const aspect = Math.max(0.5, Math.min(2.0, M.image.aspect || 0.75));
    const rh = heroW / aspect;
    const reflGeo = new THREE.PlaneGeometry(heroW * 0.58, rh * 0.58);
    const reflMesh = new THREE.Mesh(reflGeo, reflMat);
    reflMesh.position.set(0, 0.385, 0.05);
    reflMesh.rotation.x = -Math.PI/2;
    reflMesh.rotation.z = Math.PI;
    reflMesh.scale.y = -0.45;
    M.scene.add(reflMesh);
    reflectGroup = reflMesh;
    // golden halo behind hero
    const haloGeo = new THREE.PlaneGeometry(1.4, 1.4);
    const haloMat = new THREE.MeshBasicMaterial({ color: '#E8C99A', transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(0, heroY, -0.18);
    M.scene.add(halo);
  }

  // Warm volumetric sun rays through window - lightPattern dapple
  C.lightPattern({ kind: 'dapple', pos: [0.2, 0.02, 0.6], rot: [-Math.PI/2, 0, 0.15], w: 3.2, h: 2.8, color: '#E8C99A', opacity: 0.14, speed: 0.12 });
  C.lightPattern({ kind: 'blinds', pos: [-0.6, 1.2, -3.7], rot: [0, 0, 0], w: 5.0, h: 1.6, color: '#FFD9A0', opacity: 0.06, speed: 0.04 });

  // Bokeh for shallow depth of field - behind sofa near window
  C.bokeh({ count: 36, pos: [0, 1.1, -3.6], area: [6, 1.6, 0.8], colors: ['#C9A86A','#E8C99A','#FFF1C6','#E6D5B8'], size: [0.08, 0.22], opacity: 0.55 });
  // foreground bokeh near camera
  C.bokeh({ count: 14, pos: [0, 0.6, 1.8], area: [2, 0.6, 0.4], colors: ['#FFE8B8','#E8C99A','#D8C4A6'], size: [0.06, 0.14], opacity: 0.28 });

  // Floating dust motes in sunbeams
  C.particles({ kind: 'dust', count: 700, area: [5, 2.2, 4], pos: [0, 1.2, -0.6], color: '#FFECB8', size: 0.018, speed: 0.35 });
  C.particles({ kind: 'sparkles', count: 120, area: [1.2, 0.6, 0.8], pos: [0, 0.8, 0.05], color: '#FFDDAA', size: 0.022, speed: 0.2 });

  // Subtle floor reflection plane for marble gloss (faint)
  // Ambient occlusion helper - darker corners
  const cornerLight = new THREE.PointLight('#6A5A42', 1.5, 4, 2);
  cornerLight.position.set(-2.8, 0.4, -2.8);
  M.scene.add(cornerLight);

  // Camera story - portrait phone 35mm, shallow DOF, orbit around table height
  C.cam.path([
    { pos: [0.35, 0.55, 3.2], target: [0, 0.78, 0.05] },
    { pos: [1.55, 0.85, 2.1], target: [0, 0.82, 0.05] },
    { pos: [1.2, 1.05, 0.85], target: [-0.05, 0.78, -0.15] },
    { pos: [-0.9, 0.95, 1.15], target: [0, 0.75, 0.05] },
    { pos: [-1.45, 0.62, 2.4], target: [0, 0.70, -0.2] },
    { pos: [0.1, 1.35, 2.9], target: [0, 0.78, -0.6] },
    { pos: [0.35, 0.55, 3.2], target: [0, 0.78, 0.05] }
  ], { duration: 58, closed: true, fov: 38, intro: 2.8, introOffset: [0.6, 0.9, 1.8] });

  // Per frame - bottle hover and slow rotation, curtains breathing, reflection fade
  const t0 = { heroY: heroY };
  M.onFrame((dt, t)=>{
    if (hero && hero.group) {
      const bob = Math.sin(t * 0.55) * 0.022;
      const tilt = Math.sin(t * 0.32) * 0.02;
      hero.group.position.y = t0.heroY + bob;
      hero.group.rotation.z = tilt;
      hero.group.userData.yawOffset = Math.sin(t * 0.18) * 0.12;
      // subtle light sweep intensity pulse
      if (reflectGroup) {
        reflectGroup.material.opacity = 0.14 + Math.sin(t*0.6)*0.03;
        reflectGroup.position.z = 0.05 + Math.sin(t*0.3)*0.02;
      }
    }
    // floor lamp gentle pulse
    if (lampGroup) lampGroup.children.forEach(ch=>{ if(ch.isPointLight) ch.intensity = 6 + Math.sin(t*0.9)*0.6; });
  });

  C.intro({ duration: 2.8, heroes: hero ? [hero] : [], heroDelay: 0.4 });

  return {
    hero: hero,
    room: room,
    ground: { y: 0 },
    lights: { key: null, fill: null },
    anchors: { floor: 0, tableTop: { x: 0, y: tableTopY, z: 0.05 }, wallBack: -3.9 },
    bounds: { minX: -3.4, maxX: 3.4, minZ: -3.6, maxZ: 3.6 },
    keep: [[0,0.05,1.2],[0,0.8,0.05],[0,0.38,0.05]]
  };
}

function dressScene(M, brief, ctx) {
  const C = M.cook;
  const THREE = M.THREE;
  const pal = {
    gold: '#C9A86A',
    amber: '#E8C99A',
    cream: '#F9F6F0',
    charcoal: '#3A3632',
    oak: '#D8C4A6',
    warm: '#F5E8D0',
    blush: '#EDE0C8'
  };
  if (brief && brief.palette) try{ Object.assign(pal, brief.palette);}catch(e){}
  const table = (ctx && ctx.anchors && ctx.anchors.tableTop) ? ctx.anchors.tableTop : {x:0,y:0.38,z:0.05};
  const tableY = table.y || 0.38;
  const hero = ctx && ctx.hero ? ctx.hero : null;
  function safe(fn){ try{ fn(); }catch(e){ if(C && C.warn) try{C.warn(e.message)}catch(_){}} }

  // 1-2: Brass wall sconces flanking art (emissive domes, no extra shadow lights)
  safe(()=>{
    const sconceMat = C.mat('metal', {color: pal.gold, clearcoat:0.5});
    const glassMat = new THREE.MeshStandardMaterial({color:'#FFF4D8', emissive:'#FFD9A0', emissiveIntensity:0.55, roughness:0.45});
    [-1.25, 1.25].forEach(x=>{
      const g = new THREE.Group();
      g.position.set(x, 1.62, -3.78);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.015,20), sconceMat);
      back.rotation.z = Math.PI/2;
      back.position.z = -0.02;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.10,20,14,0,Math.PI*2,0,Math.PI/2), glassMat);
      dome.rotation.x = Math.PI;
      dome.position.z = 0.05;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.08,10), sconceMat);
      stem.position.y = -0.07;
      stem.position.z = 0.02;
      g.add(back, dome, stem);
      M.scene.add(g);
    });
    // single soft bounce for sconces
    const sconceGlow = new THREE.PointLight('#FFE8B8', 2.0, 3.5, 2);
    sconceGlow.position.set(0,1.55,-3.2);
    M.scene.add(sconceGlow);
  });

  // 3: Throw blanket on sofa left side
  safe(()=>{
    const throwMat = C.mat('fabric', {color:'#E8D8B8', scale:1.0});
    const grp = new THREE.Group();
    grp.position.set(-0.92, 0.46, -2.28);
    grp.rotation.y = 0.22;
    const base = C.build.roundBox({w:0.88,h:0.11,d:0.70,r:0.09, color:'#E8D8B8', pos:[0,0,0]});
    // replace material with fabric
    base.traverse?base.traverse(o=>{ if(o.isMesh){ o.material = throwMat; o.castShadow=true; }}) : null;
    // if build returns group, recolor
    if(base && base.material) { base.material = throwMat; }
    grp.add(base);
    const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,0.55,14), throwMat);
    fold.rotation.z = Math.PI/2;
    fold.position.set(0.15,0.06,0.12);
    fold.scale.set(1,0.6,1);
    grp.add(fold);
    M.scene.add(grp);
  });

  // 4: Extra bouclé cushion with gold piping
  safe(()=>{
    const cMat = C.mat('boucle', {color: pal.cream});
    const cush = C.build.roundBox({w:0.44,h:0.14,d:0.42,r:0.07, color: pal.cream, pos:[0.78,0.48,-2.32]});
    cush.rotation.y = -0.18;
    M.scene.add(cush);
    const pip = new THREE.Mesh(new THREE.TorusGeometry(0.18,0.006,8,24), C.mat('metal',{color:pal.gold}));
    pip.position.set(0.78,0.55,-2.32);
    pip.rotation.x = Math.PI/2;
    pip.scale.set(1.2,0.9,1);
    M.scene.add(pip);
  });

  // 5: Decorative brass bowl with golden orbs on table (middle back)
  safe(()=>{
    const bowlMat = C.mat('metal', {color:'#D8B56A'});
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.10,0.04,24), bowlMat);
    bowl.position.set(0.12, tableY+0.032, -0.28);
    bowl.receiveShadow=true; bowl.castShadow=true;
    M.scene.add(bowl);
    const orbMat = C.mat('metal', {color: pal.gold});
    for(let i=0;i<3;i++){
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.032,14,10), orbMat);
      s.position.set(0.12 + (i-1)*0.05, tableY+0.06, -0.28 + (i%2?0.02:-0.015));
      s.castShadow=true;
      M.scene.add(s);
    }
  });

  // 6: Coasters + small ceramic dish on table
  safe(()=>{
    const woodMat = C.mat('wood', {color: pal.oak, scale:0.8});
    for(let i=0;i<2;i++){
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.006,20), woodMat);
      c.position.set(-0.34 + i*0.09, tableY+0.007, 0.28);
      c.receiveShadow=true;
      M.scene.add(c);
    }
    const dishMat = C.mat('plaster', {color:'#FFF6E8'});
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.055,0.015,18), dishMat);
    dish.position.set(-0.42, tableY+0.012, 0.30);
    M.scene.add(dish);
  });

  // 7: Sculptural knot on top of book stack
  safe(()=>{
    const knotMat = C.mat('stone', {color:'#EDE0C8'});
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.045,0.012,32,8), knotMat);
    knot.position.set(0.58, tableY+0.095, -0.08);
    knot.scale.set(1,0.75,1);
    knot.rotation.y = 0.6;
    knot.castShadow=true;
    M.scene.add(knot);
  });

  // 8: Small eucalyptus in cream bud vase on side table
  safe(()=>{
    const v = C.prop.vase({h:0.18, pos:[-1.88,0.415,-2.28], color:'#F2EDE6', branches:true});
  });

  // 9: Magazine stack on rug edge foreground
  safe(()=>{
    const mags = C.prop.books({n:3, pos:[-1.85,0.03,0.95], rotY:-0.45});
    // loose magazine open
    const openMat = C.mat('fabric', {color:'#FFF8EC'});
    const open = C.build.roundBox({w:0.42,h:0.015,d:0.32,r:0.015, color:'#FFF8EC', pos:[-1.82,0.06,0.98]});
    open.rotation.y = -0.4;
    open.rotation.z = 0.06;
    M.scene.add(open);
  });

  // 10: Snake plant in terracotta pot near right wall
  safe(()=>{
    const potMat = C.mat('plaster', {color:'#E8DDC8'});
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.15,0.28,18), potMat);
    pot.position.set(2.75,0.14,-1.35);
    pot.castShadow=true; pot.receiveShadow=true;
    M.scene.add(pot);
    const leafMat = C.mat('fabric', {color:'#7A8C6A'});
    const leaves = new THREE.Group(); leaves.position.set(2.75,0.28,-1.35);
    for(let i=0;i<7;i++){
      const h = 0.35 + M.random.range(0,0.25);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.04,h,6), leafMat);
      b.position.set(M.random.range(-0.08,0.08), h/2, M.random.range(-0.08,0.08));
      b.rotation.z = M.random.range(-0.35,0.35);
      b.rotation.x = M.random.range(-0.25,0.25);
      leaves.add(b);
    }
    M.scene.add(leaves);
    C.animate(leaves, {sway:0.25, bob:0.02});
  });

  // 11: Ceiling recessed glow + pendant hint
  safe(()=>{
    const pendMat = C.mat('metal', {color:pal.gold});
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.005,0.55,8), new THREE.MeshStandardMaterial({color:'#3A3632'}));
    cord.position.set(-0.9,2.9,-1.0);
    M.scene.add(cord);
    const pend = new THREE.Mesh(new THREE.SphereGeometry(0.09,18,12,0,Math.PI*2,0,Math.PI/2), C.mat('fabric',{color:'#FFF1D8'}));
    pend.position.set(-0.9,2.62,-1.0);
    pend.rotation.x = Math.PI;
    M.scene.add(pend);
    const pLight = new THREE.PointLight('#FFE9C0', 2.2, 4, 1.8);
    pLight.position.set(-0.9,2.55,-1.0);
    M.scene.add(pLight);
  });

  // 12: Olive tree extra bush at base + scattered pebbles
  safe(()=>{
    const pebMat = C.mat('stone', {color:'#EDE0C8'});
    const pebG = new THREE.Group();
    for(let i=0;i<6;i++){
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.025,10,8), pebMat);
      p.position.set(-2.85+M.random.range(-0.12,0.12), 0.02, -2.9+M.random.range(-0.12,0.12));
      p.scale.y = 0.5;
      pebG.add(p);
    }
    M.scene.add(pebG);
  });

  // 13: Golden floating rings around hero (ocean mirror reference - gentle orbit)
  safe(()=>{
    if(!hero || !hero.group) return;
    const ringMat = new THREE.MeshStandardMaterial({color:pal.gold, metalness:0.75, roughness:0.28, emissive:pal.gold, emissiveIntensity:0.18, transparent:true, opacity:0.85});
    const rings = new THREE.Group();
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.42,0.004,10,48), ringMat);
    r1.rotation.x = Math.PI/2 + 0.15;
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.56,0.003,10,48), ringMat.clone());
    r2.material.opacity=0.35;
    r2.rotation.x = Math.PI/2 - 0.22;
    r2.rotation.y = 0.35;
    rings.position.set(0, hero.group.position.y, 0.05);
    rings.add(r1,r2);
    M.scene.add(rings);
    // small orbiting petal discs
    const petalMat = C.mat('fabric', {color:'#F5E0B0'});
    petalMat.side = THREE.DoubleSide;
    const petals = new THREE.Group();
    petals.position.copy(rings.position);
    for(let i=0;i<5;i++){
      const ph = new THREE.Mesh(new THREE.CircleGeometry(0.035,12), petalMat);
      ph.material = petalMat.clone();
      ph.material.transparent=true; ph.material.opacity=0.55;
      const ang = (i/5)*Math.PI*2;
      ph.position.set(Math.cos(ang)*0.48, M.random.range(-0.08,0.08), Math.sin(ang)*0.48);
      ph.lookAt(0, rings.position.y, 0.05);
      petals.add(ph);
    }
    M.scene.add(petals);
    M.onFrame((dt,t)=>{
      if(hero && hero.group) rings.position.y = hero.group.position.y;
      rings.rotation.y += dt*0.18;
      petals.position.y = rings.position.y;
      petals.rotation.y -= dt*0.12;
      petals.children.forEach((c,idx)=>{
        c.position.y = Math.sin(t*0.5 + idx)*0.03;
        c.rotation.z += dt*0.2;
      });
    });
  });

  // 14: Warm rim / bounce light for hero cutout (golden bounce)
  safe(()=>{
    const bounce = new THREE.PointLight('#FFD9A0', 3.5, 3.2, 1.7);
    bounce.position.set(0.45, 1.05, 0.35);
    M.scene.add(bounce);
    M.onFrame((dt,t)=>{ bounce.intensity = 3.2 + Math.sin(t*0.7)*0.4; });
  });

  // 15: Contact shadows for furniture (sofa, pots)
  safe(()=>{
    C.contactShadow({pos:[-2.85,0.01,-2.9], w:0.55, d:0.55, opacity:0.22});
    C.contactShadow({pos:[2.75,0.01,-1.35], w:0.45, d:0.45, opacity:0.18});
    C.contactShadow({pos:[-1.9,0.01,-2.15], w:0.5, d:0.5, opacity:0.12});
    C.contactShadow({pos:[0,0.01,0.05], w:1.4, d:1.0, opacity:0.08});
  });

  // 16: Extra shimmer particles tightly around bottle column (subtle particle shimmer)
  safe(()=>{
    C.particles({kind:'sparkles', count:90, area:[0.9,1.0,0.9], pos:[0,0.85,0.05], color:'#FFE8B8', size:0.018, speed:0.18});
    C.particles({kind:'dust', count:500, area:[4.5,1.8,3.5], pos:[0,1.0,-0.4], color:'#FFECB8', size:0.014, speed:0.28});
  });

  // 17: Light pattern caustics on back wall behind hero (projected golden pattern)
  safe(()=>{
    C.lightPattern({kind:'caustics', pos:[0,0.45,-3.75], rot:[0,0,0], w:2.8, h:1.4, color:'#E8C99A', opacity:0.10, speed:0.18});
    C.lightPattern({kind:'rings', pos:[0,0.02,0.15], rot:[-Math.PI/2,0,0], w:1.6, h:1.6, color:'#C9A86A', opacity:0.07, speed:0.12});
  });

  // 18: Foreground depth bokeh + window bokeh intensify
  safe(()=>{
    C.bokeh({count:18, pos:[-0.8,0.35,1.2], area:[1.2,0.5,0.6], colors:['#E8C99A','#FFF1C6','#D8C4A6'], size:[0.05,0.13], opacity:0.32});
    C.bokeh({count:12, pos:[1.0,0.45,0.95], area:[0.8,0.4,0.5], colors:['#C9A86A','#E8C99A'], size:[0.04,0.10], opacity:0.22});
  });

  // 19: Sheer curtain breathe - find curtain meshes and animate if present, else add subtle sway to air
  safe(()=>{
    // add two thin sheer panels as extra layer for visible breathing
    const curtMat = new THREE.MeshStandardMaterial({color:'#FFF8EC', transparent:true, opacity:0.72, side:THREE.DoubleSide, roughness:0.9});
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1,2.2,8,8), curtMat);
    g1.position.set(-2.2,1.45,-3.6); g1.rotation.y=0.12;
    const g2 = new THREE.Mesh(new THREE.PlaneGeometry(1.1,2.2,8,8), curtMat.clone());
    g2.position.set(2.2,1.45,-3.6); g2.rotation.y=-0.12;
    M.scene.add(g1,g2);
    // store original vertices
    const orig1 = g1.geometry.attributes.position.array.slice();
    const orig2 = g2.geometry.attributes.position.array.slice();
    M.onFrame((dt,t)=>{
      const arr1 = g1.geometry.attributes.position.array;
      const arr2 = g2.geometry.attributes.position.array;
      for(let i=0;i<arr1.length;i+=3){
        const y = orig1[i+1];
        arr1[i] = orig1[i] + Math.sin(t*0.35 + y*1.2)*0.03 * (y+1.1);
        arr2[i] = orig2[i] + Math.sin(t*0.32 + y*1.2 + 1.0)*0.03 * (y+1.1);
      }
      g1.geometry.attributes.position.needsUpdate=true;
      g2.geometry.attributes.position.needsUpdate=true;
    });
  });

  // 20: Ambient occlusion vignette - darkened corners + floor AO
  safe(()=>{
    const ao1 = new THREE.PointLight('#5A4A32', 1.8, 3.0, 2.0);
    ao1.position.set(-3.1,0.2,1.8);
    M.scene.add(ao1);
    const ao2 = new THREE.PointLight('#5A4A32', 1.2, 2.8, 2.0);
    ao2.position.set(3.0,0.2,1.5);
    M.scene.add(ao2);
  });

  // 21: Small gold tray accent - add tiny perfume sample vial on table for storytelling
  safe(()=>{
    const vialMat = C.mat('glass', {color:'#FFF6E8'});
    // use simple cylinder as vial - glass
    const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.06,12), vialMat);
    vial.position.set(0.32, tableY+0.03, 0.18);
    M.scene.add(vial);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.015,12), C.mat('metal',{color:pal.gold}));
    cap.position.set(0.32, tableY+0.065, 0.18);
    M.scene.add(cap);
  });

  // tighten fog a touch for depth
  safe(()=>{
    if(M.scene.fog) { M.scene.fog.near = 6.5; M.scene.fog.far = 20; }
  });
}
