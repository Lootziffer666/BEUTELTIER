// src/behavior/BehaviorTree.js
export const Status = { SUCCESS: 1, FAILURE: 2, RUNNING: 3 };

export class Node {
  tick(agent, dt, world) { return Status.FAILURE; }
  reset() {}
}

export class Sequence extends Node {
  constructor(children = []) { super(); this.children = children; this.index = 0; }
  tick(agent, dt, world) {
    while (this.index < this.children.length) {
      const status = this.children[this.index].tick(agent, dt, world);
      if (status === Status.RUNNING) return Status.RUNNING;
      if (status === Status.FAILURE) { this.index = 0; return Status.FAILURE; }
      this.index++;
    }
    this.index = 0;
    return Status.SUCCESS;
  }
  reset() { this.index = 0; this.children.forEach(c => c.reset()); }
}

export class Selector extends Node {
  constructor(children = []) { super(); this.children = children; this.index = 0; }
  tick(agent, dt, world) {
    while (this.index < this.children.length) {
      const status = this.children[this.index].tick(agent, dt, world);
      if (status === Status.RUNNING) return Status.RUNNING;
      if (status === Status.SUCCESS) { this.index = 0; return Status.SUCCESS; }
      this.index++;
    }
    this.index = 0;
    return Status.FAILURE;
  }
  reset() { this.index = 0; this.children.forEach(c => c.reset()); }
}

export class Parallel extends Node {
  constructor(children = [], successCount = 1) {
    super(); this.children = children; this.successCount = successCount;
  }
  tick(agent, dt, world) {
    let successes = 0, running = false;
    for (const child of this.children) {
      const s = child.tick(agent, dt, world);
      if (s === Status.SUCCESS) successes++;
      else if (s === Status.RUNNING) running = true;
    }
    if (successes >= this.successCount) return Status.SUCCESS;
    return running ? Status.RUNNING : Status.FAILURE;
  }
  reset() { this.children.forEach(c => c.reset()); }
}

export class Condition extends Node {
  constructor(fn) { super(); this.fn = fn; }
  tick(agent, dt, world) {
    return this.fn(agent, world) ? Status.SUCCESS : Status.FAILURE;
  }
}

export class Action extends Node {
  constructor(fn) { super(); this.fn = fn; this.started = false; }
  tick(agent, dt, world) {
    if (!this.started) { this.started = true; this.t = 0; }
    this.t += dt;
    const result = this.fn(agent, dt, this.t, world);
    if (result !== Status.RUNNING) this.started = false;
    return result;
  }
  reset() { this.started = false; this.t = 0; }
}

export class Inverter extends Node {
  constructor(child) { super(); this.child = child; }
  tick(agent, dt, world) {
    const s = this.child.tick(agent, dt, world);
    if (s === Status.SUCCESS) return Status.FAILURE;
    if (s === Status.FAILURE) return Status.SUCCESS;
    return s;
  }
  reset() { this.child.reset(); }
}

export class BehaviorTree {
  constructor(root) { this.root = root; }
  tick(agent, dt, world) { return this.root.tick(agent, dt, world); }
  reset() { this.root.reset(); }
}
