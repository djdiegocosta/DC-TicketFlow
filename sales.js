// Sales module for the ticket system
import { showToast, generateUniqueId } from './app.js';
import { saveTicketSale, fetchSales } from './sheets.js';
import { getEventConfiguration } from './sheets.js';

// Initialize the sales form functionality
export function initializeSalesForm() {
    const ticketQuantitySelect = document.getElementById('ticketQuantity');
    const participantsContainer = document.getElementById('participantsContainer');
    const ticketSalesForm = document.getElementById('ticketSalesForm');
    const totalAmountInput = document.getElementById('totalAmount');
    const paymentMethodSelect = document.getElementById('paymentMethod');

    // Replace dropdown with stepper for ticket quantity
    replaceWithQuantityStepper(ticketQuantitySelect, (quantity) => {
        // Update participant fields
        updateParticipantFields(quantity, participantsContainer);
        
        // Calculate and set total amount
        const eventConfig = getEventConfiguration();
        if (eventConfig && eventConfig.ticketPrice) {
            const totalAmount = quantity * eventConfig.ticketPrice;
            totalAmountInput.value = totalAmount.toFixed(2);
        } else {
             // If no price is set, clear the total amount
            totalAmountInput.value = '';
        }
        
        // Focus on first participant name when quantity is 1
        if (quantity === 1) {
            const firstParticipantInput = document.getElementById('participant0');
            if (firstParticipantInput) {
                firstParticipantInput.focus();
            }
        }
    });
    
    // Set default quantity to 1 initially and update fields
    setStepperValue(1);
    updateParticipantFields(1, participantsContainer);
    
    // Ensure ticket quantity is set to 1 when navigating to sales form
    document.addEventListener('showSalesForm', () => {
        setStepperValue(1);
        updateParticipantFields(1, participantsContainer);
        resetFormDefaults(); // Reset other form fields too
    });
    
    // Handle form submission
    ticketSalesForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        // Disable the submit button to prevent double submissions
        const submitButton = ticketSalesForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processando...';
        
        try {
            // Get form data
            const saleData = collectSaleFormData();
            
            // Save to Google Sheets (now localStorage/filestore)
            const result = await saveTicketSale(saleData);
            
            if (result.success) {
                // Reset form
                ticketSalesForm.reset();
                participantsContainer.innerHTML = '';
                resetFormDefaults(); // Reset to default values

                // Show success message
                showToast('Sucesso', 'Venda registrada com sucesso!', 'success');
                
                // Trigger a sales panel refresh
                const event = new CustomEvent('refreshSalesData');
                document.dispatchEvent(event);
            } else {
                throw new Error(result.error || 'Erro ao salvar a venda.');
            }
        } catch (error) {
            console.error('Error saving ticket sale:', error);
            showToast('Erro', 'Não foi possível registrar a venda. Tente novamente.', 'error');
        } finally {
            // Re-enable the submit button
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-save"></i> Salvar Venda';
        }
    });

    // Set PIX as default payment method initially
    paymentMethodSelect.value = 'PIX'; 

    // Initial setup to populate ticket price on page load
    function setupInitialTicketPrice() {
        const eventConfig = getEventConfiguration();
        
        // If event configuration exists and has a ticket price
        if (eventConfig && eventConfig.ticketPrice) {
            // Calculate and set total amount for the default quantity (which is 1)
            const defaultQuantity = getStepperValue(); // Should be 1 initially
            const totalAmount = defaultQuantity * eventConfig.ticketPrice;
            totalAmountInput.value = totalAmount.toFixed(2);
        } else {
            // If no price is set, clear the total amount
             totalAmountInput.value = '';
        }
    }
    
    setupInitialTicketPrice(); // Call on initial load

    // Update participant fields based on ticket quantity
    function updateParticipantFields(quantity, container) {
        container.innerHTML = '';
        
        for (let i = 0; i < quantity; i++) {
            const participantField = document.createElement('div');
            participantField.classList.add('mb-3');
            participantField.innerHTML = `
                <label for="participant${i}" class="form-label">Nome do Participante ${i + 1}</label>
                <input type="text" class="form-control" id="participant${i}" name="participant${i}" required>
            `;
            container.appendChild(participantField);
        }
    }

    // Function to replace dropdown with stepper UI
    function replaceWithQuantityStepper(selectElement, onChangeCallback) {
        // Create stepper container
        const stepperContainer = document.createElement('div');
        stepperContainer.className = 'quantity-stepper';
        stepperContainer.id = 'quantityStepper';
        
        // Create decrement button
        const decrementBtn = document.createElement('button');
        decrementBtn.className = 'stepper-btn';
        decrementBtn.type = 'button';
        decrementBtn.innerHTML = '<i class="fas fa-minus"></i>';
        decrementBtn.id = 'decrementQuantity';
        
        // Create value display
        const valueDisplay = document.createElement('input');
        valueDisplay.className = 'stepper-value';
        valueDisplay.id = 'stepperValue';
        valueDisplay.readOnly = true;
        valueDisplay.value = '1';
        valueDisplay.setAttribute('aria-label', 'Quantidade');
        
        // Create increment button
        const incrementBtn = document.createElement('button');
        incrementBtn.className = 'stepper-btn';
        incrementBtn.type = 'button';
        incrementBtn.innerHTML = '<i class="fas fa-plus"></i>';
        incrementBtn.id = 'incrementQuantity';
        
        // Add elements to container
        stepperContainer.appendChild(decrementBtn);
        stepperContainer.appendChild(valueDisplay);
        stepperContainer.appendChild(incrementBtn);
        
        // Replace select with stepper
        if (selectElement && selectElement.parentNode) {
             selectElement.parentNode.replaceChild(stepperContainer, selectElement);
        } else {
            console.error('Could not find quantity select element or its parent.');
            return; // Exit if the element isn't found
        }

        // Add event listeners
        decrementBtn.addEventListener('click', () => {
            const currentValue = parseInt(valueDisplay.value);
            if (currentValue > 1) {
                valueDisplay.value = (currentValue - 1).toString();
                onChangeCallback(currentValue - 1);
            }
        });
        
        incrementBtn.addEventListener('click', () => {
            const currentValue = parseInt(valueDisplay.value);
            if (currentValue < 10) { // Limit to 10 as per original dropdown
                valueDisplay.value = (currentValue + 1).toString();
                onChangeCallback(currentValue + 1);
            }
        });
    }

    // Function to get current stepper value
    function getStepperValue() {
        const valueDisplay = document.getElementById('stepperValue');
        return valueDisplay ? parseInt(valueDisplay.value) : 1; // Default to 1 if element not found
    }

    // Function to set stepper value
    function setStepperValue(value) {
        const valueDisplay = document.getElementById('stepperValue');
        if (valueDisplay) {
            valueDisplay.value = value.toString();
        }
    }

    // Function to reset the form to its default state (1 ticket, PIX, calculated total)
    function resetFormDefaults() {
        setStepperValue(1); // Reset quantity to 1
        updateParticipantFields(1, participantsContainer); // Update fields for 1 participant
        
        const paymentMethodSelect = document.getElementById('paymentMethod');
        if (paymentMethodSelect) {
            paymentMethodSelect.value = 'PIX'; // Reset payment method to PIX
        }
        
        const totalAmountInput = document.getElementById('totalAmount');
        const eventConfig = getEventConfiguration();
        if (totalAmountInput && eventConfig && eventConfig.ticketPrice) {
            // Calculate and set total amount for 1 ticket
            totalAmountInput.value = (1 * eventConfig.ticketPrice).toFixed(2);
        } else if (totalAmountInput) {
             // If no price is set, clear the total amount
            totalAmountInput.value = '';
        }
        
        // Focus on the first participant name field
        const firstParticipantInput = document.getElementById('participant0');
        if (firstParticipantInput) {
            firstParticipantInput.focus();
        }
    }


    // Collect all data from the sales form
    function collectSaleFormData() {
        const ticketQuantity = getStepperValue();
        const paymentMethod = document.getElementById('paymentMethod').value;
        const totalAmount = parseFloat(document.getElementById('totalAmount').value);
        
        // Collect participant names
        const participants = [];
        for (let i = 0; i < ticketQuantity; i++) {
            const participantName = document.getElementById(`participant${i}`).value;
            
            // Generate a unique ID for each participant
            const participantId = generateUniqueId();
            
            participants.push({
                id: participantId,
                name: participantName,
                checkInStatus: 'Pendente'
            });
        }
        
        // Create the sale object
        return {
            id: generateUniqueId(),
            date: new Date().toISOString(),
            participants: participants,
            quantity: ticketQuantity,
            paymentMethod: paymentMethod,
            totalAmount: totalAmount
        };
    }
}