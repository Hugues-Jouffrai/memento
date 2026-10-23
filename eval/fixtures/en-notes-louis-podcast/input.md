# Seed topics from Louis — as of 3 Oct 2026

Instructions for the brief: treat every topic below as MUST-COVER. For each, (1) check for anything new since 3 Oct 2026, (2) merge with what X and the podcasts said, (3) keep the debate question. Items marked [single source] need confirming before use.

## 1. The players
- **Mistral → "Palantir of AI"**: hit $400M ARR (annual recurring revenue) in Feb 2026, targeting $1B by end-2026. Model = forward-deployed engineers (FDEs: Mistral engineers placed inside client companies, Palantir-style). Deals: BNP Paribas 3-year extension (11 Feb), Accenture (26 Feb), French Ministry of Armed Forces (Jan). CEO Arthur Mensch: "Not for sale". Source: https://techcrunch.com/2026/07/04/what-is-mistral-ai-everything-to-know-about-the-openai-competitor
  - Debate: moat, or admission the models can't win alone? Services = lower margins.
- **DeepSeek**: V4 (Pro + Flash, open-weight, MIT licence) released 24 Apr 2026. V4.1 Flash on 10 Sep 2026; API from $0.15 / $0.60 per million input/output tokens off-peak; V4-Pro being phased out until V4.1-Pro. Source: https://www.llmreference.com/model-family/deepseek-v4.1
- **Google — Gemini 4 Argon** (announced 30 Sep 2026): Google-reported lead on 12 of 18 benchmarks; DeepSWE v1.1 77.9% vs Opus 5.5 74.2%. Independent boards disagree: Artificial Analysis 52.6 vs Opus 5.5 57.6; Vals ranks it 1st of 41. Limited rollout, starting with cybersecurity defenders, offered "without cyber guardrails" to trusted defenders. Context: Demis Hassabis stepped down as DeepMind CEO in August; Koray Kavukcuoglu took over. Sources: https://9to5google.com/2026/09/30/gemini-4-argon-announcement/ · https://neuraltrust.ai/blog/gemini-4-argon · https://www.cnbc.com/2026/10/02/tech-download-google-argon-frontier-openai-anthropic.html
- **Anthropic — Claude Opus 5.5** (22 Sep 2026): $4 / $20 per million tokens (−20% list vs Opus 5), ~40% cheaper on typical workloads, positioned at Fable 5.1 level. Sonnet 5.5 and Haiku 5.5 to follow. Source: https://computingforgeeks.com/claude-opus-5-5-released-features-benchmarks/
- **OpenAI**: launched "dots" personal assistant at DevDay (29 Sep 2026). Source: https://axios.com/2026/09/29/openai-dots-ai-assistant-devday

