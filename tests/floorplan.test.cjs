const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const load = (relative) => {
  const filename = path.resolve(__dirname, '../src', relative);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const parentRequire = loaded.require.bind(loaded);
  loaded.require = (request) => {
    if (request.startsWith('@/')) return load(`${request.slice(2)}.ts`);
    if (request.startsWith('./')) return load(`${path.join(path.dirname(relative), request)}.ts`);
    return parentRequire(request);
  };
  loaded._compile(compiled, filename);
  return loaded.exports;
};

const { buildWalls, WALL_THICKNESS } = load('components/floorplan/three/walls.ts');
const { furnitureFor } = load('components/floorplan/three/furniture.ts');

const key = (w) => `${w.x1},${w.z1},${w.x2},${w.z2}`;

test('a single room gets two tall back walls and two low front walls', () => {
  const walls = buildWalls([{ x: 0, y: 0, width: 4, depth: 3 }]);
  assert.deepEqual(walls.map((w) => w.kind).sort(), ['exterior', 'exterior', 'front', 'front']);
});

test('a shared boundary becomes one interior wall, never two overlapping walls', () => {
  const rooms = [{ x: 0, y: 0, width: 6, depth: 5 }, { x: 6, y: 0, width: 4, depth: 4 }, { x: 6, y: 4, width: 4, depth: 4 }];
  const walls = buildWalls(rooms);
  const keys = walls.map(key);
  assert.equal(new Set(keys).size, keys.length, 'no duplicated segment');
  // x = 6 boundary: z 0..4 and 4..5 shared with the living room, 5..8 exterior.
  const atSix = walls.filter((w) => w.x1 === 6 && w.x2 === 6).sort((a, b) => a.z1 - b.z1);
  assert.deepEqual(atSix.map((w) => [w.z1, w.z2, w.kind]), [[0, 4, 'interior'], [4, 5, 'interior'], [5, 8, 'exterior']]);
  // Collinear walls on the same line never overlap.
  const lines = new Map();
  for (const w of walls) {
    const vertical = w.x1 === w.x2;
    const id = `${vertical ? 'x' : 'z'}${vertical ? w.x1 : w.z1}`;
    const span = vertical ? [w.z1, w.z2] : [w.x1, w.x2];
    for (const other of lines.get(id) ?? []) assert.ok(span[1] <= other[0] + 1e-9 || span[0] >= other[1] - 1e-9, `overlap on ${id}`);
    lines.set(id, [...(lines.get(id) ?? []), span]);
  }
});

test('furniture stays inside the walls and pieces on the floor never overlap', () => {
  const margin = WALL_THICKNESS / 2;
  for (const type of ['living', 'bedroom', 'suite', 'kitchen', 'bathroom', 'office', 'laundry', 'garage', 'outdoor', 'balcony', 'hallway', 'other']) {
    for (const [w, d] of [[1, 1], [2, 1.5], [3, 2], [4, 3], [4, 4], [6, 5], [10, 8]]) {
      const pieces = furnitureFor(type, w, d);
      for (const p of pieces) {
        assert.ok(p.x - p.size[0] / 2 >= margin - 1e-6 && p.x + p.size[0] / 2 <= w - margin + 1e-6, `${type} ${w}x${d} ${p.key} x`);
        assert.ok(p.z - p.size[2] / 2 >= margin - 1e-6 && p.z + p.size[2] / 2 <= d - margin + 1e-6, `${type} ${w}x${d} ${p.key} z`);
      }
    }
  }
  const living = furnitureFor('living', 6, 5);
  assert.ok(living.some((p) => p.key.startsWith('living-sofa/')) && living.some((p) => p.anchor === 'tv'));
  assert.equal(furnitureFor('bedroom', 1, 1).some((p) => p.key.startsWith('bedroom-bed/')), false, 'a bed is dropped when it does not fit');
  assert.ok(furnitureFor('bedroom', 4, 4).some((p) => p.anchor === 'ac'));
});

