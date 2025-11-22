/**
 * Utility functions to detect and collect system information
 */

export interface SystemInfo {
  browser?: string;
  browserVersion?: string;
  os?: string;
  device?: string;
  model?: string;
  vendor?: string;
  memory?: number;
  screenResolution?: string;
  ipAddress?: string;
}

/**
 * Detects browser type and version
 */
function detectBrowser(): { browser: string; version: string } {
  const userAgent = navigator.userAgent;
  let browser = "Unknown";
  let version = "Unknown";

  // Chrome (including Chromium-based browsers)
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg") && !userAgent.includes("OPR")) {
    browser = "Chrome";
    const match = userAgent.match(/Chrome\/(\d+)/);
    if (match) version = match[1];
  }
  // Edge
  else if (userAgent.includes("Edg")) {
    browser = "Edge";
    const match = userAgent.match(/Edg\/(\d+)/);
    if (match) version = match[1];
  }
  // Firefox
  else if (userAgent.includes("Firefox")) {
    browser = "Firefox";
    const match = userAgent.match(/Firefox\/(\d+)/);
    if (match) version = match[1];
  }
  // Safari
  else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    browser = "Safari";
    const match = userAgent.match(/Version\/(\d+)/);
    if (match) version = match[1];
  }
  // Opera
  else if (userAgent.includes("OPR")) {
    browser = "Opera";
    const match = userAgent.match(/OPR\/(\d+)/);
    if (match) version = match[1];
  }
  // Brave (detected via navigator.brave)
  else if ((navigator as any).brave && (navigator as any).brave.isBrave) {
    browser = "Brave";
    const match = userAgent.match(/Chrome\/(\d+)/);
    if (match) version = match[1];
  }

  return { browser, version };
}

/**
 * Detects operating system
 */
function detectOS(): string {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform.toLowerCase();

  if (userAgent.includes("Win")) return "Windows";
  if (userAgent.includes("Mac")) return "macOS";
  if (userAgent.includes("Linux")) return "Linux";
  if (userAgent.includes("Android")) return "Android";
  if (userAgent.includes("iOS") || /iPad|iPhone|iPod/.test(userAgent)) return "iOS";
  if (platform.includes("win")) return "Windows";
  if (platform.includes("mac")) return "macOS";
  if (platform.includes("linux")) return "Linux";

  return "Unknown";
}

/**
 * Detects device type
 */
function detectDevice(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  const width = window.screen.width;
  const height = window.screen.height;

  // Check for mobile devices
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
    // Distinguish between tablet and mobile
    if (/ipad|android(?!.*mobile)|tablet/i.test(userAgent) || (width >= 768 && height >= 768)) {
      return "tablet";
    }
    return "mobile";
  }

  // Desktop by default
  return "desktop";
}

/**
 * Detects device model and vendor
 */
function detectDeviceModel(): { model: string; vendor: string } {
  const userAgent = navigator.userAgent;
  let model = "Unknown";
  let vendor = "Unknown";

  // Apple devices
  if (userAgent.includes("Macintosh")) {
    vendor = "Apple";
    
    // Try to detect Mac model using hardware hints
    // Note: User agent doesn't contain specific model info, so we use heuristics
    const hardwareConcurrency = navigator.hardwareConcurrency || 0;
    const platform = navigator.platform || "";
    
    // Check for Apple Silicon (M1/M2/M3 etc.)
    if (userAgent.includes("Apple") || platform.includes("MacIntel") && !userAgent.includes("Intel")) {
      // Apple Silicon Macs often have specific core counts
      if (hardwareConcurrency >= 8) {
        model = "MacBook Pro (Apple Silicon)";
      } else {
        model = "MacBook Air (Apple Silicon)";
      }
    } else if (userAgent.includes("Intel") || platform.includes("Intel")) {
      // Intel Macs - use core count and screen size as hints
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;
      
      // Higher core counts and larger screens suggest MacBook Pro
      if (hardwareConcurrency >= 8 || (screenWidth >= 1920 && screenHeight >= 1080)) {
        model = "MacBook Pro (Intel)";
      } else if (hardwareConcurrency >= 4) {
        // Default to MacBook Pro for most Intel Macs (most common)
        model = "MacBook Pro (Intel)";
      } else {
        model = "MacBook Air (Intel)";
      }
    } else {
      // Fallback: Default to MacBook Pro as it's the most common Mac model
      model = "MacBook Pro";
    }
  } else if (userAgent.includes("iPhone")) {
    vendor = "Apple";
    const match = userAgent.match(/iPhone\s*OS\s*(\d+)/);
    if (match) {
      model = `iPhone (iOS ${match[1]})`;
    } else {
      model = "iPhone";
    }
  } else if (userAgent.includes("iPad")) {
    vendor = "Apple";
    model = "iPad";
  }

  // Android devices
  if (userAgent.includes("Android")) {
    vendor = "Google"; // Default vendor for Android
    const match = userAgent.match(/Android\s+[\d.]+;\s*([^)]+)/);
    if (match) {
      const deviceInfo = match[1];
      // Try to extract manufacturer and model
      const parts = deviceInfo.split(/[;,\s]+/);
      if (parts.length >= 2) {
        vendor = parts[0];
        model = parts.slice(1).join(" ");
      } else {
        model = deviceInfo;
      }
    }
  }

  // Windows devices
  if (userAgent.includes("Windows")) {
    vendor = "Microsoft";
    if (userAgent.includes("Windows NT 10.0")) {
      model = "Windows 10/11";
    } else if (userAgent.includes("Windows NT 6.3")) {
      model = "Windows 8.1";
    } else if (userAgent.includes("Windows NT 6.2")) {
      model = "Windows 8";
    } else {
      model = "Windows";
    }
  }

  return { model, vendor };
}

