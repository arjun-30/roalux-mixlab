require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAllData() {
  console.log('--- Wiping All Data from Roalux MixLab ---');
  
  const tables = [
    'stock_batches',
    'production_history',
    'stocks',
    'products',
    'items'
  ];

  for (const table of tables) {
    console.log(`Clearing table: ${table}...`);
    // Delete all rows where id is not null (for tables with id)
    // For stocks, we use itemId
    const idField = (table === 'stocks') ? 'itemId' : 'id';
    
    const { error } = await supabase
      .from(table)
      .delete()
      .neq(idField, -1); // Effectively matches all records

    if (error) {
      console.error(`Error clearing ${table}:`, error.message);
    } else {
      console.log(`Successfully cleared ${table}.`);
    }
  }

  console.log('--- Data Wipe Complete ---');
}

clearAllData();
