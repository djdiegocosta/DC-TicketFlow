// Complimentary Tickets module
import { showToast, generateUniqueId, formatDate } from './app.js';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { getEventConfiguration } from './sheets.js';

const COMPLIMENTARY_TICKETS_KEY = 'complimentary_tickets';

export function initializeComplimentaryTickets() {
    const complimentaryTicketForm = document.getElementById('complimentaryTicketForm');
    const complimentaryTicketsBody = document.getElementById('complimentaryTicketsBody');
    const noComplimentaryTicketsMessage = document.getElementById('noComplimentaryTicketsMessage');
    const ticketTypeSelect = document.getElementById('complimentaryTicketType');

    // Set default focus on "Divulgação"
    ticketTypeSelect.value = 'Divulgação';

    // Load existing complimentary tickets
    document.addEventListener('refreshComplimentaryTickets', loadComplimentaryTickets);

    // Handle form submission
    complimentaryTicketForm.addEventListener('submit', (event) => {
        event.preventDefault();
        
        const participantName = document.getElementById('complimentaryParticipantName').value.trim();
        const ticketType = document.getElementById('complimentaryTicketType').value;
        
        // Create complimentary ticket object
        const complimentaryTicket = {
            id: generateUniqueId(),
            name: participantName,
            type: ticketType,
            date: new Date().toISOString(),
            checkInStatus: 'Pendente'
        };
        
        // Save to localStorage
        saveComplimentaryTicket(complimentaryTicket);
        
        // Reset form
        complimentaryTicketForm.reset();
        
        // Refresh the list
        loadComplimentaryTickets();
        
        // Show success toast
        showToast('Sucesso', 'Cortesia adicionada com sucesso!', 'success');
    });

    // Add export buttons
    addExportButtons();

    // Initial load
    loadComplimentaryTickets();
}

function saveComplimentaryTicket(ticket) {
    try {
        const tickets = getComplimentaryTickets();
        tickets.push(ticket);
        localStorage.setItem(COMPLIMENTARY_TICKETS_KEY, JSON.stringify(tickets));
        return true;
    } catch (error) {
        console.error('Error saving complimentary ticket:', error);
        showToast('Erro', 'Não foi possível salvar a cortesia.', 'error');
        return false;
    }
}

