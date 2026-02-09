// vendas.js
// Este módulo gerencia todas as funcionalidades relacionadas a vendas e cortesias.
// Inclui registro de vendas, registro de cortesias, listagem e edição de vendas,
// listagem de cortesias, e geração de PDFs de participantes.

// ==============================================
// IMPORTS DE MÓDULOS
// ==============================================

import { state, supabase } from './app.js';
import { showLoading, hideLoading, showMessage, showDetailedError, showListSkeleton, renderPaginatedList, confirmDelete, clearFormErrors, showFieldError, generateRandomID, normalizeText } from './utils.js';
import QRious from 'qrious'; // Import QRious for QR code generation

// ==============================================
// VARIÁVEIS DE ESTADO DO MÓDULO
// ==============================================

let currentQuantity = 1; // Quantidade de ingressos selecionada na tela de registro de venda.

// Palavras comuns em nomes brasileiros que geralmente não indicam sobrenome distintivo
const COMMON_PREPOSITIONS = ['DA', 'DE', 'DO', 'DAS', 'DOS', 'E'];

// ==============================================
// REFERÊNCIAS AO DOM PARA MODAIS DE EVENTOS
// ==============================================

// NOVO: Referências ao DOM para o modal do WhatsApp
const whatsappModal = document.getElementById('whatsapp-modal');
const closeWhatsappModalBtn = document.getElementById('close-whatsapp-modal');
const whatsappForm = document.getElementById('whatsapp-form');
const whatsappSaleIdInput = document.getElementById('whatsapp-sale-id');
const whatsappNumberInput = document.getElementById('whatsapp-number');

// ==============================================
// FUNÇÕES DE REGISTRO DE VENDA (SCREEN: REGISTRAR VENDA)
// ==============================================

/**
 * @function setupSaleHandlers
 * @description Configura os event listeners para os formulários e botões de venda.
 * @returns {void}
 * @usedBy `app.js` (initializeApp)
 */
export function setupSaleHandlers() {
    const qtyMinusBtn = document.getElementById('qty-minus');
    const qtyPlusBtn = document.getElementById('qty-plus');
    const registerSaleForm = document.getElementById('register-sale-form');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const editSaleForm = document.getElementById('edit-sale-form');

    const generateSalesPdfBtn = document.getElementById('generate-sales-pdf');
    const downloadPdfConfirmBtn = document.getElementById('download-pdf-confirm');
    const cancelPdfPreviewBtn = document.getElementById('cancel-pdf-preview');
    const closePdfPreviewBtn = document.getElementById('close-pdf-preview');

    if (qtyMinusBtn) qtyMinusBtn.addEventListener('click', () => updateQuantity(-1));
    if (qtyPlusBtn) qtyPlusBtn.addEventListener('click', () => updateQuantity(1));
    if (registerSaleForm) registerSaleForm.addEventListener('submit', handleRegisterSale);
    if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', () => document.getElementById('edit-sale-modal').style.display = 'none');
    if (editSaleForm) editSaleForm.addEventListener('submit', handleUpdateSale);

    if (generateSalesPdfBtn) {
        generateSalesPdfBtn.addEventListener('click', () => generateParticipantsPDF('sales'));
    }
    if (downloadPdfConfirmBtn) downloadPdfConfirmBtn.addEventListener('click', downloadPdfConfirm);
    if (cancelPdfPreviewBtn) cancelPdfPreviewBtn.addEventListener('click', closePdfPreview);
    if (closePdfPreviewBtn) closePdfPreviewBtn.addEventListener('click', closePdfPreview);

    // NOVO: Event listeners para o modal do WhatsApp
    if (closeWhatsappModalBtn) {
        closeWhatsappModalBtn.addEventListener('click', closeWhatsappModal);
    }
    if (whatsappNumberInput) {
        whatsappNumberInput.addEventListener('input', formatWhatsappNumber);
    }
    if (whatsappForm) {
        whatsappForm.addEventListener('submit', handleSendTicketsToWhatsapp);
    }
    
    // Setup search input for sales management
    setupSalesSearch();
}

/**
 * @function updateRegisterSaleScreen
 * @description Atualiza a tela de registro de venda com base no evento ativo e no estado de vendas habilitadas.
 * Exibe mensagens apropriadas se não houver evento ativo ou se as vendas estiverem encerradas.
 * @returns {void}
 * @usedBy `app.js` (navigateToScreen, updateUI, salesEnabled toggle)
 */
export function updateRegisterSaleScreen() {
    const noEventMessage = document.getElementById('no-event-message');
    const registerSaleForm = document.getElementById('register-sale-form');
    
    if (!noEventMessage || !registerSaleForm) return;

    let salesDisabledMessage = document.getElementById('sales-disabled-message');
    if (!salesDisabledMessage) {
        salesDisabledMessage = document.createElement('div');
        salesDisabledMessage.id = 'sales-disabled-message';
        salesDisabledMessage.className = 'no-event';
        salesDisabledMessage.innerHTML = `<i class="fas fa-ban"></i><p>AS VENDAS ESTÃO ENCERRADAS NO MOMENTO.</p><p>ATIVE EM CONFIGURAÇÕES PARA CONTINUAR.</p>`;
        registerSaleForm.parentNode.insertBefore(salesDisabledMessage, registerSaleForm.nextSibling);
    }

    if (!state.salesEnabled) {
        noEventMessage.style.display = 'none';
        registerSaleForm.style.display = 'none';
        salesDisabledMessage.style.display = 'block';
        return;
    }

    if (state.activeEvent) {
        noEventMessage.style.display = 'none';
        registerSaleForm.style.display = 'block';
        salesDisabledMessage.style.display = 'none';
        updateQuantityDisplay();
    } else {
        noEventMessage.style.display = 'block';
        registerSaleForm.style.display = 'none';
        salesDisabledMessage.style.display = 'none';
    }
}

/**
 * @function handleRegisterSale
 * @description Lida com o envio do formulário de registro de venda.
 * Coleta os dados dos participantes, insere uma nova venda e os tickets associados no Supabase.
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupSaleHandlers` (register-sale-form submit)
 */
