/* Orbital Courier: deterministic, DOM-free simulation. */
(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.OrbitEngine = engine;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WIDTH = 1200, HEIGHT = 650, ROUTE_SECONDS = 90;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const overlaps = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
  function createGame(random = Math.random, width = WIDTH, height = HEIGHT) {
    return {
      random, width, height, state: 'ready', elapsed: 0, score: 0, cargo: 0, streak: 0,
      streakClock: 0, sector: 1, health: 3, phaseCooldown: 0,
      player: { x: width / 2, y: height - 130, radius: 17, invulnerable: 0, phase: 0, tilt: 0 },
      asteroids: [], parcels: [], effects: [], events: [],
      rockClock: 0.65, parcelClock: 0.9, nextId: 0, result: null
    };
  }
  function start(game) {
    const fresh = createGame(game.random, game.width, game.height);
    Object.assign(game, fresh, { state: 'playing' });
    return game;
  }
  function pause(game) {
    if (game.state === 'playing') game.state = 'paused';
    else if (game.state === 'paused') game.state = 'playing';
    return game.state;
  }
  function phase(game) {
    if (game.state !== 'playing' || game.phaseCooldown > 0) return false;
    game.player.phase = 0.85;
    game.phaseCooldown = 6;
    game.events.push({ type: 'phase', x: game.player.x, y: game.player.y });
    return true;
  }
  function finish(game, result) {
    game.state = 'over'; game.result = result;
    if (result === 'delivered') game.score += 1000 + game.health * 250;
    game.events.push({ type: 'finish', result });
  }
  function update(game, delta, input = {}) {
    if (game.state !== 'playing' || !Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(delta, 0.05);
    game.elapsed = Math.min(ROUTE_SECONDS, game.elapsed + dt);
    game.sector = Math.min(6, Math.floor(game.elapsed / 15) + 1);
    game.phaseCooldown = Math.max(0, game.phaseCooldown - dt);
    game.streakClock = Math.max(0, game.streakClock - dt);
    if (!game.streakClock) game.streak = 0;
    const p = game.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.phase = Math.max(0, p.phase - dt);
    let dx = Number.isFinite(input.x) ? input.x : 0;
    let dy = Number.isFinite(input.y) ? input.y : 0;
    if (Number.isFinite(input.targetX) && Number.isFinite(input.targetY)) {
      dx = (input.targetX - p.x) / 90; dy = (input.targetY - p.y) / 90;
    }
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    p.x = clamp(p.x + dx * 450 * dt, 28, game.width - 28);
    p.y = clamp(p.y + dy * 450 * dt, 100, game.height - 40);
    p.tilt += (dx * 0.32 - p.tilt) * Math.min(1, dt * 9);
    game.rockClock -= dt;
    if (game.rockClock <= 0) {
      const r = 22 + game.random() * 25;
      game.asteroids.push({ id: ++game.nextId, x: 30 + game.random() * (game.width - 60), y: -55,
        radius: r, speed: 115 + game.sector * 22 + game.random() * 65,
        drift: (game.random() - 0.5) * 55, angle: game.random() * Math.PI * 2,
        spin: (game.random() - 0.5) * 1.5, seed: game.random() });
      game.rockClock = Math.max(0.23, 0.66 - game.sector * 0.052) + game.random() * 0.16;
      game.rockClock *= Math.max(1, WIDTH / game.width * 0.7);
    }
    game.parcelClock -= dt;
    if (game.parcelClock <= 0) {
      game.parcels.push({ id: ++game.nextId, x: 75 + game.random() * (game.width - 150), y: -28,
        radius: 15, speed: 145 + game.sector * 10, angle: 0 });
      game.parcelClock = 0.86 + game.random() * 0.6;
    }
    for (const rock of game.asteroids) {
      rock.y += rock.speed * dt; rock.x += rock.drift * dt; rock.angle += rock.spin * dt;
      if (overlaps(p, rock) && p.invulnerable <= 0 && p.phase <= 0 && !rock.hit) {
        rock.hit = true; game.health -= 1; game.streak = 0; game.streakClock = 0;
        p.invulnerable = 1.6;
        game.events.push({ type: 'hit', x: p.x, y: p.y });
        if (game.health <= 0) { finish(game, 'lost'); break; }
      }
    }
    if (game.state !== 'playing') return;
    for (const parcel of game.parcels) {
      parcel.y += parcel.speed * dt; parcel.angle += dt;
      if (overlaps({ ...p, radius: p.radius + 8 }, parcel) && !parcel.collected) {
        parcel.collected = true; game.cargo += 1; game.streak += 1; game.streakClock = 4;
        const multiplier = Math.min(4, 1 + Math.floor((game.streak - 1) / 3));
        const points = 100 * multiplier;
        game.score += points;
        game.events.push({ type: 'collect', x: parcel.x, y: parcel.y, points, multiplier });
      }
    }
    game.asteroids = game.asteroids.filter(r => !r.hit && r.y < game.height + 70 && r.x > -80 && r.x < game.width + 80);
    game.parcels = game.parcels.filter(c => !c.collected && c.y < game.height + 40);
    if (game.elapsed >= ROUTE_SECONDS) finish(game, 'delivered');
  }
  return { WIDTH, HEIGHT, ROUTE_SECONDS, createGame, start, pause, phase, update, clamp, overlaps };
}));
