import cors from 'cors';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import v1Routes from './routes/v1.routes.js';
import legacyRoutes from './routes/index.js';
import { notFound } from './controllers/system.controller.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { sanitize, payloadLimit } from './middlewares/sanitize.js';
import { requestId } from './middlewares/requestId.js';

export function createApp() {
  const app = express();
  const clientOrigin = process.env.CLIENT_ORIGIN || '*';

  app.use(
    cors({
      origin: clientOrigin === '*' ? true : clientOrigin,
      credentials: true,
    }),
  );
  app.use(requestId);
  app.set('etag', 'strong');
  app.use(compression());
  app.use(express.json());
  app.use(cookieParser());
  app.use(payloadLimit);
  app.use(sanitize);

  app.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        message: 'SaleVision backend is running',
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use('/api/v1', v1Routes);
  app.use('/api', legacyRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
