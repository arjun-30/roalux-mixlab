require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        console.log("Connecting to database...");
        const connection = await pool.getConnection();

        console.log("Finding LC-08...");
        const [items] = await connection.query('SELECT id, code, name FROM items WHERE code = ?', ['LC-08']);
        
        if (items.length === 0) {
            console.error("Error: Item LC-08 not found in the items table!");
            connection.release();
            process.exit(1);
        }

        const lc08Id = items[0].id;
        console.log(`Found LC-08 with ID: ${lc08Id}`);

        // Get LC-08 current stock to verify
        const [lc08Stock] = await connection.query('SELECT * FROM stocks WHERE itemId = ?', [lc08Id]);
        console.log("Current LC-08 Stock:", lc08Stock);

        console.log("Clearing all other stock_batches...");
        const [deleteRes] = await connection.query('DELETE FROM stock_batches WHERE itemId != ?', [lc08Id]);
        console.log(`Deleted ${deleteRes.affectedRows} rows from stock_batches.`);

        console.log("Setting all other stocks to 0...");
        const [updateRes] = await connection.query('UPDATE stocks SET qty = 0, avgPrice = 0 WHERE itemId != ?', [lc08Id]);
        console.log(`Updated ${updateRes.affectedRows} rows in stocks to 0 qty.`);

        console.log("Clearing all login history logs...");
        await connection.query('TRUNCATE TABLE login_history');
        console.log("Login history cleared.");

        connection.release();
        console.log("Done.");
        process.exit(0);

    } catch (err) {
        console.error("An error occurred:", err);
        process.exit(1);
    }
}

run();