async function handleRegisterSale(e) {
    e.preventDefault();
    if (!state.salesEnabled) {
        showMessage('error', 'AS VENDAS ESTÃO ENCERRADAS NO MOMENTO.');
        return;
    }
    if (!state.activeEvent) {
        showMessage('error', 'NENHUM EVENTO ATIVO ENCONTRADO');
        showDetailedError('Nenhum evento ativo', new Error('Tentativa de registrar venda sem evento ativo'), 'Vendas');
        return;
    }

    const participantsInput = Array.from({ length: currentQuantity }, (_, i) => {
        const input = document.getElementById(`participant-${i + 1}`);
        return input ? input.value.trim() : '';
    }).filter(Boolean);

    if (participantsInput.length === 0) {
        showMessage('error', 'ADICIONE PELO MENOS UM PARTICIPANTE');
        return;
    }
    
    // NOVO: Aplica capitalização correta aos nomes dos participantes
    const participantsToRegister = participantsInput.map(name => capitalizeWords(name));

    showLoading();
    try {
        const existingParticipants = await getExistingParticipantNamesForEvent(state.activeEvent.id);
        const duplicateMessages = checkDuplicateParticipants(participantsToRegister, existingParticipants);

        if (duplicateMessages.length > 0) {
            hideLoading();
            showMessage('error', duplicateMessages.join('<br>'));
            return;
        }

        const saleCode = await generateRandomID('SALE');
        const totalAmount = currentQuantity * state.activeEvent.ticket_price;

        // 1. Insert into sales table
        const { data: saleData, error: saleError } = await supabase
            .from('sales')
            .insert([{
                event_id: state.activeEvent.id,
                sale_code: saleCode,
                total_amount: totalAmount,
                number_of_tickets: currentQuantity,
                payment_status: 'pending', // default to pending per new standard
                // created_by_user_id: <current_user_id> (future integration)
                created_at: new Date().toISOString()
            }])
            .select();

        if (saleError) throw saleError;
        const newSale = saleData[0];

        // 2. Prepare and insert into tickets table
        const ticketsToInsert = participantsToRegister.map(name => ({
            event_id: state.activeEvent.id,
            sale_id: newSale.id, // Link to the newly created sale
            ticket_code: generateRandomID('TICKET'),
            participant_name: name,      // store participant (owner) name in participant_name
            buyer_name: null,            // buyer_name remains null (buyer not collected here)
            // Write canonical value for sold tickets going forward
            ticket_type: 'sell',
            status: 'inactive', // tickets start inactive until payment confirmed
            created_at: new Date().toISOString()
        }));

        const { error: ticketsError } = await supabase
            .from('tickets')
            .insert(ticketsToInsert);

        if (ticketsError) throw ticketsError;

        showMessage('success', `VENDA REGISTRADA! ID: ${newSale.sale_code}<br>${currentQuantity} TICKET(S) GERADO(S)`);
        e.target.reset();
        currentQuantity = 1;
        updateQuantityDisplay();
        updateSalesManagementScreen(); // Atualiza a tela de gestão de vendas.
    } catch (error) {
        console.error('Error registering sale:', error);
        showDetailedError('ERRO AO REGISTRAR VENDA', error, 'Vendas');
    } finally {
        hideLoading();
    }
}

/**
 * @function updateQuantity
 * @description Atualiza a quantidade de ingressos a serem registrados.
 * Limita a quantidade entre 1 e 10.
 * @param {number} delta - The value to add or subtract from the current quantity (e.g., -1 or 1).
 * @returns {void}
 * @usedBy `setupSaleHandlers` (qty-minus, qty-plus buttons)
 */
function updateQuantity(delta) {
    const newQuantity = currentQuantity + delta;
    if (newQuantity >= 1 && newQuantity <= 10) {
        currentQuantity = newQuantity;
        updateQuantityDisplay();
    }
}

/**
 * @function updateQuantityDisplay
 * @description Atualiza o texto que exibe a quantidade de ingressos e chama a atualização dos campos de participante e subtotal.
 * @returns {void}
 * @usedBy `updateRegisterSaleScreen`, `updateQuantity`
 */
function updateQuantityDisplay() {
    const qtyDisplay = document.getElementById('qty-display');
    if (qtyDisplay) {
        qtyDisplay.textContent = currentQuantity;
    }
    updateParticipantFields();
    updateSubtotal();
}

/**
 * @function updateParticipantFields
 * @description Gera dinamicamente os campos de input para cada participante com base na quantidade selecionada.
 * @returns {void}
 * @usedBy `updateQuantityDisplay`
 */
function updateParticipantFields() {
    const container = document.getElementById('participants-container');
    if (!container) return;
    container.innerHTML = Array.from({ length: currentQuantity }, (_, i) => `
        <div class="form-group">
            <label for="participant-${i + 1}">PARTICIPANTE ${i + 1}</label>
            <input type="text" id="participant-${i + 1}" placeholder="Nome do participante" required>
        </div>
    `).join('');
}

/**
 * @function updateSubtotal
 * @description Calcula e exibe o subtotal da venda com base na quantidade de ingressos e no preço do ingresso do evento ativo.
 * @returns {void}
 * @usedBy `updateQuantityDisplay`
 */
function updateSubtotal() {
    const subtotalSpan = document.getElementById('subtotal');
    if (state.activeEvent && subtotalSpan) {
        const total = currentQuantity * parseFloat(state.activeEvent.ticket_price);
        subtotalSpan.textContent = total.toFixed(2).replace('.', ',');
    }
}

// ==============================================
// FUNÇÕES DE GESTÃO DE VENDAS (SCREEN: GESTÃO)
// ==============================================

/**
 * @function updateSalesManagementScreen
 * @description Atualiza a tela de gestão de vendas.
 * Busca os dados de tickets para o evento ativo, calcula e exibe métricas
 * e renderiza a lista de vendas filtrável e paginada.
 * @returns {Promise<void>}
 * @usedBy `app.js` (navigateToScreen, updateUI), `handleRegisterSale`, `handleUpdateSale`, `deleteSale`
 */
export async function updateSalesManagementScreen() {
    const content = document.getElementById('sales-management-content');
    const noEventMessage = document.getElementById('no-event-message-sm');

    if (!state.activeEvent) {
        if (content) content.style.display = 'none';
        if (noEventMessage) noEventMessage.style.display = 'block';
        return;
    }
    if (content) content.style.display = 'block';
    if (noEventMessage) noEventMessage.style.display = 'none';

    showListSkeleton('sales-list');
    try {
        const { data: sales, error: salesError } = await supabase
            .from('sales')
            .select('*, tickets(id, ticket_code, participant_name, buyer_name, created_at, status)') // Select all sale fields and nested tickets (include participant_name)
            .eq('event_id', state.activeEvent.id)
            .order('created_at', { ascending: false }); // Order sales from newest to oldest

        if (salesError) throw salesError;

        state.cachedSalesData = sales || []; // Cache the fetched data

        // Calculate metrics
        const totalRevenue = state.cachedSalesData.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0);
        const ticketsSold = state.cachedSalesData.reduce((sum, sale) => sum + sale.number_of_tickets, 0);

        const smRevenue = document.getElementById('sm-revenue');
        const smTicketsSold = document.getElementById('sm-tickets-sold');
        const smPending = document.getElementById('sm-pending');
        const smAvgTicket = document.getElementById('sm-avg-ticket');

        // compute pending sales count (payment_status === 'pending')
        const pendingCount = (state.cachedSalesData || []).filter(s => String(s.payment_status || '').toLowerCase() === 'pending').length;

        if (smRevenue) smRevenue.textContent = `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`;
        if (smTicketsSold) smTicketsSold.textContent = ticketsSold;
        if (smPending) smPending.textContent = pendingCount;
        if (smAvgTicket) smAvgTicket.textContent = `R$ ${(ticketsSold > 0 ? totalRevenue / ticketsSold : 0).toFixed(2).replace('.', ',')}`;

        renderFilteredSales(''); // Renderiza com filtro vazio (mostra todas)
    } catch (error) {
        console.error('Error fetching sales:', error);
        showDetailedError('ERRO AO BUSCAR VENDAS', error, 'Vendas');
        const salesList = document.getElementById('sales-list');
        if (salesList) salesList.innerHTML = '<p class="empty-list-msg">Erro ao carregar vendas.</p>';
    } finally {
        hideLoading();
    }
}

/**
 * @function setupSalesSearch
 * @description Configura o campo de busca na tela de gestão de vendas.
 * @returns {void}
 * @usedBy `setupSaleHandlers`
 */
