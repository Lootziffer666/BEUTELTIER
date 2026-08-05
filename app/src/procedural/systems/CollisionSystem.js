import * as THREE from 'three';

export class CollisionSystem {
  constructor() {
    this.colliders = [];
  }

  extractFromGroup(group) {
    group.traverse(child => {
      if (child.userData?.isCollider) {
        this.colliders.push({
          mesh: child,
          type: child.userData.type,
          box: new THREE.Box3().setFromObject(child)
        });
      }
    });
  }

  checkIntersection(objectBox) {
    return this.colliders.filter(c => c.box.intersectsBox(objectBox));
  }

  generateNavMeshMarkers(scene, resolution = 1) {
    const markers = [];
    this.colliders.forEach(c => {
      const size = new THREE.Vector3();
      c.box.getSize(size);
      markers.push({
        x: c.box.min.x,
        z: c.box.min.z,
        width: size.x,
        depth: size.z,
        type: c.type
      });
    });
    return markers;
  }
}
