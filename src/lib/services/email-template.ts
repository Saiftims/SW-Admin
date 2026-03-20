const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #080c14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; color: #c8d6e5; }
  .wrapper { max-width: 680px; margin: 0 auto; padding: 24px 16px; }

  .badge { display: inline-block; background: #10b981; color: #fff; font-size: 13px; font-weight: 700; padding: 8px 20px; border-radius: 50px; letter-spacing: 0.02em; }
  .header { text-align: center; padding: 28px 0 8px; }
  .subtitle { color: #5a6a7a; font-size: 12px; margin-top: 10px; font-family: 'Courier New', monospace; letter-spacing: 0.06em; }

  .photo-frame { margin: 20px 0; border-radius: 12px; overflow: hidden; background: #111827; border: 1px solid rgba(255,255,255,0.06); text-align: center; }
  .photo-frame img { width: 100%; max-height: 280px; object-fit: cover; }

  .cards { display: flex; gap: 12px; margin: 16px 0; }
  .card-left, .card-right { flex: 1; background: #0f1729; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 24px; }

  .card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #5a6a7a; font-weight: 600; margin-bottom: 4px; }
  .card-sublabel { font-size: 11px; color: #4a5568; margin-bottom: 16px; }

  .confidence-badge { display: inline-block; border: 1px solid #10b981; color: #10b981; font-size: 9px; font-weight: 800; padding: 3px 10px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 12px; vertical-align: middle; }
  .confidence-badge.low { border-color: #f59e0b; color: #f59e0b; }

  .delta-v-value { font-size: 56px; font-weight: 800; color: #e8f0fe; line-height: 1.1; margin: 8px 0; }
  .delta-v-unit { font-size: 22px; color: #5a6a7a; font-weight: 400; margin-left: 4px; }
  .delta-v-dash { color: #3a4a5a; margin: 0 4px; }
  .delta-v-note { font-size: 11px; color: #4a5568; line-height: 1.5; margin-top: 14px; }

  .ais-title { font-size: 15px; font-weight: 700; color: #e8f0fe; margin-bottom: 4px; }
  .ais-disclaimer { font-size: 10px; color: #4a5568; line-height: 1.5; margin-bottom: 16px; }

  .ais-row { margin-bottom: 14px; }
  .ais-row-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
  .ais-level { font-size: 11px; font-weight: 800; color: #5a6a7a; }
  .ais-level span { color: #e8f0fe; font-weight: 700; margin-left: 4px; }
  .ais-pct { font-size: 12px; font-weight: 700; color: #e8f0fe; }
  .ais-bar-track { height: 6px; background: #1a2332; border-radius: 3px; overflow: hidden; }
  .ais-bar-fill { height: 100%; border-radius: 3px; }
  .ais-desc { font-size: 9px; color: #3a4a5a; margin-top: 2px; }

  .features-section { margin: 16px 0; }
  .features-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #5a6a7a; font-weight: 600; margin-bottom: 14px; text-align: center; }
  .features-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .feature-card { background: #0f1729; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: center; }
  .feature-icon { font-size: 18px; margin-bottom: 6px; color: #5a6a7a; }
  .feature-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #5a6a7a; margin-bottom: 4px; }
  .feature-value { font-size: 14px; font-weight: 700; color: #e8f0fe; font-family: 'Courier New', monospace; }

  .callout { border-radius: 10px; padding: 16px 18px; margin: 12px 0; font-size: 12px; line-height: 1.6; }
  .callout-warning { background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); color: #d4a44a; }
  .callout-warning strong { color: #f59e0b; }
  .callout-info { background: rgba(59, 130, 246, 0.06); border: 1px solid rgba(59, 130, 246, 0.12); color: #6a8cba; }

  .footer { text-align: center; padding: 24px 0 12px; color: #3a4a5a; font-size: 11px; }
  .footer a { color: #5a8abf; text-decoration: none; }

  @media (max-width: 600px) {
    .cards { flex-direction: column; }
    .delta-v-value { font-size: 42px; }
  }
</style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <div class="badge">&#x2713; Delta-V Analysis Complete</div>
    <div class="subtitle">{{case_reference}}</div>
  </div>

  <div class="cards">
    <div class="card-left">
      <div>
        <span class="card-label">Estimated Delta-V</span>
        <span class="confidence-badge {{confidence_class}}">{{confidence}} confidence</span>
      </div>
      <div class="card-sublabel">Change in Velocity Range</div>
      <div class="delta-v-value">
        {{delta_v_min}} <span class="delta-v-dash">&ndash;</span> {{delta_v_max}}
        <span class="delta-v-unit">{{delta_v_unit}}</span>
      </div>
      <div class="delta-v-note">
        Preliminary photo-based estimation. Not a forensic reconstruction. Log in for exact Delta-V analysis and court-ready biomechanical reports.
      </div>
    </div>

    <div class="card-right">
      <div class="card-label">Injury Probability</div>
      <div class="ais-title">AIS Distribution Model</div>
      <div class="ais-disclaimer">{{disclaimer}}</div>
      {{ais_bars}}
    </div>
  </div>

  <div class="features-section">
    <div class="features-title">Extracted Features</div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">&uarr;</div>
        <div class="feature-label">Direction</div>
        <div class="feature-value">{{impact_direction}}</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x29BF;</div>
        <div class="feature-label">Type</div>
        <div class="feature-value">{{impact_type_display}}</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&darr;</div>
        <div class="feature-label">G-Force</div>
        <div class="feature-value">{{peak_acceleration_gs_display}}</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x223F;</div>
        <div class="feature-label">Pulse</div>
        <div class="feature-value">{{crash_pulse_display}}</div>
      </div>
    </div>
  </div>

  <div class="callout callout-warning">
    <strong>&#x26A0; Minor to moderate injuries (AIS 0-3) are significantly underestimated.</strong>
    Population crash databases only collect high-severity crashes, so lower-severity injuries aren&rsquo;t well represented in the data. Furthermore, some symptoms and injuries present later (e.g., radiculopathy, soft tissue injuries, disc herniations), so such statistics are severely underrepresented.
  </div>

  <div class="callout callout-info">
    &#x24D8; Injury risk is significantly higher based on: specific injuries being evaluated, pre-existing conditions, seating position, occupant age, body size, seatbelt use, airbag deployment, impact direction, and head restraint positioning. For accurate, personalized results, get a full Silent Witness analysis.
  </div>

  <div class="footer">
    &copy; Silent Witness &middot; <a href="https://www.silentwitness.ai">silentwitness.ai</a>
  </div>

</div>
</body>
</html>`;

export function getDefaultTemplate(): string {
  return DEFAULT_TEMPLATE;
}

export function renderTemplate(
  template: string,
  placeholders: Record<string, string>
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(placeholders)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

export function detectPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}
