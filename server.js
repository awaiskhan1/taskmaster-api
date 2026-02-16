const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/taskmaster';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request counter for metrics
let requestCount = 0;
let errorCount = 0;
const startTime = Date.now();

app.use((req, res, next) => {
    requestCount++;
    next();
});

// Task Schema
const taskSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Task = mongoose.model('Task', taskSchema);

// ─── Routes ───

// Health check
app.get('/health', (req, res) => {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({
        status: 'healthy',
        version: process.env.APP_VERSION || '1.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        mongo: mongoStatus,
        hostname: process.env.HOSTNAME || 'local',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
    const uptime = (Date.now() - startTime) / 1000;
    res.set('Content-Type', 'text/plain');
    res.send(
        `# HELP http_requests_total Total HTTP requests\n` +
        `# TYPE http_requests_total counter\n` +
        `http_requests_total ${requestCount}\n\n` +
        `# HELP http_errors_total Total HTTP errors\n` +
        `# TYPE http_errors_total counter\n` +
        `http_errors_total ${errorCount}\n\n` +
        `# HELP app_uptime_seconds Application uptime\n` +
        `# TYPE app_uptime_seconds gauge\n` +
        `app_uptime_seconds ${uptime}\n\n` +
        `# HELP nodejs_process_memory_bytes Process memory usage\n` +
        `# TYPE nodejs_process_memory_bytes gauge\n` +
        `nodejs_process_memory_bytes ${process.memoryUsage().heapUsed}\n`
    );
});

// GET all tasks
app.get('/api/tasks', async (req, res) => {
    try {
        const tasks = await Task.find().sort({ createdAt: -1 });
        res.json({ tasks, total: tasks.length });
    } catch (err) {
        errorCount++;
        res.status(500).json({ error: err.message });
    }
});

// POST create task
app.post('/api/tasks', async (req, res) => {
    try {
        if (!req.body.title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        const task = await Task.create({ title: req.body.title });
        res.status(201).json(task);
    } catch (err) {
        errorCount++;
        res.status(500).json({ error: err.message });
    }
});

// PUT update task
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    } catch (err) {
        errorCount++;
        res.status(500).json({ error: err.message });
    }
});

// DELETE task
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json({ message: 'Task deleted' });
    } catch (err) {
        errorCount++;
        res.status(500).json({ error: err.message });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Connect to MongoDB and start server
async function start() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log(`MongoDB connected: ${MONGO_URI}`);
    } catch (err) {
        console.warn(`MongoDB not available: ${err.message}`);
        console.warn('Running without database — health endpoint still works');
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`TaskMaster API running on port ${PORT}`);
        console.log(`Health: http://localhost:${PORT}/health`);
        console.log(`Metrics: http://localhost:${PORT}/metrics`);
    });
}

start();

module.exports = app;
