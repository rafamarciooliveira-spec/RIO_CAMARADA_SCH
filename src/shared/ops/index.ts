/** Registro de todas as operações. Importar este arquivo uma vez (servidor, demo, seed). */
import { registerOps, listOps, jobRunnerOp, type OpDef } from '../core/ops.ts';
import { platformOps } from './platform.ts';
import { accessOps } from './access.ts';
import { memberOps } from './members.ts';
import { cardOps } from './card.ts';
import { genericOps } from './generic.ts';
import { financeOps } from './finance.ts';
import { commsOps } from './comms.ts';
import { governanceOps } from './governance.ts';
import { cultureOps } from './culture.ts';
import { privacyOps } from './privacy.ts';
import { newsOps } from './news.ts';
import { competitionOps } from './competitions.ts';
import { orgchartOps } from './orgchart.ts';

let done = false;
export function registerAllOps(): void {
  if (done) return;
  done = true;
  registerOps([
    ...platformOps,
    ...accessOps,
    ...memberOps,
    ...cardOps,
    ...genericOps,
    ...financeOps,
    ...commsOps,
    ...governanceOps,
    ...cultureOps,
    ...privacyOps,
    ...newsOps,
    ...competitionOps,
    ...orgchartOps,
    jobRunnerOp,
  ] as OpDef[]);
}

export { listOps };
