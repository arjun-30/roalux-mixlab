const http = require('http');

function postItem(name) {
  const data = JSON.stringify({ name, unit: 'kg', price: 10 });
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/items',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      console.log(`Status for "${name}":`, res.statusCode);
      console.log(`Response for "${name}":`, body);
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request for "${name}":`, e.message);
  });

  req.write(data);
  req.end();
}

// Try to post "TestItem" twice
postItem('TestItem');
setTimeout(() => postItem('testitem'), 2000);
