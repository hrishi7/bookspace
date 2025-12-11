# Phase 7: Advanced Node.js Features - Detailed Answers

> In-depth answers with production-ready code examples, best practices, and real-world scenarios

## Table of Contents
1. [Cluster Mode Answers](#cluster-mode)
2. [Worker Threads Answers](#worker-threads)
3. [Streams and Backpressure Answers](#streams-and-backpressure)
4. [Graceful Shutdown Answers](#graceful-shutdown)
5. [Advanced Scenarios Answers](#advanced-scenarios)

---

## Cluster Mode

### Q1: What is cluster mode in Node.js and why is it important?

**Answer:**

Node.js runs on a single thread by default, which means it can only utilize one CPU core. On modern servers with multiple cores, this leaves significant computing power unused. The cluster module allows you to create child processes (workers) that share the same server port, effectively distributing the load across all CPU cores.

**Why It's Important:**
- **Better Resource Utilization:** Utilize all CPU cores instead of just one
- **Higher Throughput:** Handle more concurrent requests
- **Fault Tolerance:** If one worker crashes, others continue serving requests
- **Zero-Downtime Restarts:** Restart workers one at a time

**Code Example:**

```typescript
import cluster from 'cluster';
import os from 'os';
import { createServer } from 'http';

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);
  console.log(`Forking ${numCPUs} workers...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    console.log('Starting a new worker...');
    cluster.fork();
  });
} else {
  // Workers share the same TCP connection
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end(`Handled by process ${process.pid}\n`);
  });

  server.listen(8000);
  console.log(`Worker ${process.pid} started`);
}
```

**Real-World Impact:**
A Node.js API server on an 8-core machine can potentially handle 8x more requests per second with cluster mode compared to a single process.

---

### Q2: How does the cluster module work internally?

**Answer:**

The cluster module uses the `child_process.fork()` method to spawn child processes. Here's the detailed internal workflow:

**1. Process Types:**
- **Primary (Master):** Manages workers, doesn't handle requests
- **Workers:** Handle actual HTTP requests

**2. Load Balancing Strategy:**

Node.js uses two strategies depending on the OS:

**Round-Robin (Default on most platforms except Windows):**
- Primary process accepts connections
- Distributes them to workers in a circular fashion
- More predictable load distribution

**Operating System Scheduling (Windows default):**
- Workers compete for connections
- OS decides which worker gets the connection
- Less predictable but potentially faster

**3. Port Sharing Mechanism:**

```typescript
// Internally, cluster uses a special technique:
// - Primary process listens on the port
// - Workers receive connections via IPC
// - All workers appear to listen on the same port

// What actually happens:
if (cluster.isPrimary) {
  // Primary creates the server socket
  const serverHandle = net._createServerHandle(address, port);
  
  // Workers get a reference to this handle via IPC
  worker.send({ act: 'queryServer', ... }, serverHandle);
} else {
  // Worker receives the handle
  process.on('message', (message, handle) => {
    // Worker can now accept connections on this handle
    server._listen2(handle, ...);
  });
}
```

**4. Inter-Process Communication (IPC):**

```typescript
// Primary to Worker
cluster.workers[1].send({ type: 'config', data: config });

// Worker to Primary
process.send({ type: 'metric', value: 100 });

// Communication example
if (cluster.isPrimary) {
  const worker = cluster.fork();
  
  worker.on('message', (msg) => {
    console.log(`Primary received: ${JSON.stringify(msg)}`);
  });
  
  worker.send({ action: 'start' });
} else {
  process.on('message', (msg) => {
    console.log(`Worker received: ${JSON.stringify(msg)}`);
    process.send({ status: 'acknowledged' });
  });
}
```

**Key Internal Mechanisms:**
1. Workers are forked with a special environment variable (`NODE_UNIQUE_ID`)
2. Primary owns the listening socket
3. Connections are distributed to workers
4. Workers share the same port but have separate memory spaces

---

### Q3: What are the differences between cluster mode and worker threads?

**Answer:**

These are two different concurrency models in Node.js, each solving different problems:

| Aspect | Cluster Mode | Worker Threads |
|--------|-------------|----------------|
| **Process Model** | Multiple processes | Multiple threads in one process |
| **Memory** | Separate memory space | Shared memory (optional) |
| **Startup Cost** | High (~30ms per worker) | Low (~1ms per thread) |
| **Resource Usage** | More memory (each has its own V8 instance) | Less memory (shared V8 resources) |
| **Use Case** | I/O operations, scaling HTTP servers | CPU-intensive tasks |
| **Communication** | IPC (slower, serialization required) | Shared memory or message passing (faster) |
| **Crash Impact** | Isolated - one crash doesn't affect others | Shared - can crash entire process |
| **Port Sharing** | Yes - all workers can listen on same port | No - can't share server ports |

**When to Use Cluster Mode:**

```typescript
// Scaling an Express API across cores
import cluster from 'cluster';
import express from 'express';

if (cluster.isPrimary) {
  // Fork workers equal to CPU count
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  const app = express();
  
  app.get('/hello', (req, res) => {
    // I/O bound operations (database, API calls)
    res.json({ message: 'Hello', worker: process.pid });
  });
  
  app.listen(3000);
}
```

**When to Use Worker Threads:**

```typescript
// CPU-intensive operations
import { Worker } from 'worker_threads';

app.post('/process-video', async (req, res) => {
  const worker = new Worker('./video-processor.js', {
    workerData: { videoPath: req.body.path }
  });
  
  worker.on('message', (result) => {
    res.json({ processed: result });
  });
  
  worker.on('error', (error) => {
    res.status(500).json({ error: error.message });
  });
});
```

**Best Practice - Combine Both:**

```typescript
// Cluster for scaling + Worker Threads for CPU tasks
if (cluster.isPrimary) {
  // Fork workers
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  const app = express();
  
  // Worker thread pool for CPU tasks
  const workerPool = new WorkerPool('./cpu-task.js', 4);
  
  app.post('/cpu-task', async (req, res) => {
    const result = await workerPool.exec(req.body.data);
    res.json(result);
  });
  
  app.listen(3000);
}
```

**Key Takeaway:** Use cluster for horizontal scaling across cores, worker threads for parallel CPU-intensive work.

---

### Q4: How do you share state between cluster workers?

**Answer:**

Workers have separate memory spaces, so sharing state requires external mechanisms:

**1. Redis (Recommended for Production):**

```typescript
import Redis from 'ioredis';
import cluster from 'cluster';

