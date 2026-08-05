// src/systems/PlayerObserver.js
import * as THREE from 'three';
import { NarratorSystem } from './NarratorSystem.js';

export class PlayerObserver {
  constructor(camera, narrator = new NarratorSystem()) {
    this.camera = camera;
    this.narrator = narrator;
    this.history = {
      positions: [],
      jumpCount: 0,
      idleTime: 0,
      backwardsTime: 0,
      lastPos: new THREE.Vector3(),
      lastForward: new THREE.Vector3(),
      clicks: 0,
      tutorialLeft: false,
      onStage: false,
      merchTaken: 0
    };
    this.lastPos = camera.position.clone();
    this.lastRot = camera.rotation.clone();
  }

  update(dt, world) {
    const cam = this.camera;
    const h = this.history;

    const move = cam.position.distanceTo(this.lastPos);
    h.positions.push(cam.position.clone());
    if (h.positions.length > 100) h.positions.shift();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const moveDir = new THREE.Vector3().subVectors(cam.position, this.lastPos).normalize();
    const dot = forward.dot(moveDir);

    if (move > 0.01 && dot < -0.5) {
      h.backwardsTime += dt;
      if (h.backwardsTime > 2.0) {
        this.narrator.trigger('walk_backwards');
        h.backwardsTime = 0;
      }
    } else {
      h.backwardsTime = Math.max(0, h.backwardsTime - dt);
    }

    if (cam.position.y > this.lastPos.y + 0.1) {
      h.jumpCount++;
      if (h.jumpCount % 3 === 0) this.narrator.trigger('jump');
    }

    if (move < 0.01) {
      h.idleTime += dt;
      if (h.idleTime > 5.0) {
        this.narrator.trigger('idle_long');
        h.idleTime = 0;
      }
    } else {
      h.idleTime = 0;
    }

    if (world.playerObjective && cam.position.distanceTo(world.playerObjective) > 5 && move > 0.5) {
      if (Math.random() < 0.001) this.narrator.trigger('ignore_objective');
    }

    if (world.lastVisitedStand && cam.position.distanceTo(world.lastVisitedStand) < 3) {
      const timeSince = world.time - world.lastVisitTime;
      if (timeSince > 60) {
        this.narrator.trigger('return_after_long');
        world.lastVisitedStand = null;
      }
    }

    if (cam.position.y < -5) {
      this.narrator.trigger('fall_out');
      cam.position.set(0, 1.7, 0);
    }

    if (h.onStage && !world.onStage) {
      this.narrator.trigger('stage_enter');
      h.onStage = true;
    }

    if (h.merchTaken > 5) {
      this.narrator.trigger('too_much_merch');
      h.merchTaken = 0;
    }

    this.lastPos.copy(cam.position);
    this.lastRot.copy(cam.rotation);
    this.narrator.update(dt);
  }

  onPlayerClick() { this.history.clicks++; }
  onMerchCollected() { this.history.merchTaken++; }
  onTutorialLeft() { this.narrator.trigger('leave_tutorial'); }
  onAppClosed() { this.narrator.trigger('close_app'); }
}
