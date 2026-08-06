import type { CSSProperties } from 'react';

export const PROCEDURAL_STAGING_NOTICE =
  'Ausstattung und temporäre Aufbauten sind nicht ortsgetreu.';

const rootStyle: CSSProperties = {
  position: 'absolute',
  right: '1rem',
  bottom: '5.4rem',
  zIndex: 4,
  maxWidth: '23rem',
  display: 'grid',
  gap: '0.22rem',
  padding: '0.7rem 0.85rem',
  border: '1px solid rgb(154 207 255 / 36%)',
  borderRadius: '0.65rem',
  background: 'rgb(8 15 26 / 88%)',
  boxShadow: '0 0.75rem 2.25rem rgb(0 0 0 / 35%)',
  color: '#d9e9f7',
  fontSize: '0.78rem',
  lineHeight: 1.35,
  pointerEvents: 'none',
};

const titleStyle: CSSProperties = {
  color: '#72c7ff',
  fontSize: '0.82rem',
  letterSpacing: '0.025em',
};

export function ProceduralStagingNotice({
  visible,
}: {
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div style={rootStyle} role="note">
      <strong style={titleStyle}>Prozedurale Inszenierung</strong>
      <span>{PROCEDURAL_STAGING_NOTICE}</span>
    </div>
  );
}
