const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function engine() {
  const nodes = new Map();
  const timers = new Map();
  let timerId = 0;
  const node = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, textContent: '', innerHTML: '' });
  const context = vm.createContext({
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, querySelectorAll() { return []; } },
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    navigator: {}, location: { hostname: 'example.test', href: 'https://example.test/' },
    KkachiSound: new Proxy({}, { get: () => () => {} }),
    Math, console,
  });
  context.window = context;
  context.addEventListener = () => {};
  vm.runInContext(fs.readFileSync(path.join(root, 'js/math-data.js'), 'utf8'), context);
  // Inspect the actual engine closure without adding production debug APIs.
  const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').replace(
    '  global.OtterRun = {', '  global.engine = { state, update3DPhysics, project3D };\n  global.OtterRun = {'
  );
  vm.runInContext(source, context);
  context.OtterRun.startGame();
  return { ...context.engine, api: context.OtterRun, timers };
}

test('perspective narrows distant lanes towards the vanishing point', () => {
  const { project3D: p } = engine();
  const near = p(325, 0, 55, 960, 440, 0, 480, 560, -50);
  const far = p(325, 0, 900, 960, 440, 0, 480, 560, -50);
  assert.ok(far.x - 480 < near.x - 480);
  assert.ok(far.y < near.y);
  assert.ok(far.scale < near.scale);
});

for (const fps of [30, 60, 120]) {
  for (const lane of [0, 1, 2]) {
    test(`lane ${lane}, ${fps} fps: continuous travel, collision at destination, one result`, () => {
      const { state, api, update3DPhysics: tick } = engine();
      state.gateOptions.forEach((option, idx) => { option.isCorrect = idx === lane; });
      const initialX = state.otterX3D;
      const initialZ = state.otterZ3D;
      const gateZ = state.monsterZ;
      api.selectAndFireLane(lane);
      assert.equal(state.otterX3D, initialX, 'click must not teleport the otter');
      assert.equal(state.history.length, 0, 'click must not resolve immediately');
      for (let frame = 0; frame < fps / 2; frame++) tick(0, 1 / fps);
      assert.ok(state.otterZ3D > initialZ && state.otterZ3D < gateZ);
      assert.equal(state.monsterZ, gateZ, 'destination stays fixed in world space');
      assert.equal(state.history.length, 0);
      for (let frame = 0; frame < fps && state.history.length === 0; frame++) tick(0, 1 / fps);
      assert.equal(state.history.length, 1);
      assert.ok(state.otterZ3D >= gateZ);
      assert.ok(Math.abs(state.otterX3D - [-325, 0, 325][lane]) < 12);
      assert.equal(state.score, 200);
      tick(0, 1 / fps);
      assert.equal(state.history.length, 1);
    });
  }
}

test('normal running reaches the chosen gate at the time limit', () => {
  const { state, api, update3DPhysics: tick } = engine();
  const lane = state.gateOptions.findIndex(option => option.isCorrect);
  api.steerOtter(lane - 1);
  for (let frame = 0; frame < 899; frame++) tick(0, 1 / 60);
  assert.equal(state.history.length, 0);
  for (let frame = 0; frame < 3; frame++) tick(0, 1 / 60);
  assert.equal(state.history.length, 1);
  assert.equal(state.score, 200);
});

test('wrong arrival costs one heart; restart cancels the pending next-wave callback', () => {
  const { state, api, timers, update3DPhysics: tick } = engine();
  const wrong = state.gateOptions.findIndex(option => !option.isCorrect);
  api.selectAndFireLane(wrong);
  for (let frame = 0; frame < 100 && !state.pausedForCrash; frame++) tick(0, 1 / 60);
  assert.equal(state.hearts, 4);
  assert.equal(state.history.length, 1);
  assert.equal(timers.size, 1);
  api.startGame();
  assert.equal(timers.size, 0);
  assert.equal(state.hearts, 5);
  assert.equal(state.gateCount, 1);
  assert.equal(state.otterZ3D, 55);
  assert.equal(state.cameraZ, 0);
});

test('ten successful journeys finish a run with one result per gate', () => {
  const { state, api, update3DPhysics: tick } = engine();
  for (let wave = 0; wave < 10; wave++) {
    api.selectAndFireLane(state.gateOptions.findIndex(option => option.isCorrect));
    for (let frame = 0; frame < 120 && state.history.length === wave; frame++) tick(0, 1 / 60);
    assert.equal(state.history.length, wave + 1);
    for (let frame = 0; frame < 60 && state.gateClearRunTimer > 0; frame++) tick(0, 1 / 60);
  }
  assert.equal(state.running, false);
  assert.equal(state.hearts, 5);
  assert.equal(state.history.length, 10);
  assert.equal(state.score, 3800);
});
