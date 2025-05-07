import { fetchSales } from './sheets.js';

// Calculate dashboard metrics
export function calculateDashboardMetrics() {
    try {
        const sales = fetchSales().data || [];
        
        // Calculate total sales
        const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
        
        // Calculate total tickets sold
        const totalTickets = sales.reduce((sum, sale) => sum + sale.quantity, 0);
        
        // Calculate average ticket price
        const averageTicket = totalTickets > 0 ? totalSales / totalTickets : 0;
        
        return {
            totalSales,
            totalTickets,
            averageTicket
        };
    } catch (error) {
        console.error('Error calculating dashboard metrics:', error);
        return {
            totalSales: 0,
            totalTickets: 0,
            averageTicket: 0
        };
    }
}

