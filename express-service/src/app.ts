import express from 'express';
import multer from 'multer';
import { config } from './config';
import { getUspsAdapter } from './adapters/uspsAdapter';
import { AddressValidator } from './services/addressValidator';
import { BulkProcessor } from './services/bulkProcessor';
import { LLMParser } from './parsers/llmParser';
import { createZipcodeRouter } from './routes/zipcode';
import { createParseRouter } from './routes/parse';
import { createAddressRouter } from './routes/address';
import { createBulkRouter } from './routes/bulk';

// Initialize Express app
const app = express();

// Middleware: JSON body parsing
app.use(express.json());

// Middleware: Multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Wire up dependencies
const uspsAdapter = getUspsAdapter();
const addressValidator = new AddressValidator(uspsAdapter);
const bulkProcessor = new BulkProcessor(addressValidator);
const llmParser = new LLMParser();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// API routers for /api/v1 routes
const apiRouter = express.Router();

// POST /api/v1/validate/address - Single address validation (implemented)
const addressRouter = createAddressRouter(addressValidator);
apiRouter.use(addressRouter);

// POST /api/v1/validate/zipcode-city - Zipcode-city verification (delegated to zipcodeRouter)


// POST /api/v1/validate/parse - LLM address parsing (registered via createParseRouter)

// POST /api/v1/validate/bulk - Bulk Excel file upload (implemented)

// Register API routes with /api/v1 prefix
app.use('/api/v1', apiRouter);
app.use('/api/v1', createZipcodeRouter(addressValidator));
app.use('/api/v1', createParseRouter(addressValidator, llmParser));
app.use('/api/v1', createBulkRouter(bulkProcessor, upload));

// Export app for testing
export { app, addressValidator, bulkProcessor, llmParser, upload };

// Start server when run directly
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Express service listening on port ${config.port}`);
  });
}
