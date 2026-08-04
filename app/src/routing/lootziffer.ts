/**
 * Loot-Ziffer, Hoarder Border und Pouch-Ouch -- die Bewertungsbegriffe aus PRD 6.
 *
 * Die Loot-Ziffer beantwortet nicht „wie gut ist dieser Fund", sondern „lohnt
 * sich der Weg dorthin gerade". Das sind verschiedene Fragen: ein großartiges
 * Goodie fünfhundert Meter entfernt, gemeldet vor drei Stunden, von niemandem
 * bestätigt, ist ein schlechteres Ziel als eine mittelmäßige Tüte im Nebengang.
 */

export type FindStatus = 'unbestaetigt' | 'bestaetigt' | 'veraltet' | 'beendet';
export type Availability = 'digital' | 'vor_ort' | 'beides';

export interface Scoreable {
  status: FindStatus;
  /** Wann die Meldung entstand. */
  reportedAt: number;
  /** Eigene Einschätzung des Werts, 0 bis 1. */
  worth?: number;
  availability?: Availability;
}

export interface LootScore {
  /** 0 bis 100. */
  value: number;
  /** Warum die Zahl so ausfällt -- nachvollziehbar statt magisch. */
  reasons: string[];
  beyondHoarderBorder: boolean;
}

/** Ab hier lohnt der Weg nicht mehr: die Hoarder Border. */
export const HOARDER_BORDER = 28;

const STATUS_WEIGHT: Record<FindStatus, number> = {
  bestaetigt: 1,
  unbestaetigt: 0.55,
  veraltet: 0.15,
  beendet: 0,
};

/** Nach dieser Zeit ist eine Meldung nur noch halb so viel wert. */
const HALF_LIFE_MINUTES = 150;

export function lootZiffer(
  item: Scoreable,
  walkMinutes: number,
  now: number = Date.now(),
): LootScore {
  const reasons: string[] = [];

  if (item.status === 'beendet') {
    return { value: 0, reasons: ['Aktion ist beendet'], beyondHoarderBorder: true };
  }

  const worth = item.worth ?? 0.6;
  let value = worth * 100;

  const statusFactor = STATUS_WEIGHT[item.status];
  value *= statusFactor;
  if (item.status === 'unbestaetigt') reasons.push('noch von niemandem bestätigt');
  if (item.status === 'veraltet') reasons.push('Meldung gilt als veraltet');

  const ageMinutes = Math.max(0, (now - item.reportedAt) / 60000);
  const freshness = Math.pow(0.5, ageMinutes / HALF_LIFE_MINUTES);
  value *= freshness;
  if (ageMinutes > HALF_LIFE_MINUTES) {
    reasons.push(`Meldung ist ${Math.round(ageMinutes / 60)} h alt`);
  }

  // Digital erreichbare Funde kosten keinen Weg.
  if (item.availability === 'digital') {
    reasons.push('digital erreichbar, kein Weg nötig');
    return { value: Math.round(value), reasons, beyondHoarderBorder: false };
  }

  // Der Weg zählt doppelt: er kostet Zeit und die Zeit fehlt woanders.
  const walkFactor = 1 / (1 + walkMinutes / 8);
  value *= walkFactor;
  if (walkMinutes > 10) reasons.push(`${Math.round(walkMinutes)} min Weg`);

  const rounded = Math.round(value);
  return {
    value: rounded,
    reasons,
    beyondHoarderBorder: rounded < HOARDER_BORDER,
  };
}

/**
 * Pouch-Ouch: wie voll die Tasche ist und was das kostet.
 *
 * Ein humorvoller Begriff aus PRD 6, der eine echte Größe misst -- wer schwer
 * trägt, geht langsamer und will nicht mehr quer über das Gelände.
 */
export interface PouchState {
  items: number;
  weightKg: number;
}

export function pouchOuch(pouch: PouchState): {
  level: 'leicht' | 'spuerbar' | 'schwer' | 'aua';
  speedFactor: number;
  hint: string;
} {
  const { weightKg } = pouch;
  if (weightKg < 3) {
    return { level: 'leicht', speedFactor: 1, hint: 'Geht noch was rein.' };
  }
  if (weightKg < 6) {
    return { level: 'spuerbar', speedFactor: 0.95, hint: 'Merkt man langsam.' };
  }
  if (weightKg < 10) {
    return {
      level: 'schwer',
      speedFactor: 0.85,
      hint: 'Schulter meldet sich. Schließfach wäre eine Idee.',
    };
  }
  return {
    level: 'aua',
    speedFactor: 0.72,
    hint: 'Pouch-Ouch. Ab damit ins Schließfach, sonst wird der Rückweg lang.',
  };
}