if (cluster.isPrimary) {
  // Fork workers
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
  });
  
  const app = express();
  
  // Shared session counter
  app.post('/increment', async (req, res) => {
    const count = await redis.incr('session:counter');
    res.json({ count, worker: process.pid });
  });
  
  // Shared rate limiting
  app.get('/api', async (req, res) => {
    const key = `rate:${req.ip}`;
    const requests = await redis.incr(key);
    
    if (requests === 1) {
      await redis.expire(key, 60); // 1 minute window
    }
    
    if (requests > 100) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    res.json({ success: true });
  });
  
  app.listen(3000);
}
```

**2. IPC (Inter-Process Communication):**

```typescript
// Primary process
if (cluster.isPrimary) {
  let sharedCounter = 0;
  const workers = [];
  
  for (let i = 0; i < 4; i++) {
    const worker = cluster.fork();
    workers.push(worker);
    
    worker.on('message', (msg) => {
      if (msg.type === 'increment') {
        sharedCounter++;
        // Broadcast new value to all workers
        workers.forEach(w => {
          w.send({ type: 'counter', value: sharedCounter });
        });
      }
    });
  }
} else {
  let localCounter = 0;
  
  process.on('message', (msg) => {
    if (msg.type === 'counter') {
      localCounter = msg.value;
    }
  });
  
  app.post('/increment', (req, res) => {
    process.send({ type: 'increment' });
    res.json({ acknowledged: true });
  });
  
  app.get('/count', (req, res) => {
    res.json({ count: localCounter });
  });
}
```

**3. Shared Database:**

```typescript
// Each worker connects to PostgreSQL
const pool = new Pool({
  host: 'localhost',
  database: 'mydb',
  max: 20, // connection pool
});

app.post('/update-stat', async (req, res) => {
  await pool.query(
    'INSERT INTO stats (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = stats.value + 1',
    ['page_views', 1]
  );
  res.json({ success: true });
});
```

**4. sticky-session (Session Affinity):**

```typescript
import sticky from 'sticky-session';

// Route same client to same worker
if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  const server = createServer((req, res) => {
    // In-memory session now works
    res.end(`Worker ${process.pid}`);
  });
  
  if (!sticky.listen(server, 3000)) {
    server.once('listening', () => {
      console.log(`Worker ${process.pid} listening`);
    });
  }
}
```

**Best Practices:**
- ✅ Use Redis for shared state in production
- ✅ Keep shared state minimal
- ✅ Use databases for persistent data
- ❌ Don't use IPC for high-frequency state updates (performance bottleneck)
- ❌ Don't rely on in-memory state across workers

---

### Q5: Explain the round-robin load balancing in cluster mode

**Answer:**

Round-robin is a fair load distribution algorithm where incoming connections are distributed sequentially to workers in a circular order.

**How It Works:**

```
Request 1 → Worker 0
Request 2 → Worker 1
Request 3 → Worker 2
Request 4 → Worker 3
Request 5 → Worker 0  (back to start)
...
```

**Implementation Details:**

```typescript
import cluster from 'cluster';
import os from 'os';

// Enable round-robin (default on Linux/Mac)
cluster.schedulingPolicy = cluster.SCHED_RR;

if (cluster.isPrimary) {
  const numWorkers = os.cpus().length;
  
  console.log(`Starting ${numWorkers} workers...`);
  
  for (let i = 0; i < numWorkers; i++) {
    const worker = cluster.fork();
    console.log(`Worker ${i + 1} (PID: ${worker.process.pid}) started`);
  }
  
  // Primary maintains internal counter for round-robin
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  const express = require('express');
  const app = express();
  
  app.get('/', (req, res) => {
    res.json({
      worker: process.pid,
      memory: process.memoryUsage(),
    });
  });
  
  app.listen(3000, () => {
    console.log(`Worker ${process.pid} listening`);
  });
}
```

**Testing Round-Robin:**

```bash
# Send 10 requests and see distribution
for i in {1..10}; do
  curl http://localhost:3000/ | jq .worker
done

# Output shows distribution:
# 12345
# 12346
# 12347
# 12348
# 12345  <- back to first worker
# 12346
# ...
```

**Advantages of Round-Robin:**
1. **Fair Distribution:** Each worker gets equal number of connections
2. **Predictable:** Easy to reason about load distribution
3. **Better for heterogeneous requests:** All workers get mix of heavy/light requests

**Disadvantages:**
1. **Keep-Alive Connections:** Can cause imbalance with long-lived connections
2. **Slightly Higher Latency:** Primary acts as proxy (minimal overhead)

**Alternative: SCHED_NONE (OS Scheduling):**

```typescript
// Let OS decide (default on Windows)
cluster.schedulingPolicy = cluster.SCHED_NONE;

// Workers compete for connections
// - Lower latency (no proxy)
// - Less predictable distribution
// - Better for short-lived connections
```

**Production Configuration:**

```typescript
import cluster from 'cluster';
import os from 'os';

const config = {
  workers: process.env.WORKERS || os.cpus().length,
  scheduling: cluster.SCHED_RR, // Force round-robin
  restartDelay: 1000,
  maxRestarts: 10,
};

if (cluster.isPrimary) {
  const workerRestarts = new Map();
  
  for (let i = 0; i < config.workers; i++) {
    startWorker();
  }
  
  function startWorker() {
    const worker = cluster.fork();
    workerRestarts.set(worker.id, 0);
  }
  
  cluster.on('exit', (worker) => {
    const restarts = workerRestarts.get(worker.id) || 0;
    
    if (restarts < config.maxRestarts) {
      setTimeout(() => {
        console.log(`Restarting worker ${worker.id}...`);
        startWorker();
        workerRestarts.set(worker.id, restarts + 1);
      }, config.restartDelay);
    } else {
      console.error(`Worker ${worker.id} crashed too many times. Not restarting.`);
    }
  });
}
```

**Key Takeaway:** Round-robin provides fair, predictable load distribution ideal for production APIs.

---

### Q6: How do you handle worker crashes in production?

**Answer:**

Worker crashes are inevitable in production. A robust system must detect and recover from crashes automatically.

**1. Basic Crash Recovery:**

```typescript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.error(`Worker ${worker.process.pid} died (${signal || code})`);
    
    // Always restart crashed workers
    const newWorker = cluster.fork();
    console.log(`Started new worker ${newWorker.process.pid}`);
  });
}
```

**2. Advanced Crash Handling with Rate Limiting:**

```typescript
interface WorkerInfo {
  restarts: number;
  lastRestart: number;
}

class ClusterManager {
  private workerInfo = new Map<number, WorkerInfo>();
  private readonly MAX_RESTARTS = 5;
  private readonly RESTART_WINDOW = 60000; // 1 minute
  private readonly RESTART_DELAY = 1000; // 1 second
  