function setupSalesSearch() {
    const searchInput = document.getElementById('sales-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.toLowerCase();
        await renderFilteredSales(query);
    });
}

/**
 * @function renderFilteredSales
 * @description Renderiza vendas filtradas com base na consulta.
 * Redefine a paginação para a primeira página ao aplicar um novo filtro.
 * @param {string} query - Termo de busca.
 * @returns {Promise<void>}
 * @usedBy `updateSalesManagementScreen`, `setupSalesSearch`
 */
async function renderFilteredSales(query) {
    state.currentPage.sales = 1;
    showListSkeleton('sales-list'); // Show skeleton while filtering/fetching

    try {
        let filteredSales = state.cachedSalesData; // Use cached data

        if (query) {
            filteredSales = state.cachedSalesData.filter(sale =>
                sale.tickets.some(t => {
                    const displayName = (t.participant_name && t.participant_name.trim()) ? t.participant_name : (t.buyer_name || '');
                    return normalizeText(displayName).includes(normalizeText(query));
                }) ||
                sale.sale_code.toLowerCase().includes(query)
            );
        }
        renderPaginatedList('sales', filteredSales, renderSaleItem);
    } catch (error) {
        console.error('Error rendering filtered sales:', error);
        showDetailedError('ERRO AO FILTRAR VENDAS', error, 'Vendas');
        const salesList = document.getElementById('sales-list');
        if (salesList) salesList.innerHTML = '<p class="empty-list-msg">Erro ao carregar vendas filtradas.</p>';
    } finally {
        hideLoading(); // Ensure loading is hidden after filter
    }
}

/**
 * @function renderSaleItem
 * @description Função de renderização para um item individual na lista de vendas.
 * @param {object} sale - O objeto de dados da venda agrupada.
 * @returns {HTMLElement} O elemento <div> representando o item.
 * @usedBy `renderFilteredSales`
 */
function renderSaleItem(sale) {
    // Card root
    const card = document.createElement('div');
    card.className = 'list-item collapsed'; // start collapsed by default

    // --- Header container (clickable area for toggle) ---
    const header = document.createElement('div');
    header.className = 'card-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'flex-start';
    header.style.gap = '12px';
    header.style.padding = '6px 0';

    const leftBlock = document.createElement('div');
    leftBlock.style.display = 'flex';
    leftBlock.style.flexDirection = 'column';
    leftBlock.style.gap = '6px';

    const saleId = document.createElement('div');
    saleId.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', monospace";
    saleId.style.fontSize = '0.78rem';
    saleId.style.color = 'var(--text-secondary)';
    saleId.textContent = sale.sale_code;

    const createdAt = document.createElement('div');
    createdAt.style.fontSize = '0.78rem';
    createdAt.style.color = 'var(--text-secondary)';
    createdAt.textContent = `${new Date(sale.created_at).toLocaleDateString('pt-BR')} • ${new Date(sale.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`;

    leftBlock.appendChild(saleId);
    leftBlock.appendChild(createdAt);

    const rightBlock = document.createElement('div');
    rightBlock.style.display = 'flex';
    rightBlock.style.alignItems = 'center';
    rightBlock.style.gap = '12px';

    const statusBadge = document.createElement('div');
    statusBadge.style.fontSize = '0.78rem';
    statusBadge.style.padding = '4px 8px';
    statusBadge.style.borderRadius = '8px';
    statusBadge.style.fontWeight = '600';
    statusBadge.style.textTransform = 'uppercase';
    statusBadge.style.letterSpacing = '0.4px';
    statusBadge.textContent = (sale.payment_status || 'pending').toUpperCase();

    const status = (sale.payment_status || 'pending').toLowerCase();
    if (status === 'paid' || status === 'confirmed') {
        statusBadge.style.background = 'rgba(16,185,129,0.12)';
        statusBadge.style.color = 'var(--success-color)';
        statusBadge.style.border = '1px solid rgba(16,185,129,0.16)';
    } else if (status === 'expired') {
        statusBadge.style.background = 'rgba(244,67,54,0.06)';
        statusBadge.style.color = 'var(--error-color)';
        statusBadge.style.border = '1px solid rgba(244,67,54,0.12)';
    } else {
        statusBadge.style.background = 'rgba(245,158,11,0.06)';
        statusBadge.style.color = '#b45309';
        statusBadge.style.border = '1px solid rgba(245,158,11,0.08)';
    }

    // collapse arrow
    const collapseArrow = document.createElement('div');
    collapseArrow.className = 'collapse-arrow';
    collapseArrow.innerHTML = '<i class="fas fa-chevron-down"></i>';

    rightBlock.appendChild(statusBadge);
    rightBlock.appendChild(collapseArrow);

    header.appendChild(leftBlock);
    header.appendChild(rightBlock);
    card.appendChild(header);

    // divider
    const divider1 = document.createElement('hr');
    divider1.style.border = 'none';
    divider1.style.height = '1px';
    divider1.style.background = 'var(--divider-color)';
    divider1.style.margin = '6px 0';
    card.appendChild(divider1);

    // --- Finance line (compact) ---
    const financeLine = document.createElement('div');
    financeLine.style.display = 'flex';
    financeLine.style.justifyContent = 'space-between';
    financeLine.style.alignItems = 'center';
    financeLine.style.gap = '12px';

    const buyerInfo = document.createElement('div');
    buyerInfo.style.display = 'flex';
    buyerInfo.style.flexDirection = 'column';
    buyerInfo.style.gap = '4px';
    buyerInfo.innerHTML = `<div style="font-size:0.78rem;color:var(--text-secondary)">Comprador</div>
                           <div style="font-size:0.95rem;color:var(--text-primary)">${sale.buyer_whatsapp || '—'}</div>`;

    const totalInfo = document.createElement('div');
    totalInfo.style.textAlign = 'right';
    totalInfo.innerHTML = `<div style="font-size:0.78rem;color:var(--text-secondary)">Total</div>
                           <div style="font-size:1.15rem;font-weight:700;color:var(--text-primary)">R$ ${parseFloat(sale.total_amount || 0).toFixed(2).replace('.', ',')}</div>`;

    financeLine.appendChild(buyerInfo);
    financeLine.appendChild(totalInfo);
    card.appendChild(financeLine);

    // subtle divider before expandable area
    const divider2 = document.createElement('hr');
    divider2.style.border = 'none';
    divider2.style.height = '1px';
    divider2.style.background = 'var(--divider-color)';
    divider2.style.margin = '8px 0';
    card.appendChild(divider2);

    // --- Expandable content ---
    const expandable = document.createElement('div');
    expandable.className = 'expandable-content';
    expandable.style.display = 'block';

    // Participants list
    const participantsHeader = document.createElement('div');
    participantsHeader.style.display = 'flex';
    participantsHeader.style.justifyContent = 'space-between';
    participantsHeader.style.alignItems = 'center';
    participantsHeader.style.marginBottom = '6px';
    participantsHeader.innerHTML = `<div style="font-size:0.9rem;font-weight:600;color:var(--text-primary)">Participantes (${(sale.tickets && sale.tickets.length) || 0})</div>`;

    const participantsList = document.createElement('div');
    participantsList.className = 'participants-list';
    participantsList.style.display = 'flex';
    participantsList.style.flexDirection = 'column';
    participantsList.style.gap = '8px';
    (sale.tickets || []).forEach(ticket => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '6px 0';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.flexDirection = 'column';
        left.style.gap = '4px';

        const pname = document.createElement('div');
        pname.style.fontSize = '0.95rem';
        pname.style.fontWeight = '600';
        pname.style.color = 'var(--text-primary)';
        const displayName = ticket.participant_name && ticket.participant_name.trim() ? ticket.participant_name : (ticket.buyer_name || '');
        pname.textContent = displayName || '—';

        const pticket = document.createElement('div');
        pticket.style.fontSize = '0.78rem';
        pticket.style.color = 'var(--text-secondary)';
        pticket.style.display = 'flex';
        pticket.style.alignItems = 'center';
        pticket.style.gap = '8px';
        pticket.textContent = ticket.ticket_code || '';

        left.appendChild(pname);
        left.appendChild(pticket);

        const ticketAction = document.createElement('button');
        ticketAction.className = 'btn-icon';
        ticketAction.style.width = '36px';
        ticketAction.style.height = '36px';
        ticketAction.title = 'Ações do ingresso';
        ticketAction.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
        ticketAction.dataset.ticketId = ticket.id;
        ticketAction.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const modal = document.getElementById('confirm-modal');
            const text = document.getElementById('confirm-modal-text');
            const yes = document.getElementById('confirm-modal-yes');
            const no = document.getElementById('confirm-modal-no');
            if (!modal || !text || !yes || !no) return;
            text.textContent = 'Deseja baixar o PDF deste ingresso ou enviar por WhatsApp?';
            modal.style.display = 'block';
            yes.onclick = async () => {
                modal.style.display = 'none';
                try {
                    showLoading();
                    const { data: tk } = await supabase.from('tickets').select('*').eq('id', ticketAction.dataset.ticketId).maybeSingle();
                    if (tk) await downloadTicketPdf(tk);
                } catch (err) {
                    showDetailedError('Erro ao baixar ingresso', err, 'Vendas');
                } finally { hideLoading(); }
            };
            no.onclick = () => {
                modal.style.display = 'none';
                openWhatsappModal(sale.id);
            };
        });

        row.appendChild(left);
        row.appendChild(ticketAction);
        participantsList.appendChild(row);
    });

    expandable.appendChild(participantsHeader);
    expandable.appendChild(participantsList);

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'item-footer';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.alignItems = 'center';
    footer.style.marginTop = '10px';
    footer.style.paddingTop = '10px';
    footer.style.borderTop = '1px solid var(--divider-color)';

    const primaryGroup = document.createElement('div');
    primaryGroup.style.display = 'flex';
    primaryGroup.style.gap = '8px';
    primaryGroup.style.alignItems = 'center';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary confirm-btn';
    confirmBtn.style.minWidth = '140px';
    confirmBtn.style.fontSize = '0.9rem';
    confirmBtn.innerHTML = '<i class="fas fa-check" style="margin-right:8px;"></i> Confirmar pagamento';
    confirmBtn.addEventListener('click', (ev) => { ev.stopPropagation(); confirmSalePayment(sale.id); });



    primaryGroup.appendChild(confirmBtn);

    const adminGroup = document.createElement('div');
    adminGroup.style.display = 'flex';
    adminGroup.style.gap = '8px';
    adminGroup.style.alignItems = 'center';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon';
    editBtn.title = 'Editar';
    editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openEditSaleModal(sale.id); });

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-icon';
    downloadBtn.title = 'Baixar';
    downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    downloadBtn.addEventListener('click', (ev) => { ev.stopPropagation(); generateTicketsForSalePDF(sale.id); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon';
    deleteBtn.title = 'Excluir';
    deleteBtn.style.color = 'var(--error-color)';
    deleteBtn.style.borderColor = 'var(--error-color)';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.addEventListener('click', (ev) => { ev.stopPropagation(); confirmDelete('sale', sale.id, deleteSale); });

    adminGroup.appendChild(editBtn);
    adminGroup.appendChild(downloadBtn);
    adminGroup.appendChild(deleteBtn);

    footer.appendChild(primaryGroup);
    footer.appendChild(adminGroup);

    expandable.appendChild(footer);
    card.appendChild(expandable);

    // Prevent clicks on interactive controls from toggling collapse
    card.querySelectorAll('button, .btn, .btn-icon, a').forEach(btn => {
        btn.addEventListener('click', (ev) => ev.stopPropagation());
    });

    // Header click toggles collapsed/expanded state
    header.addEventListener('click', () => {
        const isExpanded = card.classList.toggle('expanded');
        if (isExpanded) {
            card.classList.remove('collapsed');
            card.classList.add('expanded');
        } else {
            card.classList.remove('expanded');
            card.classList.add('collapsed');
        }
    });

    // Also make sure keyboard accessibility: Enter toggles when header is focused
    header.tabIndex = 0;
    header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            header.click();
        }
    });

    return card;
}

