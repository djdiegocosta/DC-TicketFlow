// courtesias.js
// Este módulo gerencia todas as funcionalidades relacionadas a cortesias.
// Inclui registro, listagem e geração de PDFs para cortesias.

// ==============================================
// IMPORTS DE MÓDULOS
// ==============================================
import { state, supabase } from './app.js';
import { showLoading, hideLoading, showMessage, showDetailedError, showListSkeleton, renderPaginatedList, confirmDelete, generateRandomID } from './utils.js';
import { getExistingParticipantNamesForEvent, checkDuplicateParticipants, getTicketsByEvent, drawTicketOnPdfPage, generateParticipantsPDF } from './vendas.js';

// Função auxiliar para capitalizar palavras
function capitalizeWords(str) {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// ==============================================
// CONFIGURAÇÃO DE EVENT LISTENERS GLOBAIS DO MÓDULO CORTESIAS
// ==============================================

/**
 * @function setupCourtesyHandlers
 * @description Configura os event listeners para os formulários e botões de cortesia.
 * @returns {void}
 * @usedBy `app.js` (initializeApp)
 */
export function setupCourtesyHandlers() {
    const courtesyForm = document.getElementById('courtesy-form');
    if (courtesyForm) {
        courtesyForm.addEventListener('submit', handleRegisterCourtesy);
    }
    const generateCourtesiesPdfBtn = document.getElementById('generate-courtesies-pdf');
    if (generateCourtesiesPdfBtn) {
        generateCourtesiesPdfBtn.addEventListener('click', () => generateParticipantsPDF('courtesies'));
    }

    // Batch courtesy UI
    const batchBtn = document.getElementById('batch-courtesy-btn');
    const batchModal = document.getElementById('batch-courtesy-modal');
    const closeBatchModalBtn = document.getElementById('close-batch-courtesy-modal');
    const cancelBatchBtn = document.getElementById('cancel-batch-courtesy');
    const submitBatchBtn = document.getElementById('submit-batch-courtesy');

    if (batchBtn) batchBtn.addEventListener('click', openBatchCourtesyModal);
    if (closeBatchModalBtn) closeBatchModalBtn.addEventListener('click', closeBatchCourtesyModal);
    if (cancelBatchBtn) cancelBatchBtn.addEventListener('click', closeBatchCourtesyModal);
    if (submitBatchBtn) submitBatchBtn.addEventListener('click', handleBatchCourtesySubmit);
}

// ==============================================
// FUNÇÕES DE CORTESIAS (SCREEN: CORTESIAS)
// ==============================================

/**
 * @function updateCourtesiesScreen
 * @description Atualiza a tela de cortesias.
 * Busca cortesias do Supabase e renderiza a lista de cortesias.
 * @returns {Promise<void>}
 * @usedBy `app.js` (navigateToScreen, updateUI, salesEnabled toggle), `handleRegisterCourtesy`
 */
export async function updateCourtesiesScreen() {
    const content = document.getElementById('courtesies-content');
    const noEventMessage = document.getElementById('no-event-message-courtesy');
    
    if (!content || !noEventMessage) return;

    let courtesiesDisabledMessage = document.getElementById('courtesies-disabled-message');
    if (!courtesiesDisabledMessage) {
        courtesiesDisabledMessage = document.createElement('div');
        courtesiesDisabledMessage.id = 'courtesies-disabled-message';
        courtesiesDisabledMessage.className = 'no-event';
        courtesiesDisabledMessage.innerHTML = `<i class="fas fa-ban"></i><p>O REGISTRO DE CORTESIAS ESTÁ ENCERRADO NO MOMENTO.</p><p>ATIVE EM CONFIGURAÇÕES PARA CONTINUAR.</p>`;
        content.parentNode.insertBefore(courtesiesDisabledMessage, content.nextSibling);
    }

    if (!state.salesEnabled) {
        content.style.display = 'none';
        noEventMessage.style.display = 'none';
        courtesiesDisabledMessage.style.display = 'block';
        return;
    }

    if (!state.activeEvent) {
        content.style.display = 'none';
        noEventMessage.style.display = 'block';
        courtesiesDisabledMessage.style.display = 'none';
        return;
    }
    content.style.display = 'block';
    noEventMessage.style.display = 'none';
    courtesiesDisabledMessage.style.display = 'none';

    const courtesyForm = document.getElementById('courtesy-form');
    const generateCourtesiesPdfBtn = document.getElementById('generate-courtesies-pdf');
    if (courtesyForm) courtesyForm.style.display = 'block';
    if (generateCourtesiesPdfBtn) generateCourtesiesPdfBtn.style.display = 'block';

    showListSkeleton('courtesies-list');
    try {
        await renderFilteredCourtesies('');
    } catch (error) {
        console.error('Error fetching courtesies:', error);
        showDetailedError('ERRO AO BUSCAR CORTESIAS', error, 'Cortesias');
        const courtesiesList = document.getElementById('courtesies-list');
        if (courtesiesList) courtesiesList.innerHTML = '<p class="empty-list-msg">Erro ao carregar cortesias.</p>';
    } finally {
        hideLoading();
    }
}

/**
 * @function handleRegisterCourtesy
 * @description Lida com o envio do formulário de registro de cortesia.
 * Insere um novo ticket de cortesia no Supabase.
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupCourtesyHandlers` (courtesy-form submit)
 */
async function handleRegisterCourtesy(e) {
    e.preventDefault();
    if (!state.salesEnabled) {
        showMessage('error', 'AS CORTESIAS ESTÃO ENCERRADAS NO MOMENTO.');
        return;
    }
    if (!state.activeEvent) return;

    const courtesyNameInput = document.getElementById('courtesy-name');
    if (!courtesyNameInput) return;

    const participantName = courtesyNameInput.value.trim();
    if (!participantName) {
        showMessage('error', 'NOME DO PARTICIPANTE É OBRIGATÓRIO');
        return;
    }

    const participantNameToRegister = capitalizeWords(participantName);

    showLoading();
    try {
        const existingParticipants = await getExistingParticipantNamesForEvent(state.activeEvent.id); // Now async
        // FIX: Ensure 'participantNameToRegister' is always an array when passed to checkDuplicateParticipants
        const duplicateMessages = checkDuplicateParticipants([participantNameToRegister], existingParticipants);

        if (duplicateMessages.length > 0) {
            hideLoading();
            showMessage('error', duplicateMessages.join('<br>'));
            return;
        }

        // Insert into tickets table directly for courtesy (single)
        const { data, error } = await supabase
            .from('tickets')
            .insert([{
                event_id: state.activeEvent.id,
                sale_id: null, // Null for courtesy tickets as per schema
                ticket_code: await generateRandomID('TICKET'),
                participant_name: participantNameToRegister, // store participant owner
                buyer_name: null,
                ticket_type: 'courtesy',
                status: 'valid',
                created_at: new Date().toISOString()
            }])
            .select();

        if (error) throw error;
        const createdTicket = data[0];

        if (createdTicket) {
            showMessage('success', `CORTESIA REGISTRADA! TICKET: ${createdTicket.ticket_code}`);
            e.target.reset();
            updateCourtesiesScreen();
        } else {
            throw new Error('Falha ao registrar cortesia');
        }
    } catch (error) {
        console.error('Error registering courtesy:', error);
        showDetailedError('ERRO AO REGISTRAR CORTESIA', error, 'Cortesias');
    } finally {
        hideLoading();
    }
}

/**
 * Batch courtesy modal control and submission
 */
function openBatchCourtesyModal() {
    const modal = document.getElementById('batch-courtesy-modal');
    const textarea = document.getElementById('batch-courtesy-textarea');
    const err = document.getElementById('batch-courtesy-error');
    if (textarea) textarea.value = '';
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    if (modal) modal.style.display = 'block';
}

function closeBatchCourtesyModal() {
    const modal = document.getElementById('batch-courtesy-modal');
    const err = document.getElementById('batch-courtesy-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    if (modal) modal.style.display = 'none';
}

async function handleBatchCourtesySubmit() {
    const textarea = document.getElementById('batch-courtesy-textarea');
    const err = document.getElementById('batch-courtesy-error');
    if (!textarea) return;
    const raw = textarea.value || '';
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
        if (err) { err.style.display = 'block'; err.textContent = 'Cole ao menos um nome por linha.'; }
        return;
    }
    showLoading();
    try {
        const existing = await getExistingParticipantNamesForEvent(state.activeEvent.id);
        const namesToInsert = lines.map(capitalizeWords);
        const dupMessages = checkDuplicateParticipants(namesToInsert, existing);
        if (dupMessages.length > 0) {
            if (err) { err.style.display = 'block'; err.textContent = dupMessages.join(' / '); }
            hideLoading();
            return;
        }
        // Build inserts while ensuring unique ticket codes (await per ticket)
        const inserts = [];
        for (const name of namesToInsert) {
            inserts.push({
                event_id: state.activeEvent.id,
                sale_id: null,
                ticket_code: await generateRandomID('TICKET'),
                participant_name: name,
                buyer_name: null,
                ticket_type: 'courtesy',
                status: 'valid',
                created_at: new Date().toISOString()
            });
        }
        const { data, error } = await supabase.from('tickets').insert(inserts).select();
        if (error) throw error;
        if (data && data.length > 0) {
            showMessage('success', `CORTESIAS REGISTRADAS: ${data.length}`);
            closeBatchCourtesyModal();
            updateCourtesiesScreen();
        } else {
            throw new Error('Falha ao registrar cortesias em lote');
        }
    } catch (error) {
        console.error('Error registering batch courtesies:', error);
        showDetailedError('ERRO AO REGISTRAR CORTESIAS EM LOTE', error, 'Cortesias');
        if (err) { err.style.display = 'block'; err.textContent = 'Erro ao processar. Veja logs.'; }
    } finally {
        hideLoading();
    }
}

/**
 * @function renderFilteredCourtesies
 * @description Renderiza as cortesias filtradas.
 * @param {string} query - O termo de busca (atualmente não usado para cortesias, mas preparado para o futuro).
 * @returns {Promise<void>}
 */
async function renderFilteredCourtesies(query) {
    try {
        const eventTickets = await getTicketsByEvent(state.activeEvent.id); // Now async
        const courtesyTickets = eventTickets
            .filter(ticket => ticket.ticket_type === 'courtesy')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Atualiza dashboard de cortesias
        const total = courtesyTickets.length;
        const checkedIn = courtesyTickets.filter(t => t.status === 'used' || t.checked_in_at).length;
        const totalEl = document.getElementById('ct-total-courtesies');
        const checkedEl = document.getElementById('ct-checked-in-courtesies');
        if (totalEl) totalEl.textContent = String(total);
        if (checkedEl) checkedEl.textContent = String(checkedIn);

        state.currentPage.courtesies = 1;
        renderPaginatedList('courtesies', courtesyTickets, renderCourtesyItem);
    } catch (error) {
        console.error('Error rendering filtered courtesies:', error);
        showDetailedError('ERRO AO FILTRAR CORTESIAS', error, 'Cortesias');
        const courtesiesList = document.getElementById('courtesies-list');
        if (courtesiesList) courtesiesList.innerHTML = '<p class="empty-list-msg">Erro ao carregar cortesias filtradas.</p>';
    } finally {
        hideLoading();
    }
}

/**
 * @function renderCourtesyItem
 * @description Função de renderização para um item individual na lista de cortesias.
 * @param {object} ticket - O objeto de dados do ticket de cortesia.
 * @returns {HTMLElement} O elemento <div> representando o item.
 * @usedBy `renderFilteredCourtesies`
 */
function renderCourtesyItem(ticket) {
    const itemEl = document.createElement('div');
    itemEl.className = 'list-item';
    
    const title = ticket.participant_name && ticket.participant_name.trim() ? ticket.participant_name : ticket.buyer_name;
    const details = `<p><strong>Tipo:</strong> CORTESIA</p>
           <p><strong>ID Ticket:</strong> ${ticket.ticket_code}</p>`; // Use ticket_code

    itemEl.innerHTML = `
        <div class="item-info">
            <h4>${title}</h4>
            ${details}
            <p><strong>REGISTRO:</strong> ${new Date(ticket.created_at).toLocaleString('pt-BR')}</p>
        </div>
        <div class="item-actions">
            <button class="btn-icon delete-item" data-id="${ticket.id}"><i class="fas fa-trash"></i></button>
            <button class="btn-icon download-ticket-pdf" data-id="${ticket.id}"><i class="fas fa-download"></i></button>
        </div>
    `;

    const deleteBtn = itemEl.querySelector('.delete-item');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            confirmDelete('courtesy', ticket.id, deleteCourtesy);
        });
    }

    const downloadPdfBtn = itemEl.querySelector('.download-ticket-pdf');
    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', () => {
            generateCourtesyTicketPDF(ticket.id);
        });
    }

    return itemEl;
}

