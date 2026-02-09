// app.js
// Este é o arquivo principal da aplicação TicketFlow.
// Ele gerencia o estado global, inicializa o cliente Supabase (CDN), configura os event listeners globais,
// e coordena as interações entre os diferentes módulos (eventos, vendas, check-in, usuários, utilitários).

// ==============================================
// IMPORTS DE MÓDULOS
// ==============================================

// Importa a função createClient da biblioteca Supabase para inicializar o cliente.
import { createClient } from '@supabase/supabase-js'
// Importa funções específicas de outros módulos para configurar seus respectivos event listeners e atualizar suas UIs.
import { setupEventHandlers, loadActiveEvent, updateHistoryScreen } from './eventos.js'
import { setupSaleHandlers, updateRegisterSaleScreen, updateSalesManagementScreen } from './vendas.js'
import { setupCourtesyHandlers, updateCourtesiesScreen } from './courtesias.js';
import { setupCheckinHandlers, updateCheckInScreen } from './checkin.js'
import { setupUserHandlers, updateUsersScreen } from './users.js'
import { setupLogHandlers, updateLogsScreen } from './logs.js';
import { showMessage, showDetailedError, showLoading, hideLoading } from './utils.js'
// add missing import to fix getTicketsByEvent undefined
import { getTicketsByEvent } from './vendas.js';

// ==============================================
// INICIALIZAÇÃO DO CLIENTE SUPABASE COM AUTH
// ==============================================

const SUPABASE_URL = 'https://jrhgzviaebkhhaculpio.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyaGd6dmlhZWJraGhhY3VscGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMTA2MjUsImV4cCI6MjA2ODc4NjYyNX0.GXPwSCDLR4Ev4kag36wQD-TyvTaZ8qaXHCekWd8u-tI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==============================================
// ESTADO GLOBAL DA APLICAÇÃO
// ==============================================

// Objeto de estado global da aplicação.
// Contém todas as variáveis que afetam a UI e o comportamento do aplicativo.
export let state = {
    currentTheme: 'indigo', // Tema de cor atual da aplicação (ex: 'indigo', 'emerald', 'red').
    activeEvent: null, // Objeto do evento ativo no momento (se houver).
    salesEnabled: true, // Booleano que controla se as vendas/cortesias estão ativas ou encerradas.
    pendingFlyerUrl: '', // URL temporária do flyer selecionado/enviado durante criação do evento
    allParticipants: [], // Lista de todos os participantes para o check-in.
    currentPage: {     // Controla a paginação para diferentes listas.
        sales: 1,      // Página atual da lista de vendas.
        courtesies: 1, // Página atual da lista de cortesias.
        history: 1,    // Página atual da lista de histórico de eventos.
        checkin: 1,    // Página atual da lista de check-in.
        users: 1,      // Página atual da lista de usuários.
        logs: 1        // Página atual da lista de logs.
    },
    itemsPerPage: 10, // Número de itens a serem exibidos por página nas listas paginadas.
    currentPdfData: null, // Dados temporários para a geração/pré-visualização de PDFs.
    searchFilters: {   // Filtros de busca aplicados em diferentes telas.
        checkin: '',   // Filtro de busca na tela de check-in.
        checkinLetter: '', // NOVO: Filtro de letra na tela de check-in.
        sales: ''      // Filtro de busca na tela de gestão de vendas.
    },
    currentSettingsTab: 'general-settings', // Aba ativa na tela de configurações.
    appLogoBase64: null, // Novo: para armazenar a logo em base64
    currentUser: null, // Will be populated by auth
    currentUserRole: null, // Will be populated by auth
    isAuthenticated: false,
    cachedSalesData: [], // NOVO: Cache de dados de vendas para performance
};

// ==============================================
// REFERÊNCIAS AO DOM - NOVA TELA DE LOGIN
// ==============================================

const loginScreen = document.createElement('div');
loginScreen.className = 'screen login-screen';
loginScreen.innerHTML = `
    <header class="auth-header">
        <div class="logo-container">
            <img id="login-header-logo" alt="TicketFlow Logo">
            <h1 id="login-header-title">TICKETFLOW</h1>
        </div>
    </header>
    <div class="auth-content-wrapper">
        <div class="container">
            <h2>ACESSO AO TICKETFLOW</h2>
            <form id="login-form">
                <div class="form-group">
                    <label for="login-email">E-MAIL</label>
                    <input type="email" id="login-email" placeholder="seu@email.com" required="">
                </div>
                <div class="form-group">
                    <label for="login-password">SENHA</label>
                    <input type="password" id="login-password" placeholder="••••••••" required="">
                </div>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-sign-in-alt"></i> ENTRAR
                </button>
            </form>
            <div class="login-footer">
                <p>Não tem conta? <button id="show-register-btn" class="link-btn">Cadastre-se</button></p>
            </div>
        </div>
    </div>
`;

const registerScreen = document.createElement('div');
registerScreen.className = 'screen register-screen';
registerScreen.innerHTML = `
    <header class="auth-header">
        <div class="logo-container">
            <img id="register-header-logo" alt="TicketFlow Logo">
            <h1 id="register-header-title">TICKETFLOW</h1>
        </div>
    </header>
    <div class="auth-content-wrapper">
        <div class="container">
            <h2>CRIAR CONTA</h2>
            <form id="register-form">
                <div class="form-group">
                    <label for="register-email">E-MAIL</label>
                    <input type="email" id="register-email" placeholder="seu@email.com" required="">
                </div>
                <div class="form-group">
                    <label for="register-username">NOME DE USUÁRIO</label>
                    <input type="text" id="register-username" placeholder="Nome de usuário" required="">
                </div>
                <div class="form-group">
                    <label for="register-password">SENHA</label>
                    <input type="password" id="register-password" placeholder="••••••••" required="" minlength="6">
                </div>
                <div class="form-group">
                    <label for="register-role">NÍVEL DE ACESSO</label>
                    <select id="register-role" required="">
                        <option value="check">Check-in</option>
                        <option value="manager">Gerente</option>
                        <option value="admin">Administrador</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-user-plus"></i> CADASTRAR
                </button>
            </form>
            <div class="login-footer">
                <p>Já tem conta? <button id="show-login-btn" class="link-btn">Fazer Login</button></p>
            </div>
        </div>
    </div>
`;

