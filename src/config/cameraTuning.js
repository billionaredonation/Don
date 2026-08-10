/*
 * MN camera tuning
 *
 * Keep camera feel in one place so street/interior zoom can be adjusted
 * without touching movement, collision or UI code.
 */

export const CAMERA_TUNING = Object.freeze({
  street: Object.freeze({
    desktopScale: 1.88,
    mobileScale: 1.86,
    lowPowerMobileScale: 1.82,
  }),

  interior: Object.freeze({
    desktopScale: 1.34,
    mobileScale: 1.42,
    lowPowerMobileScale: 1.34,
    desktopFollowLerp: 0.28,
    mobileFollowLerp: 0.24,
  }),
});

export function getStreetCameraStartScale({ mobile = false, lowPower = false } = {}) {
  if (mobile && lowPower) return CAMERA_TUNING.street.lowPowerMobileScale;
  return mobile ? CAMERA_TUNING.street.mobileScale : CAMERA_TUNING.street.desktopScale;
}

export function getInteriorCameraProfile({ mobile = false, lowPower = false } = {}) {
  return {
    scale: mobile && lowPower
      ? CAMERA_TUNING.interior.lowPowerMobileScale
      : mobile
        ? CAMERA_TUNING.interior.mobileScale
        : CAMERA_TUNING.interior.desktopScale,
    followLerp: mobile
      ? CAMERA_TUNING.interior.mobileFollowLerp
      : CAMERA_TUNING.interior.desktopFollowLerp,
  };
}
