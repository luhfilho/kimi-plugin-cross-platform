# Contributors

Thank you to everyone who has contributed to this project!

## Core Team

| Name | Role | Contributions |
|------|------|--------------|
| Luciano Filho | Author & Maintainer | Core runtime, adapters, testing, documentation |

## How to Contribute

We welcome contributions from the community! Here's how you can help:

### Reporting Issues

- Use [GitHub Issues](https://github.com/luhfilho/kimi-plugin-cross-platform/issues)
- Include steps to reproduce, expected behavior, and actual behavior
- Mention your Node.js version, OS, and host CLI

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Ensure all tests pass (`npm test`)
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
6. Push to your fork and open a Pull Request

### Commit Message Convention

```
feat: add new host adapter for windsurf
fix: resolve race condition in wire client
docs: update README with new commands
test: add integration tests for job control
refactor: simplify git context collection
```

### Development Setup

```bash
git clone https://github.com/luhfilho/kimi-plugin-cross-platform.git
cd kimi-plugin-cross-platform
npm test
```

### Code Style

- ESM modules only (`"type": "module"`)
- Zero runtime dependencies for core
- Built-in `node:test` for testing
- Async/await preferred over callbacks

## Acknowledgments

- [Moonshot AI](https://www.moonshot.cn/) for the Kimi CLI and Wire Protocol
- [Anthropic](https://www.anthropic.com/) for Claude Code
- [OpenAI](https://openai.com/) for Codex CLI
- [Antigravity](https://antigravity.ai/) for Antigravity CLI
