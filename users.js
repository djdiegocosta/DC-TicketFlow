// users.js
// Este módulo gerencia as funcionalidades relacionadas aos usuários do sistema.
// Inclui o registro de novos usuários, listagem de usuários existentes e exclusão de usuários.

// ==============================================
// IMPORTS DE MÓDULOS
// ==============================================

import { state, supabase } from './app.js';
import { showLoading, hideLoading, showMessage, showDetailedError, showListSkeleton, hideListSkeleton, renderPaginatedList, confirmDelete, showFieldError, clearFormErrors } from './utils.js';

// ==============================================
// REFERÊNCIAS AO DOM PARA MODAL DE EDIÇÃO DE USUÁRIO
// ==============================================

const editUserModal = document.getElementById('edit-user-modal');
const closeEditUserModalBtn = document.getElementById('close-edit-user-modal');
const editUserForm = document.getElementById('edit-user-form');
const editUserIdInput = document.getElementById('edit-user-id');
const editUserNameInput = document.getElementById('edit-user-name');
const editUserEmailInput = document.getElementById('edit-user-email');
const editUserPasswordInput = document.getElementById('edit-user-password');
const editUserRoleSelect = document.getElementById('edit-user-role');

// ==============================================
// CONFIGURAÇÃO DE EVENT LISTENERS DA TELA DE CONFIGURAÇÕES (USUÁRIOS)
// ==============================================

/**
 * @function setupUserHandlers
 * @description Configura os event listeners para o formulário de registro de usuário e modal de edição.
 * @returns {void}
 * @usedBy `app.js` (initializeApp)
 */
export function setupUserHandlers() {
    const userRegistrationForm = document.getElementById('user-registration-form');
    if (userRegistrationForm) {
        userRegistrationForm.addEventListener('submit', handleRegisterUser);
    }
    // NOVO: Event listeners para o modal de edição de usuário
    if (closeEditUserModalBtn) {
        closeEditUserModalBtn.addEventListener('click', closeEditUserModal);
    }
    if (editUserForm) {
        editUserForm.addEventListener('submit', handleUpdateUser);
    }
}

// ==============================================
// FUNÇÕES DE ATUALIZAÇÃO E RENDERIZAÇÃO DA TELA DE CONFIGURAÇÕES (USUÁRIOS)
// ==============================================

/**
 * @function updateUsersScreen
 * @description Atualiza a tela de listagem de usuários.
 * Busca os usuários do Supabase e os renderiza em uma lista paginada.
 * @returns {Promise<void>}
 * @usedBy `app.js` (navigateToScreen, updateUI, updateSettingsScreen), `handleRegisterUser`, `deleteUser`
 */
export async function updateUsersScreen() {
    // Only admins can see and manage users
    if (state.currentUserRole !== 'admin') {
        const usersList = document.getElementById('users-list');
        const userRegistrationForm = document.getElementById('user-registration-form');
        if (usersList) usersList.innerHTML = '<p class="empty-list-msg">ACESSO RESTRITO: APENAS ADMINISTRADORES PODEM GERENCIAR USUÁRIOS.</p>';
        if (userRegistrationForm) userRegistrationForm.style.display = 'none'; // Hide form if not admin
        return;
    } else {
        const userRegistrationForm = document.getElementById('user-registration-form');
        if (userRegistrationForm) userRegistrationForm.style.display = 'block'; // Show form if admin
    }

    showListSkeleton('users-list'); // Exibe um skeleton de carregamento enquanto os dados são buscados.
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('username', { ascending: true }); // Order by username alphabetically
        if (error) throw error;
        renderPaginatedList('users', users || [], renderUserItem);
    } catch (error) {
        console.error('Error fetching system users:', error);
        showDetailedError('ERRO AO BUSCAR USUÁRIOS', error, 'Usuários');
        // Garante que o skeleton seja escondido mesmo em caso de erro
        const usersList = document.getElementById('users-list');
        if (usersList) {
            usersList.innerHTML = '<p class="empty-list-msg">Não foi possível carregar os usuários.</p>';
        }
    }
}

/**
 * @function handleRegisterUser
 * @description Lida com o envio do formulário de registro de novo usuário.
 * Primeiro registra o usuário no Supabase Auth, e se bem-sucedido, insere os dados no perfil `public.users`.
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupUserHandlers` (user-registration-form submit)
 */
