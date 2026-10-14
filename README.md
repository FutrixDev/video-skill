# video-skill

Agent skills for making video in code, maintained by FutrixDev. Each skill is a directory with a
`SKILL.md` entry point; copy or symlink it into your agent's skills folder
(for Claude Code: `~/.claude/skills/<name>`).

## Skills

- `documentary-film/` - Deterministic JS + Canvas film pipeline: script, local OmniVoice narration,
  Playwright frame render, ffmpeg mix and QA, plus a motion-design kit (springs, beat grid, mask
  reveals, match cuts, world camera, motion blur).

  Needs Node.js with Playwright, ffmpeg, and Python 3. Narration runs OmniVoice inside a Kubernetes
  pod driven through `kubectl` (`--context` / `--namespace` flags, see
  `documentary-film/reference/omnivoice.md`). Music generation needs `MINIMAX_API_KEY`.

## License

This repository is licensed under the [Apache License 2.0](LICENSE).

Copyright 2026 Dylan Wang and FutrixDev contributors. See [NOTICE](NOTICE) for attribution information.
