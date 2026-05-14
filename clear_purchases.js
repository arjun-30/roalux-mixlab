async function run() {
    try {
        console.log('Clearing purchase history on Hostinger...');
        const res = await fetch('https://roaluxmixlab.in/api/purchases', {
            method: 'DELETE'
        });
        const json = await res.json();
        console.log('Result:', json);
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
