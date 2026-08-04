// src/behavior/Blackboard.js
export class AgentBlackboard {
  constructor(id, x, z) {
    this.id = id;
    this.x = x; this.z = z; this.y = 0;
    this.vx = 0; this.vz = 0;
    this.speed = 1.2 + Math.random() * 0.8;

    this.bladder = Math.random() * 60;
    this.hunger = Math.random() * 50;
    this.energy = 80 + Math.random() * 20;
    this.patience = 50 + Math.random() * 50;
    this.curiosity = Math.random() * 100;

    this.wristbands = [];
    this.flyers = 0;
    this.merchWeight = 0;
    this.newsletterCount = 0;

    this.state = 'idle';
    this.target = null;
    this.path = [];
    this.pathIndex = 0;
    this.queueTarget = null;
    this.standMemory = new Set();

    this.hasJumpedRecently = false;
    this.hasWalkedBackwards = false;
    this.hasTouchedEverything = false;
    this.hasFallenOut = false;
    this.isTrappedInQueue = false;
    this.agbProgress = 0;
    this.pettingTarget = null;
    this.currentStand = null;

    this.bobPhase = Math.random() * Math.PI * 2;
    this.lean = 0;
    this.photoPose = 0;
  }

  needsToilet() { return this.bladder > 85; }
  isExhausted() { return this.energy < 15; }
  isOverburdened() { return this.merchWeight > 5; }

  addMerch(weight = 1) {
    this.merchWeight += weight;
    this.speed = Math.max(0.4, 1.2 - this.merchWeight * 0.15);
  }
}
