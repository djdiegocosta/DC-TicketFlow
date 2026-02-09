// eventos.js
// Este módulo gerencia as funcionalidades relacionadas aos eventos, incluindo:
// - Criação e finalização de eventos.
// - Edição do preço do ingresso do evento ativo.
// - Visualização e gerenciamento do histórico de eventos.
// - Edição de eventos passados e registro de relatórios financeiros.
// - Recuperação e exclusão de eventos.

// ==============================================
// IMPORTS DE MÓDULOS
// ==============================================

import { state, navigateToScreen, updateUI, supabase } from './app.js';
import { showLoading, hideLoading, showMessage, showDetailedError, showListSkeleton, renderPaginatedList, confirmDelete, showFieldError, clearFormErrors } from './utils.js';
// Chart integration (Chart.js is provided via importmap in index.html)
/// Use named export from Chart.js (esm build has no default export)
import { Chart } from 'chart.js';

/**
 * Utility functions to format and parse Brazilian currency (BRL) for inputs.
 * - formatBRLInput(el, blurFlag=false): formats element.value as "1.234,56" while typing.
 * - parseBRL(str): returns a string with dot-decimal notation "1234.56" suitable for parseFloat().
 */
function parseBRL(str) {
    if (!str && str !== 0) return '';
    if (typeof str !== 'string') str = String(str);
    // Remove everything except digits and separators
    const cleaned = str.replace(/[^\d,-]/g, '').replace(/\s/g, '');
    if (cleaned === '') return '';
    // Replace thousand dots and spaces, normalize comma decimal to dot
    const onlyDigits = cleaned.replace(/\./g, '').replace(/,/g, '.');
    // Ensure at most two decimals
    const parts = onlyDigits.split('.');
    if (parts.length === 1) return parts[0];
    const decimals = parts.slice(1).join('').slice(0,2).padEnd(2,'0');
    return `${parts[0]}.${decimals}`;
}

/**
 * @function parseUserDecimal
 * @description Parse user-typed decimal accepting dot or comma and returning a Number (0 on invalid/empty).
 * This is used to convert free-form input values only at save time.
 */
function parseUserDecimal(str) {
    if (str === null || str === undefined) return 0;
    const s = String(str).trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}

function formatBRLInput(el, blur = false) {
    if (!el) return;
    let v = el.value || '';
    // Remove non digits
    const digits = v.replace(/\D/g, '');
    if (digits === '') {
        el.value = '';
        return;
    }
    // Ensure at least 3 digits to handle cents properly
    const intVal = digits.slice(0, -2) || '0';
    const cents = digits.slice(-2);
    // Insert thousand separators
    const withThousands = intVal.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const formatted = `${withThousands},${cents}`;
    el.value = formatted;
    // If blur and value ends with ',00' keep it, otherwise ensure two decimals already included above
    return formatted;
}

let currentFinancialEvent = null; // Armazena o evento para o qual o modal financeiro está aberto.
let currentFinancialTab = 'financial-event-data'; // Abaa ativa no modal de relatório financeiro.

// ==============================================
// REFERÊNCIAS AO DOM PARA MODAIS DE EVENTOS
// ==============================================

const pastEventFormModal = document.getElementById('past-event-form-modal');
const pastEventModalTitle = document.getElementById('past-event-modal-title');
const pastEventForm = document.getElementById('past-event-form');
const pastEventIdInput = document.getElementById('past-event-id');
const pastEventNameInput = document.getElementById('past-event-name');
const pastEventDateInput = document.getElementById('past-event-date');
const pastEventTimeInput = document.getElementById('past-event-time');
const pastEventLocationInput = document.getElementById('past-event-location');
const pastEventPriceInput = document.getElementById('past-event-price');
const pastEventFlyerInput = document.getElementById('past-event-flyer');

// ==============================================
// CONFIGURAÇÃO DE EVENT LISTENERS GLOBAIS DO MÓDULO EVENTOS
// ==============================================

/**
 * @function setupEventHandlers
 * @description Configura os event listeners para os formulários e botões relacionados a eventos.
 * @param {Function} navigateTo - Função do `app.js` para navegar entre as telas.
 * @param {Function} update - Função do `app.js` para atualizar a UI global.
 * @returns {void}
 * @usedBy `app.js` (initializeApp)
 */
