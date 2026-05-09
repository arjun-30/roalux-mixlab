const http = require('http');

http.get('http://localhost:3000/api/batches/next-number', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Next Batch Number:', JSON.parse(data));
  });
}).on('error', (err) => {
  console.log('Error: ' + err.message);
});
