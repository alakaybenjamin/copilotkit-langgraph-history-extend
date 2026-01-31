# Publishing Guide

This guide explains how to publish `copilotkit-langgraph-history` to npm.

## Prerequisites

1. **npm account**: Create one at [npmjs.com](https://www.npmjs.com/signup)
2. **npm access**: Must be logged in locally or have NPM_TOKEN configured for CI/CD
3. **Git repository**: Ensure all changes are committed

## Quick Start

The package is already configured and ready to publish. Choose your preferred method:

### Method 1: Automated Publishing (Recommended)

This uses GitHub Actions to automatically publish when you create a version tag.

#### Setup (One-time)

1. **Generate npm token**:
   - Go to [npmjs.com](https://www.npmjs.com)
   - Click your profile → Access Tokens
   - Click "Generate New Token" → Choose "Automation"
   - Copy the token (starts with `npm_`)

2. **Add token to GitHub**:
   - Go to your GitHub repository
   - Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click "Add secret"

#### Publishing Steps

```bash
# 1. Update version (this automatically creates a git tag)
npm version patch   # 0.1.6 → 0.1.7 (bug fixes)
# or
npm version minor   # 0.1.6 → 0.2.0 (new features)
# or
npm version major   # 0.1.6 → 1.0.0 (breaking changes)

# 2. Push changes and tags to GitHub
git push --follow-tags

# 3. Done! GitHub Actions will:
#    ✓ Run type checks
#    ✓ Build the package
#    ✓ Publish to npm
#    ✓ Create GitHub release with notes
```

Check the Actions tab on GitHub to monitor the release.

### Method 2: Manual Publishing

Publish directly from your local machine.

```bash
# 1. Login to npm (if not already logged in)
npm login

# 2. Verify you're logged in
npm whoami

# 3. Build the package
pnpm run build

# 4. Test the build (optional but recommended)
pnpm run typecheck

# 5. Preview what will be published
npm publish --dry-run

# 6. Publish to npm
npm publish --access public

# 7. Create a git tag for the version
git tag v0.1.6
git push --tags
```

## Pre-publish Checklist

Before publishing a new version:

- [ ] All tests pass (`pnpm test`)
- [ ] TypeScript compiles without errors (`pnpm typecheck`)
- [ ] Build succeeds (`pnpm build`)
- [ ] `CHANGELOG.md` is updated
- [ ] Version number in `package.json` is bumped
- [ ] README.md is up to date
- [ ] Examples work with the new version

## What Gets Published?

The package is configured to only publish specific files (see `files` in `package.json`):

```
copilotkit-langgraph-history/
├── dist/              # Built JavaScript and type definitions
│   ├── index.js       # ESM format
│   ├── index.cjs      # CommonJS format
│   ├── index.d.ts     # TypeScript declarations (ESM)
│   └── index.d.cts    # TypeScript declarations (CommonJS)
├── README.md          # Documentation
└── LICENSE            # MIT license
```

## Testing Before Publishing

### Local Testing

Test the package locally before publishing:

```bash
# 1. Build the package
pnpm build

# 2. Create a tarball
npm pack
# This creates: copilotkit-langgraph-history-X.Y.Z.tgz

# 3. Install in another project
cd /path/to/test-project
npm install /path/to/copilotkit-langgraph-history-X.Y.Z.tgz

# 4. Test the imports
```

### Testing with Examples

```bash
# Test with the included examples
cd examples/fastapi-nextjs/ui
pnpm install
pnpm run build

cd ../../custom-ui/ui
pnpm install
pnpm run build
```

## Version Management

Follow [Semantic Versioning](https://semver.org/):

- **Patch** (0.1.6 → 0.1.7): Bug fixes, no API changes
  ```bash
  npm version patch
  ```

- **Minor** (0.1.6 → 0.2.0): New features, backward compatible
  ```bash
  npm version minor
  ```

- **Major** (0.1.6 → 1.0.0): Breaking changes
  ```bash
  npm version major
  ```

## Troubleshooting

### "You do not have permission to publish"

Make sure you're logged in:
```bash
npm login
npm whoami
```

### "Package name already exists"

The package name `copilotkit-langgraph-history` is already registered. If you don't own it:
- Contact the current owner
- Or use a scoped package name: `@yourname/copilotkit-langgraph-history`

### "Invalid token" in GitHub Actions

- Check that `NPM_TOKEN` is correctly set in GitHub Secrets
- Ensure the token has "Automation" permissions
- Try generating a new token

### Build fails

```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

## Post-publish Checklist

After successful publication:

- [ ] Verify package on [npmjs.com](https://www.npmjs.com/package/copilotkit-langgraph-history)
- [ ] Test installation: `npm install copilotkit-langgraph-history`
- [ ] Update GitHub release notes if needed
- [ ] Announce the release (Twitter, Discord, etc.)
- [ ] Update documentation website (if applicable)

## Package Statistics

After publishing, you can view package stats:

- npm downloads: https://www.npmjs.com/package/copilotkit-langgraph-history
- Bundle size: https://bundlephobia.com/package/copilotkit-langgraph-history
- Package details: https://npmjs.com/package/copilotkit-langgraph-history

## Related Resources

- [npm Documentation](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Actions for npm](https://docs.github.com/en/actions/publishing-packages/publishing-nodejs-packages)
