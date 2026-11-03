// Roda os testes de regras com RULES_TESTS=1 (funciona no Windows e no Linux).
// Os arquivos rodam em sequência: todos limpam e populam o mesmo emulador.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['vitest', 'run', 'tests/rules', '--no-file-parallelism'], { stdio: 'inherit', shell: true, env: { ...process.env, RULES_TESTS: '1' } });
process.exit(r.status ?? 1);
