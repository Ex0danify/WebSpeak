/** A playback gain as decibels for the volume bubble: "0 dB", "+3.5 dB", "-6.0 dB", and "-∞ dB" for silence. */
export function formatVolumeDb(percent: number): string {
  if (percent <= 0) return "-∞ dB";
  const db = Math.round(20 * Math.log10(percent / 100) * 10) / 10;
  if (db === 0) return "0 dB";
  return `${db > 0 ? "+" : "-"}${Math.abs(db).toFixed(1)} dB`;
}
