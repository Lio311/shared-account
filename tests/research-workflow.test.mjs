import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const workflow = readFileSync(new URL('../.github/workflows/stock-research.yml', import.meta.url), 'utf8');
const script = workflow.split('        run: |\n')[1].split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
const mockCurl = `curl() {
  local output_file=''
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == '--output' ]]; then output_file="$2"; shift 2; else shift; fi
  done
  printf '%s' "$MOCK_BODY" > "$output_file"
  printf '%s' "$MOCK_STATUS"
}
`;
function run(secret, status, body) {
  return spawnSync('bash', ['-c', mockCurl + script], { encoding: 'utf8', env: { ...process.env, CRON_SECRET: secret, MOCK_STATUS: status, MOCK_BODY: body } });
}
test('workflow is scheduled every eight hours and shell syntax is valid', () => {
  assert.match(workflow, /17 \*\/8 \* \* \*/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(spawnSync('bash', ['-n'], { input: script }).status, 0);
});
test('workflow rejects missing secret, HTTP failure, invalid JSON, API failure without exposing payload', () => {
  for (const [secret, status, body] of [ ['', '200', '{"success":true}'], ['test', '503', 'PRIVATE_FINANCIAL_PAYLOAD'], ['test', '200', 'PRIVATE_FINANCIAL_PAYLOAD'], ['test', '200', '{"success":false,"error":"PRIVATE_FINANCIAL_PAYLOAD"}'] ]) {
    const result = run(secret, status, body);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /::error::/);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_FINANCIAL_PAYLOAD/);
  }
});
test('workflow accepts successful/skipped scans and warns about incomplete coverage', () => {
  assert.equal(run('test', '200', '{"success":true,"skipped":true}').status, 0);
  const result = run('test', '200', '{"success":true,"incomplete":1,"notification":{"failed":1}}');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /::warning::/);
});
