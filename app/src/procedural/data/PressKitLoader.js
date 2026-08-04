// src/data/PressKitLoader.js
import { BoothGenerator } from '../generators/BoothGenerator.js';
import { TechGenerator } from '../generators/TechGenerator.js';

export class PressKitLoader {
  async loadGameData(url) {
    const res = await fetch(url);
    return res.json();
  }

  createBoothFromData(gameData, x, z) {
    const group = new THREE.Group();

    const wall = BoothGenerator.createPressKitDisplay(gameData);
    group.add(wall);

    if (gameData.hasTrailer) {
      const screen = TechGenerator.createLEDWall(6, 3.5, gameData.title);
      screen.position.set(0, 3, -2);
      group.add(screen);
    }

    const cardboard = BoothGenerator.createCardboardFigure(
      gameData.protagonist || 'Hero',
      gameData.title,
      3, 1
    );
    group.add(cardboard);

    group.position.set(x, 0, z);
    return group;
  }

  async populateHall(scene, gamesListUrl) {
    const games = await this.loadGameData(gamesListUrl);
    const spacing = 12;

    games.forEach((game, i) => {
      const x = (i % 5) * spacing - 24;
      const z = Math.floor(i / 5) * spacing - 10;
      const booth = this.createBoothFromData(game, x, z);
      scene.add(booth);
    });
  }
}
