/* Renderer and browser controls. No network requests or dependencies. */
(() => {
  'use strict';
  const E = window.OrbitEngine;
  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  if (!ctx) { $('announcer').textContent = 'This browser does not support Canvas. Please try a modern browser.'; return; }
  const game = E.createGame();
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener?.('change', event => { reducedMotion = event.matches; });
  const keys = new Set();
  let pointer = null, lastTime = 0, ambientTime = 0, shake = 0, particles = [], popups = [];
  let audioContext = null, soundEnabled = false, best = 0, currentRunBest = false;
  try { const savedBest = Number(localStorage.getItem('orbital-courier-best')); best = Number.isFinite(savedBest) ? Math.max(0, savedBest) : 0; soundEnabled = localStorage.getItem('orbital-courier-sound') === 'true'; } catch (_) { /* Private mode may disable storage. */ }
  const stars = Array.from({length:140}, (_,i) => ({x: hash(i + 1), y: hash(i + 300), size: .4 + hash(i + 700)*1.5, alpha: .12 + hash(i + 1000)*.5}));
  function hash(n) { const v = Math.sin(n*127.1+311.7)*43758.5453; return v - Math.floor(v); }
  const scoreText = value => Math.floor(value).toString().padStart(5, '0');
  $('intro-best').textContent = scoreText(best);
  function announce(message) { $('announcer').textContent = message; }
  function resize() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (rect.width <= 0 || rect.height <= 0) return;
    canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr);
    const previousWidth = game.width;
    game.width = E.HEIGHT * rect.width / rect.height; game.height = E.HEIGHT;
    game.player.x = E.clamp(game.player.x / previousWidth * game.width, 28, game.width - 28);
    for (const object of [...game.asteroids, ...game.parcels]) object.x = object.x / previousWidth * game.width;
    if (pointer) pointer = null;
  }
  new ResizeObserver(resize).observe(canvas); resize();
  function sound(type) {
    if (!soundEnabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const t = audioContext.currentTime;
      const notes = {collect:[640,1100,.13,'sine'], hit:[150,45,.22,'triangle'], phase:[240,940,.3,'sine'], start:[330,660,.22,'sine'], finish:[520,260,.5,'triangle']};
      const [a,b,duration,wave] = notes[type] || notes.collect;
      oscillator.type = wave; oscillator.frequency.setValueAtTime(a,t); oscillator.frequency.exponentialRampToValueAtTime(b,t+duration);
      gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(.09,t+.012); gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(t); oscillator.stop(t+duration);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch (_) { /* Audio is optional. */ }
  }
  function updateSoundUI() {
    $('sound-label').textContent = soundEnabled ? 'SOUND ON' : 'SOUND OFF';
    $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
    $('sound-button').setAttribute('aria-label', soundEnabled ? 'Disable sound' : 'Enable sound');
    $('sound-icon').innerHTML = '<path d="m11 4-6 5H2v6h3l6 5V4Z"/>' + (soundEnabled ? '<path d="M16 8c3 2 3 6 0 8M19 4c6 4 6 12 0 16"/>' : '<path d="m16 9 6 6m0-6-6 6"/>');
  }
  updateSoundUI();
  function changeScreen() {
    $('intro').hidden = game.state !== 'ready';
    $('hud').hidden = !['playing','paused'].includes(game.state);
    $('game-bottom').hidden = game.state !== 'playing';
    $('pause-screen').hidden = game.state !== 'paused';
    $('end-screen').hidden = game.state !== 'over';
    const modalOpen = game.state === 'paused' || game.state === 'over';
    canvas.tabIndex = modalOpen ? -1 : 0;
    $('hud').inert = modalOpen;
    document.querySelectorAll('.masthead, .flight-manual, footer, .sound-control').forEach(element => { element.inert = modalOpen; });
  }
  function start() {
    E.start(game); particles = []; popups = []; shake = 0; keys.clear(); pointer = null; currentRunBest = false;
    sound('start'); changeScreen(); updateHUD(); canvas.focus({preventScroll:true});
    announce('Flight started. Collect cargo and survive 90 seconds. Three shields available.');
  }
  function togglePause() {
    if (!['playing','paused'].includes(game.state)) return;
    E.pause(game); keys.clear(); pointer = null; changeScreen();
    if (game.state === 'paused') { $('resume-button').focus({preventScroll:true}); announce('Game paused.'); }
    else { canvas.focus({preventScroll:true}); announce('Flight resumed.'); }
  }
  function activatePhase() { if (E.phase(game)) { sound('phase'); announce('Phase active. Recharging for six seconds.'); } }
  function end() {
    currentRunBest = game.score > best;
    if (currentRunBest) { best = game.score; try { localStorage.setItem('orbital-courier-best',String(best)); } catch (_) {} }
    $('intro-best').textContent = scoreText(best);
    const delivered = game.result === 'delivered';
    $('result-eyebrow').textContent = delivered ? 'RIGHT ON TIME. MORE OR LESS.' : 'END OF THE LINE';
    $('result-title').textContent = delivered ? 'Package delivered.' : 'A rough landing.';
    $('result-description').textContent = delivered ? `Route complete. ${1000 + game.health * 250} bonus points for bringing it home.` : 'The cargo was insured. Your pride? Less so.';
    $('final-score').textContent = scoreText(game.score); $('final-cargo').textContent = game.cargo;
    $('new-record').hidden = !currentRunBest;
    keys.clear(); pointer = null; changeScreen(); $('retry-button').focus({preventScroll:true});
    announce(`${delivered ? 'Delivery complete' : 'Run ended'}. Score ${game.score}. ${game.cargo} parcels collected.${currentRunBest ? ' New personal best.' : ''}`);
  }
  function updateHUD() {
    $('score').textContent = scoreText(game.score); $('cargo').textContent = game.cargo;
    $('sector').textContent = `SECTOR ${String(game.sector).padStart(2,'0')} / 06`;
    $('route-progress').style.width = `${game.elapsed/E.ROUTE_SECONDS*100}%`;
    const remaining = Math.ceil(E.ROUTE_SECONDS-game.elapsed);
    $('time').textContent = `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
    const hull = $('hull'); hull.setAttribute('aria-label',`${game.health} shields remaining`);
    [...hull.children].forEach((item,index) => item.classList.toggle('empty',index>=game.health));
    $('phase-button').disabled = game.phaseCooldown > 0;
    const phaseText = game.phaseCooldown > 0 ? `READY IN ${game.phaseCooldown.toFixed(1)}s` : 'PHASE READY';
    $('phase-text').textContent = phaseText; $('phase-button').setAttribute('aria-label',game.phaseCooldown > 0 ? `Phase recharging, ${Math.ceil(game.phaseCooldown)} seconds` : 'Activate phase, ready');
    $('phase-fill').style.width = `${(1-game.phaseCooldown/6)*100}%`;
    const multiplier = Math.min(4,1+Math.floor(Math.max(0,game.streak-1)/3));
    $('streak-label').textContent = game.streak > 0 ? `${game.streak} CARGO STREAK / ${multiplier}× VALUE` : 'FIND THE GLOW. FOLLOW THE CARGO.';
  }
  $('start-button').addEventListener('click',start); $('retry-button').addEventListener('click',start); $('restart-paused').addEventListener('click',start);
  $('pause-button').addEventListener('click',togglePause); $('resume-button').addEventListener('click',togglePause); $('phase-button').addEventListener('click',activatePhase);
  $('home-button').addEventListener('click',() => { game.state = 'ready'; changeScreen(); $('start-button').focus({preventScroll:true}); });
  $('sound-button').addEventListener('click',() => { soundEnabled = !soundEnabled; updateSoundUI(); try { localStorage.setItem('orbital-courier-sound',String(soundEnabled)); } catch (_) {} if (soundEnabled) sound('collect'); });
  window.addEventListener('keydown',event => {
    const key = event.key.toLowerCase();
    if (key === 'tab' && (game.state === 'paused' || game.state === 'over')) {
      const dialog = game.state === 'paused' ? $('pause-screen') : $('end-screen');
      const buttons = [...dialog.querySelectorAll('button:not([disabled])')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    if (key === 'enter' && game.state === 'ready' && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'A') { event.preventDefault(); start(); return; }
    if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' '].includes(key) && game.state === 'playing') {
      if (event.target.tagName === 'BUTTON' && key === ' ') return;
      event.preventDefault(); keys.add(key); if (key === ' ' && !event.repeat) activatePhase();
    }
    if ((key === 'p' || key === 'escape') && !event.repeat) { event.preventDefault(); togglePause(); }
  });
  window.addEventListener('keyup',event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur',() => { if (game.state === 'playing') togglePause(); keys.clear(); pointer = null; });
  document.addEventListener('visibilitychange',() => { if (document.hidden && game.state === 'playing') togglePause(); });
  function pointFromEvent(event) { const rect = canvas.getBoundingClientRect(); return {id:event.pointerId,targetX:(event.clientX-rect.left)/rect.width*game.width,targetY:(event.clientY-rect.top)/rect.height*game.height}; }
  canvas.addEventListener('pointerdown',event => { if (game.state !== 'playing') return; event.preventDefault(); pointer=pointFromEvent(event); canvas.setPointerCapture(event.pointerId); canvas.focus({preventScroll:true}); });
  canvas.addEventListener('pointermove',event => { if (pointer?.id === event.pointerId) pointer = pointFromEvent(event); });
  function clearPointer(event) { if (pointer?.id === event.pointerId) pointer=null; }
  canvas.addEventListener('pointerup',clearPointer); canvas.addEventListener('pointercancel',clearPointer); canvas.addEventListener('lostpointercapture',clearPointer);
  function glow(color,blur) { ctx.shadowColor=color; ctx.shadowBlur=reducedMotion ? blur*.5 : blur; }
  function line(x1,y1,x2,y2,color,width=1) { ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(); }
  function background(time) {
    const W=game.width,H=game.height;
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#111b22');bg.addColorStop(.6,'#0f2027');bg.addColorStop(1,'#0a171d');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    const nebula=ctx.createRadialGradient(W*.76,H*.37,10,W*.76,H*.37,W*.58);nebula.addColorStop(0,'#42717222');nebula.addColorStop(.65,'#1d485512');nebula.addColorStop(1,'#10202a00');ctx.fillStyle=nebula;ctx.fillRect(0,0,W,H);
    const offset = game.state==='playing' ? game.elapsed*20 : time*2;
    stars.forEach(s=>{const y=(s.y*H+(reducedMotion?0:offset*(s.size*.4)))%H;ctx.globalAlpha=s.alpha;ctx.fillStyle='#c7e0dc';ctx.fillRect(s.x*W,y,s.size,s.size);});ctx.globalAlpha=1;
    // Fine navigational grid.
    ctx.strokeStyle='#5173800b';ctx.lineWidth=.6;
    for(let x=0;x<W;x+=65)line(x,0,x,H,'#5173800b',.6);
    for(let y=0;y<H;y+=65)line(0,y,W,y,'#5173800b',.6);
    const px=W*.77,py=H*.43,pr=W>700?190:160;
    ctx.save();ctx.globalAlpha=game.state==='ready' ? 1 : .3;
    const planet=ctx.createRadialGradient(px-pr*.3,py-pr*.5,20,px,py,pr);planet.addColorStop(0,'#233c44');planet.addColorStop(.72,'#142a34');planet.addColorStop(1,'#0c1b23');
    ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fillStyle=planet;ctx.fill();ctx.strokeStyle='#49646a44';ctx.lineWidth=1;ctx.stroke();
    ctx.save();ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.clip();
    for(let i=0;i<40;i++){ctx.beginPath();ctx.ellipse(px+25,py-pr+i*12,pr*1.2,14+(i%5)*4,-.4,0,Math.PI*2);ctx.strokeStyle=`rgba(106,149,153,${.014+(i%4)*.004})`;ctx.stroke();}ctx.restore();
    ctx.save();ctx.translate(px,py);ctx.rotate(-.57);
    for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(0,0,pr*(1.38+i*.17),pr*(.45+i*.054),0,0,Math.PI*2);ctx.strokeStyle=i===1?'#70989824':'#70989810';ctx.lineWidth=i===1?2:.7;ctx.stroke();}ctx.restore();
    // Navigation reticle and orbital coordinate markings.
    const ticks=64;ctx.save();ctx.translate(px,py);
    for(let i=0;i<ticks;i++){const a=i/ticks*Math.PI*2;const r=pr*1.35;line(Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*(r+(i%8===0?9:3)),Math.sin(a)*(r+(i%8===0?9:3)),'#72918b25',1);}ctx.restore();ctx.restore();
    if(game.state==='ready'){
      ctx.fillStyle='#77908b';ctx.globalAlpha=.4;ctx.font='8px monospace';ctx.fillText('KEPLER BELT / 03.74 N',W*.62,H*.12);ctx.fillText('+  ROADS? OPTIONAL.',W*.64,H*.9);ctx.globalAlpha=1;
    }
    const vignette=ctx.createRadialGradient(W*.5,H*.5,H*.15,W*.5,H*.5,Math.max(W,H)*.72);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#030a1070');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
  }
  function ship(x,y,scale,angle,time,phase=false) {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
    if(phase){ctx.beginPath();ctx.ellipse(0,0,35,45,0,0,Math.PI*2);ctx.fillStyle='#b9fac21b';ctx.strokeStyle='#c9ff9c';ctx.lineWidth=1.2;glow('#c9ff9c',15);ctx.fill();ctx.stroke();ctx.shadowBlur=0;}
    const flicker=reducedMotion?1:1+Math.sin(time*32)*.14;
    const flame=ctx.createLinearGradient(0,18,0,78*flicker);flame.addColorStop(0,'#eef9ad');flame.addColorStop(.25,'#a1efd4c9');flame.addColorStop(1,'#75e3f000');
    ctx.beginPath();ctx.moveTo(-7,19);ctx.quadraticCurveTo(-10,39,0,78*flicker);ctx.quadraticCurveTo(10,39,7,19);ctx.fillStyle=flame;ctx.fill();
    ctx.beginPath();ctx.moveTo(-4,22);ctx.lineTo(0,48*flicker);ctx.lineTo(4,22);ctx.fillStyle='#eaffe2';glow('#b5f3d9',8);ctx.fill();ctx.shadowBlur=0;
    // Wing silhouettes, beveled fuselage, cockpit, and courier markings.
    ctx.beginPath();ctx.moveTo(0,-36);ctx.lineTo(29,22);ctx.lineTo(10,16);ctx.lineTo(0,24);ctx.lineTo(-10,16);ctx.lineTo(-29,22);ctx.closePath();ctx.fillStyle='#1c393d';ctx.strokeStyle='#8db5a8';ctx.lineWidth=.8;ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-36);ctx.lineTo(14,12);ctx.lineTo(7,22);ctx.lineTo(-7,22);ctx.lineTo(-14,12);ctx.closePath();ctx.fillStyle='#d5e2be';ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-36);ctx.lineTo(0,22);ctx.lineTo(-7,22);ctx.lineTo(-14,12);ctx.closePath();ctx.fillStyle='#9fb39d';ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(6,3);ctx.lineTo(0,8);ctx.lineTo(-6,3);ctx.closePath();ctx.fillStyle='#152e38';ctx.strokeStyle='#7cc9ca';ctx.lineWidth=.7;ctx.fill();ctx.stroke();
    line(-18,9,-11,-5,'#d4fa78',2.1);line(18,9,11,-5,'#d4fa78',2.1);line(-9,17,9,17,'#466e61',1);
    ctx.fillStyle='#80ffff';glow('#80ffff',5);ctx.fillRect(-25,17,3,1.5);ctx.fillRect(22,17,3,1.5);ctx.shadowBlur=0;
    ctx.restore();
  }
  function asteroid(rock){ctx.save();ctx.translate(rock.x,rock.y);ctx.rotate(rock.angle);ctx.beginPath();for(let i=0;i<10;i++){const angle=i/10*Math.PI*2;const radius=rock.radius*(.78+hash(i+rock.seed*100)*.22);const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();const fill=ctx.createLinearGradient(-rock.radius,-rock.radius,rock.radius,rock.radius);fill.addColorStop(0,'#52676c');fill.addColorStop(.35,'#30444c');fill.addColorStop(1,'#19272f');ctx.fillStyle=fill;ctx.strokeStyle='#6d81804f';ctx.lineWidth=1;ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(-rock.radius*.2,-rock.radius*.15,rock.radius*.26,0,Math.PI*2);ctx.fillStyle='#11212c65';ctx.fill();ctx.beginPath();ctx.arc(rock.radius*.36,rock.radius*.21,rock.radius*.15,0,Math.PI*2);ctx.fill();line(-rock.radius*.2,rock.radius*.65,rock.radius*.5,rock.radius*.43,'#9fa19030');ctx.restore();}
  function parcel(item,time){ctx.save();ctx.translate(item.x,item.y);ctx.rotate(Math.PI/4+Math.sin((reducedMotion?0:time)*2+item.id)*.1);glow('#d4fa78',16);ctx.fillStyle='#cdeb7220';ctx.strokeStyle='#d4fa78';ctx.lineWidth=1.3;ctx.fillRect(-11,-11,22,22);ctx.strokeRect(-11,-11,22,22);ctx.fillStyle='#dbff8d';ctx.fillRect(-4,-4,8,8);ctx.shadowBlur=0;ctx.restore();}
  function burst(x,y,color,count){if(reducedMotion)return;for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=40+Math.random()*180;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.3+Math.random()*.4,max:.7,color});}}
  function processEvents(){for(const event of game.events){if(event.type==='collect'){sound('collect');burst(event.x,event.y,'#d4fa78',12);popups.push({x:event.x,y:event.y,text:`+${event.points}`,life:.8});}if(event.type==='hit'){sound('hit');shake=reducedMotion?0:11;burst(event.x,event.y,'#e89672',25);announce(`Impact. ${game.health} shield${game.health===1?'':'s'} remaining.`);}if(event.type==='phase')burst(event.x,event.y,'#a7f3e7',18);if(event.type==='finish'){sound('finish');end();}}game.events.length=0;}
  function render(time,dt){ctx.setTransform(canvas.width/game.width,0,0,canvas.height/game.height,0,0);ctx.save();if(shake>.2){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=Math.pow(.003,dt);}background(time);
    if(game.state==='ready'){
      const desktop=game.width>700;const x=game.width*(desktop?.735:.71),y=game.height*(desktop?.435:.66);const bob=reducedMotion?0:Math.sin(time*.8)*8;
      parcel({x:x+(desktop?170:65),y:y-110,id:1},time);parcel({x:x-130,y:y+135,id:2},time);
      asteroid({x:game.width*.91,y:game.height*.82,radius:24,angle:reducedMotion?0:time*.06,seed:.4});
      ship(x,y+bob,desktop?2.25:1.4,.4,time);
    }else{
      game.asteroids.forEach(asteroid);game.parcels.forEach(p=>parcel(p,time));
      const p=game.player;ctx.globalAlpha=p.invulnerable>0&&!reducedMotion?(Math.sin(time*25)>0?.45:1):1;
      ship(p.x,p.y,1,p.tilt,time,p.phase>0||p.invulnerable>0);ctx.globalAlpha=1;
    }
    if(game.state!=='paused'){
      for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2.5,2.5);}particles=particles.filter(p=>p.life>0);ctx.globalAlpha=1;
      for(const p of popups){p.life-=dt;if(!reducedMotion)p.y-=35*dt;ctx.globalAlpha=Math.max(0,p.life/.8);ctx.fillStyle='#d4fa78';ctx.font='bold 14px monospace';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y);}popups=popups.filter(p=>p.life>0);ctx.globalAlpha=1;ctx.textAlign='start';
    }ctx.restore();
  }
  let hudClock=0;
  function frame(timestamp){const dt=Math.min((timestamp-lastTime)/1000||0,.05);lastTime=timestamp;if(game.state!=='paused')ambientTime+=dt;
    if(game.state==='playing'){
      const input=pointer||{x:(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),y:(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)};
      E.update(game,dt,input);processEvents();hudClock+=dt;if(hudClock>=.05){updateHUD();hudClock=0;}
    }render(ambientTime,dt);requestAnimationFrame(frame);
  }
  changeScreen();requestAnimationFrame(frame);
})();
