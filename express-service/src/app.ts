import express from 'express';
import path from 'path';
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

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

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

// Root route - serve UI
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>USPS Address Validation</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fa;padding:20px}h1{text-align:center;color:#1a1a2e;margin-bottom:10px}.subtitle{text-align:center;color:#666;margin-bottom:30px}.container{max-width:800px;margin:0 auto}.card{background:#fff;border-radius:12px;padding:24px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}.card h2{color:#1a1a2e;margin-bottom:16px;font-size:1.2rem}label{display:block;font-weight:500;margin-bottom:4px;color:#333;font-size:.9rem}input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:.95rem;margin-bottom:12px}input:focus{outline:none;border-color:#4a90d9}.row{display:flex;gap:12px}.row>div{flex:1}button{background:#4a90d9;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:1rem;cursor:pointer;width:100%;font-weight:500}button:hover{background:#357abd}.result{margin-top:16px;padding:16px;background:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;display:none}.result.show{display:block}.result pre{white-space:pre-wrap;word-wrap:break-word;font-size:.85rem}.tabs{display:flex;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid #ddd}.tab{flex:1;padding:12px;text-align:center;cursor:pointer;background:#f8f9fa;font-weight:500;font-size:.9rem;border:none}.tab.active{background:#4a90d9;color:#fff}</style>
</head>
<body>
<div class="container">
<h1>USPS Address Validation Service</h1>
<p class="subtitle">Validate US addresses, verify zipcode-city pairs, and parse raw addresses</p>
<div class="tabs">
<button class="tab active" onclick="switchTab('address',this)">Validate Address</button>
<button class="tab" onclick="switchTab('zipcode',this)">Zipcode-City</button>
<button class="tab" onclick="switchTab('parse',this)">Parse Address</button>
</div>
<div id="tab-address" class="tab-content">
<div class="card"><h2>POST /api/v1/validate/address</h2>
<label>Street Line 1 *</label><input type="text" id="street1" value="1600 Pennsylvania Ave NW">
<label>Street Line 2</label><input type="text" id="street2" placeholder="Optional">
<div class="row"><div><label>City *</label><input type="text" id="city" value="Washington"></div>
<div><label>State *</label><input type="text" id="state" value="DC"></div>
<div><label>Zipcode *</label><input type="text" id="zipcode" value="20500"></div></div>
<button onclick="validateAddress()">Validate Address</button>
<div id="r1" class="result"></div></div></div>
<div id="tab-zipcode" class="tab-content" style="display:none">
<div class="card"><h2>POST /api/v1/validate/zipcode-city</h2>
<div class="row"><div><label>Zipcode *</label><input type="text" id="zip-in" value="20500"></div>
<div><label>City *</label><input type="text" id="city-in" value="Washington"></div></div>
<button onclick="verifyZip()">Verify Zipcode-City</button>
<div id="r2" class="result"></div></div></div>
<div id="tab-parse" class="tab-content" style="display:none">
<div class="card"><h2>POST /api/v1/validate/parse</h2>
<label>Raw Address *</label><input type="text" id="raw" value="1600 Pennsylvania Ave NW, Washington, DC 20500">
<button onclick="parseAddr()">Parse & Validate</button>
<div id="r3" class="result"></div></div></div>
<div class="card" style="text-align:center;color:#666;font-size:.85rem">
<p>Using mock USPS adapter. Addresses with "INVALID" in street return invalid status.</p>
<p style="margin-top:8px">GitHub: <a href="https://github.com/Bindupriyav/address-lookup">bindupriyav/address-lookup</a></p></div>
</div>
<script>
function switchTab(t,el){document.querySelectorAll('.tab-content').forEach(e=>e.style.display='none');document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));document.getElementById('tab-'+t).style.display='block';el.classList.add('active')}
function show(id,d){const e=document.getElementById(id);e.classList.add('show');e.innerHTML='<pre>'+JSON.stringify(d,null,2)+'</pre>'}
async function validateAddress(){const r=await fetch('/api/v1/validate/address',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({street_line_1:document.getElementById('street1').value,street_line_2:document.getElementById('street2').value||undefined,city:document.getElementById('city').value,state:document.getElementById('state').value,zipcode:document.getElementById('zipcode').value})});show('r1',await r.json())}
async function verifyZip(){const r=await fetch('/api/v1/validate/zipcode-city',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({zipcode:document.getElementById('zip-in').value,city:document.getElementById('city-in').value})});show('r2',await r.json())}
async function parseAddr(){const r=await fetch('/api/v1/validate/parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw_address:document.getElementById('raw').value})});show('r3',await r.json())}
</script>
</body></html>`);
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
