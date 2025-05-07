// Import all necessary modules
import { initializeLogin } from './login.js';
import { initializeSalesForm } from './sales.js';
import { initializeSalesPanel } from './salesPanel.js';
import { initializeCheckIn } from './checkin.js';
import { saveEventConfiguration, getEventConfiguration } from './sheets.js';
import { calculateDashboardMetrics } from './dashboard.js';
import { initializeComplimentaryTickets } from './complimentaryTickets.js';
import { initializeEvents, saveCurrentEventToHistory } from './events.js';

// Enhance local storage compatibility
function enhanceLocalStorageCompatibility() {
    // Check if localStorage is available and working
    try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
    } catch (e) {
        // If localStorage is not available, create a fallback mechanism
        window.localStorage = {
            _data: {},
            setItem: function(key, value) {
                this._data[key] = value;
            },
            getItem: function(key) {
                return this._data[key] || null;
            },
            removeItem: function(key) {
                delete this._data[key];
            },
            clear: function() {
                this._data = {};
            }
        };
    }
}

// Main application initialization
document.addEventListener('DOMContentLoaded', () => {
    // Enhance local storage compatibility
    enhanceLocalStorageCompatibility();
    
    // Initialize the login system
    initializeLogin();
    
    // Initialize all sections of the app
    initializeSalesForm();
    initializeSalesPanel();
    initializeCheckIn();
    initializeComplimentaryTickets();
    initializeDashboard();
    
    // Initialize settings section
    initializeSettings();
    
    // Setup navigation
    setupNavigation();
    
    // Setup logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        logout();
    });
    
    // Initialize events
    initializeEvents();
    
    // Add automatic capitalization for text inputs
    setupAutoCapitalization();
});

// Function to handle navigation between sections
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-section]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            
            // Get the target section id
            const targetSectionId = link.getAttribute('data-section');
            
            // Get the target section
            const targetSection = document.getElementById(targetSectionId);
            
            // If target section is already visible, do nothing
            if (!targetSection.classList.contains('d-none')) {
                return;
            }
            
            // Update active nav link
            navLinks.forEach(navLink => {
                navLink.classList.remove('active');
            });
            link.classList.add('active');
            
            // First, add fadeOut class to current visible section
            const currentVisibleSection = document.querySelector('.app-section:not(.d-none)');
            if (currentVisibleSection) {
                // Hide the current section smoothly
                currentVisibleSection.style.opacity = '0';
                currentVisibleSection.style.transform = 'translateY(20px)';
                
                // After animation completes, hide it and show the new section
                setTimeout(() => {
                    currentVisibleSection.classList.add('d-none');
                    
                    // Prepare the new section for animation
                    targetSection.style.opacity = '0';
                    targetSection.style.transform = 'translateY(20px)';
                    targetSection.classList.remove('d-none');
                    
                    // Trigger repaint
                    void targetSection.offsetWidth;
                    
                    // Animate in the new section
                    targetSection.style.opacity = '1';
                    targetSection.style.transform = 'translateY(0)';
                    
                    // Trigger section-specific refresh events
                    triggerSectionRefreshEvents(targetSectionId);
                }, 300);
            } else {
                // No current visible section, just show the target
                targetSection.classList.remove('d-none');
                triggerSectionRefreshEvents(targetSectionId);
            }
        });
    });
    
    const complimentaryTicketsLink = document.querySelector('.nav-link[data-section="complimentaryTickets"]');
    if (complimentaryTicketsLink) {
        complimentaryTicketsLink.addEventListener('click', () => {
            const event = new CustomEvent('refreshComplimentaryTickets');
            document.dispatchEvent(event);
        });
    }
}

// Helper function to trigger section-specific refresh events
function triggerSectionRefreshEvents(sectionId) {
    if (sectionId === 'salesPanel') {
        document.dispatchEvent(new CustomEvent('refreshSalesData'));
        document.dispatchEvent(new CustomEvent('refreshDashboardData'));
    } else if (sectionId === 'checkInDashboard') {
        document.dispatchEvent(new CustomEvent('refreshCheckInData'));
    } else if (sectionId === 'salesForm') {
        document.dispatchEvent(new Event('showSalesForm'));
    } else if (sectionId === 'complimentaryTickets') {
        document.dispatchEvent(new CustomEvent('refreshComplimentaryTickets'));
    } else if (sectionId === 'eventsSection') {
        document.dispatchEvent(new CustomEvent('refreshEventsList'));
    }
}

