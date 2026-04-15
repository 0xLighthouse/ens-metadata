---
name: tweet-changes
description: Drafts a tweet about recent repository changes, iterates with the user, then posts it to Typefully.
---

# Tweet Changes

Analyze recent repository changes, draft a concise tweet, collaborate with the user to refine it, and publish via the Typefully API.

## When to Use

- User says "tweet changes", "tweet about recent changes", "post an update", or similar
- User wants to share project progress on X/Twitter
- User invokes `/tweet-changes`

## Prerequisites

The following environment variables must be set:

- `TYPEFULLY_API_KEY` — API key from Typefully Settings > API

For the social set ID, use a named env var per account (e.g. `TYPEFULLY_ID_ARNOLD`, `TYPEFULLY_ID_LIGHTHOUSE_LABS`). If no named var exists, discover available accounts:

```bash
curl -s -H "Authorization: Bearer ${TYPEFULLY_API_KEY}" https://api.typefully.com/v2/social-sets
```

If the API key is missing, inform the user and provide setup instructions. Use `direnv allow` to load `.envrc` if needed.

## Steps

### 1. Gather Recent Changes

Run these git commands to understand what changed:

```bash
git log --oneline --since="1 week ago" --no-merges
git log --since="1 week ago" --no-merges --pretty=format:"%s%n%b---"
git diff --stat HEAD~10 HEAD  # fallback if time-based log is sparse
```

If the repo has very few recent commits, widen the window or use the last N commits. Look at:
- New features added
- Bugs fixed
- Refactors or improvements
- Dependencies updated

### 2. Determine Context

Before drafting, ask or infer:
- **Is this a launch or an update?** A first announcement needs to introduce the product. An update can assume context.
- **Personal or company account?** Personal tweets should tell a builder story (frustration, motivation, journey). Company tweets should be product-focused and professional.
- **Single tweet or thread?** Launches and feature-rich updates benefit from 2-3 post threads.

### 3. Draft the Tweet

**For personal accounts** — lead with the human story:
- What frustrated you enough to build this?
- What's the real motivation? Ask the user directly.
- Use their actual words — don't polish them into marketing copy.
- First person, casual, like telling a friend.

**For company accounts** — lead with the value prop:
- What does it do and who is it for?
- Keep it professional but not corporate.
- Focus on the product, not the journey.

**For all tweets:**
- Max 280 characters per post
- Verify character count with `printf 'text' | wc -m` — don't eyeball it
- Avoid hashtag spam (0-1 hashtags max)
- Include a hook in the first line
- Be concise and punchy

### 4. Algorithm Optimization Pass

Before presenting the draft, evaluate it against Twitter's ranking signals. This is a self-check — do not invoke any external skill.

**Evaluate each signal and rate it (strong / weak / missing):**

| Signal | What to check |
|---|---|
| **Community targeting** | Does it speak to a specific niche (devs, founders, etc.) using their language? One clear topic — don't dilute. |
| **Follower engagement** | Will existing followers interact? Does it invite replies via a question, opinion, or debate? |
| **Content-identity fit** | Does it match the account's established niche and signal domain expertise? |
| **Engagement triggers** | Likes: novel insight, strong opinion. Replies: direct question, debate. Retweets: useful info, representational value. Bookmarks: tutorials, data, actionable tips. |

**Reject if any of these apply:**
- Reads like a feature list or README, not a person talking
- Generic ("I built a thing") — too vague to trigger any community
- Engagement bait ("Like if you agree") — damages credibility
- Corporate tone ("Excited to announce...") — kills authenticity
- No call to action — passive tweets underperform
- Passive product description with no story, opinion, or hook

If any signal is weak/missing or an anti-pattern is present, rewrite before presenting to the user.

### 5. Tag Relevant Accounts

For launch and product tweets, identify projects/protocols the work builds on and look up their X handles using web search. Tag 2-3 max across the thread — enough signal without looking spammy. Place tags where they fit naturally in the copy (e.g. "via x402 by @coinbase").

### 6. Add Media Markers

Include `[img: description]` markers on each post to indicate what visual content should accompany the tweet. These serve as a brief for the user or a designer to create matching media. Examples:

- `[img: terminal showing deploy command with output]`
- `[img: split screen — CLI output left, live site right]`
- `[img: pricing table or tier comparison]`

### 7. Present Draft and Iterate

Show the draft to the user with:
- The tweet text with verified character count (X/280)
- A brief note on which algorithm signals it targets
- The media markers for each post

Ask if they want to:
- Edit the text or change the angle/focus
- Add a link or media reference
- Post to multiple accounts (personal + company)
- Schedule it for later instead of posting now

Re-run the algorithm optimization pass on any user edits before finalizing. Iterate until the user approves.

### 8. Post to Typefully

Once approved, post via the Typefully API. For threads, add multiple objects to the `posts` array:

```bash
curl -s -X POST "https://api.typefully.com/v2/social-sets/${SOCIAL_SET_ID}/drafts" \
  -H "Authorization: Bearer ${TYPEFULLY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "platforms": {
      "x": {
        "enabled": true,
        "posts": [
          { "text": "Post 1 text" },
          { "text": "Post 2 text" },
          { "text": "Post 3 text" }
        ]
      }
    }
  }'
```

If the user wants to schedule it, add `"publish_at": "ISO_8601_TIMESTAMP"` to the payload.

If the user just wants to save it as a draft (no immediate publish), omit `publish_at` — it will appear in their Typefully dashboard for manual publishing.

If posting to multiple accounts, make separate API calls for each social set ID.

### 9. Confirm

Show the user the result:
- If successful: confirm the draft was created in Typefully with the `private_url` link
- If failed: show the error and suggest fixes (e.g., check API key, social set ID)

## Guidelines

- Never post without explicit user approval of the final text
- Default to creating a Typefully draft (not immediate publish) unless the user asks to schedule or publish now
- Keep tweets authentic — avoid AI-sounding language like "excited to announce", "game-changer", "thrilled"
- If changes are minor (typo fixes, dependency bumps), suggest the user might want to wait for more substantial changes
- Respect the 280-character limit per post — always verify with `wc -m`, never estimate
- When the draft feels robotic, ask the user about their motivation and use their actual words
