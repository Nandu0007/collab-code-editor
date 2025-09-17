export default class Editor {
    constructor() {
        this.editor = document.getElementById('editor');
        this.languageSelector = document.getElementById('languageSelector');
        this.cursorPositionElement = document.querySelector('.cursor-position');
        this.isTyping = false;
        this.typingTimeout = null;
        this.isConnected = false;
        this.currentLanguage = 'javascript';
    }

    init() {
        this.setupEditorContent();
        this.setupEventListeners();

        // Initially disable editing until connected
        this.setEditorEnabled(false);
    }

    setEditorEnabled(enabled) {
        this.editor.contentEditable = enabled;
        this.isConnected = enabled;

        if (enabled) {
            this.editor.classList.remove('disabled');
            this.editor.setAttribute('contenteditable', 'true');
        } else {
            this.editor.classList.add('disabled');
            this.editor.setAttribute('contenteditable', 'false');
        }
    }

    setupEditorContent() {
        // Set initial content based on language
        this.setLanguageSpecificContent('javascript');

        // Initialize last content in collaboration module
        if (window.collaboration) {
            window.collaboration.lastContent = this.editor.textContent;
        }
    }

    setLanguageSpecificContent(language) {
        let content = '';

        switch (language) {
            case 'javascript':
                content = '// Welcome to CollabCode!\n// JavaScript example\n\nfunction example() {\n  return "Hello, world!";\n}\n\n// Try typing some JavaScript code';
                break;
            case 'python':
                content = '# Welcome to CollabCode!\n# Python example\n\ndef example():\n    return "Hello, world!"\n\n# Try typing some Python code';
                break;
            case 'java':
                content = '// Welcome to CollabCode!\n// Java example\n\npublic class Example {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}\n\n// Try typing some Java code';
                break;
            case 'html':
                content = '<!-- Welcome to CollabCode! -->\n<!-- HTML example -->\n\n<!DOCTYPE html>\n<html>\n<head>\n    <title>Example</title>\n</head>\n<body>\n    <h1>Hello, world!</h1>\n</body>\n</html>\n\n<!-- Try typing some HTML code -->';
                break;
            case 'css':
                content = '/* Welcome to CollabCode! */\n/* CSS example */\n\nbody {\n    font-family: Arial, sans-serif;\n    margin: 0;\n    padding: 20px;\n    background-color: #f0f0f0;\n}\n\nh1 {\n    color: #333;\n}\n\n/* Try typing some CSS code */';
                break;
            default:
                content = '// Welcome to CollabCode!\n// Start typing here...';
        }

        this.editor.textContent = content;
        this.applySyntaxHighlighting();
    }

    setupEventListeners() {
        this.editor.addEventListener('input', this.handleEditorInput.bind(this));
        this.editor.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.editor.addEventListener('click', this.updateCursorPosition.bind(this));
        this.editor.addEventListener('blur', this.updateCursorPosition.bind(this));

        // Set up selectionchange event for tracking cursor
        document.addEventListener('selectionchange', this.updateCursorPosition.bind(this));

        // Set up syntax highlighting based on language
        this.languageSelector.addEventListener('change', this.handleLanguageChange.bind(this));
    }

    handleLanguageChange() {
        const language = this.languageSelector.value;
        this.currentLanguage = language;

        // Update editor class for syntax highlighting
        this.editor.className = `language-${language}`;

        // Apply syntax highlighting
        this.applySyntaxHighlighting();

        // Notify other users about language change
        if (window.collaboration && window.collaboration.isConnected) {
            window.collaboration.send({
                type: 'language-change',
                language: language,
                userId: window.collaboration.currentUser.id
            });
        }
    }

    applySyntaxHighlighting() {
        // Use Prism.js to highlight the code
        Prism.highlightElement(this.editor);
    }

    handleEditorInput(event) {
        // Don't process input if not connected
        if (!this.isConnected || !window.collaboration) return;

        this.updateCursorPosition();

        // Debounce the change detection
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        this.isTyping = true;

        this.typingTimeout = setTimeout(() => {
            this.isTyping = false;

            // Apply syntax highlighting
            this.applySyntaxHighlighting();

            // Send update to collaboration system
            if (window.collaboration && window.collaboration.isConnected) {
                window.collaboration.handleEditorChange(this.editor.textContent);
            }
        }, 100); // Reduced debounce time for better real-time sync
    }

    handleKeyDown(event) {
        // Don't process input if not connected
        if (!this.isConnected || !window.collaboration) return;

        if (event.key === 'Tab') {
            event.preventDefault();
            document.execCommand('insertHTML', false, '    ');
            this.updateCursorPosition();

            // Apply syntax highlighting
            this.applySyntaxHighlighting();

            // Send update immediately for Tab key
            if (window.collaboration && window.collaboration.isConnected) {
                window.collaboration.handleEditorChange(this.editor.textContent);
            }
        }

        // Auto-indentation for Python
        if (this.currentLanguage === 'python' && event.key === 'Enter') {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const line = range.startContainer.textContent.substring(0, range.startOffset);
                const indent = line.match(/^(\s*)/)[0];

                if (indent.length > 0) {
                    setTimeout(() => {
                        document.execCommand('insertHTML', false, indent);
                    }, 0);
                }
            }
        }
    }

    updateCursorPosition() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(this.editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        const text = preCaretRange.toString();
        const lines = text.split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;

        if (window.collaboration) {
            window.collaboration.currentUser.cursor = { line, column };
        }

        this.cursorPositionElement.textContent = `Ln ${line}, Col ${column}`;

        // In a real app, we would send cursor position to other users
        if (window.collaboration && window.collaboration.isConnected) {
            window.collaboration.send({
                type: 'cursor',
                position: { line, column },
                userId: window.collaboration.currentUser.id
            });
        }
    }

    setContent(content) {
        // Don't update if we're currently typing
        if (this.isTyping) return;

        // Don't update if content is the same
        if (this.editor.textContent === content) return;

        // Save current selection
        const selection = window.getSelection();
        let cursorPosition = 0;

        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(this.editor);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            cursorPosition = preCaretRange.toString().length;
        }

        // Update content
        this.editor.textContent = content;

        // Apply syntax highlighting
        this.applySyntaxHighlighting();

        // Restore cursor position
        this.restoreCursorPosition(cursorPosition);
    }

    restoreCursorPosition(cursorPosition) {
        const newRange = document.createRange();
        const newSelection = window.getSelection();

        let charCount = 0;
        let nodeStack = [this.editor];
        let node = null;
        let foundStart = false;

        while (node = nodeStack.pop()) {
            if (node.nodeType === 3) {
                const nextCharCount = charCount + node.length;
                if (!foundStart && cursorPosition >= charCount && cursorPosition <= nextCharCount) {
                    newRange.setStart(node, cursorPosition - charCount);
                    foundStart = true;
                }
                if (foundStart && cursorPosition === nextCharCount) {
                    newRange.setEnd(node, node.length);
                    break;
                }
                charCount = nextCharCount;
            } else {
                let i = node.childNodes.length;
                while (i--) {
                    nodeStack.push(node.childNodes[i]);
                }
            }
        }

        newSelection.removeAllRanges();
        newSelection.addRange(newRange);
    }

    setLanguage(language) {
        this.currentLanguage = language;
        this.languageSelector.value = language;
        this.editor.className = `language-${language}`;
        this.applySyntaxHighlighting();
    }
}