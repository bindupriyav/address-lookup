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
<title>Address Validation Service</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;padding:20px}
h1{text-align:center;color:#fff;margin-bottom:8px;font-size:1.8rem}
.subtitle{text-align:center;color:rgba(255,255,255,0.85);margin-bottom:30px;font-size:0.95rem}
.container{max-width:800px;margin:0 auto}
.card{background:#fff;border-radius:16px;padding:28px;margin-bottom:20px;box-shadow:0 10px 40px rgba(0,0,0,0.15);transition:transform 0.2s}
.card:hover{transform:translateY(-2px)}
.card h2{color:#333;margin-bottom:16px;font-size:1.1rem;font-weight:600}
label{display:block;font-weight:500;margin-bottom:6px;color:#555;font-size:.85rem;text-transform:uppercase;letter-spacing:0.5px}
input,select{width:100%;padding:12px 14px;border:2px solid #e8e8e8;border-radius:10px;font-size:.95rem;margin-bottom:14px;transition:border-color 0.3s}
input:focus,select:focus{outline:none;border-color:#667eea;box-shadow:0 0 0 3px rgba(102,126,234,0.15)}
.row{display:flex;gap:12px}
.row>div{flex:1}
button.submit-btn{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;padding:14px 24px;border-radius:10px;font-size:1rem;cursor:pointer;width:100%;font-weight:600;transition:opacity 0.3s,transform 0.2s}
button.submit-btn:hover{opacity:0.9;transform:translateY(-1px)}
button.submit-btn:active{transform:translateY(0)}
.result{margin-top:16px;padding:16px;background:#f0f4ff;border-radius:10px;border:2px solid #e0e7ff;display:none;animation:fadeIn 0.3s}
.result.show{display:block}
.result pre{white-space:pre-wrap;word-wrap:break-word;font-size:.85rem;color:#333}
.result.valid{border-color:#10b981;background:#ecfdf5}
.result.invalid{border-color:#ef4444;background:#fef2f2}
.result.error{border-color:#f59e0b;background:#fffbeb}
.tabs{display:flex;margin-bottom:24px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,0.2);backdrop-filter:blur(10px);padding:4px}
.tab{flex:1;padding:12px;text-align:center;cursor:pointer;background:transparent;font-weight:500;font-size:.9rem;border:none;color:rgba(255,255,255,0.8);border-radius:8px;transition:all 0.3s}
.tab.active{background:#fff;color:#667eea;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.tab:hover:not(.active){background:rgba(255,255,255,0.15)}
.footer{text-align:center;color:rgba(255,255,255,0.7);font-size:.8rem;margin-top:20px}
.footer a{color:rgba(255,255,255,0.9)}
@keyframes fadeIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>
<div class="container">
<h1>Address Validation Service</h1>
<p class="subtitle">Validate addresses, verify zipcode-city pairs, and parse raw addresses</p>
<div class="tabs">
<button class="tab active" onclick="switchTab('address',this)">Validate Address</button>
<button class="tab" onclick="switchTab('zipcode',this)">Zipcode-City</button>
<button class="tab" onclick="switchTab('parse',this)">Parse Address</button>
</div>
<div id="tab-address" class="tab-content">
<div class="card"><h2>Validate a Structured Address</h2>
<label>Street Line 1</label><input type="text" id="street1" value="1600 Pennsylvania Ave NW" placeholder="Enter street address">
<label>Street Line 2</label><input type="text" id="street2" placeholder="Apt, Suite, Unit (optional)">
<div class="row"><div><label>City</label><input type="text" id="city" value="Washington" placeholder="City"></div>
<div><label>State</label><select id="state"><option value="">Select</option><option value="AL">AL</option><option value="AK">AK</option><option value="AZ">AZ</option><option value="AR">AR</option><option value="CA">CA</option><option value="CO">CO</option><option value="CT">CT</option><option value="DE">DE</option><option value="DC" selected>DC</option><option value="FL">FL</option><option value="GA">GA</option><option value="HI">HI</option><option value="ID">ID</option><option value="IL">IL</option><option value="IN">IN</option><option value="IA">IA</option><option value="KS">KS</option><option value="KY">KY</option><option value="LA">LA</option><option value="ME">ME</option><option value="MD">MD</option><option value="MA">MA</option><option value="MI">MI</option><option value="MN">MN</option><option value="MS">MS</option><option value="MO">MO</option><option value="MT">MT</option><option value="NE">NE</option><option value="NV">NV</option><option value="NH">NH</option><option value="NJ">NJ</option><option value="NM">NM</option><option value="NY">NY</option><option value="NC">NC</option><option value="ND">ND</option><option value="OH">OH</option><option value="OK">OK</option><option value="OR">OR</option><option value="PA">PA</option><option value="RI">RI</option><option value="SC">SC</option><option value="SD">SD</option><option value="TN">TN</option><option value="TX">TX</option><option value="UT">UT</option><option value="VT">VT</option><option value="VA">VA</option><option value="WA">WA</option><option value="WV">WV</option><option value="WI">WI</option><option value="WY">WY</option></select></div>
<div><label>Zipcode</label><input type="text" id="zipcode" value="20500" placeholder="5-digit zip"></div></div>
<button class="submit-btn" onclick="validateAddress()">Validate Address</button>
<div id="r1" class="result"></div></div></div>
<div id="tab-zipcode" class="tab-content" style="display:none">
<div class="card"><h2>Verify Zipcode-City Match</h2>
<div class="row"><div><label>Zipcode</label><input type="text" id="zip-in" value="20500" placeholder="5-digit zip"></div>
<div><label>City</label><input type="text" id="city-in" value="Washington" placeholder="City name"></div></div>
<button class="submit-btn" onclick="verifyZip()">Verify Match</button>
<div id="r2" class="result"></div></div></div>
<div id="tab-parse" class="tab-content" style="display:none">
<div class="card"><h2>Parse Raw Address Text</h2>
<label>Raw Address</label><input type="text" id="raw" value="1600 Pennsylvania Ave NW, Washington, DC 20500" placeholder="Enter any format address text">
<button class="submit-btn" onclick="parseAddr()">Parse & Validate</button>
<div id="r3" class="result"></div></div></div>
<div class="footer"><p>GitHub: <a href="https://github.com/Bindupriyav/address-lookup">bindupriyav/address-lookup</a></p></div>
</div>
<script>
function switchTab(t,el){document.querySelectorAll('.tab-content').forEach(e=>e.style.display='none');document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));document.getElementById('tab-'+t).style.display='block';el.classList.add('active')}
function show(id,d){const e=document.getElementById(id);e.className='result show';if(d.status==='valid'||d.status==='match')e.classList.add('valid');else if(d.status==='invalid'||d.status==='mismatch')e.classList.add('invalid');else e.classList.add('error');e.innerHTML='<pre>'+JSON.stringify(d,null,2)+'</pre>'}
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