// Function to show toast notifications
export function showToast(title, message, type = 'success') {
    const toast = document.getElementById('toastNotification');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    
    // Set toast content
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    // Set toast color based on type
    toast.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'text-white', 'text-dark');
    if (type === 'success') {
        toast.classList.add('bg-success', 'text-white');
    } else if (type === 'error') {
        toast.classList.add('bg-danger', 'text-white');
    } else if (type === 'warning') {
        toast.classList.add('bg-warning', 'text-dark');
    } else if (type === 'info') {
        toast.classList.add('bg-info', 'text-dark');
    }
    
    // Show toast
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Function to format date for display
export function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR') + ' ' + 
           date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Function to generate a unique ID
export function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// New function to handle event finalization
function finalizeEvent() {
    const confirmFinalize = confirm('Tem certeza que deseja finalizar o evento? Todos os dados serão apagados permanentemente.');
    
    if (confirmFinalize) {
        try {
            // Save current event to history before clearing
            saveCurrentEventToHistory();
            
            // Clear all key data from localStorage
            localStorage.removeItem('ticket_sales');
            localStorage.removeItem('event_configuration');
            localStorage.removeItem('complimentary_tickets');
            
            // Reset event configuration form
            const eventNameInput = document.getElementById('eventName');
            const ticketPriceInput = document.getElementById('ticketPrice');
            const eventDateInput = document.getElementById('eventDate');
            
            if (eventNameInput) eventNameInput.value = '';
            if (ticketPriceInput) ticketPriceInput.value = '';
            if (eventDateInput) eventDateInput.value = '';
            
            // Reset sales panel and check-in dashboard (clear table bodies and stats)
            const salesTableBody = document.getElementById('salesTableBody');
            const recentCheckinsBody = document.getElementById('recentCheckinsBody');
            const totalParticipants = document.getElementById('totalParticipants');
            const completedCheckins = document.getElementById('completedCheckins');
            const pendingCheckins = document.getElementById('pendingCheckins');
            const checkinPercentage = document.getElementById('checkinPercentage');

            if (salesTableBody) salesTableBody.innerHTML = '';
            if (recentCheckinsBody) recentCheckinsBody.innerHTML = '';
            if (totalParticipants) totalParticipants.textContent = '0';
            if (completedCheckins) completedCheckins.textContent = '0';
            if (pendingCheckins) pendingCheckins.textContent = '0';
            if (checkinPercentage) checkinPercentage.textContent = '0%';

            // Also update sales panel dashboard numbers directly
            const totalSalesAmount = document.getElementById('totalSalesAmount');
            const totalTicketsSold = document.getElementById('totalTicketsSold');
            const averageTicketPrice = document.getElementById('averageTicketPrice');

            if (totalSalesAmount) totalSalesAmount.textContent = 'R$ 0,00';
            if (totalTicketsSold) totalTicketsSold.textContent = '0';
            if (averageTicketPrice) averageTicketPrice.textContent = 'R$ 0,00';


            // Re-initialize components (optional, depends if needed to reset internal states)
            // initializeSettings(); 
            // initializeSalesPanel();
            // initializeCheckIn();
            // initializeComplimentaryTickets();
            // initializeEvents();


            // Trigger refresh events to update UI components that rely on them
            document.dispatchEvent(new CustomEvent('refreshSalesData'));
            document.dispatchEvent(new CustomEvent('refreshDashboardData')); // Explicitly update dashboard
            document.dispatchEvent(new CustomEvent('refreshCheckInData'));
            document.dispatchEvent(new CustomEvent('refreshComplimentaryTickets'));
            document.dispatchEvent(new CustomEvent('refreshEventsList'));
            
            // Show success toast
            showToast('Evento Finalizado', 'Todos os dados foram apagados. Um novo evento pode ser iniciado.', 'success');
        } catch (error) {
            console.error('Error finalizing event:', error);
            showToast('Erro', 'Não foi possível finalizar o evento. Tente novamente.', 'error');
        }
    }
}

