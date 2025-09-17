import Editor from './editor.js';
import Collaboration from './collaboration.js';
import UI from './ui.js';

document.addEventListener('DOMContentLoaded', function () {
    // Initialize modules
    const editor = new Editor();
    const collaboration = new Collaboration();
    const ui = new UI();

    // Make them globally available for cross-module communication
    window.editor = editor;
    window.collaboration = collaboration;
    window.ui = ui;

    // Initialize the application
    editor.init();
    collaboration.init();
    ui.init();

    // Handle document state from server
    if (window.collaboration && window.collaboration.socket) {
        window.collaboration.socket.on('document-state', (doc) => {
            if (window.editor) {
                window.editor.setContent(doc.content);
                if (window.collaboration) {
                    window.collaboration.lastContent = doc.content;
                }
            }
        });
    }
});