// checkin.js
// Este módulo é responsável pela funcionalidade de check-in de participantes em eventos.
// Inclui busca de participantes, exibição do status de check-in e registro de novos check-ins.

// ==============================================
// IMPORTS DE MÓDULOS
// ==============================================

import { state, supabase } from './app.js'; // Importa a instância do Supabase do arquivo principal.
import { showLoading, hideLoading, showMessage, showDetailedError } from './utils.js'; // Importa funções utilitárias para feedback visual e novas funções de localStorage.
import { getTicketsByEvent } from './vendas.js'; // Importa getTicketsByEvent do vendas.js

// ==============================================
// VARIÁVEIS DO MÓDULO PARA QR CODE SCANNER
// ==============================================

let html5Qr = null;
let scannerActive = false;
let lastScanTime = 0;
const SCAN_COOLDOWN = 1500; // 1.5 segundos entre scans para evitar múltiplas leituras

// ==============================================
// CONFIGURAÇÃO DE EVENT LISTENERS DA TELA DE CHECK-IN
// ==============================================

/**
 * @function setupCheckinHandlers
 * @description Configura os event listeners para os elementos da tela de check-in.
 * @returns {void}
 * @usedBy `app.js` (initializeApp)
 */
export function setupCheckinHandlers() {
    // Adiciona um event listener ao campo de busca.
    // A cada input, atualiza o filtro de busca e re-renderiza a lista.
    const checkinSearchInput = document.getElementById('checkin-search');
    if (checkinSearchInput) {
        checkinSearchInput.addEventListener('input', (e) => {
            state.searchFilters.checkin = e.target.value.toUpperCase(); // Converte para maiúsculas para busca case-insensitive.
            localStorage.setItem('ticketflow-search-filters', JSON.stringify(state.searchFilters)); // Persiste o filtro.
            renderCheckInList(); // Re-renderiza a lista com o novo filtro.
        });
    }

    // NOVO: Event listener para filtros de letra
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('letter-filter-btn')) {
            // Remove active class from all letter buttons
            document.querySelectorAll('.letter-filter-btn').forEach(btn => btn.classList.remove('active'));
            
            const selectedLetter = e.target.dataset.letter;
            if (selectedLetter === 'ALL') {
                state.searchFilters.checkinLetter = '';
                e.target.classList.add('active');
            } else {
                state.searchFilters.checkinLetter = selectedLetter;
                e.target.classList.add('active');
            }
            
            localStorage.setItem('ticketflow-search-filters', JSON.stringify(state.searchFilters));
            renderCheckInList();
        }
    });

    // NOVO: Event listener para o botão de scan QR code
    const qrScanBtn = document.getElementById('qr-scan-btn');
    if (qrScanBtn) {
        qrScanBtn.addEventListener('click', startQRScanner);
    }

    // NOVO: Event listener para fechar o scanner
    const closeScannerBtn = document.getElementById('close-qr-scanner');
    if (closeScannerBtn) {
        closeScannerBtn.addEventListener('click', stopQRScanner);
    }

    // MELHORADO: Event listener para tecla ESC fechar o scanner
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scannerActive) {
            e.preventDefault();
            stopQRScanner();
        }
        // Adiciona tecla Enter para reativar scanner quando modal está aberto
        if (e.key === 'Enter' && scannerActive && !html5Qr) {
            e.preventDefault();
            startQRScanner();
        }
    });

    // NOVO: Detecta quando a janela perde foco para pausar o scanner
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && scannerActive) {
            if (html5Qr) {
                html5Qr.pause(true);
            }
        } else if (!document.hidden && scannerActive && html5Qr) {
            html5Qr.resume();
        }
    });
}

// ==============================================
// FUNÇÕES DE ATUALIZAÇÃO E RENDERIZAÇÃO DA TELA DE CHECK-IN
// ==============================================

/**
 * @function updateCheckInScreen
 * @description Atualiza a tela de check-in.
 * Busca dados de tickets para o evento ativo e calcula métricas de check-in.
 * @returns {Promise<void>}
 * @usedBy `app.js` (navigateToScreen, updateUI)
 */
