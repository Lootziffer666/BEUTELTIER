import { describe, expect, it, afterEach } from 'vitest';
import * as THREE from 'three';

import {
  EDIT_KONTUR,
  FAMILIEN,
  KONTUR_M,
  konturMaterial,
  konturStaerke,
  stilAufraeumen,
  stufenTextur,
  toonMaterial,
  type Familie,
} from './stil';

afterEach(() => stilAufraeumen());

describe('Materialfamilien', () => {
  it('führt genau die zehn Familien der Stilbibel', () => {
    const kennungen = Object.keys(FAMILIEN);
    expect(kennungen).toEqual(['M01', 'M02', 'M03', 'M04', 'M05',
                               'M06', 'M07', 'M08', 'M09', 'M10']);
  });

  it('trägt in jedem Eintrag seine eigene Kennung', () => {
    // Sonst zeigt ein Tippfehler beim Kopieren erst im fertigen Bild.
    for (const [schluessel, familie] of Object.entries(FAMILIEN)) {
      expect(familie.id).toBe(schluessel);
    }
  });

  it('vergibt jeden Namen nur einmal', () => {
    const namen = Object.values(FAMILIEN).map((f) => f.name);
    expect(new Set(namen).size).toBe(namen.length);
  });

  it('hält sich an zwei oder drei Lichtstufen', () => {
    for (const familie of Object.values(FAMILIEN)) {
      expect([2, 3]).toContain(familie.stufen);
    }
  });

  it('gibt jeder Familie einen Einsatzzweck', () => {
    // Die elfte Familie entsteht meist, weil niemand die zehnte gefunden hat.
    for (const familie of Object.values(FAMILIEN)) {
      expect(familie.einsatz.length).toBeGreaterThan(10);
    }
  });

  it('hält den Glanz zwischen matt und halbwegs spiegelnd', () => {
    for (const familie of Object.values(FAMILIEN)) {
      expect(familie.glanz).toBeGreaterThanOrEqual(0);
      expect(familie.glanz).toBeLessThanOrEqual(0.7);
    }
  });

  it('gibt Türen, Geländern und Schildern die starke Linie', () => {
    // Detailstufe A der Stilbibel: was man ansteuert, wird stark konturiert.
    expect(FAMILIEN.M08.kontur).toBe('stark');   // Metall, also Geländer
    expect(FAMILIEN.M09.kontur).toBe('stark');   // Vegetation als Landmarke
    expect(FAMILIEN.M10.kontur).toBe('stark');   // Beschilderung
  });

  it('gibt grossen Bodenflächen die schwache Linie', () => {
    // Ein Boden mit dicker Kontur wird zum Gitter statt zur Fläche.
    expect(FAMILIEN.M03.kontur).toBe('schwach');
    expect(FAMILIEN.M04.kontur).toBe('schwach');
    expect(FAMILIEN.M05.kontur).toBe('schwach');
  });

  it('setzt dunkle Familien wirklich dunkler als helle', () => {
    const helligkeit = (familie: Familie) => {
      const farbe = new THREE.Color(familie.grundton);
      return 0.2126 * farbe.r + 0.7152 * farbe.g + 0.0722 * farbe.b;
    };
    expect(helligkeit(FAMILIEN.M02)).toBeLessThan(helligkeit(FAMILIEN.M01));
    expect(helligkeit(FAMILIEN.M03)).toBeLessThan(helligkeit(FAMILIEN.M04));
  });
});

