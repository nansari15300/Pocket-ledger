/**
 * Voucher Settings `Switch` + header File preview — shared knob keyframes (tailwind `file-hover-switch-*`).
 */

export const SWITCH_ANIM_MS = 400;

export const SWITCH_KNOB_W_PX = Math.round(54 * 0.8 * 0.75);
export const SWITCH_KNOB_PAD_PX = 3;
export const SWITCH_TRACK_H_PX = Math.round(36 * 0.7 * 0.75);
/** Header file-preview 3-step switch — +1px taaki andar i icon bina nudge ke center ho */
export const HEADER_FILE_PREVIEW_SWITCH_TRACK_H_PX = SWITCH_TRACK_H_PX + 1;

export const SWITCH_KNOB_LEFT_OFF = `${SWITCH_KNOB_PAD_PX}px`;
export const SWITCH_KNOB_LEFT_MID = `calc(50% - ${SWITCH_KNOB_W_PX / 2}px)`;
export const SWITCH_KNOB_LEFT_ON = `calc(100% - ${SWITCH_KNOB_W_PX + SWITCH_KNOB_PAD_PX}px)`;

/** Tailwind `animate-*` suffix — binary + 3-step header transitions */
export type SwitchKnobMotion =
  | "file-hover-switch-on"
  | "file-hover-switch-off"
  | "file-hover-switch-to-hover"
  | "file-hover-switch-to-click"
  | "file-hover-switch-to-hover-from-end"
  | "file-hover-switch-to-off-from-mid";

/** Tailwind scan ke liye poora class name — dynamic `animate-${}` production purge se bachao */
export const SWITCH_KNOB_MOTION_CLASS: Record<SwitchKnobMotion, string> = {
  "file-hover-switch-on": "animate-file-hover-switch-on",
  "file-hover-switch-off": "animate-file-hover-switch-off",
  "file-hover-switch-to-hover": "animate-file-hover-switch-to-hover",
  "file-hover-switch-to-click": "animate-file-hover-switch-to-click",
  "file-hover-switch-to-hover-from-end": "animate-file-hover-switch-to-hover-from-end",
  "file-hover-switch-to-off-from-mid": "animate-file-hover-switch-to-off-from-mid",
};

export function switchKnobMotionClass(motion: SwitchKnobMotion | null): string | undefined {
  return motion ? SWITCH_KNOB_MOTION_CLASS[motion] : undefined;
}

/** Header File preview: mode index 0=off, 1=hover, 2=click — voucher Switch jaisa keyframe */
export function filePreviewModeTransitionMotion(
  fromIdx: number,
  toIdx: number
): SwitchKnobMotion | null {
  if (fromIdx === toIdx) return null;
  if (fromIdx === 0 && toIdx === 2) return "file-hover-switch-on";
  if (fromIdx === 2 && toIdx === 0) return "file-hover-switch-off";
  if (fromIdx === 0 && toIdx === 1) return "file-hover-switch-to-hover";
  if (fromIdx === 1 && toIdx === 2) return "file-hover-switch-to-click";
  if (fromIdx === 2 && toIdx === 1) return "file-hover-switch-to-hover-from-end";
  if (fromIdx === 1 && toIdx === 0) return "file-hover-switch-to-off-from-mid";
  return toIdx > fromIdx ? "file-hover-switch-on" : "file-hover-switch-off";
}
