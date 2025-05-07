// Check-in module for the ticket system
import { formatDate, showToast } from './app.js';
import { fetchSales, updateParticipantStatus } from './sheets.js';
import { startQrCodeScanner, stopQrCodeScanner } from './qrcode.js';

let salesData = []; // Store all sales data
let checkInHistory = []; // Store recent check-ins
const MAX_HISTORY_ITEMS = 10; // Maximum number of items in check-in history

// Initialize the check-in functionality
export function initializeCheckIn() {
    // Initialize event listeners
    document.addEventListener('refreshCheckInData', loadCheckInData);
    
    // Initialize search
    const searchManualBtn = document.getElementById('searchManualBtn');
    const manualCodeInput = document.getElementById('manualCode');
    
    searchManualBtn.addEventListener('click', () => {
        const searchValue = manualCodeInput.value.trim();
        if (searchValue) {
            findAndDisplayParticipant(searchValue);
        }
    });
    
    manualCodeInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            const searchValue = manualCodeInput.value.trim();
            if (searchValue) {
                findAndDisplayParticipant(searchValue);
            }
        }
    });
    
    // Initialize QR code scanner
    const startScanBtn = document.getElementById('startScanBtn');
    startScanBtn.addEventListener('click', toggleQrScanner);
    
    // Initialize validation buttons
    const validateBtn = document.getElementById('validateBtn');
    const resetStatusBtn = document.getElementById('resetStatusBtn');
    
    validateBtn.addEventListener('click', () => {
        const participantId = document.getElementById('participantInfo').getAttribute('data-participant-id');
        if (participantId) {
            validateParticipant(participantId);
        }
    });
    
    resetStatusBtn.addEventListener('click', () => {
        const participantId = document.getElementById('participantInfo').getAttribute('data-participant-id');
        if (participantId) {
            resetParticipantStatus(participantId);
        }
    });
    
    // Initial data load
    loadCheckInData();
}

// Load check-in data from Google Sheets
async function loadCheckInData() {
    try {
        // Fetch all sales data
        const result = await fetchSales();
        
        if (result.success) {
            salesData = result.data || [];
            updateDashboardStats();
        } else {
            throw new Error(result.error || 'Erro ao carregar dados de check-in.');
        }
    } catch (error) {
        console.error('Error loading check-in data:', error);
        showToast('Erro', 'Não foi possível carregar os dados de check-in.', 'error');
    }
}

// Update dashboard statistics
function updateDashboardStats() {
    let totalParticipants = 0;
    let completedCheckins = 0;
    
    // Count participants and check-ins
    salesData.forEach(sale => {
        sale.participants.forEach(participant => {
            totalParticipants++;
            
            if (participant.checkInStatus === 'Concluído') {
                completedCheckins++;
            }
        });
    });
    
    const pendingCheckins = totalParticipants - completedCheckins;
    const checkinPercentage = totalParticipants === 0 ? 0 : Math.round((completedCheckins / totalParticipants) * 100);
    
    // Update the dashboard
    document.getElementById('totalParticipants').textContent = totalParticipants;
    document.getElementById('completedCheckins').textContent = completedCheckins;
    document.getElementById('pendingCheckins').textContent = pendingCheckins;
    document.getElementById('checkinPercentage').textContent = `${checkinPercentage}%`;
}

// Toggle QR code scanner
function toggleQrScanner() {
    const startScanBtn = document.getElementById('startScanBtn');
    const qrReader = document.getElementById('qrReader');
    
    if (qrReader.classList.contains('scanning')) {
        // Stop scanning
        stopQrCodeScanner();
        startScanBtn.innerHTML = '<i class="fas fa-camera"></i> Iniciar Escaneamento';
        qrReader.classList.remove('scanning');
    } else {
        // Start scanning
        startQrCodeScanner(qrReader, (decodedText) => {
            processQrCode(decodedText);
        });
        startScanBtn.innerHTML = '<i class="fas fa-stop"></i> Parar Escaneamento';
        qrReader.classList.add('scanning');
    }
}

