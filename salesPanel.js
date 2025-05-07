// Sales Panel module for the ticket system
import { formatDate, showToast } from './app.js';
import { fetchSales, deleteSale, saveTicketSale, getEventConfiguration } from './sheets.js';
import { generateQrCode } from './qrcode.js';
import jsPDF from 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm';
import QRCode from 'qrcode';
import { calculateDashboardMetrics } from './dashboard.js';

let currentSales = []; // Store current sales data

// Initialize sales panel functionality
export function initializeSalesPanel() {
    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchSales');
    const exportPdfButton = document.getElementById('exportParticipantsPdfBtn'); // Get the new button

    // Refresh sales data when navigating to this panel
    document.addEventListener('refreshSalesData', () => {
        // This listener previously updated the dashboard directly.
        // Now, refreshSalesData will trigger refreshDashboardData in app.js,
        // which is a cleaner separation of concerns.
        // We keep the table rendering logic within loadSalesData.
    });

    // Setup search functionality
    searchButton.addEventListener('click', () => {
        filterSales(searchInput.value);
    });
    
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            filterSales(event.target.value);
        }
    });
    
    // Setup export PDF functionality
    if (exportPdfButton) {
        exportPdfButton.addEventListener('click', exportParticipantsListPdf);
    }

    // Initial data load
    loadSalesData();
    
    // Setup modal interactions
    setupSaleDetailModal();
}

// Load sales data from the Google Sheet (now localStorage/filestore)
async function loadSalesData() {
    const salesTableBody = document.getElementById('salesTableBody');
    const salesLoading = document.getElementById('salesLoading');
    const noSalesMessage = document.getElementById('noSalesMessage');
    const searchInput = document.getElementById('searchSales'); // Get search input

    try {
        // Show loading indicator
        salesTableBody.innerHTML = '';
        salesLoading.classList.remove('d-none');
        noSalesMessage.classList.add('d-none');
        
        // Fetch data from storage
        const result = await fetchSales();
        
        if (result.success) {
            currentSales = result.data || [];
            
            // Hide loading indicator
            salesLoading.classList.add('d-none');
            
            // Render the table (either all or filtered if search is active)
            const searchTerm = searchInput.value.trim();
            if (searchTerm) {
                filterSales(searchTerm); // Re-apply filter if search input has value
            } else {
                renderSalesTable(currentSales); // Render all if no search term
            }
            
            if (currentSales.length === 0) {
                // Show no sales message if there are no sales at all
                noSalesMessage.textContent = 'Nenhuma venda encontrada.';
                noSalesMessage.classList.remove('d-none', 'alert-danger');
                noSalesMessage.classList.add('alert-info');
            } else if (searchTerm && filterSales(searchTerm).length === 0) {
                // Show no sales message if search term is active but no results
                noSalesMessage.textContent = `Nenhuma venda encontrada para "${searchTerm}".`;
                noSalesMessage.classList.remove('d-none', 'alert-danger');
                noSalesMessage.classList.add('alert-info');
            } else {
                noSalesMessage.classList.add('d-none');
            }

            // Dispatch event to signal data is loaded/updated
            document.dispatchEvent(new CustomEvent('refreshSalesData'));

        } else {
            throw new Error(result.error || 'Erro ao carregar vendas.');
        }
    } catch (error) {
        console.error('Error loading sales data:', error);
        salesLoading.classList.add('d-none');
        noSalesMessage.textContent = 'Erro ao carregar dados. Tente novamente.';
        noSalesMessage.classList.remove('d-none', 'alert-info');
        noSalesMessage.classList.add('alert-danger');
        showToast('Erro', 'Não foi possível carregar os dados de vendas.', 'error');
    }
}