describe('Konturstufen', () => {
  it('sind der Reihe nach dicker', () => {
    expect(KONTUR_M.keine).toBe(0);
    expect(KONTUR_M.schwach).toBeLessThan(KONTUR_M.mittel);
    expect(KONTUR_M.mittel).toBeLessThan(KONTUR_M.stark);
  });

  it('bleiben unter einer Handbreit -- sonst ist es keine Linie mehr', () => {
    expect(KONTUR_M.stark).toBeLessThan(0.2);
  });

  it('halten die volle Stärke in der Nähe', () => {
    expect(konturStaerke('stark')).toBe(KONTUR_M.stark);
    expect(konturStaerke('stark', 0)).toBe(KONTUR_M.stark);
    expect(konturStaerke('stark', 150)).toBe(KONTUR_M.stark);
  });

  it('nehmen mit der Entfernung ab und verschwinden ganz', () => {
    const nah = konturStaerke('mittel', 150);
    const mittel = konturStaerke('mittel', 275);
    const fern = konturStaerke('mittel', 400);
    expect(mittel).toBeLessThan(nah);
    expect(mittel).toBeGreaterThan(0);
    expect(fern).toBe(0);
    expect(konturStaerke('mittel', 1000)).toBe(0);
  });

  it('machen aus keiner Kontur auch in der Nähe keine', () => {
    expect(konturStaerke('keine', 5)).toBe(0);
  });

  it('gibt dem Edit-Modus mehr Kontrast statt einer eigenen Fläche', () => {
    expect(EDIT_KONTUR.faktor).toBeGreaterThan(1);
    // Deutlich heller als die normale Linie -- sonst sieht man die Auswahl nicht.
    const auswahl = new THREE.Color(EDIT_KONTUR.farbe);
    const normal = new THREE.Color('#14161a');
    expect(auswahl.r + auswahl.g + auswahl.b)
      .toBeGreaterThan(normal.r + normal.g + normal.b);
  });
});

describe('Stufentextur', () => {
  it('hat so viele Bildpunkte wie Stufen', () => {
    expect(stufenTextur(2).image.width).toBe(2);
    expect(stufenTextur(3).image.width).toBe(3);
  });

  it('filtert hart -- weich wäre wieder ein Verlauf', () => {
    const textur = stufenTextur(3);
    expect(textur.magFilter).toBe(THREE.NearestFilter);
    expect(textur.minFilter).toBe(THREE.NearestFilter);
    expect(textur.generateMipmaps).toBe(false);
  });

  it('steigt von dunkel nach hell', () => {
    const daten = stufenTextur(3).image.data as Uint8Array;
    expect(daten[0]).toBeLessThan(daten[4]);
    expect(daten[4]).toBeLessThan(daten[8]);
    expect(daten[8]).toBe(255);
  });

  it('gibt dieselbe Textur zurück statt einer neuen', () => {
    // Zwei Texturen für dieselbe Stufenzahl wären zweimal Speicher für nichts.
    expect(stufenTextur(2)).toBe(stufenTextur(2));
    expect(stufenTextur(2)).not.toBe(stufenTextur(3));
  });
});

describe('toonMaterial', () => {
  it('hängt die Stufentextur der Familie an', () => {
    const material = toonMaterial(FAMILIEN.M02);
    expect(material.gradientMap).toBe(stufenTextur(FAMILIEN.M02.stufen));
    expect(material.color.getHexString()).toBe(
      new THREE.Color(FAMILIEN.M02.grundton).getHexString());
  });

  it('trägt Kennung und Namen der Familie', () => {
    // Damit man im fertigen Bild nachsehen kann, welche Familie eine Fläche hat.
    expect(toonMaterial(FAMILIEN.M06).name).toBe('M06|WOOD_DECK');
  });

  it('lässt matte Familien matt', () => {
    const material = toonMaterial(FAMILIEN.M09);
    expect(FAMILIEN.M09.glanz).toBe(0);
    expect(material.emissiveIntensity).toBe(1);
    expect(material.emissive.getHex()).toBe(0x000000);
  });

  it('gibt glänzenden Familien ein gedeckeltes Leuchten', () => {
    const material = toonMaterial(FAMILIEN.M08);
    expect(material.emissiveIntensity).toBeGreaterThan(0);
    // Gedeckelt: aus Stahl soll keine Lampe werden.
    expect(material.emissiveIntensity).toBeLessThan(0.2);
  });

  it('übernimmt Karten, aber keine Rauheit', () => {
    const map = new THREE.Texture();
    const material = toonMaterial(FAMILIEN.M01, { map });
    expect(material.map).toBe(map);
    expect('roughnessMap' in material).toBe(false);
    map.dispose();
  });
});

describe('konturMaterial', () => {
  it('zeichnet nur die Rückseite -- sonst wäre es eine Fläche', () => {
    expect(konturMaterial().side).toBe(THREE.BackSide);
  });

  it('wird nicht beleuchtet', () => {
    // MeshBasicMaterial: eine Linie, die im Schatten dunkler wird, ist keine.
    expect(konturMaterial()).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('teilt sich je Farbe eine Fassung', () => {
    expect(konturMaterial('#000000')).toBe(konturMaterial('#000000'));
    expect(konturMaterial('#000000')).not.toBe(konturMaterial('#ffffff'));
  });
});