// Process QR code data
function processQrCode(decodedText) {
    findAndDisplayParticipant(decodedText);
}

// Find and display participant by ID or name
function findAndDisplayParticipant(searchValue) {
    const searchTerm = searchValue.toLowerCase().trim();
    let foundParticipant = null;
    let parentSale = null;
    
    // Search through all sales and participants
    for (const sale of salesData) {
        for (const participant of sale.participants) {
            if (
                participant.id.toLowerCase() === searchTerm ||
                participant.name.toLowerCase().includes(searchTerm)
            ) {
                foundParticipant = participant;
                parentSale = sale;
                break;
            }
        }
        
        if (foundParticipant) break;
    }
    
    if (foundParticipant) {
        displayParticipantInfo(foundParticipant, parentSale);
    } else {
        showToast('Não Encontrado', 'Participante não encontrado.', 'warning');
    }
}

// Display participant information
function displayParticipantInfo(participant, sale) {
    const participantInfo = document.getElementById('participantInfo');
    const noParticipantSelected = document.getElementById('noParticipantSelected');
    const participantName = document.getElementById('participantName');
    const participantStatus = document.getElementById('participantStatus');
    const statusIcon = document.getElementById('statusIcon');
    const validateBtn = document.getElementById('validateBtn');
    
    // Show participant info and hide placeholder
    participantInfo.classList.remove('d-none');
    noParticipantSelected.classList.add('d-none');
    
    // Set data attribute for ID
    participantInfo.setAttribute('data-participant-id', participant.id);
    
    // Set participant name
    participantName.textContent = participant.name;
    
    // Set status
    participantStatus.textContent = participant.checkInStatus;
    
    // Set appropriate icon
    if (participant.checkInStatus === 'Concluído') {
        statusIcon.innerHTML = '<i class="fas fa-check-circle fa-5x text-success status-icon status-validated"></i>';
        participantStatus.className = 'lead text-success';
        validateBtn.disabled = true;
    } else {
        statusIcon.innerHTML = '<i class="fas fa-clock fa-5x text-warning status-icon status-pending"></i>';
        participantStatus.className = 'lead text-warning';
        validateBtn.disabled = false;
    }
    
    // Show additional info
    const additionalInfo = document.createElement('div');
    additionalInfo.classList.add('mt-3', 'text-center', 'small', 'text-muted');
    additionalInfo.innerHTML = `
        <p>ID do Participante: ${participant.id}</p>
        <p>Venda: ${sale.id}</p>
        <p>Data da Venda: ${formatDate(sale.date)}</p>
    `;
    
    // Remove previous additional info if exists
    const existingInfo = participantInfo.querySelector('.text-muted');
    if (existingInfo) {
        existingInfo.remove();
    }
    
    // Add new additional info
    const btnGroup = participantInfo.querySelector('.d-grid');
    btnGroup.after(additionalInfo);
    
    // Apply animation
    statusIcon.classList.add('success-pulse');
    setTimeout(() => {
        statusIcon.classList.remove('success-pulse');
    }, 700);
}

// Validate a participant
async function validateParticipant(participantId) {
    try {
        const validateBtn = document.getElementById('validateBtn');
        validateBtn.disabled = true;
        validateBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Validando...';
        
        const result = await updateParticipantStatus(participantId, 'Concluído');
        
        if (result.success) {
            // Update local data
            updateParticipantInLocalData(participantId, 'Concluído');
            
            // Update UI
            const statusIcon = document.getElementById('statusIcon');
            statusIcon.innerHTML = '<i class="fas fa-check-circle fa-5x text-success status-icon status-validated"></i>';
            
            const participantStatus = document.getElementById('participantStatus');
            participantStatus.textContent = 'Concluído';
            participantStatus.className = 'lead text-success';
            
            // Add to check-in history
            addToCheckInHistory(participantId, 'Concluído');
            
            // Update dashboard
            updateDashboardStats();
            
            // Show success toast
            showToast('Sucesso', 'Check-in realizado com sucesso!', 'success');
            
            // Add success animation
            statusIcon.classList.add('success-pulse');
            setTimeout(() => {
                statusIcon.classList.remove('success-pulse');
            }, 700);
        } else {
            throw new Error(result.error || 'Erro ao validar participante.');
        }
    } catch (error) {
        console.error('Error validating participant:', error);
        showToast('Erro', 'Não foi possível validar o participante. Tente novamente.', 'error');
    } finally {
        const validateBtn = document.getElementById('validateBtn');
        validateBtn.disabled = false;
        validateBtn.innerHTML = '<i class="fas fa-check-circle"></i> Validar Entrada';
    }
}

