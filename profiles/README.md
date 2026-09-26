# Profiles

The vendor is a profile, not a branch. A profile binds the three places
where a vendor appears: the Tier 3 language model (`wire` is the API shape,
`openai-compatible` or `anthropic-messages`; the key is read from the named
environment variable and never stored), the Tier 2 gateway host, and the
factory runner. Everything else (the broker's tools, the policy, the log,
the firmware) is identical across profiles, and a replay test proves it by
comparing the MCP call traces of the same scenario under two profiles.

Model identifiers marked `<...>` are filled in when the accounts exist.

The `web` MCP slot has its own provider profile. It defaults to
`profiles/web-search.json`, a direct Brave Search API adapter that returns
ranked snippets without paying for a second language model. Set
`WEB_SEARCH_PROFILE=profiles/web-search-openai.json` or
`WEB_SEARCH_PROFILE=profiles/web-search-anthropic.json` for a hosted search
that also synthesizes a cited answer. Existing Google Custom Search JSON API
customers can select the legacy `profiles/web-search-google.json` profile.
All profiles expose the same `web.search` input and normalized `results`,
sources, searches and usage record to the harness.
