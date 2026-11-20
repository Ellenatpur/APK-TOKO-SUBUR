const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/mutations', require('./routes/mutations'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/backup', require('./routes/backup'));

// Fallback to index.html for SPA (compatible with Express 5)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: err.message || 'Terjadi kesalahan pada server.' });
});

// Function to automatically launch desktop app window
function launchDesktopApp(port) {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return;
  }
  const fs = require('fs');
  const { exec } = require('child_process');
  const url = `http://localhost:${port}`;
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  setTimeout(() => {
    if (fs.existsSync(chromePath)) {
      exec(`start "" "${chromePath}" --app=${url}`);
    } else if (fs.existsSync(edgePath)) {
      exec(`start "" "${edgePath}" --app=${url}`);
    } else {
      exec(`start ${url}`);
    }
  }, 600);
}

// Start Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`  APLIKASI OPERASI TOKO SIAP DIGUNAKAN!`);
  console.log(`  Jendela aplikasi toko telah dibuka: http://localhost:${PORT}`);
  console.log(`===================================================`);
  launchDesktopApp(PORT);
});
