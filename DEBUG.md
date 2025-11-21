# Debugging Guide

## If nothing shows at http://localhost:5000

### 1. Check Server is Running
Look for these messages in your terminal:
```
🚀 Server running on port 5000
📱 Frontend: http://localhost:5000
🔍 API: http://localhost:5000/api/health
```

### 2. Test API Endpoint First
Open in browser: `http://localhost:5000/api/health`

You should see:
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

If this works, the server is running correctly.

### 3. Check Browser Console
Open browser DevTools (F12) and check:
- Console tab for errors
- Network tab to see if requests are being made

### 4. Check Terminal for Errors
Look for:
- Vite setup errors
- Module not found errors
- Database connection errors

### 5. Common Issues

**Issue: Blank page**
- Check browser console for JavaScript errors
- Verify `client/src/main.tsx` exists
- Check that React is rendering

**Issue: Cannot GET /**
- Vite middleware might not be set up correctly
- Check that `client/index.html` exists
- Verify Vite config is correct

**Issue: 404 errors**
- Routes might not be configured correctly
- Check that SPA fallback is working

### 6. Quick Test Commands

```bash
# Test API
curl http://localhost:5000/api/health

# Check if files exist
ls -la client/index.html
ls -la client/src/main.tsx
ls -la client/src/App.tsx

# Check server logs
# Look for "Vite dev server ready" message
```

### 7. Restart Everything

```bash
# Stop server (Ctrl+C)
# Then:
npm run dev
```

Watch for any error messages during startup.