test('rooms dragged near each other snap flush and join into one wall', () => {
  const { snapMove, snapResize, overlappingRooms } = load('components/floorplan/snap.ts');
  const sala = { x: 0, y: 0, width: 6, depth: 5 };
  // Dropped 0.4 m to the right of the living room: snaps flush and aligns top.
  const cozinha = snapMove({ x: 6.4, y: 0.3, width: 4, depth: 4 }, [sala]);
  assert.deepEqual(cozinha, { x: 6, y: 0, width: 4, depth: 4 });
  const joined = buildWalls([sala, cozinha]);
  assert.equal(joined.filter((w) => w.x1 === 6 && w.x2 === 6 && w.kind === 'interior').length, 1);
  // Far away rooms are left alone.
  assert.deepEqual(snapMove({ x: 12, y: 9, width: 3, depth: 3 }, [sala]), { x: 12, y: 9, width: 3, depth: 3 });
  // Resizing stretches an edge onto the neighbour's edge.
  assert.deepEqual(snapResize({ x: 0, y: 5, width: 5.7, depth: 3 }, [sala]), { x: 0, y: 5, width: 6, depth: 3 });
  // Touching is fine; overlapping is flagged.
  assert.equal(overlappingRooms([{ id: 'a', layout: sala }, { id: 'b', layout: cozinha }]).size, 0);
  assert.deepEqual([...overlappingRooms([{ id: 'a', layout: sala }, { id: 'b', layout: { x: 5, y: 1, width: 3, depth: 3 } }])].sort(), ['a', 'b']);
});

test('furniture moves as whole units: one car, one sofa, one bed', () => {
  const { groupUnits } = load('components/floorplan/three/assembly.ts');
  const garage = groupUnits(furnitureFor('garage', 3.5, 6));
  const car = garage.find((unit) => unit.id === 'garage-car');
  assert.ok(car && car.pieces.length > 10, 'all car parts in one unit');
  assert.equal(garage.filter((unit) => unit.id === 'garage-car').length, 1);
  const living = groupUnits(furnitureFor('living', 6, 5)).map((unit) => unit.id);
  assert.equal(new Set(living).size, living.length);
  assert.ok(living.includes('living-sofa'));
  assert.ok(groupUnits(furnitureFor('bedroom', 4, 4)).some((unit) => unit.id === 'bedroom-bed' && unit.pieces.length >= 5));
});

test('enter drops from above and settles exactly at rest with a small overshoot', () => {
  const { unitAt, TIMING } = load('components/floorplan/three/assembly.ts');
  const phase = { kind: 'enter', start: 1000, liftStart: 780, from: [0, 0, 0] };
  // Before its turn a unit lifts continuously from where it rests: at the
  // click it is still on the floor and visible, never hidden.
  assert.deepEqual(unitAt(phase, 0, 780), { offset: 0, visible: true, done: false });
  const lifting = unitAt(phase, 0, 900);
  assert.ok(lifting.visible && lifting.offset > 0 && lifting.offset < TIMING.dropHeight);
  assert.ok(Math.abs(unitAt(phase, 0, 999.9).offset - TIMING.dropHeight) < 0.01, 'reaches the drop height without a jump');
  let lowest = Infinity;
  for (let t = 1000; t <= 1000 + TIMING.enter; t += 5) lowest = Math.min(lowest, unitAt(phase, 0, t).offset);
  assert.ok(lowest < 0 && lowest > -0.05, `overshoot ${lowest}`);
  const end = unitAt(phase, 0, 1000 + TIMING.enter + 1);
  assert.equal(end.offset, 0);
  assert.equal(end.visible, true);
  assert.equal(end.done, true);
  // Later units wait their turn; staggering is capped.
  assert.ok(unitAt(phase, 2, 1000 + TIMING.enterStagger).offset > TIMING.dropHeight - 0.01, 'later units are still up, waiting');
  assert.equal(unitAt(phase, 50, 1000 + TIMING.maxStaggered * TIMING.enterStagger + 1).visible, true);
});

test('exit sinks below the floor, hides, then re-assembles the room', () => {
  const { unitAt, TIMING } = load('components/floorplan/three/assembly.ts');
  const phase = { kind: 'exit', start: 0, from: [0], restoreAt: 2000 };
  const sunk = unitAt(phase, 0, TIMING.exit + 1);
  assert.equal(sunk.visible, false);
  assert.equal(sunk.done, false, 'waits for the restore');
  const back = unitAt(phase, 0, 2000 + TIMING.restore + 1);
  assert.deepEqual(back, { offset: 0, visible: true, done: true });
});

