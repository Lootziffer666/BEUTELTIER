import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import demoJson from '../../public/data/demo-corridor.json';
import type { DemoCorridor } from '../data/load';
import { DemoCorridorCard } from './DemoCorridorCard';

const corridor = demoJson as unknown as DemoCorridor;

describe('DemoCorridorCard', () => {
  it('zeigt reale Anker, Quellenmass und Unsicherheit gleichzeitig', () => {
    const markup = renderToStaticMarkup(
      <DemoCorridorCard corridor={corridor} active={false} route={null} onToggle={() => undefined} />,
    );
    expect(markup).toContain('Koeln Messe/Deutz, Ausgang Ottoplatz');
    expect(markup).toContain('Eingang Sued');
    expect(markup).toContain('Halle 10.1');
    expect(markup).toContain('479,3');
    expect(markup).toContain('unbestätigt');
    expect(markup).toContain('RouteGraph-Polylinie');
  });

  it('meldet einen aktiven, aber unterbrochenen Korridor als FAILED', () => {
    const markup = renderToStaticMarkup(
      <DemoCorridorCard corridor={corridor} active route={null} onToggle={() => undefined} />,
    );
    expect(markup).toContain('FAILED');
    expect(markup).not.toContain('Durchgängiger Graphpfad');
  });
});
