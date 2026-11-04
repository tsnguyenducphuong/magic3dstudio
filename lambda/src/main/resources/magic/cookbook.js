/*! cookbook.js v1 - reusable, tested building blocks for Magic 3D Studio scenes (plain Three.js).
 * Inlined into every page by Lambda. ADD functions freely, but never rename / remove / change the meaning of an existing one:
 * the reference scenes (and Agent B's copies of them) call these. Every public function needs one line in the API INDEX below,
 * `node render.js --check-cookbook cookbook.js` verifies that. Lambda sends the index (not the whole file) to Agent B.
 */
// ==== API INDEX START ====
// cook.screen({width,height?,pos,rot,fit,fx,shape,bezel,glow,brightness,cutout,billboard,rim,relight,wrap,lightDir,lightColor,wrapColor,lightSweep}) - the customer's image on a flat surface (height follows the image aspect when omitted), up to 4 effects, optional bezel and glow; returns {group,mesh,setFx,setBrightness}. The picture is often a CUT-OUT product with a transparent background: by default it sits on a soft light backdrop; cutout:true also gives the product edge light (rim), light wrap and a gentle re-light with a slowly moving light (rim/relight/wrap 0..1, defaults 0.3/0.25/0.2; lightDir:[x,y,z] / lightColor / wrapColor match the scene key light and ambient; set to 0 to disable) so it reads as lit by the room, not a sticker; billboard:true turns the picture to face the camera (limited to about 40 degrees; set group.userData.yawOffset for extra yaw, do not set rotation.y yourself); cutout:true keeps the background see-through so the product itself floats (use it for a floating product, not for frames / tvs)
// cook.frame({width,pos,rot,style:'wood'|'gold'|'black'|'white'|'none',mat,fx}) - framed picture / painting / poster with optional white mat
// cook.tv({width,pos,rot,fx,crt,stand}) - flat TV or monitor with stand that shows the image and glows softly
// cook.portal({pos,radius,fx,ring,sparkles}) - round glowing gateway / porthole showing the image
// cook.FX - image effect ids usable in fx: flipX flipY invert gray sepia ripple wave swirl mirage frost rain prism sparkle heartbeat pulse film scanlines vignette glitch; as 'id' or {id,a,b}
// cook.lights({preset:'warm'|'cool'|'studio'|'sunset'|'night'|'neon',intensity,shadows,pos,shadowArea,shadowSize}) (shadowArea = half-width in metres the sun shadow covers, default 8; use 30-60 for outdoor / town scenes with shadowSize 2048) - hemisphere + shadow-casting sun (call once)
// cook.sky({preset:'day'|'sunset'|'night'|'dawn'|'space'|'underwater'|'studio',top,bottom,stars,fog}) - gradient sky dome with matching fog
// cook.fog({color,near,far}) - linear fog
// cook.look('cinematic'|'dreamy'|'crisp'|'vintage'|'noir'|'neon',{grain:0.05,target,exposureRange,autoExposure}) - exposure + vignette / colour filter + fine film grain, plus AUTO EXPOSURE: the studio meters the picture every ~1s and holds its average brightness at the look's target (0..1; crisp .46, dreamy .52, cinematic .38, noir .30; pass target to make a scene brighter or moodier, autoExposure:false to disable). Call it once, near the start
// cook.room({width,depth,height,wall,floor,floorStyle:'wood'|'tile'|'carpet',ceiling}) - floor + three walls, front open; returns {backZ,...}
// cook.ground({style:'grass'|'sand'|'snow'|'stone'|'plain',size,color,y}) - round ground disc
// cook.water({y,size,color,depthColor,waves,opacity}) - animated water surface
// cook.mat(kind,{color,scale,rough,repeat,accent,clearcoat,microRough}) - material with a PROCEDURAL TEXTURE (+ micro roughness variation); clearcoat:0..1 adds a lacquer layer; kind 'glass' (transmissive, use for ONE small object) | 'brushed' (anisotropic metal) | 'paving'|'asphalt'|'grass'|'brick'|'roof'|'foliage'|'wood'|'fabric'|'linen'|'boucle'|'plaster'|'concrete'|'marble'|'terrazzo'|'stone'|'leather'|'rug'|'metal'. Use it instead of flat-colour MeshStandardMaterial for floors, walls, furniture
// cook.merge(group) - merges static plain meshes sharing a material into one mesh each (keep under ~120 draw calls); call it on a group of furniture / decor after building; skips shader / transparent materials and instanced meshes
// cook.build.roundBox({w,h,d,r,color|material|kind,pos,rotY,parent}) - soft-edged box for cushions, sofas, tables, books (never use raw sharp boxes for furniture)
// cook.windowView({room,wall:'left'|'right'|'back',at,y,w,h,view:'park'|'city'|'sea'|'mountains'|'sky'|'garden',panes,curtains,beams}) - lit window with a painted world outside, white frame, mullions, swaying sheer curtains and a light shaft; room = the object returned by cook.room
// cook.prop.sofaSoft|armchair|coffeeTable|sideTable|vase|books|plantLeafy|pendant|artwork|rugRect({pos,rotY,scale,color,...}) - detailed, already-merged furniture and decor: sofaSoft({w,color,pillows}), coffeeTable({shape:'round'|'rect',top:'wood'|'marble',r,h}), vase({h,branches,tall}), books({n}), plantLeafy({h,leaves}), pendant({drop,shape:'dome'|'globe'}), artwork({w,h,style:'shapes'|'stripes'|'circles'|'waves',palette}), rugRect({w,d,color,accent})
// cook.scatter({from:group,count,area:[x0,z0,x1,z1],y,scale:[min,max],avoid:[[x,z,r]],seed,positions}) - INSTANCES a built prop / tree / lamp many times (a few draw calls for any count; removes the source group). Use for forests, lamp rows, cafe tables, bushes
// cook.nature.tree({h,kind:'round'|'cone'|'tall',color,seed,pos,rotY,scale}) - leafy tree (trunk + 12 leaf-textured clumps, 2 draw calls); cook.nature.bush({r,color,pos}); cook.nature.hedgeRing({r,count,h,color,flowers,pos}) - ring of hedge (fountain / flower bed)
// cook.urban.building({w,d,floors,floorH,color,trim,lit,roof:'flat'|'gable',awning,balcony,pos,rotY}) - facade with window grid (some warm lit), shopfront, cornice, roof; front faces +z; cook.urban.streetLamp({h,glow,pos}); cook.urban.cafeSet({chairs,umbrella,umbrellaColor,pos}); cook.urban.bench({pos,rotY}); cook.urban.fountain({r,tiers,hedge,water,pos}); cook.urban.gazebo({r,sides,pos}); cook.urban.road({pos,len,w,rotY,sidewalk}) runs along local X; cook.urban.paving({pos,w,d,color,tile})
// cook.contactShadow({pos:[x,floorY,z],w,d,opacity,color,follow:group,offset}) - soft radial shadow on a surface under a floating product; with follow it shrinks / fades as the product rises (use under every cut-out)
// cook.env({top,bottom,horizon,sun:{dir,color,intensity},panels:[{pos,size:[w,h],color,intensity}],intensity}) - procedural studio / sky environment (softbox panels) so glossy materials (glass, metal, marble, lacquer) reflect something; sets scene.environment, which also lights every standard material, so it DIMS the hemisphere light of cook.lights by 45% (keepAmbient:true to skip); call once; panel intensity <= 3
// cook.bokeh({count,area:[x,y,z],pos,colors,size,opacity}) - big soft out-of-focus light discs (photographic bokeh) behind / around the product
// cook.lightPattern({kind:'caustics'|'dapple'|'waves'|'rings'|'blinds',pos,rot:[rx,ry,rz],w,h,color,opacity,speed}) - animated projected light on a wall / floor / table: water caustics, leaf-dappled sun, window blinds
// cook.intro({duration,exposureFrom,heroes:[screenResult],heroDelay}) - cinematic reveal: world fades up from darkness, then the product fades in; call last, after cook.look
// cook.prop.table|pedestal|sofa|plant|lamp|rug|shelf|window|box|cylinder|sphere({pos,rotY,scale,color,...}) - simple furniture and primitives
// cook.particles({kind:'dust'|'sparkles'|'snow'|'petals'|'bubbles'|'fireflies'|'rain'|'stars',count,area,pos,color,size,speed,parent}) - GPU point particles
// cook.animate(obj,{spin,bob,sway,pulse}) - endless motion on an object
// cook.tween(obj,{'position.y':2},{duration,delay,ease,loop,yoyo}) - one-off or looping property animation
// cook.on('frame',(dt,t)=>{}) - per-frame hook
// cook.cam.orbit({target,radius,height,speed,sway,fov,user}) - slow turntable camera, user can drag / pinch
// cook.cam.set({pos,target,fov}) - fixed camera (user can nudge it)
// cook.cam.path([{pos,target},...],{duration,loop,closed,fov,intro,introOffset}) - smooth fly-through camera; intro:seconds + introOffset:[dx,dy,dz] makes the camera glide in from that offset with a slight spring (cinematic entrance)
// cook.aquarium({pos,rotY,w,h,d,fill,cabinet,light,fish,species:'tetra'|'round'|'gold',fishColors,plants,rocks,substrate,waterColor,caustics,bubbles,backdrop,lightIntensity}) - a COMPLETE glass aquarium on a wooden cabinet: Fresnel glass, water tint, sculpted substrate, faceted stones, 3 layers of swaying plants, an instanced fish school, bubbles, LED hood + spot light, caustics and blue-green water absorption on everything inside. Returns the group; group.userData = {surfaceY (world), inner:{x0,x1,z0,z1,y0,y1}}. About 30 draw calls, so keep the rest of the scene light
// cook.underwater(root,{surfaceY,color,absorb:[r,g,b],caustics,scale}) - gives every standard material under root animated caustics on up-facing surfaces and per-channel water absorption (red dies first) below the world height surfaceY: use it for pools, ponds, seabeds, fountains, sunken scenes, aquarium-style product shots (not on cut-out screens)
// cook.fish({pos,size,count,bounds:[w,h,d],colors,species:'tetra'|'round'|'gold',speed,spread,parent}) - instanced school of fish (1 draw call, up to 40) with tail wag and a smooth school path inside the bounds box
// cook.aquaticPlants({pos,area:[w,d],count,heights:[min,max],width,color,tip,swayAmt,parent}) - thousands of swaying blades / ribbons in ONE draw call (carpet heights [0.015,0.04]; meadow [0.08,0.2]; vallisneria [0.25,0.45] width 3); also good for grass tufts under water
// cook.hardscape({pos,area:[w,d],count,size,color,style:'iwagumi'|'pile',parent}) - faceted stones arranged in the golden-ratio triangle (one big stone, a smaller one beside it, a third behind)
// cook.skyPhysical({hour:6-18,azimuth,turbidity,clouds:0-1,cloudSpeed,sunDisk,fog}) - analytic daylight sky (blue zenith, warm horizon, correct golden hour) with a soft moving cloud deck; returns {dome, sun}; ALWAYS feed the sun into the lights: const sky=cook.skyPhysical({hour:10.5}); cook.lights({preset:'warm',pos:sky.sun.pos,intensity:sky.sun.intensity,shadows:true,shadowArea:20})
// cook.sunAt(hour,azimuthDeg) - sun for a time of day: {dir,pos,color:'#hex' (2300 K at sunrise to 6600 K at noon),elevation,intensity}
// cook.pond({pos,rx,rz,depth,fish:6,pads:14,flowers:3,stones:34,waterColor,gravel,clarity}) - a KOI POND: irregular shoreline, sculpted gravel basin, boulder ring, wavy reflective water (Fresnel, animated normals), caustics + absorption, lily pads, lotus flowers and a school of koi (about 12 draw calls); returns group, userData {surfaceY,rx,rz}
// cook.lilyPads({pos,area:[w,d],count,size,colors,flowers,flowerColors}) - floating cupped lily pads (bobbing) and water-lily flowers on any water
// cook.fish species 'koi' (white / red / black patches, different for every fish); cook.nature.tree({leaf:'maple'|'cherry'}) gives red-orange maples and pink cherry blossom (colour param still works: autumn orange '#e08a2a', spring pink '#ffb8cd'); cook.mat kinds 'maple' | 'blossom'
// cook.asia.stoneLantern({h,pos,glow}) - glowing Japanese stone lantern; cook.asia.bridge({len,w,rise,pos,rotY}) - arched timber bridge with rails; cook.asia.bamboo({pos,area:[w,d],count,h}) - swaying bamboo grove (2 draw calls)
// cook.pbr(kind,{color,rough,metal,finish:'turned'|'brushed'|'cast'|'smudge'|'knurl'|null,rep,clearcoat,opacity,emissive,emissiveIntensity,envMapIntensity}) - STUDIO-GRADE MATERIAL (MeshPhysicalMaterial) with measured reflectances + micro-roughness finish. kinds: steel steelDark stainless chrome aluminium aluminiumMachined titanium inconel copper brass gold silver bluedSteel castIron | anodised paint satin plastic rubber ceramic enamel carbon | glass sapphire ruby fluid glow. Metals keep their true colour (pass color only for paint / anodised / plastic / enamel). Needs cook.studio or cook.env to reflect something
// cook.studio({theme:'paper'|'night',bg,y,floor,fog:[near,far],intensity,keyPos,shadowArea,shadowSize,contact,tone:'neutral'}) - PRODUCT-PHOTOGRAPHY SET in one call: softbox environment with black flags (metal gets contrast and shape), soft key shadow, cool rim, fill, a seamless floor that melts into the backdrop; use INSTEAD of cook.lights + cook.env + cook.sky; returns {key,rim,fill,floor}
// cook.machine.lathe([[r,y],...],{seg,crease,closed,double,kind|material,color,pos,rot,parent}) - closed solid of revolution around +Y (bottles, vases, pistons, nozzles, cups, bearings) with hard edges only at real corners; cook.machine.bladeRing({count,r0,r1,chord,thick,twist,pitch,camber,hub,axis:'z'|'y'|'x',spin,kind|material,pos}) - fan / turbine / propeller / impeller, instanced twisted blades (spin rad/s, calm: clamped to +-1.2 = one turn per 5 s, use 0.2-0.8; fast:true allows 6); cook.machine.bolts({count,R,size,h,axis,pos}) - ring of hex bolts; cook.machine.gear({teeth,r,width,bore,spin,pos}); cook.machine.spring({R,wire,turns,len,pos}); cook.machine.pipe([[x,y,z],...],{r,kind,parent}) - cables, pipes, hoses
// cook.cutaway(root,{axis:'x'|'y'|'z',at,flip,capColor,sweep:[from,to],duration}) - slices a group of solids open (section view): the cut faces are shaded as a flat red machined section without extra geometry; sweep animates the cut; returns {plane,at(v)}
// cook.heatGlow(material,{kelvin,to,duration}) - blackbody glow for hot metal (900 dull red, 1200 orange, 1800 yellow-white); returns the material
// cook.plume({pos,dir:'-y'|'+y'|'+x'|'-x'|'+z'|'-z',radius,length,kind:'jet'|'rocket'|'flame',shocks,power,tint,parent}) - exhaust jet / rocket flame / torch with turbulence and bright shock diamonds; g.userData.power (0..1) throttles it
// cook.sparks({pos,dir,count,rate,burst,speed,spread,gravity,size,floorY,color,life}) - hot spark shower with gravity and floor bounce (grinder, welding, forge, fireworks base); returns {points,emit(n)}
// cook.flow({paths:[[[x,y,z],...]],count,trail,length,speed,color|colors|colorFn(pathIdx,u)->'#hex'|[r,g,b]|Color (e.g. cook.ramp for a temperature that rises along the path),size,opacity}) - glowing streaks travelling along curved paths (air through an engine, wind over a car, liquid in a pipe, data flow); returns {points,speed,opacity}; a NEGATIVE f.speed runs the streaks backwards (flow reversal on a fault)
// cook.machine.shell([[r,y],...],{t,kind|material,pos,rot}) - thin-walled turned shell from the OUTER profile (bell nozzle, cup, bowl, lamp shade, bottle) with wall thickness t; cook.machine.bellows({r,len,folds,amp,pos,rot}) - corrugated flexible joint along +Y; cook.pbr finish 'ribbed' = fine longitudinal ribs (cooling channels, fluted columns, grips)
// cook.callout({pos|target,title,text|value:()=>string,side:'left'|'right',dx,dy,color}) - labelled leader line that follows a point on the product: feature hotspot or LIVE readout (max 8); use 2-4 for spec-sheet / anatomy looks
// cook.explode([{obj,offset:[x,y,z]},...],{duration,hold,loop,amount}) - exploded-view animation: parts glide apart and back together; returns {set(k)} (loop:false for manual); cook.approach(current,target,tau,dt) - smooth chase of a target value, use it to drive a state (throttle, temperature) that plume power, glow, spin and flow speed all follow; cook.plume also takes spread and live g.userData.tint=[r,g,b] / g.userData.shocks
// cook.machine.loft([[x,y,z],...],{r:[r0,r1]|r,ry,rFn(u)->[a,b],radial,wall,kind|material,pos}) - closed solid swept along a curve with a changing, elliptical cross section (volute casing, horn, handle, spout, tapered pipe, tentacle; wall = hollow pipe); cook.machine.flange({od,id,t,n,bc,hole,axis,pos}) - pipe flange with real bolt holes; cook.machine.impeller({vanes,r1,r2,width,beta,t,shroud,axis,spin,pos}) - centrifugal impeller with backward-curved spiral vanes (pump, blower, turbocharger); cook.machine.lathe also takes arc:[phi0,phiLen] for a capped wedge (quarter section)
// cook.inspect([{obj,title,text,tip}]) - tap / hover a part to see a card (what it is, what to check); cook.gauge({title,min,max,value:()=>n,unit,corner:'tl'(default)|'tr'|'bl'|'br',color,digits}) - live dial in a screen corner, bottom corners sit above the beats captions (max 4); cook.beats([{t,title,sub,dur}],{loop}) - numbered story captions on a timeline (max 6); cook.shake(obj,{amp,freq}) - visible vibration, returns {amp} to drive from a state
// cook.ramp(t,stops) - colour along a ramp, t 0..1 (default cold blue -> sand -> hot orange; stops=[[0,'#hex'],[1,'#hex']]), returns a THREE.Color: temperature along a flow path, heat maps, gauges; cook.chart({title,curves:[{pts:[[x,y],...],color,dash}],x:[min,max],y:[min,max],point:()=>[x,y],trail,corner:'br'(default)|'bl'|'tl'|'tr',xlabel,ylabel}) - small live performance map with reference curves and a moving operating point with a fading trail (pump / compressor map, battery curve, response curve; max 2)
// cook.slider({label,min,max,value,unit,ends:['Idle','Take-off'],digits,color,onInput}) - touch slider at the bottom of the screen (max 2) the customer drags to change the scene (throttle, load, temperature); returns {value,get(),set(v)}: read s.value in cook.on('frame') and chase it with cook.approach so spin, plume, glow and gauges all follow; cook.hero({label,unit,max,digits,value:()=>n,state:()=>text,sub:()=>text,bad:()=>bool}) - ONE huge live number with a thin bar (top right: thrust, speed, output); cook.scaleBar({unitsPerMetre,target}) - real-size ruler that follows the zoom (top right)
// cook.modes([{label,set:(k)=>{},on}],{exclusive}) - pill buttons across the top (Explode, X-ray, Cut away, Break it): a tap eases k 0..1 into set(k), so a mode can drive cook.explode(..,{loop:false}).set, cook.xray(..,{loop:false}).set, a state variable (max 5); cook.xray(root,{color,loop,duration}) - parts fade to glass with a glowing outline of every part inside, returns {set(k)}, loops by default; cook.assemble([{obj,from,name,count}],{duration,delay,stagger,counter}) - build-up intro: parts fly in one after another with a "Building . n of N parts" caption (not together with a looping explode on the same parts); cook.shed(obj,{at,every,velocity,spin,floorY}) - a part breaks off, tumbles and bounces (returns {go(),reset()} for a Break-it button)
// cook.table(xs,ys,x) - piecewise linear lookup of a datasheet curve; cook.rk4(f,t,y,h) - one Runge-Kutta step of dy/dt=f(t,y) for an array state (spool-up, thermal mass, pendulum); cook.fmt(v,digits) - "144,712"; cook.blackbody(kelvin) - THREE.Color of a hot body (1500 orange, 2500 yellow, 6500 white); cook.mass(root,{density}) - {volume,kg} of the closed solids from their real geometry (steel 7850 by default) for honest weight readouts
// cook.post({bloom,radius,threshold,on,auto,minFps,button}) - OPTIONAL glow layer drawn in display space over the normal picture (colours and the customer's picture stay exactly as without it): only SMALL bright spots glow (the bright light minus its wide surroundings, so big bright walls, floors and skies never haze); bloom = strength (0.7), radius = blur (1), threshold = how bright a pixel must count (0.8, raise it for less glow); adds an "FX on / off" button (top right) and switches itself off when the phone is slower than minFps (24); call once after the lights, only for scenes with lamps, flames, neon, hot metal or strong highlights
// cook.fallbackScene() - calm studio with the image on a screen (used automatically if the scene code throws)
// ==== API INDEX END ====
function createCookbook(M) {
  'use strict';
  const { THREE, scene, camera, renderer } = M;
  const { num, vec3, clamp, col, rng, warn } = M.util;
  const R = M.random;
  const meta = M.image.meta;
  const imageTex = M.image.texture;
  const frameHooks = M.hooks.frame;
  const uniformsTime = M.hooks.uniformTime;
  const LIMITS = { screens: 8, particles: 4000, props: 240, lights: 8 };
  const used = { screens: 0, particles: 0, props: 0, lights: 0 };
  const cook = {}; // only used inside doc comments below

  /* ------------------------------------------------------------------ screen: the heart of the SDK (image on any surface + effects) */
  /* Effect ids. UV effects bend where the image is sampled, colour effects change the pixel. a / b are the two parameters. */
  const FX = { flipX: 1, flipY: 2, invert: 3, gray: 4, sepia: 5, ripple: 6, wave: 7, swirl: 8, mirage: 9, frost: 10, rain: 11, prism: 12, sparkle: 13, heartbeat: 14, film: 15, scanlines: 16, vignette: 17, glitch: 18, pulse: 19 };
  const FX_DEFAULT = { ripple: [1, 0], wave: [1, 0], swirl: [1, 0], mirage: [1, 0], frost: [1, 0], rain: [1, 0], prism: [1, 0], sparkle: [1, 0], heartbeat: [1, 0], film: [1, 0], scanlines: [1, 0], vignette: [0.6, 0], glitch: [1, 0], pulse: [1, 0] };
  const SCREEN_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const SCREEN_FRAG = `
    uniform sampler2D uMap; uniform float uCut; uniform float uTime, uImgAspect, uSurfAspect, uBright, uOpacity; uniform int uFit, uShape, uFxN; uniform vec3 uFx[4]; uniform vec3 uBg; uniform float uRim, uRelight, uWrap; uniform vec3 uLightDir, uLightCol, uWrapCol; uniform vec2 uTexel;
    varying vec2 vUv;
    float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      if (uShape == 1 && length(c) > 0.5) discard;                       // circle
      float disp = 0.0; float glow = 0.0; float dark = 0.0; float grainAmt = 0.0; float scan = 0.0; float leak = 0.0;
      // ---- uv effects
      for (int i = 0; i < 4; i++) { if (i >= uFxN) break;
        int id = int(uFx[i].x + 0.5); float a = uFx[i].y; float b = uFx[i].z;
        if (id == 1) uv.x = 1.0 - uv.x;
        else if (id == 2) uv.y = 1.0 - uv.y;
        else if (id == 6) { vec2 d = uv - 0.5; float r = length(d); uv += normalize(d + 1e-5) * sin(r * 26.0 - uTime * 3.0) * 0.012 * a * (1.0 - r); }
        else if (id == 7) { uv.x += sin(uv.y * 14.0 + uTime * 1.6) * 0.012 * a; uv.y += sin(uv.x * 11.0 + uTime * 1.3) * 0.010 * a; }
        else if (id == 8) { vec2 d = uv - 0.5; float r = length(d); float ang = (0.5 - r) * 3.2 * a * sin(uTime * 0.6); float s = sin(ang), co = cos(ang); uv = 0.5 + vec2(co*d.x - s*d.y, s*d.x + co*d.y); }
        else if (id == 9) { uv.x += (vn(vec2(uv.y * 24.0, uTime * 1.2)) - 0.5) * 0.02 * a * (0.4 + uv.y); uv.y += (vn(vec2(uv.x * 18.0, uTime)) - 0.5) * 0.006 * a; }
        else if (id == 10) { float clearAmt = 0.5 + 0.5 * sin(uTime * 0.35); float k = (1.0 - clearAmt) * a; uv += (vec2(vn(uv * 90.0), vn(uv * 90.0 + 7.3)) - 0.5) * 0.04 * k; dark -= 0.10 * k; }
        else if (id == 11) { vec2 g = uv * vec2(9.0, 6.0); vec2 cell = floor(g); float rnd = h21(cell); float y = fract(g.y + uTime * (0.15 + rnd * 0.25) * a + rnd * 7.0); vec2 p = fract(g) - vec2(0.5, y); float drop = smoothstep(0.22, 0.0, length(p * vec2(1.6, 0.8))); uv += p * drop * 0.05 * a; glow += drop * 0.06; }
        else if (id == 12) disp += 0.006 * a;
        else if (id == 14) { float beat = pow(0.5 + 0.5 * sin(uTime * 4.2 * (0.6 + 0.4 * a)), 6.0); uv = 0.5 + (uv - 0.5) * (1.0 - 0.025 * a * beat); }
        else if (id == 18) { float t = floor(uTime * 8.0); float row = floor(uv.y * 28.0); float on = step(0.93, h21(vec2(row, t))); uv.x += on * (h21(vec2(row, t + 3.0)) - 0.5) * 0.12 * a; disp += on * 0.012 * a; }
        else if (id == 19) { float p = 0.5 + 0.5 * sin(uTime * 2.0); uv = 0.5 + (uv - 0.5) * (1.0 - 0.03 * a * p); }
      }
      // ---- fit the image to the surface (cover = fills, contain = whole image visible)
      float r = uImgAspect / max(uSurfAspect, 1e-4); vec2 q = uv; bool outside = false;
      if (uFit == 0) { if (r > 1.0) q.x = (q.x - 0.5) / r + 0.5; else q.y = (q.y - 0.5) * r + 0.5; }
      else { if (r > 1.0) q.y = (q.y - 0.5) * r + 0.5; else q.x = (q.x - 0.5) / r + 0.5; outside = q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0; }
      vec3 rgb; float al = 1.0;
      if (outside) rgb = uBg;
      else { vec4 t0 = texture2D(uMap, q); rgb = vec3(texture2D(uMap, q + vec2(disp, 0.0)).r, t0.g, texture2D(uMap, q - vec2(disp, 0.0)).b); al = t0.a; }
      // a cut-out picture (transparent background): either keep it see-through (cutout: true) or sit it on a soft studio backdrop instead of black
      if (uCut < 0.5) rgb = mix(mix(vec3(0.86, 0.85, 0.83), vec3(0.97, 0.96, 0.94), uv.y), rgb, al);
      // ---- colour effects
      for (int i = 0; i < 4; i++) { if (i >= uFxN) break;
        int id = int(uFx[i].x + 0.5); float a = uFx[i].y; float b = uFx[i].z;
        if (id == 3) rgb = mix(rgb, 1.0 - rgb, clamp(a, 0.0, 1.0));
        else if (id == 4) rgb = mix(rgb, vec3(dot(rgb, vec3(0.299, 0.587, 0.114))), clamp(a, 0.0, 1.0));
        else if (id == 5) { float l = dot(rgb, vec3(0.299, 0.587, 0.114)); rgb = mix(rgb, vec3(l * 1.08, l * 0.86, l * 0.62), clamp(a, 0.0, 1.0)); }
        else if (id == 13) { vec2 g = uv * 38.0; vec2 cell = floor(g); float rnd = h21(cell); float tw = pow(max(0.0, sin(uTime * (1.5 + rnd * 3.0) + rnd * 30.0)), 14.0); float d = length(fract(g) - 0.5); rgb += vec3(1.0, 0.95, 0.8) * tw * smoothstep(0.28, 0.0, d) * step(0.82, rnd) * a * 1.4; }
        else if (id == 15) { float flick = 0.94 + 0.06 * sin(uTime * 37.0) * sin(uTime * 11.0); float gr = (h21(uv * 400.0 + floor(uTime * 24.0)) - 0.5) * 0.14 * a; float l = dot(rgb, vec3(0.299, 0.587, 0.114)); rgb = mix(rgb, vec3(l * 1.05, l * 0.92, l * 0.74), 0.55 * a) * flick + gr; rgb += vec3(1.0, 0.55, 0.25) * 0.14 * a * smoothstep(0.9, 0.0, distance(uv, vec2(0.5 + 0.45 * sin(uTime * 0.4), 0.5))) * 0.4; dark += 0.35 * a * pow(length(uv - 0.5) * 1.4, 2.0); }
        else if (id == 16) { float s = 0.5 + 0.5 * sin(uv.y * 520.0); rgb *= 1.0 - 0.18 * a * s; rgb += 0.015 * sin(uTime * 60.0 + uv.y * 4.0) * a; dark += 0.12 * a * pow(length(uv - 0.5) * 1.5, 2.0); }
        else if (id == 17) dark += a * pow(length(uv - 0.5) * 1.5, 2.2);
      }
      // ---- integration of a cut-out into its world: edge light (rim), light wrap and a gentle re-light that reacts to a moving light
      if (uCut > 0.5 && !outside && (uRim + uRelight + uWrap) > 0.0) {
        vec2 px = uTexel * 1.6;
        float aL = texture2D(uMap, q - vec2(px.x, 0.0)).a, aR = texture2D(uMap, q + vec2(px.x, 0.0)).a, aD = texture2D(uMap, q - vec2(0.0, px.y)).a, aU = texture2D(uMap, q + vec2(0.0, px.y)).a;
        float inner = al * (1.0 - min(min(aL, aR), min(aD, aU)));
        vec2 ag = vec2(aR - aL, aU - aD); vec2 n2 = -normalize(ag + vec2(1e-4)); float facing = clamp(dot(n2, normalize(uLightDir.xy + vec2(1e-4))) * 0.5 + 0.5, 0.0, 1.0);
        rgb += uLightCol * inner * (0.25 + 0.75 * facing * facing) * uRim * 0.9;
        rgb = mix(rgb, rgb * 0.55 + uWrapCol * 0.45, clamp(inner * uWrap, 0.0, 0.8));
        if (uRelight > 0.0) {
          vec3 w3 = vec3(0.299, 0.587, 0.114); float lL = dot(texture2D(uMap, q - vec2(px.x, 0.0)).rgb, w3), lR = dot(texture2D(uMap, q + vec2(px.x, 0.0)).rgb, w3), lD = dot(texture2D(uMap, q - vec2(0.0, px.y)).rgb, w3), lU = dot(texture2D(uMap, q + vec2(0.0, px.y)).rgb, w3);
          vec3 nn = normalize(vec3(-(lR - lL) * 1.6, -(lU - lD) * 1.6, 1.0)); vec3 L3 = normalize(uLightDir); float dif = dot(nn, L3) - L3.z;
          vec3 H = normalize(L3 + vec3(0.0, 0.0, 1.0)); float sp = pow(max(dot(nn, H), 0.0), 40.0);
          float lum = dot(rgb, w3); rgb *= 1.0 + uRelight * dif * 0.9; rgb += uLightCol * sp * uRelight * 0.18 * smoothstep(0.35, 0.9, lum) * al;
        }
      }
      rgb = rgb * (1.0 - clamp(dark, -0.3, 0.9)) + glow;
      rgb *= uBright;
      if (uCut > 0.5 && al < 0.02) discard;
      gl_FragColor = vec4(rgb, uOpacity * (uCut > 0.5 ? al : 1.0));
      #include <colorspace_fragment>
    }`;

  function normFx(list) {
    const out = [];
    (Array.isArray(list) ? list : list ? [list] : []).forEach((f) => {
      if (out.length >= 4) return;
      let id = typeof f === 'string' ? f : f && f.id; if (!FX[id]) { if (id) warn('unknown fx "' + id + '" ignored'); return; }
      const d = FX_DEFAULT[id] || [1, 0];
      out.push(new THREE.Vector3(FX[id], num(f && f.a, d[0]), num(f && f.b, d[1])));
    });
    return out;
  }
  function makeScreenMaterial(o) {
    const fxv = normFx(o.fx);
    const u = { uMap: { value: imageTex }, uTime: { value: 0 }, uImgAspect: { value: meta.screenAspect }, uSurfAspect: { value: o.surfAspect }, uBright: { value: num(o.brightness, 1) }, uOpacity: { value: 1 }, uFit: { value: o.fit === 'contain' ? 1 : 0 }, uShape: { value: o.shape === 'circle' ? 1 : 0 }, uFxN: { value: fxv.length }, uFx: { value: [0, 1, 2, 3].map((i) => fxv[i] || new THREE.Vector3()) }, uBg: { value: col(o.background, '#0b0d14') }, uCut: { value: o.cutout ? 1 : 0 }, uRim: { value: o.cutout ? num(o.rim, 0.3) : 0 }, uRelight: { value: o.cutout ? num(o.relight, 0.25) : 0 }, uWrap: { value: o.cutout ? num(o.wrap, 0.2) : 0 }, uLightDir: { value: vec3(o.lightDir, [-0.55, 0.7, 0.55]).normalize() }, uLightCol: { value: col(o.lightColor, '#fff1dc') }, uWrapCol: { value: col(o.wrapColor, '#ffd9b0') }, uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) } };
    { const im = imageTex.image; if (im && im.width) u.uTexel.value.set(1 / im.width, 1 / im.height); }
    if (o.cutout && o.lightSweep !== false) { const base = u.uLightDir.value.clone(); frameHooks.push((dt, t) => { const a = Math.sin(t * 0.35) * 0.9; u.uLightDir.value.set(base.x * Math.cos(a) - base.z * 0.2 * Math.sin(a), base.y + Math.sin(t * 0.21) * 0.12, base.z).normalize(); }); }
    uniformsTime.push(u.uTime);
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SCREEN_VERT, fragmentShader: SCREEN_FRAG, toneMapped: false, side: THREE.DoubleSide, transparent: true });
    return m;
  }
  const addTo = (parent, obj, o) => { obj.position.copy(vec3(o && o.pos, [0, 0, 0])); const r = vec3(o && o.rot, [0, 0, 0]); obj.rotation.set(r.x, r.y, r.z); (parent || scene).add(obj); return obj; };

  /**
   * cook.screen({ width, height?, pos, rot, fit, fx, shape, bezel, glow, brightness, name })
   *   Draws the product / scene image on a flat surface. height omitted (or 'auto') = follows the image aspect, so nothing is stretched.
   *   fit: 'cover' (fills the surface, may crop)  |  'contain' (whole image visible, letterboxed)   default: 'contain' when height is omitted, else 'cover'
   *   fx : ['flipX', 'invert', {id:'ripple', a:1.2}]  up to 4 of: flipX flipY invert gray sepia ripple wave swirl mirage frost rain prism sparkle heartbeat film scanlines vignette glitch pulse
   *   shape: 'rect' | 'circle'
   *   bezel: { color, thickness, depth } or false | 'wood' 'gold' 'black' 'white' presets.   glow: 0..2 = light the image casts on its surroundings.
   *   Returns { group, mesh, setFx(list), setBrightness(v) }.
   */
  function screen(o) {
    o = o || {};
    // A product CUT-OUT (transparent PNG) shown by a plain cook.screen() is always see-through: with cutout:false it became a grey rectangle in a black bezel (a "TV").
    // frame / tv / portal pass _via, they keep their backdrop and bezel on purpose. A direct screen() has no bezel unless one is asked for.
    if (meta.cutoutImage && !o._via && o.cutout !== true) { if (o.cutout === false) warn('screen(): the picture is a cut-out, cutout:false ignored (use cook.frame / cook.tv for a framed picture)'); o = { ...o, cutout: true }; }
    if (!o._via && o.bezel == null) o = { ...o, bezel: false };
    if (o.cutout) o = { ...o, bezel: false, glow: 0 };   // a see-through product has no bezel or glow box
    if (used.screens >= LIMITS.screens) { warn('screen limit reached'); return null; }
    used.screens++;
    const w = clamp(num(o.width, 2), 0.05, 40);
    const auto = o.height == null || o.height === 'auto';
    const h = auto ? w / (o.shape === 'circle' ? 1 : clamp(meta.screenAspect, 0.2, 5)) : clamp(num(o.height, 1), 0.05, 40);
    const group = new THREE.Group();
    const mat = makeScreenMaterial({ ...o, surfAspect: w / h, fit: o.fit || (auto ? 'cover' : 'contain') });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.name = o.name || 'screen'; group.add(mesh);
    const bz = bezelStyle(o.bezel);
    if (bz && o.shape !== 'circle') {
      const t = bz.thickness, d = bz.depth, bm = new THREE.MeshStandardMaterial({ color: bz.color, roughness: bz.rough, metalness: bz.metal });
      [[w + 2 * t, t, 0, (h + t) / 2], [w + 2 * t, t, 0, -(h + t) / 2], [t, h, (w + t) / 2, 0], [t, h, -(w + t) / 2, 0]].forEach((p) => { const b = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], d), bm); b.position.set(p[2], p[3], -d / 2 + 0.002); b.castShadow = true; group.add(b); });
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * t, h + 2 * t, 0.02), new THREE.MeshStandardMaterial({ color: bz.color, roughness: 0.9 })); back.position.z = -d - 0.01; group.add(back);
    } else if (o.shape === 'circle' && bz) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + bz.thickness / 2, bz.thickness / 2, 16, 72), new THREE.MeshStandardMaterial({ color: bz.color, roughness: bz.rough, metalness: bz.metal })); group.add(ring);
    }
    const g = num(o.glow, 0);
    if (g > 0 && used.lights < LIMITS.lights) { used.lights++; const l = new THREE.PointLight(col(meta.avgColor), 1.5 * g, Math.max(w, h) * 4, 1.6); l.position.set(0, 0, Math.max(w, h) * 0.5); group.add(l); }
    addTo(o.parent, group, o);
    if (o.billboard) { const lim = num(o.billboardLimit, 0.7); frameHooks.push(() => { const gp = group.getWorldPosition(new THREE.Vector3()); const ang = Math.atan2(camera.position.x - gp.x, camera.position.z - gp.z); group.rotation.y = clamp(ang, -lim, lim) + num(group.userData.yawOffset, 0); }); }
    return { group, mesh, setFx: (f) => { const v = normFx(f); mat.uniforms.uFxN.value = v.length; mat.uniforms.uFx.value = [0, 1, 2, 3].map((i) => v[i] || new THREE.Vector3()); }, setBrightness: (b) => { mat.uniforms.uBright.value = num(b, 1); } };
  }
  function bezelStyle(b) {
    if (b === false || b === 'none') return null;
    const P = { wood: ['#7a4e2d', 0.7, 0.05], gold: ['#c9a24a', 0.35, 0.9], black: ['#15171c', 0.5, 0.2], white: ['#f3f1ec', 0.6, 0.05], silver: ['#b9bec7', 0.3, 0.9] };
    if (typeof b === 'string' && P[b]) return { color: P[b][0], rough: P[b][1], metal: P[b][2], thickness: 0.08, depth: 0.08 };
    if (b && typeof b === 'object') return { color: col(b.color, '#15171c'), rough: 0.55, metal: num(b.metal, 0.2), thickness: clamp(num(b.thickness, 0.08), 0.005, 1), depth: clamp(num(b.depth, 0.08), 0.005, 1) };
    return { color: '#15171c', rough: 0.5, metal: 0.2, thickness: 0.06, depth: 0.06 };
  }

  /** cook.frame({ width, pos, rot, style:'wood'|'gold'|'black'|'white'|'none', mat:true, fx }) : a framed picture (painting, poster). `mat` adds a white passe-partout. */
  function frame(o) {
    o = o || {};
    const f = screen({ ...o, _via: true, bezel: o.style || 'wood', fit: o.fit || 'cover', height: o.height == null ? 'auto' : o.height, glow: o.glow });
    if (f && o.mat) { const w = num(o.width, 2); f.mesh.scale.set(0.86, 0.86, 1); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / Math.max(0.2, meta.screenAspect)), new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 1 })); m.position.z = -0.004; f.group.add(m); }
    return f;
  }

  /** cook.tv({ width, pos, rot, fx, stand:true }) : a flat TV with a stand showing the image, slight screen glow. */
  function tv(o) {
    o = o || {};
    const w = clamp(num(o.width, 1.6), 0.2, 12);
    const s = screen({ ...o, _via: true, width: w, height: o.height == null ? w * 9 / 16 : o.height, fit: o.fit || 'contain', bezel: o.bezel || { color: '#0c0d11', thickness: 0.04, depth: 0.05, metal: 0.4 }, glow: o.glow == null ? 0.8 : o.glow, fx: (o.fx || []).concat(o.crt ? ['scanlines'] : []) });
    if (s && o.stand !== false) { const h = w * 9 / 16; const m = new THREE.MeshStandardMaterial({ color: '#15171c', metalness: 0.5, roughness: 0.4 }); const neck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.06), m); neck.position.set(0, -h / 2 - 0.13, -0.05); const foot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.03, 0.22), m); foot.position.set(0, -h / 2 - 0.23, -0.02); foot.castShadow = true; s.group.add(neck, foot); }
    return s;
  }

  /** cook.portal({ pos, radius, fx:['swirl'], ring:'#ff9bd8', sparkles:true }) : a round glowing gateway showing the image. */
  function portal(o) {
    o = o || {};
    const r = clamp(num(o.radius, 1.1), 0.1, 10);
    const s = screen({ ...o, _via: true, width: r * 2, height: r * 2, shape: 'circle', fit: o.fit || 'cover', fx: o.fx || ['swirl'], bezel: false });
    if (!s) return null;
    const c = col(o.ring, '#b58cff');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.07, 20, 96), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); s.group.add(ring);
    const halo = new THREE.Mesh(new THREE.RingGeometry(r + 0.1, r + 0.55, 96, 1), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uC: { value: c }, uTime: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform vec3 uC; uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.2) * (0.75 + 0.25 * sin(uTime * 2.0)); gl_FragColor = vec4(uC * a, a); }' }));
    uniformsTime.push(halo.material.uniforms.uTime); halo.position.z = -0.01; s.group.add(halo);
    if (o.sparkles !== false) particles({ kind: 'sparkles', count: 120, area: [r * 2.2, r * 2.2, 0.8], pos: [0, 0, 0.1], parent: s.group, color: c });
    return s;
  }

  /* ------------------------------------------------------------------ lights / sky / fog / look */
  /** cook.lights({ preset:'warm'|'cool'|'studio'|'sunset'|'night'|'neon', intensity, shadows:true, pos }) */
  const LIGHTS = { hemi: null, sun: null, dimmed: false };
  function lights(o) {
    o = o || {}; const P = { warm: ['#fff1dc', '#e8a86a', '#f4e2c8', 1.1], cool: ['#e3f0ff', '#8fb0d8', '#dbe8ff', 1.0], studio: ['#ffffff', '#c8ccd6', '#ffffff', 1.2], sunset: ['#ffd1a6', '#b0608a', '#ff9d6b', 1.2], night: ['#6f86c8', '#1c2140', '#9db4ff', 0.6], neon: ['#ff4fd8', '#2b6bff', '#bda8ff', 0.9] };
    const p = P[o.preset] || P.warm, k = num(o.intensity, 1);
    const hemi = new THREE.HemisphereLight(col(p[0]), col(p[1]), 0.8 * k); scene.add(hemi);
    const sun = new THREE.DirectionalLight(col(p[2]), p[3] * k * 1.6);
    const sp = vec3(o.pos, [4, 6, 4]); sun.position.copy(sp);
    if (o.shadows !== false) { sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); const c = sun.shadow.camera; const A = clamp(num(o.shadowArea, 8), 4, 120); sun.shadow.mapSize.set(num(o.shadowSize, 1024), num(o.shadowSize, 1024)); c.left = -A; c.right = A; c.top = A; c.bottom = -A; c.near = 0.5; c.far = Math.max(30, A * 4); sun.shadow.bias = -0.0004; }
    scene.add(sun); used.lights += 2; LIGHTS.hemi = hemi; LIGHTS.sun = sun; return { hemi, sun };
  }
  /** cook.sky({ preset:'day'|'sunset'|'night'|'dawn'|'space'|'underwater'|'studio', top, bottom, stars }) gradient dome + matching fog. */
  function sky(o) {
    o = o || {}; const P = { day: ['#4a90e2', '#cfe8ff'], sunset: ['#3b2a73', '#ff9d6b'], night: ['#050816', '#1a2347'], dawn: ['#6d7fcc', '#ffc6a8'], space: ['#000004', '#120a2e'], underwater: ['#052a4a', '#1aa3b8'], studio: ['#e9ebf2', '#ffffff'] };
    const p = P[o.preset] || P.day; const top = col(o.top, p[0]), bot = col(o.bottom, p[1]);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uT: { value: top }, uB: { value: bot } }, vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform vec3 uT, uB; varying vec3 vP; void main(){ float t = smoothstep(-0.1, 0.8, vP.y); gl_FragColor = vec4(mix(uB, uT, t), 1.0);\n#include <colorspace_fragment>\n }' }));
    dome.renderOrder = -10; scene.add(dome); scene.background = bot.clone();
    if (o.fog !== false) scene.fog = new THREE.Fog(bot.clone(), num(o.fogNear, 20), num(o.fogFar, 120));
    if (o.stars || o.preset === 'night' || o.preset === 'space') particles({ kind: 'stars', count: 700, area: [160, 70, 160], pos: [0, 60, 0] });
    return dome;
  }
  /** cook.fog({ color, near, far }) */
  function fog(o) { o = o || {}; scene.fog = new THREE.Fog(col(o.color, '#10131c'), num(o.near, 6), num(o.far, 40)); }
  /* ---- auto exposure: like a camera's light meter. cook.look() turns it on: every ~1.2 s the scene is rendered at 40 px wide into a half-float target, the mean DISPLAY brightness
     (ACES + sRGB, same maths as the renderer) is measured and the exposure is nudged so the picture sits at the look's target brightness. Washed-out and too-dark scenes fix themselves. */
  const EXP = { on: false, base: 1, mul: 1, goal: 1, intro: 1, captured: false, target: 0.46, lo: 0.2, hi: 1.3, next: 0.1, n: 0, dead: false, rt: null, buf: null, hooked: false, last: 0 };
  const applyExp = () => { renderer.toneMappingExposure = EXP.base * EXP.mul * EXP.intro; };
  const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]], ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
  const acesFit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  function displayLuma(r, g, b, ex) {
    r *= ex / 0.6; g *= ex / 0.6; b *= ex / 0.6; const a = ACES_IN.map((m) => acesFit(Math.max(0, m[0] * r + m[1] * g + m[2] * b))); const o = ACES_OUT.map((m) => Math.min(1, Math.max(0, m[0] * a[0] + m[1] * a[1] + m[2] * a[2])));
    const e = (x) => Math.pow(x, 1 / 2.2); return 0.2126 * e(o[0]) + 0.7152 * e(o[1]) + 0.0722 * e(o[2]);
  }
  function measureBrightness() {
    const asp = camera.aspect || 0.5, w = 40, h = Math.max(16, Math.min(160, Math.round(w / asp)));
    if (!EXP.rt || EXP.rt.height !== h) { if (EXP.rt) EXP.rt.dispose(); EXP.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }); EXP.buf = new Uint16Array(w * h * 4); }
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    try { renderer.setRenderTarget(EXP.rt); renderer.render(scene, camera); renderer.readRenderTargetPixels(EXP.rt, 0, 0, w, h, EXP.buf); } finally { renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = prevAuto; }
    const D = THREE.DataUtils, ex = EXP.base * EXP.mul; let s = 0; for (let i = 0; i < w * h; i++) s += displayLuma(D.fromHalfFloat(EXP.buf[i * 4]), D.fromHalfFloat(EXP.buf[i * 4 + 1]), D.fromHalfFloat(EXP.buf[i * 4 + 2]), ex);
    return s / (w * h);
  }
  function startAutoExposure() {
    if (EXP.hooked) return; EXP.hooked = true;
    frameHooks.push((dt, t) => {
      if (!EXP.captured) { EXP.base = renderer.toneMappingExposure || 1; EXP.captured = true; }
      const quick = EXP.n < 6; if (EXP.on && !EXP.dead && t > EXP.next) { EXP.next = t + (quick ? 0.2 : 1.2); EXP.n++; try { const m = EXP.last = measureBrightness(); const ratio = EXP.target / Math.max(0.04, m); if (Math.abs(ratio - 1) > 0.05) EXP.goal = clamp(EXP.mul * Math.pow(ratio, 0.75), EXP.lo, EXP.hi); if (quick) EXP.mul = EXP.goal; } catch (e) { EXP.dead = true; warn('auto exposure off: ' + e.message); } }
      EXP.mul += (EXP.goal - EXP.mul) * Math.min(1, dt * 1.6); applyExp();
    });
  }
  /** cook.look('cinematic'|'dreamy'|'crisp'|'vintage'|'noir'|'neon') : exposure + a CSS vignette / tint overlay (cheap, no post-processing pass). */
  function look(name, opt) {
    const L = { cinematic: [1.0, 0.45, 'none'], dreamy: [1.12, 0.3, 'sepia(.12) saturate(1.15) blur(0px)'], crisp: [0.98, 0.2, 'contrast(1.06) saturate(1.1)'], vintage: [1.0, 0.6, 'sepia(.35) contrast(1.05)'], noir: [0.95, 0.6, 'grayscale(1) contrast(1.15)'], neon: [1.05, 0.5, 'saturate(1.35) contrast(1.05)'] };
    const l = L[name] || L.cinematic; renderer.toneMappingExposure = l[0]; { const T = { cinematic: 0.38, dreamy: 0.52, crisp: 0.46, vintage: 0.4, noir: 0.3, neon: 0.34 }; EXP.target = clamp(num(opt && opt.target, T[name] != null ? T[name] : 0.42), 0.15, 0.8); if (opt && Array.isArray(opt.exposureRange)) { EXP.lo = clamp(num(opt.exposureRange[0], 0.2), 0.1, 1); EXP.hi = clamp(num(opt.exposureRange[1], 1.25), 1, 2.5); } EXP.on = !(opt && opt.autoExposure === false); EXP.captured = false; EXP.mul = EXP.goal = 1; if (EXP.on) startAutoExposure(); }
    let v = document.getElementById('magic-look'); if (!v) { v = document.createElement('div'); v.id = 'magic-look'; v.style.cssText = 'position:fixed;inset:0;pointer-events:none'; document.body.appendChild(v); }
    v.style.background = 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,' + l[1] + ') 100%)'; renderer.domElement.style.filter = l[2];
    const ga = opt && typeof opt.grain === 'number' ? opt.grain : 0.05; let gr = document.getElementById('magic-grain'); if (ga > 0) { if (!gr) { gr = document.createElement('div'); gr.id = 'magic-grain'; document.body.appendChild(gr); let k = 0; frameHooks.push(() => { if (++k % 3 === 0) gr.style.backgroundPosition = Math.floor(R.next() * 160) + 'px ' + Math.floor(R.next() * 160) + 'px'; }); } gr.style.cssText = "position:fixed;inset:0;pointer-events:none;mix-blend-mode:overlay;opacity:" + clamp(ga * 6, 0, 0.6) + ";background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"; } else if (gr) gr.remove();
  }

  /* ------------------------------------------------------------------ places */
  const stdMat = (c, r, m) => new THREE.MeshStandardMaterial({ color: col(c, '#cccccc'), roughness: num(r, 0.8), metalness: num(m, 0) });
  function shadowed(m) { m.castShadow = true; m.receiveShadow = true; used.props++; return m; }
  function canvasTex(draw, repeat) { const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d'), 256); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) t.repeat.set(repeat[0], repeat[1]); return t; }
  function floorTex(style, base, rp) {
    const b = col(base, '#b98b5e'); const hex = '#' + b.getHexString(); const rr = rng('floor' + style);
    return canvasTex((g, s) => {
      g.fillStyle = hex; g.fillRect(0, 0, s, s);
      if (style === 'tile') { g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.strokeRect(0, 0, s, s); g.strokeRect(s / 2, 0, 0.1, s); }
      else if (style === 'carpet') { for (let i = 0; i < 2500; i++) { g.fillStyle = 'rgba(' + (rr.next() < .5 ? '255,255,255' : '0,0,0') + ',.05)'; g.fillRect(rr.range(0, s), rr.range(0, s), 2, 2); } }
      else { for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.04 + rr.next() * 0.08) + ')'; g.fillRect(0, i * 64, s, 64); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, i * 64, s, 2); g.fillRect(rr.range(0, s), i * 64, 2, 64); } for (let i = 0; i < 120; i++) { g.strokeStyle = 'rgba(60,30,10,' + rr.range(0.03, 0.09) + ')'; g.beginPath(); const y = rr.range(0, s); g.moveTo(0, y); g.lineTo(s, y + rr.range(-3, 3)); g.stroke(); } }
    }, rp);
  }
  /** cook.room({ width, depth, height, wall, floor, floorStyle:'wood'|'tile'|'carpet', ceiling:true, wallBack:true, openFront:true }) : floor + 3 walls (the 4th side is open for the camera). */
  function room(o) {
    o = o || {}; const W = clamp(num(o.width, 8), 2, 60), D = clamp(num(o.depth, 8), 2, 60), H = clamp(num(o.height, 3.2), 1.5, 20); const g = new THREE.Group();
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex(o.floorStyle || 'wood', o.floor, [W / 2, D / 2]), roughness: 0.65 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; g.add(fl);
    const wm = stdMat(o.wall || '#e9e2d6', 0.95);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wm); back.position.set(0, H / 2, -D / 2); back.receiveShadow = true; g.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wm); left.rotation.y = Math.PI / 2; left.position.set(-W / 2, H / 2, 0); left.receiveShadow = true; g.add(left);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wm); right.rotation.y = -Math.PI / 2; right.position.set(W / 2, H / 2, 0); right.receiveShadow = true; g.add(right);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.03), stdMat('#ffffff', 0.7)); skirt.position.set(0, 0.06, -D / 2 + 0.02); g.add(skirt);
    if (o.ceiling) { const c = new THREE.Mesh(new THREE.PlaneGeometry(W, D), stdMat('#f6f3ee', 1)); c.rotation.x = Math.PI / 2; c.position.y = H; g.add(c); }
    scene.add(g); return { group: g, width: W, depth: D, height: H, backZ: -D / 2 };
  }
  /** cook.ground({ size, color, style:'grass'|'sand'|'snow'|'stone'|'plain', y }) */
  function ground(o) {
    o = o || {}; const P = { grass: '#5f9a4e', sand: '#e0c68c', snow: '#f1f5fb', stone: '#8d8f96', plain: '#cfd3dc' }; const s = clamp(num(o.size, 80), 4, 400);
    const m = new THREE.Mesh(new THREE.CircleGeometry(s / 2, 64), stdMat(o.color || P[o.style] || P.plain, 0.95)); m.rotation.x = -Math.PI / 2; m.position.y = num(o.y, 0); m.receiveShadow = true; patchGround(m); scene.add(m); return m;
  }
  /** cook.water({ y, size, color, depthColor, waves:0..2, opacity }) animated, lit-looking water surface (also usable as the "sea" in an underwater / harbour scene). */
  function water(o) {
    o = o || {}; const s = clamp(num(o.size, 120), 4, 500);
    const u = { uTime: { value: 0 }, uC: { value: col(o.color, '#2aa6c9') }, uD: { value: col(o.depthColor, '#0a3d62') }, uW: { value: clamp(num(o.waves, 1), 0, 2.5) }, uO: { value: clamp(num(o.opacity, 0.9), 0.1, 1) } }; uniformsTime.push(u.uTime);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s, 96, 96), new THREE.ShaderMaterial({ uniforms: u, transparent: true, side: THREE.DoubleSide, fog: false, vertexShader: 'uniform float uTime, uW; varying vec3 vW; varying float vH; void main(){ vec3 p = position; float h = (sin(p.x*0.35+uTime*0.9) + sin(p.y*0.43+uTime*1.1) + 0.5*sin((p.x+p.y)*0.9+uTime*1.7)) * 0.07 * uW; p.z += h; vH = h; vec4 w = modelMatrix*vec4(p,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }', fragmentShader: 'uniform vec3 uC, uD; uniform float uO, uTime; varying vec3 vW; varying float vH; void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0); float c = pow(0.5 + 0.5*sin(vW.x*3.0+uTime) * sin(vW.z*3.3-uTime*1.2), 6.0) * 0.25; vec3 col = mix(uD, uC, 0.5 + vH * 3.0) + f * 0.35 + c; gl_FragColor = vec4(col, uO);\n#include <colorspace_fragment>\n }' }));
    m.rotation.x = -Math.PI / 2; m.position.y = num(o.y, 0); scene.add(m); return m;
  }

  /* ------------------------------------------------------------------ props (primitive furniture, cheap and always valid) */
  const P3 = (o) => vec3(o && o.pos, [0, 0, 0]);
  function place(g, o) { g.position.copy(P3(o)); g.rotation.y = num(o && o.rotY, 0); const s = num(o && o.scale, 1); g.scale.setScalar(s); (o && o.parent || scene).add(g); return g; }
  const prop = {
    box: (o) => { o = o || {}; const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(num(o.w, 1), num(o.h, 1), num(o.d, 1)), stdMat(o.color, o.rough, o.metal))); m.position.copy(P3(o)); m.rotation.y = num(o.rotY, 0); scene.add(m); return m; },
    cylinder: (o) => { o = o || {}; const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(num(o.rTop, o.r || 0.5), num(o.rBottom, o.r || 0.5), num(o.h, 1), 40), stdMat(o.color, o.rough, o.metal))); m.position.copy(P3(o)); scene.add(m); return m; },
    sphere: (o) => { o = o || {}; const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(num(o.r, 0.5), 32, 20), stdMat(o.color, o.rough, o.metal))); m.position.copy(P3(o)); scene.add(m); return m; },
    table: (o) => { o = o || {}; const w = num(o.w, 1.6), d = num(o.d, 0.9), h = num(o.h, 0.75), g = new THREE.Group(); const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), stdMat(o.color || '#8a5a35', 0.55))); top.position.y = h; g.add(top); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((s) => { const l = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.07), stdMat(o.color || '#6e4527', 0.6))); l.position.set(s[0] * (w / 2 - 0.08), h / 2, s[1] * (d / 2 - 0.08)); g.add(l); }); return place(g, o); },
    pedestal: (o) => { o = o || {}; const g = new THREE.Group(); const h = num(o.h, 1), r = num(o.r, 0.45); const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 48), stdMat(o.color || '#ece9e2', 0.4))); b.position.y = h / 2; g.add(b); const t = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.05, 48), stdMat(o.color || '#ece9e2', 0.35))); t.position.y = h + 0.025; g.add(t); return place(g, o); },
    sofa: (o) => { o = o || {}; const w = num(o.w, 2.2), c = o.color || '#6c7a96', g = new THREE.Group(); const seat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, 0.95), stdMat(c, 0.95))); seat.position.y = 0.3; g.add(seat); const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 0.25), stdMat(c, 0.95))); back.position.set(0, 0.7, -0.35); g.add(back); [-1, 1].forEach((s) => { const a = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.95), stdMat(c, 0.95))); a.position.set(s * (w / 2 - 0.11), 0.48, 0); g.add(a); }); return place(g, o); },
    plant: (o) => { o = o || {}; const g = new THREE.Group(); const pot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 24), stdMat('#b5683f', 0.8))); pot.position.y = 0.15; g.add(pot); const r2 = rng(o.seed || 'plant'); for (let i = 0; i < 9; i++) { const l = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), stdMat(o.color || '#3f8f4f', 0.8))); l.scale.set(0.7, 1.7, 0.4); const a = i / 9 * Math.PI * 2; l.position.set(Math.cos(a) * 0.14, 0.55 + r2.next() * 0.25, Math.sin(a) * 0.14); l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5); g.add(l); } return place(g, o); },
    lamp: (o) => { o = o || {}; const g = new THREE.Group(); const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 24), stdMat('#2a2a30', 0.4, 0.5))); g.add(base); const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, num(o.h, 1.5), 8), stdMat('#2a2a30', 0.4, 0.5))); pole.position.y = num(o.h, 1.5) / 2; g.add(pole); const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.26, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#fff0d0', emissive: col(o.color, '#ffcf8a'), emissiveIntensity: 0.9, side: THREE.DoubleSide })); sh.position.y = num(o.h, 1.5); g.add(sh); if (used.lights < LIMITS.lights && o.light !== false) { used.lights++; const pl = new THREE.PointLight(col(o.color, '#ffcf8a'), 8 * num(o.intensity, 1), 7, 1.8); pl.position.y = num(o.h, 1.5) - 0.05; g.add(pl); } return place(g, o); },
    rug: (o) => { o = o || {}; const m = new THREE.Mesh(new THREE.CircleGeometry(num(o.r, 1.4), 48), stdMat(o.color || '#a65d6d', 1)); m.rotation.x = -Math.PI / 2; m.position.copy(P3(o)); m.position.y += 0.012; m.receiveShadow = true; scene.add(m); return m; },
    shelf: (o) => { o = o || {}; const w = num(o.w, 1.4), h = num(o.h, 2), g = new THREE.Group(); const c = o.color || '#7a5233'; [-1, 1].forEach((s) => { const side = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.32), stdMat(c, 0.7))); side.position.set(s * w / 2, h / 2, 0); g.add(side); }); const n = num(o.shelves, 4), r3 = rng(o.seed || 'shelf'); for (let i = 0; i <= n; i++) { const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.32), stdMat(c, 0.7))); b.position.y = i * h / n; g.add(b); if (i < n) { let x = -w / 2 + 0.1; while (x < w / 2 - 0.15) { const bw = r3.range(0.04, 0.09), bh = r3.range(0.18, h / n - 0.08); const bk = shadowed(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.2), stdMat(['#a33', '#357', '#385', '#c92', '#555', '#8a5'][r3.int(0, 5)], 0.9))); bk.position.set(x + bw / 2, i * h / n + 0.015 + bh / 2, 0); g.add(bk); x += bw + 0.012; } } } return place(g, o); },
    window: (o) => { o = o || {}; const w = num(o.w, 1.6), h = num(o.h, 1.3), g = new THREE.Group(); const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col(o.color, '#bfe4ff'), toneMapped: false })); g.add(glass); const fr = stdMat('#f4f1ea', 0.6); [[w + 0.1, 0.05, 0, h / 2], [w + 0.1, 0.05, 0, -h / 2], [0.05, h, w / 2, 0], [0.05, h, -w / 2, 0], [0.03, h, 0, 0], [w, 0.03, 0, 0]].forEach((p) => { const b = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], 0.06), fr); b.position.set(p[2], p[3], 0.01); g.add(b); }); return place(g, o); },
  };

  /* ------------------------------------------------------------------ particles */
  /** cook.particles({ kind:'dust'|'sparkles'|'snow'|'petals'|'bubbles'|'fireflies'|'rain'|'stars', count, area:[x,y,z], pos, color, size, speed, parent }) */
  function particles(o) {
    o = o || {}; const kind = o.kind || 'dust'; const want = clamp(Math.floor(num(o.count, 300)), 1, 3000); const n = Math.min(want, LIMITS.particles - used.particles); if (n <= 0) { warn('particle limit reached'); return null; } used.particles += n;
    const K = { dust: ['#fff4dc', 0.03, 0.05, 0.4], sparkles: ['#ffe9a8', 0.05, 0.25, 1.0], snow: ['#ffffff', 0.05, -0.6, 0.5], petals: ['#ffb3c7', 0.09, -0.35, 0.6], bubbles: ['#cfefff', 0.07, 0.45, 0.5], fireflies: ['#d6ff7a', 0.06, 0.0, 0.8], rain: ['#bcd7ff', 0.03, -9, 0.05], stars: ['#ffffff', 0.35, 0, 0.0] };
    const k = K[kind] || K.dust; const area = vec3(o.area, [10, 6, 10]); const rr = rng((o.seed || 'p') + kind);
    const pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rr.next() - 0.5) * area.x; pos[i * 3 + 1] = (rr.next() - 0.5) * area.y; pos[i * 3 + 2] = (rr.next() - 0.5) * area.z; ph[i] = rr.next() * 6.283; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
    const u = { uTime: { value: 0 }, uC: { value: col(o.color, k[0]) }, uS: { value: num(o.size, k[1]) * 300 }, uV: { value: num(o.speed, 1) * k[2] }, uH: { value: area.y }, uSw: { value: k[3] }, uTw: { value: kind === 'sparkles' || kind === 'stars' || kind === 'fireflies' ? 1 : 0 } }; uniformsTime.push(u.uTime);
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexShader: 'attribute float ph; uniform float uTime, uS, uV, uH, uSw, uTw; varying float vA; void main(){ vec3 p = position; p.y = mod(p.y + uH * 0.5 + uV * uTime, uH) - uH * 0.5; p.x += sin(uTime * 0.6 + ph) * uSw * 0.4; p.z += cos(uTime * 0.5 + ph * 1.7) * uSw * 0.4; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uS / max(0.5, -mv.z) * (0.7 + 0.3 * sin(ph)); vA = mix(1.0, 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.2 + ph * 5.0), 3.0), uTw); }', fragmentShader: 'uniform vec3 uC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(uC, a * vA * 0.9);\n#include <colorspace_fragment>\n }' }));
    m.frustumCulled = false; m.position.copy(P3(o)); (o.parent || scene).add(m); return m;
  }

  /* ------------------------------------------------------------------ animation helpers */
  const EASE = { linear: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.094) + 1) };
  /** cook.animate(obj, { spin:[x,y,z] rad/s, bob:{amp,speed}, sway:{amp,speed}, pulse:{amp,speed} }) : loops that run for ever. */
  function animate(obj, o) {
    if (!obj) return; o = o || {}; const base = obj.position.clone(), s0 = obj.scale.clone(), r0 = obj.rotation.clone(); const ph = R.next() * 6.283;
    frameHooks.push((dt, t) => { if (o.spin) { const s = o.spin; obj.rotation.x += num(s[0], 0) * dt; obj.rotation.y += num(s[1], 0) * dt; obj.rotation.z += num(s[2], 0) * dt; } if (o.bob) obj.position.y = base.y + Math.sin(t * num(o.bob.speed, 1) + ph) * num(o.bob.amp, 0.1); if (o.sway) obj.rotation.z = r0.z + Math.sin(t * num(o.sway.speed, 1) + ph) * num(o.sway.amp, 0.05); if (o.pulse) obj.scale.copy(s0).multiplyScalar(1 + Math.sin(t * num(o.pulse.speed, 2)) * num(o.pulse.amp, 0.05)); });
  }
  /** cook.tween(obj, { 'position.y': 2, 'rotation.y': 3 }, { duration, delay, ease, loop, yoyo }) */
  function tween(obj, props, o) {
    if (!obj || !props) return; o = o || {};
    const get = (path) => path.split('.').reduce((x, k) => (x ? x[k] : undefined), obj);
    const set = (path, v) => { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((x, k) => (x ? x[k] : undefined), obj); if (t) t[last] = v; };
    const keys = Object.keys(props), from = {}; keys.forEach((k) => { from[k] = get(k); });
    const dur = Math.max(0.01, num(o.duration, 1)), ease = EASE[o.ease] || EASE.inOut; let t = -num(o.delay, 0), dir = 1;
    frameHooks.push((dt) => {
      t += dt * dir; if (t < 0) return;
      const e = ease(clamp(t / dur, 0, 1)); keys.forEach((k) => set(k, from[k] + (props[k] - from[k]) * e));
      if (dir > 0 && t >= dur) { if (o.yoyo) dir = -1; else if (o.loop) t = 0; else return 'done'; }
      else if (dir < 0 && t <= 0) { dir = 1; if (!o.loop) return 'done'; }
    });
  }
  function on(ev, fn) { if (ev === 'frame' && typeof fn === 'function') frameHooks.push(fn); }


  /* ------------------------------------------------------------------ camera (reads the finger input the shell collects in M.input) */
  const rig = { mode: 'orbit', target: new THREE.Vector3(0, 1, 0), radius: 5, height: 1.6, azim: 0, elev: 0.15, auto: 0.08, sway: 0, user: true, pathPos: null, pathTgt: null, pathT: 0, pathDur: 20, pathLoop: true, fixedPos: null };
  const setFov = (o) => { if (o && o.fov) { camera.fov = clamp(num(o.fov, 45), 15, 100); camera.updateProjectionMatrix(); } };
  const cam = {
    set: (o) => { o = o || {}; rig.mode = 'fixed'; camera.position.copy(vec3(o.pos, [0, 1.6, 5])); rig.target.copy(vec3(o.target, [0, 1, 0])); setFov(o); rig.fixedPos = camera.position.clone(); rig.user = o.user !== false; },
    orbit: (o) => { o = o || {}; rig.mode = 'orbit'; rig.target.copy(vec3(o.target, [0, 1, 0])); rig.radius = clamp(num(o.radius, 5), 0.5, 80); rig.height = num(o.height, 1.6); rig.auto = num(o.speed, 0.08); rig.user = o.user !== false; rig.sway = num(o.sway, 0); rig.azim = num(o.azimuth, 0); setFov(o); },
    path: (pts, o) => { o = o || {}; if (!Array.isArray(pts) || pts.length < 2) return; rig.mode = 'path'; rig.pathPos = new THREE.CatmullRomCurve3(pts.map((p) => vec3(p.pos, [0, 1.6, 5])), !!o.closed); rig.pathTgt = new THREE.CatmullRomCurve3(pts.map((p) => vec3(p.target, [0, 1, 0])), !!o.closed); rig.pathDur = clamp(num(o.duration, 20), 3, 300); rig.pathLoop = o.loop !== false; rig.pathT = 0; rig.user = o.user !== false; rig.intro = clamp(num(o.intro, 0), 0, 8); rig.introOff = vec3(o.introOffset, [0, 1.2, 3]); setFov(o); },
  };
  M.hooks.camera = (dt, t) => {
    const yaw = rig.user ? M.input.yaw : 0, pitch = rig.user ? M.input.pitch : 0, zoom = rig.user ? M.input.zoom : 1;
    if (rig.mode === 'orbit') {
      rig.azim += rig.auto * dt;
      const az = rig.azim + yaw + Math.sin(t * 0.3) * rig.sway, el = rig.elev + pitch;
      const R0 = rig.radius * zoom * Math.max(1, 0.95 / camera.aspect); // portrait phones: pull back so the width still fits
      camera.position.set(rig.target.x + Math.sin(az) * R0 * Math.cos(el), rig.height + Math.sin(el) * R0 * 0.6, rig.target.z + Math.cos(az) * R0 * Math.cos(el));
      camera.lookAt(rig.target);
    } else if (rig.mode === 'path' && rig.pathPos) {
      rig.pathT += dt / rig.pathDur; if (rig.pathT > 1) rig.pathT = rig.pathLoop ? rig.pathT % 1 : 1;
      camera.position.copy(rig.pathPos.getPoint(rig.pathT)); camera.position.x += yaw * 0.5; if (rig.intro > 0 && t < rig.intro) { const k = 1 - t / rig.intro, e = k * k * k; camera.position.addScaledVector(rig.introOff, e * (1 + 0.12 * Math.sin(t * 5))); } camera.lookAt(rig.pathTgt.getPoint(rig.pathT));
    } else {
      const b = rig.fixedPos || camera.position; camera.position.set(b.x + yaw * 0.8, b.y - pitch * 0.5, b.z); camera.lookAt(rig.target);
    }
  };

  /** Safe default scene: a calm studio with the image on a screen. The shell calls it when the scene code throws. */
  function fallbackScene() {
    M.clearScene(); used.screens = used.particles = used.props = used.lights = 0;
    sky({ preset: 'studio' }); lights({ preset: 'studio' }); ground({ style: 'plain', size: 40 });
    const s = screen({ width: 2.4, pos: [0, 1.5, 0], bezel: 'black', glow: 0.6 }); if (s) animate(s.group, { bob: { amp: 0.05, speed: 1.2 } });
    particles({ kind: 'dust', count: 120, area: [8, 4, 8], pos: [0, 2, 0] });
    cam.orbit({ target: [0, 1.5, 0], radius: 5.5, height: 1.8, speed: 0.06, fov: 40 });
  }


  /* ------------------------------------------------------------------ v2 additions: materials, soft furniture, merge, windows, decor */
  /** list(v, fallback): accepts an array, an object (its values, e.g. brief.palette), a single string, or a count; anything else gives the fallback. */
  const list = (v, d) => (Array.isArray(v) ? (v.length ? v : d) : v && typeof v === 'object' ? (Object.values(v).length ? Object.values(v) : d) : typeof v === 'string' ? [v] : typeof v === 'number' && v >= 1 ? Array.from({ length: Math.min(8, Math.floor(v)) }, (_, i) => d[i % d.length]) : d);
  const shade = (c, f) => { const k = col(c, '#cccccc').clone(); k.multiplyScalar(f); return '#' + k.getHexString(); };
  const hexOf = (c, d) => '#' + col(c, d || '#cccccc').getHexString();
  /** cook.mat(kind, {color, scale, rough, metal, repeat}) : MeshStandardMaterial with a procedural texture. */
  function mat(kind, o) {
    o = o || {}; kind = kind || 'plaster'; const base = hexOf(o.color, '#d8d0c4'); if (kind === 'glass') return new THREE.MeshPhysicalMaterial({ color: col(o.color, '#f4faff'), transmission: 0.95, thickness: num(o.thickness, 0.3), ior: 1.45, roughness: num(o.rough, 0.05), metalness: 0 });
    const rr = rng('mat' + kind + base); const sc = num(o.scale, 1);
    const ROUGH = { paving: 0.85, asphalt: 0.9, grass: 1, brick: 0.9, roof: 0.8, foliage: 0.75, wood: 0.55, fabric: 0.97, boucle: 1, linen: 0.95, plaster: 0.92, concrete: 0.85, marble: 0.22, stone: 0.7, leather: 0.55, rug: 1, metal: 0.35, terrazzo: 0.4 };
    const tex = canvasTex((g, s) => {
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      const dot = (n, a, size, dark) => { for (let i = 0; i < n; i++) { g.fillStyle = (rr.next() < dark ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + rr.range(a * 0.4, a) + ')'; g.fillRect(rr.range(0, s), rr.range(0, s), size, size); } };
      if (kind === 'wood') { for (let i = 0; i < 110; i++) { const x = rr.range(0, s); g.strokeStyle = (rr.next() < 0.7 ? 'rgba(50,25,8,' : 'rgba(255,230,190,') + rr.range(0.03, 0.12) + ')'; g.lineWidth = rr.range(0.6, 2.2); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rr.range(-6, 6), s * 0.33, x + rr.range(-6, 6), s * 0.66, x + rr.range(-4, 4), s); g.stroke(); } g.fillStyle = 'rgba(0,0,0,.28)'; for (let i = 1; i < 4; i++) g.fillRect(i * s / 4 - 1, 0, 2, s); }
      else if (kind === 'fabric' || kind === 'linen') { for (let i = 0; i < s; i += 2) { g.fillStyle = 'rgba(0,0,0,' + (0.02 + (i % 4) * 0.012) + ')'; g.fillRect(0, i, s, 1); g.fillRect(i, 0, 1, s); } dot(1800, 0.09, 1.5, 0.5); }
      else if (kind === 'boucle') { for (let i = 0; i < 2600; i++) { g.strokeStyle = (rr.next() < 0.5 ? 'rgba(255,255,255,' : 'rgba(90,70,50,') + rr.range(0.08, 0.26) + ')'; g.lineWidth = 1.4; g.beginPath(); g.arc(rr.range(0, s), rr.range(0, s), rr.range(1, 2.8), 0, 6.3); g.stroke(); } }
      else if (kind === 'plaster' || kind === 'concrete') { for (let i = 0; i < 40; i++) { const x = rr.range(0, s), y = rr.range(0, s), r = rr.range(30, 110); const gr = g.createRadialGradient(x, y, 0, x, y, r); const d = rr.next() < 0.5; gr.addColorStop(0, d ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); } dot(900, 0.06, 1.5, 0.6); }
      else if (kind === 'marble') { for (let v = 0; v < 7; v++) { g.strokeStyle = 'rgba(70,70,80,' + rr.range(0.1, 0.4) + ')'; g.lineWidth = rr.range(0.6, 2.4); g.beginPath(); let x = rr.range(0, s), y = 0; g.moveTo(x, y); while (y < s) { x += rr.range(-26, 26); y += rr.range(14, 34); g.lineTo(x, y); } g.stroke(); } dot(300, 0.06, 2, 0.3); }
      else if (kind === 'terrazzo') { const cols = ['#e8b9a6', '#9fb8a8', '#f4efe6', '#6f6a64', '#d4a373']; for (let i = 0; i < 90; i++) { g.fillStyle = cols[rr.int(0, 4)]; g.beginPath(); g.ellipse(rr.range(0, s), rr.range(0, s), rr.range(2, 7), rr.range(1.5, 5), rr.range(0, 3), 0, 6.3); g.fill(); } }
      else if (kind === 'stone') { dot(2200, 0.18, 2, 0.55); }
      else if (kind === 'leather') { dot(1500, 0.1, 2, 0.7); g.strokeStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.moveTo(rr.range(0, s), rr.range(0, s)); g.lineTo(rr.range(0, s), rr.range(0, s)); g.stroke(); } }
      else if (kind === 'rug') { const acc = hexOf(o.accent, shade(base, 0.7)); g.strokeStyle = acc; g.lineWidth = 6; g.strokeRect(14, 14, s - 28, s - 28); g.lineWidth = 2; g.strokeRect(28, 28, s - 56, s - 56); g.fillStyle = acc; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.save(); g.translate(s / 8 + i * s / 4, s / 8 + j * s / 4); g.rotate(0.785); g.globalAlpha = 0.5; g.fillRect(-9, -9, 18, 18); g.restore(); } g.globalAlpha = 1; dot(1800, 0.08, 1.5, 0.5); }
      else if (kind === 'paving') { const t = 64; for (let y = 0; y < 4; y++) for (let x = -1; x < 4; x++) { const sh = rr.range(-14, 14); const k = col(base).clone(); g.fillStyle = 'rgb(' + clamp(Math.round(k.r * 255 + sh), 0, 255) + ',' + clamp(Math.round(k.g * 255 + sh), 0, 255) + ',' + clamp(Math.round(k.b * 255 + sh), 0, 255) + ')'; g.fillRect(x * t + (y % 2) * 16, y * t, t, t); } g.fillStyle = 'rgba(40,36,30,.35)'; for (let i = 0; i <= 4; i++) { g.fillRect(i * t - 1, 0, 2, s); g.fillRect(0, i * t - 1, s, 2); } dot(900, 0.06, 1.5, 0.6); }
      else if (kind === 'asphalt') { dot(2600, 0.1, 2, 0.5); }
      else if (kind === 'grass') { for (let i = 0; i < 2400; i++) { g.strokeStyle = (rr.next() < 0.5 ? 'rgba(20,70,20,' : 'rgba(190,230,120,') + rr.range(0.15, 0.4) + ')'; g.lineWidth = 1; const x = rr.range(0, s), y = rr.range(0, s); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr.range(-3, 3), y - rr.range(3, 9)); g.stroke(); } }
      else if (kind === 'brick') { for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { const k = rr.range(-18, 18); g.fillStyle = 'rgba(' + (k > 0 ? '255,255,255,' : '0,0,0,') + Math.abs(k) / 120 + ')'; g.fillRect(x * 64 + (y % 2) * 32 + 1, y * 32 + 1, 62, 30); } g.fillStyle = 'rgba(230,225,215,.55)'; for (let y = 0; y <= 8; y++) g.fillRect(0, y * 32 - 1, s, 2); }
      else if (kind === 'roof') { for (let y = 0; y < 8; y++) { g.fillStyle = 'rgba(0,0,0,' + (0.12 + (y % 2) * 0.06) + ')'; g.fillRect(0, y * 32, s, 3); for (let x = 0; x < 8; x++) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x * 32 + (y % 2) * 16, y * 32, 1.5, 32); } } dot(800, 0.08, 1.5, 0.5); }
      else if (kind === 'foliage') { g.clearRect(0, 0, s, s); const b0 = col(base); for (let i = 0; i < 520; i++) { const f = rr.range(0.62, 1.3), k = b0.clone().multiplyScalar(f); k.g = Math.min(1, k.g * rr.range(0.95, 1.12)); g.fillStyle = '#' + k.getHexString(); g.save(); g.translate(rr.range(0, s), rr.range(0, s)); g.rotate(rr.range(0, 6.3)); g.beginPath(); g.ellipse(0, 0, rr.range(5, 11), rr.range(2.5, 5), 0, 0, 6.3); g.fill(); g.restore(); } }
      else if (kind === 'maple' || kind === 'blossom') { g.clearRect(0, 0, s, s); const pal = kind === 'maple' ? [base, shade(base, 0.8), shade(base, 1.25), '#e8892a', '#b82a1c'] : ['#ffd0de', '#ffb8cd', '#fff0f4', '#ff9fbd', '#ffe3ea']; for (let i = 0; i < (kind === 'maple' ? 90 : 70); i++) { g.save(); g.translate(rr.range(0, s), rr.range(0, s)); g.rotate(rr.range(0, 6.3)); g.fillStyle = pal[rr.int(0, pal.length - 1)]; const r = rr.range(9, 15); if (kind === 'maple') { g.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * 6.2832, rad = (k % 2 ? 0.45 : 1) * r * (1 + 0.15 * Math.sin(a * 2)); g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.closePath(); g.fill(); g.strokeStyle = 'rgba(80,20,10,.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, r * 1.1); g.stroke(); } else { for (let k = 0; k < 5; k++) { g.rotate(1.2566); g.beginPath(); g.ellipse(r * 0.38, 0, r * 0.45, r * 0.3, 0, 0, 6.3); g.fill(); } g.fillStyle = '#d6527a'; g.beginPath(); g.arc(0, 0, r * 0.12, 0, 6.3); g.fill(); } g.restore(); } }
      else if (kind === 'brushed') { for (let i = 0; i < 900; i++) { g.strokeStyle = (rr.next() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + rr.range(0.03, 0.12) + ')'; g.lineWidth = rr.range(0.5, 1.6); const y = rr.range(0, s); g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + rr.range(-0.6, 0.6)); g.stroke(); } }
      else { dot(600, 0.06, 1, 0.5); }
    }, o.repeat || null);
    if (!o.repeat) { const k = 1 / Math.max(0.1, sc); tex.repeat.set(k, k); }
    const mm = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: num(o.rough, ROUGH[kind] != null ? ROUGH[kind] : 0.8), metalness: num(o.metal, kind === 'metal' ? 0.8 : 0) });
    if (kind === 'foliage' || kind === 'maple' || kind === 'blossom') { mm.alphaTest = 0.5; mm.side = THREE.DoubleSide; mm.roughness = 0.75; if (kind !== 'foliage') { mm.emissive = col(kind === 'maple' ? '#3a0c04' : '#401424'); mm.emissiveIntensity = 0.25; } }
    if (kind === 'brushed') { mm.metalness = num(o.metal, 0.9); mm.roughness = num(o.rough, 0.38); }
    let out = mm;
    if (o.clearcoat || kind === 'brushed') { out = new THREE.MeshPhysicalMaterial({ map: tex, color: 0xffffff, roughness: mm.roughness, metalness: mm.metalness }); if (o.clearcoat) { out.clearcoat = clamp(num(o.clearcoat, 0.8), 0, 1); out.clearcoatRoughness = num(o.clearcoatRough, 0.08); } if (kind === 'brushed') { out.anisotropy = 0.7; } }
    if (o.microRough !== false && ['wood', 'marble', 'stone', 'leather', 'metal', 'brushed', 'terrazzo', 'concrete'].indexOf(kind) >= 0) { const rt = canvasTex((g, s) => { g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, s, s); for (let i = 0; i < 2600; i++) { const v = Math.floor(rr.range(130, 255)); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(rr.range(0, s), rr.range(0, s), rr.range(1, 6), rr.range(1, 6)); } }, o.repeat || null); rt.colorSpace = THREE.NoColorSpace; if (!o.repeat) rt.repeat.copy(tex.repeat); out.roughnessMap = rt; }
    return out;
  }
  const pm = (o, kind, d) => (o && o.material) || mat(kind, { color: (o && o.color) || d, scale: o && o.texScale, accent: o && o.accent });

  /** cook.merge(root) : merges all static plain meshes under root that share a material into one mesh each (fewer draw calls). Skips shader / transparent materials and instanced meshes. */
  function merge(root) {
    root = root || scene; root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); const buckets = new Map(); const dead = [];
    root.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.userData.keep || m.name === 'screen') return; const mt = m.material;
      if (!mt || Array.isArray(mt) || mt.isShaderMaterial || mt.transparent || !m.geometry || !m.geometry.attributes.position) return;
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); const n = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      if (mt.vertexColors && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(k === 'color' && mt.vertexColors)) g.deleteAttribute(k);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); const key = mt.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
      if (!buckets.has(key)) buckets.set(key, { mt, list: [], cs: m.castShadow, rs: m.receiveShadow }); buckets.get(key).list.push(g); dead.push(m);
    });
    dead.forEach((m) => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); });
    buckets.forEach((b) => {
      const tot = b.list.reduce((s, g) => s + g.attributes.position.count, 0); const P = new Float32Array(tot * 3), N = new Float32Array(tot * 3), U = new Float32Array(tot * 2), CL = b.mt.vertexColors ? new Float32Array(tot * 3) : null; let o3 = 0, o2 = 0;
      b.list.forEach((g) => { P.set(g.attributes.position.array, o3); N.set(g.attributes.normal.array, o3); if (CL) CL.set(g.attributes.color.array, o3); U.set(g.attributes.uv.array, o2); o3 += g.attributes.position.count * 3; o2 += g.attributes.position.count * 2; g.dispose(); });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2)); if (CL) geo.setAttribute('color', new THREE.BufferAttribute(CL, 3));
      const mm = new THREE.Mesh(geo, b.mt); mm.castShadow = b.cs; mm.receiveShadow = b.rs; mm.name = 'merged'; root.add(mm);
    });
    return root;
  }

  /** cook.build.roundBox({w,h,d,r,color|material,kind,pos,rotY,parent}) : soft-edged box (cushions, sofas, tables, books). */
  function roundBox(o) {
    o = o || {}; const w = num(o.w, 1), h = num(o.h, 1), d = num(o.d, 1); const b = Math.min(num(o.r, 0.04), w / 2.2, h / 2.2, d / 2.2); const sh = new THREE.Shape(); const x = -(w - 2 * b) / 2, y = -(h - 2 * b) / 2, ww = w - 2 * b, hh = h - 2 * b, cr = Math.max(b * 0.5, 0.002);
    sh.moveTo(x + cr, y); sh.lineTo(x + ww - cr, y); sh.quadraticCurveTo(x + ww, y, x + ww, y + cr); sh.lineTo(x + ww, y + hh - cr); sh.quadraticCurveTo(x + ww, y + hh, x + ww - cr, y + hh); sh.lineTo(x + cr, y + hh); sh.quadraticCurveTo(x, y + hh, x, y + hh - cr); sh.lineTo(x, y + cr); sh.quadraticCurveTo(x, y, x + cr, y);
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 5 }); g.translate(0, 0, -(d - 2 * b) / 2);
    const m = shadowed(new THREE.Mesh(g, o.material || (o.kind ? mat(o.kind, { color: o.color }) : stdMat(o.color, o.rough, o.metal)))); m.position.copy(P3(o)); m.rotation.y = num(o.rotY, 0); (o.parent || scene).add(m); return m;
  }
  const rb = (g, w, h, d, r, material, x, y, z) => { const m = roundBox({ w, h, d, r, material, parent: g }); m.position.set(x, y, z); return m; };
  const cyl = (g, rT, rB, h, material, x, y, z, seg) => { const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg || 20), material)); m.position.set(x, y, z); g.add(m); return m; };
  function finish(g, o) { place(g, o); if (!o || o.merge !== false) merge(g); return g; }

  /** cook.windowView({room, wall:'left'|'right'|'back', at, y, w, h, view:'park'|'city'|'sea'|'sky'|'garden'|'mountains', curtains, beams}) : a lit window with a painted world outside, frame, mullions, optional sheer curtains and light shaft. */
  function windowView(o) {
    o = o || {}; const rm = o.room || { width: 8, depth: 8, height: 3.2 }; const W = rm.width, D = rm.depth, w = num(o.w, 2.2), h = num(o.h, 1.9), y = num(o.y, h / 2 + 0.55), at = num(o.at, 0); const g = new THREE.Group(); const view = o.view || 'park'; const rr = rng('win' + view);
    const tex = canvasTex((c, s) => {
      const gr = c.createLinearGradient(0, 0, 0, s); const sky = { sea: ['#8fd0f2', '#e9f6ff'], city: ['#9cc4ea', '#f1e4d4'], mountains: ['#8ab6e6', '#f6efe4'], sky: ['#6fb3ee', '#ffffff'], garden: ['#a6d4f5', '#f3f8ee'], park: ['#9fd0f3', '#f4f7f0'] }[view] || ['#9fd0f3', '#f4f7f0']; gr.addColorStop(0, sky[0]); gr.addColorStop(0.7, sky[1]); gr.addColorStop(1, sky[1]); c.fillStyle = gr; c.fillRect(0, 0, s, s);
      const sun = c.createRadialGradient(s * 0.75, s * 0.2, 0, s * 0.75, s * 0.2, s * 0.35); sun.addColorStop(0, 'rgba(255,248,220,.95)'); sun.addColorStop(1, 'rgba(255,248,220,0)'); c.fillStyle = sun; c.fillRect(0, 0, s, s);
      c.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 5; i++) { const x = rr.range(0, s), yy = rr.range(10, s * 0.4); for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(x + k * 14, yy + (k % 2) * 4, 22, 9, 0, 0, 6.3); c.fill(); } }
      if (view === 'sea') { c.fillStyle = '#5fb7dc'; c.fillRect(0, s * 0.62, s, s); c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 30; i++) c.fillRect(rr.range(0, s), rr.range(s * 0.64, s), rr.range(10, 40), 1.5); }
      else if (view === 'city') { for (let i = 0; i < 16; i++) { const bw = rr.range(14, 34), bh = rr.range(40, 150), x = i * 17 + rr.range(-4, 4); c.fillStyle = ['#c9d3df', '#b6c3d2', '#d8dde3', '#a9b8c9'][i % 4]; c.fillRect(x, s - bh - 20, bw, bh + 20); c.fillStyle = 'rgba(255,255,255,.5)'; for (let yy = s - bh - 14; yy < s - 24; yy += 12) c.fillRect(x + 3, yy, bw - 6, 3); } }
      else if (view === 'mountains') { [['#b7c9dc', 0.45], ['#8fa8c2', 0.58], ['#6f8aa6', 0.72]].forEach((m, k) => { c.fillStyle = m[0]; c.beginPath(); c.moveTo(0, s); for (let x = 0; x <= s; x += 16) c.lineTo(x, s * m[1] - Math.abs(Math.sin(x * 0.03 + k * 2)) * 60 - rr.range(0, 10)); c.lineTo(s, s); c.fill(); }); }
      else if (view !== 'sky') { c.fillStyle = '#8fc27a'; c.fillRect(0, s * 0.78, s, s); for (let i = 0; i < 9; i++) { const x = rr.range(0, s), r = rr.range(26, 52), yy = s * 0.7 - rr.range(0, 24); c.fillStyle = '#6a4a32'; c.fillRect(x - 3, yy, 6, s * 0.2); c.fillStyle = ['#5f9e5a', '#79b469', '#4f8c53'][i % 3]; c.beginPath(); c.arc(x, yy - r * 0.4, r, 0, 6.3); c.arc(x - r * 0.6, yy, r * 0.7, 0, 6.3); c.arc(x + r * 0.6, yy, r * 0.7, 0, 6.3); c.fill(); } }
    });
    tex.repeat.set(1, 1); const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false })); g.add(glass);
    const fr = stdMat('#fbfaf6', 0.6), t = 0.07, dep = 0.09; const bar = (bw, bh, x, yy, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, dep), fr); b.position.set(x, yy, z || 0.03); g.add(b); };
    bar(w + 2 * t, t, 0, h / 2 + t / 2); bar(w + 2 * t, t, 0, -h / 2 - t / 2); bar(t, h, -w / 2 - t / 2, 0); bar(t, h, w / 2 + t / 2, 0); const mc = Math.max(1, Math.round(num(o.panes, 3))); for (let i = 1; i < mc; i++) bar(0.035, h, -w / 2 + i * w / mc, 0); bar(w, 0.035, 0, 0);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.05, 0.22), fr); sill.position.set(0, -h / 2 - t - 0.02, 0.1); g.add(sill);
    if (o.curtains !== false) { const cm = (side) => { const u = { uTime: { value: 0 }, uC: { value: col(o.curtainColor, '#fffaf0') } }; uniformsTime.push(u.uTime); const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.34, h + 0.5, 14, 10), new THREE.ShaderMaterial({ uniforms: u, transparent: true, side: THREE.DoubleSide, depthWrite: false, vertexShader: 'uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.z += sin(uv.x * 22.0 + uTime * 0.5) * 0.035 + sin(uv.y * 3.0 + uTime * 0.7 + uv.x * 4.0) * 0.02 * uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }', fragmentShader: 'uniform vec3 uC; varying vec2 vUv; void main(){ float f = 0.55 + 0.45 * sin(vUv.x * 60.0); gl_FragColor = vec4(uC * (0.82 + 0.18 * f), 0.5 + 0.2 * f);\n#include <colorspace_fragment>\n }' })); p.position.set(side * (w / 2 - w * 0.12), 0.1, 0.16); g.add(p); }; cm(-1); cm(1); const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, w + 0.5, 10), stdMat('#3a3a3a', 0.4, 0.6)); rod.rotation.z = Math.PI / 2; rod.position.set(0, h / 2 + 0.3, 0.2); g.add(rod); }
    if (o.beams !== false) { const u = { uTime: { value: 0 } }; uniformsTime.push(u.uTime); const L = num(o.beamLength, 3.2); const geo = new THREE.PlaneGeometry(w * 0.9, L, 1, 1); geo.rotateX(-1.18); geo.translate(0, -h * 0.25, L * 0.45); const b = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.2, vUv.y) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x); a *= 0.1 + 0.03 * sin(uTime * 0.6 + vUv.x * 9.0); gl_FragColor = vec4(1.0, 0.93, 0.78, a); }' })); g.add(b); }
    const wl = o.wall || 'left'; if (wl === 'left') { g.position.set(-W / 2 + 0.02, y, at); g.rotation.y = Math.PI / 2; } else if (wl === 'right') { g.position.set(W / 2 - 0.02, y, at); g.rotation.y = -Math.PI / 2; } else { g.position.set(at, y, -D / 2 + 0.02); }
    scene.add(g); return g;
  }

  /* soft furniture and decor. Every function returns a Group already merged to few draw calls (merge:false to keep parts). */
  Object.assign(prop, {
    sofaSoft: (o) => { o = o || {}; const w = num(o.w, 2.3), g = new THREE.Group(), m = pm(o, 'boucle', '#efe9de'), leg = mat('wood', { color: o.legColor || '#8a6a4a' });
      rb(g, w, 0.28, 0.95, 0.06, m, 0, 0.3, 0); rb(g, w, 0.55, 0.22, 0.08, m, 0, 0.62, -0.38); [-1, 1].forEach((s) => rb(g, 0.2, 0.5, 0.95, 0.07, m, s * (w / 2 - 0.1), 0.45, 0));
      const n = Math.max(2, Math.round(w / 0.75)), cw = (w - 0.4) / n; for (let i = 0; i < n; i++) { rb(g, cw - 0.02, 0.14, 0.72, 0.06, m, -w / 2 + 0.2 + cw * (i + 0.5), 0.5, 0.08); rb(g, cw - 0.04, 0.42, 0.16, 0.07, m, -w / 2 + 0.2 + cw * (i + 0.5), 0.72, -0.24).rotation.x = -0.18; }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((p) => { const l = cyl(g, 0.025, 0.018, 0.16, leg, p[0] * (w / 2 - 0.12), 0.08, p[1] * 0.38, 10); });
      list(o.pillows, ['#f2c6bf', '#9fcfbf']).slice(0, 4).forEach((c, i) => { const p = roundBox({ w: 0.42, h: 0.4, d: 0.12, r: 0.05, material: mat('linen', { color: c }), parent: g }); p.position.set(-w / 2 + 0.4 + i * (w - 0.8), 0.72, -0.05); p.rotation.set(-0.15, (i ? -1 : 1) * 0.35, (i ? 1 : -1) * 0.12); });
      return finish(g, o); },
    armchair: (o) => { o = o || {}; const g = new THREE.Group(), m = pm(o, 'fabric', '#c9d6cf'), leg = mat('wood', { color: '#7a5a3a' });
      rb(g, 0.82, 0.22, 0.8, 0.07, m, 0, 0.36, 0); rb(g, 0.82, 0.62, 0.18, 0.08, m, 0, 0.66, -0.34).rotation.x = -0.12; [-1, 1].forEach((s) => rb(g, 0.14, 0.34, 0.8, 0.06, m, s * 0.36, 0.5, 0));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((p) => cyl(g, 0.02, 0.015, 0.22, leg, p[0] * 0.33, 0.11, p[1] * 0.32, 8)); return finish(g, o); },
    coffeeTable: (o) => { o = o || {}; const g = new THREE.Group(), h = num(o.h, 0.42), top = o.top || 'wood', tm = mat(top, { color: o.color || (top === 'marble' ? '#efece6' : '#a67c52') }), lm = mat('metal', { color: o.legColor || '#2e2e2e' });
      if (o.shape === 'rect') { const w = num(o.w, 1.2), d = num(o.d, 0.65); rb(g, w, 0.05, d, 0.02, tm, 0, h, 0); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((p) => cyl(g, 0.02, 0.02, h, lm, p[0] * (w / 2 - 0.08), h / 2, p[1] * (d / 2 - 0.08), 8)); }
      else { const r = num(o.r, 0.55); cyl(g, r, r, 0.05, tm, 0, h, 0, 40); cyl(g, 0.05, 0.07, h, lm, 0, h / 2, 0, 16); cyl(g, 0.22, 0.22, 0.02, lm, 0, 0.01, 0, 24); }
      return finish(g, o); },
    sideTable: (o) => { o = o || {}; const g = new THREE.Group(), h = num(o.h, 0.55), r = num(o.r, 0.22); cyl(g, r, r, 0.03, mat(o.top || 'marble', { color: o.color || '#ece8e0' }), 0, h, 0, 32); [[-1, -1], [1, -1], [0, 1]].forEach((p) => { const l = cyl(g, 0.014, 0.012, h, mat('metal', { color: '#222' }), p[0] * r * 0.6, h / 2, p[1] * r * 0.6, 8); l.rotation.z = p[0] * -0.08; }); return finish(g, o); },
    vase: (o) => { o = o || {}; const g = new THREE.Group(), h = num(o.h, 0.3), r = num(o.r, 0.08), pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r * (0.45 + 0.75 * Math.sin(Math.PI * Math.pow(t, 0.8))) * (t > 0.85 ? 0.7 : 1), t * h)); }
      const v = shadowed(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mat('plaster', { color: o.color || '#efe9df', rough: 0.4 }))); g.add(v); const rr = rng(o.seed || 'vase'); const n = num(o.branches, 4), bm = stdMat('#6d5a3f', 0.8), lm = stdMat(o.leafColor || '#7fae78', 0.8);
      for (let i = 0; i < n; i++) { const a = rr.range(0, 6.28), tilt = rr.range(0.1, 0.45), L = rr.range(0.25, 0.5) * (o.tall ? 2 : 1); const br = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, L, 5), bm)); br.position.set(Math.sin(a) * tilt * L * 0.5, h + L * 0.45, Math.cos(a) * tilt * L * 0.5); br.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt); g.add(br); for (let k = 0; k < 4; k++) { const lf = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), lm)); lf.scale.set(1, 0.4, 1.8); lf.position.set(br.position.x + Math.sin(a) * tilt * L * (k - 1.5) * 0.25 + rr.range(-0.02, 0.02), h + L * (0.45 + k * 0.13), br.position.z + Math.cos(a) * tilt * L * (k - 1.5) * 0.25); lf.rotation.y = rr.range(0, 6); g.add(lf); } }
      return finish(g, o); },
    books: (o) => { o = o || {}; const g = new THREE.Group(), rr = rng(o.seed || 'books'), cols = list(o.colors, ['#e8dfd0', '#9fb8a8', '#d9a79a', '#4a5568', '#c9b28a']); let y = 0; const n = num(o.n, 4); for (let i = 0; i < n; i++) { const bw = rr.range(0.2, 0.3), bd = rr.range(0.15, 0.22), bh = rr.range(0.025, 0.05); const b = roundBox({ w: bw, h: bh, d: bd, r: 0.006, color: cols[i % cols.length], rough: 0.8, parent: g }); b.position.set(rr.range(-0.015, 0.015), y + bh / 2, 0); b.rotation.y = rr.range(-0.25, 0.25); y += bh; } return finish(g, o); },
    plantLeafy: (o) => { o = o || {}; const g = new THREE.Group(), h = num(o.h, 1.2), rr = rng(o.seed || 'leafy'), n = num(o.leaves, 26), pot = mat('plaster', { color: o.potColor || '#cdbfae' });
      cyl(g, 0.2, 0.15, 0.34, pot, 0, 0.17, 0, 24); cyl(g, 0.185, 0.185, 0.02, stdMat('#3a2c20', 1), 0, 0.33, 0, 20);
      const lg = new THREE.PlaneGeometry(0.34, 0.6, 3, 5); const p = lg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i) + 0.3; const wdt = Math.sin(Math.PI * Math.min(1, y / 0.6 * 0.95 + 0.05)); p.setX(i, x * (0.25 + 0.75 * wdt) * 1.0); p.setZ(i, Math.abs(x) * 0.35 - y * y * 0.35); } lg.computeVertexNormals();
      const im = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: o.color || '#3f7d4f', roughness: 0.55, side: THREE.DoubleSide }), n); im.castShadow = true; im.receiveShadow = true; const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) { const a = i * 2.4, t = i / n, rad = 0.05 + t * 0.32; d.position.set(Math.sin(a) * rad * 0.4, 0.4 + t * h * 0.8, Math.cos(a) * rad * 0.4); d.rotation.set(-0.5 - (1 - t) * 0.5, a, 0, 'YXZ'); const s = (0.55 + t * 0.7) * rr.range(0.85, 1.15) * h / 1.2; d.scale.set(s, s, s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
      g.add(im); const st = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, h * 0.8, 6), stdMat('#5a4630', 0.9))); st.position.y = 0.4 + h * 0.4; g.add(st); place(g, o); if (o.sway !== false) animate(g, { sway: { amp: 0.012, speed: 0.7 } }); return g; },
    pendant: (o) => { o = o || {}; const g = new THREE.Group(), drop = num(o.drop, 1.2), r = num(o.r, 0.22); const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, drop, 5), stdMat('#222', 0.6)); cord.position.y = -drop / 2; g.add(cord);
      const sh = new THREE.Mesh(o.shape === 'globe' ? new THREE.SphereGeometry(r, 24, 16) : new THREE.CylinderGeometry(r * 0.35, r, r * 0.85, 28, 1, true), new THREE.MeshStandardMaterial({ color: o.color || '#f4ecdc', emissive: col(o.glow, '#ffd9a0'), emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 0.8 })); sh.position.y = -drop - r * 0.4; g.add(sh);
      if (o.light !== false && used.lights < LIMITS.lights) { used.lights++; const pl = new THREE.PointLight(col(o.glow, '#ffd9a0'), 6, 6, 1.8); pl.position.y = -drop - r; g.add(pl); } place(g, o); return g; },
    artwork: (o) => { o = o || {}; const w = num(o.w, 0.9), h = num(o.h, 1.1), pal = list(o.palette, ['#e9b8a2', '#9fc3b0', '#f2e6d3', '#3b4a5a']).map((c) => hexOf(c)); const style = o.style || 'shapes'; const rr = rng(o.seed || 'art' + style);
      const tex = canvasTex((c, s) => { c.fillStyle = pal[2 % pal.length]; c.fillRect(0, 0, s, s); if (style === 'stripes') { for (let i = 0; i < 7; i++) { c.fillStyle = pal[i % pal.length]; c.fillRect(0, i * s / 7, s, s / 7 - 4); } } else if (style === 'circles') { for (let i = 0; i < 5; i++) { c.fillStyle = pal[i % pal.length]; c.beginPath(); c.arc(rr.range(40, s - 40), rr.range(40, s - 40), rr.range(24, 80), 0, 6.3); c.fill(); } } else if (style === 'waves') { for (let k = 0; k < 7; k++) { c.strokeStyle = pal[k % pal.length]; c.lineWidth = 9; c.beginPath(); for (let x = 0; x <= s; x += 8) c.lineTo(x, 40 + k * 30 + Math.sin(x * 0.04 + k) * 16); c.stroke(); } } else { for (let i = 0; i < 6; i++) { c.fillStyle = pal[i % pal.length]; const x = rr.range(10, s - 120), y = rr.range(10, s - 120); if (i % 2) c.fillRect(x, y, rr.range(50, 130), rr.range(50, 130)); else { c.beginPath(); c.arc(x + 60, y + 60, rr.range(30, 70), 0, 6.3); c.fill(); } } } }); tex.repeat.set(1, 1);
      const g = new THREE.Group(); const fm = stdMat(o.frameColor || '#2b2520', 0.5); const f = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04), fm)); g.add(f); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); p.position.z = 0.022; g.add(p); return place(g, o); },
    rugRect: (o) => { o = o || {}; const w = num(o.w, 3), d = num(o.d, 2.2); const m = mat('rug', { color: o.color || '#e6ddcc', accent: o.accent || '#b9a487', repeat: [Math.max(1, Math.round(w / 1.2)), Math.max(1, Math.round(d / 1.2))] }); const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); r.rotation.x = -Math.PI / 2; r.position.copy(P3(o)); r.position.y += 0.012; r.rotation.z = num(o.rotY, 0); r.receiveShadow = true; scene.add(r); return r; },
  });


  /* ------------------------------------------------------------------ v3 additions: nature, urban kit, scatter (instancing) */
  /** cook.scatter({from:Group, count, area:[x0,z0,x1,z1], y, scale:[min,max], avoid:[[x,z,r]...], seed, positions:[[x,z,rotY,scale]...]}) : repeats a prop / tree / lamp many times with InstancedMesh (a few draw calls for any count). The source group is removed from the scene. */
  function scatter(o) {
    o = o || {}; const src = o.from; if (!src) { warn('scatter needs from'); return null; } src.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(); const parts = [];
    src.traverse((m) => { if (m.isMesh && !m.isInstancedMesh) parts.push({ m, rel: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) }); });
    let pts = Array.isArray(o.positions) ? o.positions.filter((q) => Array.isArray(q) && q.length >= 2) : null; if (!pts || !pts.length) { pts = []; const a = Array.isArray(o.area) && o.area.length >= 4 ? o.area : [-5, -5, 5, 5], rr = rng(o.seed || 'scatter'), av = Array.isArray(o.avoid) ? o.avoid.filter((q) => Array.isArray(q) && q.length >= 3) : [], n = clamp(Math.floor(num(o.count, 20)), 1, 600); let guard = 0; const sc = Array.isArray(o.scale) && o.scale.length >= 2 ? o.scale : typeof o.scale === 'number' ? [o.scale, o.scale] : [1, 1]; while (pts.length < n && guard++ < n * 40) { const x = rr.range(a[0], a[2]), z = rr.range(a[1], a[3]); if (av.some((q) => Math.hypot(x - q[0], z - q[1]) < q[2])) continue; pts.push([x, z, rr.range(0, 6.283), rr.range(sc[0], sc[1])]); } }
    const out = [], D = new THREE.Object3D(), tmp = new THREE.Matrix4();
    parts.forEach((p) => { const im = new THREE.InstancedMesh(p.m.geometry, p.m.material, pts.length); im.castShadow = p.m.castShadow; im.receiveShadow = p.m.receiveShadow; pts.forEach((q, i) => { D.position.set(q[0], num(o.y, 0), q[1]); D.rotation.set(0, q[2] || 0, 0); D.scale.setScalar(q[3] || 1); D.updateMatrix(); tmp.multiplyMatrices(D.matrix, p.rel); im.setMatrixAt(i, tmp); }); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; scene.add(im); out.push(im); });
    if (src.parent) src.parent.remove(src); return { meshes: out, positions: pts };
  }

  /* nature */
  function clump(r, seed, lowDark) {
    const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position, rr = rng(seed), cols = new Float32Array(p.count * 3); const nz = (x, y, z) => Math.sin(x * 3.1 + seed.length) * Math.cos(y * 2.7) + Math.sin(z * 3.7 + x * 1.3);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 1 + 0.16 * nz(x / r, y / r, z / r) + rr.range(-0.015, 0.015); p.setXYZ(i, x * d, y * d * 0.9, z * d); const sh = 0.55 + 0.45 * clamp((y / r + 1) / 2, 0, 1) * lowDark + (1 - lowDark) * 0.45; cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = sh; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
  }
  /** cook.nature.tree({h, kind:'round'|'cone'|'tall', color, seed, pos, rotY, scale}) : trunk + leafy crown of 10-14 clumps with leaf texture and baked ambient darkening; 2 draw calls. Use cook.scatter to make a forest. */
  function tree(o) {
    o = o || {}; const h = num(o.h, 5), kind = o.kind || 'round', rr = rng(o.seed || 'tree'), g = new THREE.Group(); const leafK = o.leaf === 'maple' ? 'maple' : o.leaf === 'cherry' ? 'blossom' : 'foliage'; const fol = mat(leafK, { color: o.color || (leafK === 'maple' ? '#c8341e' : leafK === 'blossom' ? '#ffb8cd' : '#4f8a45'), repeat: [3, 3] }); fol.vertexColors = true; const bark = stdMat(o.bark || (leafK === 'blossom' ? '#4a3430' : '#6b5239'), 0.95);
    const tr = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06 * h / 5, 0.13 * h / 5, h * 0.6, 8), bark)); tr.position.y = h * 0.3; g.add(tr);
    const n = kind === 'cone' ? 7 : 12; for (let i = 0; i < n; i++) {
      const t = i / n; let x, y, z, r;
      if (kind === 'cone') { y = h * (0.28 + 0.66 * t); r = h * 0.2 * (1 - t * 0.8); const a = i * 2.4; x = Math.sin(a) * r * 0.25; z = Math.cos(a) * r * 0.25; }
      else { const a = rr.range(0, 6.283), rad = rr.range(0.1, 0.36) * h * (kind === 'tall' ? 0.6 : 1); x = Math.sin(a) * rad; z = Math.cos(a) * rad; y = h * (0.62 + rr.range(-0.08, 0.3) * (kind === 'tall' ? 1.3 : 1)); r = h * rr.range(0.14, 0.22); }
      const c = shadowed(new THREE.Mesh(clump(r, (o.seed || 'tree') + i, 1), fol)); c.position.set(x, y, z); c.rotation.y = rr.range(0, 6); g.add(c);
      if (kind !== 'cone' && i < 3) { const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.02 * h / 5, 0.045 * h / 5, Math.hypot(x, z, y - h * 0.45), 5), bark)); b.position.set(x / 2, (y + h * 0.45) / 2, z / 2); b.lookAt(x, y, z); b.rotateX(Math.PI / 2); g.add(b); }
    }
    return finish(g, o);
  }
  /** cook.nature.bush({r,color,pos}) , cook.nature.hedgeRing({r,count,h,color,pos}) : low shrubs, hedge ring (fountain / flower bed), flowers optional */
  function bush(o) { o = o || {}; const r = num(o.r, 0.5), g = new THREE.Group(), fol = mat('foliage', { color: o.color || '#4a8a48', repeat: [2, 2] }); fol.vertexColors = true; const rr = rng(o.seed || 'bush'); for (let i = 0; i < 4; i++) { const c = shadowed(new THREE.Mesh(clump(r * rr.range(0.55, 0.8), (o.seed || 'bush') + i, 1), fol)); c.position.set(rr.range(-r, r) * 0.6, r * 0.4, rr.range(-r, r) * 0.6); g.add(c); } return finish(g, o); }
  function hedgeRing(o) { o = o || {}; const R0 = num(o.r, 3), n = Math.floor(num(o.count, 30)), h = num(o.h, 0.5), g = new THREE.Group(), fol = mat('foliage', { color: o.color || '#3f7d3f', repeat: [2, 2] }); fol.vertexColors = true; const rr = rng(o.seed || 'hedge'); const base = clump(h * 0.7, 'hedge', 1); const fl = ['#f4d35e', '#f08a9b', '#ffffff']; const fm = fl.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
    for (let i = 0; i < n; i++) { const a = i / n * 6.283; const c = shadowed(new THREE.Mesh(base, fol)); c.position.set(Math.cos(a) * R0, h * 0.4, Math.sin(a) * R0); c.scale.set(1.2, 0.9 + rr.next() * 0.3, 1.2); c.rotation.y = rr.range(0, 6); g.add(c); if (o.flowers) for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), fm[rr.int(0, 2)]); const aa = a + rr.range(-0.05, 0.05); f.position.set(Math.cos(aa) * (R0 + rr.range(-0.2, 0.2)), h * rr.range(0.55, 0.9), Math.sin(aa) * (R0 + rr.range(-0.2, 0.2))); g.add(f); } } return finish(g, o); }

  /* urban kit */
  function facadeMats(base, o, w, hgt, lit, seed) {
    const bay = 3.2; const mk = (emis) => canvasTex((c, s) => {
      const rr = rng('fac' + seed); c.fillStyle = emis ? '#000' : hexOf(base, '#efe9df'); c.fillRect(0, 0, s, s);
      if (!emis) { const gr = c.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(0,0,0,.05)'); gr.addColorStop(0.5, 'rgba(255,255,255,.04)'); gr.addColorStop(1, 'rgba(0,0,0,.08)'); c.fillStyle = gr; c.fillRect(0, 0, s, s); for (let i = 0; i < 700; i++) { c.fillStyle = 'rgba(0,0,0,' + rr.range(0.01, 0.04) + ')'; c.fillRect(rr.range(0, s), rr.range(0, s), 2, 2); } }
      for (let fy = 0; fy < 2; fy++) for (let bx = 0; bx < 2; bx++) { const x0 = bx * 128 + 34, y0 = fy * 128 + 22, ww = 60, hh = 84, on = rr.next() < lit;
        if (emis) { if (on) { const gr = c.createLinearGradient(0, y0, 0, y0 + hh); gr.addColorStop(0, '#ffcf80'); gr.addColorStop(1, '#ff9f4a'); c.fillStyle = gr; c.fillRect(x0, y0, ww, hh); c.fillStyle = '#000'; c.fillRect(x0 + ww / 2 - 1.5, y0, 3, hh); c.fillRect(x0, y0 + hh * 0.38, ww, 3); } continue; }
        c.fillStyle = hexOf(o.trim || '#fbfaf7'); c.fillRect(x0 - 6, y0 - 8, ww + 12, hh + 16); c.fillStyle = '#2b2f36'; c.fillRect(x0 - 2, y0 - 2, ww + 4, hh + 4);
        const gr = c.createLinearGradient(0, y0, 0, y0 + hh); if (on) { gr.addColorStop(0, '#ffcf80'); gr.addColorStop(1, '#ff9f4a'); } else { gr.addColorStop(0, '#9dbbd0'); gr.addColorStop(1, '#3d566b'); } c.fillStyle = gr; c.fillRect(x0, y0, ww, hh); c.fillStyle = '#2b2f36'; c.fillRect(x0 + ww / 2 - 1.5, y0, 3, hh); c.fillRect(x0, y0 + hh * 0.38, ww, 3);
        c.fillStyle = hexOf(o.trim || '#fbfaf7'); c.fillRect(x0 - 10, y0 + hh + 8, ww + 20, 5); }
    }); const m1 = mk(false), m2 = mk(true); const rx = w / (2 * bay), ry = hgt / (2 * 3.2);
    return () => { const a = m1.clone(), b = m2.clone(); a.needsUpdate = b.needsUpdate = true; a.repeat.set(rx, ry); b.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: a, emissiveMap: b, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.85 }); };
  }
  /** cook.urban.building({w,d,floors,floorH,color,trim,lit:0..1,roof:'flat'|'gable',awning,balcony,pos,rotY}) : facade with window grid (some warm-lit), ground-floor shopfront, cornice, parapet roof, optional awning / balconies. Front faces +z. */
  function building(o) {
    o = o || {}; const w = num(o.w, 12), d = num(o.d, 9), fl = Math.max(2, Math.round(num(o.floors, 4) / 2) * 2), fh = num(o.floorH, 3.2), H = fl * fh, g = new THREE.Group(), seed = o.seed || 'b' + w + d + fl; const lit = num(o.lit, 0.45);
    const mkF = (ww) => facadeMats(o.color || '#efe9df', o, ww, H, lit, seed + ww)(); const wall = stdMat(o.color || '#efe9df', 0.9);
    const mats = [mkF(d), mkF(d), wall, wall, mkF(w), mkF(w)]; const body = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mats); body.position.y = H / 2; body.castShadow = body.receiveShadow = true; used.props++; g.add(body);
    const trim = stdMat(o.trim || '#fbfaf7', 0.7), dark = stdMat('#2b2f36', 0.6);
    const add = (geo, m, x, y, z) => { const b = shadowed(new THREE.Mesh(geo, m)); b.position.set(x, y, z); g.add(b); return b; };
    add(new THREE.BoxGeometry(w + 0.5, 0.3, d + 0.5), trim, 0, H + 0.15, 0); add(new THREE.BoxGeometry(w + 0.2, 0.18, d + 0.2), trim, 0, fh, 0);
    [[w, 0.5, 0.2, 0, d / 2 - 0.1], [w, 0.5, 0.2, 0, -d / 2 + 0.1], [0.2, 0.5, d, w / 2 - 0.1, 0], [0.2, 0.5, d, -w / 2 + 0.1, 0]].forEach((p) => add(new THREE.BoxGeometry(p[0], p[1], p[2]), trim, p[3], H + 0.55, p[4]));
    if (o.roof === 'gable') { const rf = add(new THREE.CylinderGeometry(0.01, Math.hypot(w, d) * 0.5, 2.4, 4, 1), mat('roof', { color: o.roofColor || '#8a5a44' }), 0, H + 1.4, 0); rf.rotation.y = Math.PI / 4; rf.scale.set(w / Math.hypot(w, d) * 1.45, 1, d / Math.hypot(w, d) * 1.45); }
    else { add(new THREE.BoxGeometry(1.4, 0.7, 1.0), stdMat('#c8ccd0', 0.5, 0.4), w * 0.2, H + 0.85, -d * 0.15); add(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 14), stdMat('#7a7f87', 0.6, 0.3), -w * 0.25, H + 1.1, d * 0.1); }
    const shop = canvasTex((c, s) => { const gr = c.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#ffd9a0'); gr.addColorStop(1, '#f2a65a'); c.fillStyle = gr; c.fillRect(0, 0, s, s); c.fillStyle = '#2b2f36'; for (let i = 0; i <= 4; i++) c.fillRect(i * s / 4 - 3, 0, 6, s); c.fillRect(0, s * 0.3, s, 5); }); shop.repeat.set(Math.max(1, Math.round((w - 1.2) / 3)), 1);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.2, fh * 0.72), new THREE.MeshStandardMaterial({ map: shop, emissiveMap: shop, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 })); sh.position.set(0, fh * 0.42, d / 2 + 0.03); g.add(sh);
    if (o.awning !== false) { const aw = add(new THREE.BoxGeometry(w - 0.6, 0.08, 1.4), stdMat(o.awningColor || '#f3efe6', 0.9), 0, fh * 0.82, d / 2 + 0.6); aw.rotation.x = 0.22; }
    if (o.balcony) for (let f = 2; f < fl; f += 2) { add(new THREE.BoxGeometry(w * 0.34, 0.12, 1.0), trim, -w * 0.2, f * fh, d / 2 + 0.5); add(new THREE.BoxGeometry(w * 0.34, 0.9, 0.04), dark, -w * 0.2, f * fh + 0.5, d / 2 + 1.0); }
    add(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), stdMat('#cfc9bd', 0.9), 0, 0.17, 0);
    return finish(g, o);
  }
  /** cook.urban.streetLamp({h,color,glow,pos,rotY}) */
  function streetLamp(o) { o = o || {}; const h = num(o.h, 4.2), g = new THREE.Group(), m = stdMat(o.color || '#2a2d33', 0.45, 0.5); cyl(g, 0.16, 0.2, 0.3, m, 0, 0.15, 0, 10); cyl(g, 0.045, 0.07, h, m, 0, h / 2, 0, 10); const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), m)); arm.position.set(0.22, h, 0); g.add(arm);
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.34, 6), new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: col(o.glow, '#ffd9a0'), emissiveIntensity: 1.6, roughness: 0.5 })); lan.position.set(0.45, h - 0.2, 0); g.add(lan); const cap = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 6), m)); cap.position.set(0.45, h - 0.01, 0); g.add(cap); return finish(g, o); }
  function chair(g, x, z, ry, c) { const m = mat('wood', { color: c || '#9a7b4f', scale: 0.5 }); const a = new THREE.Group(); rb(a, 0.42, 0.04, 0.42, 0.01, m, 0, 0.45, 0); rb(a, 0.42, 0.45, 0.04, 0.01, m, 0, 0.7, -0.19).rotation.x = -0.1; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((p) => cyl(a, 0.015, 0.015, 0.45, m, p[0] * 0.18, 0.225, p[1] * 0.18, 6)); a.position.set(x, 0, z); a.rotation.y = ry; g.add(a); }
  /** cook.urban.cafeSet({chairs:2-6, umbrella:true, color, umbrellaColor, pos, rotY}) : round table, chairs facing it and a parasol */
  function cafeSet(o) { o = o || {}; const g = new THREE.Group(), n = clamp(Math.floor(num(o.chairs, 4)), 1, 6), tm = mat('wood', { color: o.tableColor || '#b88a55', scale: 0.5 }), im = mat('metal', { color: '#2b2b2b' }); cyl(g, 0.4, 0.4, 0.04, tm, 0, 0.74, 0, 24); cyl(g, 0.03, 0.03, 0.72, im, 0, 0.37, 0, 8); cyl(g, 0.2, 0.2, 0.03, im, 0, 0.02, 0, 16);
    for (let i = 0; i < n; i++) { const a = i / n * 6.283; chair(g, Math.sin(a) * 0.7, Math.cos(a) * 0.7, a + Math.PI, o.chairColor); }
    if (o.umbrella !== false) { cyl(g, 0.02, 0.02, 2.4, im, 0, 1.2, 0, 6); const ca = shadowed(new THREE.Mesh(new THREE.ConeGeometry(num(o.umbrellaR, 1.3), 0.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: col(o.umbrellaColor, '#f2ece0'), roughness: 0.9, side: THREE.DoubleSide }))); ca.position.y = 2.45; g.add(ca); } return finish(g, o); }
  /** cook.urban.bench({pos,rotY}) */
  function bench(o) { o = o || {}; const g = new THREE.Group(), w = mat('wood', { color: o.color || '#a67c52', scale: 0.5 }), m = mat('metal', { color: '#2b2d31' }); for (let i = 0; i < 4; i++) rb(g, 1.5, 0.03, 0.08, 0.01, w, 0, 0.45, -0.18 + i * 0.1); for (let i = 0; i < 3; i++) rb(g, 1.5, 0.03, 0.07, 0.01, w, 0, 0.7 + i * 0.1, -0.24).rotation.x = -0.15; [-1, 1].forEach((s) => { rb(g, 0.04, 0.45, 0.5, 0.01, m, s * 0.7, 0.22, 0); rb(g, 0.04, 0.4, 0.04, 0.01, m, s * 0.7, 0.65, -0.24); }); return finish(g, o); }
  /** cook.urban.fountain({r, tiers, hedge, pos}) : stone basin, animated water, central bowls with a sparkling spray, optional hedge ring */
  function fountain(o) { o = o || {}; const r = num(o.r, 3), g = new THREE.Group(), st = mat('stone', { color: o.color || '#e8e4dc' }); const prof = (R, h, t) => { const pts = [[R, 0], [R, h], [R - t, h], [R - t, h * 0.25], [0.01, h * 0.25]].map((p) => new THREE.Vector2(p[0], p[1])); return new THREE.LatheGeometry(pts, 48); };
    const basin = shadowed(new THREE.Mesh(prof(r, 0.55, 0.28), st)); g.add(basin); const u = { uTime: { value: 0 }, uC: { value: col(o.water, '#5b8fb0') } }; uniformsTime.push(u.uTime);
    const wt = new THREE.Mesh(new THREE.CircleGeometry(r - 0.28, 48), new THREE.ShaderMaterial({ uniforms: u, transparent: true, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform float uTime; uniform vec3 uC; varying vec2 vUv; void main(){ vec2 p = vUv - 0.5; float d = length(p) * 2.0; float rip = 0.5 + 0.5 * sin(d * 40.0 - uTime * 3.0); float e = smoothstep(1.0, 0.85, d); vec3 c = uC * (0.8 + 0.25 * rip) + vec3(0.2) * pow(rip, 6.0) * smoothstep(0.0, 0.5, d); gl_FragColor = vec4(c, 0.88 * e);\n#include <colorspace_fragment>\n }' })); wt.rotation.x = -Math.PI / 2; wt.position.y = 0.42; g.add(wt);
    cyl(g, 0.22, 0.3, 1.2, st, 0, 0.9, 0, 20); const t = Math.max(1, Math.round(num(o.tiers, 2))); for (let i = 0; i < t; i++) { const R2 = r * (0.42 - i * 0.14); const b = shadowed(new THREE.Mesh(prof(R2, 0.28, 0.1), st)); b.position.y = 0.9 + i * 0.7; g.add(b); }
    place(g, o); merge(g); if (o.hedge !== false) hedgeRing({ r: r + 0.7, count: Math.round(r * 9), h: 0.55, pos: [g.position.x, 0, g.position.z], flowers: true, seed: 'fh' }); particles({ kind: 'sparkles', count: 60, area: [0.8, 1.2, 0.8], pos: [g.position.x, 2.1, g.position.z], color: '#dff4ff', size: 0.05, speed: 0.6 }); return g; }
  /** cook.urban.gazebo({r, sides, pos}) : octagonal wooden pavilion with tiled roof */
  function gazebo(o) { o = o || {}; const r = num(o.r, 1.8), n = num(o.sides, 8), g = new THREE.Group(), w = mat('wood', { color: o.color || '#a67c52', scale: 0.6 }), roof = mat('roof', { color: o.roofColor || '#6e5a48' }); cyl(g, r + 0.15, r + 0.15, 0.2, mat('stone', { color: '#d8d2c6' }), 0, 0.1, 0, n);
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + 6.283 / n / 2; cyl(g, 0.05, 0.05, 2.5, w, Math.sin(a) * r * 0.92, 1.45, Math.cos(a) * r * 0.92, 8); const rl = rb(g, 0.04, 0.12, r * 0.8, 0.01, w, Math.sin(a) * r * 0.78, 0.8, Math.cos(a) * r * 0.78); rl.rotation.y = a + 1.57; rl.position.set(Math.sin(a + 3.14 / n) * r * 0.78, 0.8, Math.cos(a + 3.14 / n) * r * 0.78); }
    const rf = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, 1.3, n, 1), roof)); rf.position.y = 3.15; rf.rotation.y = 3.14 / n; g.add(rf); const ring = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 1.0, 0.12, n), w)); ring.position.y = 2.7; g.add(ring); return finish(g, o); }
  /** cook.urban.road({pos,len,w,rotY,sidewalk}) : asphalt strip with dashed centre line and kerbs / paved sidewalks on both sides. Runs along local X. */
  function road(o) { o = o || {}; const len = num(o.len, 40), w = num(o.w, 6), g = new THREE.Group(); const tex = canvasTex((c, s) => { c.fillStyle = hexOf(o.color, '#3b3d42'); c.fillRect(0, 0, s, s); const rr = rng('asph'); for (let i = 0; i < 2500; i++) { c.fillStyle = 'rgba(' + (rr.next() < 0.5 ? '255,255,255' : '0,0,0') + ',' + rr.range(0.03, 0.1) + ')'; c.fillRect(rr.range(0, s), rr.range(0, s), 2, 2); } c.fillStyle = '#e9e5d8'; c.fillRect(20, s / 2 - 3, 110, 6); c.fillRect(0, 4, s, 3); c.fillRect(0, s - 7, s, 3); }); tex.repeat.set(len / 6, 1);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); a.rotation.x = -Math.PI / 2; a.position.y = 0.02; a.receiveShadow = true; g.add(a);
    if (o.sidewalk !== false) { const pv = mat('paving', { color: '#d9d4ca', repeat: [len / 3, 1] }); [-1, 1].forEach((s) => { const sw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 2.6), pv)); sw.position.set(0, 0.08, s * (w / 2 + 1.3)); g.add(sw); const kb = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.18), stdMat('#c9c4b8', 0.9))); kb.position.set(0, 0.09, s * (w / 2 + 0.09)); g.add(kb); }); }
    return finish(g, o); }
  /** cook.urban.paving({pos,w,d,color,tile}) : a paved plaza / terrace floor with grout lines and tone variation */
  function paving(o) { o = o || {}; const w = num(o.w, 20), d = num(o.d, 20), t = num(o.tile, 1.2); const m = mat('paving', { color: o.color || '#cfc9bd', repeat: [w / t / 2, d / t / 2] }); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.copy(P3(o)); p.position.y += 0.03; p.receiveShadow = true; scene.add(p); return p; }
  const nature = { tree, bush, hedgeRing }; const urban = { building, streetLamp, cafeSet, bench, fountain, gazebo, road, paving };

    /* ------------------------------------------------------------------ v4 additions: product-photography helpers */
  /** cook.contactShadow({pos:[x,floorY,z], w, d, opacity, color, follow:heroGroup, offset:[dx,dz]}) : soft radial shadow on a surface under a (floating) product; with follow it shrinks and fades as the product rises. */
  function contactShadow(o) {
    o = o || {}; const p = vec3(o.pos, [0, 0.01, 0]), w = num(o.w, 1.2), d = num(o.d, 0.5); const u = { uO: { value: num(o.opacity, 0.35) }, uC: { value: col(o.color, '#1c1612') } };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, d * 2), new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, fog: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform float uO; uniform vec3 uC; varying vec2 vUv; void main(){ float r = length((vUv - 0.5) * 2.0); float a = pow(smoothstep(1.0, 0.0, r), 1.7) * uO; gl_FragColor = vec4(uC, a);\n#include <colorspace_fragment>\n }' }));
    m.rotation.x = -Math.PI / 2; m.position.copy(p); m.renderOrder = 1; scene.add(m); const off = Array.isArray(o.offset) ? o.offset : [0.08, -0.05];
    if (o.follow) { const h0 = o.follow.position.y - p.y; frameHooks.push(() => { const k = clamp(h0 / Math.max(0.05, o.follow.position.y - p.y), 0.4, 1.6); m.scale.set(k, k, 1); u.uO.value = num(o.opacity, 0.35) * clamp(k * k, 0.3, 1.3); m.position.x = o.follow.position.x + off[0] * (o.follow.position.y - p.y); m.position.z = o.follow.position.z + off[1] * (o.follow.position.y - p.y); }); }
    return m;
  }
  /** cook.env({top,bottom,horizon,sun:{dir:[x,y,z],color,intensity},panels:[{pos,size:[w,h],color,intensity}],intensity}) : procedural studio / sky environment for reflections (PMREM, no HDRI file). Sets scene.environment; softbox panels show up as soft highlights on glossy materials. */
  function env(o) {
    o = o || {}; try {
      const es = new THREE.Scene(), k = num(o.intensity, 0.8), top = col(o.top, '#bcd3ea').multiplyScalar(k), bot = col(o.bottom, '#d9cbb8').multiplyScalar(k), hor = col(o.horizon, '#fff4e6').multiplyScalar(k);
      const sun = o.sun || { dir: [-0.5, 0.7, 0.5], color: '#fff1dc', intensity: 3 }; const sd = vec3(sun.dir, [-0.5, 0.7, 0.5]).normalize();
      es.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { uT: { value: top }, uB: { value: bot }, uH: { value: hor }, uS: { value: sd }, uSC: { value: col(sun.color, '#fff1dc').multiplyScalar(num(sun.intensity, 3)) } }, vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 uT, uB, uH, uS, uSC; varying vec3 v; void main(){ vec3 c = mix(uB, uT, smoothstep(-0.3, 0.8, v.y)); c = mix(c, uH, exp(-abs(v.y) * 5.0) * 0.8); c += uSC * pow(max(dot(v, uS), 0.0), 24.0); gl_FragColor = vec4(c, 1.0); }' })));
      (Array.isArray(o.panels) ? o.panels : [{ pos: [-3, 2.5, 3], size: [2.5, 3], color: '#ffffff', intensity: 4 }, { pos: [3.5, 1.5, 1], size: [1, 3], color: '#ffe8cc', intensity: 2 }]).slice(0, 6).forEach((pn) => { const sz = Array.isArray(pn.size) ? pn.size : [2, 2]; const pl = new THREE.Mesh(new THREE.PlaneGeometry(num(sz[0], 2), num(sz[1], 2)), new THREE.MeshBasicMaterial({ color: col(pn.color, '#ffffff').multiplyScalar(num(pn.intensity, 3)), side: THREE.DoubleSide, toneMapped: false })); pl.position.copy(vec3(pn.pos, [0, 3, 3])); pl.lookAt(0, 0, 0); es.add(pl); });
      const pm = new THREE.PMREMGenerator(renderer); const tx = pm.fromScene(es, 0.03).texture; pm.dispose(); scene.environment = tx; if (LIGHTS.hemi && !o.keepAmbient && !LIGHTS.dimmed) { LIGHTS.hemi.intensity *= 0.55; LIGHTS.dimmed = true; } return tx;
    } catch (e) { warn('env failed: ' + e.message); return null; }
  }
  /** cook.bokeh({count, area:[x,y,z], pos, colors:[...], size, opacity, speed}) : big soft out-of-focus light discs drifting in the background / foreground, like a photographic bokeh. */
  function bokeh(o) {
    o = o || {}; const n = clamp(Math.floor(num(o.count, 40)), 4, 200), area = vec3(o.area, [14, 6, 8]), rr = rng(o.seed || 'bokeh'), cols = list(o.colors, ['#fff1d0', '#ffd9a8', '#cfe4ff']).map((c) => col(c, '#ffffff'));
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3), S = new Float32Array(n), Ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { P[i * 3] = (rr.next() - 0.5) * area.x; P[i * 3 + 1] = (rr.next() - 0.5) * area.y; P[i * 3 + 2] = (rr.next() - 0.5) * area.z; const c = cols[i % cols.length]; C.set([c.r, c.g, c.b], i * 3); S[i] = rr.range(0.5, 1.5); Ph[i] = rr.range(0, 6.28); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('sz', new THREE.BufferAttribute(S, 1)); g.setAttribute('ph', new THREE.BufferAttribute(Ph, 1));
    const u = { uTime: { value: 0 }, uS: { value: num(o.size, 1) * 520 }, uO: { value: num(o.opacity, 0.35) }, uV: { value: num(o.speed, 1) } }; uniformsTime.push(u.uTime);
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexShader: 'attribute vec3 color; attribute float sz, ph; uniform float uTime, uS, uV; varying vec3 vC; varying float vA; void main(){ vC = color; vec3 p = position; p.x += sin(uTime * 0.12 * uV + ph) * 0.6; p.y += cos(uTime * 0.1 * uV + ph * 1.3) * 0.4; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uS * sz / max(1.0, -mv.z); vA = 0.55 + 0.45 * sin(uTime * 0.5 + ph * 3.0); }', fragmentShader: 'uniform float uO; varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float disc = smoothstep(1.0, 0.92, d); float rim = smoothstep(0.55, 0.95, d) * 0.5; gl_FragColor = vec4(vC, disc * (0.35 + rim) * uO * vA);\n#include <colorspace_fragment>\n }' }));
    m.frustumCulled = false; m.position.copy(P3(o)); scene.add(m); return m;
  }
  /** cook.lightPattern({kind:'caustics'|'dapple'|'waves'|'rings'|'blinds', pos, rot:[rx,ry,rz], w, h, color, opacity, speed}) : animated projected light pattern (water caustics, leaf-dappled sun, window blinds ...) on a wall / floor / table: a soft additive plane. */
  function lightPattern(o) {
    o = o || {}; const kinds = { caustics: 0, dapple: 1, waves: 2, rings: 3, blinds: 4 }; const u = { uTime: { value: 0 }, uK: { value: kinds[o.kind] != null ? kinds[o.kind] : 0 }, uC: { value: col(o.color, '#fff3d8') }, uO: { value: num(o.opacity, 0.22) }, uV: { value: num(o.speed, 1) } }; uniformsTime.push(u.uTime);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(num(o.w, 4), num(o.h, 3)), new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform float uTime, uO, uV; uniform int uK; uniform vec3 uC; varying vec2 vUv;\nfloat h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\nfloat n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }\nvoid main(){ vec2 p = vUv; float t = uTime * uV; float a = 0.0; vec2 c = p - 0.5;\n if (uK == 0) { vec2 q = p * 9.0; float v = 0.0; for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 1.3 + t * 0.8), cos(q.x * 1.1 - t * 0.7)) * 0.6; v += abs(sin(q.x) * sin(q.y)); } a = pow(clamp(1.0 - v / 1.6, 0.0, 1.0), 3.0) * 1.8; }\n else if (uK == 1) { float v = n(p * 7.0 + vec2(t * 0.25, t * 0.12)) * 0.65 + n(p * 15.0 - vec2(t * 0.2, 0.0)) * 0.35; a = smoothstep(0.52, 0.7, v); }\n else if (uK == 2) { a = pow(0.5 + 0.5 * sin(p.x * 18.0 + sin(p.y * 6.0 + t) * 2.0 - t * 1.3), 4.0); }\n else if (uK == 3) { a = pow(0.5 + 0.5 * sin(length(c) * 40.0 - t * 2.0), 6.0); }\n else { a = smoothstep(0.35, 0.5, 0.5 + 0.5 * sin((p.y + p.x * 0.35) * 26.0)) * (0.8 + 0.2 * sin(t * 0.4)); }\n a *= smoothstep(0.0, 0.18, p.x) * smoothstep(1.0, 0.82, p.x) * smoothstep(0.0, 0.18, p.y) * smoothstep(1.0, 0.82, p.y);\n gl_FragColor = vec4(uC, a * uO);\n#include <colorspace_fragment>\n}' }));
    m.position.copy(P3(o)); const r = Array.isArray(o.rot) ? o.rot : [-Math.PI / 2, 0, 0]; m.rotation.set(num(r[0], 0), num(r[1], 0), num(r[2], 0)); m.renderOrder = 2; (o.parent || scene).add(m); return m;
  }
  /** cook.intro({duration, exposureFrom, heroes:[screenResult...], heroDelay}) : cinematic reveal: the world fades up from darkness (exposure ramp), then the product fades in. Call after cook.look and after the heroes exist. */
  function intro(o) {
    o = o || {}; const useAE = EXP.on && !EXP.dead; if (useAE) { EXP.base = renderer.toneMappingExposure || EXP.base; EXP.captured = true; } const dur = clamp(num(o.duration, 3.5), 1, 10), from = clamp(num(o.exposureFrom, 0.12), 0, 1), target = renderer.toneMappingExposure, delay = clamp(num(o.heroDelay, 1.0), 0, dur - 0.3), heroes = (Array.isArray(o.heroes) ? o.heroes : o.heroes ? [o.heroes] : []).filter((h) => h && h.mesh && h.mesh.material && h.mesh.material.uniforms);
    const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }; if (useAE) { EXP.intro = from; applyExp(); } else renderer.toneMappingExposure = target * from;
    frameHooks.push((dt, t) => { if (useAE) { EXP.intro = from + (1 - from) * ease(t / dur); } else renderer.toneMappingExposure = target * (from + (1 - from) * ease(t / dur)); heroes.forEach((h) => { h.mesh.material.uniforms.uOpacity.value = ease((t - delay) / Math.max(0.3, dur - delay)); }); if (t > dur + 0.1) { if (useAE) EXP.intro = 1; else renderer.toneMappingExposure = target; heroes.forEach((h) => { h.mesh.material.uniforms.uOpacity.value = 1; }); return 'done'; } });
  }

  /* ------------------------------------------------------------------ v5 additions: underwater look, aquarium, fish, aquatic plants, rocks (learnt from the Amano aquarium study, mobile-light) */
  const AQ = { t: { value: 0 } }; uniformsTime.push(AQ.t);
  const AQ_PARS = 'varying vec3 vAqW; uniform float uAqT, uAqSurf, uAqCaus, uAqScale; uniform vec3 uAqAbs, uAqDeep;\n' +
    'float aqCaus(vec2 p, float t){ vec2 q = p * uAqScale; vec2 i = q; float c = 1.0; float inten = 0.005;\n' +
    '  for (int n = 0; n < 4; n++) { float tt = t * (1.0 - (3.5 / float(n + 1))); i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x)); c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / inten), q.y / (cos(i.y + tt) / inten))); }\n' +
    '  c /= 4.0; c = 1.17 - pow(c, 1.4); return clamp(pow(abs(c), 8.0), 0.0, 1.5); }\n';
  const AQ_APPLY = '{ float aqDepth = max(uAqSurf - vAqW.y, 0.0); float aqIn = 1.0 - smoothstep(-0.01, 0.02, vAqW.y - uAqSurf);\n' +
    '  vec3 aqWn = inverseTransformDirection(normal, viewMatrix); float aqUp = clamp(aqWn.y * 0.5 + 0.5, 0.0, 1.0);\n' +
    '  outgoingLight += diffuseColor.rgb * aqCaus(vAqW.xz, uAqT * 0.6) * uAqCaus * aqUp * aqIn * exp(-aqDepth * 3.0);\n' +
    '  vec3 aqV = vAqW - cameraPosition; float aqDist = length(aqV); vec3 aqD = aqV / max(aqDist, 1e-4);\n' +
    '  float aqPath = cameraPosition.y < uAqSurf ? aqDist * aqIn : aqIn * min(aqDist, aqDepth / max(abs(aqD.y), 0.2));\n' +
    '  vec3 aqTr = exp(-uAqAbs * aqPath); outgoingLight = outgoingLight * aqTr + uAqDeep * (vec3(1.0) - aqTr) * 0.28; }\n';
  /** patches one MeshStandard / Physical material: animated caustics on up-facing surfaces below the water line + per-channel water absorption (red dies first) */
  function aqPatch(m, c) {
    if (!m || !m.isMeshStandardMaterial || m.userData.aqPatched) return; m.userData.aqPatched = true;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    const U = { uAqT: AQ.t, uAqSurf: { value: c.surf }, uAqAbs: { value: c.abs }, uAqDeep: { value: c.deep }, uAqCaus: { value: c.caus }, uAqScale: { value: c.scale } };
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r); Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vAqW;').replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 aqP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n aqP = instanceMatrix * aqP;\n#endif\n vAqW = (modelMatrix * aqP).xyz; }');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + AQ_PARS).replace('#include <opaque_fragment>', AQ_APPLY + '#include <opaque_fragment>');
    };
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|aq'; }; m.needsUpdate = true;
  }
  /** cook.underwater(root, {surfaceY, color, absorb:[r,g,b], caustics, scale}) : gives every standard material under root the underwater look (animated caustics + blue-green absorption below world height surfaceY). */
  function underwater(root, o) {
    o = o || {}; root = root || scene; const a = list(o.absorb, [0.65, 0.2, 0.12]);
    const c = { surf: num(o.surfaceY, 1), abs: new THREE.Vector3(clamp(num(a[0], 0.65), 0, 6), clamp(num(a[1], 0.2), 0, 6), clamp(num(a[2], 0.12), 0, 6)), deep: col(o.color, '#1f7f8c'), caus: clamp(num(o.caustics, 0.55), 0, 2), scale: clamp(num(o.scale, 3.2), 0.5, 12) };
    root.traverse((m) => { if (m.isMesh && m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => aqPatch(mt, c)); }); return root;
  }
  /** glass look: transparent, strong Fresnel edges with a faint aqua tint (cheap, no transmission pass) */
  function aqGlassMat(color) {
    const m = new THREE.MeshStandardMaterial({ color: col(color, '#dff3f0'), roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.4 });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n{ float aqF = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0); gl_FragColor.a = clamp(mix(0.05, 0.8, aqF), 0.0, 1.0); gl_FragColor.rgb += vec3(0.02, 0.09, 0.07) * aqF; }'); };
    m.customProgramCacheKey = () => 'aqglass'; return m;
  }
  /** cook.hardscape({pos,area:[w,d],count,size,color,style:'iwagumi'|'pile',seed,parent}) : faceted stones in the golden-ratio triangle used by aquascapers (one big stone, a smaller one beside it, a third behind). */
  function hardscape(o) {
    o = o || {}; const g = new THREE.Group(), rr = rng((o.seed || 'rock') + 'hs'), ar = list(o.area, [1, 0.4]), W = num(ar[0], 1), D = num(ar[1], 0.4), n = clamp(Math.floor(num(o.count, 4)), 1, 6), S = num(o.size, 0.12);
    const base = col(o.color, '#6e7378'); const place = o.style === 'pile' ? [[0, 0, 1], [0.5, 0.2, 0.7], [-0.5, -0.1, 0.6], [0.15, -0.35, 0.5], [-0.2, 0.3, 0.45], [0.7, -0.2, 0.4]] : [[-0.2, 0.05, 1], [0.12, -0.12, 0.62], [-0.02, 0.2, 0.42], [0.3, 0.12, 0.3], [-0.38, -0.15, 0.28], [0.42, -0.2, 0.22]];
    for (let i = 0; i < n; i++) {
      const p = place[i], s = S * p[2], geo = new THREE.IcosahedronGeometry(1, 2), pa = geo.attributes.position, ph = rr.range(0, 9);
      for (let v = 0; v < pa.count; v++) { const x = pa.getX(v), y = pa.getY(v), z = pa.getZ(v); const k = 1 + 0.28 * Math.sin(x * 3.1 + ph) * Math.cos(z * 2.7 + ph * 0.7) + 0.16 * Math.sin(y * 5 + x * 2 + ph); pa.setXYZ(v, x * k * 1.25, y * k * 0.78, z * k); }
      geo.computeVertexNormals(); const c = base.clone().multiplyScalar(rr.range(0.8, 1.15)); const m = shadowed(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0.02, flatShading: true })));
      m.scale.setScalar(s); m.position.set(p[0] * W * 0.4, s * 0.42, p[1] * D * 0.7); m.rotation.set(rr.range(-0.2, 0.2), rr.range(0, 6.28), rr.range(-0.2, 0.2)); g.add(m);
    }
    g.position.copy(P3(o)); (o.parent || scene).add(g); return g;
  }
  /** cook.aquaticPlants({pos,area:[w,d],count,heights:[min,max],width,color,tip,swayAmt,seed,parent}) : thousands of swaying blades / ribbons in ONE draw call (carpet: heights [0.02,0.05]; meadow: [0.08,0.2]; vallisneria: [0.25,0.45], width 2.5). */
  function aquaticPlants(o) {
    o = o || {}; const rr = rng((o.seed || 'plants') + 'aq'), ar = list(o.area, [0.6, 0.2]), W = num(ar[0], 0.6), D = num(ar[1], 0.2), n = clamp(Math.floor(num(o.count, 900)), 20, 4000), hs = list(o.heights, [0.06, 0.16]), h0 = num(hs[0], 0.06), h1 = Math.max(h0, num(hs[1], 0.16)), wd = 0.012 * clamp(num(o.width, 1), 0.3, 5);
    const SEG = 5, pos = [], cl = [], idx = [], c0 = col(o.color, '#285f2a'), c1 = col(o.tip, '#a5cf5c'), tmp = new THREE.Color();
    for (let s = 0; s <= SEG; s++) { const y = s / SEG, w = wd * (1 - Math.pow(y, 2.2)) * 0.5 + 0.0003; pos.push(-w, y, 0, w, y, 0); tmp.copy(c0).lerp(c1, Math.pow(y, 1.4)); if (y > 0.8) tmp.multiplyScalar(1.1); cl.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b); if (s < SEG) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, emissive: col('#0a200a'), emissiveIntensity: 0.22 }); const sway = clamp(num(o.swayAmt, 0.05), 0, 0.4);
    mt.onBeforeCompile = (sh) => { sh.uniforms.uAqT = AQ.t; sh.uniforms.uSw = { value: sway };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uAqT, uSw;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float aqS = position.y; float aqH = length(instanceMatrix[1].xyz); float aqPh = instanceMatrix[3].x * 9.0 + instanceMatrix[3].z * 7.0;\n transformed.x += (sin(uAqT * 1.3 + aqPh) * 0.7 + sin(uAqT * 2.9 + aqPh * 1.7) * 0.3) * aqS * aqS * uSw * aqH; transformed.z += cos(uAqT * 1.1 + aqPh * 1.3) * aqS * aqS * uSw * 0.5 * aqH; }'); };
    mt.customProgramCacheKey = () => 'aqplants';
    const im = new THREE.InstancedMesh(geo, mt, n), d = new THREE.Object3D(), clusters = Math.max(2, Math.round(W / 0.12)); const cx = [], cz = [], ch = [];
    for (let i = 0; i < clusters; i++) { cx.push((rr.next() - 0.5) * W); cz.push((rr.next() - 0.5) * D); ch.push(rr.range(0.6, 1)); }
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rr.next() * clusters), sp = 0.07 + 0.05 * rr.next(); const x = clamp(cx[k] + (rr.next() - 0.5) * sp * 2 + (rr.next() - 0.5) * W * 0.25, -W / 2, W / 2), z = clamp(cz[k] + (rr.next() - 0.5) * sp + (rr.next() - 0.5) * D * 0.4, -D / 2, D / 2); const h = rr.range(h0, h1) * (0.65 + 0.35 * ch[k]);
      d.position.set(x, 0, z); d.rotation.set(rr.range(-0.18, 0.18), rr.range(0, 6.28), rr.range(-0.2, 0.2)); d.scale.set(rr.range(0.8, 1.3), h, 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); tmp.setScalar(rr.range(0.78, 1.18)); tmp.g *= rr.range(0.95, 1.1); im.setColorAt(i, tmp);
    }
    im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.position.copy(P3(o)); (o.parent || scene).add(im); used.props++; return im;
  }
  /** cook.fish({pos,size,count,bounds:[w,h,d],colors,species:'tetra'|'round'|'gold',speed,spread,seed,parent}) : an instanced school (1 draw call) with tail wag in the vertex shader and a gentle Lissajous school path. Returns the InstancedMesh. */
  function fish(o) {
    o = o || {}; const rr = rng((o.seed || 'fish') + 'sc'), n = clamp(Math.floor(num(o.count, 10)), 1, 40), sz = clamp(num(o.size, 0.05), 0.01, 1), bd = list(o.bounds, [0.8, 0.3, 0.3]), BW = num(bd[0], 0.8), BH = num(bd[1], 0.3), BD = num(bd[2], 0.3), sp = clamp(num(o.speed, 1), 0.1, 4);
    const sps = { tetra: { hy: 0.2, wz: 0.12, c: ['#26405e', '#d8e6ee', '#26e0ff', '#ff4a3a'] }, round: { hy: 0.5, wz: 0.1, c: ['#d9a441', '#f4e2b0', '#e8704a', '#e8704a'] }, gold: { hy: 0.34, wz: 0.2, c: ['#ff7a1a', '#ffd9a0', '#ff9a3c', '#ff6a1a'] }, koi: { hy: 0.3, wz: 0.2, c: ['#f2efe8', '#ffffff', '#f2efe8', '#f2efe8'] } }; const S = sps[o.species] || sps.tetra, cc = list(o.colors, S.c).map((c) => col(c, '#ffffff'));
    const P = [], C = [], T = [], I = [], NX = 28, NR = 10; const pk = (i) => cc[Math.min(i, cc.length - 1)];
    for (let i = 0; i <= NX; i++) { const x = -0.5 + i / NX, u = (x + 0.5), r = Math.pow(Math.max(0, 1 - Math.pow((x + 0.12) * (x < -0.12 ? 1.5 : 1.9), 2)), 0.55); const rad = Math.max(r, 0.015);
      for (let j = 0; j < NR; j++) { const a = (j / NR) * 6.2832, y = Math.sin(a) * rad * S.hy, z = Math.cos(a) * rad * S.wz; P.push(x, y, z); const yn = Math.sin(a); const k = pk(0).clone().lerp(pk(1), smooth01((-yn + 0.2) * 1.2)); if (cc.length > 2 && Math.abs(yn * 0.9 + 0.1) < 0.28 && u > 0.2 && u < 0.85) k.lerp(pk(2), 0.85); if (u < 0.14 && cc.length > 3) k.lerp(pk(3), 0.5); C.push(k.r, k.g, k.b); T.push(clamp((-x - 0.2) / 0.3, 0, 1)); } }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NR; j++) { const a = i * NR + j, b = i * NR + (j + 1) % NR, c2 = (i + 1) * NR + j, d2 = (i + 1) * NR + (j + 1) % NR; I.push(a, c2, b, b, c2, d2); }
    const addFin = (pts, color, tailv) => { const b0 = P.length / 3; pts.forEach((p) => { P.push(p[0], p[1], p[2]); C.push(color.r, color.g, color.b); T.push(tailv(p)); }); I.push(b0, b0 + 1, b0 + 2); I.push(b0, b0 + 2, b0 + 1); };
    const tail = pk(cc.length > 3 ? 3 : 1).clone().multiplyScalar(0.9); addFin([[-0.42, 0, 0], [-0.72, 0.2 * (S.hy + 0.5), 0], [-0.72, -0.2 * (S.hy + 0.5), 0]], tail, (p) => clamp((-p[0] - 0.2) / 0.3, 0, 1)); addFin([[-0.15, S.hy * 0.45, 0], [-0.3, S.hy * 0.9, 0], [0.0, S.hy * 0.45, 0]], pk(0).clone(), (p) => clamp((-p[0] - 0.1) / 0.3, 0, 1));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setAttribute('aTail', new THREE.Float32BufferAttribute(T, 1)); geo.setIndex(I); geo.computeVertexNormals();
    const mt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, side: THREE.DoubleSide });
    mt.onBeforeCompile = (sh) => { sh.uniforms.uAqT = AQ.t; sh.uniforms.uSp = { value: sp };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uAqT, uSp; attribute float aTail;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float aqPh = instanceMatrix[3].x * 11.0 + instanceMatrix[3].z * 5.0; transformed.z += sin(uAqT * 9.0 * uSp + aqPh - position.x * 7.0) * aTail * aTail * 0.2; }'); };
    const isKoi = o.species === 'koi';
    if (isKoi) { const base = mt.onBeforeCompile; mt.onBeforeCompile = (sh) => { base(sh); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKP; varying float vKS;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKP = position; vKS = fract(sin(dot(instanceMatrix[3].xz + instanceMatrix[3].y, vec2(12.9898, 78.233))) * 43758.5453);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vKP; varying float vKS;').replace('#include <color_fragment>', '#include <color_fragment>\n{ float n = sin(vKP.x * 9.0 + vKS * 40.0) * sin(vKP.z * 12.0 + vKP.y * 9.0 + vKS * 23.0) + 0.5 * sin(vKP.x * 19.0 - vKS * 11.0 + vKP.y * 11.0); float red = smoothstep(0.02, 0.22, n) * smoothstep(-0.55, -0.4, vKP.x);\n  float blk = smoothstep(0.5, 0.65, sin(vKP.x * 6.0 + vKS * 17.0 + 3.0) * sin(vKP.z * 8.0 + vKS * 9.0 + vKP.y * 5.0)) * step(0.55, vKS); vec3 wh = vec3(0.93, 0.92, 0.86); vec3 rd = mix(vec3(0.82, 0.16, 0.05), vec3(0.9, 0.5, 0.08), step(0.75, fract(vKS * 7.0)));\n  vec3 kc = mix(wh, rd, red); kc = mix(kc, vec3(0.03), blk); diffuseColor.rgb = kc * (0.75 + 0.25 * smoothstep(-0.2, 0.3, vKP.y + 0.1)); }'); }; }
    mt.customProgramCacheKey = () => (isKoi ? 'aqkoi' : 'aqfish'); const im = new THREE.InstancedMesh(geo, mt, n), dum = new THREE.Object3D(); const par = [];
    const spread = clamp(num(o.spread, 0.12), 0.02, 0.6); for (let i = 0; i < n; i++) { par.push({ ox: rr.range(-1, 1) * BW * spread, oy: rr.range(-1, 1) * BH * spread * 0.8, oz: rr.range(-1, 1) * BD * spread, f: rr.range(0.7, 1.3), p: rr.range(0, 6.28), s: rr.range(0.8, 1.2) }); tmpCol.setScalar(rr.range(0.85, 1.12)); im.setColorAt(i, tmpCol); }
    const ax = BW * (0.5 - spread * 1.1) * 0.9, ay = BH * (0.5 - spread * 0.9) * 0.9, az = BD * (0.5 - spread * 1.1) * 0.9, q = new THREE.Vector3(), q2 = new THREE.Vector3();
    const at = (p, t, v) => v.set(Math.sin(t * 0.21 * sp * p.f + p.p) * ax + p.ox * (1 + 0.3 * Math.sin(t * 0.5 + p.p)), Math.sin(t * 0.17 * sp + p.p * 1.3) * ay + p.oy, Math.sin(t * 0.13 * sp * p.f + p.p * 0.7 + 1.1) * az + p.oz);
    const upd = (t) => { for (let i = 0; i < n; i++) { const p = par[i]; at(p, t, q); at(p, t + 0.08, q2); q2.sub(q); const L = q2.length() || 1; dum.position.copy(q); dum.rotation.set(0, Math.atan2(-q2.z, q2.x), Math.asin(clamp(q2.y / L, -1, 1)) * 0.7, 'YZX'); dum.scale.setScalar(sz * p.s); dum.updateMatrix(); im.setMatrixAt(i, dum.matrix); } im.instanceMatrix.needsUpdate = true; };
    upd(0); frameHooks.push((dt, t) => upd(t)); im.frustumCulled = false; im.castShadow = true; im.position.copy(P3(o)); (o.parent || scene).add(im); used.props++; return im;
  }
  const tmpCol = new THREE.Color(); const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  /** cook.aquarium({pos,rotY,w,h,d,fill,cabinet,light,fish,species,fishColors,plants,rocks,substrate,waterColor,caustics,bubbles,backdrop,seed,parent}) : a complete glass aquarium on a cabinet: glass with Fresnel edges, water tint, sculpted substrate, stones, swaying plants, a fish school, bubbles, LED hood + spot light, underwater caustics / absorption on everything inside. Returns the group; group.userData = {surfaceY (world), inner:{x0,x1,z0,z1,y0,y1} in group space}. */
  function aquarium(o) {
    o = o || {}; const W = clamp(num(o.w, 1.2), 0.3, 4), H = clamp(num(o.h, 0.55), 0.2, 2), D = clamp(num(o.d, 0.5), 0.2, 2), fill = clamp(num(o.fill, 0.92), 0.5, 1), seed = o.seed || 'aquarium', rr = rng(seed + 'aqm');
    const g = new THREE.Group(), cab = o.cabinet !== false, cabH = cab ? clamp(num(o.cabinetH, 0.62), 0.2, 1.5) : 0, t = 0.008, wH = H * fill, subY = 0.05; const wcol = col(o.waterColor, '#2f98a8');
    g.position.copy(P3(o)); g.rotation.y = num(o.rotY, 0); (o.parent || scene).add(g);
    if (cab) { const wm = mat('wood', { color: o.cabinetColor || '#3b2a1f', scale: 1.2, rough: 0.5 }); rb(g, W + 0.06, cabH, D + 0.06, 0.012, wm, 0, cabH / 2, 0); const dk = stdMat('#15171a', 0.6, 0.1); rb(g, W + 0.075, 0.03, D + 0.075, 0.008, dk, 0, cabH + 0.015, 0); rb(g, W + 0.02, 0.02, D + 0.02, 0.005, dk, 0, 0.01, 0); g.userData.baseY = cabH + 0.03; } const y0 = cabH + (cab ? 0.03 : 0);
    const gm = aqGlassMat(o.glassColor); const pane = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gm); m.position.set(x, y0 + y, z); m.renderOrder = 3; g.add(m); };
    pane(W, H, t, 0, H / 2, D / 2); pane(W, H, t, 0, H / 2, -D / 2); pane(t, H, D, W / 2, H / 2, 0); pane(t, H, D, -W / 2, H / 2, 0); const trim = stdMat('#0d0f11', 0.5, 0.2); [[W, 0.012, 0.012, 0, H, D / 2], [W, 0.012, 0.012, 0, H, -D / 2], [0.012, 0.012, D, W / 2, H, 0], [0.012, 0.012, D, -W / 2, H, 0], [W, 0.012, 0.012, 0, 0.006, D / 2], [W, 0.012, 0.012, 0, 0.006, -D / 2]].forEach((p) => { const m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], p[2]), trim); m.position.set(p[3], y0 + p[4], p[5]); g.add(m); });
    const bgc = col(o.backdrop, '#0b3b44'); const bgT = canvasTex((c, s) => { const gr = c.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#' + bgc.clone().multiplyScalar(1.6).getHexString()); gr.addColorStop(1, '#' + bgc.clone().multiplyScalar(0.35).getHexString()); c.fillStyle = gr; c.fillRect(0, 0, s, s); }); const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, H - 0.02), new THREE.MeshBasicMaterial({ map: bgT, fog: false })); back.position.set(0, y0 + H / 2, -D / 2 + 0.006); g.add(back);
    const iw = W - 2 * t - 0.004, id = D - 2 * t - 0.004, water = new THREE.Mesh(new THREE.BoxGeometry(iw, wH, id), new THREE.MeshBasicMaterial({ color: wcol, transparent: true, opacity: 0.1, depthWrite: false, fog: false })); water.position.set(0, y0 + wH / 2, 0); water.renderOrder = 2; g.add(water);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(iw, id), new THREE.MeshStandardMaterial({ color: wcol, roughness: 0.03, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 })); surf.rotation.x = -Math.PI / 2; surf.position.set(0, y0 + wH, 0); surf.renderOrder = 4; g.add(surf);
    const inner = new THREE.Group(); inner.position.y = y0; g.add(inner);
    const gw = iw, gd = id, geo = new THREE.PlaneGeometry(gw, gd, 56, 22); geo.rotateX(-Math.PI / 2); const pa = geo.attributes.position; const ph = rr.range(0, 9); for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), zz = (z / gd + 0.5); pa.setY(i, subY * (0.5 + 0.9 * (1 - zz)) + 0.012 * Math.sin(x * 14 + ph) * Math.cos(z * 11 + ph) + 0.02 * Math.sin(x * 4 + ph * 0.6) * (1 - zz) + 0.016 * Math.max(0, Math.sin(x * 5 - 1)) ); } geo.computeVertexNormals();
    const sm = mat('stone', { color: o.substrate || '#a89878', scale: 0.25, rough: 0.95 }); sm.map.repeat.set(9, 4); const sub = new THREE.Mesh(geo, sm); sub.receiveShadow = true; inner.add(sub);
    if (o.rocks !== false) hardscape({ parent: inner, pos: [-W * 0.06, subY * 0.9, -D * 0.05], area: [W * 0.8, D * 0.5], count: 4, size: Math.min(W, H * 1.6) * 0.16, seed });
    if (o.plants !== false) { aquaticPlants({ parent: inner, pos: [0, subY * 0.8, D * 0.3], area: [W * 0.78, D * 0.18], count: Math.round(900 * W), heights: [0.015, 0.04], width: 1.6, color: '#1e5a2a', tip: '#7ec25a', seed: seed + 'c' }); aquaticPlants({ parent: inner, pos: [0, subY * 1.2, -D * 0.12], area: [W * 0.8, D * 0.34], count: Math.round(700 * W), heights: [H * 0.12, H * 0.3], width: 1.2, color: '#2a6a2a', tip: '#8fbf50', seed: seed + 'm' }); aquaticPlants({ parent: inner, pos: [0, subY * 1.4, -D * 0.34], area: [W * 0.85, D * 0.12], count: Math.round(260 * W), heights: [H * 0.4, H * 0.72], width: 3, color: '#2c7a38', tip: '#a9cf5e', swayAmt: 0.09, seed: seed + 'b' }); }
    let school = null; const nf = clamp(Math.floor(num(o.fish, 10)), 0, 40); if (nf > 0) school = fish({ parent: inner, pos: [0, wH * 0.62, 0], count: nf, bounds: [iw * 0.92, wH * 0.5, id * 0.8], size: clamp(num(o.fishSize, H * 0.085), 0.015, 0.2), species: o.species, colors: o.fishColors, seed });
    if (o.bubbles !== false && used.particles < LIMITS.particles - 40) particles({ kind: 'bubbles', count: 36, area: [0.03, wH * 0.95, 0.03], pos: [W * 0.36, y0 + wH * 0.5, -D * 0.28], size: 0.2, parent: g, seed });
    if (o.light !== false) { const hood = stdMat('#101214', 0.4, 0.4); rb(g, W + 0.02, 0.025, D * 0.5, 0.008, hood, 0, y0 + H + 0.03, -D * 0.12); const led = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, D * 0.34), new THREE.MeshBasicMaterial({ color: '#fff6e6', fog: false })); led.rotation.x = Math.PI / 2; led.position.set(0, y0 + H + 0.0165, -D * 0.12); g.add(led); if (used.lights < LIMITS.lights) { used.lights++; const sl = new THREE.SpotLight(col('#fff3e0'), clamp(num(o.lightIntensity, 16), 0, 200), 3, 1.0, 0.85, 1.6); sl.position.set(0, y0 + H + 0.2, -D * 0.1); sl.target.position.set(0, y0, -D * 0.05); g.add(sl); g.add(sl.target); } }
    g.updateMatrixWorld(true); const wp = new THREE.Vector3(); g.getWorldPosition(wp); const surfaceY = wp.y + y0 + wH; underwater(inner, { surfaceY, color: wcol, caustics: num(o.caustics, 0.4), absorb: [0.7, 0.22, 0.14], scale: 3.4 });
    g.userData = { surfaceY, tankTopY: y0 + H, inner: { x0: -iw / 2, x1: iw / 2, z0: -id / 2, z1: id / 2, y0, y1: y0 + wH }, fish: school }; used.props++; return g;
  }

  /* ------------------------------------------------------------------ v6 additions: physical sky + sun, koi, lily pads, pond kit, Japanese garden props (learnt from the koi-pond study, mobile-light) */
  const kelvinRGB = (K) => { const t = K / 100; let r, g, b; r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592); g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; return new THREE.Color(clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255).convertSRGBToLinear(); };
  /** cook.sunAt(hour, azimuthDeg) : sun for a time of day (6..18 h): {dir:[x,y,z], pos:[x,y,z] (60 m away), color:'#hex', elevation (deg), intensity}. Use pos / color / intensity in cook.lights. */
  function sunAt(hour, az) {
    const h = clamp(num(hour, 11), 5.5, 18.5), el = Math.max(2, 74 * Math.sin(Math.PI * (h - 6) / 12)) * Math.PI / 180, a = num(az, 55) * Math.PI / 180, d = new THREE.Vector3(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a));
    const c = kelvinRGB(2300 + 4300 * Math.pow(Math.sin(el), 0.6)); c.convertLinearToSRGB(); return { dir: [d.x, d.y, d.z], pos: [d.x * 60, d.y * 60, d.z * 60], color: '#' + c.getHexString(), elevation: el * 180 / Math.PI, intensity: 0.7 + 1.5 * Math.sin(el) };
  }
  /** cook.skyPhysical({hour,azimuth,turbidity,clouds:0..1,cloudSpeed,sunDisk,fog}) : analytic daylight sky (Preetham: blue zenith, warm horizon, correct sunset) + soft moving cloud deck. Returns {dome, sun} (sun = cook.sunAt(...)). */
  function skyPhysical(o) {
    o = o || {}; const sun = sunAt(o.hour, o.azimuth), su = new THREE.Vector3(sun.dir[0], sun.dir[1], sun.dir[2]); const u = { uSun: { value: su }, uTurb: { value: clamp(num(o.turbidity, 2.4), 0.5, 10) }, uCloud: { value: clamp(num(o.clouds, 0.45), 0, 1) }, uCs: { value: clamp(num(o.cloudSpeed, 1), 0, 5) }, uDisk: { value: o.sunDisk === false ? 0 : 1 }, uT: { value: 0 } }; uniformsTime.push(u.uT);
    const frag = 'uniform vec3 uSun; uniform float uTurb, uCloud, uCs, uDisk, uT; varying vec3 vW;\n' +
      'const float PI = 3.14159265; const vec3 LAM = vec3(680E-9, 550E-9, 450E-9); const vec3 KK = vec3(0.686, 0.678, 0.666);\n' +
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }\n' +
      'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }\n' +
      'void main(){ vec3 dir = normalize(vW); vec3 up = vec3(0.0, 1.0, 0.0); float sunE = 1000.0 * max(0.0, 1.0 - exp(-((PI / 1.95 - acos(clamp(uSun.y, -1.0, 1.0))) / 1.5)));\n' +
      '  vec3 betaR = (8.0 * pow(PI, 3.0) * pow(pow(1.0003, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * 0.035)) / (3.0 * 2.545E25 * pow(LAM, vec3(4.0)) * (6.0 - 7.0 * 0.035)) * 1.0;\n' +
      '  float c = (0.2 * uTurb) * 10E-18; vec3 betaM = 0.434 * c * PI * pow((2.0 * PI) / LAM, vec3(2.0)) * KK * 0.005;\n' +
      '  float zen = acos(max(0.0, dot(up, dir))); float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - ((zen * 180.0) / PI), -1.253)); vec3 Fex = exp(-(betaR * 8.4E3 * inv + betaM * 1.25E3 * inv));\n' +
      '  float cosT = dot(dir, uSun); float rPh = 3.0 / (16.0 * PI) * (1.0 + pow(cosT * 0.5 + 0.5, 2.0)); float g = 0.8; float mPh = 1.0 / (4.0 * PI) * ((1.0 - g * g) / pow(1.0 - 2.0 * g * cosT + g * g, 1.5));\n' +
      '  vec3 bT = (betaR * rPh + betaM * mPh) / (betaR + betaM); vec3 Lin = pow(sunE * bT * (1.0 - Fex), vec3(1.5)); Lin *= mix(vec3(1.0), pow(sunE * bT * Fex, vec3(0.5)), clamp(pow(1.0 - dot(up, uSun), 5.0), 0.0, 1.0));\n' +
      '  vec3 L0 = vec3(0.1) * Fex + (sunE * 19000.0 * Fex) * smoothstep(0.999956, 0.999958, cosT) * uDisk; float fade = 1.0 - clamp(1.0 - exp(uSun.y * 0.2), 0.0, 1.0);\n' +
      '  vec3 col = pow((Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075), vec3(1.0 / (1.2 + 1.2 * fade)));\n' +
      '  col = mix(vec3(dot(col, vec3(0.333))), col, 1.25);\n' +
      '  if (dir.y > 0.01 && uCloud > 0.001) { vec2 q = dir.xz / (dir.y + 0.12) * 0.7 + vec2(uT * 0.004 * uCs, uT * 0.0016 * uCs); float f = fbm(q * 1.6); float cl = smoothstep(1.0 - uCloud * 0.75, 1.0 - uCloud * 0.75 + 0.28, f); float dens = fbm(q * 1.6 + uSun.xz * 0.35);\n' +
      '    vec3 lit = mix(vec3(0.55, 0.58, 0.65), vec3(1.0, 0.97, 0.92), clamp(1.15 - dens + max(uSun.y, 0.0) * 0.4, 0.0, 1.0)); lit *= 0.35 + 1.1 * smoothstep(-0.1, 0.5, uSun.y); col = mix(col, lit * 0.9, cl * smoothstep(0.01, 0.2, dir.y) * 0.9); }\n' +
      '  if (dir.y < 0.0) col = mix(col, col * 0.55 + vec3(0.02, 0.025, 0.03), smoothstep(0.0, -0.25, dir.y)); gl_FragColor = vec4(col, 1.0); }';
    const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u, vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: frag }));
    dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome); frameHooks.push(() => { dome.position.copy(camera.position); });
    const warm = clamp(1 - sun.elevation / 40, 0, 1), fc = new THREE.Color('#cfe2f2').lerp(new THREE.Color('#f2cba0'), warm * 0.8); scene.background = fc.clone(); if (o.fog !== false) scene.fog = new THREE.Fog(fc.clone(), num(o.fogNear, 40), num(o.fogFar, 220));
    return { dome, sun };
  }
  /** cook.lilyPads({pos,area:[w,d],count,size,colors,flowers,flowerColors,seed,parent}) : floating notched lily pads (cupped, gently bobbing) and optional water-lily / lotus flowers, each one draw call. Returns the group. */
  function lilyPads(o) {
    o = o || {}; const rr = rng((o.seed || 'lily') + 'lp'), ar = list(o.area, [1.6, 1.0]), W = num(ar[0], 1.6), D = num(ar[1], 1), n = clamp(Math.floor(num(o.count, 18)), 1, 200), sz = clamp(num(o.size, 0.16), 0.03, 1.5), g = new THREE.Group(); const cols = list(o.colors, ['#2f6f34', '#3e8a3a', '#527a2e']).map((c) => col(c, '#3a7a3a'));
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.absarc(0, 0, 1, 0.16, Math.PI * 2 - 0.16, false); sh.lineTo(0, 0); const pg = new THREE.ShapeGeometry(sh, 24); pg.rotateX(-Math.PI / 2); const pp = pg.attributes.position, pc = []; for (let i = 0; i < pp.count; i++) { const r = Math.hypot(pp.getX(i), pp.getZ(i)); pp.setY(i, r * r * 0.1); const k = 1.15 - 0.4 * r; pc.push(k, k, k); } pg.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3)); pg.computeVertexNormals();
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, side: THREE.DoubleSide, emissive: col('#0c2a10'), emissiveIntensity: 0.25 });
    pm.onBeforeCompile = (s) => { s.uniforms.uAqT = AQ.t; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uAqT;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float ph = instanceMatrix[3].x * 7.0 + instanceMatrix[3].z * 5.0; transformed.y += sin(uAqT * 0.9 + ph) * 0.02; transformed.x += sin(uAqT * 0.6 + ph) * 0.01; }'); }; pm.customProgramCacheKey = () => 'lilypad';
    const im = new THREE.InstancedMesh(pg, pm, n), d = new THREE.Object3D(), spots = [], tmp = new THREE.Color();
    for (let i = 0; i < n; i++) { let x = 0, z = 0, s = sz * rr.range(0.6, 1.25), ok = false; for (let t = 0; t < 14 && !ok; t++) { x = (rr.next() - 0.5) * W; z = (rr.next() - 0.5) * D; ok = (2 * x / W) ** 2 + (2 * z / D) ** 2 < 1 && spots.every((p) => Math.hypot(p[0] - x, p[1] - z) > (p[2] + s) * 0.85); } spots.push([x, z, s]); d.position.set(x, 0, z); d.rotation.set(rr.range(-0.04, 0.04), rr.range(0, 6.28), rr.range(-0.04, 0.04)); d.scale.setScalar(s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); tmp.copy(cols[i % cols.length]).multiplyScalar(rr.range(0.8, 1.2)); im.setColorAt(i, tmp); }
    im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
    const nf = clamp(Math.floor(num(o.flowers, 3)), 0, 30); if (nf > 0) {
      const fc = list(o.flowerColors, ['#ff9fc0']).map((c) => col(c, '#ff9fc0')), P = [], C = [], I = [], petal = new THREE.SphereGeometry(1, 8, 6), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      [[6, 0.55, 0.5, 0.0, 0.06], [6, 0.42, 0.75, 0.52, 0.09], [5, 0.3, 1.05, 0.2, 0.11]].forEach((L, li) => { for (let k = 0; k < L[0]; k++) { const a = (k / L[0]) * 6.2832 + L[3]; e.set(0, -a, -L[2], 'YZX'); q.setFromEuler(e); mt.compose(new THREE.Vector3(Math.cos(a) * 0.1, 0.03 + li * 0.02, Math.sin(a) * 0.1), q, new THREE.Vector3(L[1], 0.07, 0.17)); const base = P.length / 3; const pa = petal.attributes.position; for (let v = 0; v < pa.count; v++) { const p = new THREE.Vector3(pa.getX(v), pa.getY(v), pa.getZ(v)).applyMatrix4(mt); P.push(p.x, p.y, p.z); const tip = clamp((pa.getX(v) + 1) / 2, 0, 1); C.push(1, 1 - 0.55 * tip * (li === 0 ? 1 : 0.6), 1 - 0.4 * tip); } petal.index.array.forEach((ix) => I.push(base + ix)); } });
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); fg.setIndex(I); fg.computeVertexNormals(); const gold = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: '#f2c23a', emissive: '#7a5a00', emissiveIntensity: 0.5 }));
      const fim = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide, emissive: col('#401020'), emissiveIntensity: 0.15 }), nf); const gim = new THREE.InstancedMesh(gold.geometry, gold.material, nf);
      for (let i = 0; i < nf; i++) { const sp = spots[i % spots.length]; d.position.set(sp[0] + 0.02, 0.03, sp[1]); d.rotation.set(0, rr.range(0, 6.28), 0); d.scale.setScalar(sz * rr.range(1.0, 1.5)); d.updateMatrix(); fim.setMatrixAt(i, d.matrix); tmp.copy(fc[i % fc.length]); fim.setColorAt(i, tmp.clone().lerp(new THREE.Color('#ffffff'), 0.35)); d.position.y += 0.05 * d.scale.x; d.scale.setScalar(sz * 1.2); d.updateMatrix(); gim.setMatrixAt(i, d.matrix); }
      fim.instanceMatrix.needsUpdate = true; gim.instanceMatrix.needsUpdate = true; fim.frustumCulled = gim.frustumCulled = false; g.add(fim); g.add(gim);
    }
    g.position.copy(P3(o)); (o.parent || scene).add(g); used.props++; return g;
  }
  /* holes in ground discs (a pond / pool is cut out of cook.ground, in either creation order): up to 3, shared uniforms */
  const HOLE_A = [0, 1, 2].map(() => new THREE.Vector4(0, 0, 1, 1)), HOLE_B = [0, 1, 2].map(() => new THREE.Vector4(0, 0, 0, 1.4)); let holeN = 0;
  function patchGround(m) {
    const mt = m.material; mt.onBeforeCompile = (sh) => { sh.uniforms.uHA = { value: HOLE_A }; sh.uniforms.uHB = { value: HOLE_B };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; uniform vec4 uHA[3]; uniform vec4 uHB[3];').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfor (int i = 0; i < 3; i++) { if (uHB[i].z > 0.5) { vec2 d = (vGW.xz - uHA[i].xy) / uHA[i].zw; float a = atan(d.y, d.x); float k = 1.0 + 0.1 * sin(3.0 * a + uHB[i].x) + 0.07 * sin(5.0 * a + uHB[i].y) + 0.04 * sin(8.0 * a + uHB[i].x * 2.0); if (length(d) < uHB[i].w * k) discard; } }'); };
    mt.customProgramCacheKey = () => 'groundholes';
  }
  /** cook.pond({pos,rx,rz,depth,fish,fishSize,pads,flowers,stones,waterColor,gravel,clarity,seed,parent}) : a koi pond: irregular shoreline, sculpted gravel basin (darker and greener in the deep), a ring of boulders, a wavy reflective water surface with Fresnel + animated normals, caustics + absorption below, lily pads / lotus flowers, a school of KOI. Returns the group; userData {surfaceY (world), rx, rz, shore(theta) -> radius factor}. About 12 draw calls. */
  function pond(o) {
    o = o || {}; const rx = clamp(num(o.rx, 1.8), 0.5, 20), rz = clamp(num(o.rz, 1.2), 0.4, 20), dp = clamp(num(o.depth, 0.5), 0.15, 3), seed = o.seed || 'pond', rr = rng(seed + 'pd'), ph1 = rr.range(0, 6), ph2 = rr.range(0, 6);
    const shore = (a) => 1 + 0.1 * Math.sin(3 * a + ph1) + 0.07 * Math.sin(5 * a + ph2) + 0.04 * Math.sin(8 * a + ph1 * 2), g = new THREE.Group(); g.position.copy(P3(o)); (o.parent || scene).add(g);
    const RS = 26, AS = 72, bank = 1.45; const buildPolar = (fn, outer) => { const P = [], C = [], U = [], I = []; for (let i = 0; i <= RS; i++) { const t = i / RS; for (let j = 0; j <= AS; j++) { const a = (j / AS) * 6.2832, k = shore(a), r = t * outer * k; const x = Math.cos(a) * r * rx, z = Math.sin(a) * r * rz; const o2 = fn(t * outer, a, x, z); P.push(x, o2[0], z); C.push(o2[1], o2[2], o2[3]); U.push(x * 1.4, z * 1.4); } } for (let i = 0; i < RS; i++) for (let j = 0; j < AS; j++) { const a = i * (AS + 1) + j, b = a + 1, c = a + AS + 1, d = c + 1; I.push(a, b, c, b, d, c); } const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); ge.setIndex(I); ge.computeVertexNormals(); return ge; };
    const gv = col(o.gravel, '#9c9080'), deepc = new THREE.Color('#2f3a2a');
    const basin = buildPolar((t, a, x, z) => { const s = Math.min(t, 1), bowl = -dp * (1 - Math.pow(s, 2.2)) * (t <= 1 ? 1 : 0); const bankH = t > 1 ? 0.05 * Math.min(1, (t - 1) / 0.12) + 0.01 * Math.sin(x * 4 + z * 3) : 0; const rim = t <= 1 ? 0 : 0; const dd = clamp(1 - s, 0, 1); const c = gv.clone().lerp(deepc, Math.pow(dd, 1.3) * 0.75); if (t > 1) { const f = Math.min(1, (t - 1) / 0.45); c.lerp(new THREE.Color('#5a4a34'), 0.55).lerp(new THREE.Color('#5d8a42'), f); c.multiplyScalar(0.8); } return [bowl + bankH + rim, c.r, c.g, c.b]; }, bank);
    const bm = mat('stone', { color: '#ffffff', scale: 0.3, rough: 0.92 }); bm.vertexColors = true; bm.map.repeat.set(5, 5); const bas = new THREE.Mesh(basin, bm); bas.receiveShadow = true; g.add(bas);
    const nS = clamp(Math.floor(num(o.stones, 34)), 0, 90); if (nS > 0) { const sg = new THREE.IcosahedronGeometry(1, 1), sp = sg.attributes.position; for (let v = 0; v < sp.count; v++) { const k = 1 + 0.18 * Math.sin(sp.getX(v) * 4 + sp.getZ(v) * 3); sp.setXYZ(v, sp.getX(v) * k * 1.2, sp.getY(v) * k * 0.7, sp.getZ(v) * k); } sg.computeVertexNormals(); const sm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }); const ims = new THREE.InstancedMesh(sg, sm, nS), d = new THREE.Object3D(), tc = new THREE.Color(); for (let i = 0; i < nS; i++) { const a = (i / nS) * 6.2832 + rr.range(-0.05, 0.05), r = 1.03 + rr.range(-0.02, 0.08), s = rr.range(0.09, 0.2) * Math.min(rx, rz) / 1.2 + 0.05; d.position.set(Math.cos(a) * r * shore(a) * rx, s * 0.18, Math.sin(a) * r * shore(a) * rz); d.rotation.set(rr.range(-0.3, 0.3), rr.range(0, 6.28), rr.range(-0.3, 0.3)); d.scale.set(s * rr.range(0.9, 1.5), s * rr.range(0.7, 1.0), s * rr.range(0.9, 1.3)); d.updateMatrix(); ims.setMatrixAt(i, d.matrix); tc.set('#7d7a74').multiplyScalar(rr.range(0.7, 1.25)); if (rr.next() < 0.3) tc.lerp(new THREE.Color('#5f7a45'), 0.5); ims.setColorAt(i, tc); } ims.castShadow = ims.receiveShadow = true; ims.frustumCulled = false; g.add(ims); }
    const wcol = col(o.waterColor, '#256f72'), surf = buildPolar(() => [0, 1, 1, 1], 1.02), wm = new THREE.MeshPhysicalMaterial({ color: wcol, roughness: 0.03, metalness: 0, transparent: true, opacity: clamp(0.66 - 0.2 * num(o.clarity, 1), 0.25, 0.95), envMapIntensity: 1.8, clearcoat: 0.0, depthWrite: false, side: THREE.DoubleSide });
    wm.onBeforeCompile = (s) => { s.uniforms.uAqT = AQ.t; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW; uniform float uAqT;\nfloat pdH(vec2 p, float t){ return 0.004 * sin(p.x * 3.1 + t * 1.3) + 0.003 * sin(p.y * 4.3 - t * 1.7 + p.x) + 0.002 * sin((p.x + p.y) * 7.0 + t * 2.3); }').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 wp = modelMatrix * vec4(position, 1.0); transformed.y += pdH(wp.xz, uAqT); vPW = wp.xyz; }');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW; uniform float uAqT;').replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 p = vPW.xz; float t = uAqT; vec2 d = vec2(0.0); d += vec2(cos(p.x * 3.1 + t * 1.3) * 3.1 * 0.004 + cos((p.x + p.y) * 7.0 + t * 2.3) * 7.0 * 0.002, 0.0); d += vec2(cos(p.y * 4.3 - t * 1.7 + p.x) * 0.003 + cos((p.x + p.y) * 7.0 + t * 2.3) * 7.0 * 0.002, cos(p.y * 4.3 - t * 1.7 + p.x) * 4.3 * 0.003);\n  d += 0.012 * vec2(sin(p.x * 23.0 + t * 2.1 + sin(p.y * 17.0)), sin(p.y * 29.0 - t * 1.8 + sin(p.x * 13.0)));\n  vec3 wn = normalize(vec3(-d.x * 5.0, 1.0, -d.y * 5.0)); normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }'); }; wm.customProgramCacheKey = () => 'pondwater';
    const water = new THREE.Mesh(surf, wm); water.renderOrder = 4; g.add(water);
    const inner = new THREE.Group(); g.add(inner);
    if (num(o.pads, 14) > 0) lilyPads({ parent: inner, pos: [rx * 0.12, 0.012, rz * 0.05], area: [rx * 1.5, rz * 1.4], count: Math.round(num(o.pads, 14)), size: Math.min(rx, rz) * 0.1, flowers: num(o.flowers, 3), seed });
    let school = null; const nf = clamp(Math.floor(num(o.fish, 6)), 0, 30); if (nf > 0) school = fish({ parent: inner, pos: [0, -dp * 0.45, 0], count: nf, bounds: [rx * 1.35, dp * 0.35, rz * 1.35], size: clamp(num(o.fishSize, Math.min(rx, rz) * 0.2), 0.05, 1), species: 'koi', speed: 0.6, spread: 0.2, seed });
    g.updateMatrixWorld(true); const wp = new THREE.Vector3(); g.getWorldPosition(wp); const surfaceY = wp.y; underwater(bas, { surfaceY, color: wcol, caustics: 0.7 * num(o.clarity, 1), absorb: [0.9, 0.35, 0.28], scale: 2.6 }); if (school) underwater(school, { surfaceY, color: wcol, caustics: 0.15, absorb: [0.2, 0.1, 0.08] });
    if (holeN < 3) { HOLE_A[holeN].set(wp.x, wp.z, rx, rz); HOLE_B[holeN].set(ph1, ph2, 1, 1.4); holeN++; }
    g.userData = { surfaceY, rx, rz, shore, fish: school }; used.props++; return g;
  }
  /** cook.asia.stoneLantern({h,pos,rotY,glow,color}) : Japanese stone lantern (base, post, glowing fire box, curved roof, finial). cook.asia.bridge({len,w,rise,pos,rotY,rails}) : arched timber bridge with posts and rails. cook.asia.bamboo({pos,area:[w,d],count,h,color}) : swaying bamboo grove in ONE draw call. */
  function stoneLantern(o) {
    o = o || {}; const h = clamp(num(o.h, 1.2), 0.3, 6), g = new THREE.Group(), st = new THREE.MeshStandardMaterial({ color: col(o.color, '#8a8780'), roughness: 0.9, flatShading: false }), s = h / 1.2;
    const add = (geo, y, m) => { const me = shadowed(new THREE.Mesh(geo, m || st)); me.position.y = y * s; g.add(me); return me; };
    add(new THREE.CylinderGeometry(0.2 * s, 0.24 * s, 0.1 * s, 6), 0.05); add(new THREE.CylinderGeometry(0.07 * s, 0.09 * s, 0.38 * s, 8), 0.29); add(new THREE.CylinderGeometry(0.2 * s, 0.14 * s, 0.07 * s, 6), 0.52);
    const fire = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: col('#ff9a3c'), emissiveIntensity: clamp(num(o.glow, 1.4), 0, 4), roughness: 0.6 }); add(new THREE.BoxGeometry(0.2 * s, 0.2 * s, 0.2 * s), 0.66, fire); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((p) => { const pil = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.045 * s, 0.22 * s, 0.045 * s), st)); pil.position.set(p[0] * 0.115 * s, 0.66 * s, p[1] * 0.115 * s); g.add(pil); });
    const roof = add(new THREE.ConeGeometry(0.34 * s, 0.2 * s, 6, 1), 0.88); roof.scale.y = 0.9; roof.rotation.y = 0.52; add(new THREE.SphereGeometry(0.05 * s, 10, 8), 1.01); add(new THREE.ConeGeometry(0.025 * s, 0.09 * s, 8), 1.07);
    if (used.lights < LIMITS.lights && o.glowLight !== false) { used.lights++; const L = new THREE.PointLight(col('#ffb066'), 1.2 * clamp(num(o.glow, 1.4), 0, 4), 2.6 * s, 2); L.position.set(0, 0.66 * s, 0); g.add(L); }
    g.position.copy(P3(o)); g.rotation.y = num(o.rotY, 0); (o.parent || scene).add(g); return g;
  }
  function bridge(o) {
    o = o || {}; const L = clamp(num(o.len, 3), 0.8, 20), W = clamp(num(o.w, 0.9), 0.3, 4), rise = clamp(num(o.rise, 0.35), 0, 2), g = new THREE.Group(), wood = mat('wood', { color: o.color || '#8a5a36', scale: 1.4, rough: 0.7 }), dark = stdMat('#3b2a1c', 0.8), n = Math.max(6, Math.round(L / 0.1));
    const y = (t) => rise * (1 - (2 * t - 1) ** 2); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, p = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L / n * 0.92, 0.045, W), wood)); p.position.set(-L / 2 + t * L, y(t), 0); p.rotation.z = Math.atan2(y(t + 0.02) - y(t - 0.02), L * 0.04); g.add(p); }
    if (o.rails !== false) [-1, 1].forEach((s) => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(-L / 2 + t * L, y(t) + 0.42, s * (W / 2 - 0.03))); } const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.025, 6, false), wood); rail.castShadow = true; g.add(rail); for (let i = 0; i <= 6; i++) { const t = i / 6, post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.46, 6), wood)); post.position.set(-L / 2 + t * L, y(t) + 0.2, s * (W / 2 - 0.03)); g.add(post); } });
    merge(g); g.position.copy(P3(o)); g.rotation.y = num(o.rotY, 0); (o.parent || scene).add(g); return g;
  }
  function bamboo(o) {
    o = o || {}; const rr = rng((o.seed || 'bamboo') + 'bb'), ar = list(o.area, [2, 1.2]), W = num(ar[0], 2), D = num(ar[1], 1.2), n = clamp(Math.floor(num(o.count, 40)), 3, 400), H = clamp(num(o.h, 4), 0.5, 20), cc = col(o.color, '#7da64a');
    const geo = new THREE.CylinderGeometry(0.018, 0.03, 1, 7, 8); geo.translate(0, 0.5, 0); const pa = geo.attributes.position, C = []; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i), node = Math.pow(Math.abs(Math.sin(y * 12 * 3.14159 / 2)), 14), k = 1 - 0.35 * node; const c = cc.clone().multiplyScalar(k * (0.85 + 0.3 * y)); C.push(c.r, c.g, c.b); } geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }); m.onBeforeCompile = (s) => { s.uniforms.uAqT = AQ.t; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uAqT;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float ph = instanceMatrix[3].x * 3.0 + instanceMatrix[3].z * 2.0; float hh = length(instanceMatrix[1].xyz); transformed.x += (sin(uAqT * 0.8 + ph) + 0.4 * sin(uAqT * 1.9 + ph * 2.0)) * pow(position.y, 2.0) * 0.05 / max(hh, 0.1) * 3.0; }'); }; m.customProgramCacheKey = () => 'bamboo';
    const im = new THREE.InstancedMesh(geo, m, n), d = new THREE.Object3D(), tc = new THREE.Color(); for (let i = 0; i < n; i++) { d.position.set((rr.next() - 0.5) * W, 0, (rr.next() - 0.5) * D); d.rotation.set(rr.range(-0.05, 0.05), 0, rr.range(-0.05, 0.05)); d.scale.set(rr.range(0.8, 1.3), H * rr.range(0.7, 1.15), rr.range(0.8, 1.3)); d.updateMatrix(); im.setMatrixAt(i, d.matrix); tc.setScalar(rr.range(0.85, 1.15)); im.setColorAt(i, tc); }
    im.castShadow = true; im.frustumCulled = false; im.position.copy(P3(o)); (o.parent || scene).add(im);
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshStandardMaterial({ color: '#8fb85a', side: THREE.DoubleSide, roughness: 0.6 })); const lim = new THREE.InstancedMesh(lf.geometry, lf.material, n * 5); for (let i = 0; i < n * 5; i++) { const b = i % n, hh = H * rr.range(0.55, 1.0); d.position.set((rr.next() - 0.5) * W, hh, (rr.next() - 0.5) * D); d.rotation.set(rr.range(-0.5, 0.2), rr.range(0, 6.28), rr.range(-0.6, 0.6)); d.scale.setScalar(rr.range(0.7, 1.3)); d.updateMatrix(); lim.setMatrixAt(i, d.matrix); tc.set('#8fb85a').multiplyScalar(rr.range(0.75, 1.2)); lim.setColorAt(i, tc); } lim.frustumCulled = false; lim.position.copy(P3(o)); (o.parent || scene).add(lim); used.props += 2; return im;
  }
  const asia = { stoneLantern, bridge, bamboo };

  /* ------------------------------------------------------------------ v7 additions: studio-grade materials and light (learnt from a turbofan engine study, mobile-light: no post-processing) */
  const FIN = {};
  function finTex(kind) {
    if (FIN[kind]) return FIN[kind];
    const S = 256, rr = rng('fin' + kind), c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    if (kind === 'turned') { g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); for (let y = 0; y < S; y++) { const v = 112 + rr.next() * 40 + Math.sin(y * 0.9) * 10; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, y, S, 1); } }
    else if (kind === 'brushed') { g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S); for (let i = 0; i < 1500; i++) { const v = 90 + rr.next() * 80; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)'; g.fillRect(rr.next() * S, rr.next() * S, 30 + rr.next() * 90, 1); } }
    else if (kind === 'knurl') { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.lineWidth = 4; for (let i = -S; i < 2 * S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); g.beginPath(); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke(); } }
    else if (kind === 'ribbed') { for (let x = 0; x < S; x++) { const v = 128 + 110 * Math.cos(x / S * Math.PI * 2 * 16); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(x, 0, 1, S); } }
    else if (kind === 'smudge') { g.fillStyle = '#4a4a4a'; g.fillRect(0, 0, S, S); for (let i = 0; i < 60; i++) { const r = 10 + rr.next() * 50, v = 70 + rr.next() * 50, x = rr.next() * S, y = rr.next() * S, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.6)'); gr.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }
    else if (kind === 'carbon') { const n = 16, w = S / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const on = ((i + j) >> 1) % 2 === 0, gr = on ? g.createLinearGradient(i * w, 0, i * w + w, 0) : g.createLinearGradient(0, j * w, 0, j * w + w); gr.addColorStop(0, '#0b0b0d'); gr.addColorStop(0.5, '#3a3b40'); gr.addColorStop(1, '#0b0b0d'); g.fillStyle = gr; g.fillRect(i * w, j * w, w, w); } }
    else { g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); for (let i = 0; i < 200; i++) { const v = 100 + rr.next() * 60, r = 5 + rr.next() * 30, x = rr.next() * S, y = rr.next() * S, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.5)'); gr.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } for (let i = 0; i < 4000; i++) { const v = 90 + rr.next() * 80; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.3)'; g.fillRect(rr.next() * S, rr.next() * S, 1.5, 1.5); } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = kind === 'carbon' ? THREE.SRGBColorSpace : THREE.NoColorSpace; FIN[kind] = t; return t;
  }
  /* measured linear reflectances (F0) for metals and albedos for dielectrics: [colour, metalness, roughness, finish, extra] */
  const PBR = {
    steel: [[0.56, 0.57, 0.58], 1, 0.3, 'turned'], steelDark: [[0.24, 0.245, 0.25], 1, 0.42, 'cast'], stainless: [[0.67, 0.66, 0.64], 1, 0.2, 'brushed'], chrome: [[0.78, 0.79, 0.8], 1, 0.06, null],
    aluminium: [[0.88, 0.89, 0.9], 1, 0.38, 'cast'], aluminiumMachined: [[0.9, 0.9, 0.91], 1, 0.22, 'turned'], titanium: [[0.54, 0.5, 0.45], 1, 0.32, 'brushed'], inconel: [[0.47, 0.44, 0.41], 1, 0.42, 'cast'],
    copper: [[0.95, 0.64, 0.54], 1, 0.28, 'turned'], brass: [[0.91, 0.78, 0.42], 1, 0.24, 'turned'], gold: [[1.0, 0.77, 0.34], 1, 0.18, 'brushed'], silver: [[0.97, 0.96, 0.91], 1, 0.14, 'brushed'],
    bluedSteel: [[0.08, 0.16, 0.5], 1, 0.16, null], castIron: [[0.3, 0.3, 0.3], 0.9, 0.62, 'cast'],
    anodised: [[0.08, 0.09, 0.1], 0.85, 0.34, 'cast', { clearcoat: 0.2 }], paint: [[0.8, 0.8, 0.8], 0, 0.32, 'smudge', { clearcoat: 0.6, clearcoatRoughness: 0.2 }],
    satin: [[0.04, 0.04, 0.045], 0, 0.55, 'cast'], plastic: [[0.05, 0.05, 0.055], 0, 0.42, 'cast'], rubber: [[0.025, 0.025, 0.027], 0, 0.82, 'cast'], ceramic: [[0.82, 0.8, 0.76], 0, 0.5, 'cast'],
    enamel: [[0.93, 0.92, 0.88], 0, 0.12, null, { clearcoat: 1, clearcoatRoughness: 0.03 }], carbon: [[1, 1, 1], 0.2, 0.36, null, { clearcoat: 1, clearcoatRoughness: 0.05 }],
    glass: [[1, 1, 1], 0, 0.03, null, { transmission: 0.95, thickness: 0.01, ior: 1.5 }], sapphire: [[0.96, 0.97, 1], 0, 0.0, null, { transmission: 0.95, thickness: 0.005, ior: 1.77 }],
    ruby: [[0.9, 0.08, 0.15], 0, 0.05, null, { transmission: 0.5, thickness: 0.003, ior: 1.77 }], fluid: [[0.3, 0.12, 0.05], 0, 0.08, null, { clearcoat: 1 }], glow: [[0, 0, 0], 0, 1, null]
  };
  /** cook.pbr(kind,{color,rough,metal,finish,rep,clearcoat,emissive,emissiveIntensity,envMapIntensity}) -> MeshPhysicalMaterial */
  function pbr(kind, o) {
    o = o || {}; const p = PBR[kind] || PBR.steel, ex = p[4] || {};
    const m = new THREE.MeshPhysicalMaterial(Object.assign({ metalness: p[1], roughness: p[2] }, ex));
    m.color = o.color != null ? col(o.color, '#cccccc') : new THREE.Color(p[0][0], p[0][1], p[0][2]);
    if (o.rough != null) m.roughness = clamp(num(o.rough, p[2]), 0, 1); if (o.metal != null) m.metalness = clamp(num(o.metal, p[1]), 0, 1);
    if (o.clearcoat != null) m.clearcoat = clamp(num(o.clearcoat, 0), 0, 1); if (o.opacity != null) { m.opacity = clamp(num(o.opacity, 1), 0, 1); m.transparent = m.opacity < 1; }
    if (kind === 'glow' || o.emissive != null) { m.emissive = col(o.emissive || '#ff8a2a', '#ff8a2a'); m.emissiveIntensity = num(o.emissiveIntensity, kind === 'glow' ? 4 : 1); }
    if (kind === 'carbon') { m.map = finTex('carbon').clone(); m.map.needsUpdate = true; m.map.repeat.set(6, 6); }
    const fin = o.finish === undefined ? p[3] : o.finish;
    if (fin) { const t = finTex(fin).clone(); t.needsUpdate = true; const rep = Array.isArray(o.rep) ? o.rep : (fin === 'ribbed' ? [4, 1] : fin === 'turned' ? [1, 24] : fin === 'brushed' ? [2, 6] : [3, 3]); t.repeat.set(num(rep[0], 1), num(rep[1], 1)); m.roughnessMap = t; if (fin === 'knurl') { m.bumpMap = t; m.bumpScale = 0.6; } if (fin === 'ribbed') { m.roughnessMap = null; m.bumpMap = t; m.bumpScale = 0.5; } }
    m.envMapIntensity = num(o.envMapIntensity, 1); return m;
  }
  /* product animation, not engine rotation: spin (rad/s) is clamped to a calm +-1.2 (about one turn in five seconds); fast:true allows up to 6 for a deliberate spin-up */
  const slowSpin = (v, o) => { const m = o && o.fast ? 6 : 1.2; return clamp(num(v, 0), -m, m); };
  const put = (obj, o) => { obj.position.copy(P3(o)); if (Array.isArray(o.rot)) obj.rotation.set(num(o.rot[0], 0), num(o.rot[1], 0), num(o.rot[2], 0)); else if (o.rotY != null) obj.rotation.y = num(o.rotY, 0); (o.parent || scene).add(obj); return obj; };
  const matOf = (o, d) => o.material || (o.kind ? pbr(o.kind, { color: o.color }) : pbr(d || 'steel', { color: o.color }));

  /** cook.studio({theme:'paper'|'night', bg, y, floor, fog:[near,far], intensity, keyPos, shadowArea, shadowSize, contact, tone}) - the product-photography set */
  function studio(o) {
    o = o || {}; const paper = o.theme !== 'night', k = num(o.intensity, 1), y = num(o.y, 0), bg = col(o.bg || (paper ? '#f1f0ec' : '#0d0e10'), '#f1f0ec');
    scene.background = bg;
    const es = new THREE.Scene(); es.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: paper ? 0x9c9a95 : 0x0a0b0d, side: THREE.BackSide })));
    const fl = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: paper ? 0xd8d6d0 : 0x141517 })); fl.rotation.x = -Math.PI / 2; fl.position.y = -2; es.add(fl);
    const box = (w, h, x, yy, z, v, tint) => { const t = tint || [1, 1, 1], m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(t[0] * v, t[1] * v, t[2] * v), side: THREE.DoubleSide })); m.position.set(x, yy, z); m.lookAt(0, 0, 0); es.add(m); };
    box(14, 10, 0, 14, 2, paper ? 2.6 : 3.2); box(4, 14, -12, 4, 8, paper ? 4.5 : 6, [1, 0.96, 0.9]); box(2.2, 14, 13, 5, -6, paper ? 6 : 9, [0.88, 0.94, 1]); box(2.2, 14, -11, 5, -9, paper ? 3.5 : 5); box(8, 3, 6, 1.5, 12, paper ? 1.4 : 1.6);
    box(5, 16, 12, 4, 7, 0.02); box(4, 16, -13, 4, -2, 0.02); box(16, 3, 0, -1, -14, 0.03); /* black flags: long dark reflections give metal its shape */
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, 0.02).texture; pm.dispose();
    let floor = null; if (o.floor !== false) { floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: paper ? 0xf0efea : 0x121315, roughness: paper ? 0.92 : 0.55, metalness: 0, envMapIntensity: paper ? 0.25 : 0.6 })); floor.rotation.x = -Math.PI / 2; floor.position.y = y; floor.receiveShadow = true; scene.add(floor); }
    const fg = Array.isArray(o.fog) ? o.fog : [4, 16]; scene.fog = new THREE.Fog(bg, num(fg[0], 9), num(fg[1], 30)); /* the floor melts into the backdrop: a seamless cyclorama */
    if (o.tone === 'neutral' && THREE.NeutralToneMapping != null) renderer.toneMapping = THREE.NeutralToneMapping;
    const key = new THREE.DirectionalLight(0xfff3e6, (paper ? 2.4 : 2.6) * k); key.position.copy(vec3(o.keyPos, [-4, 6, 5]));
    if (o.shadows !== false) { key.castShadow = true; const ss = clamp(num(o.shadowSize, 1024), 512, 2048); key.shadow.mapSize.set(ss, ss); const A = clamp(num(o.shadowArea, 4), 1, 60), c = key.shadow.camera; c.left = -A; c.right = A; c.top = A; c.bottom = -A; c.near = 0.5; c.far = Math.max(30, A * 5); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; }
    const rim = new THREE.DirectionalLight(0xdbe8ff, (paper ? 0.9 : 1.8) * k); rim.position.set(4, 3, -5); const fill = new THREE.HemisphereLight(0xffffff, paper ? 0xd9d5cc : 0x202020, (paper ? 0.2 : 0.15) * k);
    scene.add(key, rim, fill); used.lights += 3; LIGHTS.hemi = fill; LIGHTS.sun = key; LIGHTS.dimmed = true;
    if (o.contact) contactShadow({ pos: [0, y + 0.003, 0], w: num(o.contactW, 1.6), d: num(o.contactD, 1), opacity: num(o.contact === true ? 0.3 : o.contact, 0.3) });
    return { key, rim, fill, floor, bg };
  }

  /* ---- machine parts: engineered geometry (lathe solids, blade rings, bolts, gears, springs, pipes) ---- */
  /** cook.machine.lathe([[r,y],...],{seg,crease,closed,double,arc:[phi0,phiLen],kind|material,color,pos,rot,parent}) - closed solid of revolution around +Y with hard edges at sharp corners */
  function mLathe(prof, o) {
    o = o || {}; let pts = (Array.isArray(prof) ? prof : []).map((p) => [Math.max(0.0001, num(p[0], 0.1)), num(p[1], 0)]); if (pts.length < 2) throw new Error('lathe needs 2+ points');
    if (o.closed !== false && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) pts.push(pts[0].slice());
    let a = 0; for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]; if (a < 0) pts = pts.reverse(); /* counter-clockwise so faces point out */
    const cr = num(o.crease, 35) * Math.PI / 180, seg = clamp(Math.floor(num(o.seg, 64)), 8, 128), runs = []; let run = [pts[0]];
    for (let i = 1; i < pts.length; i++) { run.push(pts[i]); if (i < pts.length - 1) { const a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]), a2 = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]); let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d; if (d > cr) { runs.push(run); run = [pts[i]]; } } }
    runs.push(run); const m = matOf(o); if (o.double) m.side = THREE.DoubleSide; const g = new THREE.Group();
    const ph0 = o.arc ? num(o.arc[0], 0) : 0, phL = o.arc ? clamp(num(o.arc[1], Math.PI * 2), 0.2, Math.PI * 2) : Math.PI * 2;
    runs.forEach((r) => { if (r.length > 1) g.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(r.map((p) => new THREE.Vector2(p[0], p[1])), seg, ph0, phL), m))); });
    if (o.arc && o.closed !== false) { const tr = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []); [[ph0, -1], [ph0 + phL, 1]].forEach((e) => { const phi = e[0], tn = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)).multiplyScalar(e[1]), Pt = (k) => new THREE.Vector3(pts[k][0] * Math.sin(phi), pts[k][1], pts[k][0] * Math.cos(phi)), ps = []; tr.forEach((q) => { const A = Pt(q[0]), B = Pt(q[1]), C = Pt(q[2]); if (B.clone().sub(A).cross(C.clone().sub(A)).dot(tn) >= 0) ps.push(A, B, C); else ps.push(A, C, B); }); const cg = new THREE.BufferGeometry().setFromPoints(ps); cg.computeVertexNormals(); cg.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(ps.length * 2).fill(0), 2)); g.add(shadowed(new THREE.Mesh(cg, m))); }); }
    if (o.merge !== false) merge(g); return put(g, o);
  }
  /** cook.machine.bladeRing({count,r0,r1,chord,thick,twist,pitch,camber,sweep,hub,axis:'z'|'y'|'x',spin,kind|material,pos,parent}) - fan / turbine / propeller / impeller: twisted tapered aerofoil blades around a hub (1 draw call) */
  function mBladeRing(o) {
    o = o || {}; const n = clamp(Math.floor(num(o.count, 24)), 2, 120), r0 = num(o.r0, 0.12), r1 = Math.max(r0 + 0.02, num(o.r1, 0.5)), ch = num(o.chord, 0.1), th = num(o.thick, 0.12), tw = num(o.twist, 0.7), pi = num(o.pitch, 0.45), cam = num(o.camber, 0.08), sw = num(o.sweep, 0.0);
    const nS = 8, nC = 12, V = [], I = [];
    for (let s = 0; s <= nS; s++) { const t = s / nS, r = r0 + (r1 - r0) * t, c = ch * (1 - 0.3 * t), a = pi + tw * (1 - t), ca = Math.cos(a), sa = Math.sin(a), shift = sw * t * c;
      for (let k = 0; k < nC; k++) { const u = k / nC * Math.PI * 2, x = Math.cos(u) * c / 2, z = Math.sin(u) * th * c / 2 + cam * c * (1 - (2 * x / c) ** 2), xr = x * ca - z * sa + shift, zr = x * sa + z * ca; V.push(xr, r, zr); } }
    for (let s = 0; s < nS; s++) for (let k = 0; k < nC; k++) { const a1 = s * nC + k, b = s * nC + (k + 1) % nC, c2 = (s + 1) * nC + k, d = (s + 1) * nC + (k + 1) % nC; I.push(a1, b, c2, b, d, c2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); geo.setIndex(I); geo.computeVertexNormals();
    const m = matOf(o, 'titanium'), im = new THREE.InstancedMesh(geo, m, n), d = new THREE.Object3D(); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    for (let i = 0; i < n; i++) { d.rotation.set(0, 0, i / n * Math.PI * 2 + num(o.phase, 0)); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
    const spinner = new THREE.Group(); spinner.add(im);
    if (o.hub !== false) { const hr = r0 * 1.05, hub = mLathe([[0.001, -ch * 0.5], [hr, -ch * 0.5], [hr, ch * 0.5], [hr * 0.6, ch * 0.8], [0.001, ch * 0.95]], { kind: o.hubKind || 'aluminiumMachined', seg: 48, parent: spinner }); hub.rotation.x = Math.PI / 2; hub.position.set(0, 0, 0); }
    const outer = new THREE.Group(); outer.add(spinner); if (o.axis === 'y') outer.rotation.x = -Math.PI / 2; else if (o.axis === 'x') outer.rotation.y = Math.PI / 2;
    const sp = slowSpin(o.spin, o); if (sp) frameHooks.push((dt) => { spinner.rotation.z += sp * dt; });
    used.props++; put(outer, o); outer.userData.spinner = spinner; return outer;
  }
  /** cook.machine.bolts({count,R,size,h,axis,kind|material,pos,parent}) - ring of hex bolt heads (instanced) */
  function mBolts(o) {
    o = o || {}; const n = clamp(Math.floor(num(o.count, 12)), 3, 96), R = num(o.R, 0.3), sz = num(o.size, 0.012), h = num(o.h, 0.01), geo = new THREE.CylinderGeometry(sz, sz, h, 6); geo.rotateX(Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, matOf(o, 'steelDark'), n), d = new THREE.Object3D(); im.castShadow = true; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + num(o.phase, 0); d.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); d.rotation.set(0, 0, a * 3); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
    const g = new THREE.Group(); g.add(im); if (o.axis === 'y') g.rotation.x = -Math.PI / 2; else if (o.axis === 'x') g.rotation.y = Math.PI / 2; return put(g, o);
  }
  /** cook.machine.gear({teeth,r,width,bore,spin,kind|material,pos,rot,parent}) - spur gear, bevelled, with a bore */
  function mGear(o) {
    o = o || {}; const n = clamp(Math.floor(num(o.teeth, 20)), 6, 80), R = num(o.r, 0.2), depth = R * 0.18, w = num(o.width, R * 0.35), sh = new THREE.Shape(), step = Math.PI * 2 / n;
    for (let i = 0; i < n; i++) { const a = i * step; [[-0.5, R - depth], [-0.28, R], [0.28, R], [0.5, R - depth]].forEach((q, j) => { const an = a + q[0] * step, x = Math.cos(an) * q[1], y = Math.sin(an) * q[1]; if (i === 0 && j === 0) sh.moveTo(x, y); else sh.lineTo(x, y); }); }
    const bore = num(o.bore, R * 0.25); if (bore > 0) { const h = new THREE.Path(); h.absarc(0, 0, bore, 0, Math.PI * 2, true); sh.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: true, bevelSize: w * 0.05, bevelThickness: w * 0.05, bevelSegments: 1, curveSegments: 6 }); geo.translate(0, 0, -w / 2);
    const m = shadowed(new THREE.Mesh(geo, matOf(o, 'steel'))); const sp = slowSpin(o.spin, o); if (sp) frameHooks.push((dt) => { m.rotation.z += sp * dt; }); return put(m, o);
  }
  /** cook.machine.spring({R,wire,turns,len,kind|material,pos,rot,parent}) - coil spring along +Y */
  function mSpring(o) {
    o = o || {}; const R = num(o.R, 0.05), wire = num(o.wire, 0.006), turns = clamp(num(o.turns, 8), 1, 40), len = num(o.len, 0.3);
    const cv = new THREE.Curve(); cv.getPoint = (t, tg) => (tg || new THREE.Vector3()).set(Math.cos(t * turns * Math.PI * 2) * R, (t - 0.5) * len, Math.sin(t * turns * Math.PI * 2) * R);
    return put(shadowed(new THREE.Mesh(new THREE.TubeGeometry(cv, Math.floor(turns * 16), wire, 8, false), matOf(o, 'steel'))), o);
  }
  /** cook.machine.pipe([[x,y,z],...],{r,radial,kind|material,parent}) - smooth tube through points (cables, pipes, hoses) */
  function mPipe(pts, o) {
    o = o || {}; const P = (Array.isArray(pts) ? pts : []).map((p) => new THREE.Vector3(num(p[0], 0), num(p[1], 0), num(p[2], 0))); if (P.length < 2) throw new Error('pipe needs 2+ points');
    const m = shadowed(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P, false, 'catmullrom', 0.5), Math.min(200, P.length * 14), num(o.r, 0.01), clamp(Math.floor(num(o.radial, 10)), 5, 20), false), matOf(o, 'copper'))); (o.parent || scene).add(m); return m;
  }
  const machine = { lathe: mLathe, bladeRing: mBladeRing, bolts: mBolts, gear: mGear, spring: mSpring, pipe: mPipe };

  /** cook.cutaway(root,{axis:'x'|'y'|'z',at,flip,capColor,sweep:[from,to],duration}) - slices a solid group open: the cut faces are shaded as a flat machined section, no cap geometry; sweep animates the cut back and forth */
  function cutaway(root, o) {
    o = o || {}; renderer.localClippingEnabled = true; const ax = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[o.axis || 'x'] || [1, 0, 0], sg = o.flip ? 1 : -1;
    const plane = new THREE.Plane(new THREE.Vector3(ax[0] * sg, ax[1] * sg, ax[2] * sg), 0), cutU = { value: new THREE.Vector4() }, capU = { value: col(o.capColor || '#8f1c0c', '#8f1c0c') }, at = (v) => { plane.constant = -sg * v; cutU.value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant); }; at(num(o.at, 0));
    const done = new Set(); root.traverse((ob) => { if (!ob.isMesh) return; (Array.isArray(ob.material) ? ob.material : [ob.material]).forEach((m) => {
      if (!m || done.has(m)) return; done.add(m); m.clippingPlanes = [plane]; m.clipShadows = true; if (!m.isMeshStandardMaterial || m.transmission > 0 || m.transparent) { m.needsUpdate = true; return; }
      const prev = m.onBeforeCompile, pk = m.customProgramCacheKey; m.side = THREE.DoubleSide; m.shadowSide = THREE.FrontSide;
      m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); sh.uniforms.uCbCut = cutU; sh.uniforms.uCbCap = capU;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCbW;').replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 lw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nlw = instanceMatrix * lw;\n#endif\nvCbW = (modelMatrix * lw).xyz; }');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCbW; uniform vec4 uCbCut; uniform vec3 uCbCap;')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nbool cbCap = !gl_FrontFacing; vec3 cbHit = vCbW;\nif (cbCap) { vec3 ro = cameraPosition; vec3 rd = normalize(vCbW - ro); float dn = dot(uCbCut.xyz, rd); dn = abs(dn) < 1e-5 ? 1e-5 : dn; cbHit = ro + rd * (-(dot(uCbCut.xyz, ro) + uCbCut.w) / dn); }')
          .replace('#include <color_fragment>', '#include <color_fragment>\nif (cbCap) { float hs = (cbHit.x + cbHit.y + cbHit.z) / 0.012; float hl = smoothstep(0.0, 0.1, abs(fract(hs) - 0.5) - 0.42); diffuseColor.rgb = uCbCap * (0.94 + 0.06 * hl); }')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (cbCap) roughnessFactor = 0.55;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (cbCap) metalnessFactor = 0.0;')
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (cbCap) { normal = normalize((viewMatrix * vec4(uCbCut.xyz, 0.0)).xyz); if (dot(normal, vViewPosition) < 0.0) normal = -normal; }'); };
      m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + 'cbcut'; m.needsUpdate = true; }); });
    const sw = Array.isArray(o.sweep) ? o.sweep : null; if (sw) { const dur = clamp(num(o.duration, 8), 1, 60); frameHooks.push((dt, t) => { const k = 0.5 - 0.5 * Math.cos(t / dur * Math.PI * 2); at(num(sw[0], 0) + (num(sw[1], 1) - num(sw[0], 0)) * k); }); }
    return { plane, at };
  }

  /** cook.heatGlow(material,{kelvin,to,duration}) - blackbody emissive glow for hot metal (800 K dull red .. 1600 K orange .. 3000 K white-yellow); m.userData.heat.value changes it live */
  function heatGlow(m, o) {
    o = o || {}; const uT = { value: num(o.kelvin, 1100) }; m.userData.heat = uT; const prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); sh.uniforms.uHeatT = uT; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uHeatT;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float k = smoothstep(750.0, 1600.0, uHeatT); float t = clamp(uHeatT, 800.0, 6000.0) / 100.0; vec3 bb = vec3(1.0, clamp((99.47 * log(t) - 161.12) / 255.0, 0.0, 1.0), t <= 19.0 ? 0.0 : clamp((138.52 * log(t - 10.0) - 305.04) / 255.0, 0.0, 1.0)); bb = pow(bb, vec3(2.2)); totalEmissiveRadiance += bb * k * k * 6.0; }'); };
    m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + 'heat'; m.needsUpdate = true;
    if (o.to != null) { const a = uT.value, b = num(o.to, a), dur = clamp(num(o.duration, 6), 1, 60); frameHooks.push((dt, t) => { uT.value = a + (b - a) * (0.5 - 0.5 * Math.cos(t / dur * Math.PI * 2)); }); }
    return m;
  }

  /** cook.plume({pos,dir:'-y'|'+y'|'+x'|'-x'|'+z'|'-z',radius,length,kind:'rocket'|'jet'|'flame',shocks,power,tint,parent}) - exhaust jet with turbulent shear and bright shock diamonds; returns a group, g.userData.power = 0..1 throttles it live */
  function plume(o) {
    o = o || {}; const R = num(o.radius, 0.1), L = num(o.length, 1), kind = { rocket: 0, jet: 1, flame: 2 }[o.kind || 'jet'], tn = col(o.tint || '#ffffff', '#ffffff');
    const u = { uT: { value: 0 }, uP: { value: 1 }, uShock: { value: num(o.shocks, 1.4) }, uKind: { value: kind == null ? 1 : kind }, uR: { value: R }, uL: { value: L }, uSpread: { value: num(o.spread, 1) }, uTint: { value: new THREE.Vector3(tn.r, tn.g, tn.b) } }; uniformsTime.push(u.uT);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 40, 32, true); geo.translate(0, -0.5, 0);
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'uniform float uR, uL, uP, uSpread; varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vec3 p = position; float y = -p.y; float r = uR * (1.0 + y * (0.35 + 1.4 * y) * mix(0.6, 1.0, uP) * uSpread); p.xz *= r; p.y = -y * uL * mix(0.35, 1.0, uP); vP = vec3(p.x / uR, y, p.z / uR); vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * vec3(p.x, 0.0, p.z)); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uT, uP, uShock, uKind; uniform vec3 uTint; varying vec3 vP; varying vec3 vN; varying vec3 vV;\nfloat h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }\nfloat n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }\n' +
        'void main(){ float y = vP.y; float f = abs(dot(normalize(vN), normalize(vV))); float core = pow(f, 1.6); float turb = n3(vec3(vP.x * 3.0, y * 9.0 - uT * 14.0, vP.z * 3.0)) * 0.6 + n3(vec3(vP.x * 7.0, y * 22.0 - uT * 30.0, vP.z * 7.0)) * 0.4;\n float diam = 0.5 + 0.5 * cos(y * 6.2831 * uShock * 2.2); float shock = pow(diam, 6.0) * smoothstep(0.75, 0.05, y) * core; float fade = smoothstep(1.0, 0.25, y) * smoothstep(0.0, 0.02, y);\n vec3 a = uKind > 1.5 ? vec3(0.55, 0.7, 1.0) : (uKind > 0.5 ? vec3(0.55, 0.65, 1.0) : vec3(0.35, 0.45, 1.0)); vec3 b = uKind > 1.5 ? vec3(1.0, 0.6, 0.18) : (uKind > 0.5 ? vec3(1.0, 0.55, 0.25) : vec3(1.0, 0.45, 0.2));\n vec3 c = mix(a, b, smoothstep(0.05, 0.6, y)) * (0.35 + 0.9 * turb) * core * fade; c += vec3(1.0, 0.85, 0.65) * shock * 2.4 * (uKind > 1.5 ? 0.0 : (uKind > 0.5 ? 0.2 : 1.0)); c *= uP * uTint; gl_FragColor = vec4(c, 1.0); }' }));
    mesh.renderOrder = 4; mesh.frustumCulled = false; const g = new THREE.Group(); g.add(mesh); const rot = { '-y': [0, 0, 0], '+y': [Math.PI, 0, 0], '+x': [0, 0, Math.PI / 2], '-x': [0, 0, -Math.PI / 2], '+z': [-Math.PI / 2, 0, 0], '-z': [Math.PI / 2, 0, 0] }[o.dir || '-y'] || [0, 0, 0];
    g.rotation.set(rot[0], rot[1], rot[2]); g.userData.power = clamp(num(o.power, 1), 0, 1); frameHooks.push(() => { u.uP.value = g.userData.power; mesh.visible = g.userData.power > 0.01; const tt = g.userData.tint; if (Array.isArray(tt)) u.uTint.value.set(num(tt[0], 1), num(tt[1], 1), num(tt[2], 1)); if (g.userData.shocks != null) u.uShock.value = num(g.userData.shocks, 1.4); }); g.position.copy(P3(o)); (o.parent || scene).add(g); return g;
  }

  /** cook.sparks({pos,dir:[x,y,z],count,rate,burst,speed,spread,gravity,size,floorY,color,life,parent}) - hot spark shower (additive points, gravity, optional bounce on floorY); rate = per second, burst = n at start; returns {points,emit(n)} */
  function sparks(o) {
    o = o || {}; const max = clamp(Math.floor(num(o.count, 300)), 20, 800), rr = rng((o.seed || 'sp') + 'sparks'), P = new Float32Array(max * 3), V = new Float32Array(max * 3), A = new Float32Array(max), Lf = new Float32Array(max), K = new Float32Array(max), pos = P3(o), dir = vec3(o.dir, [0, 1, 0]).normalize();
    const sp = num(o.speed, 2.5), spread = num(o.spread, 0.7), grav = num(o.gravity, 4.5), life = num(o.life, 1.1), fy = o.floorY != null ? num(o.floorY, 0) : -1e9; let head = 0, acc = 0; const tint = col(o.color || '#ff9a3a', '#ff9a3a');
    const geo = new THREE.BufferGeometry(); const pa = new THREE.BufferAttribute(P, 3), ka = new THREE.BufferAttribute(K, 1); pa.setUsage(THREE.DynamicDrawUsage); ka.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('position', pa); geo.setAttribute('aK', ka);
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: { uS: { value: num(o.size, 1) * 50 }, uC: { value: new THREE.Vector3(tint.r, tint.g, tint.b) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'attribute float aK; varying float vK; uniform float uS; void main(){ vK = aK; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aK > 0.0 ? uS / -mv.z * (0.4 + aK) : 0.0; }',
      fragmentShader: 'varying float vK; uniform vec3 uC; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(mix(uC * vec3(1.0, 0.3, 0.1), mix(uC, vec3(1.0, 0.9, 0.6), 0.6), vK) * a * vK * 1.6, 1.0); }' })); pts.frustumCulled = false; (o.parent || scene).add(pts);
    const emit = (n) => { for (let i = 0; i < n; i++) { const j = head++ % max; P[j * 3] = pos.x; P[j * 3 + 1] = pos.y; P[j * 3 + 2] = pos.z; const d = new THREE.Vector3((rr.next() - 0.5) * spread * 2, (rr.next() - 0.5) * spread * 2, (rr.next() - 0.5) * spread * 2).add(dir).normalize(), s = sp * (0.3 + rr.next()); V[j * 3] = d.x * s; V[j * 3 + 1] = d.y * s; V[j * 3 + 2] = d.z * s; Lf[j] = life * (0.4 + rr.next()); A[j] = 0; } };
    if (o.burst) emit(Math.min(max, Math.floor(num(o.burst, 0))));
    frameHooks.push((dt) => { dt = Math.min(dt, 0.05); const r = num(o.rate, 0); if (r > 0) { acc += r * dt; const n = Math.floor(acc); acc -= n; emit(n); }
      for (let j = 0; j < max; j++) { if (Lf[j] <= 0) { K[j] = 0; continue; } A[j] += dt; if (A[j] > Lf[j]) { Lf[j] = 0; K[j] = 0; continue; } V[j * 3 + 1] -= grav * dt; for (let a = 0; a < 3; a++) P[j * 3 + a] += V[j * 3 + a] * dt; if (P[j * 3 + 1] < fy) { P[j * 3 + 1] = fy; V[j * 3 + 1] *= -0.35; V[j * 3] *= 0.6; V[j * 3 + 2] *= 0.6; } K[j] = 1 - A[j] / Lf[j]; }
      pa.needsUpdate = true; ka.needsUpdate = true; });
    return { points: pts, emit };
  }

  /** cook.flow({paths:[[[x,y,z],...],...],count,trail,length,speed,color|colors|colorFn,size,opacity,parent}) - streamlines that move: glowing streaks travelling along curved paths (air through an engine, wind over a car, fluid in a pipe, data flow); returns {points,speed,opacity} (set .speed / .opacity live) */
  function flow(o) {
    o = o || {}; const raw = (Array.isArray(o.paths) ? o.paths : []).filter((p) => Array.isArray(p) && p.length > 1); if (!raw.length) throw new Error('flow needs paths');
    const curves = raw.map((p) => new THREE.CatmullRomCurve3(p.map((q) => new THREE.Vector3(num(q[0], 0), num(q[1], 0), num(q[2], 0))))), S = 128, lut = curves.map((c) => { const a = new Float32Array((S + 1) * 3), v = new THREE.Vector3(); for (let i = 0; i <= S; i++) { c.getPointAt(i / S, v); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z; } return a; });
    const n = clamp(Math.floor(num(o.count, 160)), 8, 400), seg = clamp(Math.floor(num(o.trail, 6)), 2, 10), len = clamp(num(o.length, 0.08), 0.01, 0.4), rr = rng((o.seed || 'fl') + 'flow'), tot = n * seg;
    const P = new Float32Array(tot * 3), C = new Float32Array(tot * 3), Kf = new Float32Array(tot), pi = [], u0 = [], sp = [], off = [], cols = list(o.colors || o.color, ['#bfe3ff']).map((c) => col(c, '#bfe3ff'));
    for (let i = 0; i < n; i++) { pi.push(i % curves.length); u0.push(rr.next()); sp.push(0.7 + rr.next() * 0.6); off.push([(rr.next() - 0.5) * 0.02, (rr.next() - 0.5) * 0.02, (rr.next() - 0.5) * 0.02]); for (let s = 0; s < seg; s++) Kf[i * seg + s] = 1 - s / seg; }
    const geo = new THREE.BufferGeometry(); const pa = new THREE.BufferAttribute(P, 3), ca = new THREE.BufferAttribute(C, 3); pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('position', pa); geo.setAttribute('color', ca); geo.setAttribute('aK', new THREE.BufferAttribute(Kf, 1));
    const U = { uS: { value: num(o.size, 1) * 40 }, uO: { value: num(o.opacity, 1) } }; const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexColors: true,
      vertexShader: 'attribute float aK; varying float vK; varying vec3 vC; uniform float uS; void main(){ vK = aK; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uS / -mv.z * (0.3 + aK); }',
      fragmentShader: 'varying float vK; varying vec3 vC; uniform float uO; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vC * a * vK * vK * uO, 1.0); }' })); pts.frustumCulled = false; (o.parent || scene).add(pts);
    const f = { points: pts, speed: num(o.speed, 0.25), opacity: 1 }, tmp = new THREE.Color(); let tt = 0;
    frameHooks.push((dt) => { tt += dt * f.speed; U.uO.value = num(o.opacity, 1) * f.opacity; for (let i = 0; i < n; i++) { let u = (u0[i] + tt * sp[i]) % 1; if (u < 0) u += 1; const L = lut[pi[i]], dirn = f.speed < 0 ? -1 : 1; let c = cols[pi[i] % cols.length]; if (typeof o.colorFn === 'function') { try { const rv = o.colorFn(pi[i], u); if (Array.isArray(rv)) c = tmp.setRGB(num(rv[0], 1), num(rv[1], 1), num(rv[2], 1)); else c = tmp.set(rv); } catch (e) { c = cols[0]; } }
      for (let s = 0; s < seg; s++) { let us = u - dirn * s * len / seg; us -= Math.floor(us); const x = us * S, i0 = Math.floor(x), fr = x - i0, a = i0 * 3, b = Math.min(S, i0 + 1) * 3, k = (i * seg + s) * 3; for (let d = 0; d < 3; d++) { P[k + d] = L[a + d] + (L[b + d] - L[a + d]) * fr + off[i][d]; } C[k] = c.r; C[k + 1] = c.g; C[k + 2] = c.b; } } pa.needsUpdate = true; ca.needsUpdate = true; });
    return f;
  }

  /* ------------------------------------------------------------------ v8 additions: learnt from the rocket engine study (state-driven visuals, thin shells, bellows, callouts, exploded view) */
  /** cook.approach(current,target,tau,dt) - frame-rate independent smoothing toward a target (throttle, temperature, power): returns the new value */
  const approach = (cur, tgt, tau, dt) => tgt + (cur - tgt) * Math.exp(-dt / Math.max(1e-4, tau));
  /** cook.machine.shell(profile,{t,...}) - thin-walled solid of revolution from the OUTER profile [[r,y],...] (open): bell nozzles, cups, bowls, lamp shades, bottles; wall thickness t; use with cook.cutaway to show the wall */
  function mShell(prof, o) {
    o = o || {}; const P = (Array.isArray(prof) ? prof : []).map((p) => [num(p[0], 0.1), num(p[1], 0)]); if (P.length < 2) throw new Error('shell needs 2+ points'); const t = clamp(num(o.t, 0.01), 0.0005, 0.5), n = P.length, N = [];
    for (let i = 0; i < n; i++) { let nx = 0, ny = 0; [[i - 1, i], [i, i + 1]].forEach((s) => { if (s[0] < 0 || s[1] >= n) return; const dr = P[s[1]][0] - P[s[0]][0], dy = P[s[1]][1] - P[s[0]][1], l = Math.hypot(dr, dy) || 1; nx += dy / l; ny += -dr / l; }); const l = Math.hypot(nx, ny) || 1; N.push([nx / l, ny / l]); }
    const mean = N.reduce((a, b) => a + b[0], 0); const s = mean > 0 ? -1 : 1; /* offset toward the axis */
    const inner = P.map((p, i) => [Math.max(0.001, p[0] + N[i][0] * t * s), p[1] + N[i][1] * t * s]);
    return mLathe(P.concat(inner.reverse()), Object.assign({ double: false }, o));
  }
  /** cook.machine.bellows({r,len,folds,amp,kind|material,pos,rot,parent}) - corrugated flexible joint along +Y (exhaust, hoses, camera lens bellows, accordion) */
  function mBellows(o) {
    o = o || {}; const r = num(o.r, 0.08), len = num(o.len, 0.3), f = clamp(Math.floor(num(o.folds, 12)), 3, 60) * 2 + 1, amp = num(o.amp, r * 0.14), pts = [];
    for (let i = 0; i < f; i++) pts.push([i % 2 ? r + amp : r, i * len / (f - 1)]); pts.push([0.001, len], [0.001, 0]);
    return mLathe(pts, Object.assign({ kind: 'steel', seg: 48 }, o));
  }
  machine.shell = mShell; machine.bellows = mBellows;

  /** cook.callout({pos|target,title,text|value:()=>string,side:'left'|'right',dx,dy,color}) - a labelled leader line that follows a point on the product (feature hotspot, live readout); max 8, fades when behind the camera */
  const CALL = { el: null, svg: null, n: 0 };
  function callout(o) {
    o = o || {}; if (CALL.n >= 8) throw new Error('callout limit'); CALL.n++;
    if (!CALL.el) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:5;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,sans-serif'; const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('width', '100%'); sv.setAttribute('height', '100%'); sv.style.cssText = 'position:absolute;left:0;top:0'; d.appendChild(sv); document.body.appendChild(d); CALL.el = d; CALL.svg = sv; }
    const colr = o.color || '#ffffff', left = o.side === 'left', dx = num(o.dx, left ? -70 : 70), dy = num(o.dy, -44);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); ln.setAttribute('fill', 'none'); ln.setAttribute('stroke', colr); ln.setAttribute('stroke-width', '1.2'); ln.setAttribute('stroke-opacity', '0.85'); CALL.svg.appendChild(ln);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '3.2'); dot.setAttribute('fill', colr); CALL.svg.appendChild(dot);
    const box = document.createElement('div'); box.style.cssText = 'position:absolute;white-space:nowrap;color:' + colr + ';text-shadow:0 0 3px rgba(0,0,0,0.75),0 0 9px rgba(0,0,0,0.5);transition:opacity .3s;line-height:1.2;' + (left ? 'text-align:right;' : ''); CALL.el.appendChild(box);
    const wp = new THREE.Vector3(), v = new THREE.Vector3(); let acc = 99;
    const setText = (title, text) => { box.innerHTML = '<div style="font-size:10px;letter-spacing:.09em;text-transform:uppercase;opacity:.78;font-weight:700"></div><div style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums"></div>'; box.children[0].textContent = title || ''; box.children[1].textContent = text == null ? '' : String(text); };
    setText(o.title, typeof o.value === 'function' ? '' : o.text);
    frameHooks.push((dt) => {
      if (o.target && o.target.getWorldPosition) { o.target.getWorldPosition(wp); if (o.pos) wp.add(P3(o)); } else wp.copy(P3(o));
      v.copy(wp).project(camera); const W = innerWidth, H = innerHeight, show = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      if (typeof o.value === 'function') { acc += dt; if (acc > 0.25) { acc = 0; try { setText(o.title, o.value()); } catch (e) { setText(o.title, ''); } } }
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, lx = x + dx, ly = y + dy; if (!isFinite(x) || !isFinite(y)) return;
      ln.setAttribute('points', x + ',' + y + ' ' + lx + ',' + ly + ' ' + (lx + (left ? -14 : 14)) + ',' + ly); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      box.style.left = (left ? lx - 18 - box.offsetWidth : lx + 18) + 'px'; box.style.top = (ly - box.offsetHeight / 2) + 'px'; const op = show ? '1' : '0'; box.style.opacity = op; ln.style.opacity = op; dot.style.opacity = op;
    });
    return { box, setText };
  }

  /** cook.explode([{obj,offset:[x,y,z]},...],{duration,hold,loop,amount}) - exploded-view animation: parts glide apart along their offsets and back together (product anatomy, assembly); returns {set(k)} for manual control (loop:false) */
  function explode(parts, o) {
    o = o || {}; const P = (Array.isArray(parts) ? parts : []).filter((p) => p && p.obj && p.obj.position).map((p) => ({ obj: p.obj, base: p.obj.position.clone(), off: vec3(p.offset, [0, 0.3, 0]) })); if (!P.length) throw new Error('explode needs parts');
    const amt = num(o.amount, 1), dur = clamp(num(o.duration, 8), 2, 60), hold = clamp(num(o.hold, 0.25), 0, 0.45), set = (k) => { const e = k * k * (3 - 2 * k) * amt; P.forEach((p) => p.obj.position.set(p.base.x + p.off.x * e, p.base.y + p.off.y * e, p.base.z + p.off.z * e)); };
    if (o.loop !== false) frameHooks.push((dt, t) => { const ph = (t / dur) % 1, k = clamp((0.5 - 0.5 * Math.cos(ph * Math.PI * 2) - hold) / (1 - 2 * hold), 0, 1); set(k); });
    return { set };
  }

  /* ------------------------------------------------------------------ v9 additions: learnt from the refinery pump study (lofted casings, flanges, centrifugal impeller, part inspector, gauges, story beats) */
  /** cook.machine.loft([[x,y,z],...],{r:[r0,r1]|r,ry,rFn(u)->[a,b],radial,wall,caps,kind|material,pos,parent}) - closed solid swept along a curve with a changing (elliptical) cross section: volute casings, horns, handles, tapered pipes, tentacles, spouts; wall = hollow pipe */
  function mLoft(pts, o) {
    o = o || {}; const P = (Array.isArray(pts) ? pts : []).map((p) => new THREE.Vector3(num(p[0], 0), num(p[1], 0), num(p[2], 0))); if (P.length < 2) throw new Error('loft needs 2+ points');
    const curve = new THREE.CatmullRomCurve3(P, false, 'catmullrom', 0.5), n = clamp(P.length * 8, 16, 120), R = clamp(Math.floor(num(o.radial, 28)), 8, 64), fr = curve.computeFrenetFrames(n, false), r = Array.isArray(o.r) ? o.r : [num(o.r, 0.05), num(o.r, 0.05)], ry = num(o.ry, 1), wall = num(o.wall, 0);
    const rf = typeof o.rFn === 'function' ? o.rFn : (u) => { const a = r[0] + (r[1] - r[0]) * u; return [a, a * ry]; };
    const rings = [], ctr = []; for (let i = 0; i <= n; i++) { const u = i / n, c = curve.getPointAt(u), ab = rf(u), N = fr.normals[i], B = fr.binormals[i], s = []; ctr.push(c);
      for (let k = 0; k <= R; k++) { const t = k / R * Math.PI * 2; s.push([c.clone().addScaledVector(B, Math.cos(t) * num(ab[0], 0.05)).addScaledVector(N, Math.sin(t) * num(ab[1], 0.05)), wall > 0 ? c.clone().addScaledVector(B, Math.cos(t) * Math.max(0.001, num(ab[0], 0.05) - wall)).addScaledVector(N, Math.sin(t) * Math.max(0.001, num(ab[1], 0.05) - wall)) : null]); }
      rings.push(s); }
    const pos = [], idx = [], push = (v) => { pos.push(v.x, v.y, v.z); return pos.length / 3 - 1; }, tri = (a, b, c, want) => { const A = new THREE.Vector3(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]), B = new THREE.Vector3(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]), C = new THREE.Vector3(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]); const nn = B.clone().sub(A).cross(C.clone().sub(A)); if (nn.dot(want) >= 0) idx.push(a, b, c); else idx.push(a, c, b); };
    const oi = rings.map((s) => s.map((p) => push(p[0]))), ii = wall > 0 ? rings.map((s) => s.map((p) => push(p[1]))) : null;
    for (let i = 0; i < n; i++) for (let k = 0; k < R; k++) { [[oi, 1], [ii, -1]].forEach((q) => { const I = q[0]; if (!I) return; const a = I[i][k], b = I[i][k + 1], c = I[i + 1][k], d = I[i + 1][k + 1]; const mid = new THREE.Vector3(); [a, b, c, d].forEach((j) => mid.add(new THREE.Vector3(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]))); mid.multiplyScalar(0.25).sub(ctr[i]); const want = mid.multiplyScalar(q[1]); tri(a, b, c, want); tri(b, d, c, want); }); }
    [[0, -1], [n, 1]].forEach((e) => { const j = e[0], t = (e[1] > 0 ? ctr[n].clone().sub(ctr[n - 1]) : ctr[0].clone().sub(ctr[1])); if (wall > 0) { for (let k = 0; k < R; k++) { tri(oi[j][k], oi[j][k + 1], ii[j][k], t); tri(oi[j][k + 1], ii[j][k + 1], ii[j][k], t); } } else { const cc = push(ctr[j]); for (let k = 0; k < R; k++) tri(oi[j][k], oi[j][k + 1], cc, t); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals();
    return put(shadowed(new THREE.Mesh(g, matOf(o, 'steel'))), o);
  }
  /** cook.machine.flange({od,id,t,n,bc,hole,axis:'z'|'x'|'y',kind|material,pos,parent}) - pipe flange with real bolt holes (bc = bolt circle diameter) */
  function mFlange(o) {
    o = o || {}; const od = num(o.od, 0.3), id = num(o.id, 0.12), t = num(o.t, 0.03), n = clamp(Math.floor(num(o.n, 8)), 3, 32), bc = num(o.bc, od * 0.8), hole = num(o.hole, od * 0.06), sh = new THREE.Shape(); sh.absarc(0, 0, od / 2, 0, Math.PI * 2, false);
    const hb = new THREE.Path(); hb.absarc(0, 0, id / 2, 0, Math.PI * 2, true); sh.holes.push(hb); for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2, p = new THREE.Path(); p.absarc(bc / 2 * Math.cos(a), bc / 2 * Math.sin(a), hole / 2, 0, Math.PI * 2, true); sh.holes.push(p); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: t * 0.05, bevelSize: t * 0.05, bevelSegments: 2, curveSegments: 40 }); g.translate(0, 0, -t / 2); if (o.axis === 'x') g.rotateY(Math.PI / 2); else if (o.axis === 'y') g.rotateX(-Math.PI / 2); g.computeVertexNormals();
    return put(shadowed(new THREE.Mesh(g, matOf(o, 'steel'))), o);
  }
  /** cook.machine.impeller({vanes,r1,r2,width,beta,t,shroud,axis:'z'|'y'|'x',spin,kind|material,pos,parent}) - centrifugal impeller: backward-curved logarithmic-spiral vanes on a back disc (pump, blower, turbocharger, centrifugal fan); beta = vane angle in degrees */
  function mImpeller(o) {
    o = o || {}; const nv = clamp(Math.floor(num(o.vanes, 6)), 3, 24), r1 = num(o.r1, 0.06), r2 = Math.max(r1 * 1.5, num(o.r2, 0.2)), w = num(o.width, 0.04), beta = clamp(num(o.beta, 25), 8, 80) * Math.PI / 180, t = num(o.t, 0.006), m = matOf(o, 'stainless');
    const L = [], Rr = []; for (let i = 0; i <= 14; i++) { const r = r1 + (r2 - r1) * i / 14, psi = -Math.log(r / r1) / Math.tan(beta); L.push([r * Math.cos(psi), r * Math.sin(psi)]); }
    const left = [], right = []; for (let i = 0; i < L.length; i++) { const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * t / 2, ny = dx / l * t / 2; left.push([L[i][0] + nx, L[i][1] + ny]); right.push([L[i][0] - nx, L[i][1] - ny]); }
    const sh = new THREE.Shape(); sh.moveTo(left[0][0], left[0][1]); left.forEach((p) => sh.lineTo(p[0], p[1])); right.reverse().forEach((p) => sh.lineTo(p[0], p[1])); sh.closePath();
    const vg = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 4 }), im = new THREE.InstancedMesh(vg, m, nv), d = new THREE.Object3D(); im.castShadow = true; im.frustumCulled = false;
    for (let i = 0; i < nv; i++) { d.rotation.set(0, 0, i / nv * Math.PI * 2); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
    const sp = new THREE.Group(); sp.add(im); const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r2 * 1.04, r2 * 1.04, t * 1.6, 56).rotateX(Math.PI / 2), m)); disc.position.z = -t * 0.8; sp.add(disc);
    const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r1 * 0.5, r1 * 0.5, w * 1.1, 24).rotateX(Math.PI / 2), m)); hub.position.z = w * 0.5; sp.add(hub);
    if (o.shroud) { const sr = shadowed(new THREE.Mesh(new THREE.RingGeometry(r1 * 0.95, r2 * 1.04, 56), m)); sr.material = m.clone(); sr.material.side = THREE.DoubleSide; sr.position.z = w + t * 0.5; sp.add(sr); }
    const g = new THREE.Group(); g.add(sp); if (o.axis === 'y') g.rotation.x = -Math.PI / 2; else if (o.axis === 'x') g.rotation.y = Math.PI / 2; const s = slowSpin(o.spin, o); if (s) frameHooks.push((dt) => { sp.rotation.z += s * dt; }); g.userData.spinner = sp; used.props++; return put(g, o);
  }
  machine.loft = mLoft; machine.flange = mFlange; machine.impeller = mImpeller;

  /** cook.shake(obj,{amp,freq}) - visible vibration (metres): returns {amp} to set live from a state (misalignment, cavitation, imbalance) */
  function shake(obj, o) {
    o = o || {}; const c = { amp: num(o.amp, 0.002) }, f = num(o.freq, 24), prev = new THREE.Vector3();
    frameHooks.push((dt, t) => { obj.position.sub(prev); const a = c.amp; prev.set(Math.sin(t * f) * a + Math.sin(t * f * 2.3 + 1) * a * 0.5, Math.sin(t * f * 1.7 + 2) * a, Math.sin(t * f * 1.3 + 4) * a * 0.7); obj.position.add(prev); }); return c;
  }
  /** cook.inspect([{obj,title,text,tip}],{max}) - tap / hover a part to see a small card (what it is, what to check); the customer picture can be one of the parts */
  function inspect(items, o) {
    o = o || {}; const list_ = (Array.isArray(items) ? items : []).filter((i) => i && i.obj).slice(0, 12); if (!list_.length) throw new Error('inspect needs parts');
    const card = document.createElement('div'); card.style.cssText = 'position:fixed;z-index:6;pointer-events:none;max-width:260px;background:rgba(250,249,246,0.96);color:#1c1c1c;border-radius:12px;padding:10px 12px 11px;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.28);opacity:0;transition:opacity .2s;left:0;top:0'; document.body.appendChild(card);
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), el = renderer.domElement; let hideAt = 0, down = null;
    const show = (e) => { const r = el.getBoundingClientRect(); v2.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v2, camera); let best = null, bd = 1e9; list_.forEach((it) => { const h = ray.intersectObject(it.obj, true); if (h.length && h[0].distance < bd) { bd = h[0].distance; best = it; } });
      if (!best) { card.style.opacity = '0'; return; } card.innerHTML = '<div style="font-weight:800;font-size:13px;margin-bottom:3px"></div><div style="font-size:12px;line-height:1.35;color:#444"></div>' + (best.tip ? '<div style="font-size:11px;line-height:1.35;color:#8a5a00;margin-top:6px;font-weight:600"></div>' : ''); card.children[0].textContent = best.title || ''; card.children[1].textContent = best.text || ''; if (best.tip) card.children[2].textContent = best.tip;
      const W = card.offsetWidth || 240, H = card.offsetHeight || 80; card.style.left = Math.max(8, Math.min(innerWidth - W - 8, e.clientX + 16)) + 'px'; card.style.top = Math.max(8, Math.min(innerHeight - H - 8, e.clientY + 14)) + 'px'; card.style.opacity = '1'; hideAt = performance.now() + 5000; };
    el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(e); }); el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; }); el.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 8) show(e); down = null; });
    frameHooks.push(() => { if (hideAt && performance.now() > hideAt) { hideAt = 0; card.style.opacity = '0'; } }); return { card };
  }
  /** cook.gauge({title,min,max,value:()=>n,unit,corner:'bl'|'br'|'tl'|'tr',color,digits}) - round dial in a screen corner with a live needle and number (speed, pressure, temperature, battery); max 4 */
  const GAUGE = { n: { bl: 0, br: 0, tl: 0, tr: 0 }, total: 0 };
  function gauge(o) {
    o = o || {}; if (GAUGE.total >= 4) throw new Error('gauge limit'); GAUGE.total++; const cn = ['bl', 'br', 'tl', 'tr'].indexOf(o.corner) >= 0 ? o.corner : 'tl', k = GAUGE.n[cn]++, colr = o.color || '#ffd36b', mn = num(o.min, 0), mx = num(o.max, 100), dg = clamp(Math.floor(num(o.digits, 0)), 0, 3);
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:5;pointer-events:none;width:92px;text-align:center;font-family:system-ui,-apple-system,sans-serif;color:#fff;text-shadow:0 0 4px rgba(0,0,0,0.7);' + (cn[0] === 'b' ? 'bottom:' + (150 + (k % 2) * 108) + 'px;' : 'top:' + (56 + (k % 2) * 108) + 'px;') + (cn[1] === 'l' ? 'left:' + (12 + Math.floor(k / 2) * 100) + 'px;' : 'right:' + (12 + Math.floor(k / 2) * 100) + 'px;');
    const A0 = -225, A1 = 45, pt = (a, r) => (46 + r * Math.cos(a * Math.PI / 180)).toFixed(1) + ' ' + (46 + r * Math.sin(a * Math.PI / 180)).toFixed(1), arc = (a, b) => 'M' + pt(a, 38) + ' A38 38 0 ' + (b - a > 180 ? 1 : 0) + ' 1 ' + pt(b, 38);
    d.innerHTML = '<svg width="92" height="76" viewBox="0 0 92 80" style="display:block"><path d="' + arc(A0, A1) + '" stroke="rgba(255,255,255,0.28)" stroke-width="5" fill="none" stroke-linecap="round"/><path class="g" d="' + arc(A0, A0 + 0.1) + '" stroke="' + colr + '" stroke-width="5" fill="none" stroke-linecap="round"/><line class="n" x1="46" y1="46" x2="46" y2="14" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="46" cy="46" r="3.5" fill="#fff"/></svg><div class="v" style="font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:-18px"></div><div style="font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;font-weight:700"></div>';
    d.children[2].textContent = (o.title || '') + (o.unit ? ' · ' + o.unit : ''); document.body.appendChild(d); const g = d.querySelector('.g'), nd = d.querySelector('.n'), vt = d.querySelector('.v'); let cur = mn;
    frameHooks.push((dt) => { let t = mn; try { t = typeof o.value === 'function' ? num(o.value(), mn) : num(o.value, mn); } catch (e) { /* keep last */ } cur = approach(cur, t, 0.18, dt); const f = clamp((cur - mn) / (mx - mn || 1), 0, 1), a = A0 + (A1 - A0) * f; g.setAttribute('d', arc(A0, A0 + Math.max(0.1, a - A0))); nd.setAttribute('transform', 'rotate(' + (a + 90) + ' 46 46)'); vt.textContent = cur.toFixed(dg); });
    return { el: d };
  }
  /** cook.beats([{t,title,sub,dur}],{loop}) - numbered story captions that fade in and out on a timeline ("01  It runs on its curve." + a grey sub line); the scene tells a short story; max 6 */
  function beats(list2, o) {
    o = o || {}; const B = (Array.isArray(list2) ? list2 : []).slice(0, 6).map((b, i) => ({ t: num(b.t, i * 5), dur: clamp(num(b.dur, 4), 1.5, 15), title: String(b.title || ''), sub: String(b.sub || ''), n: i + 1 })); if (!B.length) throw new Error('beats needs entries');
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:14px;right:14px;bottom:' + num(o.bottom, 70) + 'px;z-index:5;pointer-events:none;display:flex;align-items:center;gap:10px;opacity:0;font-family:system-ui,-apple-system,sans-serif;color:#fff;text-shadow:0 0 4px rgba(0,0,0,0.75),0 0 12px rgba(0,0,0,0.5)'; d.innerHTML = '<span style="font-size:11px;font-weight:800;border:1px solid rgba(255,255,255,0.6);padding:4px 6px;border-radius:3px;font-variant-numeric:tabular-nums"></span><div><div style="font-size:18px;font-weight:700;line-height:1.2"></div><div style="font-size:12.5px;opacity:.8;margin-top:2px"></div></div>'; document.body.appendChild(d);
    const last = B[B.length - 1], total = last.t + last.dur + num(o.gap, 2); let cur = -1; let lastB = -1; frameHooks.push((dt, t) => { const bt = o.bottom != null ? num(o.bottom, 70) : 70 + HUD.below; if (bt !== lastB) { lastB = bt; d.style.bottom = bt + 'px'; } const tt = o.loop === false ? t : t % total; let hit = -1; B.forEach((b, i) => { if (tt >= b.t && tt < b.t + b.dur) hit = i; }); if (hit !== cur) { cur = hit; if (hit >= 0) { d.children[0].textContent = (B[hit].n < 10 ? '0' : '') + B[hit].n; d.children[1].children[0].textContent = B[hit].title; d.children[1].children[1].textContent = B[hit].sub; } } d.style.opacity = hit >= 0 ? String(Math.min(1, (tt - B[hit].t) / 0.4, (B[hit].t + B[hit].dur - tt) / 0.4)) : '0'; });
    return { el: d };
  }

  /* ------------------------------------------------------------------ v10 additions: learnt from the compressor study (temperature ramps, reversed flow on a fault, live performance map) */
  /** cook.ramp(t,stops) - colour along a ramp, t 0..1; stops = [[0,'#3373f2'],[0.5,'#ebb88c'],[1,'#ff6119']] by default (cold blue -> warm sand -> hot orange); returns a THREE.Color (use in cook.flow colorFn, materials, particles) */
  function ramp(t, stops) {
    const S = (Array.isArray(stops) && stops.length > 1 ? stops : [[0, '#3373f2'], [0.5, '#ebb88c'], [1, '#ff6119']]).map((s) => [num(s[0], 0), col(s[1], '#ffffff')]).sort((a, b) => a[0] - b[0]), x = clamp(num(t, 0), S[0][0], S[S.length - 1][0]), out = new THREE.Color();
    for (let i = 0; i < S.length - 1; i++) if (x <= S[i + 1][0]) { const k = (x - S[i][0]) / Math.max(1e-6, S[i + 1][0] - S[i][0]); return out.copy(S[i][1]).lerp(S[i + 1][1], k); } return out.copy(S[S.length - 1][1]);
  }
  /** cook.chart({title,curves:[{pts:[[x,y],...],color,width,dash}],x:[min,max],y:[min,max],point:()=>[x,y],trail,corner:'br'|'bl'|'tl'|'tr',xlabel,ylabel,color}) - small live performance map: reference curves (e.g. pump / compressor curve, battery discharge, frequency response, surge line) and a moving operating point with a fading trail; max 2 */
  const CHARTS = { n: 0 };
  function chart(o) {
    o = o || {}; if (CHARTS.n >= 2) throw new Error('chart limit'); const k = CHARTS.n++, W = 176, H = 122, cn = ['bl', 'br', 'tl', 'tr'].indexOf(o.corner) >= 0 ? o.corner : 'br', xr = list(o.x, [0, 1]), yr = list(o.y, [0, 1]), x0 = num(xr[0], 0), x1 = num(xr[1], 1), y0 = num(yr[0], 0), y1 = num(yr[1], 1), pc = o.color || '#ffd36b';
    const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2; cv.style.cssText = 'position:fixed;z-index:5;pointer-events:none;width:' + W + 'px;height:' + H + 'px;border-radius:10px;background:rgba(10,12,18,0.5);' + (cn[0] === 'b' ? 'bottom:' + (150 + k * (H + 10)) + 'px;' : 'top:' + (56 + k * (H + 10)) + 'px;') + (cn[1] === 'l' ? 'left:12px;' : 'right:12px;'); document.body.appendChild(cv); const g = cv.getContext('2d'); g.scale(2, 2);
    const curves = (Array.isArray(o.curves) ? o.curves : []).slice(0, 4), trail = [], tn = clamp(Math.floor(num(o.trail, 60)), 0, 120), L = 30, B = 22, R = 8, T = 18, px = (x) => L + (clamp((x - x0) / (x1 - x0 || 1), 0, 1)) * (W - L - R), py = (y) => H - B - (clamp((y - y0) / (y1 - y0 || 1), 0, 1)) * (H - B - T); let acc = 9;
    frameHooks.push((dt) => { acc += dt; if (acc < 0.05) return; acc = 0; let pt = null; try { pt = typeof o.point === 'function' ? o.point() : null; } catch (e) { pt = null; }
      if (pt && tn) { trail.push([num(pt[0], 0), num(pt[1], 0)]); if (trail.length > tn) trail.shift(); }
      g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = '700 9px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText((o.title || '').toUpperCase(), L, 12); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, T); g.lineTo(L, H - B); g.lineTo(W - R, H - B); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.65)'; g.font = '8.5px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText(o.xlabel || '', (L + W - R) / 2, H - 6); if (o.ylabel) { g.save(); g.translate(8, (T + H - B) / 2); g.rotate(-Math.PI / 2); g.fillText(o.ylabel, 0, 0); g.restore(); }
      curves.forEach((c, i) => { const p = Array.isArray(c.pts) ? c.pts : []; if (p.length < 2) return; g.strokeStyle = c.color || (i ? '#ff6b5b' : '#9bd0ff'); g.lineWidth = num(c.width, 1.6); g.setLineDash(c.dash ? [4, 3] : []); g.beginPath(); p.forEach((q, j) => { if (j) g.lineTo(px(q[0]), py(q[1])); else g.moveTo(px(q[0]), py(q[1])); }); g.stroke(); }); g.setLineDash([]);
      trail.forEach((q, j) => { g.globalAlpha = (j + 1) / trail.length * 0.5; g.fillStyle = pc; g.beginPath(); g.arc(px(q[0]), py(q[1]), 1.6, 0, 7); g.fill(); }); g.globalAlpha = 1; if (pt) { g.fillStyle = pc; g.beginPath(); g.arc(px(num(pt[0], 0)), py(num(pt[1], 0)), 4, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.stroke(); } });
    return { el: cv };
  }

  /* ------------------------------------------------------------------ v11 additions: learnt from the lab kit study (live controls, one big live number, x-ray, parts that break off, build-up intro, mode buttons, small physics helpers) */
  const HUD = { below: 0 }; /* pixels the bottom sliders take, so story captions sit above them */
  const HUD_FONT = 'font-family:system-ui,-apple-system,sans-serif;';
  const HUD_SHADOW = 'text-shadow:0 0 4px rgba(0,0,0,0.75),0 0 12px rgba(0,0,0,0.45);';
  /** cook.table(xs,ys,x) - piecewise linear lookup (xs ascending): a curve from a datasheet (thrust vs throttle, efficiency vs flow) */
  function table(xs, ys, x) {
    const X = list(xs, []).map((v) => num(v, 0)), Y = list(ys, []).map((v) => num(v, 0)); if (!X.length || X.length !== Y.length) return 0; x = num(x, X[0]); if (x <= X[0]) return Y[0];
    for (let i = 1; i < X.length; i++) if (x <= X[i]) return Y[i - 1] + (Y[i] - Y[i - 1]) * (x - X[i - 1]) / Math.max(1e-9, X[i] - X[i - 1]); return Y[Y.length - 1];
  }
  /** cook.rk4(f,t,y,h) - one Runge-Kutta step of dy/dt = f(t,y) for an array state: spool-up, thermal mass, a pendulum, a spring; call it from cook.on('frame') with h = dt */
  function rk4(f, t, y, h) {
    h = clamp(num(h, 0.016), 0, 0.05); const add = (a, b, k) => a.map((v, i) => v + b[i] * k), k1 = f(t, y), k2 = f(t + h / 2, add(y, k1, h / 2)), k3 = f(t + h / 2, add(y, k2, h / 2)), k4 = f(t + h, add(y, k3, h)), r = y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    return r.every((v) => isFinite(v)) ? r : y;
  }
  /** cook.fmt(v,digits) - number with thousands grouping: fmt(144712) = "144,712", fmt(3.14159,2) = "3.14" */
  function fmt(v, d) { v = Number(v); if (!isFinite(v)) return '--'; const g = clamp(Math.floor(num(d, 0)), 0, 6); return v.toLocaleString('en-US', { minimumFractionDigits: g, maximumFractionDigits: g }); }
  /** cook.blackbody(kelvin) - THREE.Color of a glowing hot body (800 K dull red, 1500 orange, 2500 yellow, 6500 white): emissive colours of hot parts, flames, filaments */
  function blackbody(K) {
    const t = clamp(num(K, 1500), 800, 12000) / 100; let r, g, b; if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; } else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
    return new THREE.Color().setRGB(clamp(r / 255, 0, 1), clamp(g / 255, 0, 1), clamp(b / 255, 0, 1), THREE.SRGBColorSpace);
  }
  /** cook.mass(root,{density}) - volume (m3) and mass (kg, default steel 7850) of the closed solids under root, from the real geometry and scale: honest weight readouts ("38 kg"); open shells and flat planes count as zero */
  function mass(root, o) {
    o = o || {}; const rho = num(o.density, 7850); let V = 0, tris = 0; root.updateWorldMatrix(true, true); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    root.traverse((m) => { if (!m.isMesh || m.userData.noMass || m.userData.xrayGhost || !m.geometry || !m.geometry.attributes.position || tris > 400000) return; const g = m.geometry, p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count; let v = 0; tris += n / 3;
      for (let i = 0; i + 2 < n; i += 3) { const i0 = ix ? ix.getX(i) : i, i1 = ix ? ix.getX(i + 1) : i + 1, i2 = ix ? ix.getX(i + 2) : i + 2; a.fromBufferAttribute(p, i0).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(p, i1).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(p, i2).applyMatrix4(m.matrixWorld); v += a.dot(b.cross(c)) / 6; }
      V += Math.abs(v) * (m.isInstancedMesh ? m.count : 1); });
    return { volume: V, kg: V * rho, density: rho };
  }

  /** cook.slider({label,min,max,value,unit,ends:['Idle','Take-off'],digits,color,onInput}) - a touch slider at the bottom of the screen (max 2) that the customer drags to change the scene (throttle, temperature, load, time of day); returns {value,get(),set(v)}: read s.value inside cook.on('frame') and chase it with cook.approach so everything (spin, plume, glow, gauge) follows it */
  const SLIDERS = { n: 0 };
  function slider(o) {
    o = o || {}; if (SLIDERS.n >= 2) throw new Error('slider limit'); const k = SLIDERS.n++, mn = num(o.min, 0), mxv = Math.max(mn + 1e-6, num(o.max, 1)), dg = clamp(Math.floor(num(o.digits, 0)), 0, 3), colr = o.color || '#ffd36b', ends = list(o.ends, ['', '']);
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:6;left:14px;right:14px;bottom:' + (14 + k * 56) + 'px;max-width:440px;margin:0 auto;pointer-events:auto;touch-action:manipulation;color:#fff;background:rgba(10,12,18,0.5);border-radius:14px;padding:7px 14px 5px;' + HUD_FONT + HUD_SHADOW;
    d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase"><span></span><b style="font-size:14px;font-variant-numeric:tabular-nums"></b></div><input type="range" style="width:100%;height:28px;margin:2px 0 0;accent-color:' + colr + ';touch-action:pan-y"><div style="display:flex;justify-content:space-between;font-size:10px;opacity:.65;margin-top:-4px"><span></span><span></span></div>';
    const lab = d.children[0].children[0], out = d.children[0].children[1], inp = d.children[1]; lab.textContent = o.label || ''; d.children[2].children[0].textContent = String(ends[0] || ''); d.children[2].children[1].textContent = String(ends[1] || '');
    inp.min = String(mn); inp.max = String(mxv); inp.step = String((mxv - mn) / 500); const c = { value: clamp(num(o.value, mn), mn, mxv), el: d }; inp.value = String(c.value);
    const show = () => { out.textContent = fmt(c.value, dg) + (o.unit ? ' ' + o.unit : ''); }; show();
    inp.addEventListener('input', () => { c.value = clamp(num(inp.value, mn), mn, mxv); show(); if (typeof o.onInput === 'function') { try { o.onInput(c.value); } catch (e) { warn('slider onInput: ' + e.message); } } });
    c.get = () => c.value; c.set = (v) => { c.value = clamp(num(v, c.value), mn, mxv); inp.value = String(c.value); show(); };
    document.body.appendChild(d); HUD.below = Math.max(HUD.below, 14 + (k + 1) * 56); return c;
  }

  /** cook.hero({label,unit,max,digits,value:()=>n,state:()=>'spooling up',sub:()=>'N1 94 % · EGT 959 C',bad:()=>bool}) - ONE huge live number with a thin bar under it (thrust, speed, output, price) in the top right: the editorial headline of an engineering or product-data scene; keep chart corner away from 'tr' when using it */
  let heroMade = false;
  function hero(o) {
    o = o || {}; if (heroMade) throw new Error('hero limit'); heroMade = true; const mxv = Math.max(1e-6, num(o.max, 100)), dg = clamp(Math.floor(num(o.digits, 0)), 0, 3);
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:5;pointer-events:none;top:84px;right:14px;text-align:right;min-width:150px;max-width:56vw;color:#fff;' + HUD_FONT + HUD_SHADOW;
    d.innerHTML = '<div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.85"></div><div style="font-family:Georgia,\'Times New Roman\',serif;font-size:48px;line-height:1.02;font-variant-numeric:lining-nums tabular-nums;white-space:nowrap"><span></span><i style="font-size:.38em;opacity:.75;margin-left:.15em;font-style:normal"></i></div><div style="height:3px;background:rgba(255,255,255,0.25);margin:3px 0 5px;position:relative"><div style="position:absolute;left:0;top:0;bottom:0;width:0;background:#fff"></div></div><div style="font-size:11.5px;line-height:1.4;opacity:.85;font-variant-numeric:tabular-nums"></div>';
    const lb = d.children[0], vv = d.children[1].children[0], un = d.children[1].children[1], bar = d.children[2].firstChild, sb = d.children[3]; un.textContent = o.unit || ''; document.body.appendChild(d); let acc = 9, cur = 0;
    frameHooks.push((dt) => { acc += dt; if (acc < 0.08) return; const h = acc; acc = 0; let v = 0, st = '', sub = '', bad = false; try { v = typeof o.value === 'function' ? num(o.value(), 0) : num(o.value, 0); if (typeof o.state === 'function') st = String(o.state() || ''); if (typeof o.sub === 'function') sub = String(o.sub() || ''); if (typeof o.bad === 'function') bad = !!o.bad(); } catch (e) { /* keep last */ }
      cur = approach(cur, v, 0.15, h); vv.textContent = fmt(cur, dg); lb.textContent = (o.label || '') + (st ? ' · ' + st : ''); sb.textContent = sub; bar.style.width = clamp(cur / mxv, 0, 1) * 100 + '%'; bar.style.background = bad ? '#ff6a3d' : '#fff'; });
    return { el: d };
  }

  /** cook.scaleBar({unitsPerMetre,target:[x,y,z],corner}) - a real-size ruler (1 m / 20 cm / 5 mm ...) that follows the camera zoom: the scene units that equal one metre are unitsPerMetre (1 when the model is drawn in metres); gives engineering scenes their sense of size */
  function scaleBar(o) {
    o = o || {}; const upm = Math.max(1e-6, num(o.unitsPerMetre, 1)), tg = vec3(o.target, [0, 0, 0]), d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:5;pointer-events:none;top:56px;right:14px;color:#fff;font-size:10.5px;font-variant-numeric:tabular-nums;text-align:right;' + HUD_FONT + HUD_SHADOW; d.innerHTML = '<span></span><div style="height:1px;background:#fff;margin-top:4px;position:relative"><i style="position:absolute;left:0;top:-3px;width:1px;height:7px;background:#fff"></i><i style="position:absolute;right:0;top:-3px;width:1px;height:7px;background:#fff"></i></div>'; document.body.appendChild(d);
    const nice = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; let acc = 9;
    frameHooks.push((dt) => { acc += dt; if (acc < 0.12) return; acc = 0; const dist = Math.max(1e-3, camera.position.distanceTo(tg)), ppu = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist), ppm = ppu * upm; let L = nice[0]; for (let i = 0; i < nice.length; i++) if (nice[i] * ppm <= 110) L = nice[i];
      d.children[1].style.width = (L * ppm).toFixed(1) + 'px'; d.children[1].style.marginLeft = 'auto'; d.children[0].textContent = L >= 1 ? L + ' m' : L >= 0.01 ? Math.round(L * 100) + ' cm' : Math.round(L * 1000) + ' mm'; });
    return { el: d };
  }

  /** cook.xray(root,{color,loop:false,duration}) - X-ray mode: the solids fade to glass and a glowing fresnel outline shows every part inside; returns {set(k)} (0 solid .. 1 x-ray); loops by default (10 s), pass loop:false to drive it from cook.modes or a slider; parts with userData.noXray stay solid */
  function xray(root, o) {
    o = o || {}; const U = { uA: { value: 0 }, uC: { value: col(o.color || '#9fc4ff', '#9fc4ff') } };
    const gm = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 p = vec4(position, 1.0); vec3 n = normal;\n#ifdef USE_INSTANCING\np = instanceMatrix * p; n = mat3(instanceMatrix) * n;\n#endif\nvec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * n); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uC, (0.06 + 0.55 * f) * uA);\n#include <colorspace_fragment>\n}' });
    const items = [], mats = new Map(); root.traverse((m) => { if (!m.isMesh || m.userData.noXray || m.userData.xrayGhost || !m.geometry || items.length >= 160) return; const g = m.isInstancedMesh ? new THREE.InstancedMesh(m.geometry, gm, m.count) : new THREE.Mesh(m.geometry, gm); if (m.isInstancedMesh) g.instanceMatrix = m.instanceMatrix; g.userData.xrayGhost = true; g.renderOrder = 5; g.frustumCulled = false; g.castShadow = false; g.receiveShadow = false; g.visible = false; items.push({ m, g });
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => { if (mt && !mats.has(mt)) mats.set(mt, { t: mt.transparent, o: mt.opacity, dw: mt.depthWrite }); }); });
    items.forEach((it) => it.m.add(it.g));
    const lm = new THREE.LineBasicMaterial({ color: col(o.color || '#9fc4ff', '#9fc4ff'), transparent: true, opacity: 0, depthWrite: false }), edges = []; let built = false, cur = -1;
    const build = () => { built = true; items.forEach((it) => { if (it.m.isInstancedMesh || edges.length >= 60) return; const pg = it.m.geometry, n = pg.index ? pg.index.count : pg.attributes.position.count; if (n > 120000) return; const l = new THREE.LineSegments(new THREE.EdgesGeometry(pg, 28), lm); l.userData.xrayGhost = true; l.renderOrder = 6; l.visible = false; it.m.add(l); edges.push(l); }); };
    const set = (k) => { k = clamp(num(k, 0), 0, 1); if (Math.abs(k - cur) < 0.002) return; cur = k; U.uA.value = k; const on = k > 0.002; if (on && !built) build(); items.forEach((it) => { it.g.visible = on; }); edges.forEach((l) => { l.visible = on; }); lm.opacity = k * 0.4;
      mats.forEach((s, mt) => { if (mt.transmission > 0) return; const want = on ? true : s.t; if (mt.transparent !== want) { mt.transparent = want; mt.needsUpdate = true; } mt.opacity = s.o * (1 - k * 0.9); mt.depthWrite = on ? (k < 0.5 && s.dw) : s.dw; }); };
    if (o.loop !== false) { const dur = clamp(num(o.duration, 10), 3, 60); frameHooks.push((dt, t) => { const ph = (t / dur) % 1; set(clamp((0.5 - 0.5 * Math.cos(ph * Math.PI * 2) - 0.2) / 0.6, 0, 1)); }); }
    return { set };
  }

  /** cook.shed(obj,{at,every,velocity:[x,y,z],spin:[x,y,z],floorY,gravity}) - a part breaks off as a rigid body: flies out, tumbles, bounces on the floor; at = seconds when it lets go, every = replay period (omit to happen once); returns {go(),reset()} for a manual trigger (a "Break it" button); obj must sit directly in the scene or in an unrotated group */
  function shed(obj, o) {
    o = o || {}; if (!obj || !obj.position) throw new Error('shed needs an object'); const base = { p: obj.position.clone(), q: obj.quaternion.clone() }, v = new THREE.Vector3(), w = new THREE.Vector3(), V0 = vec3(o.velocity, [0.6, 1.8, 0.4]), W0 = vec3(o.spin, [2.5, 1.2, 1.8]), grav = num(o.gravity, 9.81), fy = num(o.floorY, 0), bx = new THREE.Box3(), q = new THREE.Quaternion(), e = new THREE.Euler(), at = o.at != null ? num(o.at, 0) : -1, every = num(o.every, 0); let on = false, last = -1;
    const go = () => { on = true; v.copy(V0); w.copy(W0); }, reset = () => { on = false; obj.position.copy(base.p); obj.quaternion.copy(base.q); };
    frameHooks.push((dt, t) => { if (at >= 0) { const cyc = every > 0 ? Math.floor((t - at) / every) : (t >= at ? 0 : -1); if (cyc >= 0 && cyc !== last) { last = cyc; reset(); go(); } }
      if (!on) return; const h = Math.min(dt, 0.05); v.y -= grav * h; obj.position.addScaledVector(v, h); e.set(w.x * h, w.y * h, w.z * h); q.setFromEuler(e); obj.quaternion.premultiply(q); bx.setFromObject(obj);
      if (bx.min.y < fy) { obj.position.y += fy - bx.min.y; if (v.y < 0) v.y *= -0.28; v.x *= 0.7; v.z *= 0.7; w.multiplyScalar(0.8); } });
    return { go, reset };
  }

  /** cook.assemble([{obj,from:[dx,dy,dz],name,count}],{duration,delay,stagger,distance,counter}) - build-up intro: the parts fly in one after another from outside and settle (with a "Building . Rotor . 12 of 38 parts" caption); parts are hidden until their turn; do not combine with a looping cook.explode on the same parts; start story beats after delay + duration */
  function assemble(parts, o) {
    o = o || {}; const P = list(parts, []).filter((p) => p && p.obj && p.obj.position).slice(0, 80).map((p) => ({ obj: p.obj, base: p.obj.position.clone(), from: p.from ? vec3(p.from, [0, 0.6, 0]) : null, name: String(p.name || p.obj.name || ''), n: Math.max(1, Math.floor(num(p.count, 1))) })); if (!P.length) throw new Error('assemble needs parts');
    const dur = clamp(num(o.duration, 3.5), 1, 20), delay = clamp(num(o.delay, 0.3), 0, 10), sg = clamp(num(o.stagger, 0.6), 0, 0.9), dist = num(o.distance, 1.2), total = P.reduce((s, p) => s + p.n, 0), ctr = new THREE.Vector3(); P.forEach((p) => ctr.add(p.base)); ctr.divideScalar(P.length);
    P.forEach((p) => { if (!p.from) { const dir = p.base.clone().sub(ctr); dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize().multiplyScalar(dist); dir.y = dist * 0.7; p.from = dir; } p.obj.visible = false; });
    let cap = null; if (o.counter !== false) { cap = document.createElement('div'); cap.style.cssText = 'position:fixed;left:14px;right:14px;bottom:' + (70 + HUD.below) + 'px;z-index:5;pointer-events:none;color:#fff;font-size:13px;font-weight:700;letter-spacing:.02em;font-variant-numeric:tabular-nums;opacity:0;' + HUD_FONT + HUD_SHADOW; document.body.appendChild(cap); }
    const st = { finished: false, progress: 0 }; let doneAt = -1;
    frameHooks.push((dt, t) => { if (st.finished) return; const tt = t - delay; let n = 0, cur = '', alld = true; P.forEach((p, i) => { const k0 = (tt - (i / P.length) * sg * dur) / (dur * (1 - sg)), k = clamp(k0, 0, 1), e = 1 - Math.pow(1 - k, 3); p.obj.visible = k > 0.001; p.obj.position.set(p.base.x + p.from.x * (1 - e), p.base.y + p.from.y * (1 - e), p.base.z + p.from.z * (1 - e)); if (k > 0.92) { n += p.n; if (p.name) cur = p.name; } if (k < 1) alld = false; });
      st.progress = n / total; if (cap) { cap.textContent = alld ? 'Built · ' + total + ' parts' : 'Building' + (cur ? ' · ' + cur : '') + ' · ' + n + ' of ' + total + ' parts'; cap.style.opacity = tt < 0 ? '0' : alld ? String(clamp(1 - (tt - doneAt) / 1.2, 0, 1)) : '1'; }
      if (alld && doneAt < 0) doneAt = tt; if (alld && tt - doneAt > 1.3) { st.finished = true; if (cap) cap.style.opacity = '0'; P.forEach((p) => p.obj.position.copy(p.base)); } });
    return { done: () => st.finished, progress: () => st.progress };
  }

  /** cook.modes([{label,set:(k)=>{},on:false}],{exclusive}) - a row of pill buttons across the top ("Explode", "X-ray", "Cut away", "Break it"): tapping toggles a mode and k eases smoothly 0..1 into set(k), so a mode can drive cook.explode(...).set, cook.xray(...).set, a cutaway sweep or a state variable; max 5; create the explode / xray with loop:false; returns {set(i,v),get(i)} */
  function modes(items, o) {
    o = o || {}; const L = list(items, []).filter((m) => m && typeof m.set === 'function').slice(0, 5); if (!L.length) throw new Error('modes needs entries'); const S = L.map((m) => ({ m, k: m.on ? 1 : 0, tg: m.on ? 1 : 0, last: -1 }));
    const row = document.createElement('div'); row.style.cssText = 'position:fixed;z-index:6;top:12px;left:14px;right:84px;display:flex;gap:6px;overflow-x:auto;pointer-events:none;' + HUD_FONT; document.body.appendChild(row);
    const paint = () => S.forEach((s, i) => { const b = row.children[i], a = s.tg > 0.5; b.style.background = a ? '#fff' : 'rgba(10,12,18,0.5)'; b.style.color = a ? '#111' : '#fff'; });
    S.forEach((s, i) => { const b = document.createElement('button'); b.textContent = String(s.m.label || 'Mode'); b.style.cssText = 'pointer-events:auto;flex:none;font:700 12px system-ui,sans-serif;color:#fff;background:rgba(10,12,18,0.5);border:1px solid rgba(255,255,255,0.55);border-radius:999px;padding:7px 13px;touch-action:manipulation;cursor:pointer';
      b.addEventListener('click', () => { const v = s.tg > 0.5 ? 0 : 1; if (o.exclusive && v) S.forEach((q) => { q.tg = 0; }); s.tg = v; paint(); }); row.appendChild(b); }); paint();
    frameHooks.push((dt) => { S.forEach((s) => { s.k = approach(s.k, s.tg, 0.3, dt); if (Math.abs(s.k - s.tg) < 0.002) s.k = s.tg; if (Math.abs(s.k - s.last) > 1e-4) { s.last = s.k; try { s.m.set(s.k); } catch (e) { warn('mode ' + s.m.label + ': ' + e.message); } } }); });
    return { set: (i, v) => { if (S[i]) { S[i].tg = v ? 1 : 0; paint(); } }, get: (i) => (S[i] ? S[i].tg : 0) };
  }

  /* ------------------------------------------------------------------ v12: optional post-processing (bloom) for phones, with an on/off button and an automatic fallback when the phone is too slow */
  const PP = { made: false };
  /** cook.post({bloom,radius,threshold,on,auto,minFps,button}) - OPTIONAL glow layer, drawn in DISPLAY space on top of the normal picture (so colours, the customer's picture and the exposure stay exactly as without it): only SMALL bright spots glow (lamps, flames, neon, hot metal, sparkles: the glow is the bright light minus its wide surroundings, so big bright walls, floors and skies never haze); bloom = strength (default 0.7), radius = blur size (default 1), threshold = how bright a pixel must be to count (0.8; raise it for less glow); adds a small "FX on / off" button (top right) and switches itself off when the phone is slower than minFps (24); the choice is remembered; the app's Post Processing setting can switch it off for the whole page (window.__MAGIC3D__.post === false); call once after the lights; returns {set(on),get()} */
  function post(o) {
    o = o || {}; const api = { set() {}, get() { return false; } }; if (PP.made) return PP.api || api; PP.made = true; PP.api = api;
    try { const c1 = window.__MAGIC3D__; if (c1 && (c1.post === false || (Array.isArray(c1.postFxOff) && c1.postFxOff.indexOf('bloom') >= 0))) return api; } catch (e) { /* no app config: standalone page, the scene decides */ }
    let want = o.on !== false; try { const sv = localStorage.getItem('m3d-post'); if (sv === '0') want = false; else if (sv === '1') want = true; } catch (e) { /* storage blocked */ }
    const st = { on: false, auto: o.auto !== false }, minFps = clamp(num(o.minFps, 24), 8, 60), strength = clamp(num(o.bloom, 0.7), 0, 2), rad = clamp(num(o.radius, 1), 0.3, 3), thr = clamp(num(o.threshold, 0.8), 0.3, 0.98); let btn = null, dead = false;
    const paint = (why) => { if (!btn) return; btn.textContent = st.on ? 'FX on' : why ? 'FX off · slow' : 'FX off'; btn.style.background = st.on ? '#fff' : 'rgba(10,12,18,0.5)'; btn.style.color = st.on ? '#111' : '#fff'; };
    const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', mk = (fs, u, extra) => new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false }, extra || {}));
    const mBright = mk('uniform sampler2D tMap; uniform float uT; varying vec2 vUv; void main(){ vec3 c = texture2D(tMap, vUv).rgb; float v = mix(dot(c, vec3(0.2126, 0.7152, 0.0722)), max(c.r, max(c.g, c.b)), 0.5); gl_FragColor = vec4(c * smoothstep(uT, 1.0, v), 1.0); }', { tMap: { value: null }, uT: { value: thr } });
    const mBlur = mk('uniform sampler2D tMap; uniform vec2 uD; varying vec2 vUv; void main(){ vec3 s = texture2D(tMap, vUv).rgb * 0.227027; s += (texture2D(tMap, vUv + uD).rgb + texture2D(tMap, vUv - uD).rgb) * 0.1945946; s += (texture2D(tMap, vUv + uD * 2.0).rgb + texture2D(tMap, vUv - uD * 2.0).rgb) * 0.1216216; s += (texture2D(tMap, vUv + uD * 3.0).rgb + texture2D(tMap, vUv - uD * 3.0).rgb) * 0.054054; s += (texture2D(tMap, vUv + uD * 4.0).rgb + texture2D(tMap, vUv - uD * 4.0).rgb) * 0.016216; gl_FragColor = vec4(s, 1.0); }', { tMap: { value: null }, uD: { value: new THREE.Vector2() } });
    const mAdd = mk('uniform sampler2D tA; uniform sampler2D tC; uniform sampler2D tE; uniform float uS; varying vec2 vUv; void main(){ vec3 g = (texture2D(tA, vUv).rgb + texture2D(tC, vUv).rgb) * 0.5 - texture2D(tE, vUv).rgb * 0.9; gl_FragColor = vec4(max(g, vec3(0.0)) * uS, 1.0); }', { tA: { value: null }, tC: { value: null }, tE: { value: null }, uS: { value: strength } }, { blending: THREE.AdditiveBlending, transparent: true });
    const qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mBright); quad.frustumCulled = false; qs.add(quad);
    const rt = (w, h) => new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    let W = 0, H = 0, fb = null, A = null, B = null, C = null, D = null, E = null, F = null, order = 0; const v2 = new THREE.Vector2(), zero = new THREE.Vector2(0, 0);
    const orig = renderer.render.bind(renderer); let busy = false;
    const draw = (m, target) => { quad.material = m; renderer.setRenderTarget(target); orig(qs, qc); };
    const blur = (src, tmp, dst, rw, rh) => { mBlur.uniforms.tMap.value = src.texture; mBlur.uniforms.uD.value.set(rad / (src.width), 0); draw(mBlur, tmp); mBlur.uniforms.tMap.value = tmp.texture; mBlur.uniforms.uD.value.set(0, rad / (tmp.height)); draw(mBlur, dst); };
    const size = () => { renderer.getDrawingBufferSize(v2); const w = Math.round(v2.x), h = Math.round(v2.y); if (w === W && h === H && fb) return; W = w; H = h; [fb, A, B, C, D, E, F].forEach((x) => x && x.dispose && x.dispose()); fb = new THREE.FramebufferTexture(W, H); A = rt(W >> 2, H >> 2); B = rt(W >> 2, H >> 2); C = rt(W >> 3, H >> 3); D = rt(W >> 3, H >> 3); E = rt(W >> 4, H >> 4); F = rt(W >> 4, H >> 4); };
    const copy = () => { if (order === 0) { try { renderer.copyFramebufferToTexture(zero, fb); return; } catch (e) { order = 1; } } renderer.copyFramebufferToTexture(fb, zero); };
    const glow = () => { size(); copy(); const ac = renderer.autoClear; renderer.autoClear = false; mBright.uniforms.tMap.value = fb; draw(mBright, A); blur(A, B, A); blur(A, C, D); blur(D, E, F); mAdd.uniforms.tA.value = A.texture; mAdd.uniforms.tC.value = D.texture; mAdd.uniforms.tE.value = F.texture; draw(mAdd, null); renderer.autoClear = ac; renderer.setRenderTarget(null); };
    renderer.render = (s, c) => { orig(s, c); if (!st.on || busy || dead || s !== scene) return; busy = true; try { glow(); } catch (e) { warn('post failed, glow switched off: ' + e.message); dead = true; st.on = false; paint(); } finally { busy = false; } };
    api.set = (v) => { st.on = !!v && !dead; paint(); }; api.get = () => st.on;
    if (o.button !== false) { btn = document.createElement('button'); btn.setAttribute('data-m3d-ui', '1'); btn.style.cssText = 'position:fixed;z-index:6;top:12px;right:14px;pointer-events:auto;font:700 12px system-ui,sans-serif;border:1px solid rgba(255,255,255,0.55);border-radius:999px;padding:7px 12px;touch-action:manipulation;cursor:pointer'; document.body.appendChild(btn);
      btn.addEventListener('click', () => { if (dead) return; st.on = !st.on; st.auto = false; paint(); try { localStorage.setItem('m3d-post', st.on ? '1' : '0'); } catch (e) { /* storage blocked */ } }); }
    st.on = want; paint();
    let last = 0, sum = 0, n = 0; frameHooks.push(() => { const now = performance.now(), d = last ? now - last : 0; last = now; if (!st.on || !st.auto || d <= 0 || d > 400) { sum = 0; n = 0; return; } n++; if (n > 40) { sum += d; if (n >= 130) { if (sum / 90 > 1000 / minFps) { st.on = false; paint(true); warn('post: frame rate too low, glow switched off'); } sum = 0; n = 0; } } });
    return api;
  }

  /* a wrong argument in one decorative call must not throw the whole scene into the fallback: log it and return an empty group */
  const safe = (fn, name) => (...a) => { try { const r = fn(...a); if (r && r.isObject3D && r.group === undefined) r.group = r; return r; } catch (e) { warn(name + ' failed: ' + e.message); return new THREE.Group(); } };
  Object.keys(nature).forEach((k) => { nature[k] = safe(nature[k], 'nature.' + k); }); Object.keys(urban).forEach((k) => { urban[k] = safe(urban[k], 'urban.' + k); });
  ['sofaSoft', 'armchair', 'coffeeTable', 'sideTable', 'vase', 'books', 'plantLeafy', 'pendant', 'artwork', 'rugRect'].forEach((k) => { prop[k] = safe(prop[k], 'prop.' + k); });
  const scatterS = safe(scatter, 'scatter'), windowViewS = safe(windowView, 'windowView'); const pro = { contactShadow: safe(contactShadow, 'contactShadow'), env: safe(env, 'env'), bokeh: safe(bokeh, 'bokeh'), lightPattern: safe(lightPattern, 'lightPattern'), intro: safe(intro, 'intro') };
  const aqx = { underwater: safe(underwater, 'underwater'), hardscape: safe(hardscape, 'hardscape'), aquaticPlants: safe(aquaticPlants, 'aquaticPlants'), fish: safe(fish, 'fish'), aquarium: safe(aquarium, 'aquarium') };
  const gx = { sunAt: safe(sunAt, 'sunAt'), skyPhysical: safe(skyPhysical, 'skyPhysical'), lilyPads: safe(lilyPads, 'lilyPads'), pond: safe(pond, 'pond') }; Object.keys(asia).forEach((k) => { asia[k] = safe(asia[k], 'asia.' + k); });
  const pbrS = (k, o) => { try { return pbr(k, o); } catch (e) { warn('pbr failed: ' + e.message); return stdMat('#aaaaaa', 0.5, 0.8); } };
  const heatGlowS = (m, o) => { try { return heatGlow(m, o); } catch (e) { warn('heatGlow failed: ' + e.message); return m; } };
  const mx = { chart: safe(chart, 'chart'), shake: safe(shake, 'shake'), inspect: safe(inspect, 'inspect'), gauge: safe(gauge, 'gauge'), beats: safe(beats, 'beats'), callout: safe(callout, 'callout'), explode: safe(explode, 'explode'), studio: safe(studio, 'studio'), cutaway: safe(cutaway, 'cutaway'), plume: safe(plume, 'plume'), sparks: safe(sparks, 'sparks'), flow: safe(flow, 'flow') }; Object.keys(machine).forEach((k) => { machine[k] = safe(machine[k], 'machine.' + k); });
  const NOOP = () => ({ value: 0, set() {}, get() { return 0; }, go() {}, reset() {}, done() { return true; }, progress() { return 1; }, el: null });
  const safeO = (fn, name) => (...a) => { try { return fn(...a); } catch (e) { warn(name + ' failed: ' + e.message); return NOOP(); } };
  const hx = { slider: safeO(slider, 'slider'), hero: safeO(hero, 'hero'), scaleBar: safeO(scaleBar, 'scaleBar'), modes: safeO(modes, 'modes'), xray: safeO(xray, 'xray'), assemble: safeO(assemble, 'assemble'), shed: safeO(shed, 'shed'), post: safeO(post, 'post'), mass: (r, o) => { try { return mass(r, o); } catch (e) { warn('mass failed: ' + e.message); return { volume: 0, kg: 0, density: 0 }; } } };
  frameHooks.push(() => { try { const c0 = window.__MAGIC3D__; if (c0 && c0.post === true && !PP.made) post({}); } catch (e) { /* ignore */ } return 'done'; });
  const build = { roundBox, mat };
  return { screen, mat, scatter: scatterS, contactShadow: pro.contactShadow, env: pro.env, bokeh: pro.bokeh, lightPattern: pro.lightPattern, intro: pro.intro, nature, urban, merge, build, windowView: windowViewS, frame, tv, portal, FX: Object.keys(FX), lights, sky, fog, look, room, ground, water, prop, particles, animate, tween, on, cam, fallbackScene, underwater: aqx.underwater, hardscape: aqx.hardscape, aquaticPlants: aqx.aquaticPlants, fish: aqx.fish, aquarium: aqx.aquarium, sunAt: gx.sunAt, skyPhysical: gx.skyPhysical, lilyPads: gx.lilyPads, pond: gx.pond, asia, pbr: pbrS, studio: mx.studio, machine, cutaway: mx.cutaway, heatGlow: heatGlowS, plume: mx.plume, sparks: mx.sparks, flow: mx.flow, callout: mx.callout, explode: mx.explode, approach, shake: mx.shake, inspect: mx.inspect, gauge: mx.gauge, beats: mx.beats, chart: mx.chart, ramp, table, rk4, fmt, blackbody, mass: hx.mass, slider: hx.slider, hero: hx.hero, scaleBar: hx.scaleBar, modes: hx.modes, xray: hx.xray, assemble: hx.assemble, shed: hx.shed, post: hx.post };
}