test('fast clicks never leave rooms hidden: everything ends at rest', () => {
  const { planTransition, unitAt } = load('components/floorplan/three/assembly.ts');
  const units = () => 3;
  let phases = planTransition(new Map(), new Map(), 'garage', 'living', 0, units);
  // Only the chosen room hops; the previous one keeps its furniture.
  assert.equal(phases.has('garage'), false);
  assert.equal(phases.get('living').kind, 'enter');
  // 150 ms later the user picks the kitchen, then the bedroom.
  const offsetsAt = (map, now) => new Map([...map].map(([id, phase]) => [id, [0, 1, 2].map((i) => unitAt(phase, i, now).offset)]));
  phases = planTransition(phases, offsetsAt(phases, 150), 'living', 'kitchen', 150, units);
  // Living was mid-hop: it settles from where it is.
  assert.equal(phases.get('living').kind, 'restore');
  assert.equal(phases.get('kitchen').kind, 'enter');
  phases = planTransition(phases, offsetsAt(phases, 260), 'kitchen', 'bedroom', 260, units);
  // Long after, every room is visible at its final position.
  for (const [, phase] of phases) {
    for (const index of [0, 1, 2]) {
      const state = unitAt(phase, index, 10000);
      assert.equal(state.offset, 0);
      assert.equal(state.visible, true);
      assert.equal(state.done, true);
    }
  }
  // Back to the overview settles the last room in place.
  const overview = planTransition(phases, offsetsAt(phases, 300), 'bedroom', null, 300, units);
  for (const [, phase] of overview) assert.equal(unitAt(phase, 0, 10000).offset, 0);
});

test('no unit ever jumps between consecutive frames during a transition', () => {
  const { planTransition, unitAt, TIMING } = load('components/floorplan/three/assembly.ts');
  const units = () => 6;
  const step = 16; // one frame at 60 fps
  // Garage -> living, then a fast switch to the kitchen mid-flight.
  let phases = planTransition(new Map(), new Map(), 'garage', 'living', 0, units);
  const offsetsAt = (map, now) => new Map([...map].map(([id, phase]) => [id, [0, 1, 2, 3, 4, 5].map((i) => unitAt(phase, i, now).offset)]));
  const track = (map, from, to, previous) => {
    let last = previous;
    for (let t = from; t <= to; t += step) {
      const now = offsetsAt(map, t);
      for (const [room, values] of now) {
        values.forEach((value, i) => {
          const before = last?.get(room)?.[i];
          const visible = unitAt(map.get(room), i, t).visible;
          // Below the floor a unit is hidden by the floor and the base.
          if (before !== undefined && visible && value >= 0 && before >= 0) {
            assert.ok(Math.abs(value - before) < 0.45, `${room}[${i}] jumped ${before} -> ${value} at ${t} ms`);
          }
        });
      }
      last = now;
    }
    return last;
  };
  // The new room starts exactly where it rests: visible, on the floor.
  assert.deepEqual(unitAt(phases.get('living'), 0, 0), { offset: 0, visible: true, done: false });
  let last = track(phases, 0, 300, new Map([['garage', [0, 0, 0, 0, 0, 0]], ['living', [0, 0, 0, 0, 0, 0]]]));
  phases = planTransition(phases, offsetsAt(phases, 300), 'living', 'kitchen', 300, units);
  last = track(phases, 300, 4000, last);
  for (const [room, values] of last) values.forEach((value) => assert.equal(value, 0, `${room} rests at 0`));
  void TIMING;
});

test('every registered appliance gets a model that fits the room without collisions', () => {
  const { placeAppliances, applianceKind } = load('components/floorplan/three/applianceModels.ts');
  const names = {
    'Ar-condicionado Split': 'ac', 'TV LED 55': 'tv', 'Geladeira Frost Free': 'fridge', 'Freezer horizontal': 'freezer',
    'Micro-ondas': 'microwave', 'Airfryer': 'microwave', 'Fogão 4 bocas': 'oven', 'Máquina de lavar': 'washer',
    'Computador': 'computer', 'Videogame': 'console', 'Chuveiro elétrico': 'shower', 'Aquecedor': 'heater',
    'Ventilador de coluna': 'fan', 'Luminária': 'lamp', 'Roteador Wi-Fi': 'router', 'Carregador carro': 'charger', 'Aspirador': 'generic',
  };
  for (const [name, kind] of Object.entries(names)) assert.equal(applianceKind(name), kind, name);

  const margin = WALL_THICKNESS / 2;
  const box = (p) => ({ x0: p.x - p.size[0] / 2, x1: p.x + p.size[0] / 2, y0: p.y - p.size[1] / 2, y1: p.y + p.size[1] / 2, z0: p.z - p.size[2] / 2, z1: p.z + p.size[2] / 2 });
  const unitBox = (pieces) => pieces.map(box).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) }));
  const intersects = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1 && a.y0 < b.y1 && b.y0 < a.y1;
  const appliances = Object.keys(names).map((name, index) => ({ id: `a${index}`, name }));
  for (const type of ['living', 'bedroom', 'kitchen', 'bathroom', 'office', 'laundry', 'garage', 'other']) {
    for (const [w, d] of [[2, 2], [4, 3], [6, 5], [10, 8]]) {
      const decor = furnitureFor(type, w, d);
      const placed = placeAppliances(appliances, decor, w, d);
      assert.equal(placed.length, appliances.length);
      const decorUnits = [...new Set(decor.map((p) => p.key.split('/')[0]))].map((id) => unitBox(decor.filter((p) => p.key.startsWith(`${id}/`))));
      // Each appliance part is checked on its own: a wall unit and its panel
      // are separate solids, so a low object may stand in front of the panel.
      const models = placed.filter((item) => item.pieces.length).map((item) => item.pieces.map(box));
      for (const parts of models) {
        for (const part of parts) {
          assert.ok(part.x0 >= margin - 1e-6 && part.x1 <= w - margin + 1e-6 && part.z0 >= margin - 1e-6 && part.z1 <= d - margin + 1e-6, `${type} ${w}x${d} inside walls`);
          for (const unit of decorUnits) {
            if (unit.y1 - unit.y0 < 0.05) continue; // rugs
            assert.ok(!intersects(part, unit), `${type} ${w}x${d} appliance crosses furniture`);
          }
        }
      }
      models.forEach((a, i) =>
        models.slice(i + 1).forEach((b) => a.forEach((pa) => b.forEach((pb) => assert.ok(!intersects(pa, pb), `${type} ${w}x${d} appliances overlap`)))),
      );
      // Same input, same layout.
      assert.deepEqual(placeAppliances(appliances, decor, w, d), placed);
    }
  }
});