// ==============================================
// REFERÊNCIAS AO DOM - NOVA TELA DE LOADING INICIAL
// ==============================================

const initialLoadingScreen = document.createElement('div');
initialLoadingScreen.className = 'initial-loading-screen';
initialLoadingScreen.innerHTML = `
    <div class="initial-loading-content">
        <img class="initial-loading-logo" alt="TicketFlow Logo">
        <h1 class="initial-loading-title">TICKETFLOW</h1>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <div class="progress-text">Inicializando sistema...</div>
        </div>
    </div>
`;

// ==============================================
// REFERÊNCIAS AO DOM ORIGINAIS
// ==============================================

// Referências aos elementos DOM principais.
const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-btn');
const hamburgerBtn = document.getElementById('hamburger-btn');
const mainNav = document.getElementById('main-nav');
const navOverlay = document.getElementById('nav-overlay');
const appLogo = document.getElementById('app-logo');
const appTitle = document.getElementById('app-title');
const removeLogoBtn = document.getElementById('remove-logo');
const salesEnabledToggle = document.getElementById('sales-enabled-toggle'); // Movido para o escopo global
const settingsTabButtons = document.querySelectorAll('.tabs-nav .tab-btn'); // Novos botões de aba
const settingsTabPanels = document.querySelectorAll('.tab-panel'); // Novos painéis de aba

// NOVO: Referências para o input de URL da logo
const logoUrlInput = document.getElementById('logo-url-input');
const applyLogoUrlBtn = document.getElementById('apply-logo-url-btn');

// ==============================================
// FUNÇÕES DE AUTENTICAÇÃO
// ==============================================

/**
 * @function checkAuthState
 * @description Verifica o estado de autenticação do usuário
 * @returns {Promise<void>}
 */
async function checkAuthState() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        state.currentUser = session.user;
        await loadUserProfile(session.user.id);
        state.isAuthenticated = true;
        showMainApp();
    } else {
        state.isAuthenticated = false;
        showLoginScreen();
    }
}

/**
 * @function loadUserProfile
 * @description Carrega o perfil do usuário do banco de dados
 * @param {string} userId - ID do usuário
 * @returns {Promise<void>}
 */
async function loadUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('username, role')
            .eq('id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 means "No rows found"
            throw error;
        }

        if (data) {
            state.currentUserRole = data.role;
        } else {
            console.warn(`Profile for user ${userId} not found in public.users. Attempting to create a default profile.`);
            // Create user profile if doesn't exist
            const { data: authUser, error: authUserError } = await supabase.auth.getUser();
            if (authUserError) {
                 console.error('Error fetching auth user in loadUserProfile fallback:', authUserError);
                 state.currentUserRole = 'check'; // Fallback role on error
                 return;
            }
            if (authUser.data?.user) {
                const { error: insertError } = await supabase
                    .from('users')
                    .insert([{
                        id: authUser.data.user.id, // Garante que public.users.id corresponde a auth.users.id
                        email: authUser.data.user.email,
                        username: authUser.data.user.email.split('@')[0],
                        role: 'check' // Role padrão para perfil autocriado
                    }]);
                if (insertError) {
                    console.error('Error creating default user profile:', insertError);
                    throw insertError; // Propaga o erro para o catch externo
                }
                state.currentUserRole = 'check';
                console.log(`Default profile created for user ${authUser.data.user.id} with role 'check'.`);
            } else {
                console.warn('Authenticated user session exists, but no user data found from auth.getUser() during profile creation fallback. Cannot create profile.');
                state.currentUserRole = 'check'; // Fallback to default role
            }
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        state.currentUserRole = 'check'; // Fallback role on error
    }
}

/**
 * @function handleLogin
 * @description Processa o login do usuário
 * @param {Event} e - Evento de formulário
 * @returns {Promise<void>}
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.toLowerCase();
    const password = document.getElementById('login-password').value;

    showLoading();
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;
        if (!data || !data.user) {
            throw new Error('No user data returned from login.');
        }

        state.currentUser = data.user;
        state.isAuthenticated = true;
        
        console.log("Usuário logado:", state.currentUser);
        showMessage('success', 'Login realizado com sucesso!');
        
        hideLoading();
        
        // Exibe tela de loading e carrega dados
        showInitialLoadingScreen();
        await loadInitialData();
        
        // Esconde tela de loading e mostra app principal
        await hideInitialLoadingScreen();
        showMainApp();
        updateUI();
        navigateToScreen('create-event');
        setupEventListeners();
        
    } catch (error) {
        hideLoading();
        showMessage('error', 'Erro no login: ' + error.message);
    }
}

/**
 * @function handleRegister
 * @description Processa o registro de novo usuário
 * @param {Event} e - Evento de formulário
 * @returns {Promise<void>}
 */
async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('register-email').value.toLowerCase();
    const password = document.getElementById('register-password').value;
    const username = document.getElementById('register-username').value;
    const role = document.getElementById('register-role').value;

    showLoading();
    try {
        // Create auth user
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (error || !data || !data.user) {
            throw error || new Error('No user data returned from signup.');
        }

        // Create user profile
        const { error: profileError } = await supabase
            .from('users')
            .insert([{
                id: data.user.id,
                email: email,
                username: username,
                role: role
            }]);

        if (profileError) throw profileError;

        hideLoading();
        showMessage('success', 'Conta criada com sucesso! Faça login para continuar.');
        showLoginScreen();
    } catch (error) {
        hideLoading();
        showMessage('error', 'Erro no cadastro: ' + error.message);
    }
}

/**
 * @function handleLogout
 * @description Realiza o logout do usuário
 * @returns {Promise<void>}
 */
async function handleLogout() {
    showLoading();
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        state.currentUser = null;
        state.currentUserRole = null;
        state.isAuthenticated = false;
        
        showMessage('success', 'Logout realizado com sucesso!');
        showLoginScreen();
    } catch (error) {
        showMessage('error', 'Erro no logout: ' + error.message);
    } finally {
        hideLoading();
    }
}

