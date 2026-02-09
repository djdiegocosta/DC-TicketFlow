// utils.js
// Este módulo contém funções utilitárias de uso geral para o aplicativo TicketFlow.
// Inclui funcionalidades para exibir e esconder overlays de carregamento, mensagens de feedback,
// tratamento de erros, renderização de listas paginadas e modais de confirmação/erros de formulário.

// ==============================================
// IMPORTS DE MÓDULOS
// ==============================================

import { state, supabase } from './app.js'; // Importa o objeto de estado global da aplicação e o cliente Supabase.

// ==============================================
// REFERÊNCIAS AO DOM PARA FEEDBACK VISUAL
// ==============================================

const loadingOverlay = document.getElementById('loading');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message');

// ==============================================
// FUNÇÕES DE GERENCIAMENTO DE DADOS (AGORA VIA SUPABASE)
// ==============================================

/**
 * @function generateRandomID
 * @description Gera um ID único com prefixo e parte aleatória de 8 caracteres alfanuméricos.
 * @param {string} prefix - O prefixo para o ID (ex: "SALE", "TICKET").
 * @returns {string} O ID gerado no formato PREFIX-XXXXXXXX.
 * @usedBy `vendas.js`, `courtesias.js`
 */
export async function generateRandomID(prefix) {
    // Standardized ID generator:
    // - sales => BUY-YYYYMMDD-HHMMSS-RND
    // - tickets => TICKET-YYYYMMDD-HHMMSS-RND
    // RND = 3 chars (A-Z0-9)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    function rnd3() {
        let s = '';
        for (let i = 0; i < 3; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
        return s;
    }
    function formatTimestamp(d) {
        const pad = (n) => String(n).padStart(2, '0');
        const YYYY = d.getFullYear();
        const MM = pad(d.getMonth() + 1);
        const DD = pad(d.getDate());
        const HH = pad(d.getHours());
        const mm = pad(d.getMinutes());
        const ss = pad(d.getSeconds());
        return `${YYYY}${MM}${DD}-${HH}${mm}${ss}`;
    }

    // Map incoming prefixes used in code to required output prefixes
    let outPrefix = String(prefix || '').toUpperCase();
    if (outPrefix === 'SALE' || outPrefix === 'BUY') outPrefix = 'BUY';
    else if (outPrefix === 'TICKET') outPrefix = 'TICKET';
    else outPrefix = outPrefix.replace(/[^A-Z0-9]/g, '').slice(0,10) || 'ID';

    // collision check helper using supabase (ensure unique across relevant table)
    async function existsInDb(candidate) {
        try {
            if (outPrefix === 'BUY') {
                const { data, error } = await supabase.from('sales').select('id').eq('sale_code', candidate).maybeSingle();
                if (error) return false;
                return !!data;
            } else if (outPrefix === 'TICKET') {
                const { data, error } = await supabase.from('tickets').select('id').eq('ticket_code', candidate).maybeSingle();
                if (error) return false;
                return !!data;
            } else {
                return false;
            }
        } catch (e) {
            // in case of any DB error, play safe and assume no collision
            return false;
        }
    }

    // Try generate and check collisions (few retries)
    for (let attempt = 0; attempt < 6; attempt++) {
        const timestamp = formatTimestamp(new Date());
        const candidate = `${outPrefix}-${timestamp}-${rnd3()}`;
        const collision = await existsInDb(candidate);
        if (!collision) return candidate;
        // slight delay before retry to change timestamp if necessary
        await new Promise(res => setTimeout(res, 120));
    }

    // Fallback: if collisions persist (extremely unlikely), append a longer random suffix
    const fallbackSuffix = Array.from({length:6}).map(() => chars.charAt(Math.floor(Math.random()*chars.length))).join('');
    return `${outPrefix}-${formatTimestamp(new Date())}-${fallbackSuffix}`;
}