export async function updateCheckInScreen() {
    const content = document.getElementById('check-in-content');
    const noEventMessage = document.getElementById('no-event-message-checkin');

    if (!state.activeEvent) {
        if (content) content.style.display = 'none';
        if (noEventMessage) noEventMessage.style.display = 'block';
        return;
    }
    if (content) content.style.display = 'block';
    if (noEventMessage) noEventMessage.style.display = 'none';

    // Carrega filtros de busca salvos no localStorage, se existirem.
    const savedFilters = localStorage.getItem('ticketflow-search-filters');
    if (savedFilters) {
        try {
            state.searchFilters = { ...state.searchFilters, ...JSON.parse(savedFilters)};
        } catch (error) {
            console.error('Erro ao carregar filtros salvos:', error);
            showDetailedError('Erro ao carregar filtros salvos', error, 'Check-in');
        }
        const checkinSearchInput = document.getElementById('checkin-search');
        if (checkinSearchInput) {
            checkinSearchInput.value = state.searchFilters.checkin || '';
        }
    }

    showLoading();
    try {
        // Fetch tickets from Supabase for the active event
        const eventTickets = await getTicketsByEvent(state.activeEvent.id);
        state.allParticipants = [];

        // Converte tickets para o formato esperado pelos participantes
        eventTickets.forEach(ticket => {
            const participantNameDisplay = ticket.participant_name && ticket.participant_name.trim() ? ticket.participant_name : ticket.buyer_name;
            state.allParticipants.push({
                name: participantNameDisplay,
                participant_name: ticket.participant_name || '',
                buyer_name: ticket.buyer_name || '',
                // Read-compatibility: treat legacy values 'normal' and 'regular' as sales when reading.
                type: ['sell','regular','normal'].includes(String(ticket.ticket_type)) ? 'Venda' : 'Cortesia',
                id: ticket.id, 
                acquisition_id: ticket.sale_id,
                ticketCode: ticket.ticket_code,
                checked_in: !!ticket.checked_in_at // alterado para usar checked_in_at
            });
        });

        // NOVO: Ordena os participantes por nome em ordem alfabética
        state.allParticipants.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        // Atualiza as métricas do dashboard de check-in
        const totalParticipants = state.allParticipants.length;
        const checkedInCount = state.allParticipants.filter(p => p.checked_in).length;
        const ciTotal = document.getElementById('ci-total');
        const ciCheckedIn = document.getElementById('ci-checked-in');
        const ciPending = document.getElementById('ci-pending');

        if (ciTotal) ciTotal.textContent = totalParticipants;
        if (ciCheckedIn) ciCheckedIn.textContent = checkedInCount;
        if (ciPending) ciPending.textContent = totalParticipants - checkedInCount;

        renderCheckInList();
    } catch (error) {
        console.error('Error fetching check-in data:', error);
        showMessage('error', 'ERRO AO BUSCAR DADOS DE CHECK-IN');
        showDetailedError('Erro ao buscar dados de check-in', error, 'Check-in');
        state.allParticipants = [];
        const list = document.getElementById('check-in-list');
        if (list) list.innerHTML = '<p class="empty-list-msg">Erro ao carregar dados de check-in.</p>';
    } finally {
        hideLoading();
    }
}

/**
 * @function renderCheckInList
 * @description Renderiza a lista de participantes na tela de check-in, aplicando o filtro de busca e filtro de letra.
 * @returns {void}
 * @usedBy `updateCheckInScreen`, `setupCheckinHandlers` (input event)
 */
