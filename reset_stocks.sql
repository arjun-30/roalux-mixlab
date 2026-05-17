-- SQL to empty all stocks except LC-08
-- Run this in your Hostinger phpMyAdmin

-- 1. Clear all stock_batches except for LC-08
DELETE FROM stock_batches 
WHERE itemId != (SELECT id FROM items WHERE code = 'LC-08');

-- 2. Set all stock quantities and average prices to 0 except for LC-08
UPDATE stocks 
SET qty = 0, avgPrice = 0 
WHERE itemId != (SELECT id FROM items WHERE code = 'LC-08');

-- 3. Clear all login history logs
TRUNCATE TABLE login_history;
