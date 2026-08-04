// src/behavior/MesseNodes.js
import { Status, Action, Condition } from './BehaviorTree.js';

function moveAlongPath(agent, dt, world) {
  if (!agent.blackboard.path || agent.blackboard.pathIndex >= agent.blackboard.path.length) {
    agent.blackboard.vx = 0; agent.blackboard.vz = 0;
    return Status.SUCCESS;
  }
  const target = agent.blackboard.path[agent.blackboard.pathIndex];
  const dx = target.x - agent.blackboard.x;
  const dz = target.z - agent.blackboard.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 0.4) {
    agent.blackboard.pathIndex++;
    return Status.RUNNING;
  }

  const spd = agent.blackboard.speed * dt;
  agent.blackboard.x += (dx / dist) * spd;
  agent.blackboard.z += (dz / dist) * spd;
  agent.blackboard.vx = (dx / dist) * agent.blackboard.speed;
  agent.blackboard.vz = (dz / dist) * agent.blackboard.speed;

  for (const other of world.crowd.agents) {
    if (other === agent) continue;
    const odx = agent.blackboard.x - other.blackboard.x;
    const odz = agent.blackboard.z - other.blackboard.z;
    const odist = Math.hypot(odx, odz);
    if (odist < 0.5 && odist > 0.01) {
      const push = (0.5 - odist) * 2.0;
      agent.blackboard.x += (odx / odist) * push * dt;
      agent.blackboard.z += (odz / odist) * push * dt;
    }
  }

  return Status.RUNNING;
}

function setRandomGoal(agent, world, range = 25) {
  const bb = agent.blackboard;
  let attempts = 0;
  do {
    const gx = (Math.random() - 0.5) * range * 2;
    const gz = (Math.random() - 0.5) * range * 2;
    if (world.navmesh && world.navmesh.isWalkable(gx, gz)) {
      bb.target = { x: gx, z: gz };
      bb.path = world.navmesh.findPath({ x: bb.x, z: bb.z }, bb.target);
      bb.pathIndex = 0;
      return true;
    }
    attempts++;
  } while (attempts < 10);
  return false;
}

export const NeedsToilet = new Condition((agent, world) => agent.blackboard.needsToilet());
export const IsExhausted = new Condition((agent, world) => agent.blackboard.isExhausted());
export const IsOverburdened = new Condition((agent, world) => agent.blackboard.isOverburdened());
export const HasNotVisitedStand = (standId) => new Condition((agent, world) => !agent.blackboard.standMemory.has(standId));
export const IsInQueue = new Condition((agent, world) => agent.blackboard.state === 'queuing');
export const RandomChance = (p) => new Condition((agent, world) => Math.random() < p);

export const MoveToTarget = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'walking';
  return moveAlongPath(agent, dt, world);
});

export const FindRandomDestination = new Action((agent, dt, t, world) => {
  setRandomGoal(agent, world);
  return Status.SUCCESS;
});

export const FindToilet = new Action((agent, dt, t, world) => {
  const toilets = world.stands.filter(s => s.type === 'toilet');
  if (!toilets.length) { setRandomGoal(agent, world, 5); return Status.SUCCESS; }
  const toilet = toilets[Math.floor(Math.random() * toilets.length)];
  agent.blackboard.target = { x: toilet.x, z: toilet.z };
  agent.blackboard.path = world.navmesh.findPath(
    { x: agent.blackboard.x, z: agent.blackboard.z },
    agent.blackboard.target
  );
  agent.blackboard.pathIndex = 0;
  return Status.SUCCESS;
});

export const UseToilet = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'using_toilet';
  if (t < 3.0) return Status.RUNNING;
  agent.blackboard.bladder = 0;
  agent.blackboard.energy -= 5;
  const roll = Math.random();
  let rarity = 'gewoehnlich';
  if (roll > 0.7) rarity = 'selten';
  if (roll > 0.95) rarity = 'legendär';
  agent.blackboard.lastToiletRarity = rarity;
  return Status.SUCCESS;
});

export const QueueAtBooth = (booth, duration = 10) => new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'queuing';
  agent.blackboard.isTrappedInQueue = true;
  if (t < duration) {
    agent.blackboard.patience -= dt * 3;
    return Status.RUNNING;
  }
  agent.blackboard.isTrappedInQueue = false;
  agent.blackboard.standMemory.add(booth.id);
  agent.blackboard.newsletterCount++;
  return Status.SUCCESS;
});

export const TakePhoto = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'photo';
  agent.blackboard.photoPose = Math.min(1, t / 1.5);
  if (t < 2.5) return Status.RUNNING;
  agent.blackboard.photoPose = 0;
  return Status.SUCCESS;
});

export const CollectMerch = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'collecting';
  if (t < 1.5) return Status.RUNNING;
  agent.blackboard.addMerch();
  agent.blackboard.flyers += 2 + Math.floor(Math.random() * 3);
  return Status.SUCCESS;
});

export const Jump = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'jumping';
  agent.blackboard.hasJumpedRecently = true;
  if (t < 0.4) return Status.RUNNING;
  agent.blackboard.hasJumpedRecently = false;
  return Status.SUCCESS;
});

export const Wait = (duration) => new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'idle';
  return t < duration ? Status.RUNNING : Status.SUCCESS;
});

export const PetNPC = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'petting';
  agent.blackboard.pettingTarget = world.nearbyNPC || null;
  if (t < 3.0) return Status.RUNNING;
  agent.blackboard.curiosity += 10;
  agent.blackboard.pettingTarget = null;
  return Status.SUCCESS;
});

export const ReadAGB = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'reading_agb';
  agent.blackboard.agbProgress = Math.min(1, t / 30);
  if (t < 30) return Status.RUNNING;
  agent.blackboard.agbProgress = 0;
  return Status.SUCCESS;
});

export const EnterExitSimulator = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'trapped';
  if (t < 8.0) {
    const angle = t * 2;
    agent.blackboard.x += Math.cos(angle) * dt * 2;
    agent.blackboard.z += Math.sin(angle) * dt * 2;
    return Status.RUNNING;
  }
  agent.blackboard.x = (Math.random() - 0.5) * 40;
  agent.blackboard.z = 18;
  agent.blackboard.energy -= 10;
  return Status.SUCCESS;
});

export const CheckPatchnotes = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'reading_screen';
  if (t < 4.0) return Status.RUNNING;
  agent.blackboard.patience -= 5;
  return Status.SUCCESS;
});

export const AskAI = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'talking_to_ai';
  if (t < 6.0) return Status.RUNNING;
  agent.blackboard.patience -= 15;
  return Status.SUCCESS;
});

export const BeRated = new Action((agent, dt, t, world) => {
  agent.blackboard.state = 'being_rated';
  if (t < 10.0) return Status.RUNNING;
  agent.blackboard.rating = {
    gameplay: ['vorsichtig', 'aggressiv', 'neugierig'][Math.floor(Math.random() * 3)],
    narrativeRelevance: 'gering'
  };
  return Status.SUCCESS;
});
