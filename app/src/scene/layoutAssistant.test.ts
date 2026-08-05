import { describe, expect, it } from 'vitest';

import { buildLayoutAssistantPrompt, parseLayoutAssistantPatches } from './layoutAssistant';

describe('layoutAssistant', () => {
  it('baut einen markierungsnahen LLM-Auftrag', () => {
    const prompt = buildLayoutAssistantPrompt({
      snapshot: { x: 1, y: 2, z: 0, yaw: 0, pitch: 0, hallKey: '10.1' },
      currentCell: { hallKey: '10.1', ix: 3, iy: 4, x: 7, y: 9, z: 0, blocked: true, patched: null },
      existingPatches: [],
      note: 'Hier ist keine Wand.',
    });
    expect(prompt).toContain('beuteltier.layout-assistant.v1');
    expect(prompt).toContain('Hier ist keine Wand.');
    expect(prompt).toContain('10.1');
  });

  it('validiert LLM-Patches vor dem Anwenden', () => {
    const patches = parseLayoutAssistantPatches(JSON.stringify({
      schema: 'beuteltier.layout-assistant.v1',
      patches: [{ hallKey: '10.1', ix: 3, iy: 4, state: 'open', note: 'Durchgang' }],
    }));
    expect(patches).toMatchObject([{ id: '10.1:3:4', state: 'open', note: 'Durchgang' }]);
  });

  it('weist unbekannte Patch-Zustaende zurueck', () => {
    expect(() => parseLayoutAssistantPatches(JSON.stringify({ patches: [{ hallKey: '10.1', ix: 3, iy: 4, state: 'maybe' }] }))).toThrow(/open oder blocked/);
  });
});
