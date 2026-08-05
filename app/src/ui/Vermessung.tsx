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
import type { LayoutPatch, WalkCell } from '../scene/walk';
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
  layoutPatches: LayoutPatch[];
  currentWalkCell: WalkCell | null;
  onOpenCell: () => void;
  onBlockCell: () => void;
  onClearCell: () => void;
  onExportLayout: () => void;
  onCopyLayout: () => void;
  onCopyAssistantPrompt: (note?: string) => void;
  onApplyAssistantJson: (raw: string) => void;
  measureStart: CameraSnapshot | null;
  onSetMeasureStart: () => void;
  onClearMeasureStart: () => void;
  onApplyMeasuredCorridor: (distanceM: number, widthM: number) => void;
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
  layoutPatches,
  currentWalkCell,
  onOpenCell,
  onBlockCell,
  onClearCell,
  onExportLayout,
  onCopyLayout,
  onCopyAssistantPrompt,
  onApplyAssistantJson,
  measureStart,
  onSetMeasureStart,
  onClearMeasureStart,
  onApplyMeasuredCorridor,
}: VermessungProps) {
  const [noteText, setNoteText] = useState('');
  const [showList, setShowList] = useState(false);
  const [assistantJson, setAssistantJson] = useState('');
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [measuredDistance, setMeasuredDistance] = useState('');
  const [corridorWidth, setCorridorWidth] = useState('2.4');
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
          Notizen ({annotations.length}) / Layout ({layoutPatches.length})
        </button>
      </div>

      <div className="layout-editor">
        <div>
          <strong>Layout live korrigieren</strong>
          <p className="muted">
            {currentWalkCell
              ? `${currentWalkCell.hallKey} · Zelle ${currentWalkCell.ix}/${currentWalkCell.iy} · ${currentWalkCell.blocked ? 'blockiert' : 'begehbar'}`
              : 'Keine Rasterzelle unter der Kamera.'}
          </p>
        </div>
        <div className="layout-editor__actions">
          <button type="button" onClick={onOpenCell} disabled={!currentWalkCell}>
            Durchgang öffnen
          </button>
          <button type="button" onClick={onBlockCell} disabled={!currentWalkCell}>
            Wand/Sperre setzen
          </button>
          <button type="button" onClick={onClearCell} disabled={!currentWalkCell?.patched}>
            Patch zurücknehmen
          </button>
          <button type="button" onClick={() => onCopyAssistantPrompt(noteText)}>
            LLM-Auftrag kopieren
          </button>
        </div>

        <details className="measure-editor">
          <summary>Maßband: Strecke als Durchgang freigeben</summary>
          <p className="muted">
            {measureStart
              ? `Start ${measureStart.hallKey ?? 'im Freien'} · x=${measureStart.x.toFixed(1)} y=${measureStart.y.toFixed(1)}`
              : 'Bei Punkt A starten, dann rueberlaufen und Punkt B bestaetigen.'}
          </p>
          <div className="measure-editor__actions">
            <button type="button" onClick={onSetMeasureStart} disabled={!currentWalkCell}>
              Punkt A setzen
            </button>
            <button type="button" onClick={onClearMeasureStart} disabled={!measureStart}>
              A loeschen
            </button>
          </div>
          <label>
            Echtes Maß A-B in m
            <input value={measuredDistance} inputMode="decimal" onChange={(event) => setMeasuredDistance(event.target.value)} />
          </label>
          <label>
            Freizugebende Breite in m
            <input value={corridorWidth} inputMode="decimal" onChange={(event) => setCorridorWidth(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={!measureStart || !currentWalkCell || Number(measuredDistance) <= 0 || Number(corridorWidth) <= 0}
            onClick={() => onApplyMeasuredCorridor(Number(measuredDistance), Number(corridorWidth))}
          >
            Punkt B bestaetigen und sofort anwenden
          </button>
        </details>

        <details className="layout-assistant">
          <summary>LLM-JSON anwenden</summary>
          <textarea
            value={assistantJson}
            placeholder='{"schema":"beuteltier.layout-assistant.v1","patches":[{"hallKey":"10.1","ix":12,"iy":8,"state":"open"}]}'
            onChange={(event) => setAssistantJson(event.target.value)}
          />
          {assistantError && <p className="layout-assistant__error">{assistantError}</p>}
          <button
            type="button"
            onClick={() => {
              try {
                onApplyAssistantJson(assistantJson);
                setAssistantJson('');
                setAssistantError(null);
              } catch (cause) {
                setAssistantError(cause instanceof Error ? cause.message : 'LLM-JSON konnte nicht gelesen werden.');
              }
            }}
          >
            Vorschlag anwenden
          </button>
        </details>
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
                Notizen kopieren
              </button>
              <button type="button" onClick={onExport}>
                Notizen laden
              </button>
              <button type="button" onClick={onCopyLayout}>
                Layout kopieren
              </button>
              <button type="button" onClick={() => onCopyAssistantPrompt()}>
                LLM-Auftrag
              </button>
              <button type="button" onClick={onExportLayout}>
                Layout laden
              </button>
            </div>
          </div>
          {annotations.length === 0 && <p className="muted">Noch keine Notiz markiert.</p>}
          {layoutPatches.length > 0 && (
            <div className="layout-patches">
              <strong>Aktive Layout-Patches</strong>
              <ul>
                {layoutPatches.map((patch) => (
                  <li key={patch.id}>
                    {patch.hallKey} · {patch.ix}/{patch.iy} · {patch.state === 'open' ? 'geöffnet' : 'blockiert'}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