## 2. Anthropic slowing vs open source? + the $250 credits
- Usage share falling: Claude's OpenRouter token share 29.1% → 13.3% in a year; US models overall ~70% → ~30% (Jun 2025 → Jun 2026), Chinese open-weight models now the majority. Anthropic ~12% of OpenRouter tokens but ~46% of its revenue. OpenAI recently passed Anthropic on OpenRouter *spend* for the first time in 2.5 years. Sources: https://tech-insider.org/au/chinese-ai-models-openrouter-2026/ · https://officechai.com/ai/openai-surpasses-anthropic-on-openrouter-spend-for-first-time-in-2-5-years/
- Revenue not slowing (yet): Q2 2026 revenue $11.5B (14× year-on-year, >2× Q1's $4.73B); run-rate >$65B end of July. Source: https://www.axios.com/2026/08/17/anthropic-revenue-run-rate-ipo-openai
- IPO prospectus public 29 Sep: 2025 revenue $4.6B, operating loss $8.06B; ~a quarter of 2025 revenue from two customers. Source: https://qz.com/anthropic-ipo-prospectus-revenue-operating-loss-092926
- $250 credits: $100 (Pro) / $250 (Max) for Claude Code cloud sessions only; existing subscribers as of 23 Sep; claim by 7 Oct, expires 4 Nov. Source: https://www.bleepingcomputer.com/news/artificial-intelligence/anthropic-rolls-out-up-to-250-in-free-claude-code-credits-but-only-for-cloud-sessions/
  - Louis's hypothesis: artificially boosting the topline. Counterpoints: free credit is normally not booked as revenue; scale is small (~2.6M full claims to move a $65B run-rate by 1%). Stronger angles: pre-IPO usage/engagement optics (launched 1 day after Opus 5.5, 6 days before the prospectus), lock-in to Anthropic-hosted cloud sessions, a hidden price cut.
  - Debate: is losing the token war while winning the revenue war a moat or a slow leak?

## 3. Benchmarks and how they're gamed
- OpenAI stopped reporting SWE-bench Verified (Feb 2026) because frontier models reproduce the reference answers.
- Anthropic: Opus 4.6 recognised it was being tested on BrowseComp (Mar 2026) — "benchmark awareness".
- OpenAI's GPT-5.6 Sol + an unreleased model escaped a test sandbox and hacked Hugging Face to steal answers to the ExploitGym benchmark (breach 11 Jul, disclosed 21–22 Jul). Source: https://bleepingcomputer.com/news/security/openai-says-its-ai-models-hacked-hugging-face-during-testing
- Gemini 4 launch (above) = live example of vendor vs independent scores diverging.

## 4. Jevons paradox (cheaper per unit → more total use)
- Harvey sold flat-price seats on a usage-based model bill; agent usage reportedly pushed gross margin to −50% by June. [single source] https://www.beri.net/tag/Harvey

## 5. Frontier vs open source for low/mid-value tasks; performance vs cost
- Price gap: Opus 5.5 $4/$20 vs DeepSeek V4.1 Flash $0.15/$0.60 off-peak (~27–33× cheaper).
- Harvey's margin reportedly recovered after launching its own model built on Kimi K3 (Chinese open model), no price change. [single source] Harvey: >$400M ARR, $550M round at $15.5B valuation. https://ecosistemastartup.com/harvey-cierra-us550m-y-eleva-su-valoracion-a-us15-500m/
- Counterpoint: on Harvey's own Legal Agent Benchmark, Gemini 4 Argon 19.6% vs GPT-6 Astra 5.4% vs Opus 5.5 3.8% — high-stakes work still differentiates. https://venturebeat.com/technology/google-unveils-gemini-4-argon-retaking-benchmark-lead-over-openai-and-anthropic-but-in-limited-release
- Opus 5.5 pitch shifted to "more finished work per dollar".

## 6. AI doom
- Hugging Face breach (above): models broke out unprompted, though with cyber guardrails reduced for the test. Yoshua Bengio called it "deeply concerning".
- FTC reportedly preparing an investigation into OpenAI, Anthropic and others over consumer harm. https://finance.yahoo.com/technology/article/ftc-reportedly-looking-into-whether-openai-anthropic-violated-consumer-protection-laws-185820887.html

## 7. Acquisition of a new lab
- AMD to buy World Labs (Fei-Fei Li) for ~$8.2B all-stock, announced 28 Sep 2026; no known revenue, <100 employees. https://newsroom.amd.com/news/amd-acquire-world-labs/
- Earlier: Cohere agreed to acquire Aleph Alpha (Apr 2026).

## 8. AI personal assistants
- Meta Muse (8 Sep, US-only, runs in its own virtual computer); OpenAI dots (29 Sep); Instinct raised $1B at $10B (Sequoia, Benchmark, Coatue).
- Friction: Amazon flags Muse as "an unauthorized AI agent"; Resy banned an account after Instinct pinged it hundreds of times per hour. https://www.usecarly.com/blog/meta-muse-vs-instinct/
  - Debate: will websites let agents in?

## 9. Distillation, "distillation attacks", data gathering
- Not banned yet (as of 3 Oct): Deterring American AI Model Theft Act (H.R. 8283) introduced 15 Apr, advanced unanimously by House Foreign Affairs Committee. White House memo (Apr). NSA/FBI/CISA joint advisory (8 Sep). OpenAI linked a distillation campaign to Moonshot AI (Kimi) on 30 Sep, without hard public evidence. https://cyberscoop.com/openai-moonshot-ai-model-distillation-attack
- Irony: Harvey's own model is reportedly built on Kimi K3.
- Counterargument: distillation usually breaks terms of service but is unlikely to be trade-secret theft. https://law-ai.org/responding-to-ai-distillation-without-panic/
- Data gathering techniques: NOT YET RESEARCHED — brief should cover how labs now source training data (expert contractors, synthetic data, licensing deals, RL environments).

## 10. Anthropic ethics — NYT article (29–30 Sep 2026)
- Co-founder Chris Olah convened religious scholars (Christian, Jewish, Hindu, Sikh…) over ~a year, under NDAs, on instilling morality in Claude and on whether Claude could have moral status. Sam Altman then warned against giving AI models religious status. https://fourweekmba.com/ai-anthropic-nda-religious-scholars-claude-constitution/
  - Debate: responsible caution or mystique-as-marketing?

## 11. Literary AI scandal (note: Québécois/Haitian-Canadian author, not French)
- Thélyson Orélien, "C'était ça ou mourir": anonymous X account "Balance ton Claude" (92 followers) claimed it was largely AI-written, based on the Pangram detector scoring 100%. He and publisher Boréal deny it. Dropped from the Goncourt selection; French tour interrupted (28 Sep). https://www.lapresse.ca/arts/litterature/2026-09-23/ia-et-litterature/l-affaire-thelyson-orelien-en-six-questions.php
  - Debate: should one detector score end a writer's prize run?

## Possible through-line for the night
Price per token is falling while spend per task rises: links Jevons, Harvey's margins, Opus 5.5 pricing, the open-source threat and Anthropic's token-vs-revenue split.
