import { CATEGORIES } from '../../shared/taxonomy.js'
import { truncate, uniqueBy } from '../lib/text.js'

/**
 * Rule-based project idea generator.
 *
 * This is a real generator, not a placeholder: it reads the hackathon's actual
 * published themes, tracks, technology list, eligibility and judging criteria,
 * then composes project concepts from a domain-archetype library that is
 * selected by those real signals. Every returned idea therefore reflects
 * something the organiser actually published.
 *
 * `source: 'rule-based'` is always stamped on the output so the UI can state
 * plainly that these are suggestions derived from the event, not official
 * requirements — and never a guarantee of selection or a prize.
 */

// ---------------------------------------------------------------------------
// Domain archetypes. Each is a distinct product concept family within a
// category, with the ingredients needed to describe and build a project.
// ---------------------------------------------------------------------------

const ARCHETYPES = {
  'artificial-intelligence': [
    {
      key: 'triage-copilot',
      nameTemplate: '{theme} Triage Copilot',
      problem:
        'Domain experts spend most of their time on repetitive first-pass review instead of the decisions that actually need judgement.',
      users: 'Operations leads and reviewers who handle high volume of incoming work',
      features: [
        'Ingest unstructured input (text, image, audio, CSV) and normalise it',
        'Model produces a ranked recommendation with a confidence score',
        'Every decision is logged with the evidence the model used',
        'Human override with a one-click correction that improves the next run',
      ],
      steps: [
        'Collect a small labelled sample of real inputs and expected outcomes',
        'Build a baseline classifier or prompting pipeline and measure accuracy',
        'Add retrieval over a document/knowledge base so answers are grounded',
        'Ship a queue UI with accept / reject / escalate actions',
        'Add evaluation on a held-out set and log drift over time',
      ],
      demo: [
        'Run the same input through the model, then a human, and show the delta',
        'Show the correction loop improving a second identical input live',
      ],
    },
    {
      key: 'agent-workflow',
      nameTemplate: 'Autonomous {theme} Workflow Agent',
      problem:
        'Multi-step operational work is passed between tools by hand, losing context and accumulating silent errors.',
      users: 'Operations teams that orchestrate several SaaS tools in sequence',
      features: [
        'Goal entry with automatic task decomposition into ordered steps',
        'Tool use against at least two real APIs, with retry and idempotency',
        'Persistent plan state that survives a page refresh',
        'Approval gate before any irreversible action',
      ],
      steps: [
        'Pick one real workflow and write down its steps and failure modes',
        'Implement a planner that emits a structured, inspectable plan',
        'Wire two tool integrations with schema-validated arguments',
        'Add a checkpoint/approval step and structured audit logging',
        'Demo end to end and show the audit trail for one failure case',
      ],
      demo: [
        'Start with a real messy request and show the plan appear step by step',
        'Force a tool failure and show the agent recovering without losing state',
      ],
    },
    {
      key: 'multimodal-insight',
      nameTemplate: '{theme} Multimodal Insight Layer',
      problem:
        'Rich data is split across screenshots, documents and logs, so nobody can search across all of it at once.',
      users: 'Analysts and support engineers who need to find an answer in mixed evidence',
      features: [
        'Cross-modal index over text, image and tabular inputs',
        'Natural-language query returning evidence-linked results',
        'Automatic tagging with confidence and human correction',
        'Exportable report with every claim linked to its source artefact',
      ],
      steps: [
        'Assemble a dataset spanning at least two modalities',
        'Embed each modality and store them in one vector store',
        'Build hybrid retrieval (keyword + vector) with re-ranking',
        'Generate a summary that cites its source artefact ids',
        'Add a feedback control to measure retrieval quality',
      ],
      demo: [
        'Ask one question that no single modality could answer alone',
        'Show a wrong answer and the evidence that exposed it',
      ],
    },
  ],
  'machine-learning': [
    {
      key: 'forecasting-service',
      nameTemplate: '{theme} Forecasting Service',
      problem: 'Planning decisions are made on gut feel because no reliable forecast exists for the quantity that matters.',
      users: 'Operations or finance teams who plan on a weekly or monthly cadence',
      features: [
        'Baseline model (naive/seasonal) alongside the submitted model',
        'Proper time-series split — no shuffling, no leakage',
        'Backtest dashboard showing MAE/RMSE against the baseline',
        'Scheduled retraining with drift detection',
      ],
      steps: [
        'Define the prediction target and the exact decision it improves',
        'Build the naive baseline first and record its score',
        'Add features with strict lag handling to avoid leakage',
        'Backtest across multiple rolling windows, not one split',
        'Expose a prediction endpoint plus a simple monitoring chart',
      ],
      demo: [
        'Show the naive baseline beating your first model, then fix it honestly',
        'Show drift detection firing after you perturb the input distribution',
      ],
    },
    {
      key: 'model-observability',
      nameTemplate: '{theme} Model Observability Console',
      problem: 'Teams cannot tell whether a model is degrading, drifting, or simply being used differently.',
      users: 'ML engineers and product teams who depend on a model in production',
      features: [
        'Live prediction log with input/output/​latency capture',
        'Data drift and prediction drift dashboards',
        'Slice-level metrics that expose per-segment failure',
        'Alerting when a metric leaves its baseline band',
      ],
      steps: [
        'Wrap any model behind a logging middleware',
        'Store predictions and compute reference vs current distributions',
        'Implement PSI or KL drift on numeric and categorical features',
        'Add slice metrics (e.g. by region, device, language)',
        'Trigger and demo a real alert end to end',
      ],
      demo: [
        'Inject drift on purpose and watch the alert fire within a minute',
        'Show a slice that fails badly while the overall metric looks healthy',
      ],
    },
  ],
  'web-development': [
    {
      key: 'collab-tool',
      nameTemplate: 'Realtime {theme} Collaboration Board',
      problem: 'Small teams coordinate work across chat, losing the state of what was decided and by whom.',
      users: 'Small remote teams and student project groups',
      features: [
        'Realtime multi-user editing with presence indicators',
        'Conflict-free merge using operational transform or CRDTs',
        'Comment threads anchored to specific items',
        'Activity history with per-item attribution',
      ],
      steps: [
        'Model the shared state and pick a conflict strategy',
        'Ship a server-sent-events or websocket channel with presence',
        'Implement the merge function and test it with concurrent edits',
        'Add anchoring, threading and a permission check per action',
        'Add an export path that produces a real shareable artifact',
      ],
      demo: [
        'Open two browser windows and edit the same field simultaneously',
        'Kill the network mid-edit, reconnect, and show state reconciling',
      ],
    },
    {
      key: 'performance-tool',
      nameTemplate: '{theme} Performance Observatory',
      problem: 'Teams optimise blind because they cannot see which change actually improved the experience.',
      users: 'Frontend and platform engineers responsible for Core Web Vitals',
      features: [
        'Automated Lighthouse-style lab measurements on a schedule',
        'Real-user field metrics collected from a real page',
        'Lab vs RUM correlation view',
        'Regression alert attached to a specific commit range',
      ],
      steps: [
        'Build an automated measurement runner against a target URL',
        'Store time-series metrics with commit metadata',
        'Add a simple RUM beacon script to a page you control',
        'Correlate lab and field data in one view',
        'Wire an alert to a deliberately introduced regression',
      ],
      demo: [
        'Introduce a real 300 KB image and show the metric move immediately',
        'Show the alert firing in CI on a deliberately bad commit',
      ],
    },
  ],
  'app-development': [
    {
      key: 'offline-first',
      nameTemplate: 'Offline-First {theme} Field App',
      problem: 'Field work stops the moment connectivity does, because the app assumes a network.',
      users: 'Field technicians, delivery staff, or researchers working in low-connectivity areas',
      features: [
        'Local-first persistence with a durable write queue',
        'Conflict resolution with a user-visible merge step',
        'Background sync with retry and backoff',
        'Full functionality with the network disabled',
      ],
      steps: [
        'Define the entity model and pick the local store',
        'Build every screen reading from local state only',
        'Implement the sync engine and the conflict policy',
        'Add an explicit conflict resolution UI',
        'Test in airplane mode throughout development',
      ],
      demo: [
        'Enable airplane mode and complete the whole workflow',
        'Sync two devices that diverged and show the merge UI resolving it',
      ],
    },
  ],
  cybersecurity: [
    {
      key: 'detection-tool',
      nameTemplate: '{theme} Threat Detection Pipeline',
      problem: 'Suspicious activity is buried in log volume and never surfaces before damage is done.',
      users: 'SOC analysts and small security teams without enterprise tooling',
      features: [
        'Log ingestion with schema normalisation across formats',
        'Rule and statistical-anomaly detection over a sliding window',
        'Alert deduplication and severity scoring',
        'Incident timeline with the raw evidence attached',
      ],
      steps: [
        'Source a real public log dataset and normalise the format',
        'Implement detection rules with a documented rationale each',
        'Add alert correlation so one incident is not twenty alerts',
        'Build a timeline view with raw evidence drill-down',
        'Validate against known attack patterns in the dataset',
      ],
      demo: [
        'Replay a real attack capture and show the alert fire at the right moment',
        'Show the analyst dismissing a false positive and the rule tuning',
      ],
    },
    {
      key: 'privacy-tool',
      nameTemplate: 'Privacy Leak {theme} Auditor',
      problem: 'Applications leak identifying information into analytics, logs and third-party calls without anyone noticing.',
      users: 'Developers and privacy reviewers auditing an application before release',
      features: [
        'Instrumented HTTP proxy that captures every outbound request',
        'PII detection across URLs, headers, bodies and local storage',
        'Severity-ranked report with exact remediation suggestions',
        'Regression check that fails CI when a new leak appears',
      ],
      steps: [
        'Build or adapt a local intercepting proxy',
        'Write detectors for emails, tokens, coordinates and device IDs',
        'Score findings by sensitivity and exposure',
        'Produce a shareable report with reproducible steps',
        'Add a CI mode that fails the build on new high-severity findings',
      ],
      demo: [
        'Load a real site and show PII leaving the browser in the report',
        'Show the CI check catching a leak you deliberately re-introduce',
      ],
    },
  ],
  'blockchain-web3': [
    {
      key: 'verifiable-credentials',
      nameTemplate: 'Verifiable {theme} Credential Layer',
      problem: 'Claims about skills, contributions or achievements are self-asserted and cannot be checked.',
      users: 'Communities, organisers and employers verifying participation records',
      features: [
        'Issuer signs an off-chain claim hash as an on-chain attestation',
        'Holder proves ownership without publishing personal data',
        'Verifier validates issuer, expiry and revocation in one click',
        'Revocation list checked at verification time',
      ],
      steps: [
        'Define the credential schema and what it deliberately excludes',
        'Deploy the attestation and revocation contracts to a local chain',
        'Build issuer, holder and verifier flows against those contracts',
        'Add expiry and revocation checks in the verifier',
        'Write tests that attempt to forge and reuse an attestation',
      ],
      demo: [
        'Verify a genuine credential, then tamper with the payload to show rejection',
        'Revoke a credential live and show an existing proof failing',
      ],
    },
  ],
  'game-development': [
    {
      key: 'systems-driven',
      nameTemplate: 'Systems-Driven {theme} Arena',
      problem: 'Most game prototypes rely on scripted outcomes rather than systems that produce interesting play.',
      users: 'Players, and technically-minded judges evaluating game feel',
      features: [
        'Emergent interaction from a small set of interacting systems',
        'Procedural generation with a fixed seed for reproducibility',
        'Meaningful player choices with visible trade-offs',
        'A replay/telemetry view of what actually happened',
      ],
      steps: [
        'Prototype one mechanic to a genuinely fun state before adding content',
        'Replace scripted encounters with system-driven generation',
        'Add a seed so every judge run is identical and fair',
        'Instrument telemetry to prove emergence happened',
        'Tune difficulty from recorded play data, not intuition',
      ],
      demo: [
        'Show the same seed producing a different run after one player choice',
        'Show the telemetry proving the outcome was not scripted',
      ],
    },
  ],
  robotics: [
    {
      key: 'edge-perception',
      nameTemplate: 'Edge {theme} Perception Node',
      problem: 'Continuous sensing is too expensive to run in the cloud, so analysis happens too late to matter.',
      users: 'Operators monitoring equipment or sites around the clock',
      features: [
        'On-device inference with a published latency budget',
        'Local event buffering so nothing is lost during an outage',
        'Configurable alert thresholds tuned on recorded data',
        'Battery and thermal budget reported alongside accuracy',
      ],
      steps: [
        'Target one specific detection task, not "detect everything"',
        'Quantise and benchmark the model to hit the latency target',
        'Build the buffer-and-replay path for network outages',
        'Tune thresholds against a labelled recording',
        'Report accuracy per watt as the headline metric',
      ],
      demo: [
        'Run entirely with the network cable unplugged',
        'Show accuracy-per-watt against an unquantised baseline',
      ],
    },
  ],
  'cloud-computing': [
    {
      key: 'cost-guard',
      nameTemplate: '{theme} Cost & Reliability Guard',
      problem: 'Cloud spend and reliability problems are discovered on the invoice and the incident channel.',
      users: 'Platform teams and small engineering organisations without a FinOps function',
      features: [
        'Tag-based cost attribution with anomaly detection',
        'Availability SLO tracking with burn-rate alerting',
        'One-click rightsizing recommendations with a safety check',
        'Weekly report that ranks findings by estimated saving',
      ],
      steps: [
        'Pull real billing and telemetry data from a free tier account',
        'Implement tag-based attribution and a cost anomaly detector',
        'Define an SLO and calculate multi-window burn rate',
        'Generate rightsizing suggestions that never delete a resource',
        'Package the findings into an automated weekly digest',
      ],
      demo: [
        'Show a real cost spike detected automatically within an hour',
        'Apply a recommendation and show the projected saving calculated',
      ],
    },
  ],
  'open-innovation': [
    {
      key: 'civic-access',
      nameTemplate: 'Accessible {theme} Service Finder',
      problem: 'Public services are fragmented across agencies, so eligible people do not find the support available to them.',
      users: 'Citizens navigating public services, and the case workers who support them',
      features: [
        'Eligibility screener with plain-language explanations',
        'Referral to the correct service with a printable summary',
        'Accessibility first: keyboard complete, screen-reader tested',
        'Offline mode for users without reliable connectivity',
      ],
      steps: [
        'Interview or research the real eligibility rules for one service',
        'Build the screener as a transparent decision list, not a black box',
        'Produce a printable one-page summary the user can hand to an officer',
        'Test with a screen reader and fix every issue found',
        'Add a feedback loop for corrections from real users',
      ],
      demo: [
        'Have a judge use the tool to find a service for a fictional scenario',
        'Complete the whole flow using only the keyboard',
      ],
    },
  ],
  sustainability: [
    {
      key: 'carbon-accounting',
      nameTemplate: 'Small-Scale {theme} Carbon Ledger',
      problem: 'Emissions are estimated once a year in a spreadsheet, so nothing can be changed in between.',
      users: 'Facilities managers and small operations teams without dedicated sustainability staff',
      features: [
        'Automatic ingestion from utility or IoT meter feeds',
        'Emission factor versioning so historic values stay reproducible',
        'Anomaly detection on consumption profiles',
        'Actionable reduction recommendations ranked by payback',
      ],
      steps: [
        'Take one real consumption dataset and document its units precisely',
        'Implement a versioned emission factor table with provenance',
        'Detect anomalies such as a meter reading that never varies',
        'Rank reduction actions by impact and payback period',
        'Recompute historic values correctly after a factor revision',
      ],
      demo: [
        'Revise an emission factor and show historic reports change consistently',
        'Detect a simulated meter fault that looks like normal consumption',
      ],
    },
  ],
  fintech: [
    {
      key: 'fraud-signals',
      nameTemplate: 'Explainable {theme} Fraud Signals',
      problem: 'Fraud rules either miss novel attacks or block legitimate customers, and nobody can tell which.',
      users: 'Payments risk analysts at small financial institutions',
      features: [
        'Behavioural baseline per user rather than per rule',
        'Every score decomposed into its contributing signals',
        'Threshold simulator showing the fraud/​friction trade-off',
        'Analyst feedback loop that adjusts thresholds with an audit trail',
      ],
      steps: [
        'Use a public transaction dataset with documented labels',
        'Build a per-user behavioural baseline',
        'Make each score fully explainable — no opaque single number',
        'Build the threshold simulator and quantify the trade-off',
        'Add an analyst override path that feeds back into tuning',
      ],
      demo: [
        'Drag a threshold and show precision/recall move in real time',
        'Explain one flagged transaction in terms a human can verify',
      ],
    },
  ],
  'ui-ux-design': [
    {
      key: 'accessibility-audit',
      nameTemplate: '{theme} Accessibility Audit Studio',
      problem: 'Accessibility is checked late, by hand, and fixes are not tracked to completion.',
      users: 'Design and engineering teams shipping without dedicated accessibility staff',
      features: [
        'Automated WCAG checks combined with a manual audit workflow',
        'Issue tracking with owner, priority and verification state',
        'Design-token contrast enforcement at build time',
        'Before/after evidence capture for every fix',
      ],
      steps: [
        'Run a real audit on a live page and triage the actual findings',
        'Build the issue model with verification state transitions',
        'Add a build-time contrast check against your design tokens',
        'Capture before/after evidence for the top five fixes',
        'Validate with a screen reader on the fixed version',
      ],
      demo: [
        'Run the audit live on a site the judges choose',
        'Show a fix verified as complete, with evidence attached',
      ],
    },
  ],
  'data-science': [
    {
      key: 'open-dashboard',
      nameTemplate: 'Open {theme} Data Commons Dashboard',
      problem: 'Public datasets exist but are unusable because the definitions and cleaning steps are undocumented.',
      users: 'Journalists, researchers and citizens who want to interrogate public data',
      features: [
        'Documented, versioned ETL with every assumption written down',
        'Interactive exploration with fast server-side aggregation',
        'Every figure exportable with its data lineage attached',
        'Reproducible "how was this computed" panel',
      ],
      steps: [
        'Find a real public dataset and write down its caveats honestly',
        'Build a reproducible ETL script with schema validation',
        'Design aggregation queries that stay fast as the data grows',
        'Attach lineage metadata to each published figure',
        'Document the pipeline so a stranger can rerun it',
      ],
      demo: [
        'Show a question the dashboard answers in under two seconds',
        'Show the lineage for any number visible on screen',
      ],
    },
  ],
}

