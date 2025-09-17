const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store document state and users
const rooms = new Map();

// Function to generate random colors (same as client)
function generateUserColor() {
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#f39c12',
        '#9b59b6', '#1abc9c', '#d35400', '#c0392b',
        '#16a085', '#27ae60', '#2980b9', '#8e44ad',
        '#f1c40f', '#e67e22', '#d35400', '#c0392b',
        '#1abc9c', '#2ecc71', '#3498db', '#9b59b6'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Handle socket connections
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (data) => {
        const roomId = data.roomId;
        const user = data.user;

        // Add socket ID to user object and assign a color
        user.id = socket.id;
        user.color = generateUserColor(); // Server assigns the color

        socket.join(roomId);

        // Initialize room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                content: '// Welcome to CollabCode!\n// Start typing here...\n\nfunction example() {\n  return "Hello, world!";\n}',
                version: 0,
                users: new Map(),
                language: 'javascript'
            });
        }

        const room = rooms.get(roomId);

        // Add user to room
        room.users.set(socket.id, user);

        // Send current document to the new user (use the actual room content, not default)
        socket.emit('document-state', {
            content: room.content, // This is the current document content
            version: room.version,
            language: room.language
        });

        // Send current user list to the new user
        socket.emit('user-list', Array.from(room.users.values()));

        // Notify other users about the new user
        socket.to(roomId).emit('user-joined', user);

        // Notify other users to update their user list
        socket.to(roomId).emit('user-list', Array.from(room.users.values()));

        console.log(`User ${user.name} joined room ${roomId}`);
    });

    socket.on('code-change', (data) => {
        const roomId = data.room;

        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);

            if (data.type === 'full-content') {
                // Update the document with full content
                room.content = data.content;
                room.version++;

                // Broadcast to other users in the room
                socket.to(roomId).emit('code-update', data);
            } else if (data.type === 'edit') {
                // Apply the edit to the document
                if (data.diff && data.diff.position <= room.content.length) {
                    // Check if the text to be removed matches what's at the position
                    const textAtPosition = room.content.substring(
                        data.diff.position,
                        data.diff.position + data.diff.removed.length
                    );

                    // Only apply the change if the text matches or if we're at the end of the document
                    if (textAtPosition === data.diff.removed ||
                        (data.diff.position === room.content.length && data.diff.removed === '')) {

                        const before = room.content.substring(0, data.diff.position);
                        const after = room.content.substring(data.diff.position + data.diff.removed.length);
                        room.content = before + data.diff.inserted + after;
                        room.version++;

                        // Broadcast to other users in the room
                        socket.to(roomId).emit('code-update', data);
                    } else {
                        console.warn('Text mismatch at position', data.diff.position,
                            'expected:', data.diff.removed,
                            'found:', textAtPosition);

                        // Send full content to the user who sent the invalid update
                        socket.emit('code-update', {
                            type: 'full-content',
                            content: room.content,
                            userId: 'server'
                        });
                    }
                }
            } else if (data.type === 'request-full-content') {
                // Send full content to the requesting user
                socket.emit('code-update', {
                    type: 'full-content',
                    content: room.content,
                    userId: 'server'
                });
            } else if (data.type === 'language-change') {
                // Update the room language
                room.language = data.language;

                // Broadcast language change to other users
                socket.to(roomId).emit('code-update', data);
            } else {
                // Broadcast other types of messages
                socket.to(roomId).emit('code-update', data);
            }
        }
    });

    // Handle request for current document content
    socket.on('request-document', (roomId) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            socket.emit('document-state', {
                content: room.content,
                version: room.version,
                language: room.language
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Remove user from all rooms
        rooms.forEach((room, roomId) => {
            if (room.users.has(socket.id)) {
                const user = room.users.get(socket.id);
                room.users.delete(socket.id);

                // Notify other users
                socket.to(roomId).emit('user-left', socket.id);
                socket.to(roomId).emit('user-list', Array.from(room.users.values()));

                console.log(`User ${user.name} left room ${roomId}`);

                // Clean up empty rooms
                if (room.users.size === 0) {
                    // Reset room content when last user leaves
                    room.content = '// Welcome to CollabCode!\n// Start typing here...\n\nfunction example() {\n  return "Hello, world!";\n}';
                    room.version = 0;
                    room.language = 'javascript';
                    console.log(`Room ${roomId} reset (no users)`);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});