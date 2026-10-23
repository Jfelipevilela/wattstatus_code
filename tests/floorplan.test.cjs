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
  const living = furnitureFor('living', 6, 5).map((p) => p.key);
  assert.ok(living.includes('sofa-seat') && living.includes('tv'));
  assert.equal(furnitureFor('bedroom', 1, 1).some((p) => p.key === 'bed'), false, 'a bed is dropped when it does not fit');
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