  start() {
    if (!cluster.isPrimary) {
      throw new Error('ClusterManager can only run in primary process');
    }
    
    const numWorkers = os.cpus().length;
    
    for (let i = 0; i < numWorkers; i++) {
      this.forkWorker();
    }
    
    cluster.on('exit', (worker, code, signal) => {
      this.handleWorkerExit(worker, code, signal);
    });
    
    cluster.on('online', (worker) => {
      console.log(`✅ Worker ${worker.id} (PID: ${worker.process.pid}) online`);
    });
  }
  
  private forkWorker() {
    const worker = cluster.fork();
    this.workerInfo.set(worker.id, {
      restarts: 0,
      lastRestart: Date.now(),
    });
  }
  
  private handleWorkerExit(worker: cluster.Worker, code: number, signal: string) {
    console.error(`❌ Worker ${worker.id} (PID: ${worker.process.pid}) died`);
    console.error(`   Exit code: ${code}, Signal: ${signal}`);
    
    const info = this.workerInfo.get(worker.id);
    if (!info) return;
    
    const now = Date.now();
    const timeSinceLastRestart = now - info.lastRestart;
    
    // Reset restart count if outside window
    if (timeSinceLastRestart > this.RESTART_WINDOW) {
      info.restarts = 0;
    }
    
    info.restarts++;
    info.lastRestart = now;
    
    // Check if worker is crash-looping
    if (info.restarts > this.MAX_RESTARTS) {
      console.error(`🚨 Worker ${worker.id} crashed ${info.restarts} times in ${this.RESTART_WINDOW}ms`);
      console.error('   Not restarting. Manual intervention required.');
      
      // Alert monitoring system
      this.alertCrashLoop(worker, info.restarts);
      
      // Could exit primary to trigger container restart
      // process.exit(1);
      return;
    }
    
    // Delay restart to avoid rapid crash loops
    setTimeout(() => {
      console.log(`🔄 Restarting worker ${worker.id}... (attempt ${info.restarts}/${this.MAX_RESTARTS})`);
      this.forkWorker();
    }, this.RESTART_DELAY);
  }
  
  private alertCrashLoop(worker: cluster.Worker, restarts: number) {
    // Send to monitoring service (Sentry, DataDog, etc.)
    console.error('ALERT: Worker crash loop detected', {
      workerId: worker.id,
      restarts,
      timestamp: new Date().toISOString(),
    });
  }
}

// Usage
if (cluster.isPrimary) {
  const manager = new ClusterManager();
  manager.start();
}
```

**3. Graceful Worker Restart (Zero Downtime):**

```typescript
class ClusterManager {
  private workers: cluster.Worker[] = [];
  
  start() {
    // Initial workers
    for (let i = 0; i < os.cpus().length; i++) {
      this.workers.push(cluster.fork());
    }
  }
  
  // Restart workers one at a time
  async restartAllWorkers() {
    console.log('Starting zero-downtime restart...');
    
    for (const worker of this.workers) {
      await this.restartWorker(worker);
    }
    
    console.log('All workers restarted successfully');
  }
  
  private restartWorker(worker: cluster.Worker): Promise<void> {
    return new Promise((resolve) => {
      // Start new worker first
      const newWorker = cluster.fork();
      
      newWorker.on('online', () => {
        console.log(`New worker ${newWorker.id} online, shutting down old worker ${worker.id}`);
        
        // Gracefully shutdown old worker
        worker.send('shutdown');
        
        // Force kill after timeout
        setTimeout(() => {
          if (!worker.isDead()) {
            console.log(`Force killing worker ${worker.id}`);
            worker.kill();
          }
        }, 30000); // 30 second timeout
        
        worker.on('exit', () => {
          console.log(`Old worker ${worker.id} exited`);
          resolve();
        });
      });
    });
  }
}

// In worker process
if (cluster.isWorker) {
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      console.log(`Worker ${process.pid} received shutdown signal`);
      
      // Stop accepting new requests
      server.close(() => {
        console.log(`Worker ${process.pid} closed all connections`);
        process.exit(0);
      });
    }
  });
}
```

**4. Health Monitoring:**

```typescript
class ClusterManager {
  private startHealthChecks() {
    setInterval(() => {
      for (const id in cluster.workers) {
        const worker = cluster.workers[id]!;
        
        // Send health check
        worker.send({ type: 'health-check', timestamp: Date.now() });
        
        // Set timeout for response
        const timeout = setTimeout(() => {
          console.error(`Worker ${worker.id} failed health check - killing`);
          worker.kill();
        }, 5000);
        
        worker.once('message', (msg) => {
          if (msg.type === 'health-check-response') {
            clearTimeout(timeout);
          }
        });
      }
    }, 30000); // Check every 30 seconds
  }
}

// Worker side
if (cluster.isWorker) {
  process.on('message', (msg) => {
    if (msg.type === 'health-check') {
      // Respond to health check
      process.send!({
        type: 'health-check-response',
        timestamp: Date.now(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      });
    }
  });
}
```

**Production Checklist:**
- ✅ Automatic restart on crash
- ✅ Rate limit restarts to detect crash loops
- ✅ Alert on crash loops
- ✅ Zero-downtime rolling restarts
- ✅ Health monitoring
- ✅ Graceful shutdown with timeout
- ✅ Log crash reasons for debugging

---

## Worker Threads

### Q9: What are worker threads and when should you use them?

**Answer:**

Worker threads allow you to run JavaScript in parallel on multiple threads within the same process. Unlike cluster mode (which creates separate processes), worker threads share the same process but run on different threads.

**When to Use Worker Threads:**

✅ **CPU-Intensive Operations:**
- Image/video processing
- Data compression/encryption
- Complex calculations
- PDF generation
- Machine learning inference

❌ **Don't Use For:**
- I/O operations (already async)
- Simple operations (overhead not worth it)
- Sharing HTTP server ports (use cluster instead)

**Basic Example:**

```typescript
// main.js
import { Worker } from 'worker_threads';

function runCPUIntensiveTask(data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', {
      workerData: data
    });
    
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

