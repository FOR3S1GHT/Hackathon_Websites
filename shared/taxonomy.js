/**
 * Canonical taxonomy shared by the backend classifier and the frontend UI.
 *
 * Categories are intentionally coarse (14 buckets). Every hackathon is mapped
 * to exactly one primary category so the UI stays legible, while `technologies`
 * and `themes` carry the fine-grained detail harvested from the source.
 */

export const CATEGORIES = [
  {
    key: 'artificial-intelligence',
    label: 'Artificial Intelligence',
    blurb: 'Agents, reasoning, computer vision, generative models.',
    keywords: ['artificial intelligence', 'ai', 'genai', 'generative ai', 'llm', 'llms', 'agent', 'agentic', 'large language model', 'prompt engineering', 'chatbot', 'copilot', 'computer vision'],
    tech: ['Python', 'PyTorch', 'TensorFlow', 'LangChain', 'OpenAI', 'Hugging Face', 'Computer Vision'],
    patterns: [/\bgen(erative)?\s?ai\b/i, /\bllms?\b/i, /\bai\b/, /large language model/i, /\bagentic\b/i],
  },
  {
    key: 'machine-learning',
    label: 'Machine Learning',
    blurb: 'Model training, applied ML, data-driven prediction.',
    keywords: ['machine learning', 'ml', 'deep learning', 'neural network', 'model training', 'mlops', 'nlp', 'predictive analytics', 'model deployment', 'feature engineering'],
    tech: ['Python', 'scikit-learn', 'PyTorch', 'TensorFlow', 'Keras', 'Jupyter', 'Pandas', 'XGBoost'],
    patterns: [/\bmachine learning\b/i, /\bdeep learning\b/i, /\bmlops\b/i, /\bnlp\b/i, /neural network/i],
  },
  {
    key: 'web-development',
    label: 'Web Development',
    blurb: 'Full-stack products, APIs, frameworks and the open web.',
    keywords: ['web development', 'web dev', 'frontend', 'front-end', 'backend', 'full stack', 'fullstack', 'website', 'web app', 'api', 'javascript', 'typescript'],
    tech: ['React', 'Next.js', 'Vue', 'Nuxt', 'Svelte', 'Node.js', 'Express', 'Django', 'FastAPI', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Tailwind CSS'],
    patterns: [/\bweb\s?dev/i, /\bfull[\s-]?stack\b/i, /\bfront[\s-]?end\b/i],
  },
  {
    key: 'app-development',
    label: 'App Development',
    blurb: 'Mobile, desktop and cross-platform application engineering.',
    keywords: ['mobile', 'android', 'ios', 'flutter', 'react native', 'app development', 'application', 'cross platform', 'swift', 'kotlin', 'desktop'],
    tech: ['Flutter', 'React Native', 'Android', 'Kotlin', 'Swift', 'SwiftUI', 'Jetpack Compose', 'Expo'],
    patterns: [/\bmobile\b/i, /\bandroid\b/i, /\bflutter\b/i, /react native/i, /\bios\b/i],
  },
  {
    key: 'cybersecurity',
    label: 'Cybersecurity',
    blurb: 'Defence, CTF, privacy, fraud detection and secure systems.',
    keywords: ['cybersecurity', 'cyber security', 'security', 'infosec', 'ctf', 'capture the flag', 'hacking', 'privacy', 'fraud', 'threat', 'vulnerability'],
    tech: ['Burp Suite', 'Kali Linux', 'Solidity', 'Rust', 'Wireshark', 'Metasploit', 'Cryptography'],
    patterns: [/\bcyber ?security\b/i, /\bctf\b/i, /capture the flag/i, /\binfosec\b/i],
  },
  {
    key: 'blockchain-web3',
    label: 'Blockchain & Web3',
    blurb: 'Smart contracts, tokens, DeFi and decentralised systems.',
    keywords: ['blockchain', 'web3', 'web 3', 'defi', 'smart contract', 'crypto', 'cryptocurrency', 'ethereum', 'solana', 'nft', 'dao', 'wallet'],
    tech: ['Solidity', 'Ethereum', 'Hardhat', 'Solana', 'Rust', 'Move', 'Web3.js', 'ethers.js', 'IPFS'],
    patterns: [/\bblock ?chain\b/i, /\bweb ?3\b/i, /\bdefi\b/i, /smart contract/i, /\bethereum\b/i, /\bsolana\b/i],
  },
  {
    key: 'game-development',
    label: 'Game Development',
    blurb: 'Interactive worlds, engines and playable experiences.',
    keywords: ['game development', 'gamedev', 'game jam', 'unity', 'unreal engine', 'godot', 'gameplay', 'metaverse', 'virtual reality', 'augmented reality', 'game engine', 'esports'],
    tech: ['Unity', 'Unreal Engine', 'Godot', 'C#', 'C++', 'Phaser', 'Three.js', 'WebGL'],
    patterns: [/\bgame ?(dev|jam)\b/i, /\bunity\b/i, /unreal engine/i, /\bgodot\b/i, /\bvr\b/i, /\bxr\b/i, /metaverse/i, /virtual reality/i],
  },
  {
    key: 'robotics',
    label: 'Robotics',
    blurb: 'Hardware, embedded systems, drones and autonomous machines.',
    keywords: ['robotics', 'robot', 'iot', 'embedded', 'hardware', 'drone', 'autonomous', 'arduino', 'raspberry pi', 'edge ai', 'computer vision'],
    tech: ['Arduino', 'Raspberry Pi', 'ESP32', 'ROS', 'C++', 'TensorFlow Lite', 'Jetson', 'MQTT'],
    patterns: [/\brobot/i, /\biot\b/i, /embedded/i, /raspberry pi/i, /\bdrone/i, /autonomous/i],
  },
  {
    key: 'cloud-computing',
    label: 'Cloud & DevOps',
    blurb: 'Infrastructure, serverless, observability and scale.',
    keywords: ['cloud', 'devops', 'infrastructure', 'serverless', 'kubernetes', 'docker', 'microservices', 'distributed systems', 'platform engineering', 'observability'],
    tech: ['AWS', 'Google Cloud', 'Azure', 'Kubernetes', 'Docker', 'Terraform', 'Serverless', 'Grafana', 'Linux'],
    patterns: [/\bcloud\b/i, /\bdevops\b/i, /kubernetes/i, /serverless/i, /\bdocker\b/i],
  },
  {
    key: 'open-innovation',
    label: 'Open Innovation',
    blurb: 'Open source, civic tech, hack-for-good and social impact.',
    keywords: ['open source', 'open innovation', 'open data', 'civic', 'social impact', 'sustainability', 'govtech', 'accessibility', 'a11y', 'for good', 'sdg', 'non profit', 'ngo'],
    tech: ['GitHub', 'FOSS', 'PostgreSQL', 'Supabase', 'Mapbox', 'ARIA'],
    patterns: [/open source/i, /social impact/i, /hack for (good|impact)/i, /\bcivic\b/i, /\baccessib/i, /\bsdg\b/i],
  },
  {
    key: 'sustainability',
    label: 'Sustainability & Climate',
    blurb: 'Energy, climate, agriculture and environmental technology.',
    keywords: ['sustainability', 'sustainable', 'climate', 'green', 'energy', 'environment', 'agriculture', 'agritech', 'water', 'carbon', 'renewable', 'esg'],
    tech: ['IoT', 'ESP32', 'Arduino', 'Satellite Imagery', 'Time Series DB', 'Raspberry Pi'],
    patterns: [/sustainab/i, /\bclimate\b/i, /\brenewable\b/i, /\bcarbon\b/i, /\bagritech\b/i, /environment/i],
  },
  {
    key: 'fintech',
    label: 'FinTech',
    blurb: 'Payments, banking, trading and financial inclusion.',
    keywords: ['fintech', 'finance', 'financial', 'payments', 'banking', 'trading', 'investment', 'insurance', 'crypto trading', 'accounting', 'tax'],
    tech: ['Stripe', 'Plaid', 'Blockchain', 'PostgreSQL', 'React', 'Python'],
    patterns: [/\bfintech\b/i, /\bfinancial\b/i, /\bpayments?\b/i, /\bbanking\b/i, /\btrading\b/i],
  },
  {
    key: 'ui-ux-design',
    label: 'UI/UX Design',
    blurb: 'Interface craft, design systems, research and prototyping.',
    keywords: ['ui/ux', 'ui ux', 'ux design', 'user experience', 'user interface', 'product design', 'figma', 'design system', 'design challenge', 'creative design', 'hci', 'human computer interaction', 'design thinking'],
    tech: ['Figma', 'Adobe XD', 'Framer', 'Tailwind CSS', 'Sketch', 'D3.js'],
    patterns: [/\bui\/ux\b/i, /\bux\b/i, /\bui\b/i, /\buser experience\b/i, /\bfigma\b/i, /design (system|challenge|jam)/i, /human computer interaction/i],
  },
  {
    key: 'data-science',
    label: 'Data Science',
    blurb: 'Analytics, visualisation, forecasting and big data.',
    keywords: ['data science', 'data analytics', 'data engineering', 'data visualization', 'data visualisation', 'big data', 'database', 'sql', 'forecasting', 'statistics', 'data pipeline', 'etl'],
    tech: ['Python', 'Pandas', 'NumPy', 'SQL', 'PostgreSQL', 'Tableau', 'Power BI', 'Apache Spark', 'dbt'],
    patterns: [/\bdata science\b/i, /\banalytics\b/i, /visuali[sz]ation/i, /big data/i, /\bdata (?:engineering|pipeline|science)\b/i],
  },
]

export const CATEGORY_KEYS = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))

