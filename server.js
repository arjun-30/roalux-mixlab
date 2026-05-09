const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize Database
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// API Endpoints - Items
app.get('/api/items', async (req, res) => {
    console.log('GET /api/items');
    const { data, error } = await supabase.from('items').select('*');
    if (error) {
        console.error('Supabase Error (GET items):', error);
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
});

app.post('/api/items', async (req, res) => {
    console.log('POST /api/items', req.body);
    const { name, unit, price, cat, code } = req.body;
    const { data: existing, error: checkErr } = await supabase
        .from('items')
        .select('id')
        .ilike('name', name);

    if (checkErr) {
        console.error('Check Error:', checkErr);
        return res.status(500).json({ error: 'Database check failed' });
    }

    if (existing && existing.length > 0) {
        return res.status(400).json({ error: `Material "${name}" already exists.` });
    }

    const { data, error } = await supabase
        .from('items')
        .insert([{ name, unit, price, cat, code }])
        .select();
    if (error) {
        console.error('Supabase Error (POST items):', error);
        return res.status(500).json({ error: error.message });
    }
    res.json({ id: data[0].id });
});

app.delete('/api/items/:id', async (req, res) => {
    console.log('DELETE /api/items', req.params.id);
    const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', req.params.id);
    if (error) {
        console.error('Supabase Error (DELETE items):', error);
        return res.status(500).json({ error: error.message });
    }
    res.json({ deleted: 1 });
});

// API Endpoints - Products
app.get('/api/products', async (req, res) => {
    console.log('GET /api/products');
    const { data, error } = await supabase.from('products').select('*');
    if (error) {
        console.error('Supabase Error (GET products):', error);
        return res.status(500).json({ error: error.message });
    }
    // Parse stages JSON string back to object
    const products = data.map(p => ({ ...p, stages: JSON.parse(p.stages || '[]') }));
    res.json(products);
});

app.post('/api/products', async (req, res) => {
    console.log('POST /api/products', req.body.name);
    const { name, batch, desc, density, group_code, color, stages } = req.body;
    const stagesStr = JSON.stringify(stages || []);
    // Check for duplicates (case-insensitive)
    const { data: existing, error: checkErr } = await supabase
        .from('products')
        .select('id')
        .ilike('name', name);

    if (checkErr) {
        console.error('Check Error:', checkErr);
        return res.status(500).json({ error: 'Database check failed' });
    }

    if (existing && existing.length > 0) {
        return res.status(400).json({ error: `Product "${name}" already exists.` });
    }

    const { data, error } = await supabase
        .from('products')
        .insert([{ name, batch, desc, density, group_code, color, stages: stagesStr }])
        .select();
    if (error) {
        console.error('Supabase Error (POST products):', error);
        return res.status(500).json({ error: error.message });
    }
    res.json({ id: data[0].id });
});

app.put('/api/products/:id', async (req, res) => {
    console.log('PUT /api/products', req.params.id);
    const { name, batch, desc, density, group_code, color, stages } = req.body;
    const stagesStr = JSON.stringify(stages || []);
    const { error } = await supabase
        .from('products')
        .update({ name, batch, desc, density, group_code, color, stages: stagesStr })
        .eq('id', req.params.id);
    if (error) {
        console.error('Supabase Error (PUT products):', error);
        return res.status(500).json({ error: error.message });
    }
    res.json({ updated: 1 });
});

app.delete('/api/products/:id', async (req, res) => {
    console.log('DELETE /api/products', req.params.id);
    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', req.params.id);
    if (error) {
        console.error('Supabase Error (DELETE products):', error);
        return res.status(500).json({ error: error.message });
    }
    res.json({ deleted: 1 });
});

// API Endpoints - Stocks
app.get('/api/stocks', async (req, res) => {
    console.log('GET /api/stocks');
    try {
        const [stocksRes, batchesRes] = await Promise.all([
            supabase.from('stocks').select('*'),
            supabase.from('stock_batches').select('*').gt('qty', 0)
        ]);

        if (stocksRes.error) throw stocksRes.error;
        if (batchesRes.error) throw batchesRes.error;

        const stockMap = {};
        stocksRes.data.forEach(s => {
            s.batches = batchesRes.data
                .filter(b => b.itemId === s.itemId)
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            stockMap[s.itemId] = s;
        });
        res.json(stockMap);
    } catch (error) {
        console.error('Supabase Error (GET stocks):', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stocks', async (req, res) => {
    console.log('POST /api/stocks', req.body);
    const { itemId, qty, avgPrice, threshold } = req.body;
    const { data, error } = await supabase
        .from('stocks')
        .upsert({ itemId, qty, avgPrice, threshold })
        .select();
    if (error) {
        console.error('Supabase Error (POST stocks):', error);
        return res.status(500).json({ error: error.message });
    }
    res.json(data[0]);
});

app.post('/api/stocks/consume', async (req, res) => {
    console.log('POST /api/stocks/consume', req.body);
    const { items: consumeItems } = req.body; // Array of { itemId, qty }
    
    try {
        const results = [];
        for (const item of consumeItems) {
            const { itemId, qty } = item;
            
            // Try to use FIFO RPC function
            const { data: cost, error: rpcError } = await supabase.rpc('consume_stock_fifo', {
                p_item_id: itemId,
                p_qty_to_deduct: qty
            });

            if (rpcError) {
                console.warn(`RPC FIFO failed for item ${itemId}, falling back to basic deduction:`, rpcError.message);
                // Fallback: Simple deduction from main stocks table (no batch tracking)
                const { data: current, error: fetchErr } = await supabase.from('stocks').select('qty, avgPrice, threshold').eq('itemId', itemId).maybeSingle();
                if (!fetchErr && current) {
                    await supabase.from('stocks').update({ qty: Math.max(0, current.qty - qty) }).eq('itemId', itemId);
                }
                results.push({ itemId, qty, fallback: true });
            } else {
                results.push({ itemId, qty, cost });
            }
        }
        res.json({ success: true, results });
    } catch (error) {
        console.error('Supabase Error (POST stocks/consume):', error);
        res.status(500).json({ error: error.message });
    }
});

// API Endpoints - Production History
app.get('/api/batches', async (req, res) => {
    console.log('GET /api/batches');
    const { data, error } = await supabase
        .from('production_history')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Supabase Error (GET batches):', error);
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
});

app.get('/api/reports/daily', async (req, res) => {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    
    // Set range for the full day in local time
    const start = new Date(dateStr + "T00:00:00");
    const end = new Date(dateStr + "T23:59:59");

    try {
        const [prodRes, purchRes] = await Promise.all([
            supabase.from('production_history').select('*').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
            supabase.from('stock_batches').select('*, items(name, unit)').gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
        ]);

        if (prodRes.error) throw prodRes.error;
        if (purchRes.error) throw purchRes.error;

        // Calculate aggregated RM Usage
        const rmUsage = {};
        prodRes.data.forEach(batch => {
            let stages = [];
            try { stages = typeof batch.stages_data === 'string' ? JSON.parse(batch.stages_data) : (batch.stages_data || []); } catch(e) {}
            stages.forEach(stage => {
                stage.items.forEach(item => {
                    const key = item.name;
                    if (!rmUsage[key]) rmUsage[key] = { qty: 0, unit: item.unit };
                    rmUsage[key].qty += parseFloat(item.qty || 0);
                });
            });
        });

        res.json({
            productions: prodRes.data,
            purchases: purchRes.data,
            rmUsage: Object.entries(rmUsage).map(([name, data]) => ({ name, ...data }))
        });
    } catch (error) {
        console.error('Report Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/batches/next-number', async (req, res) => {
    const { product_id } = req.query;
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: todayBatches, error: countError } = await supabase
            .from('production_history')
            .select('id')
            .gte('created_at', startOfDay.toISOString());

        if (countError) throw countError;

        const nextNum = (todayBatches ? todayBatches.length : 0) + 1;
        const day = new Date().getDate();
        
        // Return ONLY numbers as requested: [NextNum][Day] or just [NextNum]
        // But keep it consistent with the POST logic if possible, 
        // OR follow "only be numbers" strictly.
        // User said: "batch number shd only be numbers no prefix"
        const batch_number = `${String(nextNum).padStart(2, '0')}${String(day).padStart(2, '0')}`;
        res.json({ batch_number });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/batches', async (req, res) => {
    console.log('POST /api/batches');
    const { product_id, product_name, quantity, stages_data } = req.body;

    try {
        // Calculate Batch Number: [Counter][Day]
        // Reset counter daily: count batches created today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Using a more robust count query
        const { data: todayBatches, error: countError } = await supabase
            .from('production_history')
            .select('id')
            .gte('created_at', startOfDay.toISOString());

        if (countError) throw countError;

        const nextNum = (todayBatches ? todayBatches.length : 0) + 1;
        const day = new Date().getDate();
        const batch_number = `${String(nextNum).padStart(2, '0')}${String(day).padStart(2, '0')}`;

        const { data, error } = await supabase
            .from('production_history')
            .insert([{
                product_id,
                product_name,
                quantity,
                batch_number,
                stages_data: JSON.stringify(stages_data),
                // We'll try to save group_code if the column exists, 
                // but since we haven't confirmed schema change, we'll skip for now 
                // and just rely on the batch_number containing it.
            }])
            .select();

        if (error) throw error;
        console.log('Batch Created:', data[0]);
        res.json(data[0]);
    } catch (error) {
        console.error('Supabase Error (POST batches):', error);
        res.status(500).json({ error: error.message });
    }
});

// API Endpoints - Consume Stock
app.post('/api/stocks/consume', async (req, res) => {
    const { productId, qty, ingredients } = req.body;
    if (!productId || !qty || !ingredients || !ingredients.length) {
        return res.status(400).json({ error: 'Missing required data' });
    }
    
    try {
        // We need to fetch current stocks to reduce them
        const { data: stocks, error: stockFetchError } = await supabase
            .from('stocks')
            .select('*');
            
        if (stockFetchError) throw stockFetchError;
        
        // Prepare updates
        for (const ing of ingredients) {
            const currentStock = stocks.find(s => s.itemId == ing.itemId);
            if (!currentStock) throw new Error(`Stock not found for item ${ing.itemId}`);
            
            const newQty = Math.max(0, parseFloat(currentStock.qty) - parseFloat(ing.needed));
            
            const { error: updError } = await supabase
                .from('stocks')
                .update({ qty: newQty })
                .eq('itemId', ing.itemId);
                
            if (updError) throw updError;
        }
        
        // Optionally, log this production event (re-use /api/batches logic if needed, but client calls POST /api/batches explicitly)
        // Note: Client calls /api/batches first, then /api/stocks/consume.
        
        res.json({ success: true });
    } catch (error) {
        console.error('Consume Stock Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API Endpoints - Purchases
app.get('/api/purchases', async (req, res) => {
    const { data, error } = await supabase
        .from('stock_batches')
        .select(`
            *,
            items (name, unit, code)
        `)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/purchases', async (req, res) => {
    const payload = req.body;
    const purchases = Array.isArray(payload) ? payload : [payload];
    if (!purchases.length) return res.status(400).json({ error: 'No items provided' });

    try {
        const results = [];
        for (const p of purchases) {
            const { itemId, qty, price, vendor } = p;
            console.log(`Processing purchase for Item ${itemId}: Qty ${qty}, Price ${price}`);
            if (!itemId || !qty || isNaN(qty) || isNaN(price)) {
                console.log('Skipping invalid item:', p);
                continue;
            }

            // 1. Add batch
            const { data: batch, error: batchError } = await supabase
                .from('stock_batches')
                .insert([{ "itemId": itemId, qty, price, vendor }])
                .select();
            if (batchError) {
                console.error('Batch Insert Error:', batchError);
                throw batchError;
            }

            // 2. Update summary stock
            const { data: currentStock, error: stockFetchError } = await supabase
                .from('stocks')
                .select('*')
                .eq('itemId', itemId)
                .single();
            
            if (stockFetchError && stockFetchError.code !== 'PGRST116') {
                console.error('Stock Fetch Error:', stockFetchError);
                throw stockFetchError;
            }

            if (currentStock) {
                console.log(`Updating existing stock for item ${itemId}. Current Qty: ${currentStock.qty}`);
                const newQty = parseFloat(currentStock.qty) + parseFloat(qty);
                const oldVal = parseFloat(currentStock.qty) * parseFloat(currentStock.avgPrice || 0);
                const newVal = parseFloat(qty) * parseFloat(price);
                const newAvg = (oldVal + newVal) / newQty;
                const { error: updError } = await supabase.from('stocks').update({ qty: newQty, "avgPrice": newAvg }).eq('itemId', itemId);
                if (updError) console.error('Stock Update Error:', updError);
            } else {
                console.log(`Inserting new stock entry for item ${itemId}`);
                const { error: insError } = await supabase.from('stocks').insert([{ "itemId": itemId, qty, "avgPrice": price }]);
                if (insError) console.error('Stock Insert Error:', insError);
            }
            results.push(batch[0]);
        }
        res.json({ success: true, results });
    } catch (error) {
        console.error('Purchase Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API Endpoints - Debug/Stats
app.get('/api/debug/stats', async (req, res) => {
    try {
        const { count: itemCount, error: itemError } = await supabase
            .from('items')
            .select('*', { count: 'exact', head: true });
        
        const { count: productCount, error: productError } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true });

        if (itemError || productError) {
            return res.status(500).json({ error: itemError || productError });
        }

        res.json({
            status: 'connected',
            database: 'supabase',
            counts: {
                items: itemCount,
                products: productCount
            },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback for SPA routing - using app.use to catch all remaining routes
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
