const express = require('express');
const path = require('path');

const app = express();
const PORT = 5500;

app.use(express.static(path.resolve(__dirname)));

app.listen(PORT, () => {
  console.log(`Flow frontend running on http://localhost:${PORT}`);
});