/**
 * @function openEditSaleModal
 * @description Abre o modal de edição de venda e carrega os dados da venda selecionada.
 * @param {string} saleId - O ID da venda a ser editada.
 * @returns {Promise<void>}
 * @usedBy `renderSaleItem` (edit-sale button)
 */
/**
 * @function confirmSalePayment
 * @description Marca a venda como 'paid' e ativa todos os ingressos relacionados (status -> active)
 */
async function confirmSalePayment(saleId) {
    // When a sale is confirmed we: mark sale paid, activate tickets, auto-generate PDFs for each ticket,
    // and refresh the sales management screen so download icons/actions become available.
    showLoading();
    try {
        const { error: upSaleErr } = await supabase
            .from('sales')
            .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
            .eq('id', saleId);
        if (upSaleErr) throw upSaleErr;

        // Activate related tickets
        const { error: upTicketsErr } = await supabase
            .from('tickets')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('sale_id', saleId);
        if (upTicketsErr) throw upTicketsErr;

        // Auto-generate PDFs for this sale's tickets (uploads to storage and creates files)
        // This runs asynchronously but we await to ensure files exist before user tries downloads.
        try {
            await generateTicketsForSalePDF(saleId);
        } catch (pdfErr) {
            console.warn('PDF generation after confirm failed:', pdfErr);
            // don't block the flow; inform user via logs and continue
        }

        showMessage('success', 'Pagamento confirmado, ingressos ativados e PDFs gerados!');
        updateSalesManagementScreen();
    } catch (err) {
        console.error('Error confirming payment:', err);
        showDetailedError('ERRO AO CONFIRMAR PAGAMENTO', err, 'Vendas');
    } finally {
        hideLoading();
    }
}

/**
 * @function expireSalePayment
 * @description Marca a venda como 'expired' and ensures tickets remain inactive/cancelled.
 */