// ==============================================
// FUNÇÕES DE EXIBIÇÃO DE TELAS
// ==============================================

// Helper to update auth screen headers
function updateAuthScreenHeader(logoElementId, titleElementId) {
    const logoEl = document.getElementById(logoElementId);
    const titleEl = document.getElementById(titleElementId);

    if (logoEl && titleEl) {
        if (state.appLogoBase64) {
            logoEl.src = state.appLogoBase64;
            logoEl.style.display = 'block';
            titleEl.style.display = 'none';
        } else {
            logoEl.src = '';
            logoEl.style.display = 'none';
            titleEl.style.display = 'block';
        }
    }
}

/**
 * @function showLoginScreen
 * @description Exibe a tela de login
 * @returns {void}
 */
function showLoginScreen() {
    document.getElementById('app').style.display = 'none';
    loginScreen.style.display = 'flex'; // Use flex for centering header and content
    registerScreen.style.display = 'none';
    
    // Adiciona ao DOM se necessário
    if (!document.body.contains(loginScreen)) {
        document.body.appendChild(loginScreen);
    }
    if (document.body.contains(registerScreen)) {
        document.body.removeChild(registerScreen);
    }
    updateAuthScreenHeader('login-header-logo', 'login-header-title');
}

/**
 * @function showRegisterScreen
 * @description Exibe a tela de registro
 * @returns {void}
 */
function showRegisterScreen() {
    document.getElementById('app').style.display = 'none';
    loginScreen.style.display = 'none';
    registerScreen.style.display = 'flex'; // Use flex for centering header and content
    
    if (!document.body.contains(registerScreen)) {
        document.body.appendChild(registerScreen);
    }
    updateAuthScreenHeader('register-header-logo', 'register-header-title');
}

/**
 * @function showMainApp
 * @description Exibe a aplicação principal
 * @returns {void}
 */
function showMainApp() {
    loginScreen.style.display = 'none';
    registerScreen.style.display = 'none';
    document.getElementById('app').style.display = 'block';
}

// ==============================================
// FUNÇÕES DE CARREGAMENTO INICIAL DE DADOS
// ==============================================

/**
 * @function showInitialLoadingScreen
 * @description Exibe a tela de carregamento inicial
 * @returns {void}
 */
function showInitialLoadingScreen() {
    if (!document.body.contains(initialLoadingScreen)) {
        document.body.appendChild(initialLoadingScreen);
    }
    
    // Atualiza logo na tela de loading
    const loadingLogo = initialLoadingScreen.querySelector('.initial-loading-logo');
    const loadingTitle = initialLoadingScreen.querySelector('.initial-loading-title');
    
    if (state.appLogoBase64) {
        loadingLogo.src = state.appLogoBase64;
        loadingLogo.style.display = 'block';
        loadingTitle.style.display = 'none';
    } else {
        loadingLogo.style.display = 'none';
        loadingTitle.style.display = 'block';
    }
    
    initialLoadingScreen.style.display = 'flex';
}

/**
 * @function hideInitialLoadingScreen
 * @description Esconde a tela de carregamento inicial com animação
 * @returns {Promise<void>}
 */
function hideInitialLoadingScreen() {
    return new Promise((resolve) => {
        initialLoadingScreen.classList.add('fade-out');
        setTimeout(() => {
            initialLoadingScreen.style.display = 'none';
            initialLoadingScreen.classList.remove('fade-out');
            if (document.body.contains(initialLoadingScreen)) {
                document.body.removeChild(initialLoadingScreen);
            }
            resolve();
        }, 800);
    });
}

/**
 * @function updateLoadingProgress
 * @description Atualiza a barra de progresso e texto
 * @param {number} percentage - Percentual de 0 a 100
 * @param {string} text - Texto a ser exibido
 * @returns {void}
 */
function updateLoadingProgress(percentage, text) {
    const progressFill = initialLoadingScreen.querySelector('.progress-fill');
    const progressText = initialLoadingScreen.querySelector('.progress-text');
    
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
    if (progressText) {
        progressText.textContent = text;
    }
}

/**
 * @function loadInitialData
 * @description Carrega todos os dados necessários do banco de forma organizada
 * @returns {Promise<void>}
 */