// Usage in Express API
app.post('/process-image', async (req, res) => {
  try {
    const result = await runCPUIntensiveTask({
      image: req.body.image,
      operation: 'resize'
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

```typescript
// worker.js
import { parentPort, workerData } from 'worker_threads';
import sharp from 'sharp';

async function processImage() {
  const { image, operation } = workerData;
  
  // CPU-intensive image processing
  const result = await sharp(Buffer.from(image, 'base64'))
    .resize(800, 600)
    .jpeg({ quality: 80 })
    .toBuffer();
  
  parentPort!.postMessage({
    success: true,
    data: result.toString('base64')
  });
}

processImage().catch(error => {
  parentPort!.postMessage({
    success: false,
    error: error.message
  });
});
```

**Performance Comparison:**

```typescript
// Without worker threads - BLOCKS event loop
app.post('/hash-password', (req, res) => {
  const hash = bcrypt.hashSync(req.body.password, 12); // BLOCKS for ~100ms
  res.json({ hash });
});

// With worker threads - NON-blocking
app.post('/hash-password', async (req, res) => {
  const hash = await runWorkerTask('hash', req.body.password);
  res.json({ hash });
});
```

**Real-World Example - PDF Generation:**

```typescript
// pdf-generator.worker.ts
import { parentPort, workerData } from 'worker_threads';
import puppeteer from 'puppeteer';

async function generatePDF() {
  const { html, options } = workerData;
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setContent(html);
  
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    ...options
  });
  
  await browser.close();
  
  parentPort!.postMessage({
    pdf: pdf.toString('base64')
  });
}

generatePDF();
```

```typescript
// main.ts
app.post('/generate-report-pdf', async (req, res) => {
  const html = await renderReportHTML(req.body.data);
  
  const worker = new Worker('./pdf-generator.worker.js', {
    workerData: { html, options: { format: 'A4' } }
  });
  
  worker.on('message', ({ pdf }) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdf, 'base64'));
  });
  
  worker.on('error', (error) => {
    res.status(500).json({ error: error.message });
  });
});
```

**Key Benefits:**
1. **Non-blocking:** Main thread stays responsive
2. **Parallel Processing:** True parallelism for CPU work
3. **Memory Efficient:** Lower overhead than cluster
4. **Fast Creation:** ~1ms vs ~30ms for processes

---

### Q13: How do you implement a worker thread pool?

**Answer:**

Creating a new worker thread for every task has overhead. A worker pool reuses threads, improving performance and resource management.

**Production-Ready Worker Pool:**

```typescript
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';

interface Task {
  id: string;
  data: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

interface WorkerWithState {
  worker: Worker;
  busy: boolean;
  taskCount: number;
}

export class WorkerPool extends EventEmitter {
  private workers: WorkerWithState[] = [];
  private taskQueue: Task[] = [];
  private nextTaskId = 0;
  
  constructor(
    private workerScript: string,
    private poolSize: number = 4
  ) {
    super();
    this.initializeWorkers();
  }
  
  private initializeWorkers() {
    for (let i = 0; i < this.poolSize; i++) {
      this.createWorker();
    }
  }
  
  private createWorker() {
    const worker = new Worker(this.workerScript);
    
    const workerState: WorkerWithState = {
      worker,
      busy: false,
      taskCount: 0,
    };
    
    worker.on('message', (result) => {
      workerState.busy = false;
      workerState.taskCount++;
      
      this.emit('task-complete', {
        workerId: this.workers.indexOf(workerState),
        taskCount: workerState.taskCount,
      });
      
      // Process next task if any
      this.processNextTask();
    });
    
    worker.on('error', (error) => {
      console.error('Worker error:', error);
      this.emit('error', error);
      
      // Remove and replace crashed worker
      const index = this.workers.indexOf(workerState);
      if (index !== -1) {
        this.workers.splice(index, 1);
        this.createWorker();
      }
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code}`);
      }
    });
    
    this.workers.push(workerState);
  }
  
  exec<T = any>(data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: Task = {
        id: `task-${this.nextTaskId++}`,
        data,
        resolve,
        reject,
      };
      
      this.taskQueue.push(task);
      this.processNextTask();
    });
  }
  
  private processNextTask() {
    // Find available worker
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker || this.taskQueue.length === 0) {
      return;
    }
    
    const task = this.taskQueue.shift()!;
    availableWorker.busy = true;
    
    // Send task to worker
    availableWorker.worker.postMessage(task.data);
    
    // Store task handlers
    const handleMessage = (result: any) => {
      cleanup();
      if (result.error) {
        task.reject(new Error(result.error));
      } else {
        task.resolve(result);
      }
    };
    
    const handleError = (error: Error) => {
      cleanup();
      task.reject(error);
    };
    
    const cleanup = () => {
      availableWorker.worker.off('message', handleMessage);
      availableWorker.worker.off('error', handleError);
    };
    
    availableWorker.worker.once('message', handleMessage);
    availableWorker.worker.once('error', handleError);
  }
  
  async terminate() {
    const promises = this.workers.map(({ worker }) => worker.terminate());
    await Promise.all(promises);
    this.workers = [];
    this.taskQueue = [];
  }
  
  getStats() {
    return {
      poolSize: this.poolSize,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queuedTasks: this.taskQueue.length,
      totalTasksProcessed: this.workers.reduce((sum, w) => sum + w.taskCount, 0),
    };
  }
}
```

**Worker Script Template:**

```typescript
// cpu-task.worker.ts
import { parentPort } from 'worker_threads';

parentPort!.on('message', async (data) => {
  try {
    // Your CPU-intensive work here
    const result = await performCPUIntensiveTask(data);
    
    parentPort!.postMessage({
      success: true,
      result,
    });
  } catch (error) {
    parentPort!.postMessage({
      success: false,
      error: error.message,
    });
  }
});

async function performCPUIntensiveTask(data: any) {
  // Example: Image processing, encryption, etc.
  return { processed: true, data };
}
```

**Usage in Express API:**

```typescript
import { WorkerPool } from './worker-pool';

const imagePool = new WorkerPool('./image-processor.worker.js', 4);
const pdfPool = new WorkerPool('./pdf-generator.worker.js', 2);

