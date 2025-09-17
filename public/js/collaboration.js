export default class Collaboration {
    constructor() {
        this.currentUser = {
            id: this.generateUserId(),
            name: 'Anonymous',
            color: this.generateUserColor(),
            cursor: { line: 1, column: 1 }
        };

        this.collaborators = new Map();
        this.isConnected = false;
        this.socket = null;
        this.lastContent = '';
        this.ignoreNextUpdate = false;
        this.roomId = 'default-room';
        this.isApplyingRemoteChange = false;
        this.hasReceivedInitialContent = false;
    }

    init() {
        // Make this available globally for other modules
        window.collaboration = this;

        // Show username modal
        this.showUsernameModal();
    }

    showUsernameModal() {
        const modal = document.getElementById('usernameModal');
        const usernameInput = document.getElementById('usernameInput');
        const joinButton = document.getElementById('joinButton');

        // Focus on input
        setTimeout(() => {
            usernameInput.focus();
        }, 100);

        // Handle join button click
        joinButton.addEventListener('click', () => {
            const username = usernameInput.value.trim();

            if (username) {
                this.currentUser.name = username;
                // System will assign color automatically

                // Hide modal
                modal.style.display = 'none';

                // Initialize editor with empty content (will be filled from server)
                const editor = document.getElementById('editor');
                editor.textContent = 'Loading...';
                this.lastContent = editor.textContent;

                // Enable editor (will be properly enabled after receiving content)
                if (window.editor) {
                    window.editor.setEditorEnabled(false); // Disable until we get content
                }

                // Connect to server
                this.connect();
            } else {
                alert('Please enter a username');
            }
        });

        // Handle Enter key press
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinButton.click();
            }
        });
    }

    connect() {
        console.log("Connecting to collaboration server...");

        // Connect to the server
        this.socket = io();

        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
            console.log("Connected to collaboration server with ID:", this.socket.id);

            // Update current user ID with socket ID
            this.currentUser.id = this.socket.id;

            // Join the room
            this.socket.emit('join-room', {
                roomId: this.roomId,
                user: this.currentUser
            });

            // Request current document content
            this.socket.emit('request-document', this.roomId);
        });

        this.socket.on('document-state', (doc) => {
            console.log('Received document state:', doc);

            if (window.editor) {
                // Enable editor
                window.editor.setEditorEnabled(true);

                // Set content from server
                window.editor.setContent(doc.content);
                this.lastContent = doc.content;
                this.hasReceivedInitialContent = true;

                // Set language if provided
                if (doc.language && window.editor.setLanguage) {
                    window.editor.setLanguage(doc.language);
                }

                if (window.ui) {
                    window.ui.showNotification('Document loaded from server');
                }
            }
        });

        this.socket.on('user-joined', (userData) => {
            console.log('User joined:', userData);
            this.addCollaborator(userData);

            // Show notification
            if (window.ui && userData.id !== this.currentUser.id) {
                window.ui.showNotification(`${userData.name} joined the editor`);
            }
        });

        this.socket.on('user-left', (userId) => {
            console.log('User left:', userId);
            this.removeCollaborator(userId);

            // Show notification
            const user = this.collaborators.get(userId);
            if (window.ui && user) {
                window.ui.showNotification(`${user.name} left the editor`);
            }
        });

        this.socket.on('user-list', (users) => {
            console.log('Received user list:', users);
            this.updateUserList(users);
        });

        this.socket.on('code-update', (data) => {
            console.log('Received code update:', data);

            // Ignore our own updates
            if (data.userId === this.currentUser.id) return;

            if (data.type === 'full-content') {
                this.applyFullContentUpdate(data.content);
            } else if (data.type === 'edit') {
                this.applyEditUpdate(data);
            } else if (data.type === 'language-change') {
                // Handle language change from other users
                if (window.editor && data.userId !== this.currentUser.id) {
                    window.editor.setLanguage(data.language);
                    if (window.ui) {
                        window.ui.showNotification(`Language changed to ${data.language}`);
                    }
                }
            }
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
            console.log("Disconnected from server");

            // Disable editor
            if (window.editor) {
                window.editor.setEditorEnabled(false);
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error("Connection error:", error);
            this.updateConnectionStatus(false);

            // Disable editor
            if (window.editor) {
                window.editor.setEditorEnabled(false);
            }
        });
    }

    send(data) {
        if (this.socket && this.isConnected) {
            // Add room information to the data
            data.room = this.roomId;
            this.socket.emit('code-change', data);
        }
    }

    handleEditorChange(newContent) {
        // Don't send updates if we're applying a remote change or haven't received initial content
        if (this.isApplyingRemoteChange || this.ignoreNextUpdate || !this.hasReceivedInitialContent) {
            this.ignoreNextUpdate = false;
            this.lastContent = newContent;
            return;
        }

        // Calculate the difference between old and new content
        const diff = this.calculateDiff(this.lastContent, newContent);

        if (diff) {
            this.send({
                type: 'edit',
                diff: diff,
                userId: this.currentUser.id,
                timestamp: Date.now()
            });
        }

        this.lastContent = newContent;
    }

    calculateDiff(oldText, newText) {
        // Simple diff implementation
        if (oldText === newText) return null;

        // Find where the change happened from the start
        let start = 0;
        while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
            start++;
        }

        // Find where the change happened from the end
        let oldEnd = oldText.length;
        let newEnd = newText.length;
        while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
            oldEnd--;
            newEnd--;
        }

        return {
            position: start,
            removed: oldText.substring(start, oldEnd),
            inserted: newText.substring(start, newEnd)
        };
    }

    applyEditUpdate(data) {
        this.isApplyingRemoteChange = true;

        const editor = document.getElementById('editor');
        const currentContent = editor.textContent;
        const currentSelection = this.saveSelection(editor);

        // Apply the diff to the current content
        if (data.diff && data.diff.position <= currentContent.length) {
            // Check if the text to be removed matches what's at the position
            const textAtPosition = currentContent.substring(
                data.diff.position,
                data.diff.position + data.diff.removed.length
            );

            // Only apply the change if the text matches or if we're at the end of the document
            if (textAtPosition === data.diff.removed ||
                (data.diff.position === currentContent.length && data.diff.removed === '')) {

                const before = currentContent.substring(0, data.diff.position);
                const after = currentContent.substring(data.diff.position + data.diff.removed.length);
                const newContent = before + data.diff.inserted + after;

                // Update content
                this.ignoreNextUpdate = true;
                editor.textContent = newContent;
                this.lastContent = newContent;

                // Apply syntax highlighting
                if (window.editor && window.editor.applySyntaxHighlighting) {
                    window.editor.applySyntaxHighlighting();
                }

                // Restore selection with adjustment for the change
                this.restoreSelection(editor, currentSelection, data.diff);

                if (window.ui) {
                    window.ui.showNotification('Remote edit applied');
                }
            } else {
                console.warn('Text mismatch at position', data.diff.position,
                    'expected:', data.diff.removed,
                    'found:', textAtPosition);

                // Request full content sync if there's a mismatch
                this.send({
                    type: 'request-full-content',
                    userId: this.currentUser.id
                });
            }
        }

        setTimeout(() => {
            this.isApplyingRemoteChange = false;
        }, 50);
    }

    saveSelection(editor) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) {
            return null;
        }

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        return {
            start: preCaretRange.toString().length,
            range: range
        };
    }

    restoreSelection(editor, savedSelection, diff) {
        if (!savedSelection) return;

        const selection = window.getSelection();
        const range = document.createRange();

        // Adjust the cursor position based on the applied diff
        let adjustedPosition = savedSelection.start;

        if (diff && diff.position < savedSelection.start) {
            // If the change happened before our cursor, adjust the position
            const changeLength = diff.inserted.length - diff.removed.length;
            adjustedPosition += changeLength;
            adjustedPosition = Math.max(diff.position, adjustedPosition);
        }

        // Find the text node and offset for the adjusted position
        let charCount = 0;
        let nodeStack = [editor];
        let node = null;
        let foundStart = false;

        while (node = nodeStack.pop()) {
            if (node.nodeType === 3) { // Text node
                const nextCharCount = charCount + node.length;
                if (!foundStart && adjustedPosition >= charCount && adjustedPosition <= nextCharCount) {
                    range.setStart(node, adjustedPosition - charCount);
                    foundStart = true;
                }
                if (foundStart && adjustedPosition === nextCharCount) {
                    range.setEnd(node, node.length);
                    break;
                }
                charCount = nextCharCount;
            } else {
                // Push children in reverse order
                let i = node.childNodes.length;
                while (i--) {
                    nodeStack.push(node.childNodes[i]);
                }
            }
        }

        selection.removeAllRanges();
        selection.addRange(range);
    }

    applyFullContentUpdate(content) {
        this.isApplyingRemoteChange = true;

        const editor = document.getElementById('editor');

        // Only update if content is different
        if (editor.textContent !== content) {
            // Save current selection
            const savedSelection = this.saveSelection(editor);

            // Update content
            this.ignoreNextUpdate = true;
            editor.textContent = content;
            this.lastContent = content;

            // Apply syntax highlighting
            if (window.editor && window.editor.applySyntaxHighlighting) {
                window.editor.applySyntaxHighlighting();
            }

            // Try to restore selection
            if (savedSelection) {
                // For full content updates, we can't perfectly restore position
                // so we'll just put the cursor at the end
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false); // Collapse to end

                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            }

            if (window.ui) {
                window.ui.showNotification('Document updated from server');
            }
        }

        setTimeout(() => {
            this.isApplyingRemoteChange = false;
        }, 50);
    }

    addCollaborator(user) {
        if (this.collaborators.has(user.id)) return;

        this.collaborators.set(user.id, user);
        this.updateUserList();
    }

    removeCollaborator(userId) {
        if (this.collaborators.has(userId)) {
            this.collaborators.delete(userId);
            this.updateUserList();
        }
    }

    updateUserList(users = null) {
        const userList = document.getElementById('userList');

        // Clear the list
        userList.innerHTML = '';

        // Use provided users or current collaborators
        const usersToDisplay = users || Array.from(this.collaborators.values());

        // Add current user first
        const currentUserItem = document.createElement('li');
        currentUserItem.className = 'user-item';
        currentUserItem.innerHTML = `
            <div class="user-avatar" style="background-color: ${this.currentUser.color}">${this.currentUser.name[0]}</div>
            <div class="user-info">
                <div class="user-name">${this.currentUser.name} (You)</div>
            </div>
        `;
        userList.appendChild(currentUserItem);

        // Add other users
        usersToDisplay.forEach(user => {
            if (user.id !== this.currentUser.id) {
                const userItem = document.createElement('li');
                userItem.className = 'user-item';
                userItem.innerHTML = `
                    <div class="user-avatar" style="background-color: ${user.color}">${user.name[0]}</div>
                    <div class="user-info">
                        <div class="user-name">${user.name}</div>
                    </div>
                `;
                userList.appendChild(userItem);
            }
        });
    }

    generateUserId() {
        return 'user-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    generateUserColor() {
        const colors = [
            '#3498db', '#e74c3c', '#2ecc71', '#f39c12',
            '#9b59b6', '#1abc9c', '#d35400', '#c0392b',
            '#16a085', '#27ae60', '#2980b9', '#8e44ad',
            '#f1c40f', '#e67e22', '#d35400', '#c0392b',
            '#1abc9c', '#2ecc71', '#3498db', '#9b59b6'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;

        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');

        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Disconnected';
        }
    }
}