async function loadInitialData() {
    try {
        updateLoadingProgress(10, 'Carregando configurações...');
        loadSettings();
        setTheme(state.currentTheme);
        loadLogo();
        
        updateLoadingProgress(30, 'Carregando perfil do usuário...');
        if (state.currentUser) {
            await loadUserProfile(state.currentUser.id);
        }
        
        updateLoadingProgress(50, 'Buscando evento publicado...');
        state.activeEvent = await loadActiveEvent();
        if (state.activeEvent) {
            // Cache published event and populate create-event form to avoid duplicates
            localStorage.setItem('ticketflow-active-event', JSON.stringify(state.activeEvent));
            try {
                const ev = state.activeEvent;
                // Fill create-event form fields
                const nameEl = document.getElementById('event-name');
                const locationEl = document.getElementById('event-location');
                const dateEl = document.getElementById('event-date');
                const timeEl = document.getElementById('event-time');
                const priceEl = document.getElementById('ticket-price');
                const hiddenFlyerEl = document.getElementById('event-flyer-url');
                const flyerPreviewImg = document.getElementById('flyer-preview-img');
                const flyerPreview = document.getElementById('flyer-preview');
                if (nameEl) nameEl.value = ev.name || '';
                if (locationEl) locationEl.value = ev.location || '';
                if (dateEl) dateEl.value = ev.event_date || '';
                if (timeEl) timeEl.value = ev.event_time || '';
                if (priceEl) priceEl.value = (ev.ticket_price !== undefined && ev.ticket_price !== null) ? String(ev.ticket_price).replace('.', ',') : '';
                if (hiddenFlyerEl) hiddenFlyerEl.value = ev.flyer_image_url || '';
                state.pendingFlyerUrl = ev.flyer_image_url || '';
                if (flyerPreviewImg && state.pendingFlyerUrl) {
                    flyerPreviewImg.src = state.pendingFlyerUrl;
                    if (flyerPreview) flyerPreview.style.display = 'block';
                }
                // Disable create/publish action to prevent accidental duplicate creation
                const publishBtn = document.getElementById('create-publish-event-btn');
                if (publishBtn) {
                    publishBtn.disabled = true;
                    publishBtn.title = 'Um evento já está publicado. Finalize ou recupere antes de publicar outro.';
                }
            } catch (err) {
                console.warn('Erro ao popular formulário com evento publicado:', err);
            }
        } else {
            // Clear any stale localStorage data if none published
            localStorage.removeItem('ticketflow-active-event');
        }
        
        updateLoadingProgress(70, 'Carregando dados de vendas...');
        // Pre-load sales data if there's an active/published event
        if (state.activeEvent) {
            try {
                const { data: sales } = await supabase
                    .from('sales')
                    .select('*, tickets(id, ticket_code, buyer_name, created_at, status)')
                    .eq('event_id', state.activeEvent.id)
                    .order('created_at', { ascending: false });
                
                // Store sales data in state for quick access
                state.cachedSalesData = sales || [];
            } catch (error) {
                console.warn('Error pre-loading sales data:', error);
                state.cachedSalesData = [];
            }
        }
        
        updateLoadingProgress(85, 'Carregando participantes...');
        // Pre-load participants data if there's an active/published event
        if (state.activeEvent) {
            try {
                const eventTickets = await getTicketsByEvent(state.activeEvent.id);
                state.allParticipants = [];

                eventTickets.forEach(ticket => {
                    state.allParticipants.push({
                        name: ticket.buyer_name,
                        type: ticket.ticket_type === 'normal' ? 'Venda' : 'Cortesia',
                        id: ticket.id,
                        acquisition_id: ticket.sale_id,
                        ticketCode: ticket.ticket_code,
                        checked_in: ticket.status === 'used'
                    });
                });

                state.allParticipants.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
            } catch (error) {
                console.warn('Error pre-loading participants data:', error);
                state.allParticipants = [];
            }
        }
        
        updateLoadingProgress(100, 'Finalizando...');
        
        // Small delay to show completion
        await new Promise(resolve => setTimeout(resolve, 500));
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        showDetailedError('ERRO AO CARREGAR DADOS INICIAIS', error, 'Inicialização');
        updateLoadingProgress(100, 'Erro no carregamento');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// ==============================================
// FUNÇÕES DE CONFIGURAÇÃO E MANIPULAÇÃO DE EVENTOS GLOBAIS
// ==============================================

/**
 * @function setupEventListeners
 * @description Configura os event listeners globais para interações da UI.
 * Este é o ponto central onde os handlers de cada módulo são inicializados.
 * @returns {void}
 * @usedBy `initializeApp`
 */
function setupEventListeners() {
    // === NAVEGAÇÃO MOBILE (HAMBÚRGUER E OVERLAY) ===
    hamburgerBtn.addEventListener('click', toggleMobileNav)
    navOverlay.addEventListener('click', closeMobileNav)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mainNav.classList.contains('nav-open')) closeMobileNav()
    })
    // Fecha o menu mobile se a janela for redimensionada para desktop.
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && mainNav.classList.contains('nav-open')) closeMobileNav()
    })

    // === NAVEGAÇÃO LATERAL (BOTÕES DE TELA) ===
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => navigateToScreen(btn.dataset.screen))
    })

    // === CONFIGURAÇÕES GLOBAIS ===
    // Event listeners para o seletor de tema.
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.addEventListener('change', (e) => setTheme(e.target.value))
    })

    // Event listener para o toggle de "encerrar vendas" nas configurações.
    if (salesEnabledToggle) { // Ensure the element exists before adding listener
        salesEnabledToggle.addEventListener('change', (e) => {
            state.salesEnabled = !e.target.checked
            saveSettings()
            updateRegisterSaleScreen()
            updateCourtesiesScreen()
            showMessage('success', state.salesEnabled ? 'VENDAS ATIVAS!' : 'VENDAS ENCERRADAS!')
        })
    }

    // === GERENCIAMENTO DE LOGO ===
    if (applyLogoUrlBtn) applyLogoUrlBtn.addEventListener('click', handleApplyLogoUrl);
    removeLogoBtn.addEventListener('click', removeLogo)

    // === FECHAMENTO DE MODAIS (CLIQUE FORA) ===
    // Only allow closing a modal by clicking outside when the modal explicitly
    // includes the attribute data-outside-close="true". System windows (financials, etc.)
    // will NOT have this attribute and therefore must be closed using their close (X) button.
    window.addEventListener('click', (e) => {
        try {
            const target = e.target;
            if (target && target.classList && target.classList.contains('modal')) {
                // modal must explicitly opt-in to outside click closing
                if (target.dataset && target.dataset.outsideClose === 'true') {
                    target.style.display = 'none';
                }
            }
        } catch (err) {
            // swallow any unexpected errors to avoid breaking the app
            console.error('Modal outside-click handler error:', err);
        }
    })

    // === NAVEGAÇÃO DE ABAS DENTRO DE CONFIGURAÇÕES ===
    settingsTabButtons.forEach(btn => {
        btn.addEventListener('click', () => navigateToSettingsTab(btn.dataset.tab));
    });

    // === SETUP DE HANDLERS ESPECÍFICOS DE MÓDULOS ===
    setupEventHandlers(navigateToScreen, updateUI) // Passa `navigateToScreen` e `updateUI` para o módulo de eventos.
    setupSaleHandlers() // Passa `updateUI` para o módulo de vendas.
    setupCourtesyHandlers();
    setupCheckinHandlers()
    setupUserHandlers() // Configura handlers para a tela de usuários.
    setupLogHandlers(); // Configura handlers para a tela de logs.
}

/**
 * @function toggleMobileNav
 * @description Alterna a visibilidade do menu de navegação mobile e do overlay.
 * @returns {void}
 * @usedBy `setupEventListeners` (hamburger button click)
 */
