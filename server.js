const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// Initialize Database
const db = new sqlite3.Database('./mixlab.db', (err) => {
    if (err) console.error('Error opening database:', err.message);
    else console.log('Connected to the SQLite database.');
});

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit TEXT,
        price REAL,
        cat TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        batch REAL,
        desc TEXT,
        stages TEXT
    )`);
});

// API Endpoints - Items
app.get('/api/items', (req, res) => {
    db.all("SELECT * FROM items", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/items', (req, res) => {
    const { name, unit, price, cat } = req.body;
    db.run("INSERT INTO items (name, unit, price, cat) VALUES (?, ?, ?, ?)", [name, unit, price, cat], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.delete('/api/items/:id', (req, res) => {
    db.run("DELETE FROM items WHERE id = ?", req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// API Endpoints - Products
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse stages JSON string back to object
        const products = rows.map(p => ({ ...p, stages: JSON.parse(p.stages || '[]') }));
        res.json(products);
    });
});

app.post('/api/products', (req, res) => {
    const { name, batch, desc, stages } = req.body;
    const stagesStr = JSON.stringify(stages || []);
    db.run("INSERT INTO products (name, batch, desc, stages) VALUES (?, ?, ?, ?)", [name, batch, desc, stagesStr], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/products/:id', (req, res) => {
    const { name, batch, desc, stages } = req.body;
    const stagesStr = JSON.stringify(stages || []);
    db.run("UPDATE products SET name = ?, batch = ?, desc = ?, stages = ? WHERE id = ?", [name, batch, desc, stagesStr, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

app.delete('/api/products/:id', (req, res) => {
    db.run("DELETE FROM products WHERE id = ?", req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// Serve index.html for all other routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
