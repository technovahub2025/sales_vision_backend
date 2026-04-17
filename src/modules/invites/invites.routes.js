import { Router } from 'express';
import { invitesController } from './invites.controller.js';
import { validateRequest } from '../../middlewares/validation.js';
import { createInviteSchema, listInvitesSchema } from './invites.schemas.js';

const router = Router({ mergeParams: true });

router.get('/', validateRequest(listInvitesSchema), invitesController.list);
router.post('/', validateRequest(createInviteSchema), invitesController.create);
router.delete('/:inviteId', invitesController.revoke);

export const invitesRoutes = router;
