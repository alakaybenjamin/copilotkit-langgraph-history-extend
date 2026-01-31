#!/bin/bash

# Setup GitHub Repository for npm-only Package
# This script prepares and pushes the npm package to GitHub

set -e  # Exit on error

echo "🚀 Setting up GitHub repository for copilotkit-langgraph-history"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo -e "${YELLOW}⚠️  IMPORTANT: Before running this script:${NC}"
echo "1. Create a new repository at: https://github.com/new"
echo "   - Name: copilotkit-langgraph-history"
echo "   - Owner: alakaybenjamin"
echo "   - Visibility: Public"
echo "   - DO NOT initialize with README, .gitignore, or license"
echo ""
read -p "Have you created the repository? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please create the repository first, then run this script again."
    exit 1
fi

echo ""
echo "📋 Step 1: Creating backup of current state..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="../copilotkit-history-backup-${TIMESTAMP}"
cp -r . "${BACKUP_DIR}"
echo -e "${GREEN}✓ Backup created at: ${BACKUP_DIR}${NC}"

echo ""
echo "📋 Step 2: Replacing .gitignore with npm-only version..."
if [ -f ".gitignore.npm" ]; then
    cp .gitignore.npm .gitignore
    echo -e "${GREEN}✓ .gitignore updated${NC}"
else
    echo -e "${RED}❌ Error: .gitignore.npm not found${NC}"
    exit 1
fi

echo ""
echo "📋 Step 3: Removing Python and examples from git tracking..."
git rm -r --cached python/ 2>/dev/null || echo "  (python/ already removed or not tracked)"
git rm -r --cached examples/ 2>/dev/null || echo "  (examples/ already removed or not tracked)"
echo -e "${GREEN}✓ Folders removed from git tracking${NC}"

echo ""
echo "📋 Step 4: Committing changes..."
git add .gitignore
git commit -m "Prepare npm-only package: remove Python and examples from tracking" || echo "  (Nothing to commit)"
echo -e "${GREEN}✓ Changes committed${NC}"

echo ""
echo "📋 Step 5: Setting up remote..."
REPO_URL="https://github.com/alakaybenjamin/copilotkit-langgraph-history-extend.git"

# Remove origin if it exists
git remote remove origin 2>/dev/null || echo "  (No existing origin to remove)"

# Add new origin
git remote add origin "${REPO_URL}"
echo -e "${GREEN}✓ Remote 'origin' added${NC}"

echo ""
echo "📋 Step 6: Pushing to GitHub..."
CURRENT_BRANCH=$(git branch --show-current)
git push -u origin "${CURRENT_BRANCH}:main"
echo -e "${GREEN}✓ Pushed to GitHub${NC}"

echo ""
echo "=================================================="
echo -e "${GREEN}🎉 Success! Your repository is ready!${NC}"
echo ""
echo "📦 Repository: https://github.com/alakaybenjamin/copilotkit-langgraph-history-extend"
echo ""
echo "🔐 Next steps:"
echo "1. Set up NPM_TOKEN for automated publishing:"
echo "   - Get token: https://www.npmjs.com/settings/YOUR_USERNAME/tokens"
echo "   - Add secret: https://github.com/alakaybenjamin/copilotkit-langgraph-history-extend/settings/secrets/actions"
echo ""
echo "2. Publish your first version:"
echo "   npm login"
echo "   pnpm build"
echo "   npm publish --access public"
echo ""
echo "📚 For more info, see PUBLISHING.md"
echo ""
