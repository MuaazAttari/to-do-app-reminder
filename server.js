// server.js
const express = require('express');
const webpush = require('web-push');
const schedule = require('node-schedule');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(__dirname)); // serve client files (place index.html, sw, manifest in public)

const PORT = process.env.PORT || 3000;

// --- VAPID keys ---
// Generate with web-push generate-vapid-keys (once) or via code.
// For simplicity, generate once and paste here, or generate programmatically on first run.
// BELOW: replace with your own keys for production.
const VAPID_PUBLIC = "BM4BI6-uIMaMj5mgpknj-6EX7tqYGiI3rR4idrFhtxDjdLEoiNehZGwhEu8jMa5ICMhVzFGgx-_5SuERcyL1DKE";
const VAPID_PRIVATE ="buj3bWNZKcU7Ji4lqFaOVmyqkyHFpqEGpqXV-YetYeU";

if (VAPID_PUBLIC.startsWith('REPLACE')) {
  console.error('⚠️  You must set VAPID keys. See instructions in the README.');
  // We'll still start but pushes will fail.
}

webpush.setVapidDetails('mailto:you@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

// In-memory storage (for demo). Use DB for prod.
const subscriptions = new Map(); // key: endpoint -> subscription
const scheduledJobs = new Map();  // key: task.id -> schedule.Job

app.get('/vapidPublicKey', (req,res) => {
  res.send(VAPID_PUBLIC);
});

app.post('/subscribe', (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).send('No subscription');
  subscriptions.set(subscription.endpoint, subscription);
  console.log('Saved subscription:', subscription.endpoint);
  res.sendStatus(201);
});

// schedule { task: { id, title, due } }
app.post('/schedule', (req, res) => {
  const { task } = req.body;
  if (!task || !task.id) return res.status(400).json({ error:'Invalid task' });
  if (!task.due) return res.status(400).json({ error:'Task has no due time' });

  const dueTime = new Date(task.due);
  if (isNaN(dueTime.getTime())) return res.status(400).json({ error:'Invalid date' });

  // If time in past, send immediately
  const now = new Date();
  if (dueTime <= now) {
    // send immediately
    sendPushToAll({ title: 'Reminder', body: task.title, data:{taskId:task.id} });
    return res.json({ scheduled: false, sent: true });
  }

  // Cancel existing job if present
  if (scheduledJobs.has(task.id)) {
    const prev = scheduledJobs.get(task.id);
    prev.cancel();
    scheduledJobs.delete(task.id);
  }

  // Create job
  const job = schedule.scheduleJob(dueTime, () => {
    console.log('Job firing for', task.id, task.title);
    sendPushToAll({ title: 'Reminder', body: task.title, data:{taskId:task.id} });
    scheduledJobs.delete(task.id);
  });

  scheduledJobs.set(task.id, job);
  console.log('Scheduled task', task.id, 'at', dueTime.toISOString());
  res.json({ scheduled: true });
});

app.post('/cancel', (req, res) => {
  const { id } = req.body;
  if (id && scheduledJobs.has(id)) {
    scheduledJobs.get(id).cancel();
    scheduledJobs.delete(id);
    return res.json({ cancelled:true });
  }
  res.json({ cancelled:false });
});

// Helper: send push to all saved subscriptions
async function sendPushToAll(payload) {
  const subs = Array.from(subscriptions.values());
  const results = [];
  for (let sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      results.push({ endpoint: sub.endpoint, ok:true });
    } catch (err) {
      console.warn('Push failed', sub.endpoint, err.statusCode || err);
      results.push({ endpoint: sub.endpoint, ok:false });
      // Remove unsubscribed endpoints
      if (err.statusCode === 410 || err.statusCode === 404) {
        subscriptions.delete(sub.endpoint);
      }
    }
  }
  return results;
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Place client files in ./public and start.`);
});