function renderCheckInList() {
    const query = state.searchFilters.checkin || '';
    const letterFilter = state.searchFilters.checkinLetter || '';
    const list = document.getElementById('check-in-list');
    if (!list) return;

    let filtered = state.allParticipants.filter(p => 
        p.name.includes(query) || 
        (p.ticketCode && p.ticketCode.toUpperCase().includes(query))
    );

    // NOVO: Aplica filtro por letra se selecionado
    if (letterFilter) {
        filtered = filtered.filter(p => 
            p.name.charAt(0).toUpperCase() === letterFilter
        );
    }

    list.innerHTML = filtered.length === 0 ? '<p class="empty-list-msg">Nenhum participante encontrado.</p>' : '';

    filtered.forEach(p => {
        const item = document.createElement('div');
        item.className = `list-item ${p.checked_in ? 'checked-in' : ''}`;
        item.innerHTML = `
            <div class="item-info">
                <h4>${p.name}</h4>
                <p>${p.type} | Ticket: ${p.ticketCode}</p>
            </div>
            <div class="item-actions">
                ${p.checked_in
                    ? `<span class="check-in-status"><i class="fas fa-check-circle"></i> CHECK-IN FEITO</span>
                       <button class="btn btn-secondary btn-small undo-check-in" data-participant='${JSON.stringify(p)}'><i class="fas fa-undo"></i> DESFAZER</button>`
                    : `<button class="btn btn-primary btn-small perform-check-in" data-participant='${JSON.stringify(p)}'><i class="fas fa-check"></i> CHECK-IN</button>`
                }
            </div>
        `;
        list.appendChild(item);
    });

    document.querySelectorAll('.perform-check-in').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const participantData = JSON.parse(e.currentTarget.dataset.participant);
            performCheckIn(participantData);
        });
    });

    document.querySelectorAll('.undo-check-in').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const participantData = JSON.parse(e.currentTarget.dataset.participant);
            undoCheckIn(participantData);
        });
    });
}

/**
 * @function performCheckIn
 * @description Realiza o check-in de um participante.
 * Atualiza o status do ticket no Supabase.
 * @param {object} participant - The participant object to be checked in.
 * @returns {Promise<void>}
 * @usedBy `renderCheckInList` (dynamically created buttons), `processQRScan`
 */
