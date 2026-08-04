import * as THREE from 'three';

export class ProceduralTextures {
  static banner(text, bgColor = '#001144', textColor = '#ffffff') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 512);

    for (let x = 0; x < 256; x += 4) {
      const shade = (x % 8 === 0) ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.05)';
      ctx.fillStyle = shade;
      ctx.fillRect(x, 0, 2, 512);
    }

    ctx.fillStyle = textColor;
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(128, 256);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(text, 0, 0);
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static cardboardFigure(name, gameTitle, faceColor = '#f0e6d2') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');

    ctx.fillStyle = faceColor;
    ctx.fillRect(0, 0, 256, 512);

    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    for (let y = 0; y < 512; y += 6) {
      ctx.fillRect(0, y, 256, 3);
    }

    ctx.fillStyle = '#e0d0b8';
    ctx.beginPath();
    ctx.ellipse(128, 140, 60, 70, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#332211';
    ctx.beginPath();
    ctx.arc(128, 110, 55, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = '#222';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 280);
    ctx.fillStyle = '#666';
    ctx.font = '18px Arial';
    ctx.fillText(gameTitle, 128, 310);

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(30, 340, 196, 60, 10);
    ctx.stroke();
    ctx.fillStyle = '#444';
    ctx.font = '14px Arial';
    ctx.fillText('Frag mich über das Spiel!', 128, 375);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static videoScreen(frameIndex = 0, title = 'GAMEPLAY TRAILER') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#020204';
    ctx.fillRect(0, 0, 512, 256);

    ctx.fillStyle = 'rgba(0,255,255,0.03)';
    for (let y = 0; y < 256; y += 2) {
      ctx.fillRect(0, y, 512, 1);
    }

    const t = frameIndex * 0.1;
    for (let i = 0; i < 12; i++) {
      const hue = (t * 50 + i * 30) % 360;
      ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
      const h = 20 + Math.sin(t + i) * 40;
      ctx.fillRect(40 + i * 38, 128 - h / 2, 30, h);
    }

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 40);

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(236, 108);
    ctx.lineTo(276, 128);
    ctx.lineTo(236, 148);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static wristband(color = '#ff0044', text = 'GAMESCOM 2026') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 64);

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let x = 0; x < 256; x += 8) {
      ctx.fillRect(x, 0, 4, 64);
    }

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 38);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static toiletSign(gender = 'male') {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');

    ctx.fillStyle = gender === 'male' ? '#4488ff' : '#ff4488';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gender === 'male' ? '♂' : '♀', 64, 64);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