function toggleMobileNav() {
    mainNav.classList.toggle('nav-open') // Adiciona/remove classe para abrir/fechar o menu.
    navOverlay.classList.toggle('show')  // Adiciona/remove classe para exibir/esconder o overlay.
    // Impede o scroll do corpo da página quando o menu mobile está aberto.
    document.body.style.overflow = mainNav.classList.contains('nav-open') ? 'hidden' : ''
}

/**
 * @function closeMobileNav
 * @description Fecha o menu de navegação mobile e o overlay.
 * @returns {void}
 * @usedBy `setupEventListeners` (overlay click, escape key, window resize), `navigateToScreen`
 */
function closeMobileNav() {
    mainNav.classList.remove('nav-open')
    navOverlay.classList.remove('show')
    document.body.style.overflow = '' // Restaura o scroll do corpo da página.
}

/**
 * @function setTheme
 * @description Define o tema de cores da aplicação.
 * @param {string} theme - O nome do tema a ser aplicado (ex: 'indigo', 'emerald').
 * @returns {void}
 * @usedBy `initializeApp`, `setupEventListeners` (theme radio buttons)
 */
function setTheme(theme) {
    state.currentTheme = theme
    // Define o atributo 'data-theme' no elemento <html>, que o CSS usa para aplicar as variáveis de cor.
    document.documentElement.setAttribute('data-theme', theme)
    saveSettings() // Salva o tema escolhido no localStorage.

    // Marca o rádio button do tema selecionado.
    const themeRadio = document.querySelector(`input[name="theme"][value="${theme}"]`)
    if (themeRadio) themeRadio.checked = true
}

/**
 * @function navigateToScreen
 * @description Navega para uma tela específica do aplicativo, com controle de acesso.
 * Atualiza as classes 'active' nos botões de navegação e nas telas.
 * @param {string} screenId - O ID da tela a ser exibida (ex: 'create-event', 'sales-management').
 * @returns {void}
 * @usedBy `setupEventListeners` (nav buttons), `eventos.js` (após criar/finalizar evento)
 */
export function navigateToScreen(screenId) {
    const role = state.currentUserRole;

    // Admins have unrestricted access to all screens
    if (role === 'admin') {
        // Update UI state and proceed normally without further role checks
        const screens = document.querySelectorAll('.screen');
        const navButtons = document.querySelectorAll('.nav-btn');
        screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
        navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screenId));
        closeMobileNav();
        window.scrollTo(0, 0);

        if (screenId === 'register-sale') updateRegisterSaleScreen()
        if (screenId === 'sales-management') updateSalesManagementScreen()
        if (screenId === 'courtesies') updateCourtesiesScreen()
        if (screenId === 'check-in') updateCheckInScreen()
        if (screenId === 'history') updateHistoryScreen()
        if (screenId === 'settings') updateSettingsScreen()
        return;
    }

    // Access control logic
    // NOTE: for the 'history' screen we allow navigation even if the active event
    // isn't loaded yet so the UI/tabs are available immediately; authorization
    // will be validated when data is actually loaded in updateHistoryScreen.
    let hasAccess = false;
    switch (screenId) {
        case 'check-in':
            hasAccess = true; // All roles can access check-in
            break;
        case 'settings':
            hasAccess = (role === 'admin');
            break;
        case 'create-event':
        case 'register-sale':
        case 'sales-management':
        case 'courtesies':
            hasAccess = (role === 'manager' || role === 'admin'); // Manager and Admin can access
            break;
        case 'history':
            // Allow immediate navigation to the history screen even if event data not loaded.
            // Detailed role/authorization checks will happen inside updateHistoryScreen after event load.
            hasAccess = true;
            break;
        default:
            hasAccess = false;
    }

    if (!hasAccess) {
        showMessage('error', `ACESSO NEGADO: VOCÊ NÃO TEM PERMISSÃO PARA ACESSAR "${screenId.toUpperCase()}".`);
        showDetailedError(`Attempted unauthorized access to screen: ${screenId}`, new Error(`Role '${role}' does not have access.`), 'Acesso');
        closeMobileNav();
        return; // Prevent navigation
    }

    // Atualiza a classe 'active' nos botões de navegação e nas telas.
    screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
    navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screenId));
    closeMobileNav() // Fecha o menu mobile após a navegação.
    window.scrollTo(0, 0) // Rola a página para o topo.

    // Chama funções de atualização específicas para cada tela ao navegar para elas,
    // garantindo que os dados sejam carregados/atualizados.
    if (screenId === 'register-sale') updateRegisterSaleScreen()
    if (screenId === 'sales-management') updateSalesManagementScreen()
    if (screenId === 'courtesies') updateCourtesiesScreen()
    if (screenId === 'check-in') updateCheckInScreen()
    if (screenId === 'history') updateHistoryScreen()
    if (screenId === 'settings') updateSettingsScreen()
}

/**
 * @function navigateToSettingsTab
 * @description Navega para uma aba específica dentro da tela de configurações.
 * Atualiza as classes 'active' nos botões de aba e nos painéis de conteúdo.
 * @param {string} tabId - O ID da aba a ser exibida (ex: 'general-settings', 'user-management').
 * @returns {void}
 * @usedBy `setupEventListeners` (settings tab buttons)
 */
function navigateToSettingsTab(tabId) {
    // Access control for settings tabs
    const role = state.currentUserRole;

    // Admins have unrestricted access to all settings tabs
    if (role === 'admin') {
        state.currentSettingsTab = tabId; // Update state immediately
        saveSettings();
        settingsTabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        settingsTabPanels.forEach(panel => panel.classList.toggle('active', panel.id === tabId));
        if (tabId === 'user-management') updateUsersScreen();
        if (tabId === 'system-logs') updateLogsScreen();
        return;
    }

    let hasAccess = false;

    if (tabId === 'general-settings') {
        hasAccess = (role === 'admin' || role === 'manager'); // General settings accessible to manager+
    } else if (tabId === 'user-management' || tabId === 'system-logs') {
        hasAccess = (role === 'admin'); // User management and logs only for admin
    }

    if (!hasAccess) {
        showMessage('error', `ACESSO NEGADO: VOCÊ NÃO TEM PERMISSÃO PARA ACESSAR ESTA SEÇÃO DE CONFIGURAÇÕES.`);
        showDetailedError(`Attempted unauthorized access to settings tab: ${tabId}`, new Error(`Role '${role}' does not have access.`), 'Acesso');
        // Revert to previously active accessible tab or default
        navigateToSettingsTab(state.currentSettingsTab); // Try to navigate back
        return;
    }

    state.currentSettingsTab = tabId; // Atualiza o estado da aba ativa
    saveSettings(); // Salva a aba ativa no localStorage

    settingsTabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    settingsTabPanels.forEach(panel => panel.classList.toggle('active', panel.id === tabId));

    // Chama funções de atualização específicas para cada aba ao navegar para elas,
    // garantindo que os dados sejam carregados/atualizados apenas quando necessário.
    if (tabId === 'user-management') updateUsersScreen();
    if (tabId === 'system-logs') updateLogsScreen();
    // 'general-settings' não precisa de uma atualização específica além da carga inicial
}

