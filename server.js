const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1); // trust first proxy

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'roalux_mixlab_super_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Authentication Endpoints
app.post('/api/login', (req, res) => {
    const { role, password } = req.body;
    if (role === 'manager' && password === process.env.MANAGER_PASSWORD) {
        req.session.role = 'manager';
        res.json({ success: true, role: 'manager' });
    } else if (role === 'admin' && password === process.env.ADMIN_PASSWORD) {
        req.session.role = 'admin';
        res.json({ success: true, role: 'admin' });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Protect all following API routes
function requireAuth(req, res, next) {
    if (req.session && req.session.role) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
}
app.use('/api', requireAuth);

// Initialize Database
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDb() {
    try {
        const connection = await pool.getConnection();
        console.log('Database connected successfully.');
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS items (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                unit VARCHAR(50) NOT NULL,
                price DOUBLE DEFAULT 0,
                cat VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                batch DOUBLE DEFAULT 0,
                \`desc\` TEXT,
                density DOUBLE DEFAULT 0,
                group_code VARCHAR(255),
                color VARCHAR(255),
                stages TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS stocks (
                itemId BIGINT PRIMARY KEY,
                qty DOUBLE DEFAULT 0,
                avgPrice DOUBLE DEFAULT 0,
                threshold DOUBLE DEFAULT 0
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS production_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                product_id BIGINT,
                product_name VARCHAR(255) NOT NULL,
                quantity DOUBLE NOT NULL,
                batch_number VARCHAR(255) NOT NULL,
                stages_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS stock_batches (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                itemId BIGINT,
                qty DOUBLE NOT NULL,
                price DOUBLE NOT NULL,
                vendor VARCHAR(255),
                pack_size DOUBLE DEFAULT NULL,
                packs DOUBLE DEFAULT NULL,
                reference VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS login_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                role VARCHAR(50) NOT NULL,
                action VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if purchase_no column exists in stock_batches, and add if not
        const [columns] = await connection.query('SHOW COLUMNS FROM stock_batches LIKE "purchase_no"');
        if (columns.length === 0) {
            await connection.query('ALTER TABLE stock_batches ADD COLUMN purchase_no INT DEFAULT NULL');
            console.log('Column "purchase_no" added to "stock_batches" table.');
            
            // Perform one-time migration for existing records
            const [batches] = await connection.query('SELECT * FROM stock_batches ORDER BY created_at ASC, id ASC');
            if (batches.length > 0) {
                console.log(`Migrating ${batches.length} existing purchase items...`);
                // Group by vendor, reference, and approximate time (within 5 seconds)
                const groups = [];
                batches.forEach(b => {
                    const vendor = b.vendor || 'Unknown Vendor';
                    const ref = b.reference || '';
                    const time = new Date(b.created_at).getTime();
                    
                    let foundGroup = groups.find(g => {
                        const sameVendor = g.vendor === vendor;
                        const sameRef = g.reference === ref;
                        const closeTime = Math.abs(g.time - time) < 5000;
                        return sameVendor && sameRef && closeTime;
                    });
                    
                    if (foundGroup) {
                        foundGroup.items.push(b.id);
                    } else {
                        groups.push({
                            vendor,
                            reference: ref,
                            time,
                            items: [b.id]
                        });
                    }
                });
                
                // Assign sequential purchase_no to each group
                for (let i = 0; i < groups.length; i++) {
                    const purchaseNo = i + 1;
                    const itemIds = groups[i].items;
                    await connection.query(
                        'UPDATE stock_batches SET purchase_no = ? WHERE id IN (?)',
                        [purchaseNo, itemIds]
                    );
                }
                console.log(`Successfully migrated ${groups.length} purchase transactions.`);
            }
        }

        console.log('Tables checked/created successfully.');
        connection.release();
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

initDb();

// FIFO Stock Consumption Helper
async function consumeStockFifo(itemId, qtyToDeduct) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const [batches] = await connection.query(
            'SELECT id, qty, price FROM stock_batches WHERE itemId = ? AND qty > 0 ORDER BY created_at ASC',
            [itemId]
        );
        
        let remainingQty = qtyToDeduct;
        let totalCost = 0;
        
        for (const batch of batches) {
            if (remainingQty <= 0) break;
            
            const deductQty = Math.min(remainingQty, batch.qty);
            totalCost += deductQty * batch.price;
            
            await connection.query(
                'UPDATE stock_batches SET qty = qty - ? WHERE id = ?',
                [deductQty, batch.id]
            );
            
            remainingQty -= deductQty;
        }
        
        await connection.query(
            'UPDATE stocks SET qty = qty - ? WHERE itemId = ?',
            [qtyToDeduct, itemId]
        );
        
        await connection.commit();
        return totalCost;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// API Endpoints - Items
app.get('/api/items', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM items');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/items', async (req, res) => {
    const { name, unit, price, cat, code } = req.body;
    try {
        const [existing] = await pool.query('SELECT id FROM items WHERE name LIKE ?', [name]);
        if (existing.length > 0) {
            return res.status(400).json({ error: `Material "${name}" already exists.` });
        }

        if (code && code.trim() !== '') {
            const [existingCode] = await pool.query('SELECT id FROM items WHERE code = ?', [code]);
            if (existingCode.length > 0) {
                return res.status(400).json({ error: `Material code "${code}" already exists.` });
            }
        }

        const [result] = await pool.query(
            'INSERT INTO items (name, unit, price, cat, code) VALUES (?, ?, ?, ?, ?)',
            [name, unit, price, cat, code]
        );
        res.json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/items/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM items WHERE id = ?', [req.params.id]);
        res.json({ deleted: 1 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/items/:id', async (req, res) => {
    const { name, unit, price, cat, code } = req.body;
    try {
        if (code && code.trim() !== '') {
            const [existingCode] = await pool.query('SELECT id FROM items WHERE code = ? AND id != ?', [code, req.params.id]);
            if (existingCode.length > 0) {
                return res.status(400).json({ error: `Material code "${code}" already exists.` });
            }
        }

        await pool.query(
            'UPDATE items SET name = ?, unit = ?, price = ?, cat = ?, code = ? WHERE id = ?',
            [name, unit, price, cat, code, req.params.id]
        );
        res.json({ updated: 1 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Endpoints - Products
app.get('/api/products', async (req, res) => {
    try {
        const [prodRows] = await pool.query('SELECT * FROM products');
        const [modRows] = await pool.query("SELECT product_id, created_at FROM production_history WHERE batch_number = 'MOD' ORDER BY created_at DESC");

        const products = prodRows.map(p => {
            const latestMod = modRows.find(m => String(m.product_id) === String(p.id));
            return { 
                ...p, 
                stages: JSON.parse(p.stages || '[]'),
                modified_at: latestMod ? latestMod.created_at : p.created_at
            };
        });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    const { name, batch, desc, density, group_code, color, stages } = req.body;
    const stagesStr = JSON.stringify(stages || []);
    try {
        const [existing] = await pool.query('SELECT id FROM products WHERE name LIKE ? AND group_code = ?', [name, group_code]);
        if (existing.length > 0) {
            return res.status(400).json({ error: `Product "${name}" already exists in group "${group_code}".` });
        }

        const [result] = await pool.query(
            'INSERT INTO products (name, batch, \`desc\`, density, group_code, color, stages) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, batch, desc, density, group_code, color, stagesStr]
        );
        res.json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    const { name, batch, desc, density, group_code, color, stages } = req.body;
    const stagesStr = JSON.stringify(stages || []);
    try {
        const [oldProd] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        
        await pool.query(
            'UPDATE products SET name = ?, batch = ?, \`desc\` = ?, density = ?, group_code = ?, color = ?, stages = ? WHERE id = ?',
            [name, batch, desc, density, group_code, color, stagesStr, req.params.id]
        );

        // Log modification if needed
        if (oldProd.length > 0) {
            const oldStages = JSON.parse(oldProd[0].stages || '[]');
            const newStages = stages || [];
            // Simple log for now
            await pool.query(
                'INSERT INTO production_history (product_id, product_name, quantity, batch_number, stages_data) VALUES (?, ?, ?, ?, ?)',
                [req.params.id, `[MODIFIED] ${name}`, 0, 'MOD', '[]']
            );
        }

        res.json({ updated: 1 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ deleted: 1 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Endpoints - Stocks
app.get('/api/stocks', async (req, res) => {
    try {
        const [stocksRows] = await pool.query('SELECT * FROM stocks');
        const [batchesRows] = await pool.query('SELECT * FROM stock_batches WHERE qty > 0');
        
        const mappedStocks = {};
        stocksRows.forEach(s => {
            mappedStocks[String(s.itemId)] = {
                qty: s.qty,
                avgPrice: s.avgPrice,
                threshold: s.threshold,
                batches: batchesRows.filter(b => String(b.itemId) === String(s.itemId))
            };
        });
        
        res.json(mappedStocks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stocks', async (req, res) => {
    const { itemId, threshold } = req.body;
    try {
        await pool.query(
            'UPDATE stocks SET threshold = ? WHERE itemId = ?',
            [threshold, itemId]
        );
        res.json({ success: true, threshold });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/purchases', async (req, res) => {
    const payload = req.body; // Array of { itemId, qty, price, vendor, reference, packSize, packs }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Determine next purchase_no
        const [maxRow] = await connection.query('SELECT MAX(purchase_no) as maxVal FROM stock_batches');
        const nextPurchaseNo = (maxRow[0].maxVal || 0) + 1;

        for (const item of payload) {
            const { itemId, qty, price, vendor, reference, packSize, packs } = item;
            
            // Insert into stock_batches
            await connection.query(
                'INSERT INTO stock_batches (itemId, qty, price, vendor, pack_size, packs, reference, purchase_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [itemId, qty, price, vendor, packSize, packs, reference, nextPurchaseNo]
            );

            // Update stocks summary
            const [current] = await connection.query('SELECT qty, avgPrice FROM stocks WHERE itemId = ?', [itemId]);
            if (current.length > 0) {
                const newQty = current[0].qty + qty;
                // Update to the latest price for FIFO inventory valuation
                await connection.query(
                    'UPDATE stocks SET qty = ?, avgPrice = ? WHERE itemId = ?',
                    [newQty, price, itemId]
                );
            } else {
                await connection.query(
                    'INSERT INTO stocks (itemId, qty, avgPrice) VALUES (?, ?, ?)',
                    [itemId, qty, price]
                );
            }
        }
        await connection.commit();
        res.json({ success: true, purchase_no: nextPurchaseNo });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.get('/api/purchases', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM stock_batches ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/purchases', async (req, res) => {
    try {
        await pool.query('TRUNCATE TABLE stock_batches');
        res.json({ success: true, message: 'Purchase history cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stocks/consume', async (req, res) => {
    const { items: consumeItems } = req.body; // Array of { itemId, qty }
    try {
        const results = [];
        for (const item of consumeItems) {
            const { itemId, qty } = item;
            const cost = await consumeStockFifo(itemId, qty);
            results.push({ itemId, qty, cost });
        }
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/batches', async (req, res) => {
    const { product_id, product_name, quantity, stages_data } = req.body;
    try {
        // Get the next sequential ID
        const [rows] = await pool.query('SELECT MAX(id) as maxId FROM production_history');
        const nextId = (rows[0].maxId || 0) + 1;
        
        const day = new Date().getDate();
        const dayStr = String(day).padStart(2, '0');
        const seqStr = String(nextId).padStart(2, '0');
        
        const batch_number = req.body.batch_number || `${seqStr}${dayStr}`;
        
        await pool.query(
            'INSERT INTO production_history (product_id, product_name, quantity, batch_number, stages_data) VALUES (?, ?, ?, ?, ?)',
            [product_id, product_name, quantity, batch_number, JSON.stringify(stages_data)]
        );
        res.json({ success: true, batch_number });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/batches', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM production_history WHERE batch_number != "MOD" ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reports/daily', async (req, res) => {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const start = dateStr + " 00:00:00";
    const end = dateStr + " 23:59:59";

    try {
        const [productions] = await pool.query(
            'SELECT * FROM production_history WHERE created_at BETWEEN ? AND ?',
            [start, end]
        );

        const [purchases] = await pool.query(
            'SELECT sb.*, i.name, i.unit FROM stock_batches sb JOIN items i ON sb.itemId = i.id WHERE sb.created_at BETWEEN ? AND ?',
            [start, end]
        );

        // Group purchases by purchase_no or fallback
        const groupedPurchases = {};
        purchases.forEach(p => {
            const vendorName = p.vendor || 'Unknown Vendor';
            const ref = p.reference || '';
            const purchaseNo = p.purchase_no || 0;
            const key = purchaseNo ? String(purchaseNo) : (vendorName + '|||' + ref);
            
            if (!groupedPurchases[key]) {
                groupedPurchases[key] = {
                    purchase_no: purchaseNo,
                    vendor: vendorName,
                    reference: ref,
                    created_at: p.created_at,
                    items: []
                };
            }
            groupedPurchases[key].items.push({
                name: p.name,
                qty: p.qty,
                price: p.price,
                unit: p.unit,
                packSize: p.pack_size ? parseFloat(p.pack_size) : null,
                packs: p.packs ? parseFloat(p.packs) : null
            });
        });

        // Calculate aggregated RM Usage
        const rmUsage = {};
        const prods = [];
        const mods = [];

        productions.forEach(batch => {
            if (batch.batch_number === 'MOD') {
                mods.push(batch);
                return;
            }
            prods.push(batch);

            let stages = [];
            try { stages = JSON.parse(batch.stages_data || '[]'); } catch(e) {}
            stages.forEach(stage => {
                stage.items.forEach(item => {
                    const key = item.name;
                    if (!rmUsage[key]) rmUsage[key] = { qty: 0, unit: item.unit };
                    rmUsage[key].qty += parseFloat(item.qty || 0);
                });
            });
        });

        res.json({
            productions: prods,
            purchases: Object.values(groupedPurchases),
            rmUsage: Object.entries(rmUsage).map(([name, data]) => ({ name, ...data })),
            modifications: mods
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Endpoints - Login History
app.get('/api/login-history', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM login_history ORDER BY created_at DESC LIMIT 100');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login-history', async (req, res) => {
    const { role, action } = req.body;
    try {
        await pool.query('INSERT INTO login_history (role, action) VALUES (?, ?)', [role, action]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/login-history', async (req, res) => {
    try {
        await pool.query('TRUNCATE TABLE login_history');
        res.json({ success: true, message: 'Login history cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