// Render the sales table with the provided data
function renderSalesTable(sales) {
    const salesTableBody = document.getElementById('salesTableBody');
    salesTableBody.innerHTML = '';
    
    if (sales.length === 0) {
        // Handled by loadSalesData now showing a specific message
        return;
    }

    sales.forEach(sale => {
        const row = document.createElement('tr');
        
        // Count completed check-ins
        const completedCheckIns = sale.participants.filter(p => p.checkInStatus === 'Concluído').length;
        const totalParticipants = sale.participants.length;
        
        // Create status badge
        let statusBadge;
        if (completedCheckIns === 0) {
            statusBadge = '<span class="badge bg-warning">Pendente</span>';
        } else if (completedCheckIns === totalParticipants) {
            statusBadge = '<span class="badge bg-success">Concluído</span>';
        } else {
            statusBadge = `<span class="badge bg-info">${completedCheckIns}/${totalParticipants}</span>`;
        }
        
        // Create row content in the new order:
        // Ações; Participantes; Status; Qtd; Valor; Pagamento; Data; ID
        row.innerHTML = `
            <td>
                <button class="btn btn-sm btn-primary view-sale" data-sale-id="${sale.id}">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
            <td>${sale.participants[0].name}${sale.participants.length > 1 ? ` + ${sale.participants.length - 1}` : ''}</td>
            <td>${statusBadge}</td>
            <td>${sale.quantity}</td>
            <td>R$ ${sale.totalAmount.toFixed(2)}</td>
            <td>${sale.paymentMethod}</td>
            <td>${formatDate(sale.date)}</td>
            <td>${sale.id.substring(0, 8)}...</td>
        `;
        
        salesTableBody.appendChild(row);
    });
    
    // Add event listeners to view buttons
    document.querySelectorAll('.view-sale').forEach(button => {
        button.addEventListener('click', () => {
            const saleId = button.getAttribute('data-sale-id');
            openSaleDetailModal(saleId);
        });
    });
}

// Filter sales based on search query
function filterSales(query) {
    const searchTerm = query.toLowerCase().trim();
    const noSalesMessage = document.getElementById('noSalesMessage');

    if (!searchTerm) {
        renderSalesTable(currentSales); // Render all if query is empty
        if (currentSales.length > 0) {
            noSalesMessage.classList.add('d-none');
        } else {
            noSalesMessage.textContent = 'Nenhuma venda encontrada.';
            noSalesMessage.classList.remove('d-none', 'alert-danger');
            noSalesMessage.classList.add('alert-info');
        }
        return currentSales; // Return full list
    }
    
    const filteredSales = currentSales.filter(sale => {
        // Check if ID contains the search term
        if (sale.id.toLowerCase().includes(searchTerm)) {
            return true;
        }
        
        // Check if any participant name contains the search term
        for (const participant of sale.participants) {
            if (participant.name.toLowerCase().includes(searchTerm)) {
                return true;
            }
            
            // Check if participant ID contains the search term
            if (participant.id.toLowerCase().includes(searchTerm)) {
                return true;
            }
        }
        
        return false;
    });
    
    renderSalesTable(filteredSales);
    
    if (filteredSales.length === 0) {
        noSalesMessage.textContent = `Nenhuma venda encontrada para "${query}".`;
        noSalesMessage.classList.remove('d-none', 'alert-danger');
        noSalesMessage.classList.add('alert-info');
    } else {
        noSalesMessage.classList.add('d-none');
    }

    return filteredSales; // Return filtered list
}

// Setup the sale detail modal functionality
function setupSaleDetailModal() {
    const modal = document.getElementById('saleDetailModal');
    const modalDeleteBtn = document.getElementById('modalDeleteBtn');
    
    // Handle delete button click
    modalDeleteBtn.addEventListener('click', async () => {
        const saleId = modal.getAttribute('data-sale-id');
        
        if (confirm('Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.')) {
            try {
                modalDeleteBtn.disabled = true;
                modalDeleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Excluindo...';
                
                const result = await deleteSale(saleId);
                
                if (result.success) {
                    // Close the modal
                    const bsModal = bootstrap.Modal.getInstance(modal);
                    bsModal.hide();
                    
                    // Reload sales data (this will fetch fresh data and trigger refreshSalesData)
                    loadSalesData();
                    
                    showToast('Sucesso', 'Venda excluída com sucesso!', 'success');
                } else {
                    throw new Error(result.error || 'Erro ao excluir venda.');
                }
            } catch (error) {
                console.error('Error deleting sale:', error);
                showToast('Erro', 'Não foi possível excluir a venda. Tente novamente.', 'error');
            } finally {
                modalDeleteBtn.disabled = false;
                modalDeleteBtn.innerHTML = '<i class="fas fa-trash"></i> Excluir Venda';
            }
        }
    });
}

