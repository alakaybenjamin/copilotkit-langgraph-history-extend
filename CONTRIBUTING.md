# Contributing to copilotkit-langgraph-history

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/copilotkit-langgraph-history.git
   cd copilotkit-langgraph-history
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Build the package**
   ```bash
   pnpm run build
   ```

4. **Run type checks**
   ```bash
   pnpm run typecheck
   ```

## Making Changes

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in the `src/` directory

3. Ensure your code passes type checks:
   ```bash
   pnpm run typecheck
   ```

4. Build to verify everything compiles:
   ```bash
   pnpm run build
   ```

5. Commit your changes with a descriptive message:
   ```bash
   git commit -m "feat: add your feature description"
   ```

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests

## Pull Request Process

1. Push your branch to your fork
2. Open a Pull Request against the `main` branch
3. Fill out the PR template
4. Wait for review

## Reporting Issues

When reporting issues, please include:

- Your Node.js version (`node -v`)
- Your package versions (`pnpm list`)
- Steps to reproduce the issue
- Expected vs actual behavior
- Any error messages or logs

## Code of Conduct

Be respectful and inclusive. We're all here to build something useful together.

## Questions?

Feel free to open an issue with the "question" label if you need help.
