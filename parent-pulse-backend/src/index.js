import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Serve static files from public directory
app.use(express.static('public'));

// Favicon route - prevent 404 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: 'auto-deploy-test-1'
  });
});

// Chat API routes
app.use('/api/chat', chatRoutes);

// Root endpoint - serve the frontend
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

// API root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to the Chatbot API',
    endpoints: {
      health: 'GET /api/health',
      ask: 'POST /api/chat/ask - Ask a question',
      insights: 'GET /api/chat/insights/:studentUserId - Get student insights',
      stream: 'POST /api/chat/stream - Stream AI response',
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Chatbot server running on http://localhost:${PORT}`);
  console.log(`📝 API Documentation available at http://localhost:${PORT}`);
});

export default app;
