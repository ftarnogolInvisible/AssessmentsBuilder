# Update .env File

Since `.env` is gitignored, here's how to update it:

## Option 1: Use the script (easiest)

```bash
# Set port to 3000
npm run set-port 3000

# Or set port to 5001
npm run set-port 5001
```

## Option 2: Manual edit

1. Make sure `.env` exists:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and change:
   ```
   PORT=5000
   ```
   To:
   ```
   PORT=3000
   ```

3. Save the file

## Option 3: Quick command line

```bash
cd /Users/ftarnogol/AssessmentsBuilder/AssessmentBuilder

# Create .env if it doesn't exist
cp env.example .env

# Update PORT (macOS)
sed -i '' 's/^PORT=.*/PORT=3000/' .env

# Verify
grep PORT .env
```

Then restart the server:
```bash
npm run dev
```