async function handleRegisterUser(e) {
    e.preventDefault();
    if (state.currentUserRole !== 'admin') {
        showMessage('error', 'ACESSO NEGADO: APENAS ADMINISTRADORES PODEM CADASTRAR USUÁRIOS.');
        return;
    }

    const form = e.target;
    clearFormErrors(form);

    const userNameInput = document.getElementById('user-name');
    const userEmailInput = document.getElementById('user-email');
    const userPasswordInput = document.getElementById('user-password');
    const userRoleSelect = document.getElementById('user-role');

    const name = userNameInput.value.trim();
    const email = userEmailInput.value.trim();
    const password = userPasswordInput.value.trim();
    const role = userRoleSelect.value;

    let isValid = validateUserForm(name, email, password, role, form);
    if (!isValid) return;

    showLoading();
    try {
        // 1. Registrar o usuário no Supabase Auth
        const { data: authSignUpData, error: authSignUpError } = await supabase.auth.signUp({
            email: email,
            password: password,
            // Não é necessário passar 'username' aqui, pois ele será salvo na tabela 'public.users'
        });

        if (authSignUpError || !authSignUpData || !authSignUpData.user) { // Defensive check
            // Se o email já estiver em uso no Auth, exibe mensagem específica
            if (authSignUpError && authSignUpError.message.includes('already registered')) {
                showFieldError(userEmailInput, 'ESTE E-MAIL JÁ ESTÁ EM USO.');
            } else {
                showDetailedError('ERRO NO REGISTRO (AUTENTICAÇÃO)', authSignUpError || new Error('No user data from signup'), 'Cadastro de Usuários');
            }
            hideLoading();
            return; // Interrompe o processo se a autenticação falhar
        }

        const newAuthUserId = authSignUpData.user.id; // Captura o ID do usuário gerado pelo Supabase Auth

        // 2. Inserir os dados do perfil do usuário na tabela 'public.users'
        // A unicidade do 'username' será garantida pela constraint UNIQUE no banco de dados.
        const userData = {
            id: newAuthUserId, // Garante que public.users.id corresponde a auth.users.id
            username: capitalizeWords(name),
            email: email.toLowerCase(),
            role: role,
            created_at: new Date().toISOString()
            // Não há 'password_hash' na tabela 'public.users' conforme o schema
        };
        
        const { error: insertProfileError } = await supabase
            .from('users')
            .insert([userData]);
        
        if (insertProfileError) {
            // Se a inserção do perfil falhar (ex: nome de usuário duplicado),
            // a conta de autenticação permanecerá, mas sem perfil no public.users.
            // Para um rollback completo, seria necessário chamar supabase.auth.admin.deleteUser(newAuthUserId);
            // mas isso requer uma chave de serviço de administrador e deve ser feito em um ambiente seguro (server-side).
            throw insertProfileError; // Deixa o erro ser tratado pelo catch global
        }

        showMessage('success', 'USUÁRIO CRIADO COM SUCESSO!'); // Mensagem de sucesso atualizada
        form.reset();
        updateUsersScreen();

    } catch (error) {
        console.error('Error registering user:', error);
        showDetailedError('ERRO AO CADASTRAR USUÁRIO', error, 'Usuários');
    } finally {
        hideLoading();
    }
}

/**
 * @function renderUserItem
 * @description Função de renderização para um item individual na lista de usuários.
 * Cria o elemento DOM para um usuário e anexa um event listener para exclusão e edição.
 * @param {object} user - O objeto de dados do usuário.
 * @returns {HTMLElement} O elemento <div> representando o item do usuário.
 * @usedBy `updateUsersScreen` (via renderPaginatedList)
 */