async function expireSalePayment(saleId) {
    showLoading();
    try {
        const { error: upSaleErr } = await supabase
            .from('sales')
            .update({ payment_status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', saleId);
        if (upSaleErr) throw upSaleErr;

        // Optionally mark tickets as cancelled or keep as inactive; we'll set to 'inactive' to avoid accidental check-in
        const { error: upTicketsErr } = await supabase
            .from('tickets')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('sale_id', saleId);
        if (upTicketsErr) throw upTicketsErr;

        showMessage('success', 'Venda marcada como expirada; ingressos permanecem inativos.');
        updateSalesManagementScreen();
    } catch (err) {
        console.error('Error expiring payment:', err);
        showDetailedError('ERRO AO MARCAR EXPIRADO', err, 'Vendas');
    } finally {
        hideLoading();
    }
}

async function openEditSaleModal(saleId) {
    showLoading();
    try {
        const saleTickets = await getTicketsBySale(saleId);
        if (saleTickets.length === 0) throw new Error('Venda não encontrada');

        const editSaleIdInput = document.getElementById('edit-sale-id');
        const editParticipantsContainer = document.getElementById('edit-participants-container');
        const editSaleModal = document.getElementById('edit-sale-modal');

        if (editSaleIdInput) editSaleIdInput.value = saleId;
        if (editParticipantsContainer) {
            editParticipantsContainer.innerHTML = saleTickets.map((ticket, index) => `
                <div class="form-group">
                    <label for="edit-participant-${index + 1}">PARTICIPANTE ${index + 1}</label>
                    <input type="text" id="edit-participant-${index + 1}" value="${ticket.participant_name || ticket.buyer_name || ''}" required>
                </div>
            `).join('');
        }
        if (editSaleModal) editSaleModal.style.display = 'block';
    } catch (err) {
        console.error('Error loading sale:', err);
        showDetailedError('ERRO AO CARREGAR VENDA', err, 'Vendas');
    } finally {
        hideLoading();
    }
}

/**
 * @function handleUpdateSale
 * @description Lida com o envio do formulário de atualização de venda.
 * Coleta os novos nomes dos participantes e atualiza os tickets no Supabase.
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupSaleHandlers` (edit-sale-form submit)
 */
async function handleUpdateSale(e) {
    e.preventDefault();
    const saleId = document.getElementById('edit-sale-id')?.value;
    const inputs = document.querySelectorAll('#edit-participants-container input[type="text"]');
    // NOVO: Aplica capitalização correta aos nomes dos participantes
    const newParticipantNames = Array.from(inputs).map(input => capitalizeWords(input.value.trim())).filter(Boolean);

    if (newParticipantNames.length === 0) {
        showMessage('error', 'ADICIONE PELO MENOS UM PARTICIPANTE');
        return;
    }

    showLoading();
    try {
        const saleTickets = await getTicketsBySale(saleId);
        if (saleTickets.length === 0) throw new Error("Venda não encontrada para atualização.");

        const updates = saleTickets.map((ticket, index) => {
            if (index < newParticipantNames.length) {
                return { id: ticket.id, participant_name: newParticipantNames[index], updated_at: new Date().toISOString() };
            }
            return null; // Should not happen if number of inputs matches existing tickets
        }).filter(Boolean);

        // Perform updates in a batch for efficiency if possible, or individually
        const updatePromises = updates.map(updateData =>
            supabase.from('tickets').update({ participant_name: updateData.participant_name, updated_at: updateData.updated_at }).eq('id', updateData.id)
        );
        const results = await Promise.all(updatePromises);
        results.forEach(result => {
            if (result.error) throw result.error;
        });

        showMessage('success', 'VENDA ATUALIZADA');
        const editSaleModal = document.getElementById('edit-sale-modal');
        if (editSaleModal) editSaleModal.style.display = 'none';
        updateSalesManagementScreen();
    } catch (err) {
        console.error('Error updating sale:', err);
        showDetailedError('ERRO AO ATUALIZAR', err, 'Vendas');
    } finally {
        hideLoading();
    }
}

/**
 * @function deleteSale
 * @description Exclui uma venda do Supabase após confirmação.
 * Devido ao `ON DELETE CASCADE` no schema, os tickets associados também serão excluídos.
 * @param {string} saleId - O ID da venda a ser excluída.
 * @returns {Promise<void>}
 * @usedBy `renderSaleItem`
 */
async function deleteSale(saleId) {
    showLoading();
    try {
        const { error } = await supabase
            .from('sales')
            .delete()
            .eq('id', saleId);
        
        if (error) throw error;

        showMessage('success', 'Venda excluída com sucesso!');
        state.currentPage.sales = 1;
        updateSalesManagementScreen();
    } catch (error) {
        console.error('Error deleting sale:', error);
        showDetailedError('ERRO AO EXCLUIR VENDA', error, 'Vendas');
    } finally {
        hideLoading();
    }
}

// ==============================================
// FUNÇÕES DE GERAÇÃO DE PDF
// ==============================================

/**
 * @function generateParticipantsPDF
 * @description Prepara os dados e exibe o modal de pré-visualização para a lista de participantes (vendas ou cortesias).
 * @param {'sales' | 'courtesies'} type - O tipo de lista a ser gerada ('sales' ou 'courtesies').
 * @returns {Promise<void>}
 * @usedBy `setupSaleHandlers` (generate-sales-pdf button), `courtesias.js` (generate-courtesies-pdf button)
 */
export async function generateParticipantsPDF(type) {
    if (!state.activeEvent) {
        showMessage('error', 'NENHUM EVENTO ATIVO PARA GERAR PDF.');
        showDetailedError('Nenhum evento ativo', new Error('Tentativa de gerar PDF sem evento ativo'), 'Vendas');
        return;
    }
    showLoading();
    try {
        const allTickets = await getTicketsByEvent(state.activeEvent.id);
        const filteredTickets = allTickets.filter(ticket => {
            // Read-compatibility: treat legacy values 'normal' and 'regular' as sales when reading.
            const isSale = ['sell', 'regular', 'normal'].includes(String(ticket.ticket_type));
            return type === 'sales' ? isSale : String(ticket.ticket_type) === 'courtesy';
        });

        // Sort tickets alphabetically by participant_name (fallback to buyer_name for legacy records)
        filteredTickets.sort((a, b) => ( (a.participant_name || a.buyer_name || '').localeCompare((b.participant_name || b.buyer_name || ''), 'pt-BR') ));

        const title = type === 'sales' ? 'LISTA DE VENDAS' : 'LISTA DE CORTESIAS';
        state.currentPdfData = {
            type: type,
            title: title,
            eventName: state.activeEvent.name,
            participants: filteredTickets.map(t => ({ // Map to expected format { name, ticket_code }
                name: (t.participant_name && t.participant_name.trim()) ? t.participant_name : (t.buyer_name || ''),
                ticket_code: t.ticket_code
            }))
        };
        showPdfPreview();
    } catch (error) {
        console.error('Error preparing PDF data:', error);
        showDetailedError('ERRO AO GERAR PDF', error, 'Vendas');
    } finally {
        hideLoading();
    }
}

/**
 * @function showPdfPreview
 * @description Exibe o modal de pré-visualização de PDF com os dados preparados.
 * @returns {void}
 * @usedBy `generateParticipantsPDF`
 */
function showPdfPreview() {
    const modal = document.getElementById('pdf-preview-modal');
    const content = document.getElementById('pdf-preview-content');
    if (!modal || !content || !state.currentPdfData) return;

    // Ajusta o conteúdo para exibir o ID do ticket
    content.innerHTML = `
        <h4>${state.currentPdfData.title}</h4>
        <p><strong>Evento:</strong> ${state.currentPdfData.eventName}</p>
        <p><strong>Total:</strong> ${state.currentPdfData.participants.length}</p>
        <div style="margin-top: 20px;">
            ${state.currentPdfData.participants.map(p => `
                <div class="pdf-preview-item"><div class="pdf-checkbox"></div><span>${p.name} (${p.ticket_code})</span></div>
            `).join('')}
        </div>
    `;
    modal.style.display = 'block';
}

/**
 * @function closePdfPreview
 * @description Fecha o modal de pré-visualização de PDF e limpa os dados do PDF do estado.
 * @returns {void}
 * @usedBy `setupSaleHandlers` (close-pdf-preview, cancel-pdf-preview buttons), `downloadPdfConfirm`
 */
function closePdfPreview() {
    const pdfPreviewModal = document.getElementById('pdf-preview-modal');
    if (pdfPreviewModal) {
        pdfPreviewModal.style.display = 'none';
    }
    state.currentPdfData = null;
}

/**
 * @function downloadPdfConfirm
 * @description Confirma o download do PDF e gera o arquivo usando jsPDF.
 * Esta função é usada APENAS para a lista geral de vendas/cortesias.
 * @returns {void}
 * @usedBy `setupSaleHandlers` (download-pdf-confirm button)
 */
function downloadPdfConfirm() {
    if (!state.currentPdfData) return;
    const { jsPDF } = window.jspdf; // Access jsPDF globally for list generation
    const doc = new jsPDF();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(state.currentPdfData.title, 105, 15, null, null, 'center');
    doc.setFontSize(12);
    doc.text(`EVENTO: ${state.currentPdfData.eventName}`, 105, 22, null, null, 'center');
    doc.setFont('helvetica', 'normal');

    let y = 40;
    state.currentPdfData.participants.forEach(p => { // Itera sobre objetos {name, ticket_code}
        if (y > 280) {
            doc.addPage();
            y = 15;
        }
        doc.rect(10, y - 4, 5, 5);
        doc.text(`${p.name} (${p.ticket_code})`, 20, y); // Inclui o ticket_code
        y += 10;
    });

    const filename = `${state.currentPdfData.type}_list_${state.currentPdfData.eventName.replace(/\s/g, '_')}.pdf`;
    
    doc.save(filename);
    showMessage('success', 'PDF BAIXADO COM SUCESSO!');
    
    closePdfPreview();
}

/**
 * @function drawTicketOnPdfPage
 * @description Draws a single ticket's content onto a given jsPDF document instance.
 * This is the core drawing logic, separated from PDF creation.
 * @param {jsPDF} doc - The jsPDF document instance to draw on.
 * @param {string} participantName - The name of the participant.
 * @param {string} ticketCode - The unique code of the ticket.
 * @param {string} saleCode - The code of the acquisition (sale/courtesy).
 * @param {object} eventDetails - Object containing event name, date, time, location.
 * @param {number} ticketPrice - The price of the ticket.
 * @param {string} logoBase64 - Base64 string of the app logo.
 * @returns {Promise<void>}
 */
export async function drawTicketOnPdfPage(doc, participantName, ticketCode, saleCode, eventDetails, ticketPrice, logoBase64) {
    const pageW = doc.internal.pageSize.getWidth(); // 108mm
    const pageH = doc.internal.pageSize.getHeight(); // 192mm
    const margin = 8; // mm

    // --- Header Section (Dark Purple) ---
    const headerHeight = 40; // mm
    const headerColor = '#800080';
    doc.setFillColor(headerColor);
    doc.rect(0, 0, pageW, headerHeight, 'F');

    // --- Header Content Layout Calculation ---
    // Approximate line heights (actual height from baseline to top of ascenders + descenders)
    const appTitleLineHeight = 5; // mm (for 14pt 'TICKETFLOW')
    const accessTitleLineHeight = 3.5; // mm (for 10pt 'CARTÃO DE ACESSO')
    const eventNameLineHeight = 4.5; // mm (for 12pt Event Name)
    const verticalGap = 2; // mm - consistent spacing between elements

    let contentBlockStartTopY; // The Y coordinate where the content block starts (top edge)
    let totalContentHeight;

    // Calculate logo dimensions if present
    let finalImgWidth = 0;
    let finalImgHeight = 0;

    if (logoBase64) {
        const maxLogoWidth = 40; // mm, as requested
        const img = new Image();
        img.src = logoBase64;
        await new Promise(resolve => { // Ensure image is loaded before drawing
            img.onload = resolve;
            if (img.complete) resolve();
        });
        
        const imgAspectRatio = img.width / img.height;
        
        // Prioritize max width, then adjust height. If height too big, scale down both.
        finalImgWidth = maxLogoWidth;
        finalImgHeight = maxLogoWidth / imgAspectRatio;
        
        // Ensure logo doesn't take up too much vertical space within the 40mm header
        const maxUsableHeaderHeight = headerHeight - (verticalGap * 4); // Allow space for text below
        if (finalImgHeight > maxUsableHeaderHeight) {
             finalImgHeight = maxUsableHeaderHeight;
             finalImgWidth = finalImgHeight * imgAspectRatio;
        }

        totalContentHeight = finalImgHeight + verticalGap + accessTitleLineHeight + verticalGap + eventNameLineHeight;

    } else {
        totalContentHeight = appTitleLineHeight + verticalGap + accessTitleLineHeight + verticalGap + eventNameLineHeight;
    }

    // Calculate the top Y position to vertically center the entire content block within the 40mm header
    contentBlockStartTopY = (headerHeight - totalContentHeight) / 2;
    // Ensure a minimum padding from the header top if content is too large
    if (contentBlockStartTopY < 2) contentBlockStartTopY = 2; 

    // --- Draw Header Content ---
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255); // White text

    let currentDrawY = contentBlockStartTopY; // This is the top of the current element being drawn

    if (logoBase64) {
        const imgX = (pageW - finalImgWidth) / 2;
        doc.addImage(logoBase64, 'PNG', imgX, currentDrawY, finalImgWidth, finalImgHeight);
        currentDrawY += finalImgHeight + verticalGap;
    } else {
        doc.setFontSize(14); // For "TICKETFLOW"
        // Adjust Y to place text baseline correctly for vertical centering
        doc.text('TICKETFLOW', pageW / 2, currentDrawY + (appTitleLineHeight / 2), { align: 'center' });
        currentDrawY += appTitleLineHeight + verticalGap;
    }

    // "CARTÃO DE ACESSO" - Subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('CARTÃO DE ACESSO', pageW / 2, currentDrawY + (accessTitleLineHeight / 2), { align: 'center', charSpace: 0.5 });
    currentDrawY += accessTitleLineHeight + verticalGap;
    
    // Event Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(eventDetails.name.toUpperCase(), pageW / 2, currentDrawY + (eventNameLineHeight / 2), { align: 'center' });


    // --- Event Information Section --- (Font size 8, centralized)
    let currentY = headerHeight + margin; // Start below header with margin
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);

    doc.text(`DATA: ${new Date(eventDetails.event_date).toLocaleDateString('pt-BR')} às ${eventDetails.event_time}`, pageW / 2, currentY, { align: 'center' });
    currentY += 5;
    doc.text(`LOCAL: ${eventDetails.location.toUpperCase()}`, pageW / 2, currentY, { align: 'center' });
    currentY += 5;
    doc.text(`PRODUÇÃO: DC EVENTOS`, pageW / 2, currentY, { align: 'center' });
    currentY += 10; // Extra space before next section

    // --- Participant & Value Section --- (centralized)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12); // Requested font size 12 for participant name
    doc.text('PARTICIPANTE:', pageW / 2, currentY, { align: 'center' });
    currentY += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(participantName.toUpperCase(), pageW / 2, currentY, { align: 'center' });
    currentY += 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10); // Keeping value at 10pt for readability, as it's a key detail
    doc.text('VALOR:', pageW / 2, currentY, { align: 'center' });
    currentY += 5;
    doc.setFont('helvetica', 'normal');
    const ticketValueText = (ticketPrice === 0 || ticketPrice === '0') ? 'CORTESIA' : `R$ ${parseFloat(ticketPrice).toFixed(2).replace('.', ',')}`;
    doc.text(ticketValueText, pageW / 2, currentY, { align: 'center' });

    // --- QR Code & IDs Section ---
    const qrCodeData = ticketCode;
    const qrSize = 40; // mm, as requested
    const idsTextHeight = 5; // Approx height for a single line of 8pt text
    const qrBottomPadding = 8; // Padding below QR code before IDs start (remains for consistency)

    // Calculate the Y position for the QR code to ensure 10mm spacing from the last text
    // `currentY` at this point is the baseline of `ticketValueText`
    const qrY = currentY + 10; // 10mm spacing between value text and QR code

    const qrX = (pageW - qrSize) / 2;

    const qrious = new QRious({
        value: qrCodeData,
        size: qrSize * 3.78 // Convert mm to pixels for QRious, approx 1mm = 3.78px for 72 DPI
    });
    const qrDataURL = qrious.toDataURL();

    doc.addImage(qrDataURL, 'PNG', qrX, qrY, qrSize, qrSize);

    // IDs abaixo do QR Code (Font size 8, centralizado)
    doc.setFontSize(8); // Requested font size 8 para IDs
    let idsCurrentY = qrY + qrSize + qrBottomPadding;

    doc.setFont('helvetica', 'bold');
    doc.text('ID INGRESSO:', pageW / 2, idsCurrentY, { align: 'center' });
    idsCurrentY += idsTextHeight;
    doc.setFont('helvetica', 'normal');
    doc.text(ticketCode, pageW / 2, idsCurrentY, { align: 'center' });
    idsCurrentY += idsTextHeight;

    doc.setFont('helvetica', 'bold');
    doc.text('ID AQUISIÇÃO:', pageW / 2, idsCurrentY, { align: 'center' });
    idsCurrentY += idsTextHeight;
    doc.setFont('helvetica', 'normal');
    doc.text(String(saleCode), pageW / 2, idsCurrentY, { align: 'center' });
}

