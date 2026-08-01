import { doctorTreatmentAction } from '../hospital/doctorTreatmentAction.js';
import {
  invalidateProfessionalPlayerActions,
  loadAvailableProfessionalPlayerActions,
  registerProfessionalPlayerAction,
} from './professionalActionRegistry.js';

// This is the only catalogue of profession-specific player actions.
// Future factions register their own modules here without changing the
// money-transfer or trade implementations in playerInteractionFeature.js.
[doctorTreatmentAction].forEach(registerProfessionalPlayerAction);

export {
  invalidateProfessionalPlayerActions,
  loadAvailableProfessionalPlayerActions,
};