/**
 * Full technology vocabulary. Values are stored on the hackathon record so the
 * UI can offer real, filtered technology facets derived from actual data.
 */
export const TECHNOLOGIES = [
  { key: 'react', label: 'React' },
  { key: 'nextjs', label: 'Next.js' },
  { key: 'vue', label: 'Vue' },
  { key: 'svelte', label: 'Svelte' },
  { key: 'angular', label: 'Angular' },
  { key: 'typescript', label: 'TypeScript' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'nodejs', label: 'Node.js' },
  { key: 'python', label: 'Python' },
  { key: 'django', label: 'Django' },
  { key: 'flask', label: 'Flask' },
  { key: 'fastapi', label: 'FastAPI' },
  { key: 'java', label: 'Java' },
  { key: 'kotlin', label: 'Kotlin' },
  { key: 'swift', label: 'Swift' },
  { key: 'flutter', label: 'Flutter' },
  { key: 'react-native', label: 'React Native' },
  { key: 'android', label: 'Android' },
  { key: 'ios', label: 'iOS' },
  { key: 'tailwind-css', label: 'Tailwind CSS' },
  { key: 'html', label: 'HTML' },
  { key: 'css', label: 'CSS' },
  { key: 'threejs', label: 'Three.js' },
  { key: 'webgl', label: 'WebGL' },
  { key: 'unity', label: 'Unity' },
  { key: 'unreal', label: 'Unreal Engine' },
  { key: 'godot', label: 'Godot' },
  { key: 'pytorch', label: 'PyTorch' },
  { key: 'tensorflow', label: 'TensorFlow' },
  { key: 'scikit-learn', label: 'scikit-learn' },
  { key: 'keras', label: 'Keras' },
  { key: 'jupyter', label: 'Jupyter' },
  { key: 'langchain', label: 'LangChain' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'huggingface', label: 'Hugging Face' },
  { key: 'pandas', label: 'Pandas' },
  { key: 'numpy', label: 'NumPy' },
  { key: 'postgresql', label: 'PostgreSQL' },
  { key: 'mysql', label: 'MySQL' },
  { key: 'mongodb', label: 'MongoDB' },
  { key: 'firebase', label: 'Firebase' },
  { key: 'supabase', label: 'Supabase' },
  { key: 'sqlite', label: 'SQLite' },
  { key: 'redis', label: 'Redis' },
  { key: 'graphql', label: 'GraphQL' },
  { key: 'rest-api', label: 'REST API' },
  { key: 'aws', label: 'AWS' },
  { key: 'google-cloud', label: 'Google Cloud' },
  { key: 'azure', label: 'Azure' },
  { key: 'vercel', label: 'Vercel' },
  { key: 'netlify', label: 'Netlify' },
  { key: 'docker', label: 'Docker' },
  { key: 'kubernetes', label: 'Kubernetes' },
  { key: 'terraform', label: 'Terraform' },
  { key: 'linux', label: 'Linux' },
  { key: 'git', label: 'Git' },
  { key: 'github', label: 'GitHub' },
  { key: 'solidity', label: 'Solidity' },
  { key: 'ethereum', label: 'Ethereum' },
  { key: 'solana', label: 'Solana' },
  { key: 'web3', label: 'Web3' },
  { key: 'rust', label: 'Rust' },
  { key: 'c', label: 'C' },
  { key: 'cpp', label: 'C++' },
  { key: 'csharp', label: 'C#' },
  { key: 'arduino', label: 'Arduino' },
  { key: 'raspberry-pi', label: 'Raspberry Pi' },
  { key: 'esp32', label: 'ESP32' },
  { key: 'iot', label: 'IoT' },
  { key: 'figma', label: 'Figma' },
  { key: 'sql', label: 'SQL' },
  { key: 'r', label: 'R' },
  { key: 'juli', label: 'Julia' },
  { key: 'dart', label: 'Dart' },
  { key: 'expo', label: 'Expo' },
  { key: 'vuepress', label: 'VuePress' },
]

export const TECHNOLOGY_KEYS = Object.fromEntries(TECHNOLOGIES.map((t) => [t.key, t.label]))

export const EVENT_FORMATS = ['online', 'offline', 'hybrid']
export const STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled']
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced']

export function categoryLabel(key) {
  return CATEGORY_KEYS[key] ?? key
}
