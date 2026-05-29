@echo off
cd /d "C:\Users\kimo8\OneDrive\Desktop\victorysync-dashboard"

echo Removing git lock if present...
if exist ".git\index.lock" del /f ".git\index.lock"

echo Staging all changes...
git add -A

echo Committing...
git commit -m "fix: remove duplicate createCsrfToken and orphaned code in apiSecurity.ts"

echo Pushing to GitHub...
git push origin main

echo.
echo === DONE ===
pause
