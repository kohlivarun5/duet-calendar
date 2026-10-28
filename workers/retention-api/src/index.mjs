import { DurableObject } from 'cloudflare:workers';
import { RetentionLedger as LedgerCore } from './ledger.mjs';
import worker from './worker.mjs';

export class RetentionLedger extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new LedgerCore(ctx, env);
  }
  fetch(request) { return this.core.fetch(request); }
}

export default worker;
