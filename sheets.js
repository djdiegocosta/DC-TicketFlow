// Local Storage module for the ticket system

const SALES_KEY = 'ticket_sales';
const EVENT_CONFIG_KEY = 'event_configuration';

// Save a ticket sale to localStorage
export function saveTicketSale(saleData) {
    try {
        // Retrieve existing sales
        const sales = getSales();
        
        // Add new sale
        sales.push(saleData);
        
        // Save back to localStorage
        localStorage.setItem(SALES_KEY, JSON.stringify(sales));
        
        return { success: true, message: 'Venda registrada com sucesso' };
    } catch (error) {
        console.error('Error saving ticket sale:', error);
        return { success: false, error: 'Erro ao salvar venda.' };
    }
}

// Fetch all sales from localStorage
export function fetchSales() {
    try {
        return { 
            success: true, 
            data: getSales() 
        };
    } catch (error) {
        console.error('Error fetching sales:', error);
        return { success: false, error: 'Erro ao buscar vendas.' };
    }
}

// Delete a sale from localStorage
export function deleteSale(saleId) {
    try {
        // Retrieve existing sales
        const sales = getSales();
        
        // Filter out the sale with the matching ID
        const updatedSales = sales.filter(sale => sale.id !== saleId);
        
        // Save back to localStorage
        localStorage.setItem(SALES_KEY, JSON.stringify(updatedSales));
        
        return { success: true, message: 'Venda excluída com sucesso' };
    } catch (error) {
        console.error('Error deleting sale:', error);
        return { success: false, error: 'Erro ao excluir venda.' };
    }
}

// Update participant check-in status
export function updateParticipantStatus(participantId, status) {
    try {
        // Retrieve existing sales
        const sales = getSales();
        
        // Find and update the participant
        const updatedSales = sales.map(sale => {
            const updatedParticipants = sale.participants.map(participant => 
                participant.id === participantId 
                    ? { ...participant, checkInStatus: status } 
                    : participant
            );
            
            return { ...sale, participants: updatedParticipants };
        });
        
        // Save back to localStorage
        localStorage.setItem(SALES_KEY, JSON.stringify(updatedSales));
        
        return { success: true, message: 'Status do participante atualizado' };
    } catch (error) {
        console.error('Error updating participant status:', error);
        return { success: false, error: 'Erro ao atualizar status.' };
    }
}

// Get sales from localStorage, with fallback
export function getSales() {
    try {
        const salesData = localStorage.getItem(SALES_KEY);
        return salesData ? JSON.parse(salesData) : [];
    } catch (error) {
        console.error('Error retrieving sales:', error);
        return [];
    }
}

// Test localStorage connection (simple implementation)
export function testGoogleSheetsConnection() {
    try {
        // For localStorage, always return success
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Erro ao testar conexão.' };
    }
}

// Save and get Google Sheets URL (now just a placeholder)
export function saveGoogleSheetsUrl() { /* Not used */ }
export function getGoogleSheetsUrl() { return ''; }
export function setGoogleSheetsUrl() { /* Not used */ }

// Save event configuration
export function saveEventConfiguration(config) {
    try {
        localStorage.setItem(EVENT_CONFIG_KEY, JSON.stringify(config));
        return { success: true, message: 'Configurações salvas com sucesso' };
    } catch (error) {
        console.error('Error saving event configuration:', error);
        return { success: false, error: 'Erro ao salvar configurações.' };
    }
}

// Get event configuration
export function getEventConfiguration() {
    try {
        const configData = localStorage.getItem(EVENT_CONFIG_KEY);
        return configData ? JSON.parse(configData) : null;
    } catch (error) {
        console.error('Error retrieving event configuration:', error);
        return null;
    }
}