app.post('/process-image', async (req, res) => {
  try {
    const result = await imagePool.exec({
      image: req.body.image,
      operation: 'resize',
      width: 800,
      height: 600,
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/worker-stats', (req, res) => {
  res.json({
    imagePool: imagePool.getStats(),
    pdfPool: pdfPool.getStats(),
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await imagePool.terminate();
  await pdfPool.terminate();
  process.exit(0);
});
```

**Advanced: Priority Queue:**

```typescript
interface PriorityTask extends Task {
  priority: number; // 0 = highest
}

class PriorityWorkerPool extends WorkerPool {
  private priorityQueue: PriorityTask[] = [];
  
  execWithPriority<T = any>(data: any, priority: number = 5): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: PriorityTask = {
        id: `task-${this.nextTaskId++}`,
        data,
        priority,
        resolve,
        reject,
      };
      
      // Insert in priority order
      const insertIndex = this.priorityQueue.findIndex(t => t.priority > priority);
      if (insertIndex === -1) {
        this.priorityQueue.push(task);
      } else {
        this.priorityQueue.splice(insertIndex, 0, task);
      }
      
      this.processNextTask();
    });
  }
  
  protected processNextTask() {
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker || this.priorityQueue.length === 0) {
      return;
    }
    
    // Take highest priority task (lowest number)
    const task = this.priorityQueue.shift()!;
    // ... rest of processing
  }
}
```

**Key Features:**
1. Reuses workers (no creation overhead)
2. Task queuing when all workers busy
3. Automatic worker recovery on crash
4. Performance statistics
5. Graceful shutdown

---

## Streams and Backpressure

### Q18: What is backpressure and why does it matter?

**Answer:**

Backpressure occurs when data is being written to a stream faster than it can be consumed, causing memory buildup. This is a critical concept for building reliable, memory-efficient Node.js applications.

**The Problem:**

```typescript
// ❌ BAD - No backpressure handling
import fs from 'fs';

const readable = fs.createReadStream('huge-file.txt'); // 10 GB file
const writable = fs.createWriteStream('output.txt');

readable.on('data', (chunk) => {
  writable.write(chunk); // Might return false!
  // If writable can't keep up, chunks pile up in memory → CRASH
});
```

**What Happens Without Backpressure Handling:**
1. Readable streams emit `data` events faster than writable can process
2. Chunks pile up in writable's internal buffer
3. Memory usage grows unbounded
4. Eventually: Out of Memory crash

**The Solution:**

```typescript
// ✅ GOOD - Proper backpressure handling
import fs from 'fs';

const readable = fs.createReadStream('huge-file.txt', {
  highWaterMark: 64 * 1024 // 64 KB chunks
});
const writable = fs.createWriteStream('output.txt');

readable.on('data', (chunk) => {
  const canContinue = writable.write(chunk);
  
  if (!canContinue) {
    // Writable buffer is full - pause reading
    console.log('Backpressure detected - pausing read stream');
    readable.pause();
  }
});

writable.on('drain', () => {
  // Writable buffer has space again - resume reading
  console.log('Drain event - resuming read stream');
  readable.resume();
});

readable.on('end', () => {
  writable.end();
});
```

**Even Better: Use `pipeline()`:**

```typescript
import { pipeline } from 'stream/promises';
import fs from 'fs';

// pipeline handles backpressure automatically
await pipeline(
  fs.createReadStream('huge-file.txt'),
  fs.createWriteStream('output.txt')
);
```

**Real-World Example - HTTP File Upload:**

```typescript
// ❌ BAD - Loads entire file into memory
app.post('/upload', (req, res) => {
  let data = '';
  req.on('data', chunk => {
    data += chunk; // Growing string in memory!
  });
  req.on('end', () => {
    fs.writeFileSync('upload.txt', data);
    res.send('OK');
  });
});

// ✅ GOOD - Streams with backpressure
app.post('/upload', (req, res) => {
  const writeStream = fs.createWriteStream('upload.txt');
  
  req.pipe(writeStream);
  
  writeStream.on('finish', () => {
    res.send('Upload complete');
  });
  
  writeStream.on('error', (error) => {
    res.status(500).send('Upload failed');
  });
});
```

**Backpressure in Action - Monitoring:**

```typescript
import { Transform } from 'stream';

class BackpressureMonitor extends Transform {
  private bytesProcessed = 0;
  private pauseCount = 0;
  
  _transform(chunk: any, encoding: string, callback: Function) {
    this.bytesProcessed += chunk.length;
    
    // Simulate slow processing
    setTimeout(() => {
      this.push(chunk);
      callback();
    }, 10);
  }
  
  pause() {
    this.pauseCount++;
    console.log(`⚠️  Backpressure! Paused ${this.pauseCount} times`);
    return super.pause();
  }
  
  getStats() {
    return {
      bytesProcessed: this.bytesProcessed,
      pauseCount: this.pauseCount,
    };
  }
}

// Usage
const monitor = new BackpressureMonitor();

await pipeline(
  fs.createReadStream('large-file.txt'),
  monitor,
  fs.createWriteStream('output.txt')
);

console.log('Stats:', monitor.getStats());
```

**Database Query Streaming with Backpressure:**

```typescript
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';

// Stream rows from database
async function streamDatabaseResults(query: string) {
  const dbStream = new Readable({
    objectMode: true,
    async read() {
      // Fetch next batch
      const rows = await db.query(query, { limit: 100, offset: this.rowCount });
      
      if (rows.length === 0) {
        this.push(null); // End stream
      } else {
        rows.forEach(row => this.push(row));
      }
      
      this.rowCount += rows.length;
    }
  });
  
  dbStream.rowCount = 0;
  return dbStream;
}

// Transform to JSON
const toJSON = new Transform({
  objectMode: true,
  transform(row, encoding, callback) {
    callback(null, JSON.stringify(row) + '\n');
  }
});

// Export to file with automatic backpressure handling
app.get('/export', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=export.json');
  
  await pipeline(
    await streamDatabaseResults('SELECT * FROM large_table'),
    toJSON,
    res
  );
});
```

**Key Takeaways:**
- ✅ Always handle backpressure for production systems
- ✅ Use `pipeline()` for automatic handling
- ✅ Monitor `.write()` return value
- ✅ Listen to `drain` event
- ❌ Never accumulate streaming data in memory

---

## Graceful Shutdown

### Q25: What is graceful shutdown and why is it critical?

**Answer:**

Graceful shutdown is the process of cleanly terminating a Node.js application, ensuring:
- ✅ All in-flight requests complete
- ✅ Database connections close properly
- ✅ Message queues acknowledge/reject messages
- ✅ No data corruption or loss
- ✅ Monitoring systems notified

**Why It's Critical:**

**Without Graceful Shutdown:**
```typescript
// User sends SIGTERM (kubectl delete pod, docker stop, etc.)
process.exit(0); // ❌ IMMEDIATE EXIT

// Results in:
// - Active HTTP requests aborted mid-response
// - Database transactions left uncommitted
// - RabbitMQ messages lost
// - File writes incomplete
// - WebSocket connections dropped without notice
```

**With Graceful Shutdown:**
```typescript
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('SIGTERM received, starting graceful shutdown...');
  
  // 1. Stop accepting new requests
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // 2. Wait for existing requests (with timeout)
  await waitForRequestsToComplete(30000);
  
  // 3. Close database connections
  await database.close();
  
  // 4. Close message queue
  await messageQueue.close();
  
  // 5. Exit cleanly
  console.log('Graceful shutdown complete');
  process.exit(0);
});
```

**Production-Ready Graceful Shutdown Manager:**

```typescript
import { Server } from 'http';
import { EventEmitter } from 'events';

interface ShutdownHook {
  name: string;
  handler: () => Promise<void>;
  timeout: number;
}

