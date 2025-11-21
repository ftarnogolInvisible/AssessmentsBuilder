import { useEffect, useRef } from "react";
// @ts-ignore - ace-builds doesn't have TypeScript definitions
import ace from "ace-builds/src-noconflict/ace";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/theme-twilight";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/mode-html";
import "ace-builds/src-noconflict/mode-css";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-sql";
import "ace-builds/src-noconflict/mode-ruby";
import "ace-builds/src-noconflict/mode-php";
import "ace-builds/src-noconflict/mode-golang";
import "ace-builds/src-noconflict/mode-rust";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/ext-language_tools";

interface CodingBlockProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  theme?: string;
  fontSize?: number;
  showLineNumbers?: boolean;
  readOnly?: boolean;
  wrap?: boolean;
  height?: string;
  onCopy?: (e: ClipboardEvent) => void;
  onPaste?: (e: ClipboardEvent) => void;
  onCut?: (e: ClipboardEvent) => void;
}

export default function CodingBlock({
  value,
  onChange,
  language = "javascript",
  theme = "monokai",
  fontSize = 14,
  showLineNumbers = true,
  readOnly = false,
  wrap = false,
  height = "400px",
  onCopy,
  onPaste,
  onCut,
}: CodingBlockProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // @ts-ignore - ace types
  const aceEditorRef = useRef<any>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Initialize ACE editor
    // @ts-ignore - ace types
    const editor = ace.edit(editorRef.current, {
      mode: `ace/mode/${language}`,
      theme: `ace/theme/${theme}`,
      fontSize: fontSize,
      showPrintMargin: false,
      showLineNumbers: showLineNumbers,
      readOnly: readOnly,
      wrap: wrap,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableSnippets: true,
    });

    // Set initial value
    editor.setValue(value || "");

    // Handle value changes
    editor.on("change", () => {
      const newValue = editor.getValue();
      onChange(newValue);
    });

    // Handle copy/paste prevention if needed
    if (onCopy || onPaste || onCut) {
      // Intercept copy command
      if (onCopy) {
        // Override copy command
        const originalCopy = editor.commands.commands.copy;
        editor.commands.addCommand({
          name: "copy",
          bindKey: { win: "Ctrl-C", mac: "Cmd-C" },
          exec: () => {
            const clipboardEvent = new ClipboardEvent("copy");
            onCopy(clipboardEvent);
            return false; // Prevent default copy
          },
        });
        
        // Handle context menu copy and native copy events
        const handleCopy = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          const clipboardEvent = new ClipboardEvent("copy");
          onCopy(clipboardEvent);
        };
        
        editor.container.addEventListener("copy", handleCopy, true);
        editor.textInput.getElement().addEventListener("copy", handleCopy, true);
      }

      // Intercept paste command
      if (onPaste) {
        // Override paste command
        editor.commands.addCommand({
          name: "paste",
          bindKey: { win: "Ctrl-V", mac: "Cmd-V" },
          exec: async () => {
            // Try to get clipboard content
            let pastedText = "";
            try {
              pastedText = await navigator.clipboard.readText();
            } catch (e) {
              // Clipboard API not available, use empty string
            }
            
            // Create clipboard event with the text
            const clipboardEvent = new ClipboardEvent("paste");
            Object.defineProperty(clipboardEvent, "clipboardData", {
              value: {
                getData: () => pastedText,
              },
              writable: false,
            });
            
            onPaste(clipboardEvent);
            return false; // Prevent default paste
          },
        });
        
        // Handle context menu paste and native paste events
        const handlePaste = async (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          
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
        };
        
        editor.container.addEventListener("paste", handlePaste, true);
        editor.textInput.getElement().addEventListener("paste", handlePaste, true);
      }

      // Intercept cut command (treat as copy)
      if (onCut) {
        editor.commands.addCommand({
          name: "cut",
          bindKey: { win: "Ctrl-X", mac: "Cmd-X" },
          exec: () => {
            const clipboardEvent = new ClipboardEvent("cut");
            onCut(clipboardEvent);
            return false; // Prevent default cut
          },
        });
        
        // Handle context menu cut and native cut events
        const handleCut = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          const clipboardEvent = new ClipboardEvent("cut");
          onCut(clipboardEvent);
        };
        
        editor.container.addEventListener("cut", handleCut, true);
        editor.textInput.getElement().addEventListener("cut", handleCut, true);
      }
    }

    aceEditorRef.current = editor;

    return () => {
      editor.destroy();
    };
  }, []); // Only run once on mount

  // Update editor settings when props change
  useEffect(() => {
    if (!aceEditorRef.current) return;
    const editor = aceEditorRef.current;

    try {
      editor.session.setMode(`ace/mode/${language}`);
    } catch (e) {
      console.warn(`Failed to set language mode: ${language}`, e);
    }
  }, [language]);

  useEffect(() => {
    if (!aceEditorRef.current) return;
    const editor = aceEditorRef.current;

    try {
      editor.setTheme(`ace/theme/${theme}`);
    } catch (e) {
      console.warn(`Failed to set theme: ${theme}`, e);
    }
  }, [theme]);

  useEffect(() => {
    if (!aceEditorRef.current) return;
    aceEditorRef.current.setFontSize(fontSize);
  }, [fontSize]);

  useEffect(() => {
    if (!aceEditorRef.current) return;
    aceEditorRef.current.setReadOnly(readOnly);
  }, [readOnly]);

  useEffect(() => {
    if (!aceEditorRef.current) return;
    aceEditorRef.current.getSession().setUseWrapMode(wrap);
  }, [wrap]);

  useEffect(() => {
    if (!aceEditorRef.current) return;
    aceEditorRef.current.renderer.setShowGutter(showLineNumbers);
  }, [showLineNumbers]);

  // Update value when prop changes (but not from user input)
  useEffect(() => {
    if (!aceEditorRef.current) return;
    const currentValue = aceEditorRef.current.getValue();
    if (currentValue !== value) {
      aceEditorRef.current.setValue(value || "");
    }
  }, [value]);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div
        ref={editorRef}
        style={{
          height: height,
          width: "100%",
        }}
      />
    </div>
  );
}

