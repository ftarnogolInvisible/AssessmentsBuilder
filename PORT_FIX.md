# Port 5000 is in use - Quick Fix

Port 5000 is being used by a macOS system process (ControlCenter). 

## Solution: Use a different port

Edit your `.env` file and change the PORT:

```
PORT=3000
```

Or use port 5001:

```
PORT=5001
```

Then restart the server:

```bash
npm run dev
```

The server will now run on the new port, e.g.:
- http://localhost:3000
- http://localhost:3000/api/health

