// Presentation Adapter: Projects CanonicalPsmResult into accessible HTML
// Zero statistical recalculations. Strictly deterministic view formatting.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);

export const fmt = n => (n !== null && n !== undefined && Number.isFinite(n) ? n.toFixed(3) : '–');

export function renderCanonicalResult(result, T) {
  const sa = result.sampleAccounting || {};
  const diag = result.numericalDiagnostics || {};
  const pub = result.publicationStatus || { verdict: 'OUTPUT_READY', outputGenerationAllowed: true, reasons: [] };

  const isRestricted = pub.verdict !== 'OUTPUT_READY' || !pub.outputGenerationAllowed;
  const restrictionBanner = isRestricted ? `
    <div class="banner warnline" role="alert">
      <strong>${esc(T.restricted || 'OUTPUT GENERATION RESTRICTED')}:</strong>
      ${esc((pub.reasons || []).join('; ') || 'Analysis failed diagnostic certification')}
    </div>
  ` : '';

  const statusBadge = (st) => {
    switch (st) {
      case 'balanced_smd_and_vr':
        return `<span class="badge badge-balanced">${esc(T.balanced || 'Balanced')}</span>`;
      case 'borderline_smd':
        return `<span class="badge badge-borderline">${esc(T.borderline || 'Borderline')}</span>`;
      case 'imbalanced_smd':
        return `<span class="badge badge-imbalanced">${esc(T.imbalanced || 'Imbalanced')}</span>`;
      case 'residual_variance_disparity':
        return `<span class="badge badge-variance">${esc(T.residualVar || 'Variance disparity')}</span>`;
      default:
        return `<span class="badge">${esc(st || '–')}</span>`;
    }
  };

  const rows = (result.balanceTable || []).map(b => {
    const name = esc(b.displayName || b.covariateName || b.originalHeader);
    const smdBefore = fmt(b.unadjustedSmd);
    const smdAfter = fmt(b.matchedSmd);
    const vrAfter = fmt(b.matchedVarianceRatio);
    const badge = statusBadge(b.heuristicStatus);

    return `<tr>
      <th scope="row">${name}</th>
      <td>${smdBefore}</td>
      <td>${smdAfter}</td>
      <td>${vrAfter}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  const rubinBStr = fmt(diag.rubinB);
  const rubinRStr = fmt(diag.rubinR);

  return `
    ${restrictionBanner}
    <h3>${esc(T.summary)}</h3>
    <div class="grid">
      <div class="card">
        <strong>${sa.treatedTotal ?? 0}</strong><br>${esc(T.treated)}
      </div>
      <div class="card">
        <strong>${sa.controlTotal ?? 0}</strong><br>${esc(T.control)}
      </div>
      <div class="card">
        <strong>${sa.matchedTreatedCount ?? 0}</strong><br>${esc(T.matched)}
      </div>
      <div class="card">
        <strong>${rubinBStr}</strong><br>${esc(T.rubinB || "Rubin's B (< 0.25)")}
      </div>
      <div class="card">
        <strong>${rubinRStr}</strong><br>${esc(T.rubinR || "Rubin's R (0.5–2.0)")}
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <caption>${esc(T.tbl)}</caption>
        <thead>
          <tr>
            <th scope="col">${esc(T.cov)}</th>
            <th scope="col">${esc(T.before)}</th>
            <th scope="col">${esc(T.after)}</th>
            <th scope="col">${esc(T.vr || 'VR after')}</th>
            <th scope="col">${esc(T.statusBadge || 'Balance status')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <p><small class="text-muted">
      <strong>${esc(T.provenanceLabel || 'Statistical Engine')}:</strong>
      ${esc(T.provenance || 'Official R MatchIt 4.8.1 + cobalt 5.0.0 via WebR 0.6.0 (R 4.6.0 Wasm)')}
      · Pinned Template: <code>${(result.matchingConfiguration?.rTemplateSha256 || '7989403c...').slice(0, 12)}…</code>
    </small></p>
    <p>${esc(T.note)}</p>
  `;
}
