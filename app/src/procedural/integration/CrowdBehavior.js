// src/integration/CrowdBehavior.js
import * as THREE from 'three';
import { BehaviorTree, Sequence, Selector, Condition, Action } from '../behavior/BehaviorTree.js';
import { AgentBlackboard } from '../behavior/Blackboard.js';
import * as Nodes from '../behavior/MesseNodes.js';
import { StandRegistry } from '../behavior/AbsurdStands.js';
import { Status } from '../behavior/BehaviorTree.js';

export class CrowdBehaviorSystem {
  constructor(scene, navmesh, worldStands = []) {
    this.scene = scene;
    this.navmesh = navmesh;
    this.agents = [];
    this.world = {
      navmesh,
      stands: [...StandRegistry, ...worldStands],
      crowd: this,
      time: 0
    };
  }

  createAgent(x, z) {
    const bb = new AgentBlackboard(this.agents.length, x, z);

    const tree = new BehaviorTree(
      new Selector([
        new Sequence([
          Nodes.NeedsToilet,
          Nodes.FindToilet,
          Nodes.MoveToTarget,
          Nodes.UseToilet
        ]),
        new Sequence([
          Nodes.IsExhausted,
          Nodes.FindRandomDestination,
          Nodes.MoveToTarget,
          Nodes.Wait(5)
        ]),
        new Selector([
          new Sequence([
            new Condition((a, w) => Math.random() < 0.02),
            Nodes.HasNotVisitedStand('agb_boss'),
            new Action((agent, dt, t, world) => {
              agent.blackboard.target = { x: -15, z: -15 };
              agent.blackboard.path = world.navmesh.findPath(
                { x: agent.blackboard.x, z: agent.blackboard.z },
                agent.blackboard.target
              );
              agent.blackboard.pathIndex = 0;
              return Status.SUCCESS;
            }),
            Nodes.MoveToTarget,
            Nodes.ReadAGB
          ]),
          new Sequence([
            new Condition((a, w) => Math.random() < 0.03),
            Nodes.HasNotVisitedStand('petting_zoo'),
            new Action((agent, dt, t, world) => {
              agent.blackboard.target = { x: 12, z: 8 };
              agent.blackboard.path = world.navmesh.findPath(
                { x: agent.blackboard.x, z: agent.blackboard.z },
                agent.blackboard.target
              );
              agent.blackboard.pathIndex = 0;
              return Status.SUCCESS;
            }),
            Nodes.MoveToTarget,
            Nodes.PetNPC
          ]),
          new Sequence([
            new Condition((a, w) => Math.random() < 0.02),
            new Action((agent, dt, t, world) => {
              agent.blackboard.target = { x: 8, z: -12 };
              agent.blackboard.path = world.navmesh.findPath(
                { x: agent.blackboard.x, z: agent.blackboard.z },
                agent.blackboard.target
              );
              agent.blackboard.pathIndex = 0;
              return Status.SUCCESS;
            }),
            Nodes.MoveToTarget,
            Nodes.EnterExitSimulator
          ])
        ]),
        new Selector([
          new Sequence([
            new Condition((a, w) => Math.random() < 0.3),
            new Action((agent, dt, t, world) => {
              const booth = world.stands[Math.floor(Math.random() * world.stands.length)];
              if (!booth) return Status.FAILURE;
              agent.blackboard.target = { x: booth.x + (Math.random()-0.5)*2, z: booth.z + (Math.random()-0.5)*2 };
              agent.blackboard.path = world.navmesh.findPath(
                { x: agent.blackboard.x, z: agent.blackboard.z },
                agent.blackboard.target
              );
              agent.blackboard.pathIndex = 0;
              return Status.SUCCESS;
            }),
            Nodes.MoveToTarget,
            new Selector([
              new Sequence([
                Nodes.RandomChance(0.4),
                Nodes.TakePhoto
              ]),
              new Sequence([
                Nodes.RandomChance(0.6),
                Nodes.QueueAtBooth({ id: 'generic' }, 8)
              ]),
              new Sequence([
                Nodes.RandomChance(0.3),
                Nodes.CollectMerch
              ]),
              Nodes.Wait(3)
            ])
          ]),
          new Sequence([
            Nodes.FindRandomDestination,
            Nodes.MoveToTarget,
            Nodes.Wait(2 + Math.random() * 4)
          ])
        ])
      ])
    );

    this.agents.push({ blackboard: bb, tree, meshIndex: -1 });
    return bb;
  }

  update(dt, time) {
    this.world.time = time;

    for (const agent of this.agents) {
      agent.blackboard.bladder += dt * 1.5;
      agent.blackboard.hunger += dt * 0.8;
      agent.blackboard.energy -= dt * 0.3;

      agent.tree.tick(agent, dt, this.world);

      if (agent.blackboard.state === 'walking') {
        agent.blackboard.y = 0.55 + Math.sin(time * 8 + agent.blackboard.bobPhase) * 0.06;
        agent.blackboard.lean = Math.sin(time * 6 + agent.blackboard.bobPhase) * 0.05;
      } else if (agent.blackboard.state === 'jumping') {
        const jumpT = Math.min(1, (time % 1) * 2.5);
        agent.blackboard.y = 0.55 + Math.sin(jumpT * Math.PI) * 0.4;
      } else if (agent.blackboard.state === 'photo') {
        agent.blackboard.y = 0.55;
        agent.blackboard.lean = Math.sin(time * 3) * 0.1;
      } else {
        agent.blackboard.y = 0.55;
        agent.blackboard.lean *= 0.9;
      }
    }
  }

  getAgentMatrices() {
    const matrices = [];
    const dummy = new THREE.Object3D();

    for (const agent of this.agents) {
      const bb = agent.blackboard;
      dummy.position.set(bb.x, bb.y, bb.z);
      dummy.rotation.set(0, Math.atan2(bb.vx, bb.vz), bb.lean);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }
    return matrices;
  }
}