/**
 * @function registerSale
 * @description Registra uma nova venda com múltiplos tickets.
 * @param {number} eventId - ID do evento.
 * @param {Array<string>} buyerNames - Array com nomes dos compradores.
 * @returns {object} Objeto com sale_id e array de tickets criados.
 * @usedBy Funções de registro de vendas
 */
export function registerSale(eventId, buyerNames) {
    // This function is no longer directly used in vendas.js after Supabase integration.
    // Logic moved into handleRegisterSale in vendas.js
    console.warn("`registerSale` function in utils.js is deprecated. Use `handleRegisterSale` in vendas.js instead.");
    throw new Error("Deprecated function call: registerSale in utils.js");
}

/**
 * @function registerCourtesy
 * @description Registra uma nova cortesia.
 * @param {number} eventId - ID do evento.
 * @param {string} recipientName - Nome do beneficiário da cortesia.
 * @returns {object} O ticket de cortesia criado.
 * @usedBy Funções de registro de cortesias
 */
export function registerCourtesy(eventId, recipientName) {
    // This function is no longer directly used in courtesias.js after Supabase integration.
    // Logic moved into handleRegisterCourtesy in courtesias.js
    console.warn("`registerCourtesy` function in utils.js is deprecated. Use `handleRegisterCourtesy` in courtesias.js instead.");
    throw new Error("Deprecated function call: registerCourtesy in utils.js");
}

/**
 * @function getTicketsByEvent
 * @description Busca todos os tickets de um evento específico.
 * @param {number} eventId - ID do evento.
 * @returns {Array} Array de tickets do evento.
 * @usedBy Funções de listagem e gestão
 */
export function getTicketsByEvent(eventId) {
    // This function is also now directly handled by the Supabase client in the respective modules.
    // e.g., in vendas.js or checkin.js. It's now an async function there.
    console.warn("`getTicketsByEvent` function in utils.js is deprecated. Use `getTicketsByEvent` in vendas.js instead.");
    throw new Error("Deprecated function call: getTicketsByEvent in utils.js");
}

/**
 * @function getTicketsBySale
 * @description Busca todos os tickets de uma venda específica.
 * @param {string} saleId - ID da venda.
 * @returns {Array} Array de tickets da venda.
 * @usedBy Funções de gestão de vendas
 */
export function getTicketsBySale(saleId) {
    // This function is also now directly handled by the Supabase client in vendas.js.
    console.warn("`getTicketsBySale` function in utils.js is deprecated. Use `getTicketsBySale` in vendas.js instead.");
    throw new Error("Deprecated function call: getTicketsBySale in utils.js");
}

/**
 * @function updateTicketStatus
 * @description Atualiza o status de um ticket.
 * @param {string} ticketId - ID do ticket.
 * @param {string} newStatus - Novo status do ticket.
 * @returns {boolean} True se atualizado com sucesso.
 * @usedBy Funções de check-in e gestão
 */
export function updateTicketStatus(ticketId, newStatus) {
    // This function is also now directly handled by the Supabase client in checkin.js.
    console.warn("`updateTicketStatus` function in utils.js is deprecated. Logic is in checkin.js now.");
    throw new Error("Deprecated function call: updateTicketStatus in utils.js");
}

// ==============================================
// FUNÇÕES DE FEEDBACK VISUAL E MENSAGENS
// ==============================================

/**
 * @function showLoading
 * @description Exibe o overlay de carregamento.
 * @returns {void}
 * @usedBy `checkin.js`, `eventos.js`, `vendas.js`, `users.js`, `courtesias.js`
 */
export function showLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.add('show');
    }
}

/**
 * @function hideLoading
 * @description Esconde o overlay de carregamento.
 * @returns {void}
 * @usedBy `checkin.js`, `eventos.js`, `vendas.js`, `users.js`, `courtesias.js`
 */
export function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.remove('show');
    }
}

