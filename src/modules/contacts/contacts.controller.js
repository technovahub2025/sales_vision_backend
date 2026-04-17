import { createCrudController } from '../createCrudController.js';
import { contactsService } from './contacts.service.js';

export const contactsController = createCrudController(contactsService);