const DEFAULT_ARCHETYPE = {
  key: 'applied-solution',
  nameTemplate: '{theme} Applied Solution',
  problem:
    'Teams working on {theme} lack a single tool that fits their actual workflow, so they assemble fragile workarounds.',
  users: 'Practitioners who work with {theme} data or processes daily',
  features: [
    'A clear core workflow that replaces the current manual process',
    'Import from and export to the formats the team already uses',
    'Validation and error reporting that is specific enough to act on',
    'Measurable before/after against the manual baseline',
  ],
  steps: [
    'Map the current manual process and quantify where the time goes',
    'Build the narrowest end-to-end version that saves real time',
    'Add import/export for the two formats the team actually uses',
    'Write specific, actionable error messages',
    'Measure against the baseline and publish the numbers',
  ],
  demo: [
    'Run the old process, then the new one, on the same real input',
    'Show the measured time or error-rate difference',
  ],
}

const STACKS = {
  'artificial-intelligence': ['Python', 'FastAPI', 'React', 'PostgreSQL + pgvector', 'LangChain'],
  'machine-learning': ['Python', 'scikit-learn', 'FastAPI', 'Streamlit', 'MLflow'],
  'web-development': ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'WebSockets'],
  'app-development': ['React Native', 'Expo', 'SQLite (local-first)', 'TanStack Query'],
  cybersecurity: ['Python', 'Scapy', 'FastAPI', 'React', 'DuckDB'],
  'blockchain-web3': ['Solidity', 'Hardhat', 'ethers.js', 'React', 'IPFS'],
  'game-development': ['TypeScript', 'Phaser', 'WebGL', 'Node.js'],
  robotics: ['Python', 'PyTorch', 'Raspberry Pi / ESP32', 'MQTT', 'FastAPI'],
  'cloud-computing': ['Python', 'AWS SDK', 'Terraform', 'Grafana', 'React'],
  'open-innovation': ['TypeScript', 'Next.js', 'PostgreSQL', 'MapLibre GL', 'Tailwind CSS'],
  sustainability: ['Python', 'TimescaleDB', 'IoT MQTT', 'React', 'Grafana'],
  fintech: ['Python', 'XGBoost', 'FastAPI', 'React', 'PostgreSQL'],
  'ui-ux-design': ['Figma', 'React', 'Tailwind CSS', 'axe-core', 'Storybook'],
  'data-science': ['Python', 'Polars', 'DuckDB', 'Streamlit', 'Apache Airflow'],
}

