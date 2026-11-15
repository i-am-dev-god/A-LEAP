const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Simple API endpoint for future backend integration (e.g., Supabase, Google Drive, etc.)
app.get('/api/status', (req, res) => {
  res.json({ status: 'online', version: '1.0.0', timestamp: new Date() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Preview: https://${PORT}-${process.env.SANDBOX_ID || 'preview'}.e2b.app`);
});