function loadComplimentaryTickets() {
    const complimentaryTicketsBody = document.getElementById('complimentaryTicketsBody');
    const noComplimentaryTicketsMessage = document.getElementById('noComplimentaryTicketsMessage');
    
    // Clear existing rows
    complimentaryTicketsBody.innerHTML = '';
    
    // Get tickets
    const tickets = getComplimentaryTickets();
    
    // Show/hide no tickets message
    if (tickets.length === 0) {
        noComplimentaryTicketsMessage.classList.remove('d-none');
        return;
    }
    noComplimentaryTicketsMessage.classList.add('d-none');
    
    // Render tickets
    tickets.forEach(ticket => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-primary edit-ticket" data-id="${ticket.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger delete-ticket" data-id="${ticket.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn btn-sm btn-success download-ticket" data-id="${ticket.id}">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            </td>
            <td>${ticket.name}</td>
            <td>${ticket.type}</td>
            <td>${formatDate(ticket.date)}</td>
        `;
        
        complimentaryTicketsBody.appendChild(row);
    });
    
    // Add event listeners for actions
    addTicketActionListeners();
}

function addExportButtons() {
    const complimentarySection = document.getElementById('complimentaryTickets');
    
    // Create export buttons container
    const exportButtonsContainer = document.createElement('div');
    exportButtonsContainer.classList.add('mt-3', 'text-end');
    
    // Individual PDF export button
    const individualPdfBtn = document.createElement('button');
    individualPdfBtn.classList.add('btn', 'btn-primary');
    individualPdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Baixar PDFs Individuais';
    individualPdfBtn.addEventListener('click', exportIndividualPdfs);
    
    exportButtonsContainer.appendChild(individualPdfBtn);
    
    complimentarySection.querySelector('.card-body').appendChild(exportButtonsContainer);
}

function addTicketActionListeners() {
    // Delete ticket
    document.querySelectorAll('.delete-ticket').forEach(button => {
        button.addEventListener('click', (event) => {
            const ticketId = event.currentTarget.getAttribute('data-id');
            
            if (confirm('Tem certeza que deseja excluir esta cortesia?')) {
                deleteComplimentaryTicket(ticketId);
                loadComplimentaryTickets();
                showToast('Sucesso', 'Cortesia removida com sucesso!', 'info');
            }
        });
    });
    
    // Edit ticket
    document.querySelectorAll('.edit-ticket').forEach(button => {
        button.addEventListener('click', (event) => {
            const ticketId = event.currentTarget.getAttribute('data-id');
            editComplimentaryTicket(ticketId);
        });
    });
    
    // Download ticket
    document.querySelectorAll('.download-ticket').forEach(button => {
        button.addEventListener('click', async (event) => {
            const ticketId = event.currentTarget.getAttribute('data-id');
            const tickets = getComplimentaryTickets();
            const ticket = tickets.find(t => t.id === ticketId);
            
            if (ticket) {
                await generatePdfTicket(ticket, true);
            }
        });
    });
}

function deleteComplimentaryTicket(ticketId) {
    try {
        const tickets = getComplimentaryTickets();
        const updatedTickets = tickets.filter(ticket => ticket.id !== ticketId);
        localStorage.setItem(COMPLIMENTARY_TICKETS_KEY, JSON.stringify(updatedTickets));
    } catch (error) {
        console.error('Error deleting complimentary ticket:', error);
        showToast('Erro', 'Não foi possível excluir a cortesia.', 'error');
    }
}

function editComplimentaryTicket(ticketId) {
    const tickets = getComplimentaryTickets();
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) return;
    
    // Populate form with existing data
    const nameInput = document.getElementById('complimentaryParticipantName');
    const typeSelect = document.getElementById('complimentaryTicketType');
    
    nameInput.value = ticket.name;
    typeSelect.value = ticket.type;
    
    // Remove the existing ticket
    deleteComplimentaryTicket(ticketId);
    
    // Scroll to the form
    nameInput.focus();
}

function getComplimentaryTickets() {
    try {
        const tickets = localStorage.getItem(COMPLIMENTARY_TICKETS_KEY);
        return tickets ? JSON.parse(tickets) : [];
    } catch (error) {
        console.error('Error retrieving complimentary tickets:', error);
        return [];
    }
}

// PDF Generation Functions
async function generatePdfTicket(ticket, saveDirectly = false) {
    try {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [85, 150] // Smartphone-friendly size
        });

        // Get event configuration
        const eventConfig = getEventConfiguration();
        const eventName = eventConfig?.eventName || 'Evento';
        const eventDate = eventConfig?.eventDate ? new Date(eventConfig.eventDate).toLocaleDateString('pt-BR') : '';
        
        // Generate QR Code as data URL
        const qrCodeDataUrl = await new Promise((resolve, reject) => {
            QRCode.toDataURL(ticket.id, { 
                width: 200, 
                margin: 0 
            }, (err, url) => {
                if (err) {
                    console.error('QR Code generation error:', err);
                    reject(err);
                } else {
                    resolve(url);
                }
            });
        });

        // Validate QR code data URL
        if (!qrCodeDataUrl || !qrCodeDataUrl.startsWith('data:image/png')) {
            throw new Error('Invalid QR Code data URL');
        }

        // Background
        doc.setFillColor(240, 240, 240); // Light gray background
        doc.rect(0, 0, 85, 150, 'F');

        // CORTESIA Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(255, 0, 0); // Red color
        doc.text('CORTESIA', 42.5, 15, { align: 'center' });

        // Cortesia Type
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Tipo: ${ticket.type}`, 42.5, 22, { align: 'center' });

        // Event Details
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(eventName, 42.5, 32, { align: 'center' });

        // Event Date
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(eventDate, 42.5, 40, { align: 'center' });

        // QR Code
        doc.addImage(qrCodeDataUrl, 'PNG', 17.5, 50, 50, 50);

        // Participant Details
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        
        // Truncate name if too long
        const maxNameLength = 20;
        const displayName = ticket.name.length > maxNameLength 
            ? ticket.name.substring(0, maxNameLength) + '...' 
            : ticket.name;

        doc.text(displayName, 42.5, 110, { align: 'center' });

        // Participant ID
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`ID: ${ticket.id}`, 42.5, 118, { align: 'center' });

        // Footer
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Cortesia', 42.5, 140, { align: 'center' });

        if (saveDirectly) {
            // Save directly if specified
            doc.save(`Cortesia_${ticket.name}.pdf`);
        }

        return doc;
    } catch (error) {
        console.error('PDF Generation Error:', error);
        showToast('Erro', `Erro ao gerar PDF para ${ticket.name}`, 'error');
        throw error;
    }
}

async function exportIndividualPdfs() {
    const tickets = getComplimentaryTickets();
    
    if (tickets.length === 0) {
        showToast('Aviso', 'Não há cortesias para exportar.', 'warning');
        return;
    }
    
    // If only one ticket, generate and save directly
    if (tickets.length === 1) {
        await generatePdfTicket(tickets[0], true);
        showToast('Sucesso', 'PDF de cortesia gerado.', 'success');
        return;
    }
    
    // Multiple tickets - create a zip file
    const zip = new JSZip();
    
    // Generate PDFs and add to zip
    for (const ticket of tickets) {
        const doc = await generatePdfTicket(ticket, false);
        const pdfBlob = doc.output('blob');
        zip.file(`Cortesia_${ticket.name}.pdf`, pdfBlob);
    }
    
    // Generate zip file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Create download link
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(zipBlob);
    downloadLink.download = 'Cortesias.zip';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    showToast('Sucesso', 'ZIP com cortesias gerado.', 'success');
}