export function setupEventHandlers(navigateTo, update) {
    // === SCREEN: CRIAR EVENTO ===
    const createEventForm = document.getElementById('create-event-form');
    if (createEventForm) {
        createEventForm.addEventListener('submit', (e) => handleCreateEvent(e, navigateTo, update));
    }

    const finalizeEventBtn = document.getElementById('finalize-event');
    if (finalizeEventBtn) {
        finalizeEventBtn.addEventListener('click', (e) => handleFinalizeEvent(e, navigateTo, update));
    }

    const editTicketPriceBtn = document.getElementById('edit-ticket-price-btn');
    if (editTicketPriceBtn) {
        editTicketPriceBtn.addEventListener('click', openTicketPriceModal);
    }
    const closePriceModalBtn = document.getElementById('close-price-modal');
    if (closePriceModalBtn) {
        closePriceModalBtn.addEventListener('click', closeTicketPriceModal);
    }
    const updatePriceForm = document.getElementById('update-price-form');
    if (updatePriceForm) {
        updatePriceForm.addEventListener('submit', handleTicketPriceUpdate);
    }

    // Handler for "create and publish" action (button in index.html)
    const createPublishBtn = document.getElementById('create-publish-event-btn');
    if (createPublishBtn) {
        createPublishBtn.addEventListener('click', (e) => {
            // Intent: publish the event immediately
            handleCreateEventPublic(e, navigateTo, update);
        });
    }

    // === FLYER: Seleção/Upload de imagens para o evento ===
    const selectExistingFlyerBtn = document.getElementById('select-existing-flyer-btn');
    const uploadFlyerInput = document.getElementById('upload-flyer-input');
    const selectFlyerModal = document.getElementById('select-flyer-modal');
    const closeSelectFlyerModalBtn = document.getElementById('close-select-flyer-modal');
    const existingFlyersGrid = document.getElementById('existing-flyers-grid');
    const cancelSelectFlyerBtn = document.getElementById('cancel-select-flyer');
    const confirmSelectFlyerBtn = document.getElementById('confirm-select-flyer');
    const flyerPreview = document.getElementById('flyer-preview');
    const flyerPreviewImg = document.getElementById('flyer-preview-img');
    const hiddenFlyerInput = document.getElementById('event-flyer-url');

    // The "Selecionar imagem existente" button should open the modal that lists files from the bucket.
    if (selectExistingFlyerBtn) {
        selectExistingFlyerBtn.addEventListener('click', () => {
            // Open modal which will list existing images from Supabase Storage.
            openSelectFlyerModal().catch(err => {
                console.error('Erro ao abrir modal de seleção de flyers:', err);
                showDetailedError('ERRO AO ABRIR SELETOR DE IMAGENS', err, 'Eventos');
            });
        });
    }

    // Upload MUST happen exclusively inside the input.change event.
    if (uploadFlyerInput) uploadFlyerInput.addEventListener('change', async (event) => {
        try {
            const file = event.target.files && event.target.files[0];
            console.log(file); // required debug log

            if (!file) return;

            // Accept only explicit mime types
            const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedMimes.includes(file.type)) {
                showMessage('error', 'TIPO DE ARQUIVO NÃO SUPORTADO. USE JPG, PNG OU WEBP.');
                uploadFlyerInput.value = '';
                return;
            }

            // Ensure uploads always go into the 'flyers/' folder inside the 'events' bucket
            const timestamp = Date.now();
            const mimeToExt = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp'
            };
            const ext = mimeToExt[file.type] || 'png';
            // File path must include explicit prefix 'flyers/'
            const filePath = `flyers/flyer_${timestamp}.${ext}`;

            showLoading();

            // Upload strictly to events/flyers/...
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('events')
                .upload(filePath, file, {
                    contentType: file.type,
                    upsert: false
                });

            if (uploadError) {
                console.error(uploadError.message || uploadError);
                showDetailedError('ERRO NO UPLOAD DO FLYER', uploadError, 'Eventos');
                uploadFlyerInput.value = '';
                return;
            }

            if (!uploadData) {
                console.error('Upload concluído sem dados retornados.');
                uploadFlyerInput.value = '';
                return;
            }

            // Obtain public URL for events/flyers/<file>
            const { data: publicData, error: publicErr } = await supabase
                .storage
                .from('events')
                .getPublicUrl(filePath);

            if (publicErr) {
                console.error(publicErr.message || publicErr);
                showDetailedError('ERRO AO OBTER URL PÚBLICA DO FLYER', publicErr, 'Eventos');
                uploadFlyerInput.value = '';
                return;
            }

            const publicUrl = publicData?.publicUrl || '';
            if (!publicUrl) {
                console.error('Falha ao obter publicUrl após upload.');
                uploadFlyerInput.value = '';
                return;
            }

            // Preview and persist the URL in state/hidden input
            state.pendingFlyerUrl = publicUrl;
            if (hiddenFlyerInput) hiddenFlyerInput.value = publicUrl;
            previewFlyer(publicUrl);

            // If there's an active event, save flyer_image_url to the event record automatically
            if (state.activeEvent && state.activeEvent.id) {
                try {
                    const { data: updatedEvent, error: updateErr } = await supabase
                        .from('events')
                        .update({ flyer_image_url: publicUrl, updated_at: new Date().toISOString() })
                        .eq('id', state.activeEvent.id)
                        .select();

                    if (updateErr) {
                        console.error(updateErr.message || updateErr);
                        showDetailedError('ERRO AO SALVAR FLYER NO EVENTO', updateErr, 'Eventos');
                    } else if (updatedEvent && updatedEvent[0]) {
                        state.activeEvent = updatedEvent[0];
                        showMessage('success', 'FLYER UPLOAD E SALVO NO EVENTO COM SUCESSO!');
                    }
                } catch (errUpdate) {
                    console.error(errUpdate && errUpdate.message ? errUpdate.message : errUpdate);
                }
            } else {
                // No active event yet — keep URL in pending state only.
                showMessage('success', 'FLYER UPLOAD REALIZADO (PENDENTE DE ASSOCIAÇÃO AO EVENTO).');
            }

        } catch (err) {
            console.error(err && err.message ? err.message : err);
            showDetailedError('ERRO NO PROCESSO DE UPLOAD', err, 'Eventos');
        } finally {
            hideLoading();
            // clear input so same file can be chosen again if needed (but only after processing)
            uploadFlyerInput.value = '';
        }
    });

    if (closeSelectFlyerModalBtn) closeSelectFlyerModalBtn.addEventListener('click', () => { if (selectFlyerModal) selectFlyerModal.style.display = 'none'; });
    if (cancelSelectFlyerBtn) cancelSelectFlyerBtn.addEventListener('click', () => { if (selectFlyerModal) selectFlyerModal.style.display = 'none'; });
    if (confirmSelectFlyerBtn) confirmSelectFlyerBtn.addEventListener('click', () => confirmSelectFlyer());

    // internal variable to hold selected filename from grid
    let _selectedExistingFlyer = null;

    async function openSelectFlyerModal() {
        if (!selectFlyerModal || !existingFlyersGrid) return;
        existingFlyersGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:12px;color:var(--text-secondary);">Carregando imagens...</div>';
        selectFlyerModal.style.display = 'block';
        try {
            // List files from 'events' bucket and filter by ext
            // List only files inside the 'flyers' folder of the 'events' bucket per rule.
            const { data, error } = await supabase.storage.from('events').list('flyers', { limit: 200, offset: 0 });
            if (error) throw error;
            const allowed = ['.jpg','.jpeg','.png','.webp'];
            const images = (data || []).filter(f => {
                const name = f.name.toLowerCase();
                return allowed.some(ext => name.endsWith(ext));
            });
            if (images.length === 0) {
                existingFlyersGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:12px;color:var(--text-secondary);">Nenhuma imagem encontrada na pasta "flyers".</div>';
                return;
            }
            existingFlyersGrid.innerHTML = images.map(img => {
                // img.name is the filename inside 'flyers' (e.g., 'flyer_12345.png')
                const url = supabase.storage.from('events').getPublicUrl(`flyers/${img.name}`).data?.publicUrl || '';
                return `<div class="existing-flyer-item" data-name="${img.name}" style="cursor:pointer;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:8px;">
                            <img src="${url}" alt="${img.name}" style="width:100%;height:100px;object-fit:cover;display:block;" />
                            <div style="padding-top:8px;font-size:12px;text-align:center;word-break:break-word;">${img.name}</div>
                        </div>`;
            }).join('');
            // attach click listeners
            existingFlyersGrid.querySelectorAll('.existing-flyer-item').forEach(el => {
                el.addEventListener('click', () => {
                    // toggle selection
                    existingFlyersGrid.querySelectorAll('.existing-flyer-item').forEach(x => x.style.outline = '');
                    el.style.outline = `3px solid var(--primary-color)`;
                    _selectedExistingFlyer = el.dataset.name; // store filename only; we'll prefix 'flyers/' when using it
                    console.log('Imagem selecionada do bucket (filename):', _selectedExistingFlyer);
                });
            });
        } catch (err) {
            console.error('Error listing existing flyers:', err);
            existingFlyersGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:12px;color:var(--error-color);">Falha ao listar arquivos.</div>';
            showDetailedError('ERRO AO LISTAR IMAGENS', err, 'Eventos');
        }
    }

    async function confirmSelectFlyer() {
        if (!_selectedExistingFlyer) {
            showMessage('error', 'SELECIONE UMA IMAGEM ANTES DE CONFIRMAR.');
            return;
        }
        try {
            // Build the path inside the bucket explicitly: 'flyers/<filename>'
            const filePath = `flyers/${_selectedExistingFlyer}`;
            const { data: publicData, error: pubErr } = await supabase.storage.from('events').getPublicUrl(filePath);
            if (pubErr || !publicData || !publicData.publicUrl) {
                throw pubErr || new Error('Não foi possível obter a URL pública do arquivo selecionado.');
            }
            // Save to global app state so creation uses it
            window.state = window.state || state; // defensive
            state.pendingFlyerUrl = publicData.publicUrl;
            if (hiddenFlyerInput) hiddenFlyerInput.value = publicData.publicUrl;
            previewFlyer(publicData.publicUrl);
            console.log('Public URL obtida para imagem selecionada:', publicData.publicUrl);
            if (selectFlyerModal) selectFlyerModal.style.display = 'none';
            showMessage('success', 'IMAGEM SELECIONADA!');
        } catch (err) {
            console.error('Error getting public URL for selected flyer:', err);
            showDetailedError('ERRO AO OBTER URL PÚBLICA', err, 'Eventos');
        } finally {
            _selectedExistingFlyer = null;
        }
    }

    function previewFlyer(url) {
        if (!flyerPreview || !flyerPreviewImg) return;
        flyerPreviewImg.src = url;
        flyerPreview.style.display = 'block';
    }

    // Note: handleUploadFlyer removed; upload handled inside input.change above.

    // === SCREEN: HISTÓRICO DE EVENTOS & MODAL FINANCEIRO ===
    const closeFinancialModalBtn = document.getElementById('close-financial-modal');
    if (closeFinancialModalBtn) {
        closeFinancialModalBtn.addEventListener('click', () => {
            document.getElementById('financial-modal').style.display = 'none';
        });
    }
    const financialForm = document.getElementById('financial-form');
    if (financialForm) {
        financialForm.addEventListener('submit', handleSaveFinancialReport);
    }

    // Listeners para os inputs do modal financeiro para recalcular em tempo real.
    const moneyInputs = ['box-office-sales','online-sales','infra-cost','staff-cost','event-other-expenses',
        'bar-sales','bar-cost-beverages','bar-cost-ice','bar-cost-disposables','bar-other-expenses'
    ];
    moneyInputs.forEach(inputId => {
        const inputElement = document.getElementById(inputId);
        if (inputElement) {
            // Format as BRL while typing and recalc balances
            inputElement.addEventListener('input', (e) => {
                formatBRLInput(e.target);
                updateFinancialBalance();
            });
            // Format on blur to ensure consistent display
            inputElement.addEventListener('blur', (e) => formatBRLInput(e.target, true));
        }
    });

    // Also attach mask to event ticket price fields EXCLUDING the user-facing create-event ticket input.
    // ticket-price must accept free typing; mask/parsing happens only when saving.
    const priceInputs = ['new-ticket-price','past-event-price'];
    priceInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('input-medium');
            el.addEventListener('input', (e) => formatBRLInput(e.target));
            el.addEventListener('blur', (e) => formatBRLInput(e.target, true));
        }
    });

    // Utility: attach class for consistent visual sizing to monetary inputs in DOM if not present
    document.querySelectorAll('.money-input').forEach(el => {
        if (!el.classList.contains('input-medium')) el.classList.add('input-medium');
    });

    // === MODAL DE RELATÓRIO FINANCEIRO (ABAS) ===
    const financialTabButtons = document.querySelectorAll('#financial-modal .tabs-nav .tab-btn');
    financialTabButtons.forEach(btn => {
        btn.addEventListener('click', () => navigateToFinancialTab(btn.dataset.tab));
    });

    // === MODAL DE FORMULÁRIO DE EVENTO PASSADO (PARA REGISTRO/EDIÇÃO DE HISTÓRICO) ===
    const closePastEventModalBtn = document.getElementById('close-past-event-modal');
    if (closePastEventModalBtn) {
        closePastEventModalBtn.addEventListener('click', closePastEventFormModal);
    }
    if (pastEventForm) {
        pastEventForm.addEventListener('submit', handlePastEventFormSubmit);
    }
}

// ==============================================
// FUNÇÕES DE CRIAÇÃO E FINALIZAÇÃO DE EVENTOS (SCREEN: CRIAR EVENTO)
// ==============================================

/**
 * @function handleCreateEvent
 * @description Lida com o envio do formulário de criação de evento.
 * Valida os campos, cria um novo evento (finalizando o anterior se houver) e atualiza a UI.
 * @param {Event} e - O evento de envio do formulário.
 * @param {Function} navigateTo - Função para navegar entre as telas (`navigateToScreen`).
 * @param {Function} update - Função para atualizar a UI global (`updateUI`).
 * @returns {Promise<void>}
 * @usedBy `setupEventHandlers` (create-event-form submit)
 */
