import { Router } from 'express';
import { searchController } from './search.controller.js';

export const searchRoutes = Router({ mergeParams: true });

searchRoutes.get('/', searchController.search);
