import { describe, expect, it } from 'vitest';
import { candidateStands, matchExhibitor } from './ingest';
import type { Exhibitor, Registry } from './types';

const exhibitors: Exhibitor[] = [
  {
    id: 'e:bandai',
    name: 'Bandai Namco Entertainment Germany GmbH',
    country: 'Germany',
    url: '',
    placements: [{ hall: '6.1', stand: 'B021', standId: '6.1:B021', outdoor: false }],
  },
  {
    id: 'e:nintendo',
    name: 'Nintendo of Europe SE',
    country: 'Germany',
    url: '',
    placements: [
      { hall: '9.1', stand: 'A010', standId: '9.1:A010', outdoor: false },
      { hall: '6.1', stand: 'C010', standId: '6.1:C010', outdoor: false },
    ],
  },
  {
    id: 'e:games',
    name: 'Generic Games GmbH',
    country: 'Germany',
    url: '',
    placements: [],
  },
];

const registry = {
  occupancy: { '6.1:B021': ['e:bandai'], '9.1:A010': ['e:nintendo'], '6.1:C010': ['e:nintendo'] },
  exhibitors,
} as unknown as Registry;

describe('matchExhibitor', () => {
  it('erkennt die Marke ohne den vollen Registernamen', () => {
    const hit = matchExhibitor('Bei Bandai Namco gibt es Poster', exhibitors);
    expect(hit?.id).toBe('e:bandai');
  });

  it('laesst sich von einem Allerweltswort nicht in die Irre fuehren', () => {
    // "Games" allein darf nicht reichen -- sonst traefe es die halbe Liste.
    expect(matchExhibitor('Coole games am Stand', exhibitors)).toBeUndefined();
  });

  it('findet nichts, wo nichts steht', () => {
    expect(matchExhibitor('Irgendwas ohne Namen', exhibitors)).toBeUndefined();
  });
});

describe('candidateStands', () => {
  it('nimmt den ausdruecklich genannten Stand', () => {
    const hit = matchExhibitor('Nintendo of Europe Halle 9.1 A010 Sticker', exhibitors);
    expect(candidateStands('Nintendo of Europe Halle 9.1 A010 Sticker', hit, registry)).toEqual([
      '9.1:A010',
    ]);
  });

  it('gibt bei mehreren Staenden alle zurueck statt zu raten', () => {
    const hit = matchExhibitor('Nintendo hat Goodies', exhibitors);
    const stands = candidateStands('Nintendo hat Goodies', hit, registry);
    expect(stands).toHaveLength(2);
  });

  it('schraenkt auf die genannte Halle ein', () => {
    const text = 'Nintendo in Halle 6.1 hat Goodies';
    const hit = matchExhibitor(text, exhibitors);
    expect(candidateStands(text, hit, registry)).toEqual(['6.1:C010']);
  });
});
