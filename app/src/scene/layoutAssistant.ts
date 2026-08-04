import type { CameraSnapshot } from './survey';
import type { LayoutPatch, LayoutPatchState, WalkCell } from './walk';

export interface LayoutAssistantContext {
  snapshot: CameraSnapshot | null;
  currentCell: WalkCell | null;
  existingPatches: LayoutPatch[];
  note?: string;
}

interface LayoutAssistantPatchInput {
  hallKey: string;
  ix: number;
  iy: number;
  state: LayoutPatchState;
  note?: string;
}

export function buildLayoutAssistantPrompt({
  snapshot,
  currentCell,
  existingPatches,
  note,
}: LayoutAssistantContext): string {
  return JSON.stringify(
    {
      task: 'Erzeuge BEUTELTIER Layout-Patches fuer falsch erkannte Waende, Treppen, Rolltreppen oder Durchgaenge.',
      rules: [
        'Antworte ausschliesslich als JSON.',
        'Nutze schema beuteltier.layout-assistant.v1.',
        'patches[].state ist entweder open fuer Durchgang oeffnen oder blocked fuer Wand/Sperre setzen.',
        'Aendere nur Zellen, die aus Markierung, Notiz oder Vermessung plausibel sind.',
      ],
      expectedResponse: {
        schema: 'beuteltier.layout-assistant.v1',
        patches: [
          { hallKey: currentCell?.hallKey ?? '10.1', ix: currentCell?.ix ?? 0, iy: currentCell?.iy ?? 0, state: 'open', note: 'kurze Begruendung' },
        ],
      },
      context: {
        snapshot,
        currentCell,
        note: note?.trim() || null,
        existingPatches,
      },
    },
    null,
    2,
  );
}

export function parseLayoutAssistantPatches(raw: string): LayoutPatch[] {
  const parsed = JSON.parse(raw) as { patches?: LayoutAssistantPatchInput[] };
  if (!Array.isArray(parsed.patches)) throw new Error('LLM-Antwort enthaelt kein patches-Array.');
  return parsed.patches.map((patch) => {
    if (!patch.hallKey || !Number.isInteger(patch.ix) || !Number.isInteger(patch.iy)) {
      throw new Error('Patch braucht hallKey, ix und iy.');
    }
    if (patch.state !== 'open' && patch.state !== 'blocked') {
      throw new Error('Patch state muss open oder blocked sein.');
    }
    return {
      id: `${patch.hallKey}:${patch.ix}:${patch.iy}`,
      hallKey: patch.hallKey,
      ix: patch.ix,
      iy: patch.iy,
      state: patch.state,
      note: patch.note,
      changedAt: Date.now(),
    };
  });
}
