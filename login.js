// Login module for the ticket system
import { showToast } from './app.js';

// Password for the system
const ADMIN_PASSWORD = 'admin123';

// Function to initialize the login functionality
export function initializeLogin() {
    // Check if user is already authenticated in this session
    if (sessionStorage.getItem('authenticated') === 'true') {
        showApp();
        return;
    }
    
    // Set up login form submission
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', handleLogin);
}

// Handle the login form submission
function handleLogin(event) {
    event.preventDefault();
    
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');
    
    // Check if password is correct
    if (passwordInput.value === ADMIN_PASSWORD) {
        // Store authentication in session storage
        sessionStorage.setItem('authenticated', 'true');
        
        // Hide error message if it was shown
        loginError.classList.add('d-none');
        
        // Show the main application
        showApp();
        
        // Show success toast
        showToast('Login', 'Login realizado com sucesso!', 'success');
    } else {
        // Show error message
        loginError.classList.remove('d-none');
        
        // Clear password field
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// Function to show the main application and hide the login screen
function showApp() {
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');
    
    loginScreen.classList.add('d-none');
    appContainer.classList.remove('d-none');
    
    // Activate the first navigation item by default
    const firstNavLink = document.querySelector('.nav-link[data-section]');
    if (firstNavLink) {
        firstNavLink.click();
    }
}

