import { fail } from '../utils/apiResponse.js';
import { planLimitsService } from '../services/planLimits.service.js';

export function requirePlanFeature(featureKey) {
  return async (req, res, next) => {
    try {
      const workspaceId = req.workspaceId || req.params?.workspaceId;
      if (!workspaceId) {
        return res.status(400).json(fail('workspaceId is required', 'VALIDATION_ERROR'));
      }
      const result = await planLimitsService.ensureFeatureAllowed(workspaceId, featureKey);
      if (!result.allowed) {
        return res.status(403).json(fail(result.message, result.code, result.details));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