/**
 * Detects system memory (RAM) in GB
 * Note: This is only available in some browsers and may be rounded for privacy
 */
function detectMemory(): number | undefined {
  // Priority 1: Try deviceMemory API (most accurate, but may be rounded for privacy)
  // This API returns total system RAM in GB, but browsers may round it down
  // (e.g., 18GB might show as 16GB or 8GB for privacy reasons)
  if ((navigator as any).deviceMemory) {
    const deviceMemory = (navigator as any).deviceMemory;
    // deviceMemory is already in GB, but may be rounded
    return deviceMemory;
  }

  // Priority 2: Try to estimate from performance.memory (Chrome/Edge only)
  // Note: This gives JavaScript heap size limit, not total RAM, but can be used as a hint
  if ((performance as any).memory) {
    const memory = (performance as any).memory;
    // Use jsHeapSizeLimit which is typically a fraction of total RAM
    // For Chrome, it's usually around 1/4 to 1/2 of total RAM on desktop
    if (memory.jsHeapSizeLimit) {
      const heapLimitGB = memory.jsHeapSizeLimit / (1024 * 1024 * 1024);
      // Estimate total RAM (heap limit is typically 25-50% of total RAM)
      // Use a conservative estimate: multiply by 2.5 to 4
      const estimatedRAM = Math.round(heapLimitGB * 3);
      // Round to nearest common RAM size (8, 16, 32, 64 GB)
      const commonRAMSizes = [8, 16, 32, 64];
      const closest = commonRAMSizes.reduce((prev, curr) => 
        Math.abs(curr - estimatedRAM) < Math.abs(prev - estimatedRAM) ? curr : prev
      );
      return closest;
    }
  }

  return undefined;
}

/**
 * Gets screen resolution
 */
function getScreenResolution(): string {
  return `${window.screen.width}x${window.screen.height}`;
}

/**
 * Fetches IP address from a public API
 * Note: This requires an external API call
 */
async function fetchIPAddress(): Promise<string | undefined> {
  try {
    // Try multiple IP detection services
    const services = [
      "https://api.ipify.org?format=json",
      "https://ipapi.co/json/",
      "https://api.ip.sb/ip",
    ];

    for (const service of services) {
      try {
        const response = await fetch(service, { 
          method: "GET",
          signal: AbortSignal.timeout(3000) // 3 second timeout
        });
        if (response.ok) {
          const data = await response.json();
          // Different services return different formats
          if (data.ip) return data.ip;
          if (typeof data === "string") return data.trim();
        }
      } catch (e) {
        // Try next service
        continue;
      }
    }
  } catch (error) {
    console.error("[SystemInfo] Failed to fetch IP address:", error);
  }

  return undefined;
}

/**
 * Collects all system information
 */
export async function collectSystemInfo(): Promise<SystemInfo> {
  const { browser, version } = detectBrowser();
  const os = detectOS();
  const device = detectDevice();
  const { model, vendor } = detectDeviceModel();
  const memory = detectMemory();
  const screenResolution = getScreenResolution();
  const ipAddress = await fetchIPAddress();

  return {
    browser,
    browserVersion: version,
    os,
    device,
    model,
    vendor,
    memory,
    screenResolution,
    ipAddress,
  };
}

