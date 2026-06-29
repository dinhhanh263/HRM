import { Router, type Router as RouterType } from 'express';
import { kpiFrameworkController as c } from '../../controllers/kpi-framework.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import {
  upsertFrameworkSchema,
  upsertPillarSchema,
  upsertDefinitionSchema,
  upsertProfileSchema,
  upsertBandSchema,
  setDepartmentsSchema,
} from '../../validators/kpi-framework.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// Tất cả thao tác builder yêu cầu kpi:config.
const guard = asyncHandler(requirePermission('kpi:config'));

// Framework
router.get('/', guard, asyncHandler(c.getAll));
router.get('/:id', guard, asyncHandler(c.getById));
router.get('/:id/validate', guard, asyncHandler(c.validate));
router.post('/', guard, validate(upsertFrameworkSchema), asyncHandler(c.create));
router.patch('/:id', guard, validate(upsertFrameworkSchema), asyncHandler(c.update));
router.delete('/:id', guard, asyncHandler(c.remove));

// Pillars
router.post('/:id/pillars', guard, validate(upsertPillarSchema), asyncHandler(c.addPillar));
router.patch('/:id/pillars/:pillarId', guard, validate(upsertPillarSchema), asyncHandler(c.updatePillar));
router.delete('/:id/pillars/:pillarId', guard, asyncHandler(c.removePillar));

// Definitions (nested under pillar)
router.post('/:id/pillars/:pillarId/definitions', guard, validate(upsertDefinitionSchema), asyncHandler(c.addDefinition));
router.patch('/:id/definitions/:defId', guard, validate(upsertDefinitionSchema), asyncHandler(c.updateDefinition));
router.delete('/:id/definitions/:defId', guard, asyncHandler(c.removeDefinition));

// Weight profiles
router.post('/:id/profiles', guard, validate(upsertProfileSchema), asyncHandler(c.addProfile));
router.patch('/:id/profiles/:profileId', guard, validate(upsertProfileSchema), asyncHandler(c.updateProfile));
router.delete('/:id/profiles/:profileId', guard, asyncHandler(c.removeProfile));

// Rating bands
router.post('/:id/bands', guard, validate(upsertBandSchema), asyncHandler(c.addBand));
router.patch('/:id/bands/:bandId', guard, validate(upsertBandSchema), asyncHandler(c.updateBand));
router.delete('/:id/bands/:bandId', guard, asyncHandler(c.removeBand));

// Department assignment
router.put('/:id/departments', guard, validate(setDepartmentsSchema), asyncHandler(c.setDepartments));

export { router as kpiFrameworkRoutes };
