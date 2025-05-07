/**
 * Google Apps Script para integração com o Sistema de Controle de Ingressos
 * 
 * Este script deve ser copiado para o Google Apps Script e publicado como uma aplicação web
 * para permitir a integração com a planilha Google.
 * 
 * Instruções de uso:
 * 1. Acesse https://script.google.com
 * 2. Crie um novo projeto
 * 3. Cole este código no editor
 * 4. Publique como aplicação web (Deploy > New deployment > Web app)
 *    - Escolha "Execute as: Me"
 *    - Escolha "Who has access: Anyone"
 * 5. Copie a URL da aplicação web
 * 6. Cole a URL no arquivo "app.js" do sistema, na variável GOOGLE_SHEETS_URL
 */

// ID da sua planilha Google
const SPREADSHEET_ID = 'cole_aqui_o_id_da_sua_planilha';

// Nome da aba onde os dados serão armazenados
const SHEET_NAME = 'Vendas';

// Função executada quando a API recebe uma requisição POST
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    
    // Processar a ação adequada
    switch (action) {
      case 'saveTicketSale':
        return handleSaveTicketSale(params.data);
      case 'deleteSale':
        return handleDeleteSale(params.saleId);
      case 'updateParticipantStatus':
        return handleUpdateParticipantStatus(params.participantId, params.status);
      default:
        return respondWithError('Ação não reconhecida');
    }
  } catch (error) {
    return respondWithError('Erro ao processar requisição: ' + error.message);
  }
}

// Função executada quando a API recebe uma requisição GET
function doGet(e) {
  try {
    const action = e.parameter.action;
    
    // Processar a ação adequada
    switch (action) {
      case 'fetchSales':
        return handleFetchSales();
      default:
        return respondWithError('Ação não reconhecida');
    }
  } catch (error) {
    return respondWithError('Erro ao processar requisição: ' + error.message);
  }
}

// Salvar uma venda de ingressos na planilha
function handleSaveTicketSale(saleData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Criar aba se não existir
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      
      // Adicionar cabeçalhos
      sheet.appendRow([
        'ID da Venda', 
        'Data da Venda', 
        'Dados dos Participantes', 
        'Quantidade de Ingressos', 
        'Método de Pagamento', 
        'Valor Total'
      ]);
      
      // Formatar cabeçalhos
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#4285F4').setFontColor('white');
    }
    
    // Preparar dados para JSON
    const participantsJSON = JSON.stringify(saleData.participants);
    
    // Adicionar dados à planilha
    sheet.appendRow([
      saleData.id,
      saleData.date,
      participantsJSON,
      saleData.quantity,
      saleData.paymentMethod,
      saleData.totalAmount
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Venda registrada com sucesso'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return respondWithError('Erro ao salvar venda: ' + error.message);
  }
}

// Buscar todas as vendas da planilha
function handleFetchSales() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Verificar se a aba existe
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        data: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Obter todos os dados
    const data = sheet.getDataRange().getValues();
    
    // Verificar se há apenas cabeçalhos
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        data: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Extrair cabeçalhos e dados
    const headers = data[0];
    const rows = data.slice(1);
    
    // Converter para um array de objetos
    const sales = rows.map(row => {
      try {
        return {
          id: row[0],
          date: row[1],
          participants: JSON.parse(row[2]),
          quantity: parseInt(row[3]),
          paymentMethod: row[4],
          totalAmount: parseFloat(row[5])
        };
      } catch (e) {
        // Caso haja erro no parse de alguma linha, retornar objeto vazio
        return null;
      }
    }).filter(sale => sale !== null); // Remover linhas inválidas
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      data: sales
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return respondWithError('Erro ao buscar vendas: ' + error.message);
  }
}

// Deletar uma venda da planilha
function handleDeleteSale(saleId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Verificar se a aba existe
    if (!sheet) {
      return respondWithError('Planilha não encontrada');
    }
    
    // Obter todos os dados
    const data = sheet.getDataRange().getValues();
    
    // Verificar se há apenas cabeçalhos
    if (data.length <= 1) {
      return respondWithError('Venda não encontrada');
    }
    
    // Encontrar o índice da venda
    let rowToDelete = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === saleId) {
        rowToDelete = i + 1; // +1 porque os índices na planilha começam em 1
        break;
      }
    }
    
    // Verificar se a venda foi encontrada
    if (rowToDelete === -1) {
      return respondWithError('Venda não encontrada');
    }
    
    // Deletar a linha
    sheet.deleteRow(rowToDelete);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Venda excluída com sucesso'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return respondWithError('Erro ao excluir venda: ' + error.message);
  }
}

// Atualizar o status de check-in de um participante
function handleUpdateParticipantStatus(participantId, status) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Verificar se a aba existe
    if (!sheet) {
      return respondWithError('Planilha não encontrada');
    }
    
    // Obter todos os dados
    const data = sheet.getDataRange().getValues();
    
    // Verificar se há apenas cabeçalhos
    if (data.length <= 1) {
      return respondWithError('Participante não encontrado');
    }
    
    // Encontrar a venda e atualizar o participante
    let rowToUpdate = -1;
    let updatedParticipants = null;
    
    for (let i = 1; i < data.length; i++) {
      try {
        const participants = JSON.parse(data[i][2]);
        
        // Procurar o participante
        let participantFound = false;
        for (let j = 0; j < participants.length; j++) {
          if (participants[j].id === participantId) {
            participants[j].checkInStatus = status;
            participantFound = true;
            break;
          }
        }
        
        if (participantFound) {
          rowToUpdate = i + 1; // +1 porque os índices na planilha começam em 1
          updatedParticipants = participants;
          break;
        }
      } catch (e) {
        // Ignorar linhas com JSON inválido
        continue;
      }
    }
    
    // Verificar se o participante foi encontrado
    if (rowToUpdate === -1) {
      return respondWithError('Participante não encontrado');
    }
    
    // Atualizar a célula com os dados atualizados
    sheet.getRange(rowToUpdate, 3).setValue(JSON.stringify(updatedParticipants));
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Status do participante atualizado com sucesso'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return respondWithError('Erro ao atualizar status: ' + error.message);
  }
}

// Função auxiliar para responder com erro
function respondWithError(errorMessage) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: errorMessage
  })).setMimeType(ContentService.MimeType.JSON);
}

// Função auxiliar para testar a API
function testApi() {
  // Criar uma venda de teste
  const saleData = {
    id: 'test-' + new Date().getTime(),
    date: new Date().toISOString(),
    participants: [
      {id: 'part1', name: 'Participante Teste 1', checkInStatus: 'Pendente'},
      {id: 'part2', name: 'Participante Teste 2', checkInStatus: 'Pendente'}
    ],
    quantity: 2,
    paymentMethod: 'PIX',
    totalAmount: 100.00
  };
  
  // Salvar a venda
  const saveResult = JSON.parse(handleSaveTicketSale(saleData).getContent());
  Logger.log('Resultado do salvamento: ' + JSON.stringify(saveResult));
  
  // Buscar vendas
  const fetchResult = JSON.parse(handleFetchSales().getContent());
  Logger.log('Resultado da busca: ' + JSON.stringify(fetchResult));
  
  // Atualizar status de um participante
  const updateResult = JSON.parse(handleUpdateParticipantStatus('part1', 'Concluído').getContent());
  Logger.log('Resultado da atualização: ' + JSON.stringify(updateResult));
  
  // Deletar a venda
  const deleteResult = JSON.parse(handleDeleteSale(saleData.id).getContent());
  Logger.log('Resultado da exclusão: ' + JSON.stringify(deleteResult));
}

