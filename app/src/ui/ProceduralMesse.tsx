import { useEffect, useRef, useState } from 'react';

interface ProceduralWorld {
  dispose?: () => void;
}

export function ProceduralMesse() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let world: ProceduralWorld | null = null;

    if (!hostRef.current) return undefined;

    import('../procedural/main.js')
      .then(({ initGamescomScene }) => initGamescomScene({ container: hostRef.current ?? undefined }))
      .then((createdWorld) => {
        if (cancelled) {
          createdWorld.dispose?.();
          return;
        }
        world = createdWorld;
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    return () => {
      cancelled = true;
      world?.dispose?.();
    };
  }, []);

  return (
    <section className="procedural-messe">
      <header className="procedural-messe__header">
        <h2>Prozedurale Messe</h2>
        <p>
          Generierte Gamescom-Halle mit Behavior-Tree-Crowd, absurden Ständen und
          Meta-Erzähler. Klicken aktiviert Pointer-Lock; WASD bewegt die Kamera.
        </p>
      </header>
      {error ? <p className="procedural-messe__error">{error}</p> : null}
      <div ref={hostRef} className="procedural-messe__viewport" />
    </section>
  );
}