// Open the sale detail modal with the specified sale data
function openSaleDetailModal(saleId) {
    const sale = currentSales.find(s => s.id === saleId);
    
    if (!sale) {
        showToast('Erro', 'Venda não encontrada.', 'error');
        return;
    }
    
    const modal = document.getElementById('saleDetailModal');
    const participantsList = document.getElementById('modalParticipantsList');
    
    // Set modal data attributes
    modal.setAttribute('data-sale-id', sale.id);
    
    // Fill in modal fields
    document.getElementById('modalSaleId').textContent = sale.id;
    document.getElementById('modalSaleDate').textContent = formatDate(sale.date);
    document.getElementById('modalPaymentMethod').textContent = sale.paymentMethod;
    document.getElementById('modalTicketQuantity').textContent = sale.quantity;
    document.getElementById('modalTotalAmount').textContent = sale.totalAmount.toFixed(2);
    
    // Clear previous participants
    participantsList.innerHTML = '';
    
    // Add participants to the list
    sale.participants.forEach((participant, index) => {
        const card = document.createElement('div');
        card.classList.add('card', 'mb-2', 'participant-card');
        
        if (participant.checkInStatus === 'Concluído') {
            card.classList.add('validated');
        }
        
        const cardBody = document.createElement('div');
        cardBody.classList.add('card-body');
        
        const row = document.createElement('div');
        row.classList.add('row', 'align-items-center');
        
        // Participant info column with editable name
        const infoCol = document.createElement('div');
        infoCol.classList.add('col-md-8');
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.classList.add('form-control', 'form-control-sm', 'mb-2');
        nameInput.value = participant.name;
        nameInput.setAttribute('data-participant-index', index);
        
        // Edit save button
        const saveNameBtn = document.createElement('button');
        saveNameBtn.classList.add('btn', 'btn-sm', 'btn-outline-primary', 'mb-2');
        saveNameBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Nome';
        saveNameBtn.addEventListener('click', () => editParticipantName(sale, index, nameInput, saveNameBtn)); // Pass button to disable/re-enable
        
        const idDisplay = document.createElement('p');
        idDisplay.classList.add('mb-1', 'small');
        idDisplay.innerHTML = `ID: ${participant.id}`;
        
        const statusDisplay = document.createElement('p');
        statusDisplay.classList.add('mb-0', 
            participant.checkInStatus === 'Concluído' ? 'text-success' : 'text-warning'
        );
        statusDisplay.innerHTML = `
            <i class="fas ${participant.checkInStatus === 'Concluído' ? 'fa-check-circle' : 'fa-clock'}"></i>
            ${participant.checkInStatus}
        `;
        
        infoCol.appendChild(nameInput);
        infoCol.appendChild(saveNameBtn);
        infoCol.appendChild(idDisplay);
        infoCol.appendChild(statusDisplay);
        
        // QR code column (existing code)
        const qrCol = document.createElement('div');
        qrCol.classList.add('col-md-4', 'text-center');
        
        const qrButton = document.createElement('button');
        qrButton.classList.add('btn', 'btn-outline-primary', 'btn-sm');
        qrButton.innerHTML = '<i class="fas fa-qrcode"></i> QR Code';
        qrButton.addEventListener('click', () => {
            showParticipantQrCode(participant);
        });
        
        qrCol.appendChild(qrButton);
        
        // Existing download button code...
        
        const downloadButton = document.createElement('button');
        downloadButton.classList.add('btn', 'btn-primary', 'btn-sm', 'mt-2');
        downloadButton.innerHTML = '<i class="fas fa-download"></i> Baixar Ingresso PDF';
        downloadButton.addEventListener('click', async (event) => {
            event.target.disabled = true; // Disable button
            event.target.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Gerando...';

            try {
                const { pdf, qrCodeDataUrl } = await generatePdfTicket(participant, sale);
            
                // Create a sharing container
                const shareContainer = document.createElement('div');
                shareContainer.classList.add('text-center', 'mt-2');
                
                // PDF Download Button
                const downloadBtn = document.createElement('button');
                downloadBtn.classList.add('btn', 'btn-primary', 'btn-sm', 'me-2');
                downloadBtn.innerHTML = '<i class="fas fa-download"></i> Baixar PDF';
                downloadBtn.addEventListener('click', () => {
                    pdf.save(`Ingresso_${participant.name}.pdf`);
                });
                
                // WhatsApp Share Button
                const whatsappBtn = document.createElement('button');
                whatsappBtn.classList.add('btn', 'btn-success', 'btn-sm');
                whatsappBtn.innerHTML = '<i class="fab fa-whatsapp"></i> Compartilhar';
                whatsappBtn.addEventListener('click', () => {
                    shareTicketViaWhatsApp(participant, sale, qrCodeDataUrl);
                });
                
                shareContainer.appendChild(downloadBtn);
                shareContainer.appendChild(whatsappBtn);
                
                // Replace the existing download button with the new container
                downloadButton.replaceWith(shareContainer);
            } catch (error) {
                console.error('Error generating PDF ticket:', error);
                showToast('Erro', 'Não foi possível gerar o ingresso.', 'error');
                downloadButton.disabled = false;
                downloadButton.innerHTML = '<i class="fas fa-download"></i> Baixar Ingresso PDF';
            }
        });

        cardBody.appendChild(downloadButton);

        // Assemble the card
        row.appendChild(infoCol);
        row.appendChild(qrCol);
        cardBody.appendChild(row);
        card.appendChild(cardBody);
        participantsList.appendChild(card);
    });
    
    // Show the modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

// Function to generate PDF ticket with QR code
async function generatePdfTicket(participant, sale) {
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
    const qrCodeDataUrl = await new Promise((resolve) => {
        QRCode.toDataURL(participant.id, { 
            width: 200, 
            margin: 0 
        }, (err, url) => {
            if (err) console.error(err);
            resolve(url);
        });
    });

    // Background
    doc.setFillColor(240, 240, 240); // Light gray background
    doc.rect(0, 0, 85, 150, 'F');

    // Event Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(eventName, 42.5, 20, { align: 'center' });

    // Event Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(eventDate, 42.5, 28, { align: 'center' });

    // QR Code
    doc.addImage(qrCodeDataUrl, 'PNG', 17.5, 40, 50, 50);

    // Participant Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    
    // Truncate name if too long
    const maxNameLength = 20;
    const displayName = participant.name.length > maxNameLength 
        ? participant.name.substring(0, maxNameLength) + '...' 
        : participant.name;

    doc.text(displayName, 42.5, 100, { align: 'center' });

    // Participant ID
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`ID: ${participant.id}`, 42.5, 108, { align: 'center' });

    // Footer
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Ingresso Pessoal e Intransferível', 42.5, 140, { align: 'center' });

    // Return both the PDF document and the QR code data URL for sharing
    return {
        pdf: doc,
        qrCodeDataUrl: qrCodeDataUrl
    };
}