export class ShutdownManager extends EventEmitter {
  private hooks: ShutdownHook[] = [];
  private isShuttingDown = false;
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  
  constructor(private server: Server) {
    super();
    this.registerSignalHandlers();
  }
  
  private registerSignalHandlers() {
    // Kubernetes sends SIGTERM for pod termination
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    
    // Ctrl+C in terminal
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    
    // Nodemon restart
    process.once('SIGUSR2', () => this.shutdown('SIGUSR2'));
    
    // Uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.shutdown('uncaughtException', 1);
    });
    
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
      this.shutdown('unhandledRejection', 1);
    });
  }
  
  registerHook(name: string, handler: () => Promise<void>, timeout?: number) {
    this.hooks.push({
      name,
      handler,
      timeout: timeout || this.DEFAULT_TIMEOUT,
    });
  }
  
  private async shutdown(signal: string, exitCode: number = 0) {
    if (this.isShuttingDown) {
      console.log('Shutdown already in progress...');
      return;
    }
    
    this.isShuttingDown = true;
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    
    this.emit('shutdown-start', signal);
    
    // Set overall timeout for entire shutdown
    const forceExitTimer = setTimeout(() => {
      console.error('❌ Graceful shutdown timeout - forcing exit');
      process.exit(1);
    }, this.DEFAULT_TIMEOUT + 5000);
    
    try {
      // 1. Stop accepting new connections
      await this.stopServer();
      
      // 2. Execute custom hooks in order
      await this.executeHooks();
      
      clearTimeout(forceExitTimer);
      
      console.log('✅ Graceful shutdown complete');
      this.emit('shutdown-complete');
      
      process.exit(exitCode);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  }
  
  private stopServer(): Promise<void> {
    return new Promise((resolve) => {
      console.log('📡 Stopping HTTP server...');
      
      this.server.close(() => {
        console.log('✓ HTTP server stopped');
        resolve();
      });
      
      // Force close connections after timeout
      setTimeout(() => {
        console.log('⚠️  Forcing server connections to close');
        resolve();
      }, 10000);
    });
  }
  
  private async executeHooks() {
    for (const hook of this.hooks) {
      console.log(`🔧 Running shutdown hook: ${hook.name}...`);
      
      try {
        await Promise.race([
          hook.handler(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Hook timeout')), hook.timeout)
          ),
        ]);
        
        console.log(`✓ ${hook.name} completed`);
      } catch (error) {
        console.error(`✗ ${hook.name} failed:`, error);
        // Continue with other hooks
      }
    }
  }
}
```

**Usage in Express App:**

```typescript
import express from 'express';
import { ShutdownManager } from './shutdown-manager';
import { Pool } from 'pg';
import amqp from 'amqplib';

const app = express();
const server = app.listen(3000);

// Initialize shutdown manager
const shutdownManager = new ShutdownManager(server);

// Database connection
const db = new Pool({
  host: 'localhost',
  database: 'mydb',
  max: 20,
});

shutdownManager.registerHook('database', async () => {
  console.log('Closing database connections...');
  await db.end();
  console.log('Database connections closed');
}, 10000);

// RabbitMQ connection
let rabbitConnection: amqp.Connection;

(async () => {
  rabbitConnection = await amqp.connect('amqp://localhost');
})();

shutdownManager.registerHook('rabbitmq', async () => {
  console.log('Closing RabbitMQ connection...');
  await rabbitConnection?.close();
  console.log('RabbitMQ connection closed');
}, 5000);

// Redis connection
import Redis from 'ioredis';
const redis = new Redis();

shutdownManager.registerHook('redis', async () => {
  console.log('Closing Redis connection...');
  redis.disconnect();
  console.log('Redis connection closed');
}, 3000);

// Track active requests
let activeRequests = 0;

app.use((req, res, next) => {
  activeRequests++;
  res.on('finish', () => activeRequests--);
  next();
});

