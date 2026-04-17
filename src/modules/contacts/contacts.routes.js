import { createCrudRoutes } from '../createCrudRoutes.js';
import { contactsController } from './contacts.controller.js';

export const contactsRoutes = createCrudRoutes(contactsController);