/**
 * @function generateTicketsForSalePDF
 * @description Generates individual PDF files for each participant of a sale.
 * @param {string} saleId - The ID of the sale.
 * @returns {Promise<void>}
 */
export async function generateTicketsForSalePDF(saleId) {
    showLoading();
    try {
        const saleTickets = await getTicketsBySale(saleId);
        if (saleTickets.length === 0) throw new Error('Venda não encontrada para geração de tickets.');

        const eventDetails = state.activeEvent;
        if (!eventDetails) throw new Error('Nenhum evento ativo para gerar tickets.');

        const logoBase64 = state.appLogoBase64;
        const { jsPDF } = window.jspdf;

        for (const ticket of saleTickets) {
            const ticketDoc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [108, 192] // Approx 16:9 para experiência mobile
            });

            const ticketPrice = parseFloat(eventDetails.ticket_price);
            const participantName = ticket.participant_name && ticket.participant_name.trim() ? ticket.participant_name : ticket.buyer_name;
            await drawTicketOnPdfPage(ticketDoc, participantName, ticket.ticket_code, ticket.sale_id, eventDetails, ticketPrice, logoBase64);

            const cleanTicketCode = ticket.ticket_code.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
            const pdfBlob = ticketDoc.output('blob'); // Get the PDF as a Blob

            // Upload the PDF into structured path: ingressos/{event_slug}/venda_{sale_id}/ingresso_ticket_{ticket_id}.pdf
            const pdfUrl = await uploadIngressoPdf(pdfBlob, ticket.id, ticket.sale_id, eventDetails.name); // Upload the PDF
            console.log(`Uploaded ticket PDF for ${ticket.buyer_name}: ${pdfUrl}`);

            // You can optionally store this URL in your 'tickets' table if you add a 'pdf_url' column
            // await supabase.from('tickets').update({ pdf_url: pdfUrl }).eq('id', ticket.id);
        }

        showMessage('success', 'PDFS DOS INGRESSOS GERADOS E SALVOS NA NUVEM!');
        updateSalesManagementScreen();

    } catch (error) {
        console.error('Error generating tickets PDF:', error);
        showDetailedError('ERRO AO GERAR PDFS DOS INGRESSOS', error, 'Vendas');
    } finally {
        hideLoading();
    }
}

