import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: config.corsOrigin.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
  next();
});

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`API gateway listening on http://localhost:${config.port}`);
  console.log(`ML service: ${config.mlServiceUrl}`);
});
