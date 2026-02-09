// logs.js
// Este módulo gerencia o registro e a exibição de logs de erro do sistema.

// ==============================================
// IMPORTS DE MÓDULOS
// ==============================================
import { state, supabase } from './app.js';
import { confirmDelete, showMessage, showDetailedError, showListSkeleton, renderPaginatedList, showLoading, hideLoading } from './utils.js';

// ==============================================
// CONFIGURAÇÃO DE EVENT LISTENERS DO MÓDULO
// ==============================================

/**
 * @function setupLogHandlers
 * @description Configura os event listeners para a seção de logs.
 * @returns {void}
 * @usedBy `app.js` (setupEventListeners)
 */
export function setupLogHandlers() {
    // Adiciona listener ao corpo do documento para delegação de eventos.
    // Isso garante que o botão "Limpar Logs" funcione mesmo se for adicionado dinamicamente.
    document.body.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'clear-logs-btn') {
            confirmDelete('logs', null, clearAllLogs);
        }
    });
}

// ==============================================
// FUNÇÕES DE ATUALIZAÇÃO E RENDERIZAÇÃO DA UI
// ==============================================

/**
 * @function updateLogsScreen
 * @description Atualiza a tela de logs, buscando os dados do Supabase e renderizando-os.
 * @returns {Promise<void>}
 * @usedBy `app.js` (updateSettingsScreen)
 */
export async function updateLogsScreen() {
    const logsListContainer = document.getElementById('logs-list');
    if (!logsListContainer) return;

    showListSkeleton('logs-list'); // Show skeleton while loading

    try {
        const { data: logs, error } = await supabase
            .from('error_logs') // Alterado para a nova tabela 'error_logs'
            .select('*')
            .order('created_at', { ascending: false }); // Mais recentes primeiro
        
        if (error) {
            // Se a tabela não existir (ex: não rodou o script SQL), Supabase retorna um erro específico.
            // Erro PGRST106 ou similar para tabela não encontrada.
            if (error.code === '42P01' || error.message.includes('relation "public.error_logs" does not exist')) {
                 logsListContainer.innerHTML = '<p class="empty-list-msg">Tabela \'error_logs\' não encontrada. Crie a tabela no banco de dados para habilitar o registro e visualização de logs.</p>';
                 return;
            }
            throw error;
        }
        renderPaginatedList('logs', logs || [], renderLogItem); // Usando renderPaginatedList
    } catch (error) {
        console.error('Error fetching system logs:', error);
        showDetailedError('ERRO AO CARREGAR LOGS', error, 'Logs');
        logsListContainer.innerHTML = '<p class="empty-list-msg">Não foi possível carregar os logs.</p>';
    }
}

/**
 * @function renderLogItem
 * @description Cria o HTML para um único item de log.
 * @param {object} log - O objeto de log.
 * @returns {HTMLElement} O elemento <div> representando o item de log.
 * @usedBy `renderLogs` (via renderPaginatedList)
 */
function renderLogItem(log) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
        <div class="item-info">
            <h4>${log.message}</h4>
            <p><strong>CÓDIGO:</strong> ${log.code || 'N/A'}</p>
            <p><strong>CONTEXTO:</strong> ${log.context || 'N/A'}</p>
            <p><strong>OCORRÊNCIA:</strong> ${new Date(log.created_at).toLocaleString('pt-BR')}</p>
            <p style="margin-top: 8px;"><strong>CAUSA TÉCNICA:</strong> ${log.cause || 'N/A'}</p>
            <p style="margin-top: 4px;"><strong>INSTRUÇÃO:</strong> ${log.solution}</p>
        </div>
    `;
    return item;
}

/**
 * @function clearAllLogs
 * @description Exclui todos os logs do Supabase.
 * @returns {Promise<void>}
 * @usedBy `setupLogHandlers` via `confirmDelete`
 */
async function clearAllLogs() {
    showLoading();
    try {
        const { error } = await supabase
            .from('error_logs') // Alterado para a nova tabela 'error_logs'
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows (dummy condition to delete all)
        
        if (error) throw error;

        // Reset pagination after clearing logs
        state.currentPage.logs = 1; 
        updateLogsScreen();
        showMessage('success', 'TODOS OS LOGS FORAM LIMPOS.');
    } catch (error) {
        console.error('Error clearing all logs:', error);
        showDetailedError('ERRO AO LIMPAR LOGS', error, 'Logs');
    } finally {
        hideLoading();
    }
}