shutdownManager.registerHook('wait-for-requests', async () => {
  console.log(`Waiting for ${activeRequests} active requests...`);
  
  while (activeRequests > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('All requests completed');
}, 30000);

// Health check endpoint
app.get('/health', (req, res) => {
  if (shutdownManager.isShuttingDown) {
    // Tell load balancer to stop sending traffic
    return res.status(503).json({ status: 'shutting down' });
  }
  res.json({ status: 'ok' });
});

shutdownManager.on('shutdown-start', (signal) => {
  console.log(`Notifying monitoring system of shutdown (${signal})`);
  // Send to DataDog, Sentry, etc.
});
```

**Kubernetes Compatibility:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: api
        lifecycle:
          preStop:
            exec:
              # Kubernetes sends SIGTERM, then waits terminationGracePeriodSeconds
              # before SIGKILL
              command: ["/bin/sh", "-c", "sleep 5"]
        # Give app time to shutdown gracefully
        terminationGracePeriodSeconds: 45
        
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          # During shutdown, health returns 503
          # Kubernetes stops sending new traffic
          periodSeconds: 5
```

**Testing Graceful Shutdown:**

```bash
# Start server
npm start

# In another terminal, simulate active requests
while true; do curl http://localhost:3000/api/slow-endpoint; done

# Send SIGTERM
kill -SIGTERM <pid>

# Observe:
# 1. Server stops accepting new requests
# 2. Existing requests complete
# 3. Resources clean up in order
# 4. Process exits with code 0
```

**Key Takeaways:**
- ✅ Always implement graceful shutdown in production
- ✅ Handle SIGTERM (Kubernetes), SIGINT (Ctrl+C), SIGUSR2 (nodemon)
- ✅ Set reasonable timeouts (30s is common)
- ✅ Update health check to return 503 during shutdown
- ✅ Clean up resources in correct order
- ✅ Use Promise-based cleanup code
- ✅ Set terminationGracePeriodSeconds in Kubernetes

---

## Advanced Scenarios

### Q33: How do you combine cluster mode with worker threads?

**Answer:**

Combining cluster mode and worker threads provides the best of both worlds: horizontal scaling across CPU cores AND parallel processing for CPU-intensive tasks.

**Architecture:**

```
┌─────────────────────────────────────┐
│         Primary Process              │
│  (Manages cluster workers)           │
└──────────┬──────────────────────────┘
           │
           ├──► Worker Process 1
           │    ├── Express Server (handles I/O)
           │    └── Worker Thread Pool (CPU tasks)
           │
           ├──► Worker Process 2
           │    ├── Express Server
           │    └── Worker Thread Pool
           │
           └──► Worker Process N
                ├── Express Server
                └── Worker Thread Pool
```

**Implementation:**

```typescript
// server.ts
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { WorkerPool } from './worker-pool';

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);
  
  // Fork one worker per CPU core
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // Worker process
  const app = express();
  
  // Each cluster worker has its own worker thread pool
  const imagePool = new WorkerPool('./workers/image-processor.worker.js', 2);
  const pdfPool = new WorkerPool('./workers/pdf-generator.worker.js', 1);
  
  // I/O-bound endpoint (handled by cluster worker)
  app.get('/users', async (req, res) => {
    const users = await db.query('SELECT * FROM users');
    res.json(users);
  });
  
  // CPU-bound endpoint (delegated to worker thread)
  app.post('/process-image', async (req, res) => {
    try {
      const result = await imagePool.exec({
        image: req.body.image,
        operation: 'resize',
        width: 800,
        height: 600
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Another CPU-bound endpoint
  app.post('/generate-pdf', async (req, res) => {
    try {
      const pdf = await pdfPool.exec({
        html: req.body.html,
        options: { format: 'A4' }
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.send(Buffer.from(pdf, 'base64'));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  const PORT = 3000;
  const server = app.listen(PORT, () => {
    console.log(`Worker ${process.pid} listening on ${PORT}`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log(`Worker ${process.pid} shutting down...`);
    
    server.close();
    await imagePool.terminate();
    await pdfPool.terminate();
    
    process.exit(0);
  });
}
```

**Resource Allocation Strategy:**

```typescript
// Calculate optimal worker distribution
function getOptimalConfig() {
  const numCPUs = os.cpus().length;
  
  // Reserve 1 core for primary process
  const clusterWorkers = Math.max(1, numCPUs - 1);
  
  // Each cluster worker gets 1-2 worker threads for CPU tasks
  const threadsPerWorker = Math.ceil(numCPUs / clusterWorkers);
  
  return {
    clusterWorkers,
    threadsPerWorker: Math.min(threadsPerWorker, 2), // Cap at 2
  };
}

const config = getOptimalConfig();
console.log(`Starting ${config.clusterWorkers} cluster workers`);
console.log(`Each with ${config.threadsPerWorker} worker threads`);
```

**Monitoring:**

```typescript
// Add monitoring endpoint
app.get('/metrics', (req, res) => {
  res.json({
    cluster: {
      workerId: cluster.worker?.id,
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
    workerThreads: {
      imagePool: imagePool.getStats(),
      pdfPool: pdfPool.getStats(),
    },
  });
});
```

**Key Benefits:**
1. **Maximum Throughput:** Cluster handles more I/O requests
2. **No Blocking:** CPU tasks don't block event loop
3. **Isolation:** Worker crashes don't affect entire cluster
4. **Resource Efficiency:** Optimal CPU utilization

**When to Use:**
- ✅ High-traffic APIs with occasional CPU-intensive tasks
- ✅ Production services handling mixed workloads
- ✅ Servers with 4+ CPU cores

---

### Q34: Designing a scalable file processing system

**Answer:**

Design a system that can process millions of files uploaded by users, with image resizing, thumbnail generation, and metadata extraction.

**System Architecture:**

```
┌──────────────┐
│    Client    │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  API Gateway      │ (Cluster Mode - 4 workers)
│  - Accept upload  │
│  - Validate file  │
│  - Stream to S3   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   RabbitMQ       │
│  file.uploaded   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Worker Service   │ (Cluster + Worker Threads)
│ - Image resize   │
│ - Thumbnail gen  │
│ - Extract meta   │
└──────────────────┘
```

**Implementation:**

```typescript
// 1. API Gateway - Upload Handler
import { pipeline } from 'stream/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const s3 = new S3Client({ region: 'us-east-1' });

app.post('/upload', async (req, res) => {
  try {
    // Stream directly to S3 (no memory buffering)
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: 'user-uploads',
        Key: `${Date.now()}-${req.headers['x-filename']}`,
        Body: req, // req is a ReadableStream
        ContentType: req.headers['content-type'],
      },
    });
    
    // Monitor upload progress
    upload.on('httpUploadProgress', (progress) => {
      console.log(`Uploaded: ${progress.loaded}/${progress.total}`);
    });
    
    const result = await upload.done();
    
    // Publish event to RabbitMQ
    await publishEvent('file.uploaded', {
      fileKey: result.Key,
      size: parseInt(req.headers['content-length']),
      contentType: req.headers['content-type'],
      uploadedAt: new Date(),
    });
    
    res.json({
      success: true,
      fileKey: result.Key,
      message: 'Upload successful, processing started',
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});
```

```typescript
// 2. Worker Service - File Processor
import cluster from 'cluster';
import { WorkerPool } from './worker-pool';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

if (cluster.isPrimary) {
  // Fork workers
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  const s3 = new S3Client({ region: 'us-east-1' });
  
  // Worker thread pool for CPU-intensive processing
  const imagePool = new WorkerPool('./image-processor.worker.js', 3);
  
  // Connect to RabbitMQ
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  
  await channel.assertQueue('file.uploaded', { durable: true });
  channel.prefetch(1); // Process one at a time
  
  channel.consume('file.uploaded', async (msg) => {
    if (!msg) return;
    
    const event = JSON.parse(msg.content.toString());
    console.log(`Processing file: ${event.fileKey}`);
    
    try {
      // Download from S3 (stream)
      const command = new GetObjectCommand({
        Bucket: 'user-uploads',
        Key: event.fileKey,
      });
      const response = await s3.send(command);
      
      // Read into buffer for worker thread
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);
      
      // Process in worker thread
      const results = await imagePool.exec({
        buffer: fileBuffer,
        operations: ['resize', 'thumbnail', 'metadata'],
      });
      
      // Upload results back to S3
      await uploadResults(results, event.fileKey);
      
      // Acknowledge message
      channel.ack(msg);
      console.log(`✅ Processed: ${event.fileKey}`);
    } catch (error) {
      console.error(`❌ Error processing ${event.fileKey}:`, error);
      
      // Reject and requeue (with limit)
      const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;
      if (retryCount < 3) {
        channel.nack(msg, false, true);
      } else {
        // Send to DLQ after 3 retries
        channel.nack(msg, false, false);
      }
    }
  });
}
```

```typescript
// 3. Image Processor Worker Thread
import { parentPort, workerData } from 'worker_threads';
import sharp from 'sharp';

parentPort!.on('message', async ({ buffer, operations }) => {
  try {
    const results: any = {};
    
    // Resize main image
    if (operations.includes('resize')) {
      results.resized = await sharp(buffer)
        .resize(1920, 1080, { fit: 'inside' })
        .jpeg({ quality: 90 })
        .toBuffer();
    }
    
    // Generate thumbnail
    if (operations.includes('thumbnail')) {
      results.thumbnail = await sharp(buffer)
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
    
    // Extract metadata
    if (operations.includes('metadata')) {
      const metadata = await sharp(buffer).metadata();
      results.metadata = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: buffer.length,
      };
    }
    
    parentPort!.postMessage({
      success: true,
      results,
    });
  } catch (error) {
    parentPort!.postMessage({
      success: false,
      error: error.message,
    });
  }
});
```

**Scalability Features:**

1. **Backpressure Handling:**
```typescript
// Rate limit uploads based on queue depth
app.use(async (req, res, next) => {
  const queueDepth = await getQueueDepth('file.uploaded');
  
  if (queueDepth > 10000) {
    return res.status(503).json({
      error: 'System busy, try again later',
      retryAfter: 60,
    });
  }
  
  next();
});
```

2. **Horizontal Scaling:**
```bash
# Deploy multiple worker instances
docker-compose scale worker=10
```

3. **Monitoring:**
```typescript
app.get('/health', async (req, res) => {
  const stats = {
    queueDepth: await getQueueDepth('file.uploaded'),
    workerThreads: imagePool.getStats(),
    memory: process.memoryUsage(),
  };
  
  res.json(stats);
});
```

**Performance:**
- Handles 1000+ uploads/second
- Processes images in parallel across all cores
- No memory issues with streaming
- Scales horizontally with more workers

---

### Q35: Implementing zero-downtime deployments

**Answer:**

Zero-downtime deployment ensures your application stays available during updates, critical for production systems.

**Strategy Overview:**

```
Old Version:  [Worker 1] [Worker 2] [Worker 3] [Worker 4]
              ↓
Step 1:       [Worker 1] [Worker 2] [Worker 3] [Worker 4] [NEW Worker 5]
Step 2:       [Worker 2] [Worker 3] [Worker 4] [NEW Worker 5] [NEW Worker 6]
Step 3:       [Worker 3] [Worker 4] [NEW Worker 5] [NEW Worker 6] [NEW Worker 7]
...
New Version:  [NEW Worker 5] [NEW Worker 6] [NEW Worker 7] [NEW Worker 8]
```

**Implementation:**

```typescript
// deploy.ts - Deployment orchestration
import cluster from 'cluster';
import { ShutdownManager } from './shutdown-manager';

class ZeroDowntimeDeployer {
  private workers: Map<number, cluster.Worker> = new Map();
  
  async deploy() {
    console.log('🚀 Starting zero-downtime deployment...');
    
    const currentWorkers = Array.from(this.workers.values());
    
    for (const oldWorker of currentWorkers) {
      // 1. Start new worker with new code
      const newWorker = cluster.fork();
      
      // 2. Wait for new worker to be ready
      await this.waitForWorkerReady(newWorker);
      console.log(`✅ New worker ${newWorker.id} ready`);
      
      // 3. Gracefully shutdown old worker
      await this.gracefulShutdown(oldWorker);
      console.log(`✅ Old worker ${oldWorker.id} shut down`);
      
      // 4. Update tracking
      this.workers.delete(oldWorker.id);
      this.workers.set(newWorker.id, newWorker);
      
      // 5. Wait a bit before next worker (smooth transition)
      await this.sleep(2000);
    }
    
    console.log('✅ Zero-downtime deployment complete');
  }
  
  private waitForWorkerReady(worker: cluster.Worker): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker failed to start'));
      }, 30000);
      
      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      worker.on('exit', () => {
        clearTimeout(timeout);
        reject(new Error('Worker exited during startup'));
      });
    });
  }
  
  private gracefulShutdown(worker: cluster.Worker): Promise<void> {
    return new Promise((resolve) => {
      // Send shutdown signal
      worker.send({ type: 'shutdown' });
      
      // Force kill after timeout
      const timeout = setTimeout(() => {
        console.log(`⚠️  Force killing worker ${worker.id}`);
        worker.kill('SIGKILL');
        resolve();
      }, 30000);
      
      worker.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Primary process
if (cluster.isPrimary) {
  const deployer = new ZeroDowntimeDeployer();
  
  // Listen for deployment signal
  process.on('SIGUSR2', async () => {
    console.log('Received SIGUSR2 - starting deployment');
    await deployer.deploy();
  });
  
  // Initial workers
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
}
```

```typescript
// Worker process
if (cluster.isWorker) {
  const app = express();
  let isShuttingDown = false;
  
  // Health check with shutdown awareness
  app.get('/health', (req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: 'shutting down' });
    }
    res.json({ status: 'healthy' });
  });
  
  const server = app.listen(3000, () => {
    // Signal ready to primary
    process.send!({ type: 'ready' });
    console.log(`Worker ${process.pid} ready`);
  });
  
  // Handle shutdown signal from primary
  process.on('message', async (msg) => {
    if (msg.type === 'shutdown') {
      isShuttingDown = true;
      console.log(`Worker ${process.pid} starting graceful shutdown`);
      
      // Stop accepting new connections
      server.close(async () => {
        // Cleanup resources
        await db.close();
        await redis.disconnect();
        
        console.log(`Worker ${process.pid} shutdown complete`);
        process.exit(0);
      });
    }
  });
}
```

**Trigger Deployment:**

```bash
# Get primary process PID
PID=$(pgrep -f "node.*server.js" | head -1)

# Trigger zero-downtime deployment
kill -SIGUSR2 $PID

# Monitor deployment
tail -f logs/app.log
```

**Kubernetes Rolling Update:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # Add 1 extra pod during update
      maxUnavailable: 0  # Keep all pods running during update
  template:
    spec:
      containers:
      - name: api
        image: myapp:v2
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 3
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 5"]
        terminationGracePeriodSeconds: 45
```

**Best Practices:**
- ✅ Always use readiness probes
- ✅ Implement graceful shutdown
- ✅ Set appropriate timeouts
- ✅ Monitor deployment progress
- ✅ Have rollback plan ready
- ✅ Test deployment in staging first

---

## Summary

Phase 7 covers the most advanced Node.js concepts for building production-grade systems:

**Cluster Mode:** Scale horizontally across CPU cores, handle worker crashes, implement zero-downtime deployments.

**Worker Threads:** Offload CPU-intensive tasks, build efficient worker pools, avoid blocking the event loop.

**Streams:** Handle large files efficiently, implement backpressure correctly, use pipeline for automatic error handling.

**Graceful Shutdown:** Clean up resources properly, drain connections, handle all shutdown signals, integrate with Kubernetes.

**Combined Techniques:** Use cluster + worker threads for maximum performance, design scalable architectures, implement production-ready monitoring.

Mastering these concepts is essential for Senior/Staff Engineer roles and building systems that scale to millions of users.