// Function to initialize settings
function initializeSettings() {
    const settingsForm = document.getElementById('settingsForm');
    const eventNameInput = document.getElementById('eventName');
    const ticketPriceInput = document.getElementById('ticketPrice');
    const eventDateInput = document.getElementById('eventDate');
    const endEventBtn = document.getElementById('endEventBtn');
    
    // Load existing configuration
    const existingConfig = getEventConfiguration();
    if (existingConfig) {
        if (eventNameInput) eventNameInput.value = existingConfig.eventName || '';
        if (ticketPriceInput) ticketPriceInput.value = existingConfig.ticketPrice || '';
        if (eventDateInput) eventDateInput.value = existingConfig.eventDate || '';
    }
    
    // Handle form submission
    if (settingsForm) {
        settingsForm.addEventListener('submit', (event) => {
            event.preventDefault();
            
            const config = {
                eventName: eventNameInput.value.trim(),
                ticketPrice: parseFloat(ticketPriceInput.value),
                eventDate: eventDateInput.value
            };
            
            const result = saveEventConfiguration(config);
            
            if (result.success) {
                showToast('Sucesso', 'Configurações salvas com sucesso!', 'success');
                // Trigger dashboard refresh as ticket price might affect average ticket calculation
                document.dispatchEvent(new CustomEvent('refreshDashboardData'));
            } else {
                showToast('Erro', 'Não foi possível salvar as configurações.', 'error');
            }
        });
    }

    // Add event listener for end event button
    if (endEventBtn) {
        endEventBtn.addEventListener('click', finalizeEvent);
    }
}

// Modify logout function to ensure clean state
function logout() {
    try {
        // Clear any stored session data
        sessionStorage.removeItem('authenticated');
        
        // Clear all locally stored data related to the event
        // NOTE: We no longer clear event history here, only current event data.
        localStorage.removeItem('ticket_sales');
        localStorage.removeItem('complimentary_tickets');
        localStorage.removeItem('event_configuration');
        // localStorage.removeItem('saved_events'); // Keep event history on logout
        
        // Hide app container and show login screen
        document.getElementById('appContainer').classList.add('d-none');
        document.getElementById('loginScreen').classList.remove('d-none');
        
        // Reset password field
        document.getElementById('password').value = '';
        document.getElementById('loginError').classList.add('d-none');
        
        showToast('Logout', 'Você saiu do sistema com sucesso.', 'info');
        
        // Optionally refresh the state of components that remain visible after logout
        // e.g., Clear tables, reset dashboards, etc. This is partially handled by clearing localStorage
        // but a visual reset might be good.
        // For now, let's rely on the next login/page load to fetch fresh (empty) data.
        
    } catch (error) {
        console.error('Logout error:', error);
        // Force reload as a fallback if critical error occurs
        // window.location.reload(); // Decided against force reload unless absolutely necessary
        showToast('Erro de Logout', 'Não foi possível sair completamente. Pode ser necessário recarregar a página.', 'error');
    }
}

function initializeDashboard() {
    document.addEventListener('refreshDashboardData', updateDashboard);
    // Also update dashboard on initial load if already authenticated
    if (sessionStorage.getItem('authenticated') === 'true') {
         updateDashboard();
    }
}

function updateDashboard() {
    const metrics = calculateDashboardMetrics();

    const totalSalesAmount = document.getElementById('totalSalesAmount');
    const totalTicketsSold = document.getElementById('totalTicketsSold');
    const averageTicketPrice = document.getElementById('averageTicketPrice');

    if (totalSalesAmount) totalSalesAmount.textContent = `R$ ${metrics.totalSales.toFixed(2)}`;
    if (totalTicketsSold) totalTicketsSold.textContent = metrics.totalTickets;
    if (averageTicketPrice) averageTicketPrice.textContent = `R$ ${metrics.averageTicket.toFixed(2)}`;
}

// Helper function to capitalize the first letter of each word
function capitalizeWords(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word => {
        if (!word) return '';
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

// Setup event delegation for auto-capitalization on text inputs
function setupAutoCapitalization() {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.addEventListener('input', (event) => {
            const target = event.target;
            // Check if the target is a text input and not the manual search input in check-in
            if (target.tagName === 'INPUT' && target.type === 'text' && target.id !== 'manualCode') {
                // Apply capitalization
                target.value = capitalizeWords(target.value);
            }
        });
    }
}

export { 
    saveEventConfiguration, 
    getEventConfiguration 
} from './sheets.js'; 