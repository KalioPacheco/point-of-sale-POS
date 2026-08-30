const { readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const roots = ['components', 'database', 'middleware', 'migrations', 'passport', 'routes', 'scripts'];

function listJavaScript(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? listJavaScript(path)
      : path.endsWith('.js') ? [path] : [];
  });
}

const files = ['index.js', ...roots.flatMap(listJavaScript)];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