/**
 * @function updateUI
 * @description Atualiza todos os componentes da interface do usuário que dependem do estado global.
 * Esta função é frequentemente chamada após alterações no `state.activeEvent` ou outras mudanças globais.
 * @returns {void}
 * @usedBy `initializeApp`, `eventos.js` (após criar/finalizar evento, editar preço, salvar relatório), `vendas.js` (após registrar venda/cortesia)
 */
export function updateUI() {
    const hasActiveEvent = state.activeEvent !== null
    const activeEventDiv = document.getElementById('active-event')
    const finalizeBtn = document.getElementById('finalize-event')

    // Exibe ou esconde o bloco de evento ativo e habilita/desabilita o botão "Finalizar Evento".
    if (hasActiveEvent) {
        activeEventDiv.style.display = 'block'
        document.getElementById('active-event-name').textContent = state.activeEvent.name
        // Atualiza para exibir o local do evento
        document.getElementById('active-event-location').textContent = state.activeEvent.location
        // Combina data e hora para exibição
        document.getElementById('active-event-date-time').textContent = 
            `${new Date(state.activeEvent.event_date).toLocaleDateString('pt-BR')} às ${state.activeEvent.event_time}`
        document.getElementById('active-event-price').textContent = parseFloat(state.activeEvent.ticket_price).toFixed(2).replace('.', ',')
        finalizeBtn.disabled = false
    } else {
        activeEventDiv.style.display = 'none'
        finalizeBtn.disabled = true
    }

    // Chama as funções de atualização para cada tela para garantir que estejam sincronizadas com o estado.
    updateRegisterSaleScreen()
    updateSalesManagementScreen()
    updateCourtesiesScreen()
    updateCheckInScreen()
    // A atualização de users e logs agora é feita apenas quando a aba correspondente é ativada
}

/**
 * @function updateSettingsScreen
 * @description Atualiza os elementos da UI na tela de configurações com base no `state`.
 * Garante que a aba correta seja exibida e os controles de configurações sejam atualizados.
 * @returns {void}
 * @usedBy `navigateToScreen` (ao navegar para 'settings')
 */
function updateSettingsScreen() {
    // Marca o tema selecionado no rádio button.
    const themeRadio = document.querySelector(`input[name="theme"][value="${state.currentTheme}"]`)
    if (themeRadio) themeRadio.checked = true
    // Define o estado do toggle "Encerrar Vendas".
    // Se state.salesEnabled é true (vendas ativas), o toggle deve estar unchecked (DESLIGADO).
    // Se state.salesEnabled é false (vendas encerradas), o toggle deve estar checked (LIGADO).
    if (salesEnabledToggle) salesEnabledToggle.checked = !state.salesEnabled

    // Garante que a aba correta esteja ativa
    navigateToSettingsTab(state.currentSettingsTab);

    // Disable access to user management and logs if not admin
    const userManagementTabBtn = document.querySelector('.tabs-nav .tab-btn[data-tab="user-management"]');
    const systemLogsTabBtn = document.querySelector('.tabs-nav .tab-btn[data-tab="system-logs"]');

    if (userManagementTabBtn) {
        userManagementTabBtn.style.display = (state.currentUserRole === 'admin') ? 'flex' : 'none';
    }
    if (systemLogsTabBtn) {
        systemLogsTabBtn.style.display = (state.currentUserRole === 'admin') ? 'flex' : 'none';
    }
}

// ==============================================
// GERENCIAMENTO DE CONFIGURAÇÕES (LOCALSTORAGE)
// ==============================================

/**
 * @function saveSettings
 * @description Salva as configurações atuais do aplicativo no Local Storage do navegador.
 * @returns {void}
 * @usedBy `setTheme`, `setupEventListeners` (uppercase toggle, sales enabled toggle)
 */
function saveSettings() {
    const settings = {
        theme: state.currentTheme,
        salesEnabled: state.salesEnabled,
        currentSettingsTab: state.currentSettingsTab
    }
    localStorage.setItem('ticketflow-settings', JSON.stringify(settings))
}

/**
 * @function loadSettings
 * @description Carrega as configurações do aplicativo do Local Storage.
 * Se não houver configurações salvas, define valores padrão.
 * @returns {void}
 * @usedBy `initializeApp`
 */
function loadSettings() {
    const saved = localStorage.getItem('ticketflow-settings')
    if (saved) {
        const settings = JSON.parse(saved)
        state.currentTheme = settings.theme || 'indigo'
        state.salesEnabled = settings.salesEnabled !== undefined ? settings.salesEnabled : false
        state.currentSettingsTab = settings.currentSettingsTab || 'general-settings';
    }
}

// ==============================================
// GERENCIAMENTO DA LOGO DO APLICATIVO
// ==============================================

/**
 * @function handleApplyLogoUrl
 * @description Lida com a entrada de uma URL de logo.
 * Valida a URL e a salva no Local Storage.
 * @returns {void}
 * @usedBy `setupEventListeners` (apply logo URL button)
 */
