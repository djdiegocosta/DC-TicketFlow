# Contrato de Integração de Vendas e Ingressos (TicketFlow ↔ TicketBuy)

Versão: 1.0  
Data: 2026-02-07  
Objetivo: Documento técnico oficial que define o contrato de dados e regras entre TicketFlow e TicketBuy para criação, sincronização e validação de vendas e ingressos. Este documento é a fonte de verdade para integrações; NÃO altera comportamentos do sistema.

---

## 1) Tabela `sales` (fonte da verdade)
Descrição: Representa uma transação comercial que agrupa 1..N ingressos.

Campos obrigatórios e descrição:
- id (uuid): identificador único da venda (PK, usar sempre).
- sale_code (text, NOT NULL): código visual da venda no formato definitivo `SALE-XXXXX` — obrigatório para exibição/consulta humana.
- event_id (uuid): referência ao evento relacionado.
- total_amount (numeric): valor total da venda (decimal).
- number_of_tickets (int4): quantidade de ingressos incluídos na venda.
- buyer_name (text): nome do comprador/contratante.
- buyer_whatsapp (text): número de whatsapp do comprador (quando disponível).
- buyer_email (text): e-mail do comprador (quando disponível).
- payment_provider (text): provedor de pagamento, ex: `"pagbank"`, `"manual"`.
- payment_status (text): status do pagamento — valores permitidos: `pending` | `paid` | `cancelled`.
- origin (text): origem do registro — valores previstos: `ticketflow` | `ticketbuy` | `ticketbuy_confirmed`.

Observações:
- A tabela `sales` é a fonte da verdade para o estado da transação; integrações devem consultar/atualizar esta tabela para sincronização.
- `sale_code` é obrigatório e deve ser único, mas nunca deve ser usado como chave relacional interna (usar `id`).

---

## 2) Tabela `tickets`
Descrição: Representa um ingresso individual vinculado a uma venda e a um evento.

Campos obrigatórios e descrição:
- id (uuid): identificador único do ticket (PK).
- ticket_code (text, NOT NULL): código do ingresso, padrão `TCK-<uuid>` ou outro esquema garantido como único — obrigatório.
- sale_id (uuid): vínculo com a venda (FK -> sales.id). Obrigatório.
- event_id (uuid): referência ao evento.
- buyer_name (text, NOT NULL): nome do comprador principal (exibido no recibo).
- participant_name (text): nome do portador/participante (pode ser igual a buyer_name ou diferente).
- ticket_type (text, NOT NULL): tipo do ingresso — padrão `"regular"` (outros valores possíveis conforme implementação).
- status (text): estado do ingresso — valores permitidos: `pending` | `paid` | `cancelled` | `used`.
- checked_in_at (timestamptz): timestamp de check-in (nulo se não usado).

Observações:
- Cada ticket sempre deve referenciar uma sale via `sale_id`.
- `ticket_code` é obrigatório e único por ingresso.

---

## 3) Fluxo correto (sincronização entre sistemas)
1. Criação inicial (origem TicketBuy ou TicketFlow):
   - Criar a venda em `sales` (inserir registro com `sale_code`, `total_amount`, `number_of_tickets`, etc.).
   - Em seguida, criar N registros na tabela `tickets` associados à `sale.id` recém-criada (cada ticket com `ticket_code`).
   - Todas as inserções devem usar o campo `origin` em `sales` para indicar procedência (`ticketbuy` quando originária do TicketBuy).

2. Pagamento:
   - Quando o pagamento for confirmado, atualizar `sales.payment_status = 'paid'` e, opcionalmente, atualizar `tickets.status = 'paid'` ou `tickets.status = 'active'` conforme política local.
   - Se TicketBuy confirmar um pagamento externo, TicketFlow deve aceitar atualizações com `origin = ticketbuy_confirmed` para rastrear origem.