async function handleCreateEvent(e, navigateTo, update) {
    e.preventDefault();
    const form = e.target;
    if (!validateActiveEventForm(form)) return; // Valida os campos do formulário.

    // Use pendingFlyerUrl from state; prevent saving if empty
    const flyerUrl = state.pendingFlyerUrl || (document.getElementById('event-flyer-url')?.value || '').trim();
    if (!flyerUrl) {
        showMessage('error', 'POR FAVOR, SELECIONE OU ENVIE UM FLYER ANTES DE SALVAR O EVENTO.');
        return;
    }

    // Build payload using only existing columns in events table
    const eventData = {
        name: document.getElementById('event-name').value.toUpperCase(),
        event_date: document.getElementById('event-date').value,
        event_time: document.getElementById('event-time').value,
        location: document.getElementById('event-location').value.toUpperCase(),
        ticket_price: parseUserDecimal(document.getElementById('ticket-price').value),
        flyer_image_url: flyerUrl,
        status: 'draft' // saved as draft by default
    };

    // Log payload before sending
    console.log('INSERT payload for events:', JSON.stringify(eventData));

    showLoading();
    try {
        // If there's an active event, close it first.
        if (state.activeEvent) {
            const { error: updateOldError } = await supabase
                .from('events')
                .update({ status: 'closed', encerrado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('id', state.activeEvent.id);
            if (updateOldError) throw updateOldError;
        }

        // Insert the new event using only allowed columns
        const { data, error } = await supabase
            .from('events')
            .insert([eventData])
            .select();
        if (error) throw error;

        state.activeEvent = data[0];
        update();
        showMessage('success', 'EVENTO CRIADO COM SUCESSO!');
        form.reset();
        clearFormErrors(form);
        navigateTo('create-event');
    } catch (error) {
        console.error('Error creating event:', error);
        showDetailedError('ERRO AO CRIAR EVENTO', error, 'Eventos');
    } finally {
        hideLoading();
    }
}

/**
 * @function handleFinalizeEvent
 * @description Lida com a finalização de um evento ativo.
 * Altera o status do evento para 'closed' e define o timestamp de encerramento.
 * @param {Event} e - O evento de clique do botão.
 * @param {Function} navigateTo - Função para navegar entre as telas (`navigateToScreen`).
 * @param {Function} update - Função para atualizar a UI global (`updateUI`).
 * @returns {Promise<void>}
 * @usedBy `setupEventHandlers` (finalize-event button click)
 */
/**
 * @function handleCreateEventPublic
 * @description Cria e publica um evento num único passo (status = 'published').
 * Reusa validação do formulário e atualiza UI/estado.
 */
async function handleCreateEventPublic(e, navigateTo, update) {
    e.preventDefault();
    const form = document.getElementById('create-event-form');
    if (!validateActiveEventForm(form)) return;

    const flyerUrlPub = state.pendingFlyerUrl || (document.getElementById('event-flyer-url')?.value || '').trim();
    if (!flyerUrlPub) {
        showMessage('error', 'POR FAVOR, SELECIONE OU ENVIE UM FLYER ANTES DE PUBLICAR O EVENTO.');
        return;
    }

    // Build insert payload using only existing event columns; insert as draft first
    const insertData = {
        name: document.getElementById('event-name').value.toUpperCase(),
        event_date: document.getElementById('event-date').value,
        event_time: document.getElementById('event-time').value,
        location: document.getElementById('event-location').value.toUpperCase(),
        ticket_price: parseUserDecimal(document.getElementById('ticket-price').value),
        flyer_image_url: flyerUrlPub,
        status: 'draft'
    };

    // Log payload before INSERT
    console.log('INSERT payload for events (publish flow):', JSON.stringify(insertData));

    showLoading();
    try {
        // Close previous active event if exists
        if (state.activeEvent) {
            const { error: updateOldError } = await supabase
                .from('events')
                .update({ status: 'closed', encerrado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('id', state.activeEvent.id);
            if (updateOldError) throw updateOldError;
        }

        // Insert as draft
        const { data: inserted, error: insertErr } = await supabase
            .from('events')
            .insert([insertData])
            .select();
        if (insertErr) throw insertErr;
        const newEvent = inserted[0];

        // Now perform a simple UPDATE to change status to 'published' (per requirement)
        const updatePayload = { status: 'published', updated_at: new Date().toISOString() };
        console.log('UPDATE payload for events (set published):', JSON.stringify(updatePayload));
        const { data: updatedEvent, error: updateErr } = await supabase
            .from('events')
            .update(updatePayload)
            .eq('id', newEvent.id)
            .select();
        if (updateErr) throw updateErr;

        state.activeEvent = updatedEvent[0] || newEvent;
        update();
        showMessage('success', 'EVENTO CRIADO E PUBLICADO COM SUCESSO!');
        form.reset();
        navigateTo('create-event');
    } catch (err) {
        console.error('Error creating & publishing event:', err);
        showDetailedError('ERRO AO CRIAR E PUBLICAR EVENTO', err, 'Eventos');
    } finally {
        hideLoading();
    }
}

async function handleFinalizeEvent(e, navigateTo, update) {
    if (!state.activeEvent) return; // Só finaliza se houver um evento ativo.
    showLoading();
    try {
        const { error } = await supabase
            .from('events')
            .update({ 
                status: 'finished', 
                encerrado_em: new Date().toISOString(),
                updated_at: new Date().toISOString() 
            })
            .eq('id', state.activeEvent.id);
        if (error) throw error;

        state.activeEvent = null; // Remove o evento ativo do estado.
        update(); // Atualiza a UI para refletir a ausência de evento ativo.
        showMessage('success', 'EVENTO FINALIZADO COM SUCESSO!');
        navigateTo('create-event'); // Navega de volta para a tela de criar evento.
    } catch (error) {
        console.error('Error finalizing event:', error);
        showMessage('error', 'ERRO AO FINALIZAR EVENTO');
        showDetailedError('Erro ao finalizar evento', error, 'Eventos');
    } finally {
        hideLoading();
    }
}

/**
 * @function validateActiveEventForm
 * @description Valida o formulário de "Criar Evento" na tela `create-event`.
 * Exibe mensagens de erro específicas para campos inválidos.
 * @param {HTMLFormElement} form - O formulário a ser validado.
 * @returns {boolean} True se o formulário for válido, False caso contrário.
 * @usedBy `handleCreateEvent`
 */
function validateActiveEventForm(form) {
    const eventName = document.getElementById('event-name');
    const eventDate = document.getElementById('event-date');
    const eventTime = document.getElementById('event-time'); // Novo: hora do evento
    const eventLocation = document.getElementById('event-location'); // Novo: local do evento
    const ticketPrice = document.getElementById('ticket-price');
    let isValid = true;
    clearFormErrors(form); // Limpa erros anteriores.

    if (!eventName.value.trim()) {
        showFieldError(eventName, 'NOME DO EVENTO É OBRIGATÓRIO');
        isValid = false;
    }
    if (!eventLocation.value.trim()) { // Validação do novo campo local
        showFieldError(eventLocation, 'LOCAL DO EVENTO É OBRIGATÓRIO');
        isValid = false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reseta a hora para comparar apenas as datas.
    const selectedDate = new Date(eventDate.value);
    if (!eventDate.value || selectedDate < today) {
        showFieldError(eventDate, 'DATA DO EVENTO É OBRIGATÓRIA E DEVE SER FUTURA OU HOJE');
        isValid = false;
    }
    if (!eventTime.value) { // Validação do novo campo hora
        showFieldError(eventTime, 'HORA DO EVENTO É OBRIGATÓRIA');
        isValid = false;
    }
    if (!ticketPrice.value || parseFloat(ticketPrice.value) <= 0) {
        showFieldError(ticketPrice, 'VALOR DO INGRESSO É OBRIGATÓRIO E DEVE SER POSITIVO');
        isValid = false;
    }

    const flyerInput = document.getElementById('event-flyer-url');
    if (!flyerInput || !flyerInput.value.trim()) {
        if (flyerInput) showFieldError(flyerInput, 'O LINK DO FLYER É OBRIGATÓRIO');
        isValid = false;
    }

    return isValid;
}

// ==============================================
// FUNÇÕES DE EDIÇÃO DE PREÇO DO INGRESSO (SCREEN: CRIAR EVENTO - MODAL)
// ==============================================

/**
 * @function openTicketPriceModal
 * @description Abre o modal para editar o valor do ingresso do evento ativo.
 * @returns {void}
 * @usedBy `setupEventHandlers` (edit-ticket-price-btn click)
 */
function openTicketPriceModal() {
    const newTicketPriceInput = document.getElementById('new-ticket-price');
    const ticketPriceModal = document.getElementById('ticket-price-modal');
    if (newTicketPriceInput && ticketPriceModal && state.activeEvent) {
        newTicketPriceInput.value = state.activeEvent.ticket_price; // Preenche o campo com o valor atual.
        ticketPriceModal.style.display = 'block'; // Exibe o modal.
    }
}

/**
 * @function closeTicketPriceModal
 * @description Fecha o modal de edição do valor do ingresso.
 * @returns {void}
 * @usedBy `setupEventHandlers` (close-price-modal click)
 */
function closeTicketPriceModal() {
    const ticketPriceModal = document.getElementById('ticket-price-modal');
    if (ticketPriceModal) {
        ticketPriceModal.style.display = 'none';
    }
}

/**
 * @function handleTicketPriceUpdate
 * @description Lida com a atualização do valor do ingresso do evento ativo.
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupEventHandlers` (update-price-form submit)
 */
async function handleTicketPriceUpdate(e) {
    e.preventDefault();
    const newPriceInput = document.getElementById('new-ticket-price');
    const newPrice = parseFloat(newPriceInput.value);

    // Parse formatted BRL to numeric value
    const parsedNewPrice = parseFloat(parseBRL(newPriceInput.value) || 0);
    if (!parsedNewPrice || parsedNewPrice <= 0) {
        showMessage('error', 'VALOR INVÁLIDO');
        return;
    }
    showLoading();
    try {
        if (state.activeEvent) {
            const { data, error } = await supabase
                .from('events')
                .update({ ticket_price: parsedNewPrice, updated_at: new Date().toISOString() })
                .eq('id', state.activeEvent.id)
                .select();
            if (error) throw error;

            state.activeEvent = data[0]; // Atualiza o evento ativo no estado.
            closeTicketPriceModal();
            updateUI(); // Atualiza a UI para refletir o novo preço.
            showMessage('success', 'VALOR DOS INGRESSOS ATUALIZADO!');
        }
    } catch (error) {
        console.error('Error updating ticket price:', error);
        showDetailedError('ERRO AO ATUALIZAR VALOR', error, 'Eventos');
    } finally {
        hideLoading();
    }
}

// ==============================================
// FUNÇÕES DE HISTÓRICO DE EVENTOS (SCREEN: HISTÓRICO)
// ==============================================

/**
 * @function updateHistoryScreen
 * @description Atualiza a tela de histórico de eventos.
 * Busca eventos finalizados da mesma tabela events usando filtro de status.
 * @returns {Promise<void>}
 * @usedBy `app.js` (navigateToScreen), `handleSaveFinancialReport`, `deleteEvent`, `handlePastEventFormSubmit`
 */
export async function updateHistoryScreen() {
    const list = document.getElementById('history-list');
    if (!list) return;

    // Adiciona o botão de registro manual de eventos e o skeleton de carregamento.
    list.innerHTML = `
        <div style="display:flex; justify-content: center; margin-bottom: 18px;">
            <button class="btn btn-primary" id="manual-register-event-btn"><i class="fas fa-plus"></i> REGISTRAR EVENTOS PASSADOS</button>
        </div>
        <div id="history-cards-skeleton">
            <div class="skeleton skeleton-item"></div>
            <div class="skeleton skeleton-item"></div>
            <div class="skeleton skeleton-item"></div>
            <div style="text-align:center;color:#999;font-size:15px;padding:20px 0;">Carregando dados...</div>
        </div>
    `;

    // Adiciona event listener para o botão "REGISTRAR EVENTOS PASSADOS" APÓS ele ser inserido no DOM.
    const manualRegisterEventBtn = document.getElementById('manual-register-event-btn');
    if (manualRegisterEventBtn) {
        manualRegisterEventBtn.addEventListener('click', () => openPastEventFormModal());
    }

    try {
        const { data: finishedEvents, error } = await supabase
            .from('events')
            .select('*')
            .eq('status', 'finished')
            .order('encerrado_em', { ascending: false }); // Mais recentes primeiro baseado no timestamp de encerramento

        if (error) throw error;

        // Render the comparative financial/presentation chart above the history cards
        renderHistoryChart(finishedEvents || []);
        renderEventHistoryCards(finishedEvents || []);
    } catch (error) {
        console.error('Error loading history:', error);
        showDetailedError('ERRO AO CARREGAR HISTÓRICO', error, 'Eventos');
        // Exibe mensagem de erro se não for possível carregar o histórico.
        const historyCardsSkeleton = document.getElementById('history-cards-skeleton');
        if (historyCardsSkeleton) {
            historyCardsSkeleton.innerHTML = '<p class="empty-list-msg">Não foi possível carregar o histórico.</p>';
        }
    }
}

/**
 * @function renderEventHistoryCards
 * @description Renderiza os cards de eventos históricos no contêiner da lista.
 * @param {Array<object>} events - A lista de eventos finalizados.
 * @returns {void}
 * @usedBy `updateHistoryScreen`
 */
function renderEventHistoryCards(events) {
    const list = document.getElementById('history-list');
    if (!list) return;

    // Remove o skeleton de carregamento.
    const skeleton = document.getElementById('history-cards-skeleton');
    if (skeleton) skeleton.remove();

    if (!events || events.length === 0) {
        list.innerHTML += '<p class="empty-list-msg">Nenhum evento histórico encontrado.</p>';
        return;
    }
    const cardsWrapper = document.createElement('div');
    // Cria um card para cada evento e o anexa ao wrapper.
    events.forEach(e => {
        cardsWrapper.appendChild(createEventHistoryCard(e));
    });
    list.appendChild(cardsWrapper); // Adiciona o wrapper com os cards à lista.
}

/**
 * @function createEventHistoryCard
 * @description Cria um elemento de card HTML para um evento no histórico.
 * Inclui informações do evento, indicador de relatório de financeiro,
 * e botões para visualizar/editar relatório, editar detalhes, recuperar evento e excluir.
 * @param {object} event - O objeto de dados do evento.
 * @returns {HTMLElement} O elemento <div> representando o card do evento.
 * @usedBy `renderEventHistoryCards`
 */
function createEventHistoryCard(event) {
    // Verifica se o evento possui dados de relatório financeiro preenchidos.
    const hasFinancialReport =
        !!(Number(event.box_office_sales) ||
        Number(event.online_sales) ||
        Number(event.infra_cost) ||
        Number(event.staff_cost) ||
        Number(event.event_other_expenses) ||
        Number(event.bar_sales) ||
        Number(event.bar_cost_beverages) ||
        Number(event.bar_cost_misc) ||
        Number(event.bar_other_expenses) ||
        (event.observations && event.observations.trim().length > 0));

    // HTML para o ícone indicador de relatório (check para preenchido, triângulo para vazio).
    const indicatorHtml = hasFinancialReport
        ? '<span style="font-size:20px;color:#10b981;margin-right:8px;" title="Relatório registrado"><i class="fas fa-check-circle"></i></span>'
        : '<span style="font-size:20px;color:#f59e0b;margin-right:8px;" title="Relatório não preenchido"><i class="fas fa-exclamation-triangle"></i></span>';

    // Container principal do card.
    const container = document.createElement('div');
    container.className = 'history-item';

    const expanderId = `expander-${event.id}`; // ID único para o conteúdo expansível do relatório.

    // Estrutura do card com cabeçalho, conteúdo expansível (escondido por padrão) e ações.
    container.innerHTML = `
        <div class="history-header">
            <div style="display:flex;align-items:center;">
                ${indicatorHtml}
                <div>
                    <div class="history-title">${event.name}</div>
                    <div class="history-date" style="margin-top:4px;">${new Date(event.event_date).toLocaleDateString('pt-BR')}</div>
                </div>
            </div>
        </div>
        <div class="history-report-expander" id="${expanderId}" style="display:none;"></div>
        <div class="history-card-actions">
            <button class="btn-icon view-report-btn" data-id="${event.id}" title="Ver relatório">
                <i class="fas fa-file-alt"></i>
            </button>
            <div class="icon-buttons-group">
                <button class="btn-icon edit-event-details" data-id="${event.id}">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-icon recover-event" data-id="${event.id}">
                    <i class="fas fa-undo"></i>
                </button>
                <button class="btn-icon delete-event" data-id="${event.id}" style="color:#F44336;border-color:#F44336;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;

    // Adiciona event listener para o botão "VER RELATÓRIO" (expande/contrai o conteúdo).
    container.querySelector('.view-report-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que o clique no botão propague e feche o menu lateral (se aberto).
        handleExpandReportClick(event, expanderId, container);
    });

    // Adiciona event listeners para os botões de ação: editar detalhes, recuperar e excluir.
    container.querySelector('.edit-event-details').addEventListener('click', () => openPastEventFormModal(event));
    container.querySelector('.recover-event').addEventListener('click', () => recoverEvent(event.id));
    container.querySelector('.delete-event').addEventListener('click', () => confirmDelete('event', event.id, deleteEvent));

    return container;
}

/**
 * @function handleExpandReportClick
 * @description Lida com o clique no botão de "Ver Relatório", expandindo ou contraindo o resumo financeiro.
 * @param {object} event - O objeto de dados do evento.
 * @param {string} expanderId - O ID do elemento que contém o conteúdo expansível.
 * @param {HTMLElement} containerCard - O elemento do card do evento.
 * @returns {void}
 * @usedBy `createEventHistoryCard`
 */
function handleExpandReportClick(event, expanderId, containerCard) {
    const expander = containerCard.querySelector(`#${expanderId}`);
    if (!expander) return;

    // Se o expander já estiver visível, esconde-o.
    if (expander.style.display === 'block') {
        expander.style.display = 'none';
        return;
    }
    // Esconde outros expanders abertos para garantir que apenas um esteja visível por vez.
    document.querySelectorAll('.history-report-expander').forEach(el => el.style.display = 'none');
    
    expander.innerHTML = ''; // Limpa o conteúdo antes de renderizar.

    // Verifica se há dados de relatório financeiro preenchidos.
    const hasFinancialReport =
        !!(Number(event.box_office_sales) ||
        Number(event.online_sales) ||
        Number(event.infra_cost) ||
        Number(event.staff_cost) ||
        Number(event.event_other_expenses) ||
        Number(event.bar_sales) ||
        Number(event.bar_cost_beverages) ||
        Number(event.bar_cost_misc) ||
        Number(event.bar_other_expenses) ||
        (event.observations && event.observations.trim().length > 0));

    if (hasFinancialReport) {
        // Se houver relatório, renderiza o resumo e um botão para editar.
        expander.appendChild(renderFinancialSummary(event));
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-primary';
        editBtn.style = 'margin-top:14px;';
        editBtn.innerHTML = '<i class="fas fa-edit"></i> EDITAR RELATÓRIO';
        editBtn.onclick = () => openFinancialModal(event); // Abre o modal financeiro para edição.
        expander.appendChild(editBtn);
    } else {
        // Se não houver relatório, exibe uma mensagem e um botão para preencher.
        expander.innerHTML = `
            <div style="color:#ca8a04;padding:12px 0;">Relatório não preenchido.</div>
            <button class="btn btn-primary" style="margin-top:6px;" id="fill-report-${event.id}">
                <i class="fas fa-pen"></i> PREENCHER RELATÓRIO
            </button>
        `;
        const fillReportBtn = expander.querySelector(`#fill-report-${event.id}`);
        if (fillReportBtn) {
            fillReportBtn.onclick = () => openFinancialModal(event); // Abre o modal financeiro para preenchimento.
        }
    }

    expander.style.display = 'block'; // Exibe o conteúdo expansível.
    // Pequeno atraso para permitir que a UI renderize antes de tentar o scroll.
    setTimeout(() => {
        // Rola para o card expandido se ele estiver fora da tela (melhora a usabilidade mobile).
        const rect = expander.getBoundingClientRect();
        if (rect.bottom > window.innerHeight) {
            expander.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, 60);
}

/**
 * @function renderFinancialSummary
 * @description Renderiza o resumo financeiro de um evento.
 * Calcula lucros/prejuízos com base nos dados fornecidos e retorna um elemento DOM.
 * @param {object} event - O objeto de dados do evento com informações financeiras.
 * @returns {HTMLElement} Um elemento <div> contendo o resumo financeiro.
 * @usedBy `handleExpandReportClick`
 */
function renderFinancialSummary(event) {
    // Calcula as métricas financeiras da seção de Evento.
    const boxOfficeSales = Number(event.box_office_sales) || 0;
    const onlineSales = Number(event.online_sales) || 0;
    const infraCost = Number(event.infra_cost) || 0;
    const staffCost = Number(event.staff_cost) || 0;
    const eventOtherExpenses = Number(event.event_other_expenses) || 0;
    const eventTotalRevenue = boxOfficeSales + onlineSales;
    const eventTotalCosts = infraCost + staffCost + eventOtherExpenses;
    const eventProfit = eventTotalRevenue - eventTotalCosts;

    // Calcula as métricas financeiras da seção de Bar.
    const barCostBeverages = Number(event.bar_cost_beverages) || 0;
    const barCostMisc = Number(event.bar_cost_misc) || 0;
    const barSales = Number(event.bar_sales) || 0;
    const barOtherExpenses = Number(event.bar_other_expenses) || 0;
    const barTotalCosts = barCostBeverages + barCostMisc + barOtherExpenses;
    const barProfit = barSales - barTotalCosts;

    const obs = event.observations || ''; // Observações do relatório.

    // Cria o elemento div com o HTML do resumo financeiro.
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="history-stats" style="margin:10px 0 0 0;">
            <div style="flex:1">
                <h4 style="margin-bottom:6px;">DADOS DO EVENTO</h4>
                <div><strong>Vendas na bilheteria:</strong> R$ ${boxOfficeSales.toFixed(2).replace('.', ',')}</div>
                <div><strong>Vendas online:</strong> R$ ${onlineSales.toFixed(2).replace('.', ',')}</div>
                <div><strong>Custo com estrutura:</strong> R$ ${infraCost.toFixed(2).replace('.', ',')}</div>
                <div><strong>Custo com equipe:</strong> R$ ${staffCost.toFixed(2).replace('.', ',')}</div>
                <div><strong>Custo com atrações:</strong> R$ ${eventOtherExpenses.toFixed(2).replace('.', ',')}</div>
                <div><strong>Receita total:</strong> R$ ${eventTotalRevenue.toFixed(2).replace('.', ',')}</div>
                <div><strong>Lucro/prejuízo da bilheteria:</strong> R$ ${eventProfit.toFixed(2).replace('.', ',')}</div>
            </div>
            <div style="flex:1">
                <h4 style="margin-bottom:6px;">DADOS DO BAR</h4>
                <div><strong>Vendas do bar:</strong> R$ ${barSales.toFixed(2).replace('.', ',')}</div>
                <div><strong>Custo com bebidas:</strong> R$ ${barCostBeverages.toFixed(2).replace('.', ',')}</div>
                <div><strong>Custo copos/gelo:</strong> R$ ${barCostMisc.toFixed(2).replace('.', ',')}</div>
                <div><strong>Outras despesas:</strong> R$ ${barOtherExpenses.toFixed(2).replace('.', ',')}</div>
                <div><strong>Lucro/prejuízo do bar:</strong> R$ ${barProfit.toFixed(2).replace('.', ',')}</div>
            </div>
        </div>
        <div class="financial-summary">
            <strong>Observações:</strong>
            <div style="white-space:pre-line;margin:6px 0">${obs ? obs : '<i>Nenhuma</i>'}</div>
        </div>
    `;
    return div;
}

/**
 * @function recoverEvent
 * @description Função para recuperar um evento finalizado e torná-lo o evento ativo novamente.
 * @param {string} eventId - O ID do evento a ser recuperado.
 * @returns {Promise<void>}
 * @usedBy `createEventHistoryCard` (recover button)
 */
async function recoverEvent(eventId) {
    showLoading();
    try {
        // Impede a recuperação se já houver um evento ativo.
        if (state.activeEvent) {
            showMessage('error', 'FINALIZE O EVENTO ATIVO PRIMEIRO');
            showDetailedError('Tentativa de recuperar evento com outro evento ativo', new Error('Já existe um evento ativo.'), 'Eventos');
            hideLoading();
            return;
        }

        const { error: updateError } = await supabase
            .from('events')
            .update({ 
                status: 'active', 
                encerrado_em: null,
                updated_at: new Date().toISOString() 
            })
            .eq('id', eventId);
        if (updateError) throw updateError;

        // Fetch the recovered event data to ensure state is fully updated
        const { data: recoveredEvent, error: fetchError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();
        if (fetchError) throw fetchError;
        
        state.activeEvent = recoveredEvent; // Define o evento recuperado como ativo.
        updateUI(); // Atualiza a UI global.
        showMessage('success', 'EVENTO RECUPERADO!');
        navigateToScreen('create-event'); // Navega para a tela de criar evento para exibir o evento ativo.
    } catch (error) {
        console.error('Error recovering event:', error);
        showDetailedError('ERRO AO RECUPERAR EVENTO', error, 'Eventos');
    } finally {
        hideLoading();
    }
}

/**
 * @function deleteEvent
 * @description Exclui um evento e todos os dados relacionados (vendas, cortesias, check-ins) após confirmação.
 * @param {string} eventId - O ID do evento a ser excluído.
 * @returns {Promise<void>}
 * @usedBy `createEventHistoryCard` (delete button - via confirmDelete)
 */
async function deleteEvent(eventId) {
    showLoading();
    try {
        // Devido ao ON DELETE CASCADE no Supabase, basta excluir o evento para que vendas e tickets sejam excluídos.
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', eventId);
        if (error) throw error;

        showMessage('success', 'EVENTO E TODOS OS DADOS RELACIONADOS FORAM EXCLUÍDOS!');
        state.currentPage.history = 1; // Reseta a paginação do histórico.
        updateHistoryScreen(); // Atualiza a tela de histórico para refletir as mudanças.
    } catch (error) {
        console.error('Error deleting event:', error);
        showDetailedError('ERRO AO EXCLUIR EVENTO', error, 'Eventos');
    } finally {
        hideLoading();
    }
}

/**
 * @function loadActiveEvent
 * @description Carrega o evento ativo do banco de dados ao iniciar a aplicação.
 * @returns {Promise<object|null>} O objeto do evento ativo ou null se não houver.
 * @usedBy `app.js` (initializeApp)
 */
export async function loadActiveEvent() {
    try {
        // Per requirement: always check DB for a published event on load (one record only)
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('status', 'published')
            .limit(1)
            .maybeSingle(); // returns single record or null safely
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        return data || null;
    } catch (error) {
        console.error('Error loading published event:', error);
        showDetailedError('ERRO AO CARREGAR EVENTO PUBLICADO', error, 'Eventos');
        return null;
    }
}

// ==============================================
// FUNÇÕES DO MODAL DE RELATÓRIO FINANCEIRO (SCREEN: HISTÓRICO)
// ==============================================

/**
 * @function openFinancialModal
 * @description Abre o modal de relatório financeiro para um evento específico (histórico).
 * Preenche os campos do formulário com os dados financeiros existentes do evento.
 * @param {object} event - O objeto de dados do evento histórico.
 * @returns {void}
 * @usedBy `handleExpandReportClick`, `createEventHistoryCard`
 */
function openFinancialModal(event) {
    currentFinancialEvent = event; // Armazena o evento atual no escopo do módulo.
    const financialEventIdInput = document.getElementById('financial-event-id');
    const boxOfficeSalesInput = document.getElementById('box-office-sales');
    const onlineSalesInput = document.getElementById('online-sales');
    const infraCostInput = document.getElementById('infra-cost');
    const staffCostInput = document.getElementById('staff-cost');
    const eventOtherExpensesInput = document.getElementById('event-other-expenses');
    const barSalesInput = document.getElementById('bar-sales');
    const barCostBeveragesInput = document.getElementById('bar-cost-beverages');
    const barCostMiscInput = document.getElementById('bar-cost-misc');
    const barOtherExpensesInput = document.getElementById('bar-other-expenses');
    const observationsTextarea = document.getElementById('observations');

    // New fields
    const qtyBoxOffice = document.getElementById('qty-box-office');
    const qtyOnline = document.getElementById('qty-online');
    const qtyCourtesies = document.getElementById('qty-courtesies');
    const attractionsCount = document.getElementById('attractions-count');
    const attractionsContainer = document.getElementById('attractions-container');

    const financialModal = document.getElementById('financial-modal');

    if (financialEventIdInput) financialEventIdInput.value = event.id;
    if (boxOfficeSalesInput) boxOfficeSalesInput.value = event.box_office_sales || 0;
    if (onlineSalesInput) onlineSalesInput.value = event.online_sales || 0;
    if (infraCostInput) infraCostInput.value = event.infra_cost || 0;
    if (staffCostInput) staffCostInput.value = event.staff_cost || 0;
    if (eventOtherExpensesInput) eventOtherExpensesInput.value = event.event_other_expenses || 0;
    if (barSalesInput) barSalesInput.value = event.bar_sales || 0;
    if (barCostBeveragesInput) barCostBeveragesInput.value = event.bar_cost_beverages || 0;
    // New bar fields: ice and disposables (non-breaking if event doesn't have these keys)
    const barCostIceInput = document.getElementById('bar-cost-ice');
    const barCostDisposablesInput = document.getElementById('bar-cost-disposables');
    if (barCostIceInput) barCostIceInput.value = event.bar_cost_ice ?? 0;
    if (barCostDisposablesInput) barCostDisposablesInput.value = event.bar_cost_disposables ?? 0;
    if (barOtherExpensesInput) barOtherExpensesInput.value = event.bar_other_expenses || 0;
    if (observationsTextarea) observationsTextarea.value = event.observations || '';

    // Load quantities if present in event (non-breaking if undefined)
    if (qtyBoxOffice) qtyBoxOffice.value = event.qty_box_office ?? 0;
    if (qtyOnline) qtyOnline.value = event.qty_online ?? 0;
    if (qtyCourtesies) qtyCourtesies.value = event.qty_courtesies ?? 0;

    // Attractions: clear and create inputs according to stored count or 0
    if (attractionsContainer) {
        attractionsContainer.innerHTML = '';
        const storedCount = event.attractions_count ? parseInt(event.attractions_count) : 0;
        const count = attractionsCount ? (parseInt(attractionsCount.value) || storedCount) : storedCount;
        if (attractionsCount) attractionsCount.value = count;
        for (let i = 1; i <= count; i++) {
            const div = document.createElement('div');
            div.className = 'form-group';
            div.innerHTML = `<label for="attraction-${i}">ATRAÇÃO ${i} (R$)</label>
                             <input type="text" id="attraction-${i}" class="input-medium money-input" placeholder="0,00" value="${(event[`attraction_${i}`] || 0)}" />`;
            attractionsContainer.appendChild(div);
        }
    }

    // Attach listeners to recompute when things change
    const moneyInputs = ['box-office-sales','online-sales','infra-cost','staff-cost','cost-rental','cost-sound','cost-structure','cost-marketing','cost-security','event-other-expenses','bar-sales','bar-cost-beverages','bar-cost-misc','bar-other-expenses'];
    moneyInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateFinancialBalance);
            el.addEventListener('blur', updateFinancialBalance);
        }
    });

    // numeric quantity listeners
    [ 'qty-box-office','qty-online','qty-courtesies' ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateFinancialBalance);
    });

    if (attractionsCount) {
        attractionsCount.addEventListener('input', () => {
            const cnt = Math.max(0, parseInt(attractionsCount.value) || 0);
            // rebuild attractions inputs
            attractionsContainer.innerHTML = '';
            for (let i = 1; i <= cnt; i++) {
                const div = document.createElement('div');
                div.className = 'form-group';
                div.innerHTML = `<label for="attraction-${i}">ATRAÇÃO ${i} (R$)</label>
                                 <input type="text" id="attraction-${i}" class="input-medium money-input" placeholder="0,00" value="0" />`;
                attractionsContainer.appendChild(div);
                // attach update listener
                const input = div.querySelector('input');
                input.addEventListener('input', updateFinancialBalance);
            }
            updateFinancialBalance();
        });
    }

    updateFinancialBalance(); // Calcula e exibe os saldos iniciais.
    if (financialModal) financialModal.style.display = 'block'; // Exibe o modal.

    // Define a aba padrão e navega para ela
    currentFinancialTab = 'financial-event-data';
    navigateToFinancialTab(currentFinancialTab);
}

/**
 * @function updateFinancialBalance
 * @description Calcula e atualiza os valores de lucro/prejuízo na interface do modal financeiro em tempo real.
 * @returns {void}
 * @usedBy `openFinancialModal`, `setupEventHandlers` (input events for financial fields)
 */
function updateFinancialBalance() {
    // Helper to parse BRL formatted inputs to number
    const toNumber = (id) => parseFloat(parseBRL(document.getElementById(id)?.value) || 0);

    // Revenues
    const boxOffice = toNumber('box-office-sales');
    const onlineSales = toNumber('online-sales');

    // Quantities
    const qtyBoxOffice = parseInt(document.getElementById('qty-box-office')?.value) || 0;
    const qtyOnline = parseInt(document.getElementById('qty-online')?.value) || 0;
    const qtyCourtesies = parseInt(document.getElementById('qty-courtesies')?.value) || 0;

    // Event costs breakdown (these compose the event's total costs)
    const costRental = toNumber('cost-rental');
    const costSound = toNumber('cost-sound');
    const costStructure = toNumber('cost-structure');
    const costMarketing = toNumber('cost-marketing');
    const costSecurity = toNumber('cost-security');
    const staffCost = toNumber('staff-cost');
    const eventOther = toNumber('event-other-expenses');

    // Attractions dynamic costs
    const attractionsCount = parseInt(document.getElementById('attractions-count')?.value) || 0;
    let attractionsTotal = 0;
    for (let i = 1; i <= attractionsCount; i++) {
        attractionsTotal += toNumber(`attraction-${i}`);
    }

    // Bar figures (kept separate from event costs)
    const barSales = toNumber('bar-sales');
    const barCostBev = toNumber('bar-cost-beverages');
    const barCostIce = toNumber('bar-cost-ice');
    const barCostDisposables = toNumber('bar-cost-disposables');
    const barOther = toNumber('bar-other-expenses');

    // Totals
    const totalTickets = qtyBoxOffice + qtyOnline + qtyCourtesies;
    const totalRevenue = boxOffice + onlineSales;
    // totalEventCosts aggregates only event-related costs (EXCLUDES bar costs)
    const totalEventCosts = costRental + costSound + costStructure + costMarketing + costSecurity + staffCost + eventOther + attractionsTotal;
    const totalBarCosts = barCostBev + barCostIce + barCostDisposables + barOther;
    // totalCosts for the event area should represent only event costs (bar costs shown separately)
    const totalCosts = totalEventCosts;
    // Final balance for the event area is revenue (ingressos) minus event costs (EXCLUDING bar)
    const finalBalance = totalRevenue - totalEventCosts;
    const barProfit = barSales - totalBarCosts;

    // Update UI elements
    const totalTicketsEl = document.getElementById('financial-total-tickets');
    const totalRevenueEl = document.getElementById('financial-total-revenue');
    const totalCostsEl = document.getElementById('financial-total-costs');
    const finalBalanceEl = document.getElementById('financial-final-balance');
    const finalBalanceBarSpan = document.getElementById('final-balance-bar');
    const totalBarCostsEl = document.getElementById('financial-total-bar-costs');
    const ticketAvgEl = document.getElementById('financial-ticket-average');

    if (totalTicketsEl) totalTicketsEl.textContent = String(totalTickets);
    if (totalRevenueEl) totalRevenueEl.textContent = totalRevenue.toFixed(2).replace('.', ',');
    // Display only event-related total costs in the "TOTAL DE CUSTOS" field
    if (totalCostsEl) totalCostsEl.textContent = totalCosts.toFixed(2).replace('.', ',');
    if (totalBarCostsEl) totalBarCostsEl.textContent = totalBarCosts.toFixed(2).replace('.', ',');

    // Bar profit/loss display with color
    if (finalBalanceBarSpan) {
        finalBalanceBarSpan.textContent = `R$ ${barProfit.toFixed(2).replace('.', ',')}`;
        finalBalanceBarSpan.style.color = barProfit >= 0 ? 'var(--success-color)' : 'var(--error-color)';
    }

    if (finalBalanceEl) {
        const formatted = `R$ ${Math.abs(finalBalance).toFixed(2).replace('.', ',')}`;
        finalBalanceEl.textContent = formatted;
        finalBalanceEl.style.color = finalBalance >= 0 ? 'var(--success-color)' : 'var(--error-color)';
    }

    // Ticket médio: avoid division by zero
    if (ticketAvgEl) {
        if (totalTickets > 0) {
            const avg = barSales / totalTickets;
            ticketAvgEl.textContent = `R$ ${avg.toFixed(2).replace('.', ',')}`;
            ticketAvgEl.style.color = 'var(--text-primary)';
        } else {
            ticketAvgEl.textContent = '—';
            ticketAvgEl.style.color = 'var(--text-secondary)';
        }
    }
}

/**
 * @function handleSaveFinancialReport
 * @description Lida com o salvamento do relatório financeiro de um evento.
 * Coleta os dados do formulário e atualiza o evento no Supabase.
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupEventHandlers` (financial-form submit)
 */
async function handleSaveFinancialReport(e) {
    e.preventDefault();
    const eventId = document.getElementById('financial-event-id')?.value;

    // Collect numeric and money fields, plus quantities and attractions
    const updateData = {
        qty_box_office: parseInt(document.getElementById('qty-box-office')?.value) || 0,
        qty_online: parseInt(document.getElementById('qty-online')?.value) || 0,
        qty_courtesies: parseInt(document.getElementById('qty-courtesies')?.value) || 0,

        box_office_sales: parseFloat(parseBRL(document.getElementById('box-office-sales')?.value) || 0),
        online_sales: parseFloat(parseBRL(document.getElementById('online-sales')?.value) || 0),

        cost_rental: parseFloat(parseBRL(document.getElementById('cost-rental')?.value) || 0),
        cost_sound: parseFloat(parseBRL(document.getElementById('cost-sound')?.value) || 0),
        cost_structure: parseFloat(parseBRL(document.getElementById('cost-structure')?.value) || 0),
        cost_marketing: parseFloat(parseBRL(document.getElementById('cost-marketing')?.value) || 0),
        cost_security: parseFloat(parseBRL(document.getElementById('cost-security')?.value) || 0),
        staff_cost: parseFloat(parseBRL(document.getElementById('staff-cost')?.value) || 0),
        event_other_expenses: parseFloat(parseBRL(document.getElementById('event-other-expenses')?.value) || 0),

        // Bar-specific fields (new)
        bar_sales: parseFloat(parseBRL(document.getElementById('bar-sales')?.value) || 0),
        bar_cost_beverages: parseFloat(parseBRL(document.getElementById('bar-cost-beverages')?.value) || 0),
        bar_cost_ice: parseFloat(parseBRL(document.getElementById('bar-cost-ice')?.value) || 0),
        bar_cost_disposables: parseFloat(parseBRL(document.getElementById('bar-cost-disposables')?.value) || 0),
        bar_other_expenses: parseFloat(parseBRL(document.getElementById('bar-other-expenses')?.value) || 0),

        attractions_count: parseInt(document.getElementById('attractions-count')?.value) || 0,
        observations: document.getElementById('observations')?.value || '',
        updated_at: new Date().toISOString()
    };

    // Collect attractions values individually into updateData as attraction_1, attraction_2...
    const attractionsCount = updateData.attractions_count;
    for (let i = 1; i <= attractionsCount; i++) {
        updateData[`attraction_${i}`] = parseFloat(parseBRL(document.getElementById(`attraction-${i}`)?.value) || 0);
    }
    // Also include bar breakdown fields if present (keeps DB compatibility — fields will be ignored if schema doesn't have them)
    // (Names match those used in UI: bar_sales, bar_cost_beverages, bar_cost_ice, bar_cost_disposables, bar_other_expenses)

    showLoading();
    try {
        const { error } = await supabase
            .from('events')
            .update(updateData)
            .eq('id', eventId);
        if (error) throw error;

        showMessage('success', 'RELATÓRIO SALVO!');
        const financialModal = document.getElementById('financial-modal');
        if (financialModal) financialModal.style.display = 'none'; // Fecha o modal.
        updateHistoryScreen(); // Atualiza a tela de histórico para refletir as mudanças.
    } catch (error) {
        console.error('Erro ao salvar relatório:', error);
        showDetailedError('ERRO AO SALVAR RELATÓRIO', error, 'Eventos');
    } finally {
        hideLoading();
    }
}

/**
 * @function navigateToFinancialTab
 * @description Navigates to a specific tab within the financial report modal.
 * @param {string} tabId - The ID of the tab to be displayed (e.g., 'financial-event-data', 'financial-bar-data').
 * @returns {void}
 */
function navigateToFinancialTab(tabId) {
    currentFinancialTab = tabId; // Update module state
    const tabButtons = document.querySelectorAll('#financial-modal .tabs-nav .tab-btn');
    const tabPanels = document.querySelectorAll('#financial-modal .tab-panel');

    tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === tabId));
}

// ==============================================
// FUNÇÕES DO MODAL DE FORMULÁRIO DE EVENTO PASSADO (SCREEN: HISTÓRICO)
// ==============================================

/**
 * @function openPastEventFormModal
 * @description Abre o modal de formulário para registrar ou editar um evento passado.
 * Preenche os campos se um objeto de evento for fornecido (para edição).
 * @param {object} [event=null] - O objeto do evento a ser editado (opcional).
 * @returns {void}
 * @usedBy `setupEventHandlers` (manual-register-event-btn click), `createEventHistoryCard` (edit event details button)
 */
function openPastEventFormModal(event = null) {
    if (!pastEventForm || !pastEventFormModal) return;

    clearFormErrors(pastEventForm); // Limpa erros de validação anteriores.
    if (event) {
        // Modo de edição: preenche os campos com os dados do evento.
        pastEventModalTitle.textContent = 'EDITAR EVENTO';
        pastEventIdInput.value = event.id;
        pastEventNameInput.value = event.name;
        pastEventLocationInput.value = event.location || ''; // Preenche local
        pastEventDateInput.value = event.event_date;
        pastEventTimeInput.value = event.event_time || ''; // Preenche hora
        pastEventPriceInput.value = event.ticket_price;
        if (pastEventFlyerInput) pastEventFlyerInput.value = event.flyer_image_url || '';
    } else {
        // Modo de registro: limpa os campos.
        pastEventModalTitle.textContent = 'REGISTRAR EVENTO PASSADO';
        pastEventIdInput.value = '';
        pastEventNameInput.value = '';
        pastEventLocationInput.value = ''; // Limpa local
        pastEventDateInput.value = '';
        pastEventTimeInput.value = ''; // Limpa hora
        pastEventPriceInput.value = '';
        if (pastEventFlyerInput) pastEventFlyerInput.value = '';
    }
    pastEventFormModal.style.display = 'block'; // Exibe o modal.
}

/**
 * @function closePastEventFormModal
 * @description Fecha o modal de formulário de evento passado e limpa os erros de validação.
 * @returns {void}
 * @usedBy `setupEventHandlers` (close-past-event-modal click), `handlePastEventFormSubmit`
 */
function closePastEventFormModal() {
    if (pastEventFormModal) {
        pastEventFormModal.style.display = 'none';
    }
    if (pastEventForm) {
        clearFormErrors(pastEventForm);
    }
}

/**
 * @function validatePastEventForm
 * @description Valida o formulário de evento passado (para registro ou edição).
 * @returns {boolean} True se o formulário for válido, False caso contrário.
 * @usedBy `handlePastEventFormSubmit`
 */
function validatePastEventForm() {
    let isValid = true;
    if (!pastEventForm) return false;

    clearFormErrors(pastEventForm);

    if (!pastEventNameInput.value.trim()) {
        showFieldError(pastEventNameInput, 'NOME DO EVENTO É OBRIGATÓRIO');
        isValid = false;
    }
    if (!pastEventLocationInput.value.trim()) { // Validação do novo campo local
        showFieldError(pastEventLocationInput, 'LOCAL DO EVENTO É OBRIGATÓRIO');
        isValid = false;
    }
    if (!pastEventDateInput.value) {
        showFieldError(pastEventDateInput, 'DATA DO EVENTO É OBRIGATÓRIA');
        isValid = false;
    }
    if (!pastEventTimeInput.value) { // Validação do novo campo hora
        showFieldError(pastEventTimeInput, 'HORA DO EVENTO É OBRIGATÓRIA');
        isValid = false;
    }
    if (!pastEventPriceInput.value || parseFloat(pastEventPriceInput.value) <= 0) {
        showFieldError(pastEventPriceInput, 'VALOR DO INGRESSO É OBRIGATÓRIO E DEVE SER POSITIVO');
        isValid = false;
    }

    // Flyer is required for past event registration/editing as well
    if (!pastEventFlyerInput || !pastEventFlyerInput.value.trim()) {
        if (pastEventFlyerInput) showFieldError(pastEventFlyerInput, 'O LINK DO FLYER É OBRIGATÓRIO');
        isValid = false;
    }

    return isValid;
}

/**
 * @function handlePastEventFormSubmit
 * @description Lida com o envio do formulário de evento passado (registro ou edição).
 * Valida os dados, insere ou atualiza o evento no Supabase e atualiza a tela de histórico.
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupEventHandlers` (past-event-form submit)
 */
async function handlePastEventFormSubmit(e) {
    e.preventDefault();
    if (!validatePastEventForm()) return;

    const eventId = pastEventIdInput.value;
    const eventData = {
        name: pastEventNameInput.value.toUpperCase(),
        location: pastEventLocationInput.value.toUpperCase(), // Salva o local
        event_date: pastEventDateInput.value, // Renomeado
        event_time: pastEventTimeInput.value, // Renomeado
        ticket_price: parseFloat(pastEventPriceInput.value),
        flyer_image_url: (pastEventFlyerInput?.value || '').trim(),
        updated_at: new Date().toISOString() // Adiciona updated_at para updates
    };

    showLoading();
    try {
        if (eventId) { // Se houver um eventId, é uma edição.
            const { error } = await supabase
                .from('events')
                .update(eventData)
                .eq('id', eventId);
            if (error) throw error;
            showMessage('success', 'EVENTO ATUALIZADO COM SUCESSO!');
        } else { // Caso contrário, é um novo registro de evento passado.
            eventData.status = 'finished'; // Novos eventos passados são sempre 'finished'.
            eventData.encerrado_em = new Date().toISOString(); // Define timestamp de encerramento
            eventData.created_at = new Date().toISOString();
            const { error } = await supabase
                .from('events')
                .insert([eventData]);
            if (error) throw error;
            showMessage('success', 'EVENTO REGISTRADO COM SUCESSO!');
        }
        closePastEventFormModal(); // Fecha o modal.
        updateHistoryScreen(); // Atualiza a tela de histórico para exibir a mudança.
    } catch (error) {
        console.error('Error saving past event:', error);
        showDetailedError('ERRO AO SALVAR EVENTO', error, 'Eventos');
    } finally {
        hideLoading();
    }
}

/* -------------------------
   HISTORY CHART UTILITIES
   -------------------------
   Creates/updates a comparative vertical bar chart showing for each finished event:
   - Público total presente
   - Total ingressos (bilheteria + online + cortesias)
   - Ticket médio ( (ingressos + bar_sales) / público )
   - Lucro total ( (ingressos + bar_sales) - (custos evento + custos bar) ) colored by positive/negative
*/
let historyChartInstance = null;

function formatBRL(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function safeNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function prepareChartDatasets(events) {
    // events: array ordered by event_date ascending
    const labels = [];
    const audience = []; // público total presente (qty_box_office + qty_online + qty_courtesies) OR derived from stored total fields if available
    const totalIngressos = []; // ingressos vendidos + cortesias
    const ticketAverage = []; // computed
    const profit = []; // computed
    const profitColors = []; // color per bar

    events.forEach(ev => {
        // Determine minimal required data: quantities and monetary fields
        const qtyBox = safeNumber(ev.qty_box_office);
        const qtyOnline = safeNumber(ev.qty_online);
        const qtyCourtesies = safeNumber(ev.qty_courtesies);
        const totalAudience = qtyBox + qtyOnline + qtyCourtesies;

        // Skip events without minimal data
        // Require at least one of audience > 0 and at least one revenue field present
        const boxSales = safeNumber(ev.box_office_sales);
        const onlineSales = safeNumber(ev.online_sales);
        const barSales = safeNumber(ev.bar_sales);
        const revenues = boxSales + onlineSales + barSales;

        const infra = safeNumber(ev.infra_cost || ev.cost_rental || ev.infra_cost); // compatibility
        const staff = safeNumber(ev.staff_cost);
        const eventOther = safeNumber(ev.event_other_expenses || 0);
        const eventCosts = infra + staff + eventOther;

        const barCostBev = safeNumber(ev.bar_cost_beverages || 0);
        const barCostMisc = safeNumber(ev.bar_cost_misc || 0);
        const barOther = safeNumber(ev.bar_other_expenses || 0);
        const barCosts = barCostBev + barCostMisc + barOther;

        const totalIngressosCount = qtyBox + qtyOnline + qtyCourtesies;

        // Skip if minimal data missing: audience zero or no revenue info -> mark as inactive (we will filter later)
        labels.push(`${ev.name} • ${new Date(ev.event_date).toLocaleDateString('pt-BR')}`);
        audience.push(totalAudience);
        totalIngressos.push(totalIngressosCount);

        // Ticket médio: (Total vendas ingressos + Vendas do bar) / Público total presente
        let ticketAvgVal = 0;
        if (totalAudience > 0) {
            ticketAvgVal = (boxSales + onlineSales + barSales) / totalAudience;
        }
        ticketAverage.push(Number(ticketAvgVal.toFixed(2)));

        // Lucro total: (Total vendas ingressos + Vendas do bar) − (Custos do evento + Custos do bar)
        const totalCosts = eventCosts + barCosts;
        const lucro = (boxSales + onlineSales + barSales) - totalCosts;
        profit.push(Number(lucro.toFixed(2)));
        profitColors.push(lucro >= 0 ? 'rgba(16,185,129,0.9)' : 'rgba(244,67,54,0.9)'); // green / red
    });

    return { labels, audience, totalIngressos, ticketAverage, profit, profitColors };
}

function renderHistoryChart(events) {
    const container = document.getElementById('history-list');
    if (!container) return;

    // ensure we have a chart container at top
    let chartWrapper = document.getElementById('history-chart-wrapper');
    if (!chartWrapper) {
        chartWrapper = document.createElement('div');
        chartWrapper.id = 'history-chart-wrapper';
        chartWrapper.className = 'history-chart-container';
        chartWrapper.innerHTML = `<canvas id="history-chart-canvas"></canvas>`;
        // Insert at top of history list container
        container.prepend(chartWrapper);
    }

    // Filter to finished events with minimal data
    const usableEvents = (events || []).filter(ev => {
        const audience = safeNumber(ev.qty_box_office) + safeNumber(ev.qty_online) + safeNumber(ev.qty_courtesies);
        const revenues = safeNumber(ev.box_office_sales) + safeNumber(ev.online_sales) + safeNumber(ev.bar_sales);
        // Require at least one audience > 0 and some revenue or costs present to show meaningful bars
        return audience > 0 && (revenues > 0 || safeNumber(ev.infra_cost) + safeNumber(ev.staff_cost) + safeNumber(ev.event_other_expenses) + safeNumber(ev.bar_cost_beverages) + safeNumber(ev.bar_cost_misc) + safeNumber(ev.bar_other_expenses) > 0);
    });

    // Sort by date ascending
    usableEvents.sort((a,b) => new Date(a.event_date) - new Date(b.event_date));

    if (usableEvents.length === 0) {
        // If nothing to show, destroy existing chart and show a subtle message
        if (historyChartInstance) {
            historyChartInstance.destroy();
            historyChartInstance = null;
        }
        chartWrapper.innerHTML = `<div class="empty-list-msg" style="padding:12px;text-align:center;color:var(--text-secondary);">Dados insuficientes para análise gráfica.</div>`;
        return;
    }

    const { labels, audience, totalIngressos, ticketAverage, profit, profitColors } = prepareChartDatasets(usableEvents);
    const canvas = document.getElementById('history-chart-canvas');
    if (!canvas) return;

    // Resize behavior: allow horizontal scroll on narrow screens
    chartWrapper.style.overflowX = 'auto';
    chartWrapper.style.padding = '12px 6px 18px 6px';

    // Destroy previous instance if exists
    if (historyChartInstance) {
        historyChartInstance.destroy();
        historyChartInstance = null;
    }

    // Build datasets: we'll provide 3 datasets but map some to alternate axes to keep scale readable
    const datasets = [
        {
            label: 'Público Total',
            data: audience,
            backgroundColor: 'rgba(59,130,246,0.85)', // blue neutral
            yAxisID: 'y',
        },
        {
            label: 'Total Ingressos',
            data: totalIngressos,
            backgroundColor: 'rgba(99,102,241,0.75)', // slightly different blue
            yAxisID: 'y',
        },
        {
            label: 'Ticket Médio (R$)',
            data: ticketAverage,
            backgroundColor: 'rgba(245,158,11,0.95)', // orange
            yAxisID: 'yRight',
        },
        {
            label: 'Lucro (R$)',
            data: profit,
            backgroundColor: profitColors,
            yAxisID: 'yRight',
        }
    ];

    // Create chart
    historyChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, boxWidth: 10 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dsLabel = context.dataset.label || '';
                            const val = context.raw;
                            if (dsLabel.includes('R$') || dsLabel.toLowerCase().includes('ticket') || dsLabel.toLowerCase().includes('lucro')) {
                                // monetary
                                return `${dsLabel}: ${formatBRL(Number(val))}`;
                            }
                            if (dsLabel.toLowerCase().includes('público') || dsLabel.toLowerCase().includes('ingressos')) {
                                return `${dsLabel}: ${Number(val)}`;
                            }
                            return `${dsLabel}: ${val}`;
                        },
                        title: function(tooltipItems) {
                            const idx = tooltipItems[0].dataIndex;
                            const ev = usableEvents[idx];
                            if (!ev) return '';
                            return `${ev.name} — ${new Date(ev.event_date).toLocaleDateString('pt-BR')}`;
                        },
                        afterBody: function(tooltipItems) {
                            const idx = tooltipItems[0].dataIndex;
                            const ev = usableEvents[idx];
                            if (!ev) return '';
                            const audienceVal = safeNumber(ev.qty_box_office) + safeNumber(ev.qty_online) + safeNumber(ev.qty_courtesies);
                            const ticketAvg = audienceVal > 0 ? ((safeNumber(ev.box_office_sales) + safeNumber(ev.online_sales) + safeNumber(ev.bar_sales)) / audienceVal) : 0;
                            const lucro = (safeNumber(ev.box_office_sales) + safeNumber(ev.online_sales) + safeNumber(ev.bar_sales)) - (safeNumber(ev.infra_cost) + safeNumber(ev.staff_cost) + safeNumber(ev.event_other_expenses) + safeNumber(ev.bar_cost_beverages) + safeNumber(ev.bar_cost_misc) + safeNumber(ev.bar_other_expenses));
                            return [
                                `Público: ${audienceVal}`,
                                `Ticket médio: ${formatBRL(Number(ticketAvg.toFixed(2)))}`,
                                `Lucro total: ${formatBRL(Number(lucro.toFixed(2)))}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: false,
                    ticks: { maxRotation: 0, autoSkip: false },
                    grid: { display: false }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Quantidade (pessoas)' }
                },
                yRight: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Valores (R$)' },
                    grid: { drawOnChartArea: false }
                }
            },
            onResize: (chart, size) => {
                // no-op but kept for future responsive tuning
            }
        }
    });
}