export const TIME_ESTIMATES = {
  beginner: '36–48 hours',
  intermediate: '48–72 hours',
  advanced: '72–120 hours',
}

const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 }

// ---------------------------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------------------------

/** Read the event's own published signals. */
export function extractSignals(hackathon) {
  const themes = (hackathon.themes ?? []).filter(Boolean)
  const technologies = (hackathon.technologies ?? []).filter(Boolean)
  const title = hackathon.title ?? ''

  // The single most specific theme: prefer a source-published theme, else the
  // part of the title after the event name.
  const primaryTheme =
    themes[0] ??
    title
      .split(/[:–—-]/)[1]
      ?.trim() ??
    hackathon.category?.replace(/-/g, ' ') ??
    'the challenge'

  return {
    theme: truncate(String(primaryTheme).trim() || 'the challenge', 60),
    themes,
    technologies,
    category: hackathon.category ?? 'open-innovation',
    eligibility: hackathon.eligibility ?? null,
    teamSize: hackathon.teamSize ?? null,
    judgingCriteria: hackathon.judgingCriteria ?? null,
    description: hackathon.description ?? '',
    title,
  }
}

/**
 * Difficulty signals derived only from what the event states.
 * Returns nulls when the event publishes nothing to judge by — we never
 * invent an eligibility level.
 */
