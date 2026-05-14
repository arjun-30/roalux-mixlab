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
        
        console.log('Resetting inventory to keep ONLY yesterday\\'s and today\\'s data...');
        
        // 1. Delete all purchases from older than yesterday
        const [purchResult] = await pool.query('DELETE FROM stock_batches WHERE DATE(created_at) < DATE_SUB(CURDATE(), INTERVAL 1 DAY)');
        console.log(`Deleted ${purchResult.affectedRows} older purchases.`);

        // 2. Delete all production batches older than yesterday
        const [prodResult] = await pool.query('DELETE FROM production_history WHERE DATE(created_at) < DATE_SUB(CURDATE(), INTERVAL 1 DAY)');
        console.log(`Deleted ${prodResult.affectedRows} older production records.`);
        
        console.log(`\nSuccess! Your stock now ONLY reflects what was purchased and produced yesterday and today.`);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

run();