/**
 * @function uploadIngressoPdf
 * @description Envia um Blob de PDF para o Supabase Storage.
 * Sobrescreve o arquivo se ele já existir.
 * @param {Blob} pdfBlob - O Blob do arquivo PDF.
 * @param {string} ticketId - O ID do ticket, usado para nomear o arquivo.
 * @returns {Promise<string>} A URL pública do arquivo PDF enviado.
 */
export async function uploadIngressoPdf(pdfBlob, ticketId, saleId, eventName) {
    // Build a safe folder name for event: lowercase, remove accents, replace spaces with '-', keep only safe chars
    function sanitizeFolderName(str) {
        return String(str || '')
            .normalize('NFD')               // separate accent from letter
            .replace(/[\u0300-\u036f]/g, '')// remove accents
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')          // replace spaces with -
            .replace(/[^a-z0-9\-]/g, '')   // remove invalid chars
            .replace(/\-+/g, '-');         // collapse dashes
    }

    const eventFolder = sanitizeFolderName(eventName || (state.activeEvent && state.activeEvent.name) || 'evento');
    // File path inside bucket: {event_folder}/venda_{sale_id}/ingresso_ticket_{ticket_id}.pdf
    const filePath = `${eventFolder}/venda_${saleId}/ingresso_ticket_${ticketId}.pdf`;

    try {
        const { data, error } = await supabase.storage
            .from('ingressos') // existing bucket
            .upload(filePath, pdfBlob, {
                cacheControl: '3600',
                upsert: true,
                contentType: 'application/pdf'
            });

        if (error) {
            throw error;
        }

        // Get the public URL of the uploaded file
        const { data: publicUrlData, error: publicUrlError } = supabase.storage
            .from('ingressos')
            .getPublicUrl(filePath);

        if (publicUrlError) {
            throw publicUrlError;
        }
        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error('Falha ao obter URL pública após upload.');
        }

        return publicUrlData.publicUrl;
    } catch (error) {
        console.error('Error uploading PDF to Supabase Storage:', error);
        throw new Error(`Erro ao fazer upload do PDF: ${error.message}`);
    }
}

/**
 * @function getTicketsBySale
 * @description Busca todos os tickets de uma venda específica do Supabase.
 * @param {string} saleId - ID da venda.
 * @returns {Promise<Array>} Array de tickets da venda.
 */
export async function getTicketsBySale(saleId) {
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('sale_id', saleId);
    if (error) throw error;
    return tickets;
}

/**
 * @function getTicketsByEvent
 * @description Busca todos os tickets de um evento específico do Supabase.
 * @param {string} eventId - ID do evento.
 * @returns {Promise<Array>} Array de tickets do evento.
 * @usedBy `updateSalesManagementScreen`, `courtesias.js`, `checkin.js`
 */
