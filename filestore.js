// filestore.js - Centralized file-based data management for the ticket system

// Import Node.js file system module
// NOTE: This module is only available in Node.js environments, not in browsers.
// The previous prompt requested using local JSON files, but the current setup runs directly in the browser.
// This makes `require('fs')` invalid.
// To support local JSON files in a browser environment, we would need to use a different approach, 
// such as using the `localStorage` API or a library that provides a similar functionality.

// Since the current setup runs directly in the browser, we can use the `localStorage` API to store data.
const DATA_FILE_PATH = 'data.json';

// Default structure for the data file
const DEFAULT_DATA_STRUCTURE = {
    sales: [],
    complimentaryTickets: [],
    events: [],
    eventConfiguration: null
};

// Initialize or load data file
export async function initializeDataFile() {
    try {
        // Check if data exists in local storage
        if (!localStorage.getItem(DATA_FILE_PATH)) {
            // Data doesn't exist, create it with default structure
            localStorage.setItem(DATA_FILE_PATH, JSON.stringify(DEFAULT_DATA_STRUCTURE));
        }
    } catch (error) {
        console.error('Error initializing data file:', error);
        throw new Error('Não foi possível inicializar o arquivo de dados.');
    }
}

// Generic read function
export async function readData() {
    try {
        const rawData = localStorage.getItem(DATA_FILE_PATH);
        return JSON.parse(rawData);
    } catch (error) {
        console.error('Error reading data:', error);
        throw new Error('Não foi possível ler os dados.');
    }
}

// Generic write function
export async function writeData(data) {
    try {
        localStorage.setItem(DATA_FILE_PATH, JSON.stringify(data));
    } catch (error) {
        console.error('Error writing data:', error);
        throw new Error('Não foi possível salvar os dados.');
    }
}

// Sales-specific functions
export async function saveSale(saleData) {
    const data = await readData();
    data.sales.push(saleData);
    await writeData(data);
    return { success: true, message: 'Venda registrada com sucesso' };
}

export async function fetchSales() {
    const data = await readData();
    return { 
        success: true, 
        data: data.sales 
    };
}

export async function deleteSale(saleId) {
    const data = await readData();
    data.sales = data.sales.filter(sale => sale.id !== saleId);
    await writeData(data);
    return { success: true, message: 'Venda excluída com sucesso' };
}

export async function updateParticipantStatus(participantId, status) {
    const data = await readData();
    
    // Find and update participant in sales
    data.sales = data.sales.map(sale => {
        const updatedParticipants = sale.participants.map(participant => 
            participant.id === participantId 
                ? { ...participant, checkInStatus: status } 
                : participant
        );
        
        return { ...sale, participants: updatedParticipants };
    });
    
    await writeData(data);
    return { success: true, message: 'Status atualizado' };
}

// Complimentary Tickets functions
export async function saveComplimentaryTicket(ticket) {
    const data = await readData();
    data.complimentaryTickets.push(ticket);
    await writeData(data);
    return { success: true, message: 'Cortesia salva' };
}

export async function fetchComplimentaryTickets() {
    const data = await readData();
    return data.complimentaryTickets;
}

export async function deleteComplimentaryTicket(ticketId) {
    const data = await readData();
    data.complimentaryTickets = data.complimentaryTickets.filter(ticket => ticket.id !== ticketId);
    await writeData(data);
    return { success: true, message: 'Cortesia removida' };
}

// Event Configuration functions
export async function saveEventConfiguration(config) {
    const data = await readData();
    data.eventConfiguration = config;
    await writeData(data);
    return { success: true, message: 'Configurações salvas' };
}

export async function getEventConfiguration() {
    const data = await readData();
    return data.eventConfiguration;
}

// Events History functions
export async function saveEventToHistory(eventData) {
    const data = await readData();
    data.events.push(eventData);
    await writeData(data);
    return { success: true, message: 'Evento salvo no histórico' };
}

export async function fetchEvents() {
    const data = await readData();
    return data.events;
}

export async function deleteEvent(eventId) {
    const data = await readData();
    data.events = data.events.filter(event => event.id !== eventId);
    await writeData(data);
    return { success: true, message: 'Evento removido' };
}