export default class UI {
    constructor() {
        this.inviteButton = document.getElementById('inviteButton');
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.inviteButton.addEventListener('click', this.handleInviteClick.bind(this));
    }

    handleInviteClick() {
        // In a real app, this would generate a shareable link
        const inviteLink = `${window.location.origin}${window.location.pathname}?room=${window.collaboration.roomId}&user=${window.collaboration.currentUser.id}`;

        // For this demo, we'll just show a prompt with a fake link
        alert(`Share this link with collaborators:\n\n${inviteLink}\n\n(In a real app, this would work)`);
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.backgroundColor = 'var(--dark)';
        notification.style.color = 'white';
        notification.style.padding = '10px 15px';
        notification.style.borderRadius = '4px';
        notification.style.zIndex = '1000';
        notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s';
            setTimeout(() => document.body.removeChild(notification), 500);
        }, 3000);
    }
}