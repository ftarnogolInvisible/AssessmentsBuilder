import { useState, useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface LaTeXBlockProps {
  value: string;
  onChange: (value: string) => void;
  displayMode?: boolean;
  height?: string;
  onCopy?: (e: ClipboardEvent) => void;
  onPaste?: (e: ClipboardEvent) => void;
  onCut?: (e: ClipboardEvent) => void;
}

export default function LaTeXBlock({
  value = "",
  onChange,
  displayMode = false,
  height = "300px",
  onCopy,
  onPaste,
  onCut,
}: LaTeXBlockProps) {
  const [latexError, setLatexError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Ensure value is always a string
  const safeValue = value || "";

  // Check if KaTeX is available on mount
  useEffect(() => {
    try {
      if (typeof katex !== 'undefined' && typeof katex.render === 'function') {
        setIsReady(true);
      } else {
        console.warn("[LaTeXBlock] KaTeX not available on mount");
        setIsReady(false);
      }
    } catch (error) {
      console.error("[LaTeXBlock] Error checking KaTeX availability:", error);
      setIsReady(false);
    }
  }, []);

  // Render LaTeX preview
  useEffect(() => {
    if (!previewRef.current || !isReady) {
      if (previewRef.current && !isReady) {
        previewRef.current.innerHTML = '<div class="text-yellow-600 text-sm">Loading KaTeX...</div>';
      }
      return;
    }

    // Ensure safeValue is a string
    const latexInput = String(safeValue || "").trim();

    if (!latexInput) {
      if (previewRef.current) {
        previewRef.current.innerHTML = '<div class="text-gray-400 italic">LaTeX preview will appear here...</div>';
      }
      setLatexError(null);
      return;
    }

    // Clear previous content
    if (previewRef.current) {
      previewRef.current.innerHTML = '';
    }

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      try {
        // Double-check katex is available
        if (typeof katex === 'undefined' || typeof katex.render !== 'function') {
          console.error("[LaTeXBlock] KaTeX not available", { katex, hasRender: !!katex?.render });
          if (previewRef.current) {
            previewRef.current.innerHTML = '<div class="text-red-600 text-sm">Error: KaTeX library not loaded</div>';
          }
          return;
        }

        // Validate that we have a valid element
        if (!previewRef.current) {
          return;
        }

        // Render LaTeX with error handling - wrap in additional try-catch for safety
        try {
          // Clean up LaTeX input - remove display mode delimiters if present
          // KaTeX doesn't use \[ \] or $$ $$ delimiters, it uses displayMode option instead
          let cleanedInput = latexInput.trim();
          
          // Remove \[ and \] delimiters
          cleanedInput = cleanedInput.replace(/^\\\[/, '').replace(/\\\]$/, '');
          // Remove $$ delimiters
          cleanedInput = cleanedInput.replace(/^\$\$/, '').replace(/\$\$$/, '');
          // Remove single $ delimiters (but be careful not to remove math content)
          cleanedInput = cleanedInput.trim();
          
          // Determine display mode from delimiters if not explicitly set
          let actualDisplayMode = displayMode;
          if (latexInput.includes('\\[') || latexInput.includes('$$')) {
            actualDisplayMode = true;
          } else if (latexInput.includes('\\(') || (latexInput.includes('$') && !latexInput.startsWith('$$'))) {
            actualDisplayMode = false;
          }
          
          // Use the cleaned input
          katex.render(cleanedInput, previewRef.current, {
            throwOnError: false, // Don't throw, just show error
            displayMode: actualDisplayMode,
            errorColor: "#cc0000",
            strict: false, // Don't be strict about errors
          });
          setLatexError(null);
        } catch (renderError: any) {
          // This catches errors from katex.render itself
          console.error("[LaTeXBlock] KaTeX render error:", renderError, { latexInput });
          const errorMessage = renderError?.message || renderError?.toString() || "Error rendering LaTeX";
          setLatexError(errorMessage);
          if (previewRef.current) {
            previewRef.current.innerHTML = `<div class="text-red-600 text-sm">Render Error: ${errorMessage}</div>`;
          }
        }
      } catch (error: any) {
        console.error("[LaTeXBlock] Outer error rendering LaTeX:", error, { safeValue });
        const errorMessage = error?.message || error?.toString() || "Invalid LaTeX syntax";
        setLatexError(errorMessage);
        if (previewRef.current) {
          previewRef.current.innerHTML = `<div class="text-red-600 text-sm">Error: ${errorMessage}</div>`;
        }
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [safeValue, displayMode, isReady]);

  // Handle copy/paste prevention
  const handleCopy = (e: React.ClipboardEvent) => {
    if (onCopy) {
      e.preventDefault();
      const clipboardEvent = new ClipboardEvent("copy");
      onCopy(clipboardEvent);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (onPaste) {
      e.preventDefault();
      let pastedText = "";
      try {
        pastedText = await navigator.clipboard.readText();
      } catch (err) {
        // Clipboard API not available
      }

      const clipboardEvent = new ClipboardEvent("paste");
      Object.defineProperty(clipboardEvent, "clipboardData", {
        value: {
          getData: () => pastedText,
        },
        writable: false,
      });

      onPaste(clipboardEvent);
    }
  };

  const handleCut = (e: React.ClipboardEvent) => {
    if (onCut) {
      e.preventDefault();
      const clipboardEvent = new ClipboardEvent("cut");
      onCut(clipboardEvent);
    }
  };

  try {
    return (
      <div className="space-y-4">
        {/* LaTeX Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            LaTeX Code
          </label>
          <textarea
            ref={textareaRef}
            value={safeValue}
            onChange={(e) => {
              try {
                onChange(e.target.value);
              } catch (err) {
                console.error("[LaTeXBlock] Error in onChange:", err);
              }
            }}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onCut={handleCut}
            placeholder="Enter LaTeX code (e.g., E = mc^2 or \\frac{a}{b})"
            style={{ height }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
          />
          {latexError && (
            <p className="mt-2 text-sm text-red-600">⚠ {latexError}</p>
          )}
        </div>

        {/* LaTeX Preview */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preview
          </label>
          <div
            ref={previewRef}
            className={`w-full min-h-[100px] p-4 border border-gray-300 rounded-lg bg-gray-50 ${
              displayMode ? "text-center" : ""
            }`}
            style={{ minHeight: displayMode ? "150px" : "100px" }}
          />
        </div>

        {/* LaTeX Help */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-medium text-blue-900 mb-2">💡 LaTeX Examples:</p>
          <div className="text-xs text-blue-800 space-y-1 font-mono">
            <div>• Inline: <code>E = mc^2</code></div>
            <div>• Fraction: <code>{"\\frac{a}{b}"}</code></div>
            <div>• Sum: <code>{"\\sum_{i=1}^{n} x_i"}</code></div>
            <div>• Integral: <code>{"\\int_{a}^{b} f(x) dx"}</code></div>
            <div>• Greek: <code>{"\\alpha, \\beta, \\gamma, \\pi"}</code></div>
          </div>
        </div>
      </div>
    );
  } catch (error: any) {
    console.error("[LaTeXBlock] Render error:", error);
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800 font-medium">Error rendering LaTeX block</p>
        <p className="text-red-600 text-sm mt-1">{error?.message || "Unknown error"}</p>
      </div>
    );
  }
}

