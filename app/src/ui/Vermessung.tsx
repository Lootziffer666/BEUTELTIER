/**
 * Vermessungsmodus: Referenzfoto ausrichten, Kamerazustand markieren.
 *
 * Der bisherige Ablauf war verlustreich: ein Screenshot, eine Beschreibung
 * in Worten, wo man stand -- und die Beschreibung war immer ungenauer als
 * die Szene selbst. Hier steht die Kamera für sich: No-Clip erreicht auch
 * erhöhte oder durch Wände hindurch gesehene Referenzpunkte, das Foto legt
 * sich als durchsichtige Ebene über die Live-Ansicht, und eine Notiz nimmt
 * Position, Blickrichtung und Halle aus der laufenden Szene mit -- nicht aus
 * einer Beschreibung.
 *
 * Das Referenzfoto selbst verlässt den Browser nie automatisch: es lebt nur
 * als Object-URL im Speicher, wird nicht heruntergeladen oder kopiert. Nur
 * die Notiz (Text + Zahlen) lässt sich exportieren.
 */

import { useEffect, useRef, useState } from 'react';
import type { CameraSnapshot } from '../scene/survey';
import { describeSnapshot, type Annotation } from '../scene/survey';

interface VermessungProps {
  noClip: boolean;
  frozen: boolean;
  viewfinderOpen: boolean;
  onToggleNoClip: () => void;
  onToggleFreeze: () => void;
  onToggleViewfinder: () => void;
  overlayImage: string | null;
  onOverlayImage: (url: string | null) => void;
  overlayOpacity: number;
  onOverlayOpacity: (value: number) => void;
  pendingMark: CameraSnapshot | null;
  onCommitNote: (text: string) => void;
  onCancelNote: () => void;
  annotations: Annotation[];
  onExport: () => void;
  onCopy: () => void;
  onDeleteAnnotation: (id: string) => void;
}

/** Bild aus Zwischenablage oder Drag&Drop lesen, als Object-URL. */
function imageFromDataTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  return Array.from(data.files).find((file) => file.type.startsWith('image/')) ?? null;
}

export function Vermessung({
  noClip,
  frozen,
  viewfinderOpen,
  onToggleNoClip,
  onToggleFreeze,
  onToggleViewfinder,
  overlayImage,
  onOverlayImage,
  overlayOpacity,
  onOverlayOpacity,
  pendingMark,
  onCommitNote,
  onCancelNote,
  annotations,
  onExport,
  onCopy,
  onDeleteAnnotation,
}: VermessungProps) {
  const [noteText, setNoteText] = useState('');
  const [showList, setShowList] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  useEffect(() => {
    if (!pendingMark) setNoteText('');
  }, [pendingMark]);

  // Bild aus der Zwischenablage: der naheliegende Weg, ein bereits offenes
  // Referenzfoto in den Viewfinder zu bringen.
  useEffect(() => {
    if (!viewfinderOpen) return;
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (!file) return;
      onOverlayImage(URL.createObjectURL(file));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [viewfinderOpen, onOverlayImage]);

  const applyTransform = () => {
    if (imgRef.current) {
      imgRef.current.style.transform =
        `translate(${transform.current.x}px, ${transform.current.y}px) scale(${transform.current.scale})`;
    }
  };

  const onImagePointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.current.x,
      originY: transform.current.y,
    };
  };
  const onImagePointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!drag.current) return;
    transform.current.x = drag.current.originX + (event.clientX - drag.current.startX);
    transform.current.y = drag.current.originY + (event.clientY - drag.current.startY);
    applyTransform();
  };
  const onImagePointerUp = () => {
    drag.current = null;
  };
  const onImageWheel = (event: React.WheelEvent<HTMLImageElement>) => {
    event.preventDefault();
    transform.current.scale = Math.min(6, Math.max(0.2, transform.current.scale * (1 - event.deltaY * 0.001)));
    applyTransform();
  };
  const resetTransform = () => {
    transform.current = { x: 0, y: 0, scale: 1 };
    applyTransform();
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = imageFromDataTransfer(event.dataTransfer);
    if (file) onOverlayImage(URL.createObjectURL(file));
  };

  return (
    <>
      <div className="survey">
        <button
          type="button"
          className={noClip ? 'is-active' : ''}
          onClick={onToggleNoClip}
          title="Kollision aus -- erreicht auch erhöhte oder durch Wände hindurch gesehene Referenzpunkte"
        >
          No-Clip <kbd>N</kbd>
        </button>
        <button type="button" className={frozen ? 'is-active' : ''} onClick={onToggleFreeze} title="Bewegung und Umsehen pausieren">
          Einfrieren <kbd>F</kbd>
        </button>
        <button
          type="button"
          className={viewfinderOpen ? 'is-active' : ''}
          onClick={onToggleViewfinder}
          title="Referenzfoto einblenden"
        >
          Referenzfoto <kbd>V</kbd>
        </button>
        <button type="button" onClick={() => setShowList((v) => !v)}>
          Notizen ({annotations.length})
        </button>
      </div>

      {viewfinderOpen && (
        <div
          className="viewfinder"
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
        >
          {overlayImage ? (
            <>
              <img
                ref={imgRef}
                src={overlayImage}
                alt="Referenzfoto"
                className="viewfinder__image"
                style={{ opacity: overlayOpacity }}
                onPointerDown={onImagePointerDown}
                onPointerMove={onImagePointerMove}
                onPointerUp={onImagePointerUp}
                onWheel={onImageWheel}
                draggable={false}
              />
              <div className="viewfinder__bar">
                <label className="slider">
                  <span>Deckkraft</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={overlayOpacity}
                    onChange={(event) => onOverlayOpacity(Number(event.target.value))}
                  />
                </label>
                <button type="button" onClick={resetTransform}>
                  Position zurücksetzen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(overlayImage);
                    onOverlayImage(null);
                  }}
                >
                  Foto entfernen
                </button>
              </div>
            </>
          ) : (
            <div className="viewfinder__drop">
              Foto einfügen mit <kbd>Strg</kbd>+<kbd>V</kbd> oder hierher ziehen
            </div>
          )}
        </div>
      )}

      {pendingMark && (
        <div className="note-composer">
          <p className="note-composer__snapshot">{describeSnapshot(pendingMark)}</p>
          <textarea
            autoFocus
            value={noteText}
            placeholder="Was ist hier falsch oder fehlt?"
            onChange={(event) => setNoteText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                onCancelNote();
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.stopPropagation();
                onCommitNote(noteText);
              }
            }}
          />
          <div className="note-composer__actions">
            <button type="button" onClick={onCancelNote}>
              Abbrechen
            </button>
            <button type="button" className="is-active" onClick={() => onCommitNote(noteText)}>
              Speichern (Strg+Enter)
            </button>
          </div>
        </div>
      )}

      {showList && (
        <div className="note-list">
          <div className="note-list__head">
            <strong>{annotations.length} Notiz(en)</strong>
            <div>
              <button type="button" onClick={onCopy}>
                In Zwischenablage
              </button>
              <button type="button" onClick={onExport}>
                Als JSON laden
              </button>
            </div>
          </div>
          {annotations.length === 0 && <p className="muted">Noch keine Notiz markiert.</p>}
          <ul>
            {annotations
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id}>
                  <div>
                    <p>{entry.note}</p>
                    <p className="muted">{describeSnapshot(entry.camera)}</p>
                  </div>
                  <button type="button" onClick={() => onDeleteAnnotation(entry.id)} aria-label="Löschen">
                    ×
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </>
  );
}
