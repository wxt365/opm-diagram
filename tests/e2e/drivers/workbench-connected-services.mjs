import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { startServer, configuration } from '../../../apps/assistant/src/server.mjs';

const root = await mkdtemp(join(tmpdir(), 'opm-connected-e2e-'));
const java = process.env.OPM_E2E_JAVA ?? (process.platform === 'win32' && existsSync('D:/jdk-21/bin/java.exe') ? 'D:/jdk-21/bin/java.exe' : 'java');
const child = spawn(java, ['-jar', 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar',
  '--server.address=0.0.0.0', '--server.port=17862', `--opm.storage.root=${join(root, 'runtime')}`,
  '--opm.security.remote-enabled=true', '--opm.security.embedded-access-token=connected-e2e-access',
  '--opm.security.trusted-web-origins=http://127.0.0.1:5179,http://localhost:5179'],
{ stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.on('data', chunk => process.stdout.write(chunk));
child.stderr.on('data', chunk => process.stderr.write(chunk));
child.on('error', error => { console.error(error); process.exit(1); });
const assistant = await startServer(configuration({ DEEPSEEK_API_KEY: 'unused-e2e-key',
  OPM_RUNTIME_ORIGIN: 'http://127.0.0.1:17862', OPM_ASSISTANT_PORT: '17863', OPM_ASSISTANT_HOST: '0.0.0.0',
  OPM_ASSISTANT_DATA: join(root, 'assistant'), OPM_REMOTE_ENABLED: 'true',
  OPM_RUNTIME_ACCESS_TOKEN: 'connected-e2e-access', OPM_TRUSTED_WEB_ORIGINS: 'http://127.0.0.1:5179,http://localhost:5179',
}));
async function close() { child.kill(); await assistant.close(); process.exit(0); }
process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close());
process.on('exit', () => child.kill());