function handleApplyLogoUrl() {
    const logoUrl = logoUrlInput.value.trim();
    if (!logoUrl) {
        showMessage('error', 'POR FAVOR, INSIRA UMA URL PARA A LOGO.');
        return;
    }

    // Basic URL validation
    const urlPattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
    if (!urlPattern.test(logoUrl)) {
        showMessage('error', 'POR FAVOR, INSIRA UMA URL VÁLIDA (EX: HTTP://SEUSITE.COM/IMAGEM.PNG)');
        return;
    }
    
    localStorage.setItem('ticketflow-logo', logoUrl); // Salva a URL no Local Storage.
    state.appLogoBase64 = logoUrl; // Armazena no estado
    applyLogo(logoUrl); // Aplica o logo na UI.
    showMessage('success', 'LOGO ATUALIZADA!');
    // Also update the login/register headers if they are active
    updateAuthScreenHeader('login-header-logo', 'login-header-title');
    updateAuthScreenHeader('register-header-logo', 'register-header-title');
}

/**
 * @constant EXTERNAL_LOGO_URL
 * @description Public (non-signed) URL for the app logo in Supabase public bucket.
 * Use a public object path so failures in loading do not require signed URLs and won't block rendering.
 * Note: ensure the bucket/object is publicly readable in Supabase storage settings.
 */
const EXTERNAL_LOGO_URL = 'https://jrhgzviaebkhhaculpio.supabase.co/storage/v1/object/public/ticketflow/logo%20ticketflow2.png';

/**
 * @function loadLogo
 * @description Carrega o logo salvo do Local Storage e o aplica à UI.
 * Caso não exista uma logo customizada no localStorage, carrega a logo única externa.
 * @returns {void}
 * @usedBy `initializeApp`
 */
function loadLogo() {
    const savedLogo = localStorage.getItem('ticketflow-logo');
    if (savedLogo) {
        // savedLogo can now be a URL or a base64 string.
        state.appLogoBase64 = savedLogo;
        applyLogo(savedLogo);
    } else {
        // Use exclusive external Supabase URL as default (no local asset fallback)
        state.appLogoBase64 = EXTERNAL_LOGO_URL;
        applyLogo(EXTERNAL_LOGO_URL);
    }
}

/**
 * @function applyLogo
 * @description Aplica o logo na UI, escondendo o título do aplicativo.
 * Defende contra falha no carregamento da imagem exibindo o título como fallback.
 * @param {string} logoSource - A string Base64 do logo OU a URL do asset.
 * @returns {void}
 * @usedBy `handleApplyLogoUrl`, `loadLogo`
 */
function applyLogo(logoSource) {
    // Apply logo defensively: any image load error hides that <img> but never blocks UI or throws.
    try {
        // Main header logo
        if (appLogo) {
            appLogo.onload = () => {
                appLogo.style.display = 'block';
                if (appTitle) appTitle.style.display = 'none';
                if (removeLogoBtn) removeLogoBtn.style.display = 'inline-block';
            };
            appLogo.onerror = () => {
                // Hide image on error; keep title visible
                try { appLogo.style.display = 'none'; } catch (e) {}
                if (appTitle) appTitle.style.display = 'block';
                if (removeLogoBtn) removeLogoBtn.style.display = 'none';
            };
            // Only set src if a non-empty string provided
            if (logoSource) appLogo.src = logoSource;
        }

        // Login / Register header logos (if present) and initial loading logo
        const loginLogo = document.getElementById('login-header-logo');
        const registerLogo = document.getElementById('register-header-logo');
        const initialLoadingLogo = initialLoadingScreen.querySelector('.initial-loading-logo');

        [loginLogo, registerLogo, initialLoadingLogo].forEach(imgEl => {
            if (!imgEl) return;
            imgEl.onload = () => { imgEl.style.display = 'block'; };
            imgEl.onerror = () => { try { imgEl.style.display = 'none'; } catch (e) {} };
            if (logoSource) imgEl.src = logoSource;
        });

        // If no usable logo was set, ensure textual title remains visible
        if (!logoSource) {
            if (appLogo) appLogo.style.display = 'none';
            if (appTitle) appTitle.style.display = 'block';
            if (removeLogoBtn) removeLogoBtn.style.display = 'none';
        }
    } catch (e) {
        // Defensive: never throw from applyLogo; log only.
        console.warn('applyLogo non-fatal error:', e);
        if (appLogo) try { appLogo.style.display = 'none'; } catch {}
        if (appTitle) appTitle.style.display = 'block';
        if (removeLogoBtn) removeLogoBtn.style.display = 'none';
    }
}

/**
 * @function removeLogo
 * @description Remove o logo, restaura o título do aplicativo e limpa o Local Storage.
 * @returns {void}
 * @usedBy `setupEventListeners` (remove logo button)
 */
function removeLogo() {
    localStorage.removeItem('ticketflow-logo') // Remove o logo do Local Storage.
    state.appLogoBase64 = null; // Limpa do estado
    resetLogoDisplay() // Restaura o display para o título (que será então substituído pela logo padrão no reload, se não for uma limpeza total).
    if (logoUrlInput) logoUrlInput.value = ''; // Limpa o input de URL.
    showMessage('success', 'LOGO REMOVIDA.')
    // Atualiza também os cabeçalhos de login/registro se estiverem ativos
    updateAuthScreenHeader('login-header-logo', 'login-header-title');
    updateAuthScreenHeader('register-header-logo', 'register-header-title');
    // Após remover, imediatamente reaplica a logo padrão do asset
    loadLogo(); // Isso fará com que a logo padrão volte a ser exibida.
}

/**
 * @function resetLogoDisplay
 * @description Restaura a exibição padrão, mostrando o título do aplicativo em vez do logo.
 * @returns {void}
 * @usedBy `loadLogo`, `removeLogo`
 */
function resetLogoDisplay() {
    appLogo.src = ''
    appLogo.style.display = 'none' // Esconde a imagem do logo.
    appTitle.style.display = 'block' // Exibe o texto do título.
    removeLogoBtn.style.display = 'none' // Esconde o botão de remover logo.
}

/**
 * @function initializeApp
 * @description Função principal que inicializa toda a aplicação.
 * Carrega configurações, define tema, carrega evento ativo e configura a UI inicial.
 * @returns {Promise<void>}
 * @usedBy Event listener `DOMContentLoaded`
 */