/**
 * @function deleteCourtesy
 * @description Exclui um ticket de cortesia do Supabase após confirmação.
 * @param {string} ticketId - O ID do ticket a ser excluído.
 * @returns {Promise<void>}
 * @usedBy `renderCourtesyItem`
 */
async function deleteCourtesy(ticketId) {
    showLoading();
    try {
        const { error } = await supabase
            .from('tickets')
            .delete()
            .eq('id', ticketId);
        
        if (error) throw error;

        showMessage('success', 'Cortesia excluída com sucesso!');
        state.currentPage.courtesies = 1;
        updateCourtesiesScreen();
    } catch (error) {
        console.error('Error deleting courtesy:', error);
        showDetailedError('ERRO AO EXCLUIR CORTESIA', error, 'Cortesias');
    } finally {
        hideLoading();
    }
}

/**
 * @function generateCourtesyTicketPDF
 * @description Gera o PDF de um ticket de cortesia individual.
 * @param {string} ticketId - O ID do ticket de cortesia.
 * @returns {Promise<void>}
 * @usedBy `renderCourtesyItem`
 */
async function generateCourtesyTicketPDF(ticketId) {
    showLoading();
    try {
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', ticketId)
            .single();
        
        if (ticketError) throw ticketError;
        if (!ticket) throw new Error('Ticket de cortesia não encontrado.');

        const eventDetails = state.activeEvent;
        if (!eventDetails) throw new Error('Nenhum evento ativo para gerar ticket.');

        const logoBase64 = state.appLogoBase64;
        const { jsPDF } = window.jspdf;

        const participantName = ticket.participant_name && ticket.participant_name.trim() ? ticket.participant_name : ticket.buyer_name;

        const ticketDoc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [108, 192]
        });
        
        // Passar null para sale_id (string) porque é cortesia, e 0 para preço
        await drawTicketOnPdfPage(ticketDoc, participantName, ticket.ticket_code, 'CORTESIA', eventDetails, 0, logoBase64);

        const cleanParticipantName = ticket.buyer_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
        const cleanTicketCode = ticket.ticket_code.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
        const filename = `${cleanParticipantName}_${cleanTicketCode}.pdf`;

        ticketDoc.save(filename);
        showMessage('success', 'PDF DO INGRESSO DE CORTESIA GERADO!');
        
    } catch (error) {
        console.error('Error generating courtesy ticket PDF:', error);
        showDetailedError('ERRO AO GERAR PDF DA CORTESIA', error, 'Cortesias');
    } finally {
        hideLoading();
    }
}