3. Normalização:
   - Se a venda vier do TicketBuy, ao inserir em TicketFlow validar e, se necessário, normalizar `sale_code` para o padrão `SALE-XXXXX`.
   - Sempre persistir o `sale_code` normalizado em `sales.sale_code` antes de criar tickets.

4. Atualizações posteriores:
   - Alterações de comprador (name, whatsapp, email) devem ser aplicadas em `sales` e refletidas nos tickets (se apropriado) apenas via operações explícitas de atualização.
   - Exclusões devem respeitar integridade referencial; excluir uma `sale` remove seus `tickets` (cascata) ou marcar como `cancelled` conforme política.

---

## 4) Regras e restrições (contratuais)
- Nunca criar ticket sem `sale_id` — criação de ingressos SEM venda é proibida.
- Nunca criar ticket sem `ticket_code` — todo ticket precisa de identificador único legível.
- Nunca criar venda sem `sale_code` — `sale_code` é campo obrigatório para qualquer venda inserida.
- Nunca usar `sale_code` como chave de relacionamento entre tabelas no lugar do `id` — relações devem sempre usar `sales.id`.
- `payment_status` e `tickets.status` devem usar os conjuntos de valores documentados; validações devem rejeitar valores fora do contrato.
- Ao receber dados de TicketBuy, validar formatos (uuid, numeric, telefone) e recusar (com erro) payloads que violem as regras acima.
- Origem do registro (`origin`) deve ser preservada para auditoria; integrações devem registrar `ticketbuy` quando a venda for criada por TicketBuy e `ticketbuy_confirmed` quando TicketBuy confirmar pagamento.

---

## 5) Exemplo de payloads (REST/JSON)
- Criar venda (TicketBuy -> TicketFlow):
{
  "sale": {
    "sale_code": "SALE-AB12CD34",
    "event_id": "11111111-2222-3333-4444-555555555555",
    "total_amount": 150.00,
    "number_of_tickets": 2,
    "buyer_name": "João Silva",
    "buyer_whatsapp": "(11) 99999-9999",
    "buyer_email": "joao@example.com",
    "payment_provider": "pagbank",
    "payment_status": "pending",
    "origin": "ticketbuy"
  },
  "tickets": [
    { "ticket_code": "TCK-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "participant_name": "João Silva" },
    { "ticket_code": "TCK-yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy", "participant_name": "Amigo" }
  ]
}

- Confirmar pagamento (TicketBuy -> TicketFlow):
{
  "sale_id": "22222222-3333-4444-5555-666666666666",
  "payment_status": "paid",
  "origin": "ticketbuy_confirmed"
}

Observação: TicketFlow deve validar `sale_id` e atualizar `sales.payment_status` e opcionalmente os `tickets.status`.

---

## 6) Erros e códigos de resposta esperados
- 400 Bad Request: payload inválido (ex: falta sale_code, ticket sem sale_id).
- 409 Conflict: tentativa de inserir sale_code ou ticket_code já existente.
- 422 Unprocessable Entity: formato de campo inválido (uuid mal formado, valor numérico inválido).
- 500 Internal Server Error: erros server-side inesperados — incluir logs e contexto.

---

## 7) Auditoria e rastreabilidade
- Sempre persistir `origin` e `created_at/updated_at` em `sales` e `tickets` para auditoria.
- Registrar operações de integração (webhooks recebidos, respostas, status) em tabela de logs (ex: `error_logs` ou `integration_logs`) para troubleshooting.

---

## 8) Considerações de segurança
- Todas chamadas de integração devem ser autenticadas (use service keys/seguro via TLS).
- Validar e sanitizar todos os campos recebidos antes de persistir.
- Não expor chaves nem permissões de escrita públicas.

---

## 9) Governança da integração
- Mudanças neste contrato devem ser versionadas; incrementar versão do contrato e comunicar ambas equipes.
- Esta documentação é a referência oficial; qualquer exceção deve ser aprovada e documentada.

---

FIM.