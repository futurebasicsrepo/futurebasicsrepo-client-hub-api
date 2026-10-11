# Sales intelligence

**Intelligence** (menu: Customers → Intelligence, `/intel`) finds people who may need what we sell, from what is being said in public, reads each post against our three services, and hands staff a short, honest reason to act and a draft reply. It suggests; a person sends. Nothing in it posts, replies, messages or emails anyone.

Our three services, which every post is read against: **AI transformation and implementation**, **digital apps and tool development**, **product development**.

## How it works

1. **Watches** listen. A watch is a search on one source (below). Each is listened to every hour (Settings changes that), or press **Listen now**.
2. New public posts are kept as **signals**. Authors and sites on the ignore list are dropped.
3. A cheap keyword look drops posts that are obviously not an opportunity (no ask, nothing we sell). The AI reads the rest: is this a plausible buyer, which service, what do they want, how well it fits (0-100), how urgent (0-100), why it is worth a person's time today, what to say first, and a draft reply written only from what the post says. It also says what to check first (a community's promotion rules, a competitor, a very old post).
4. The **score** is 55% fit, 35% urgency and 10% freshness (a post under six hours old scores full freshness, falling to nothing at a week). Posts at or above the **score to surface** (default 40) are listed, strongest first; lower ones sit behind "Show lower scores".
5. People work a signal: **I'll take it** (or assign it), copy the draft and send it themselves in the place it belongs, then log **I sent it** (where it went and exactly what was sent), **They replied**, **Meeting booked**, **Won** (with the value) or **Lost**, or **Dismiss** it with a reason. **Add to CRM** makes a contact (tagged `intel`, source Sales intelligence), an optional deal and a follow-up task, and starts any automation set to run for new contacts. **New draft…** asks any connected AI (Claude, ChatGPT or Grok) for another draft with an instruction ("shorter", "mention we build Shopify apps").
6. Every one of those steps is recorded with who did it and when. The **KPIs** are made from that record.

## Where it listens, and what each needs on the service

| Source | What it reads | Needs |
|---|---|---|
| Reddit | Subreddits (`r/smallbusiness`), searches (`search:need a developer`) or both | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` (an app made at reddit.com/prefs/apps; `REDDIT_USER_AGENT` optional) |
| Hacker News | Stories and comments containing your words (Algolia) | nothing |
| News | Google News stories for your words, last 7 days | nothing |
| Web search | Brave Search for your words, last week | `BRAVE_API_KEY` |
| X | Recent public posts for an X search query | `X_BEARER_TOKEN` (a paid X API plan) |
| Discord | Messages in channels of servers that invited our bot | `DISCORD_BOT_TOKEN`; watch = `<server id>/<channel id>`; the bot needs permission to read the channel and the Message Content intent switched on |

A watch whose source has no key is shown as "needs …" and is not run. **LinkedIn and Meta cannot be listened to** (no listening interface, and scraping is against their terms). A post a person sees there is added by hand with **+ Add a post** and is read the same way.

AI keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY` (Grok). Settings picks which one reads new posts and writes the first draft; **Test it** checks a key works. Models default to `claude-haiku-5-5`, `gpt-5-mini`, `grok-4`; change with `INTEL_MODEL`, `INTEL_OPENAI_MODEL`, `INTEL_XAI_MODEL` if a provider says a model is not found. Origins can be overridden for testing (`OPENAI_API_ORIGIN`, `XAI_API_ORIGIN`, `REDDIT_API_ORIGIN`, `HN_API_ORIGIN`, `NEWS_RSS_ORIGIN`, `BRAVE_API_ORIGIN`, `X_API_ORIGIN`, `DISCORD_API_ORIGIN`). `INTEL_AUTO=off` switches the hourly background run off.

The source request shapes follow each platform's documentation and are tested against stand-in servers, not live accounts. Try each source once from the Watches tab ("Listen") and read what it says.

## KPIs (and who is accountable for what)

Period: 7, 30 or 90 days.
- **Funnel**: found → worth a look → sent → replied → meetings → won (and won value).
- **Are we on it?** Median time to first action (take, send or dismiss) against the target (default 24 hours), the share of worth-a-look posts handled within it, and the **overdue** count: worth-a-look posts still new with no one on them past the target (and how long the oldest has waited).
- **By person** (what each person did): took, sent, replies, meetings, won and won value, median time to take it, share taken within the target, how many are waiting on them and how many of those are overdue. **By team**: the same, grouped by the team label set in Settings.
- **What is working**: the same funnel by service and by source.
- **What listening costs**: estimated AI spend (from token counts at rough published prices; override with `INTEL_PRICES`), per post worth a look, per meeting, per win.

## Rules it keeps

- Public posts only, through each platform's own interface and our own credentials. Only the post text, the public handle and the link are kept.
- Post text is cleared after the retention period (default 90 days) unless the signal became a CRM contact; the record of what staff did stays, because it is the KPIs.
- A daily limit on how many posts the AI reads (default 200); a hand-added post is always read.
- The AI is told to use only the post, never to invent facts about the person or about us, and to write a genuinely helpful answer with no pitch where a community forbids promotion. A person always edits and sends.
- Staff only. Clients and the public get 403/401 on every route.

## Not built yet (next)
LLM visibility probes (asking Claude, ChatGPT and Grok the questions buyers ask and tracking whether we are named), KPI targets per person and week, feeding signals into the opportunity finder and automations, a Chrome-side capture for LinkedIn.

## Seeing what was heard and what was skipped

- **Watches** shows each search in a wide, readable box, and under every watch the last few posts it heard, each linking out to the original post, marked *read by the AI*, *read, not a fit*, *waiting to be read* or *passed over*.
- **Signals → Passed over** lists the posts the cheap first look did not send to the AI, with the reason in plain words ("does not mention AI, apps or software, or product development" or "mentions AI but does not sound like someone asking for help…"). **Have the AI read this** sends one to the chosen AI anyway, and it then appears in Open with its draft. `GET /v1/intel/passed`, `POST /v1/intel/signals/:id/read`.
- Every signal card carries a **Next step** for Future Basics (reply in the thread, send the draft as a message, email it, follow up, prepare for the call), shaped by what the person wants and where the signal stands, next to the draft. It is a suggestion; a person does it and logs it.
