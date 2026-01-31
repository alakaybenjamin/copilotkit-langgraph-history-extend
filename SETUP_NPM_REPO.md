# Setting Up the npm-only GitHub Repository

This guide will help you create a clean npm-only repository at https://github.com/alakaybenjamin/copilotkit-langgraph-history

## Files to Include (npm package only)

```
copilotkit-langgraph-history/
├── .github/              # CI/CD workflows
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── src/                  # TypeScript source code
│   ├── events/
│   ├── runner/
│   ├── utils/
│   └── index.ts
├── .gitignore           # Use .gitignore.npm (renamed)
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── pnpm-lock.yaml
├── PUBLISHING.md
├── README.md
├── tsconfig.json
└── tsup.config.ts
```

## Files to EXCLUDE

- `python/` - Python package (separate PyPI package)
- `examples/` - Move to documentation or separate examples repo
- `.env` files
- `dist/` - Generated on build
- `node_modules/` - Generated on install

## Setup Instructions

### Option A: Create New Repository from Scratch

```bash
# 1. Create a new directory for the npm-only package
cd ~/Documents/VSCode\ Projects/
mkdir copilotkit-langgraph-history-npm
cd copilotkit-langgraph-history-npm

# 2. Copy only the necessary files from your current project
cp -r ../copilotkit-history/src ./
cp -r ../copilotkit-history/.github ./
cp ../copilotkit-history/package.json ./
cp ../copilotkit-history/pnpm-lock.yaml ./
cp ../copilotkit-history/tsconfig.json ./
cp ../copilotkit-history/tsup.config.ts ./
cp ../copilotkit-history/README.md ./
cp ../copilotkit-history/LICENSE ./
cp ../copilotkit-history/CHANGELOG.md ./
cp ../copilotkit-history/CONTRIBUTING.md ./
cp ../copilotkit-history/PUBLISHING.md ./
cp ../copilotkit-history/.gitignore.npm ./.gitignore

# 3. Initialize git
git init
git add .
git commit -m "Initial commit: npm package for CopilotKit LangGraph history"

# 4. Add your new GitHub repository as remote
git remote add origin https://github.com/alakaybenjamin/copilotkit-langgraph-history.git

# 5. Push to GitHub
git branch -M main
git push -u origin main
```

### Option B: Use Current Repository with Clean History

If you want to use the existing repository but exclude certain files:

```bash
cd /Users/ab021470/Documents/VSCode\ Projects/copilotkit-history

# 1. Replace .gitignore with npm-only version
cp .gitignore.npm .gitignore

# 2. Remove Python and examples from git (but keep locally for now)
git rm -r --cached python/
git rm -r --cached examples/

# 3. Commit the changes
git add .gitignore
git commit -m "Prepare npm-only repository"

# 4. Add your new GitHub repository as remote
git remote add npm-repo https://github.com/alakaybenjamin/copilotkit-langgraph-history.git

# 5. Push to the new repository
git push -u npm-repo main
```

### Option C: Use Git Filter-Repo (Clean History, No Python/Examples)

For a completely clean repository without Python/examples in the history:

```bash
# 1. Install git-filter-repo (if not installed)
# macOS:
brew install git-filter-repo

# 2. Create a backup
cd /Users/ab021470/Documents/VSCode\ Projects/
cp -r copilotkit-history copilotkit-history-backup

# 3. Create a fresh clone
git clone copilotkit-history copilotkit-langgraph-history-npm
cd copilotkit-langgraph-history-npm

# 4. Remove unwanted directories from entire history
git filter-repo --path python --invert-paths
git filter-repo --path examples --invert-paths

# 5. Use npm-only .gitignore
cp ../.gitignore.npm .gitignore
git add .gitignore
git commit -m "Update .gitignore for npm-only package"

# 6. Add your new GitHub repository as remote
git remote add origin https://github.com/alakaybenjamin/copilotkit-langgraph-history.git

# 7. Push to GitHub
git push -u origin main
```

## After Pushing to GitHub

1. **Set up npm token for automated publishing**:
   - Go to https://www.npmjs.com/ → Access Tokens
   - Generate new "Automation" token
   - Go to https://github.com/alakaybenjamin/copilotkit-langgraph-history/settings/secrets/actions
   - Add secret: `NPM_TOKEN` with your npm token

2. **Add repository topics** on GitHub:
   - copilotkit
   - langgraph
   - langchain
   - chat-history
   - typescript
   - nextjs
   - react

3. **Update package.json** if needed:
   ```json
   "repository": {
     "type": "git",
     "url": "git+https://github.com/alakaybenjamin/copilotkit-langgraph-history.git"
   },
   "homepage": "https://github.com/alakaybenjamin/copilotkit-langgraph-history#readme",
   "bugs": {
     "url": "https://github.com/alakaybenjamin/copilotkit-langgraph-history/issues"
   }
   ```

4. **Enable GitHub Pages** (optional):
   - Settings → Pages
   - Source: Deploy from a branch
   - Branch: main, /docs

5. **Configure branch protection** (recommended):
   - Settings → Branches → Add rule
   - Branch name pattern: `main`
   - ☑ Require pull request reviews before merging
   - ☑ Require status checks to pass before merging

## Recommended: Separate Examples Repository

Consider creating a separate repository for examples:
- `copilotkit-langgraph-history-examples`
- Keep the main package lean
- Examples can evolve independently

## Publishing Your First Version

Once the repository is set up:

```bash
# Update author in package.json if needed
# Then publish:
npm login
pnpm build
npm publish --access public
```

Or use automated publishing:
```bash
npm version patch
git push --follow-tags
```

## Questions?

- Check PUBLISHING.md for publishing guidance
- Check CONTRIBUTING.md for development setup
- Open an issue on GitHub for support