/**
 * @function showMessage
 * @description Exibe uma mensagem de feedback (sucesso ou erro) ao usuário.
 * A mensagem desaparece automaticamente após 3 segundos.
 * Suporta HTML no texto da mensagem para quebras de linha (<br>).
 * @param {'success' | 'error'} type - O tipo da mensagem ('success' ou 'error').
 * @param {string} text - O texto ou HTML a ser exibido na mensagem.
 * @returns {void}
 * @usedBy `app.js`, `checkin.js`, `eventos.js`, `vendas.js`, `users.js`, `logs.js`, `courtesias.js`
 */
export function showMessage(type, text) {
    const message = type === 'success' ? successMessage : errorMessage;
    if (!message) return;

    const messageP = message.querySelector('p');
    if (messageP) {
        messageP.innerHTML = text; // Usa innerHTML para permitir <br>
    }
    message.classList.add('show');
    setTimeout(() => message.classList.remove('show'), 4000); // Aumentado para 4 segundos
}

/**
 * @function showDetailedError
 * @description Exibe uma mensagem de erro mais detalhada ao usuário, baseada em um erro do sistema,
 * e registra o erro no banco de dados `error_logs`.
 * @param {string} baseMessage - A mensagem de erro geral.
 * @param {Error} error - O objeto de erro retornado pela operação.
 * @param {string} context - O módulo ou área do sistema onde o erro ocorreu (e.g., 'Login', 'Vendas', 'Check-in').
 * @returns {void}
 * @usedBy `checkin.js`, `eventos.js`, `vendas.js`, `users.js`, `logs.js`, `courtesias.js`
 */
export async function showDetailedError(baseMessage, error, context = 'Sistema') {
    let detailedMessage = baseMessage;
    let errorCode = 'GENERIC_APP_ERROR';

    if (error && error.message) {
        if (error.message.includes('duplicate')) {
            detailedMessage += ': JÁ EXISTE UM ITEM COM ESTE NOME/CÓDIGO';
            errorCode = 'DUPLICATE_ENTRY';
        } else if (error.message.includes('network') || error.message.includes('Failed to fetch')) {
            detailedMessage += ': PROBLEMA DE CONEXÃO';
            errorCode = 'NETWORK_ERROR';
        } else if (error.code) { // Supabase error code
            detailedMessage += `: ERRO DO SERVIDOR (${error.code})`;
            errorCode = `DB_ERROR_${error.code}`;
        } else {
            detailedMessage += ': ERRO INTERNO';
        }
    }
    
    // Display error message to the user
    showMessage('error', detailedMessage);

    // Log error to Supabase `error_logs` table
    try {
        const logEntry = {
            code: errorCode,
            message: baseMessage,
            cause: error ? error.message : 'Unknown error',
            solution: getSolutionForError(error),
            context: context,
            created_at: new Date().toISOString()
        };
        const { error: insertError } = await supabase.from('error_logs').insert([logEntry]);
        if (insertError) {
            console.error('Falha ao registrar log de erro no Supabase:', insertError.message);
        }
    } catch (e) {
        console.error('Falha crítica ao tentar registrar o log de erro:', e);
    }
}

/**
 * @function getSolutionForError
 * @description Gera uma solução sugerida com base na mensagem de erro.
 * @param {Error} error - O objeto de erro.
 * @returns {string} Uma string com a solução sugerida.
 * @usedBy `showDetailedError` (neste arquivo)
 */
