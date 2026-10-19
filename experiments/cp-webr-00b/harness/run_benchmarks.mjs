// CP-WEBR-00B Performance and Benchmark Qualification Harness
// Evaluates WebR 0.6.0 on synthetic cohorts from N=250 to N=50,000

import fs from 'node:fs';
import path from 'node:path';

function resolveWebrPath() {
  const env = process.env.WEBR_NODE_MODULES || process.env.WEBR_PATH;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    path.resolve('experiments/cp-webr-00b/.cache/webr'),
    path.resolve('node_modules/webr'),
    path.resolve('../node_modules/webr')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve('experiments/cp-webr-00b/.cache/webr');
}

const webrPkgPath = resolveWebrPath();
const { WebR } = await import(path.join(webrPkgPath, 'dist/webr.mjs'));

const outCsv = 'experiments/cp-webr-00b/benchmark-results.csv';

const configs = [
  { n: 250, k: 5, trt_ratio: 0.35 },
  { n: 1000, k: 5, trt_ratio: 0.35 },
  { n: 1000, k: 10, trt_ratio: 0.35 },
  { n: 1000, k: 20, trt_ratio: 0.50 },
  { n: 5000, k: 5, trt_ratio: 0.35 },
  { n: 5000, k: 10, trt_ratio: 0.35 },
  { n: 10000, k: 5, trt_ratio: 0.35 },
  { n: 10000, k: 10, trt_ratio: 0.35 },
  { n: 25000, k: 5, trt_ratio: 0.35 },
  { n: 50000, k: 5, trt_ratio: 0.35, is_stress: true }
];

console.log('--- CP-WEBR-00B Benchmarks ---');
const coldStartT0 = performance.now();
const webr = new WebR();
await webr.init();
const coldStartMs = performance.now() - coldStartT0;
console.log(`Cold start init: ${coldStartMs.toFixed(1)} ms`);

const pkgT0 = performance.now();
await webr.installPackages(['MatchIt', 'cobalt', 'jsonlite']);
await webr.evalR('library(MatchIt); library(cobalt); library(jsonlite)');
const pkgLoadMs = performance.now() - pkgT0;
console.log(`Package load & mount: ${pkgLoadMs.toFixed(1)} ms`);

const csvRows = [
  'n,k,treatment_ratio,is_stress,data_gen_ms,glm_match_ms,cobalt_ms,total_pipeline_ms,matched_pairs,peak_heap_mb,status'
];

for (const cfg of configs) {
  const { n, k, trt_ratio, is_stress = false } = cfg;
  console.log(`Running benchmark: N=${n}, K=${k}, ratio=${trt_ratio}...`);

  const tStart = performance.now();
  let dataGenMs = 0;
  let glmMatchMs = 0;
  let cobaltMs = 0;
  let matchedPairs = 0;
  let status = 'SUCCESS';

  try {
    // 1. Synthetic data generation inside WebR
    const tGen0 = performance.now();
    await webr.evalR(`
      set.seed(42)
      n <- ${n}
      k <- ${k}
      treat <- rbinom(n, 1, ${trt_ratio})
      cov_mat <- matrix(rnorm(n * k), nrow = n, ncol = k)
      colnames(cov_mat) <- paste0("x", 1:k)
      bench_df <- as.data.frame(cov_mat)
      bench_df$treat <- treat
      bench_df$id <- paste0("sub_", 1:n)
      rownames(bench_df) <- bench_df$id
      fmla <- as.formula(paste("treat ~", paste(paste0("x", 1:k), collapse = " + ")))
    `);
    dataGenMs = performance.now() - tGen0;

    // 2. GLM + Compiled nearest neighbor matching
    const tMatch0 = performance.now();
    await webr.evalR(`
      m_out <- MatchIt::matchit(
        formula = fmla,
        data = bench_df,
        method = "nearest",
        distance = "glm",
        link = "linear.logit",
        estimand = "ATT",
        ratio = 1,
        replace = FALSE,
        m.order = "largest",
        discard = "none",
        caliper = NULL
      )
    `);
    glmMatchMs = performance.now() - tMatch0;

    // 3. Cobalt balance computation
    const tCobalt0 = performance.now();
    await webr.evalR(`
      bal <- cobalt::bal.tab(m_out, un = TRUE, binary = "raw", s.d.denom = "treated")
    `);
    cobaltMs = performance.now() - tCobalt0;

    const pairsVal = await (await webr.evalR('sum(!is.na(m_out$match.matrix[,1]))')).toJs();
    matchedPairs = pairsVal.values[0];
  } catch (e) {
    status = `FAIL: ${e.message.replace(/,/g, ';')}`;
    console.error(`Error in N=${n}:`, e.message);
  }

  const totalPipelineMs = performance.now() - tStart;
  const memMb = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1);

  console.log(`  N=${n}, K=${k} -> Gen: ${dataGenMs.toFixed(1)}ms, Match: ${glmMatchMs.toFixed(1)}ms, Cobalt: ${cobaltMs.toFixed(1)}ms, Total: ${totalPipelineMs.toFixed(1)}ms, Pairs: ${matchedPairs}, Heap: ${memMb}MB`);
  csvRows.push(`${n},${k},${trt_ratio},${is_stress},${dataGenMs.toFixed(1)},${glmMatchMs.toFixed(1)},${cobaltMs.toFixed(1)},${totalPipelineMs.toFixed(1)},${matchedPairs},${memMb},${status}`);
}

await webr.close();
fs.mkdirSync(path.dirname(outCsv), { recursive: true });
fs.writeFileSync(outCsv, csvRows.join('\n'));
console.log(`Benchmarks saved to ${outCsv}`);