test('decoration stands in for a matching appliance instead of a duplicate', () => {
  const { placeAppliances } = load('components/floorplan/three/applianceModels.ts');
  const living = furnitureFor('living', 6, 5);
  const [tv, secondTv] = placeAppliances([{ id: 't1', name: 'TV LED 55' }, { id: 't2', name: 'TV Quarto' }], living, 6, 5);
  assert.equal(tv.decorAnchor, 'tv');
  assert.equal(tv.pieces.length, 0);
  assert.equal(secondTv.decorAnchor, null, 'a second TV gets its own model');
  assert.ok(secondTv.pieces.length > 0);
  const bedroom = placeAppliances([{ id: 'ac', name: 'Ar-condicionado' }], furnitureFor('bedroom', 4, 4), 4, 4);
  assert.equal(bedroom[0].decorAnchor, 'ac');
  const tiny = placeAppliances([{ id: 'g', name: 'Geladeira' }], [], 0.6, 0.6);
  assert.equal(tiny[0].pieces.length, 0);
  assert.equal(tiny[0].badge, null, 'no room: badge only, nothing through the walls');
});

test('wall-mounted models sit on a wall panel, never floating', () => {
  const { placeAppliances } = load('components/floorplan/three/applianceModels.ts');
  const { WALL_HEIGHTS } = load('components/floorplan/three/walls.ts');
  const top = (pieces) => Math.max(...pieces.map((p) => p.y + p.size[1] / 2));
  for (const name of ['Ar-condicionado', 'Chuveiro elétrico', 'Carregador carro']) {
    const [item] = placeAppliances([{ id: 'x', name }], [], 4, 4);
    const panel = item.pieces.find((p) => p.key.endsWith('/wall-panel'));
    assert.ok(panel && panel.y - panel.size[1] / 2 === 0, `${name} has a panel down to the floor`);
    assert.ok(top([panel]) >= top(item.pieces) - 1e-6, `${name} backed by the panel up to its top`);
    assert.ok(top([panel]) >= WALL_HEIGHTS.exterior - 1e-6);
  }
  // The decorative bedroom A/C follows the same rule.
  const decor = furnitureFor('bedroom', 4, 4).filter((p) => p.key.startsWith('bedroom-wall-ac/'));
  assert.ok(decor.length >= 3);
  const decorPanel = decor.find((p) => p.key.endsWith('/wall-panel'));
  assert.ok(decorPanel && top([decorPanel]) >= top(decor) - 1e-6);
});

test('the 3D model always matches the badge icon, whatever the spelling', () => {
  const { applianceKind } = load('components/floorplan/three/applianceModels.ts');
  for (const name of ['Arcondicionado', 'AR CONDICIONADO', 'Ar condicionado sala', 'Split 12000 BTUs', 'Inverter LG', 'A/C quarto', 'Climatizador'])
    assert.equal(applianceKind(name), 'ac', name);
  assert.equal(applianceKind('Lâmpada LED'), 'lamp');
  assert.equal(applianceKind('Monitor gamer'), 'computer');
  assert.equal(applianceKind('Aspirador'), 'generic');
});