function getSolutionForError(error) {
    if (!error || !error.message) {
        return "Causa desconhecida. Verifique o console do navegador para mais detalhes e, se possível, tente reproduzir o erro. Contate o suporte se o problema persistir.";
    }
    const msg = error.message.toLowerCase();
    
    if (msg.includes('duplicate') || msg.includes('unique constraint')) {
        return "Este erro indica uma tentativa de criar um item que já existe (ex: usuário com e-mail duplicado, nome de evento duplicado). Verifique os dados inseridos e tente novamente com informações únicas.";
    }
    if (msg.includes('network') || msg.includes('failed to fetch')) {
        return "Houve um problema de conexão com a internet ou o serviço do banco de dados está indisponível. Verifique sua conexão e tente novamente. Se o erro persistir, o serviço pode estar fora do ar.";
    }
    if (msg.includes('not found') || msg.includes('404')) {
        return "O sistema tentou acessar um recurso (dado ou elemento) que não foi encontrado. Isso pode acontecer se um item foi excluído mas ainda está sendo referenciado. Tente recarregar a página.";
    }
    if (msg.includes('permission denied') || msg.includes('401') || msg.includes('403')) {
        return "Permissão negada. Você pode não ter autorização para realizar esta operação. Se o problema persistir, contate o administrador do sistema.";
    }
    if (msg.includes('null value in column')) {
        const columnMatch = msg.match(/column "(.*?)"/);
        const column = columnMatch ? columnMatch[1] : 'algum campo obrigatório';
        return `Um campo obrigatório (${column.toUpperCase()}) não foi preenchido. Por favor, verifique todos os campos e tente novamente.`;
    }
    if (msg.includes('value too long')) {
        const columnMatch = msg.match(/column "(.*?)"/);
        const column = columnMatch ? columnMatch[1] : 'algum campo';
        return `O valor inserido para o campo ${column.toUpperCase()} é muito longo. Por favor, insira um valor menor.`;
    }
    if (error.code && error.code.startsWith('PGRST')) { // Supabase PostgREST error codes
        return `Ocorreu um erro ao interagir com o banco de dados. (Código: ${error.code}). Por favor, verifique se os dados estão corretos e tente novamente. Se o problema persistir, contate o suporte.`;
    }
    return "Causa não identificada. Tente recarregar a aplicação. Se o erro persistir, verifique o console do navegador (F12) para mais detalhes técnicos e, se possível, reporte o problema.";
}

/**
 * @function showListSkeleton
 * @description Exibe um skeleton de carregamento em um contêiner de lista.
 * Melhora a percepção de performance enquanto os dados estão sendo buscados.
 * @param {string} containerId - O ID do elemento contêiner onde o skeleton será exibido.
 * @returns {void}
 * @usedBy `checkin.js`, `eventos.js`, `vendas.js`, `users.js`, `courtesias.js`
 */
export function showListSkeleton(containerId) {
    const container = document.getElementById(containerId);
    if(container) {
        container.innerHTML = `
            <div class="skeleton skeleton-item"></div>
            <div class="skeleton skeleton-item"></div>
            <div class="skeleton skeleton-item"></div>
            <div style="text-align:center;color:#999;font-size:15px;padding:20px 0;">Carregando dados...</div>`;
    }
}

/**
 * @function hideListSkeleton
 * @description Remove o skeleton de carregamento de um contêiner de lista.
 * @param {string} containerId - O ID do elemento contêiner de onde o skeleton será removido.
 * @returns {void}
 * @usedBy `checkin.js`, `vendas.js`, `users.js`, `courtesias.js`
 */
export function hideListSkeleton(containerId) {
    const container = document.getElementById(containerId);
    if(container) {
        container.innerHTML = ''; // Limpa o conteúdo do contêiner.
    }
}

// ==============================================
// FUNÇÕES DE PAGINAÇÃO
// ==============================================

/**
 * @function renderPaginatedList
 * @description Renderiza uma lista de itens com paginação.
 * @param {string} type - O tipo da lista (ex: 'sales', 'courtesies', 'history', 'users'). Usado para IDs de paginação.
 * @param {Array<object>} items - O array de objetos a serem renderizados.
 * @param {Function} renderFunction - A função que recebe um item e retorna seu elemento DOM.
 * @returns {void}
 * @usedBy `checkin.js`, `vendas.js`, `users.js`, `courtesias.js`
 */