// Reset participant status
async function resetParticipantStatus(participantId) {
    try {
        const resetBtn = document.getElementById('resetStatusBtn');
        resetBtn.disabled = true;
        resetBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Resetando...';
        
        const result = await updateParticipantStatus(participantId, 'Pendente');
        
        if (result.success) {
            // Update local data
            updateParticipantInLocalData(participantId, 'Pendente');
            
            // Update UI
            const statusIcon = document.getElementById('statusIcon');
            statusIcon.innerHTML = '<i class="fas fa-clock fa-5x text-warning status-icon status-pending"></i>';
            
            const participantStatus = document.getElementById('participantStatus');
            participantStatus.textContent = 'Pendente';
            participantStatus.className = 'lead text-warning';
            
            const validateBtn = document.getElementById('validateBtn');
            validateBtn.disabled = false;
            
            // Add to check-in history
            addToCheckInHistory(participantId, 'Pendente');
            
            // Update dashboard
            updateDashboardStats();
            
            // Show success toast
            showToast('Sucesso', 'Status resetado com sucesso!', 'info');
        } else {
            throw new Error(result.error || 'Erro ao resetar status do participante.');
        }
    } catch (error) {
        console.error('Error resetting participant status:', error);
        showToast('Erro', 'Não foi possível resetar o status. Tente novamente.', 'error');
    } finally {
        const resetBtn = document.getElementById('resetStatusBtn');
        resetBtn.disabled = false;
        resetBtn.innerHTML = '<i class="fas fa-undo"></i> Resetar Status';
    }
}

// Update participant status in local data
function updateParticipantInLocalData(participantId, status) {
    for (const sale of salesData) {
        for (const participant of sale.participants) {
            if (participant.id === participantId) {
                participant.checkInStatus = status;
                return;
            }
        }
    }
}

// Add a check-in record to the history
function addToCheckInHistory(participantId, status) {
    let participantName = 'Participante';
    
    // Find participant name
    for (const sale of salesData) {
        for (const participant of sale.participants) {
            if (participant.id === participantId) {
                participantName = participant.name;
                break;
            }
        }
    }
    
    // Create history entry
    const historyEntry = {
        timestamp: new Date(),
        participantId: participantId,
        participantName: participantName,
        status: status
    };
    
    // Add to beginning of array
    checkInHistory.unshift(historyEntry);
    
    // Trim array if too long
    if (checkInHistory.length > MAX_HISTORY_ITEMS) {
        checkInHistory = checkInHistory.slice(0, MAX_HISTORY_ITEMS);
    }
    
    // Update the history display
    updateCheckInHistoryDisplay();
}

// Update the check-in history display
function updateCheckInHistoryDisplay() {
    const historyBody = document.getElementById('recentCheckinsBody');
    historyBody.innerHTML = '';
    
    if (checkInHistory.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="3" class="text-center">Nenhum check-in realizado ainda.</td>
        `;
        historyBody.appendChild(emptyRow);
        return;
    }
    
    checkInHistory.forEach(entry => {
        const row = document.createElement('tr');
        
        const statusClass = entry.status === 'Concluído' ? 'text-success' : 'text-warning';
        const statusIcon = entry.status === 'Concluído' ? 'fa-check-circle' : 'fa-clock';
        
        row.innerHTML = `
            <td>${formatDate(entry.timestamp)}</td>
            <td>${entry.participantName}</td>
            <td class="${statusClass}">
                <i class="fas ${statusIcon}"></i> ${entry.status}
            </td>
        `;
        
        historyBody.appendChild(row);
    });
}

