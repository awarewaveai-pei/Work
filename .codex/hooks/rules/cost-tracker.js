// Stop: track token usage and estimated cost per response. Verbatim port.
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = {
  check(ctx) {
    const i = ctx.payload;
    const usage = i.usage || i.token_usage || {};
    const inp = Number(usage.input_tokens || usage.prompt_tokens || 0);
    const out = Number(usage.output_tokens || usage.completion_tokens || 0);
    if (inp <= 0 && out <= 0) return null;

    const model = String(i.model || process.env.CLAUDE_MODEL || 'unknown').toLowerCase();
    let rateIn = 3, rateOut = 15; // sonnet default
    if (model.includes('haiku')) { rateIn = 0.8; rateOut = 4; }
    if (model.includes('opus')) { rateIn = 15; rateOut = 75; }

    const cost = Math.round(((inp / 1e6) * rateIn + (out / 1e6) * rateOut) * 1e6) / 1e6;
    const dir = path.join(os.homedir(), '.claude', 'metrics');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'costs.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), model, in: inp, out, cost_usd: cost }) + '\n');
    return null;
  },
};
