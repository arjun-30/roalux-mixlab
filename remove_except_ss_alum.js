require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    try {
        console.log('Connecting to database...');
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        
        console.log('Executing DELETE query...');
        // Deletes all rows where vendor does not contain "ss alum"
        // LOWER() ensures case-insensitivity (though MySQL is usually case-insensitive by default)
        const [result] = await pool.query('DELETE FROM stock_batches WHERE LOWER(vendor) NOT LIKE "%ss alum%"');
        
        console.log(`Success! Deleted ${result.affectedRows} rows.`);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

run();