export async function getTicketsByEvent(eventId) {
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('event_id', eventId);
    if (error) throw error;
    return tickets;
}

/**
 * @function getExistingParticipantNamesForEvent
 * @description Coleta todos os nomes de participantes já registrados para o evento ativo.
 * @param {string} eventId - O ID do evento ativo.
 * @returns {Promise<Array<{normalized: string, original: string}>>} Uma lista de objetos com o nome normalizado e original.
 * @usedBy `handleRegisterSale`, `courtesias.js`
 */
export async function getExistingParticipantNamesForEvent(eventId) {
    try {
        const { data: tickets, error } = await supabase
            .from('tickets')
            .select('participant_name, buyer_name')
            .eq('event_id', eventId);
        
        if (error) throw error;

        const existingNames = tickets.map(ticket => {
            const display = ticket.participant_name && ticket.participant_name.trim() ? ticket.participant_name : ticket.buyer_name;
            return {
                original: display,
                normalized: normalizeText(display || '')
            };
        });

        return existingNames;
    } catch (error) {
        console.error('Erro ao buscar participantes existentes:', error);
        showDetailedError('Erro ao buscar participantes existentes', error, 'Vendas');
        return [];
    }
}

/**
 * @function checkDuplicateParticipants
 * @description Verifica se há duplicidade exata de nomes entre novos e existentes participantes.
 * @param {string[]} newParticipants - Array de nomes de novos participantes (já em maiúsculas).
 * @param {Array<{normalized: string, original: string}>} existingParticipants - Array de participantes existentes no evento.
 * @returns {string[]} Array de mensagens de erro se duplicidades forem encontradas, vazio caso contrário.
 * @usedBy `handleRegisterSale`, `courtesias.js`
 */
export function checkDuplicateParticipants(newParticipants, existingParticipants) {
    const messages = [];
    const existingNormalizedNamesSet = new Set(existingParticipants.map(p => p.normalized));

    newParticipants.forEach(newName => {
        const normalizedNewName = normalizeText(newName);

        // Verificação de Duplicidade Exata
        if (existingNormalizedNamesSet.has(normalizedNewName)) {
            messages.push(`'${newName}' JÁ FOI REGISTRADO NESTE EVENTO.`);
        }
    });
    return messages;
}

/**
 * @function openWhatsappModal
 * @description Abre o modal para inserir o número do WhatsApp.
 * @param {string} saleId - O ID da venda para a qual os tickets serão enviados.
 * @returns {void}
 * @usedBy `renderSaleItem`
 */
function openWhatsappModal(saleId) {
    if (!whatsappModal || !whatsappSaleIdInput || !whatsappNumberInput) return;

    whatsappSaleIdInput.value = saleId;
    whatsappNumberInput.value = ''; // Limpa o campo
    clearFormErrors(whatsappForm); // Limpa erros anteriores
    whatsappModal.style.display = 'block';
}

/**
 * @function closeWhatsappModal
 * @description Fecha o modal do WhatsApp.
 * @returns {void}
 * @usedBy `setupSaleHandlers`
 */
function closeWhatsappModal() {
    if (whatsappModal) {
        whatsappModal.style.display = 'none';
        whatsappNumberInput.value = '';
        clearFormErrors(whatsappForm);
    }
}

/**
 * @function formatWhatsappNumber
 * @description Formata o número do WhatsApp no input.
 * @param {Event} e - O evento de input.
 * @returns {void}
 * @usedBy `setupSaleHandlers`
 */
function formatWhatsappNumber(e) {
    let value = e.target.value.replace(/\D/g, ''); // Remove tudo que não é dígito

    if (value.length > 0) {
        value = value.replace(/^(\d{2})(\d)/g, '($1) $2'); // Adiciona parênteses e espaço após DDD
        if (value.length > 9) { // Se for maior que 9, pode ter o 9 extra (mobile)
            value = value.replace(/(\d{4,5})(\d{4})$/, '$1-$2'); // Adiciona o hífen
        }
    }
    e.target.value = value;
}

/**
 * @function handleSendTicketsToWhatsapp
 * @description Lida com o envio dos tickets via WhatsApp.
 * Valida o número, gera o PDF e marca os tickets como enviados.
 * (Nota: O envio real para WhatsApp via API não é implementado, apenas a geração e download do PDF).
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupSaleHandlers`
 */
async function handleSendTicketsToWhatsapp(e) {
    e.preventDefault();
    const saleId = whatsappSaleIdInput.value;
    const whatsappNumber = whatsappNumberInput.value.trim();
    
    // Validate the WhatsApp number format
    const numberPattern = /^\(?\d{2}\)?\s?\d{4,5}-\d{4}$/; // (DD) XXXXX-XXXX or (DD) XXXX-XXXX
    if (!whatsappNumber || !numberPattern.test(whatsappNumber)) {
        showFieldError(whatsappNumberInput, 'FORMATO INVÁLIDO. USE (DDD) XXXXX-XXXX');
        return;
    }
    clearFormErrors(whatsappForm);

    showLoading();
    try {
        await generateTicketsForSalePDF(saleId); // Call PDF generation function
        // In a real app, here you would integrate with a WhatsApp API to send the generated PDF.
        // For this demo, we just simulate success after PDF generation.
        showMessage('success', `INGRESSOS GERADOS PARA ${whatsappNumber}! (Em uma integração real, seriam enviados via WhatsApp)`);
        closeWhatsappModal();
    } catch (error) {
        console.error('Error sending tickets to WhatsApp:', error);
        showDetailedError('ERRO AO ENVIAR INGRESSOS VIA WHATSAPP', error, 'Vendas');
    } finally {
        hideLoading();
    }
}

/**
 * @function markTicketsAsSent
 * @description Marks all tickets within a specific sale as sent in localStorage.
 * @param {number} saleId - The ID of the sale to update.
 * @returns {void}
 * @usedBy `downloadPdfConfirm`
 */
export async function markTicketsAsSent(saleId) {
    // This function was previously tied to localStorage.
    // Given the supabase integration and how PDF generation is now handled (direct download),
    // marking as "sent" in the database would require a new column in `tickets` or `sales`
    // (e.g., `is_sent_via_whatsapp: BOOLEAN`).
    // For now, this function can be commented out or adapted if a new DB field is added.
    // As per previous instructions, `getData` and `updateLocalStorageItem` are no longer in `utils.js`.
    console.warn("Function 'markTicketsAsSent' called but currently not implemented for Supabase persistence.");
}

/**
 * @function capitalizeWords
 * @description Capitaliza as palavras de um nome.
 * @param {string} name - O nome a ser capitalizado.
 * @returns {string} O nome capitalizado.
 */
function capitalizeWords(name) {
    return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

async function downloadTicketPdf(ticket) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [108, 192] });
        const eventDetails = state.activeEvent;
        const price = parseFloat(eventDetails.ticket_price);
        const participantNameForPdf = ticket.participant_name && ticket.participant_name.trim() ? ticket.participant_name : ticket.buyer_name;
        await drawTicketOnPdfPage(doc, participantNameForPdf, ticket.ticket_code, ticket.sale_id, eventDetails, price, state.appLogoBase64);
        const clean = ticket.ticket_code.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
        doc.save(`${clean}.pdf`);
    } catch (error) {
        showDetailedError('ERRO AO BAIXAR INGRESSO', error, 'Vendas');
    }
}