import { loadConfig } from './config/index.js';
import { Store } from './security/store.js';
import { createApp } from './app.js';
import { startupSummary } from './runtime.js';
const config = loadConfig();
const store = new Store(config.database, config.encryptionKey);
const { app } = createApp(config, store);
const server = app.listen(config.port, '0.0.0.0', () =>
  process.stderr.write(startupSummary(config) + '\n'),
);
server.requestTimeout = 30000;
server.headersTimeout = 10000;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
