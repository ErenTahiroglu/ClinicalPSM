// Synthetic-only WebR demo for ClinicalPSM
// Uses official R MatchIt 4.8.1 and cobalt 5.0.0 executed via WebR 0.6.0
// No custom TypeScript statistical execution. Zero patient data.

import { WorkerLifecycleManager } from '../../../src/lib/webr/worker_manager.mjs';
import { renderCanonicalResult } from './presentation.js';

const btn = document.getElementById('run');
const cancelBtn = document.getElementById('cancel');
const out = document.getElementById('out');
const status = document.getElementById('status');
const T = JSON.parse(document.getElementById('i18n').textContent);

let lifecycleManager = null;

function getLifecycleManager() {
  if (!lifecycleManager) {
    lifecycleManager = new WorkerLifecycleManager(() => new Worker('/assets/webr-worker.js', { type: 'module' }));
    lifecycleManager.onStateChange((newState) => {
      if (newState === 'INITIALIZING') {
        status.textContent = T.loading || 'Initializing WebR runtime…';
      } else if (newState === 'RUNNING') {
        status.textContent = T.running || 'Running matching analysis…';
      } else if (newState === 'READY') {
        if (cancelBtn) cancelBtn.classList.add('hidden');
      } else if (newState === 'RECOVERABLE_ERROR' || newState === 'BLOCKED') {
        if (cancelBtn) cancelBtn.classList.add('hidden');
      }
    });
  }
  return lifecycleManager;
}

export function cohort() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: 200 }, (_, idx) => {
    const age = Math.round(40 + rnd() * 40);
    const bmi = +(20 + rnd() * 15).toFixed(1);
    const p = 1 / (1 + Math.exp(-((age - 60) / 10 + (bmi - 27) / 5)));
    return {
      id: `row_${idx + 1}`,
      age,
      bmi,
      sex: rnd() < 0.5 ? 'F' : 'M',
      treated: rnd() < p ? 1 : 0
    };
  });
}

export function createDatasetInput() {
  return {
    datasetId: 'synthetic_demo_cohort_200',
    headers: ['id', 'age', 'bmi', 'sex', 'treated'],
    rows: cohort(),
    treatmentVariable: 'treated',
    covariates: ['age', 'bmi', 'sex'],
    covariateDefinitions: {
      age: { originalHeader: 'age', inferredType: 'continuous' },
      bmi: { originalHeader: 'bmi', inferredType: 'continuous' },
      sex: { originalHeader: 'sex', inferredType: 'categorical', levels: ['F', 'M'], referenceLevel: 'F' }
    },
    options: {
      method: 'nearest',
      distanceMetric: 'linear.logit',
      ratio: 1,
      replace: false,
      matchingOrder: 'largest',
      caliper: null,
      stdCaliper: true,
      discard: 'none'
    }
  };
}

if (btn) {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = T.running || 'Running…';
    status.textContent = T.loading || 'Loading statistical engine…';
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    const manager = getLifecycleManager();

    try {
      if (manager.getState() === 'NOT_LOADED' || manager.getState() === 'RECOVERABLE_ERROR') {
        await manager.initialize({
          baseUrl: '/assets/webr/',
          repoUrl: '/assets/repo',
          templateUrl: '/assets/webr/r_template.R'
        });
      }

      status.textContent = T.running || 'Running…';
      const envelope = await manager.submitAnalysis(createDatasetInput());
      const result = envelope.payload || envelope.result || envelope;

      out.innerHTML = renderCanonicalResult(result, T);
      status.textContent = `${T.status}: OK`;
    } catch (err) {
      console.error('[ClinicalPSM Demo Error]', err);
      if (err.code === 'OPERATION_CANCELLED' || err.message?.includes('CANCELLED')) {
        out.innerHTML = `<div class="banner" role="status"><p>${T.cancelled || 'Analysis was cancelled.'}</p></div>`;
        status.textContent = T.cancelled || 'Analysis cancelled.';
      } else {
        out.innerHTML = `<div class="banner warnline" role="alert"><p>${T.err || 'The demo could not run in this browser.'}</p></div>`;
        status.textContent = T.err || 'Error running analysis.';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = T.run || 'Run synthetic demo';
      if (cancelBtn) cancelBtn.classList.add('hidden');
    }
  });
}

if (cancelBtn) {
  cancelBtn.addEventListener('click', async () => {
    cancelBtn.disabled = true;
    cancelBtn.textContent = T.cancelling || 'Cancelling…';
    try {
      const manager = getLifecycleManager();
      await manager.cancelCurrentJob();
    } catch (err) {
      console.warn('Error during cancellation:', err);
    } finally {
      cancelBtn.disabled = false;
      cancelBtn.textContent = T.cancel || 'Cancel';
      cancelBtn.classList.add('hidden');
    }
  });
}