// Show the QR code for a specific participant
function showParticipantQrCode(participant) {
    const modal = document.getElementById('qrCodeModal');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const participantName = document.getElementById('qrParticipantName');
    
    // Clear previous QR code
    qrCodeContainer.innerHTML = '';
    
    // Set participant name
    participantName.textContent = participant.name;
    
    // Generate QR code
    generateQrCode(participant.id, qrCodeContainer);
    
    // Show the modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

// New function to handle WhatsApp sharing
function shareTicketViaWhatsApp(participant, sale, qrCodeDataUrl) {
    // Get event configuration
    const eventConfig = getEventConfiguration();
    const eventName = eventConfig?.eventName || 'Evento';
    const eventDate = eventConfig?.eventDate ? new Date(eventConfig.eventDate).toLocaleDateString('pt-BR') : '';
    
    // Construct the message
    const message = encodeURIComponent(` Ingresso para ${eventName}

 Participante: ${participant.name}
 Data: ${eventDate}
 Código: ${participant.id}

QR Code do seu ingresso anexado abaixo:`);
    
    // Convert data URL to Blob for sharing
    fetch(qrCodeDataUrl)
        .then(res => res.blob())
        .then(blob => {
            // Create a file from the blob
            const file = new File([blob], 'ticket_qrcode.png', { type: 'image/png' });
            
            // Check if Web Share API is supported
            if (navigator.share) {
                navigator.share({
                    title: `Ingresso - ${participant.name}`,
                    text: message,
                    files: [file]
                }).catch(console.error);
            } else {
                // Fallback to WhatsApp web share URL
                // Note: WhatsApp Web Share API with files is more reliable.
                // Simple text+image URL doesn't work everywhere.
                // A common workaround is using a link to download the image/PDF or hosting it.
                // For this local-first app, let's provide a basic text message fallback.
                 const basicMessage = encodeURIComponent(`Ingresso para ${eventName}\nParticipante: ${participant.name}\nData: ${eventDate}\nCódigo: ${participant.id}\n\nMostre este código no check-in.`);
                const whatsappUrl = `https://api.whatsapp.com/send?text=${basicMessage}`;
                window.open(whatsappUrl, '_blank');
            }
        })
        .catch(error => {
            console.error('Error sharing ticket:', error);
            showToast('Erro', 'Não foi possível compartilhar o ingresso.', 'error');
        });
}

// New function to handle participant name editing
async function editParticipantName(sale, participantIndex, nameInput, saveNameBtn) {
    try {
        const newName = nameInput.value.trim();
        
        // Validate name
        if (!newName) {
            showToast('Erro', 'O nome do participante não pode estar vazio.', 'error');
            return;
        }
        
        // Disable input and button during save
        nameInput.disabled = true;
        saveNameBtn.disabled = true;
        saveNameBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Salvando...';
        
        // Create a copy of the sale with updated participant name
        const updatedSale = JSON.parse(JSON.stringify(sale));
        updatedSale.participants[participantIndex].name = newName;
        
        // Find the current index of the sale in currentSales array
        const saleIndex = currentSales.findIndex(s => s.id === sale.id);
        if (saleIndex === -1) {
            throw new Error('Venda não encontrada localmente para atualização.');
        }

        // Update the sale in the local currentSales array
        currentSales[saleIndex] = updatedSale;

        // Save the updated state of all sales back to storage
        // Note: This overwrites the entire sales array in storage.
        // A more robust approach might involve finding and updating just the specific sale in the storage file.
        // Given the current file structure/abstraction, rewriting is simpler but less efficient for very large datasets.
        // The filestore.js updateParticipantStatus function does this by reading/writing the whole file.
        // We need to align this client-side logic with the server-side (filestore.js) logic.
        // The current filestore.js updateParticipantStatus only updates checkInStatus.
        // We need a generic updateSale function in filestore.js or replicate the read/modify/write here.
        // Let's assume filestore.js will be updated to support full sale updates or use the existing delete+save pattern temporarily,
        // but the UI needs immediate feedback. Updating local `currentSales` gives immediate UI feedback.
        // Let's call delete and save as per previous logic, assuming atomicity is handled by the storage layer.

        const result = await deleteSale(sale.id);
        
        if (result.success) {
            const saveResult = await saveTicketSale(updatedSale);
            
            if (saveResult.success) {
                // Data is now consistent between local `currentSales` and storage.
                // Reload sales data is not strictly necessary here if `currentSales` is kept in sync
                // and the modal is showing data from `currentSales`.
                // However, calling loadSalesData ensures the main table is refreshed if the modal is closed.
                loadSalesData();
                
                showToast('Sucesso', 'Nome do participante atualizado!', 'success');
            } else {
                // If save fails, revert local change and show error
                currentSales[saleIndex] = sale; // Revert local data
                showToast('Erro', 'Não foi possível salvar o nome atualizado.', 'error');
                console.error('Error saving updated sale:', saveResult.error);
            }
        } else {
             // If delete fails, show error
             showToast('Erro', 'Não foi possível atualizar o nome.', 'error');
             console.error('Error deleting sale before update:', result.error);
        }
    } catch (error) {
        console.error('Error editing participant name:', error);
        showToast('Erro', 'Ocorreu um erro ao tentar atualizar o nome.', 'error');
    } finally {
        // Re-enable input and button
        nameInput.disabled = false;
        saveNameBtn.disabled = false;
        saveNameBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Nome';
    }
}

// Function to export the list of participants as a PDF
async function exportParticipantsListPdf() {
    try {
        if (currentSales.length === 0) {
            showToast('Aviso', 'Não há vendas registradas para exportar.', 'warning');
            return;
        }

        // Collect all participants from all sales
        let allParticipants = [];
        currentSales.forEach(sale => {
            allParticipants = allParticipants.concat(sale.participants);
        });

        if (allParticipants.length === 0) {
             showToast('Aviso', 'Não há participantes registrados para exportar.', 'warning');
            return;
        }
        
        // Sort participants alphabetically by name
        allParticipants.sort((a, b) => a.name.localeCompare(b.name));

        // Get event configuration for title
        const eventConfig = getEventConfiguration();
        const eventName = eventConfig?.eventName || 'Evento Sem Nome';
        const eventDate = eventConfig?.eventDate ? new Date(eventConfig.eventDate).toLocaleDateString('pt-BR') : '';
        const pdfTitle = `${eventName}`;
        const pdfSubtitle = eventDate ? `Data: ${eventDate}` : '';

        const doc = new jsPDF(); // Default is A4, portrait

        // Set font and sizes
        doc.setFont('helvetica');

        // Add title
        doc.setFontSize(16);
        doc.text(pdfTitle, 14, 20); // Start 14mm from left margin

        // Add subtitle (date)
        if (pdfSubtitle) {
             doc.setFontSize(12);
             doc.text(pdfSubtitle, 14, 26);
        }

        // Starting position for the list
        let yPos = pdfSubtitle ? 36 : 30; // Adjust starting position based on subtitle
        const lineHeight = 7; // Small spacing between lines
        const checkboxSize = 4; // Size of the checkbox square
        const textIndent = 8; // Space between checkbox and text

        // Add participants list
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50); // Dark grey text

        allParticipants.forEach(participant => {
            // Check if we need a new page
            if (yPos > doc.internal.pageSize.height - 20) { // 20mm bottom margin
                doc.addPage();
                yPos = 14; // Restart Y position with a top margin
                 // Optionally repeat header on new pages
                 doc.setFontSize(14);
                 doc.setTextColor(0, 0, 0);
                 doc.text(`Lista de Participantes - ${eventName}`, 14, 20);
                 doc.setFontSize(10);
                 doc.setTextColor(50, 50, 50);
                 yPos = 30;
            }

            // Draw checkbox square
            doc.rect(14, yPos - checkboxSize * 0.8, checkboxSize, checkboxSize); // Position slightly above text baseline

            // Draw participant name
            const nameText = participant.name;
            const textX = 14 + checkboxSize + textIndent;
            doc.text(nameText, textX, yPos);

            // Move to the next line
            yPos += lineHeight;
        });

        // Save the PDF
        doc.save(`Lista_Participantes_${eventName.replace(/\s+/g, '_')}.pdf`);

        showToast('Sucesso', 'Lista de participantes exportada para PDF.', 'success');

    } catch (error) {
        console.error('Error exporting participants list PDF:', error);
        showToast('Erro', 'Não foi possível exportar a lista de participantes.', 'error');
    }
}