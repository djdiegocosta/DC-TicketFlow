// QR Code module for the ticket system
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';

let qrScanner = null; // Store QR scanner instance

// Generate QR code for a participant
export function generateQrCode(participantId, container) {
    const qrUrl = `${window.location.origin}${window.location.pathname}?id=${participantId}`;
    
    // Generate QR code using QRCode.js
    QRCode.toCanvas(qrUrl, {
        width: 200,
        margin: 1,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    }, (error, canvas) => {
        if (error) {
            console.error('Error generating QR code:', error);
            container.innerHTML = '<div class="alert alert-danger">Erro ao gerar QR Code</div>';
            return;
        }
        
        // Clear container first
        container.innerHTML = '';
        
        // Add canvas to container
        container.appendChild(canvas);
        
        // Add QR code value as hidden text (for accessibility)
        const valueElement = document.createElement('p');
        valueElement.classList.add('visually-hidden');
        valueElement.textContent = `QR Code value: ${qrUrl}`;
        container.appendChild(valueElement);
    });
}

// Start QR code scanner
export function startQrCodeScanner(element, onSuccessCallback) {
    // Stop any existing scanner
    if (qrScanner) {
        stopQrCodeScanner();
    }
    
    // Create scanner configuration
    const config = {
        fps: 10,
        qrbox: {
            width: 250,
            height: 250
        },
        rememberLastUsedCamera: true
    };
    
    // Create scanner instance
    qrScanner = new Html5QrcodeScanner("qrReader", config, false);
    
    // Start scanner
    qrScanner.render((decodedText) => {
        // Extract participantId from URL if needed
        let participantId = decodedText;
        
        // If it's a URL, extract the ID parameter
        if (decodedText.includes('?id=')) {
            const url = new URL(decodedText);
            participantId = url.searchParams.get('id');
        }
        
        // Call the success callback with the ID
        onSuccessCallback(participantId);
    }, (errorMessage) => {
        // Error handling is automatic in the library
        console.log(errorMessage);
    });
}

// Stop QR code scanner
export function stopQrCodeScanner() {
    if (qrScanner) {
        try {
            qrScanner.clear();
        } catch (error) {
            console.error('Error stopping QR scanner:', error);
        }
        qrScanner = null;
    }
}

// Check URL for participant ID on page load
export function checkUrlForParticipantId() {
    const urlParams = new URLSearchParams(window.location.search);
    const participantId = urlParams.get('id');
    
    if (participantId) {
        // We have a participant ID in the URL
        // This can be used to automatically trigger check-in
        return participantId;
    }
    
    return null;
}