async function performCheckIn(participant) {
    if (!state.activeEvent) {
        showMessage('error', 'NENHUM EVENTO ATIVO ENCONTRADO');
        showDetailedError('Nenhum evento ativo', new Error('Tentativa de check-in sem evento ativo'), 'Check-in');
        return;
    }
    
    showLoading();
    try {
        // Verifica se o check-in já foi feito
        if (participant.checked_in) {
            showMessage('error', `${participant.name} JÁ FEZ CHECK-IN ANTERIORMENTE!`);
            hideLoading();
            return;
        }

        // Atualiza o status do ticket para 'used' e registra checked_in_at
        const { error } = await supabase
            .from('tickets')
            .update({ status: 'used', checked_in_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', participant.id); 
        
        if (error) throw error;

        showMessage('success', `${participant.name} (${participant.ticketCode}) FEZ CHECK-IN!`);
        await updateCheckInScreen(); // Atualiza a tela para refletir o novo status de check-in.
    } catch (error) {
        console.error('Error during check-in:', error);
        showDetailedError('ERRO NO CHECK-IN', error, 'Check-in');
    } finally {
        hideLoading();
    }
}

/**
 * @function undoCheckIn
 * @description Desfaz o check-in de um participante.
 * Atualiza o status do ticket no Supabase.
 * @param {object} participant - The participant object to be checked in.
 * @returns {Promise<void>}
 */
async function undoCheckIn(participant) {
    if (!state.activeEvent) {
        showMessage('error', 'NENHUM EVENTO ATIVO ENCONTRADO');
        return;
    }
    showLoading();
    try {
        const { error } = await supabase
            .from('tickets')
            .update({ status: 'valid', checked_in_at: null, updated_at: new Date().toISOString() })
            .eq('id', participant.id);
        if (error) throw error;
        showMessage('success', `CHECK-IN DESFEITO PARA ${participant.name}.`);
        await updateCheckInScreen();
    } catch (err) {
        showDetailedError('ERRO AO DESFAZER CHECK-IN', err, 'Check-in');
    } finally {
        hideLoading();
    }
}

// ==============================================
// FUNÇÕES DE QR CODE SCANNER
// ==============================================

/**
 * @function startQRScanner
 * @description Inicia o scanner de QR code usando a câmera do dispositivo com melhorias de performance e UX.
 * @returns {Promise<void>}
 * @usedBy `setupCheckinHandlers` (qr-scan-btn click)
 */
async function startQRScanner() {
    try {
        if (scannerActive) return;
        const scannerModal = document.getElementById('qr-scanner-modal');
        const readerEl = document.getElementById('qr-reader');
        if (!scannerModal || !readerEl) return;
        scannerModal.style.display = 'block';
        // reset inline alert
        const inline = document.getElementById('qr-inline-alert');
        if (inline) { inline.className = 'qr-inline-alert'; inline.textContent = ''; }

        scannerActive = true;

        const onScanSuccess = async (decodedText) => {
            const now = Date.now();
            if (now - lastScanTime < SCAN_COOLDOWN) return;
            lastScanTime = now;
            if (!decodedText || typeof decodedText !== 'string') {
                showCheckinAlert('error', '❌ Ingresso inválido.');
                return;
            }
            await handleQrValidation(decodedText.trim()); // keep scanner running
        };

        // Instanciação do html5-qrcode
        html5Qr = new window.Html5Qrcode('qr-reader', { verbose: false });
        await html5Qr.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            () => {}
        );
    } catch (error) {
        showCheckinAlert('warning', '⚠️ Não foi possível validar. Verifique a conexão.');
    }
}

/**
 * @function stopQRScanner
 * @description Para o scanner de QR code e libera os recursos da câmera com limpeza completa.
 * @returns {void}
 * @usedBy `setupCheckinHandlers` (close-qr-scanner click, ESC key), `processQRScan`
 */
function stopQRScanner() {
    try {
        const scannerModal = document.getElementById('qr-scanner-modal');
        if (html5Qr) {
            html5Qr.stop().catch(() => {}).finally(() => html5Qr.clear());
            html5Qr = null;
        }
        if (scannerModal) scannerModal.style.display = 'none';
        scannerActive = false;
        lastScanTime = 0;
    } catch (error) {
        console.error('Erro ao parar scanner:', error);
        showDetailedError('Erro ao parar scanner QR', error, 'Check-in');
        // Garante que as variáveis sejam resetadas mesmo em caso de erro
        scannerActive = false;
        lastScanTime = 0;
    }
}

/**
 * @function processQRScan
 * @description Processa o resultado do scan do QR code com validações melhoradas e feedback aprimorado.
 * @param {string} qrData - Os dados lidos do QR code (espera-se que seja o Ticket ID).
 * @returns {Promise<void>}
 * @usedBy QR scanner callback
 */
async function processQRScan(qrData) {
    // Substituído por handleQrValidation via html5-qrcode
    return;
}

/**
 * @function handleQrValidation
 * @description Valida o QR code e verifica se o ingresso está válido para check-in.
 * @param {string} scannedValue - Valor lido do QR code.
 * @returns {Promise<void>}
 */
async function handleQrValidation(scannedValue) {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('id,buyer_name,status,checked_in_at')
            .eq('ticket_code', scannedValue)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            showCheckinAlert('error', 'QR CODE INVÁLIDO ou NÃO CORRESPONDENTE À ESTE EVENTO');
            return;
        }

        // tickets are valid for check-in only when status === 'active'
        if (data.status !== 'active') {
            showCheckinAlert('warning', '⚠️ Ingresso não ativo para check-in (pagamento não confirmado ou cancelado).');
            return;
        }

        if (data.checked_in_at) {
            const usedAt = new Date(data.checked_in_at).toLocaleString('pt-BR');
            showCheckinAlert('warning', `⚠️ Ingresso já utilizado em ${usedAt}.`);
            return;
        }

        const { error: upErr } = await supabase
            .from('tickets')
            .update({ checked_in_at: new Date().toISOString() })
            .eq('id', data.id);

        if (upErr) throw upErr;

        showCheckinAlert('success', `✅ Check-in realizado com sucesso para ${data.buyer_name}.`);
        await updateCheckInScreen();
    } catch (e) {
        showCheckinAlert('warning', '⚠️ Não foi possível validar. Verifique a conexão.');
    }
}

/**
 * @function showCheckinAlert
 * @description Exibe um alerta na tela de check-in com o resultado da operação.
 * @param {string} type - Tipo do alerta (success, warning, error).
 * @param {string} text - Mensagem a ser exibida.
 */
function showCheckinAlert(type, text) {
    const inlineBox = document.getElementById('qr-inline-alert');
    if (!inlineBox) return;
    inlineBox.className = 'qr-inline-alert';
    inlineBox.classList.add(type); // success | warning | error
    const icon =
        type === 'success' ? '<i class="fas fa-check-circle"></i>' :
        type === 'warning' ? '<i class="fas fa-exclamation-triangle"></i>' :
        '<i class="fas fa-times-circle"></i>';
    inlineBox.innerHTML = `${icon}<span>${text || ''}</span>`;
    inlineBox.classList.add('show');
    setTimeout(() => inlineBox.classList.remove('show'), 2500);
}