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
  loaded.require = (request) => (request.startsWith('./') ? load(`${path.join(path.dirname(relative), request)}.ts`) : parentRequire(request));
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
