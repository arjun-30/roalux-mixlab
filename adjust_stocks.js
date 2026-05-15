require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: items, error: iErr } = await supabase.from('items').select('*');
  console.log("Items count:", items?.length);
  
  const lc08 = items.find(i => i.code === 'LC-08');
  console.log("LC-08:", lc08);
  
  const { data: stocks, error: sErr } = await supabase.from('stocks').select('*');
  console.log("Stocks count:", stocks?.length);
  
  const { data: batches, error: bErr } = await supabase.from('stock_batches').select('*');
  console.log("Batches count:", batches?.length);
  
}
run();
