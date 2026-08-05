import * as THREE from 'three';

export class NavMeshGenerator {
  constructor(scene, cellSize = 0.5) {
    this.scene = scene;
    this.cellSize = cellSize;
    this.walkable = new Set();
    this.obstacles = [];
  }

  scanStaticObstacles() {
    this.scene.traverse(child => {
      if (child.userData?.isCollider || child.userData?.type === 'toilet' || child.userData?.type === 'counter') {
        const box = new THREE.Box3().setFromObject(child);
        this.obstacles.push({
          minX: box.min.x,
          maxX: box.max.x,
          minZ: box.min.z,
          maxZ: box.max.z
        });
      }
    });
  }

  buildWalkableGrid(bounds = { minX: -50, maxX: 50, minZ: -30, maxZ: 30 }) {
    this.walkable.clear();
    for (let x = bounds.minX; x <= bounds.maxX; x += this.cellSize) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += this.cellSize) {
        const key = `${x.toFixed(1)},${z.toFixed(1)}`;
        let blocked = false;
        for (const obs of this.obstacles) {
          if (x >= obs.minX - 0.3 && x <= obs.maxX + 0.3 &&
              z >= obs.minZ - 0.3 && z <= obs.maxZ + 0.3) {
            blocked = true;
            break;
          }
        }
        if (!blocked) this.walkable.add(key);
      }
    }
  }

  isWalkable(x, z) {
    const key = `${(Math.round(x / this.cellSize) * this.cellSize).toFixed(1)},${(Math.round(z / this.cellSize) * this.cellSize).toFixed(1)}`;
    return this.walkable.has(key);
  }

  findPath(start, end) {
    const open = [{ x: start.x, z: start.z, g: 0, h: Math.hypot(end.x - start.x, end.z - start.z), parent: null }];
    const closed = new Set();
    const path = [];

    while (open.length > 0) {
      open.sort((a, b) => (a.g + a.h) - (b.g + b.h));
      const current = open.shift();
      const key = `${current.x.toFixed(1)},${current.z.toFixed(1)}`;
      if (closed.has(key)) continue;
      closed.add(key);

      if (Math.hypot(current.x - end.x, current.z - end.z) < this.cellSize * 2) {
        let node = current;
        while (node) {
          path.unshift(new THREE.Vector3(node.x, 0, node.z));
          node = node.parent;
        }
        return path;
      }

      const neighbors = [
        { x: current.x + this.cellSize, z: current.z },
        { x: current.x - this.cellSize, z: current.z },
        { x: current.x, z: current.z + this.cellSize },
        { x: current.x, z: current.z - this.cellSize }
      ];

      for (const n of neighbors) {
        if (this.isWalkable(n.x, n.z) && !closed.has(`${n.x.toFixed(1)},${n.z.toFixed(1)}`)) {
          open.push({
            x: n.x, z: n.z,
            g: current.g + this.cellSize,
            h: Math.hypot(end.x - n.x, end.z - n.z),
            parent: current
          });
        }
      }
    }
    return path;
  }
}
