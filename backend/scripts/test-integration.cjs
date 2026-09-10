// Uses a fresh, disposable schema. Existing application tables are never reset.
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
async function main() {
  if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a local test PostgreSQL database.');
  const schema = `fuelops_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('schema', schema);
  const admin = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    await admin.$disconnect();
    const env = { ...process.env, DATABASE_URL: url.toString(), FUELOPS_TEST_SCHEMA: schema, JWT_SECRET: 'local-integration-test-secret', NODE_ENV: 'test' };
    const run = (file, args) => {
      const result = spawnSync(process.execPath, [file, ...args], { cwd: path.join(__dirname, '..'), env, stdio: 'inherit' });
      if (result.error || result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status})`);
    };
    run(require.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
    run(require.resolve('jest/bin/jest'), ['--runInBand', '--testMatch', '**/test/*.integration.ts']);
  } finally {
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