export function renderPaginatedList(type, items, renderFunction) {
    const container = document.getElementById(`${type}-list`);
    if (!container) return;

    // Remove qualquer paginação existente para evitar duplicatas.
    const existingPagination = document.getElementById(`${type}-pagination`);
    if(existingPagination) existingPagination.remove();

    const page = state.currentPage[type]; // Obtém a página atual para este tipo de lista.
    const startIndex = (page - 1) * state.itemsPerPage;
    const endIndex = startIndex + state.itemsPerPage;
    const paginatedItems = items.slice(startIndex, endIndex); // Extrai os itens da página atual.

    hideListSkeleton(`${type}-list`); // Remove o skeleton após os dados serem processados.
    container.innerHTML = ''; // Limpa o conteúdo existente do contêiner.

    if (paginatedItems.length === 0) {
        container.innerHTML = '<p class="empty-list-msg">Nenhum item encontrado.</p>';
        return;
    }
    // Adiciona cada item renderizado ao contêiner.
    paginatedItems.forEach(item => container.appendChild(renderFunction(item)));

    // Se houver mais itens do que o `itemsPerPage`, cria e exibe os controles de paginação.
    if (items.length > state.itemsPerPage) {
        const paginationHtml = createPaginationControls(type, items.length, page);
        container.insertAdjacentHTML('afterend', paginationHtml); // Insere os controles após a lista.
        setupPaginationListeners(type, items, renderFunction); // Configura os listeners dos botões de paginação.
    }
}

/**
 * @function createPaginationControls
 * @description Cria a estrutura HTML para os controles de paginação.
 * @param {string} type - O tipo da lista.
 * @param {number} totalItems - O número total de itens na lista.
 * @param {number} currentPageNum - O número da página atual.
 * @returns {string} O HTML dos controles de paginação.
 * @usedBy `renderPaginatedList`
 */
function createPaginationControls(type, totalItems, currentPageNum) {
    const totalPages = Math.ceil(totalItems / state.itemsPerPage);
    if (totalPages <= 1) return '';
    return `
        <div class="pagination" id="${type}-pagination">
            <button class="pagination-btn" data-page="1" ${currentPageNum === 1 ? 'disabled' : ''}><i class="fas fa-angle-double-left"></i></button>
            <button class="pagination-btn" data-page="${currentPageNum - 1}" ${currentPageNum === 1 ? 'disabled' : ''}><i class="fas fa-angle-left"></i></button>
            <span class="pagination-info">Página ${currentPageNum} de ${totalPages}</span>
            <button class="pagination-btn" data-page="${currentPageNum + 1}" ${currentPageNum === totalPages ? 'disabled' : ''}><i class="fas fa-angle-right"></i></button>
            <button class="pagination-btn" data-page="${totalPages}" ${currentPageNum === totalPages ? 'disabled' : ''}><i class="fas fa-angle-double-right"></i></button>
        </div>
    `;
}

/**
 * @function setupPaginationListeners
 * @description Configura os event listeners para os botões de paginação.
 * @param {string} type - O tipo da lista.
 * @param {Array<object>} items - O array de objetos completo.
 * @param {Function} renderFunction - A função de renderização de item.
 * @returns {void}
 * @usedBy `renderPaginatedList`
 */