async function initializeApp() {
    await checkAuthState();
    loadSettings();
    setTheme(state.currentTheme);
    loadLogo(); // Load logo after settings and theme are loaded
    
    // Load active event from Supabase first
    showLoading();
    try {
        state.activeEvent = await loadActiveEvent();
        if (state.activeEvent) {
            // Cache and populate the create-event form to reflect the published event and prevent duplicates
            localStorage.setItem('ticketflow-active-event', JSON.stringify(state.activeEvent));
            try {
                const ev = state.activeEvent;
                const nameEl = document.getElementById('event-name');
                const locationEl = document.getElementById('event-location');
                const dateEl = document.getElementById('event-date');
                const timeEl = document.getElementById('event-time');
                const priceEl = document.getElementById('ticket-price');
                const hiddenFlyerEl = document.getElementById('event-flyer-url');
                const flyerPreviewImg = document.getElementById('flyer-preview-img');
                const flyerPreview = document.getElementById('flyer-preview');
                if (nameEl) nameEl.value = ev.name || '';
                if (locationEl) locationEl.value = ev.location || '';
                if (dateEl) dateEl.value = ev.event_date || '';
                if (timeEl) timeEl.value = ev.event_time || '';
                if (priceEl) priceEl.value = (ev.ticket_price !== undefined && ev.ticket_price !== null) ? String(ev.ticket_price).replace('.', ',') : '';
                if (hiddenFlyerEl) hiddenFlyerEl.value = ev.flyer_image_url || '';
                state.pendingFlyerUrl = ev.flyer_image_url || '';
                if (flyerPreviewImg && state.pendingFlyerUrl) {
                    flyerPreviewImg.src = state.pendingFlyerUrl;
                    if (flyerPreview) flyerPreview.style.display = 'block';
                }
                const publishBtn = document.getElementById('create-publish-event-btn');
                if (publishBtn) {
                    publishBtn.disabled = true;
                    publishBtn.title = 'Um evento já está publicado. Finalize ou recupere antes de publicar outro.';
                }
            } catch (err) {
                console.warn('Erro ao popular formulário com evento publicado durante inicialização:', err);
            }
        } else {
            // Clear any stale localStorage data
            localStorage.removeItem('ticketflow-active-event');
        }
    } catch (error) {
        console.error('Error loading active event during initialization:', error);
        showDetailedError('ERRO AO CARREGAR EVENTO ATIVO', error, 'Inicialização');
        // Clear potentially corrupted localStorage data
        localStorage.removeItem('ticketflow-active-event');
        state.activeEvent = null;
    } finally {
        hideLoading();
    }
    
    updateUI();
    navigateToScreen(state.activeEvent ? 'register-sale' : 'create-event');
    setupEventListeners();
}

// Inicializa a aplicação quando o DOM estiver completamente carregado.
document.addEventListener('DOMContentLoaded', async () => {
    // Adicionar estilos CSS para telas de login/registro
    const style = document.createElement('style');
    style.textContent = `
        .login-screen, .register-screen {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
            padding: 0; /* Remove padding from here, content-wrapper will manage it */
        }
        .auth-header {
            background: var(--primary-color);
            color: white;
            padding: var(--spacing-md);
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 64px;
            box-shadow: none;
            width: 100%;
        }
        .auth-header .logo-container {
            display: flex;
            align-items: center;
            gap: var(--spacing-md);
        }
        .auth-header img {
            height: 40px;
            max-width: 150px;
            object-fit: contain;
            display: none; /* Hidden by default, shown by JS */
            border-radius: var(--radius-small);
        }
        .auth-header h1 {
            font-size: var(--font-size-h2);
            font-weight: var(--font-weight-medium);
            letter-spacing: 1px;
            margin: 0; /* Remove default h1 margin */
        }
        .auth-content-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-grow: 1; /* Takes remaining vertical space */
            padding: 20px; /* Padding for the content box */
            width: 100%; /* Ensure it spans full width */
        }
        .auth-content-wrapper .container { /* Targets the actual content box */
            background: white;
            padding: 40px;
            border-radius: var(--radius-large);
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 100%;
        }
        .login-screen h2, .register-screen h2 {
            color: var(--primary-color);
            margin-bottom: 30px;
            text-align: center;
        }
        .login-footer {
            text-align: center;
            margin-top: 20px;
        }
        .link-btn {
            background: none;
            border: none;
            color: var(--primary-color);
            cursor: pointer;
            text-decoration: underline;
            font-size: 14px;
        }
        .logout-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 8px 16px;
            border-radius: var(--radius-small);
            cursor: pointer;
            font-size: 12px;
        }
        @media (max-width: 768px) {
            .auth-header {
                min-height: 56px;
                padding: var(--spacing-sm);
            }
            .auth-header img {
                height: 32px;
            }
            .auth-header h1 {
                font-size: var(--font-size-h3);
            }
            .auth-content-wrapper {
                padding: 15px; /* Adjust padding for smaller screens */
            }
            .auth-content-wrapper .container {
                padding: 25px; /* Adjust padding inside the content box */
            }
        }
    `;
    document.head.appendChild(style);

    await checkAuthState();
    if (state.isAuthenticated) {
        // Exibe tela de loading e carrega dados
        showInitialLoadingScreen();
        await loadInitialData();
        
        // Esconde tela de loading e mostra app principal
        await hideInitialLoadingScreen();
        showMainApp();
        updateUI();
        navigateToScreen(state.activeEvent ? 'register-sale' : 'create-event');
        setupEventListeners();
    }
    
    loadSettings();
    setTheme(state.currentTheme);
    loadLogo(); // Load logo after settings and theme are loaded

    // Configurar listeners de login/registro
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterBtn = document.getElementById('show-register-btn');
    const showLoginBtn = document.getElementById('show-login-btn');

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (showRegisterBtn) showRegisterBtn.addEventListener('click', showRegisterScreen);
    if (showLoginBtn) showLoginBtn.addEventListener('click', showLoginScreen);

    // Configurar logout
    const header = document.querySelector('.header');
    if (header) {
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'logout-btn';
        logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> SAIR';
        logoutBtn.onclick = handleLogout;
        header.appendChild(logoutBtn);
    }
});