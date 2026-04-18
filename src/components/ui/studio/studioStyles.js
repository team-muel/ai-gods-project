export const basePanelStyle = {
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(8, 15, 33, 0.78)',
  padding: '16px',
}

export const sectionLabelStyle = {
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '9px',
  color: '#bff8ff',
  letterSpacing: '0.14em',
  marginBottom: '8px',
}

export const fieldLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '9px',
  color: 'rgba(191, 248, 255, 0.78)',
  letterSpacing: '0.12em',
}

export const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: '12px',
  color: '#ffffff',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

export const bodyTextStyle = {
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '13px',
  color: 'rgba(226, 232, 240, 0.76)',
  lineHeight: 1.45,
}

export const helperTextStyle = {
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '12px',
  color: 'rgba(226, 232, 240, 0.66)',
  lineHeight: 1.45,
}

export const buildModeCardStyle = (active, accent = '#67e8f9') => ({
  textAlign: 'left',
  padding: '16px',
  borderRadius: '16px',
  border: `1px solid ${active ? accent : 'rgba(148, 163, 184, 0.18)'}`,
  background: active
    ? `linear-gradient(180deg, ${accent}22 0%, rgba(15, 23, 42, 0.86) 100%)`
    : 'linear-gradient(180deg, rgba(15, 23, 42, 0.78) 0%, rgba(2, 6, 23, 0.9) 100%)',
  cursor: 'pointer',
  minHeight: '142px',
  boxShadow: active ? `0 0 28px ${accent}22` : 'none',
})

export const buildPrimaryButtonStyle = (disabled = false, palette = 'cyan') => {
  const themes = {
    cyan: 'linear-gradient(135deg, #0f5fcc 0%, #22d3ee 100%)',
    green: 'linear-gradient(135deg, #0f766e 0%, #22c55e 100%)',
    amber: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
  }

  return {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid rgba(125, 211, 252, 0.2)',
    background: disabled ? 'rgba(51, 65, 85, 0.46)' : themes[palette],
    color: disabled ? 'rgba(226, 232, 240, 0.46)' : '#eff6ff',
    fontSize: '12px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

export const secondaryButtonStyle = (disabled = false) => ({
  width: '100%',
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: disabled ? 'rgba(30, 41, 59, 0.5)' : 'rgba(15, 23, 42, 0.72)',
  color: disabled ? 'rgba(148, 163, 184, 0.5)' : '#dbeafe',
  fontSize: '11px',
  cursor: disabled ? 'not-allowed' : 'pointer',
})

export const buildChipStyle = (active, palette = 'rgba(125, 211, 252, 0.38)') => ({
  padding: '8px 11px',
  borderRadius: '999px',
  border: `1px solid ${active ? palette : 'rgba(148, 163, 184, 0.18)'}`,
  background: active ? `${palette.replace('0.38', '0.18')}` : 'rgba(15, 23, 42, 0.74)',
  color: active ? '#ecfeff' : 'rgba(226, 232, 240, 0.78)',
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '9px',
  letterSpacing: '0.08em',
  cursor: 'pointer',
})

export const lightSectionStyle = {
  borderRadius: '16px',
  border: '1px solid rgba(191, 219, 254, 0.9)',
  background: '#ffffff',
  padding: '16px',
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
}

export const lightFieldLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '13px',
  fontWeight: 700,
  color: '#334155',
}

export const lightInputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#ffffff',
  border: '1px solid rgba(191, 219, 254, 0.9)',
  borderRadius: '12px',
  color: '#0f172a',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}