export function inferDifficulty(signals) {
  const { category, technologies, eligibility, judgingCriteria } = signals
  let score = 0
  const reasons = []

  const advancedAreas = ['blockchain-web3', 'robotics', 'machine-learning', 'artificial-intelligence']
  const beginnerAreas = ['ui-ux-design', 'web-development', 'data-science']

  if (advancedAreas.includes(category)) {
    score += 1
    reasons.push(`the ${category.replace(/-/g, ' ')} track usually needs model or systems work`)
  }
  if (beginnerAreas.includes(category)) score -= 1

  const stackMentions = technologies.filter((t) =>
    ['Rust', 'Solidity', 'C++', 'C#', 'ROS', 'PyTorch', 'TensorFlow', 'ESP32', 'Kubernetes'].includes(t),
  ).length
  if (stackMentions >= 2) {
    score += 1
    reasons.push(`the suggested stack includes ${stackMentions} specialist technologies`)
  }

  if (/experienced|advanced|prior (?:experience|knowledge) (?:required|in)|intermediate|professional/i.test(eligibility ?? '')) {
    score += 2
    reasons.push('eligibility asks for prior experience')
  }
  if (/no prior experience|beginner|students|any (?:skill )?level|all (?:skill )?levels/i.test(eligibility ?? '')) {
    score -= 2
    reasons.push('eligibility explicitly welcomes beginners')
  }
  if ((judgingCriteria ?? '').length > 80) {
    reasons.push('judging weights are published, so criteria can be optimised against')
  }

  let difficulty
  if (score <= -1) difficulty = 'beginner'
  else if (score >= 2) difficulty = 'advanced'
  else difficulty = 'intermediate'

  return { difficulty, score, reasons: reasons.slice(0, 3) }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function fill(template, theme) {
  return template.replace(/\{theme\}/g, theme)
}

/**
 * One-line description of what gets built.
 *
 * This is deliberately not `problem` restated. An earlier version set
 * `summary` to a truncated copy of `problem`, so for every archetype shorter than
 * the 400-character cap the two fields were byte-identical and the summary
 * carried no information the problem statement did not. A card showing an idea
 * needs to answer "what is this?" at a glance, which is a different question
 * from "what hurts?".
 *
 * Composed from data already in the archetype — who it is for, how hard it is,
 * and the first milestone — so it stays grounded in the same real signals the
 * rest of the idea is built from, and adds no new claims.
 */
function composeSummary({ archetype, theme, difficulty, category }) {
  const label = CATEGORIES.find((c) => c.key === category)?.label ?? 'software'
  const firstMilestone = (archetype.features ?? [])[0]
  // Only "intermediate" takes an article. "a beginner"/"an advanced" are wrong.
  const article = /^[aeiou]/i.test(difficulty) ? 'An' : 'A'
  const parts = [
    // Decapitalising rather than lowercasing the audience prose is what keeps
    // acronyms like "SaaS" intact — a blanket .toLowerCase() renders them as
    // "saas", which reads as a typo in generated copy.
    `${article} ${difficulty} ${label.toLowerCase()} project for ${decapitalise(fill(archetype.users, theme))}.`,
  ]
  // Left as a labelled milestone rather than woven into a sentence: the feature
  // strings are imperative ("Ingest unstructured input…"), so anything like "it
  // starts by ingest…" would be ungrammatical. A label preserves the original
  // wording and still reads correctly.
  if (firstMilestone) {
    parts.push(`First milestone: ${decapitalise(firstMilestone, { keepLeadingCapitals: true })}.`)
  }
  return parts.join(' ').slice(0, 400)
}

/**
 * Lower-case only the first letter, and only when the word is not an acronym.
 *
 * Blunt `.toLowerCase()` turned "SaaS tools" into "saas tools" and "AI-assisted
 * review" into "ai-assisted review", which reads as a typo in generated prose.
 */
function decapitalise(text, { keepLeadingCapitals = false } = {}) {
  const value = String(text ?? '').trim()
  if (!value) return ''
  // A second capital in the first word means it is an initialism (SaaS, IoT, API).
  if (keepLeadingCapitals && /^[A-Za-z][a-z]?[A-Z]/.test(value)) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}

/**
 * Generate distinct project ideas for a hackathon.
 *
 * @param {object} hackathon
 * @param {object} options
 * @param {number} options.count    how many ideas
 * @param {number} options.offset   shifts the selection — "regenerate" increments
 * @param {string[]} options.difficulty  restrict to difficulty levels
 * @param {string[]} options.technologies restrict to ideas using these technologies
 * @param {string} options.stackPreference  extra tech the idea should use
 */
export function generateIdeas(hackathon, options = {}) {
  const { count = 3, offset = 0, difficulty: difficultyFilter, technologies: techFilter } = options
  const signals = extractSignals(hackathon)
  const library = ARCHETYPES[signals.category] ?? [DEFAULT_ARCHETYPE]
  const inferred = inferDifficulty(signals)
  const baseStack = STACKS[signals.category] ?? ['TypeScript', 'React', 'Node.js', 'PostgreSQL']

  // Build a larger candidate pool than requested so that filtering by
  // difficulty or technology still leaves enough results.
  //
  // The pool interleaves archetype and rotation rather than exhausting one
  // rotation first. Grouping by rotation meant the first N candidates all came
  // from rotation 0, so every idea came back with the identical suggested stack
  // and the same difficulty — the variation below was computed and thrown away.
  const pool = []
  const rotations = Math.max(3, Math.ceil((count + 2) / Math.max(1, library.length)))
  for (let index = 0; index < library.length; index += 1) {
    for (let rotation = 0; rotation < rotations; rotation += 1) {
      pool.push({ archetype: library[index], index, rotation })
    }
  }

  const seen = new Set()
  const seenNames = new Set()
  const ideas = []

  for (const candidate of pool) {
    if (ideas.length >= count) break
    const { archetype, index, rotation } = candidate
    const key = `${archetype.key}:${rotation}`
    if (seen.has(key)) continue

    // Vary difficulty across the pool so "Generate" returns a spread.
    const shift = ((index + rotation + offset) % 3) - 1
    const rank = Math.min(2, Math.max(0, DIFFICULTY_RANK[inferred.difficulty] + shift))
    const difficulty = ['beginner', 'intermediate', 'advanced'][rank]

    // Rotate the stack so each suggestion leans on a different technology. The
    // technologies the source itself named are always kept at the front; the
    // archetype's own stack fills the remaining slots from a rotating window, so
    // three ideas for one event genuinely recommend three different stacks.
    const start = (index + rotation) % baseStack.length
    const rotated = [...baseStack.slice(start), ...baseStack.slice(0, start)]
    const stack = uniqueBy(
      [...signals.technologies.slice(0, 2), ...rotated],
      (t) => String(t).toLowerCase(),
    ).slice(0, 5)

    const theme = signals.themes[(index + rotation) % Math.max(1, signals.themes.length)] ?? signals.theme
    const name = fill(archetype.nameTemplate, theme)

    // An event with a single published theme produces the same project name on
    // every rotation of the same archetype. Showing "AI Triage Copilot" twice
    // on one screen reads as a bug, so a repeated name is skipped outright and
    // the caller is told how many distinct concepts actually exist.
    const nameKey = name.trim().toLowerCase()
    if (seenNames.has(nameKey)) continue

    seen.add(key)
    seenNames.add(nameKey)

    ideas.push({
      title: name,
      summary: composeSummary({ archetype, theme, difficulty, category: signals.category }),
      problem: fill(archetype.problem, theme),
      targetUsers: fill(archetype.users, theme),
      difficulty,
      technologies: stack,
      keyFeatures: archetype.features,
      implementationSteps: archetype.steps,
      estimatedTime: TIME_ESTIMATES[difficulty],
      demoTips: archetype.demo,
      source: 'rule-based',
      derivedFrom: {
        themes: signals.themes.slice(0, 5),
        category: signals.category,
        difficultySignals: inferred.reasons,
      },
    })
  }

  let result = ideas

  if (difficultyFilter?.length) {
    const allowed = new Set(difficultyFilter.map((d) => d.toLowerCase()))
    const filtered = result.filter((i) => allowed.has(i.difficulty))
    // A filter that matches nothing would otherwise show an empty panel with no
    // explanation, so an over-narrow filter falls back to the unfiltered set.
    if (filtered.length) result = filtered
  }

  if (techFilter?.length) {
    const allowed = techFilter.map((t) => t.toLowerCase())
    const filtered = result.filter((i) =>
      i.technologies.some((t) => allowed.includes(String(t).toLowerCase())),
    )
    if (filtered.length) result = filtered
  }

  return result.slice(0, count)
}

/**
 * How many distinct concepts the archetype library can produce for this event.
 *
 * The UI shows this instead of implying that a short result set is a failure —
 * a single-theme AI track genuinely has three concepts, not six.
 */
export function availableConceptCount(hackathon) {
  const signals = extractSignals(hackathon)
  const library = ARCHETYPES[signals.category] ?? [DEFAULT_ARCHETYPE]
  const themeCount = Math.max(1, signals.themes.length)
  // Distinct names come from (archetype × theme) pairs, capped by the library.
  return Math.min(library.length * themeCount, 24)
}

/** Plain-text export used by the "Copy" button. */
export function ideaToText(idea, hackathon) {
  const lines = [
    `${idea.title}`,
    hackathon ? `For: ${hackathon.title} (${hackathon.organizer ?? 'organiser not published'})` : null,
    '',
    `Problem: ${idea.problem}`,
    `Target users: ${idea.targetUsers}`,
    `Difficulty: ${idea.difficulty} (${idea.estimatedTime})`,
    `Suggested stack: ${idea.technologies.join(', ')}`,
    '',
    'Key features:',
    ...idea.keyFeatures.map((f) => `  - ${f}`),
    '',
    'Implementation steps:',
    ...(idea.implementationSteps ?? []).map((s, i) => `  ${i + 1}. ${s}`),
    '',
    'How to demo it:',
    ...(idea.demoTips ?? []).map((d) => `  - ${d}`),
    '',
    idea.source === 'ai'
      ? 'Generated by AI from this event’s published themes. Not an official requirement, and not a guarantee of selection.'
      : 'Rule-based suggestion derived from this event’s published themes and technologies. Not an official requirement, and not a guarantee of selection.',
  ]
  return lines.filter((l) => l !== null).join('\n')
}

export const CATEGORY_LIST = CATEGORIES