function setupPaginationListeners(type, items, renderFunction) {
    const paginationContainer = document.getElementById(`${type}-pagination`);
    if (!paginationContainer) return;
    paginationContainer.querySelectorAll('.pagination-btn').forEach(button => {
        button.addEventListener('click', () => {
            const page = parseInt(button.dataset.page);
            if (page && page !== state.currentPage[type]) {
                state.currentPage[type] = page;
                renderPaginatedList(type, items, renderFunction);
                // Rola para o topo da lista após a paginação
                const listContainer = document.getElementById(`${type}-list`);
                if (listContainer) listContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// ==============================================
// FUNÇÕES DE MODAL DE CONFIRMAÇÃO E ERROS DE FORMULÁRIO
// ==============================================

/**
 * @function confirmDelete
 * @description Exibe um modal de confirmação para operações de exclusão.
 * @param {'sale' | 'courtesy' | 'event' | 'user' | 'logs'} type - O tipo de item a ser excluído.
 * @param {string} id - O ID do item a ser excluído. Pode ser nulo para `logs` se for limpar tudo.
 * @param {Function} deleteFunction - A função a ser chamada se o usuário confirmar a exclusão.
 * @returns {void}
 * @usedBy `eventos.js`, `vendas.js`, `users.js`, `logs.js`, `courtesias.js`
 */
export function confirmDelete(type, id, deleteFunction) {
    const modal = document.getElementById('confirm-modal');
    const text = document.getElementById('confirm-modal-text');
    const confirmYesBtn = document.getElementById('confirm-modal-yes');
    const confirmNoBtn = document.getElementById('confirm-modal-no');

    if (!modal || !text || !confirmYesBtn || !confirmNoBtn) return;

    let message = '';
    if (type === 'sale') message = 'TEM CERTEZA QUE DESEJA EXCLUIR ESTA VENDA?';
    else if (type === 'courtesy') message = 'TEM CERTEZA QUE DESEJA EXCLUIR ESTA CORTESIA?';
    else if (type === 'event') message = 'TEM CERTEZA QUE DESEJA EXCLUIR ESTE EVENTO E TODOS OS SEUS DADOS?';
    else if (type === 'user') message = 'TEM CERTEZA QUE DESEJA EXCLUIR ESTE USUÁRIO?';
    else if (type === 'logs') message = 'TEM CERTEZA QUE DESEJA LIMPAR TODOS OS LOGS DE ERRO DO SISTEMA? ESTA AÇÃO NÃO PODE SER DESFEITA.';
    text.textContent = message;
    modal.style.display = 'block';

    confirmYesBtn.onclick = () => {
        modal.style.display = 'none';
        deleteFunction(id);
    };
    confirmNoBtn.onclick = () => {
        modal.style.display = 'none';
    };
}

/**
 * @function showFieldError
 * @description Exibe uma mensagem de erro abaixo de um campo de formulário específico.
 * Adiciona a classe 'error' ao grupo do formulário para estilização visual.
 * @param {HTMLElement} field - O elemento input do campo com erro.
 * @param {string} message - A mensagem de erro a ser exibida.
 * @returns {void}
 * @usedBy `eventos.js`, `users.js`, `vendas.js`
 */
export function showFieldError(field, message) {
    const formGroup = field.closest('.form-group');
    if (!formGroup) return;
    formGroup.classList.add('error');
    let errorElement = formGroup.querySelector('.error-message');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        formGroup.appendChild(errorElement);
    }
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

/**
 * @function clearFormErrors
 * @description Limpa todas as mensagens de erro e estilos de erro de um formulário.
 * @param {HTMLElement} formElement - O elemento <form> a ser limpo.
 * @returns {void}
 * @usedBy `eventos.js`, `users.js`, `vendas.js`
 */
export function clearFormErrors(formElement) {
    if (!formElement) return;
    formElement.querySelectorAll('.form-group.error').forEach(group => {
        group.classList.remove('error');
        const errorMessage = group.querySelector('.error-message');
        if (errorMessage) errorMessage.style.display = 'none';
    });
}

// ==============================================
// FUNÇÕES GERAIS DE UTILIDADE
// ==============================================

/**
 * @function capitalizeWords
 * @description Capitaliza a primeira letra de cada palavra de um nome.
 * @param {string} name - O nome a ser capitalizado.
 * @returns {string} O nome capitalizado.
 * @usedBy Funções de formulário para nomes de participantes ou usuários
 */
export function capitalizeWords(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/(?:^|\s)\S/g, match => match.toUpperCase());
}

/**
 * @function normalizeText
 * @description Normaliza uma string para comparação (converte para maiúsculas, remove acentos e caracteres especiais).
 * Esta função é mantida para comparações internas, mas a capitalização para exibição é feita separadamente.
 * @param {string} text - A string a ser normalizada.
 * @returns {string} A string normalizada.
 * @usedBy `vendas.js`, `courtesias.js`
 */
export function normalizeText(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}