// Events module for the ticket system
import { showToast, formatDate } from './app.js';
import { fetchSales } from './sheets.js';

const EVENTS_KEY = 'saved_events';

export function initializeEvents() {
    // Initial event list load
    document.addEventListener('refreshEventsList', loadEventsList);
    
    // Setup delete event functionality
    setupEventDeletion();
}

function setupEventDeletion() {
    document.getElementById('eventsSection').addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-event')) {
            const eventId = event.target.getAttribute('data-event-id');
            
            if (confirm('Tem certeza que deseja excluir este evento? Todos os dados relacionados serão permanentemente removidos.')) {
                deleteEvent(eventId);
            }
        }
    });
}

export function saveCurrentEventToHistory() {
    try {
        // Fetch sales data
        const salesResult = fetchSales();
        const sales = salesResult.data || [];
        
        // Calculate event metrics
        const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
        const totalTickets = sales.reduce((sum, sale) => sum + sale.quantity, 0);
        
        // Get event configuration
        const eventConfig = JSON.parse(localStorage.getItem('event_configuration'));
        
        if (!eventConfig) {
            showToast('Erro', 'Não há evento configurado para salvar.', 'error');
            return;
        }
        
        // Create event history entry
        const eventHistoryEntry = {
            id: generateEventId(),
            name: eventConfig.eventName,
            date: eventConfig.eventDate,
            totalSales: totalSales,
            totalTickets: totalTickets,
            savedAt: new Date().toISOString()
        };
        
        // Get existing events
        const events = getEventsList();
        events.push(eventHistoryEntry);
        
        // Save updated events list
        localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
        
        showToast('Sucesso', 'Evento salvo no histórico.', 'success');
    } catch (error) {
        console.error('Error saving event to history:', error);
        showToast('Erro', 'Não foi possível salvar o evento.', 'error');
    }
}

function deleteEvent(eventId) {
    try {
        const events = getEventsList();
        const updatedEvents = events.filter(event => event.id !== eventId);
        
        localStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
        
        // Reload events list
        loadEventsList();
        
        showToast('Sucesso', 'Evento excluído do histórico.', 'info');
    } catch (error) {
        console.error('Error deleting event:', error);
        showToast('Erro', 'Não foi possível excluir o evento.', 'error');
    }
}

function loadEventsList() {
    const eventsList = document.getElementById('eventsList');
    const noEventsMessage = document.getElementById('noEventsMessage');
    
    // Clear existing events
    eventsList.innerHTML = '';
    
    // Get events
    const events = getEventsList();
    
    // Show/hide no events message
    if (events.length === 0) {
        noEventsMessage.classList.remove('d-none');
        return;
    }
    noEventsMessage.classList.add('d-none');
    
    // Render events
    events.forEach(event => {
        const eventItem = document.createElement('div');
        eventItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
        
        eventItem.innerHTML = `
            <div>
                <h5 class="mb-1">${event.name}</h5>
                <p class="mb-1 small text-muted">
                    Data: ${formatDate(event.date)} | 
                    Total Vendido: R$ ${event.totalSales.toFixed(2)} | 
                    Ingressos: ${event.totalTickets}
                </p>
            </div>
            <div>
                <button class="btn btn-sm btn-danger delete-event" data-event-id="${event.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        eventsList.appendChild(eventItem);
    });
}

function getEventsList() {
    try {
        const eventsData = localStorage.getItem(EVENTS_KEY);
        return eventsData ? JSON.parse(eventsData) : [];
    } catch (error) {
        console.error('Error retrieving events:', error);
        return [];
    }
}

function generateEventId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}