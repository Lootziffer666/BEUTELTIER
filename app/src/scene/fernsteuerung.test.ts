import { describe, expect, it } from 'vitest';

import { fernsteuerungErlaubt } from './fernsteuerung';

describe('fernsteuerungErlaubt', () => {
  it('bleibt zu, solange niemand danach fragt', () => {
    expect(fernsteuerungErlaubt('')).toBe(false);
    expect(fernsteuerungErlaubt('?halle=9')).toBe(false);
  });

  it('oeffnet sich fuer den Bildpruefer', () => {
    expect(fernsteuerungErlaubt('?setzen=1')).toBe(true);
    expect(fernsteuerungErlaubt('?halle=9&setzen=1')).toBe(true);
  });

  it('nimmt den Parameter auch ohne Wert', () => {
    expect(fernsteuerungErlaubt('?setzen')).toBe(true);
  });

  it('verwechselt ihn nicht mit einem aehnlichen Namen', () => {
    expect(fernsteuerungErlaubt('?setzenX=1')).toBe(false);
  });
});
