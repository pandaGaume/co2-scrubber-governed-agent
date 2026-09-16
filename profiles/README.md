# Profiles

The vendor is a profile, not a branch. A profile binds the three places
where a vendor appears: the Tier 3 language model (`wire` is the API shape,
`openai-compatible` or `anthropic-messages`; the key is read from the named
environment variable and never stored), the Tier 2 gateway host, and the
factory runner. Everything else (the broker's tools, the policy, the log,
the firmware) is identical across profiles, and a replay test proves it by
comparing the MCP call traces of the same scenario under two profiles.

Model identifiers marked `<...>` are filled in when the accounts exist.