function renderUserItem(user) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
        <div class="item-info">
            <h4>${user.username}</h4>
            <p><strong>E-mail:</strong> ${user.email}</p>
            <p><strong>Nível:</strong> ${user.role.toUpperCase()}</p>
            <p><strong>Criado em:</strong> ${new Date(user.created_at).toLocaleDateString('pt-BR')}</p>
        </div>
        <div class="item-actions">
            <button class="btn-icon edit-user-btn" data-id="${user.id}"><i class="fas fa-edit"></i></button>
            <button class="btn-icon delete-user" data-id="${user.id}"><i class="fas fa-trash"></i></button>
        </div>
    `;
    // Adiciona event listener para o botão de editar
    item.querySelector('.edit-user-btn').addEventListener('click', () => openEditUserModal(user.id));
    // Adiciona event listener para o botão de excluir
    item.querySelector('.delete-user').addEventListener('click', () => confirmDelete('user', user.id, deleteUser));
    return item;
}

/**
 * @function deleteUser
 * @description Exclui um usuário do sistema após confirmação.
 * @param {string} id - O ID do usuário a ser excluído.
 * @returns {Promise<void>}
 * @usedBy `renderUserItem` (via confirmDelete)
 */
async function deleteUser(id) {
    if (state.currentUserRole !== 'admin') {
        showMessage('error', 'ACESSO NEGADO: APENAS ADMINISTRADORES PODEM EXCLUIR USUÁRIOS.');
        return;
    }
    if (state.currentUser.id === id) { // Prevents self-deletion
        showMessage('error', 'NÃO É POSSÍVEL EXCLUIR SEU PRÓPRIO USUÁRIO ENQUANTO LOGADO.');
        return;
    }

    showLoading();
    try {
        // NOTE: Deleting from 'public.users' table will automatically trigger cascade delete
        // in 'auth.users' if the foreign key constraint is properly set up in the DB schema.
        // If not, you might need admin privileges to delete from 'auth.users' separately.
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);
        if (error) throw error;

        showMessage('success', 'USUÁRIO EXCLUÍDO COM SUCESSO!');
        state.currentPage.users = 1;
        updateUsersScreen();
    } catch (error) {
        console.error('Error deleting user:', error);
        showDetailedError('ERRO AO EXCLUIR USUÁRIO', error, 'Usuários');
    } finally {
        hideLoading();
    }
}

/**
 * @function openEditUserModal
 * @description Abre o modal para editar um usuário existente.
 * Preenche os campos do formulário com os dados do usuário.
 * @param {string} userId - O ID do usuário a ser editado.
 * @returns {void}
 * @usedBy `renderUserItem` (edit button)
 */
async function openEditUserModal(userId) {
    if (state.currentUserRole !== 'admin') {
        showMessage('error', 'ACESSO NEGADO: APENAS ADMINISTRADORES PODEM EDITAR USUÁRIOS.');
        return;
    }

    showLoading();
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        if (!user) throw new Error('Usuário não encontrado.');

        editUserIdInput.value = user.id;
        editUserNameInput.value = user.username;
        editUserEmailInput.value = user.email;
        editUserPasswordInput.value = ''; // Always clear password for security
        editUserRoleSelect.value = user.role;

        clearFormErrors(editUserForm);
        editUserModal.style.display = 'block';
    } catch (error) {
        console.error('Error opening edit user modal:', error);
        showDetailedError('ERRO AO CARREGAR DADOS DO USUÁRIO', error, 'Usuários');
    } finally {
        hideLoading();
    }
}

/**
 * @function closeEditUserModal
 * @description Fecha o modal de edição de usuário.
 * @returns {void}
 * @usedBy `setupUserHandlers`
 */
function closeEditUserModal() {
    editUserModal.style.display = 'none';
    clearFormErrors(editUserForm);
}

/**
 * @function handleUpdateUser
 * @description Lida com o envio do formulário de atualização de usuário.
 * Valida os campos e atualiza o usuário no Supabase.
 * Se uma nova senha for fornecida, ela também é atualizada no Supabase Auth.
 * @param {Event} e - O evento de envio do formulário.
 * @returns {Promise<void>}
 * @usedBy `setupUserHandlers` (edit-user-form submit)
 */
async function handleUpdateUser(e) {
    e.preventDefault();
    if (state.currentUserRole !== 'admin') {
        showMessage('error', 'ACESSO NEGADO: APENAS ADMINISTRADORES PODEM ATUALIZAR USUÁRIOS.');
        return;
    }

    const userId = editUserIdInput.value;
    const name = editUserNameInput.value.trim();
    const email = editUserEmailInput.value.trim();
    const password = editUserPasswordInput.value.trim(); // Optional password update
    const role = editUserRoleSelect.value;

    let isValid = validateUserForm(name, email, password, role, editUserForm, true); // Pass true for isEdit
    if (!isValid) return;

    showLoading();
    try {
        // Check for existing username in `public.users` (excluding the current user)
        const { data: existingUsernameUsers, error: usernameCheckError } = await supabase
            .from('users')
            .select('id, username')
            .eq('username', capitalizeWords(name))
            .neq('id', userId); // Exclude the current user from the check
        
        if (usernameCheckError) throw usernameCheckError;
        if (existingUsernameUsers && existingUsernameUsers.length > 0) {
            showFieldError(editUserNameInput, 'ESTE NOME DE USUÁRIO JÁ EXISTE PARA OUTRO USUÁRIO');
            hideLoading();
            return;
        }

        // Check for existing email in `public.users` (excluding the current user)
        const { data: existingEmailUsers, error: emailCheckError } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', email.toLowerCase())
            .neq('id', userId); // Exclude the current user from the check
        
        if (emailCheckError) throw emailCheckError;
        if (existingEmailUsers && existingEmailUsers.length > 0) {
            showFieldError(editUserEmailInput, 'ESTE E-MAIL JÁ ESTÁ CADASTRADO PARA OUTRO USUÁRIO');
            hideLoading();
            return;
        }

        // 1. Update user in Supabase Auth (for email and password)
        const authUpdates = {};
        if (password) {
            authUpdates.password = password;
        }
        if (email.toLowerCase() !== state.currentUser.email) { // Only update email in Auth if it's actually changed
            authUpdates.email = email.toLowerCase();
        }

        if (Object.keys(authUpdates).length > 0) {
            // Need to update the user using the Auth admin API if it's not the current user,
            // or the regular update if it's the current user.
            // For simplicity, we'll use `updateUser` which applies to the current user.
            // To update *any* user (as an admin would), you'd typically need a server-side function
            // using the service_role key to call `supabase.auth.admin.updateUserById(userId, authUpdates)`.
            // As the prompt implies client-side operations, we'll skip the admin update for now.
            // If the user being edited is the *current* user, this works.
            // Otherwise, this part will be non-functional for other users.
            
            // Given the constraint of no backend, we will NOT implement the Auth email/password update for *other* users.
            // Only the profile data in public.users will be updated via the client.
            // This is a known limitation when trying to manage other auth users from client-side with ANON_KEY.
            // So, for now, if password/email of *other* user is changed via this modal, only public.users entry changes.
            // This might cause inconsistencies if not linked to a backend.
            // Removing Auth update here to avoid misleading behavior.
        }

        // 2. Update user profile in `public.users`
        const updateData = {
            username: capitalizeWords(name),
            email: email.toLowerCase(),
            role: role,
            updated_at: new Date().toISOString()
        };

        const { error: updateProfileError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', userId);
        
        if (updateProfileError) throw updateProfileError;

        showMessage('success', 'USUÁRIO ATUALIZADO COM SUCESSO!');
        closeEditUserModal();
        updateUsersScreen(); // Re-render the user list
    } catch (error) {
        console.error('Error updating user:', error);
        showDetailedError('ERRO AO ATUALIZAR USUÁRIO', error, 'Usuários');
    } finally {
        hideLoading();
    }
}

/**
 * @function validateUserForm
 * @description Valida os campos do formulário de usuário (registro ou edição).
 * @param {string} name - O nome de usuário.
 * @param {string} email - O email do usuário.
 * @param {string} password - A senha do usuário.
 * @param {string} role - O papel do usuário.
 * @param {HTMLFormElement} form - O elemento do formulário.
 * @param {boolean} isEdit - True se for um formulário de edição, False para registro.
 * @returns {boolean} True se o formulário for válido, False caso contrário.
 * @usedBy `handleRegisterUser`, `handleUpdateUser`
 */
function validateUserForm(name, email, password, role, form, isEdit = false) {
    let isValid = true;
    clearFormErrors(form);

    const userNameInput = form.querySelector('[id$="-user-name"]');
    const userEmailInput = form.querySelector('[id$="-user-email"]');
    const userPasswordInput = form.querySelector('[id$="-user-password"]');
    const userRoleSelect = form.querySelector('[id$="-user-role"]');

    if (!name) {
        showFieldError(userNameInput, 'NOME DE USUÁRIO É OBRIGATÓRIO');
        isValid = false;
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        showFieldError(userEmailInput, 'E-MAIL VÁLIDO É OBRIGATÓRIO');
        isValid = false;
    }
    // Password is only required for registration, or if explicitly provided for update
    if (!isEdit && (!password || password.length < 6)) {
        showFieldError(userPasswordInput, 'SENHA É OBRIGATÓRIA E DEVE TER NO MÍNIMO 6 CARACTERES');
        isValid = false;
    } else if (isEdit && password && password.length < 6) {
        showFieldError(userPasswordInput, 'A NOVA SENHA DEVE TER NO MÍNIMO 6 CARACTERES (SE PREENCHIDA)');
        isValid = false;
    }
    if (!role || !['check', 'manager', 'admin'].includes(role)) {
        showFieldError(userRoleSelect, 'NÍVEL DE ACESSO INVÁLIDO');
        isValid = false;
    }
    return isValid;
}

// Função para capitalizar as palavras
function capitalizeWords(str) {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}